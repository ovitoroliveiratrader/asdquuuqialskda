import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { closedOnly, fetchKlines, fetchPrices } from "@/lib/engine/binance";
import { classifyWeeks, computeMetrics, rankAgents } from "@/lib/engine/metrics";
import { markToMarket, normalizeState, positionsValue, runAgent } from "@/lib/engine/simulator";
import type { Params } from "@/lib/engine/strategies";
import type { AgentState, Archetype, Candle, Timeframe } from "@/lib/engine/types";

type Admin = SupabaseClient<Database>;
type AgentRow = Database["public"]["Tables"]["agents"]["Row"];

const SNAPSHOT_EVERY_MS = 55 * 60_000;

function activityOf(status: string, state: AgentState) {
  if (status === "pausado") return "pausado" as const;
  return Object.keys(state.positions).length ? ("posicionado" as const) : ("procurando" as const);
}

export async function runCycle(admin: Admin, now = Date.now()) {
  const recent = await admin
    .from("cycle_runs")
    .select("id, started_at")
    .eq("kind", "ciclo")
    .eq("status", "rodando")
    .gte("started_at", new Date(now - 4 * 60_000).toISOString())
    .limit(1);
  if (recent.data?.length) return { skipped: true, reason: "ciclo anterior ainda rodando" };

  const run = await admin.from("cycle_runs").insert({ kind: "ciclo" }).select("id").single();
  if (run.error) throw run.error;
  const runId = run.data.id;

  try {
    const { data: agents, error } = await admin.from("agents").select("*").neq("status", "arquivado");
    if (error) throw error;

    const pairs = new Map<string, { symbol: string; tf: Timeframe }>();
    const allSymbols = new Set<string>();
    for (const a of agents) {
      for (const s of a.symbols) allSymbols.add(s);
      if (a.status !== "ativo") continue;
      const tf = (a.params as Params).timeframe;
      for (const s of a.symbols) pairs.set(`${s}:${tf}`, { symbol: s, tf });
    }

    const [prices, ...candleSets] = await Promise.all([
      allSymbols.size ? fetchPrices([...allSymbols]) : Promise.resolve({} as Record<string, number>),
      ...[...pairs.values()].map((p) => fetchKlines(p.symbol, p.tf, { limit: 1000 })),
    ]);
    const candles = new Map<string, Candle[]>();
    [...pairs.keys()].forEach((k, i) => candles.set(k, closedOnly(candleSets[i], now)));

    let fillsTotal = 0;
    const perAgent: Record<string, number> = {};

    for (const a of agents) {
      let state = normalizeState(a.state, Number(a.initial_capital));
      if (a.status === "ativo") {
        const p = a.params as Params;
        const bySymbol = Object.fromEntries(a.symbols.map((s) => [s, candles.get(`${s}:${p.timeframe}`) ?? []]));
        const out = runAgent({ state, archetype: a.archetype as Archetype, params: p, candlesBySymbol: bySymbol, startFresh: true });
        state = out.state;
        if (out.fills.length) {
          const ins = await admin.from("trades").insert(
            out.fills.map((f) => ({
              agent_id: a.id,
              symbol: f.symbol,
              side: f.side,
              price: f.price,
              reference_price: f.referencePrice,
              quantity: f.quantity,
              notional: f.notional,
              fee: f.fee,
              slippage_cost: f.slippageCost,
              realized_pnl: f.realizedPnl,
              reason: f.reason,
              indicators: f.indicators as Json,
              candle_time: new Date(f.candleTime).toISOString(),
            })),
          );
          if (ins.error) throw ins.error;
        }
        fillsTotal += out.fills.length;
        perAgent[a.name] = out.fills.length;
      }

      const mark = { ...state.lastPrices, ...prices };
      const equity = markToMarket(state, mark);
      const upd = await admin
        .from("agents")
        .update({
          state: state as unknown as Json,
          equity,
          cash: state.cash,
          activity: activityOf(a.status, state),
          last_cycle_at: new Date(now).toISOString(),
        })
        .eq("id", a.id);
      if (upd.error) throw upd.error;

      const last = await admin
        .from("equity_snapshots")
        .select("taken_at")
        .eq("agent_id", a.id)
        .order("taken_at", { ascending: false })
        .limit(1);
      const lastAt = last.data?.[0] ? Date.parse(last.data[0].taken_at) : 0;
      if (now - lastAt >= SNAPSHOT_EVERY_MS) {
        const snap = await admin.from("equity_snapshots").insert({
          agent_id: a.id,
          taken_at: new Date(now).toISOString(),
          equity,
          cash: state.cash,
          positions_value: positionsValue(state, mark),
        });
        if (snap.error) throw snap.error;
      }
    }

    // Daily ranking at 00:00 UTC (21:00 Brasília): first cycle of the UTC day takes it.
    const today = new Date(now).toISOString().slice(0, 10);
    const existing = await admin.from("ranking_snapshots").select("id").eq("snapshot_date", today).limit(1);
    let ranking: unknown = null;
    if (!existing.data?.length) ranking = await runRanking(admin, now);

    await admin
      .from("cycle_runs")
      .update({
        status: "ok",
        finished_at: new Date().toISOString(),
        message: `${agents.length} agentes, ${fillsTotal} execuções`,
        details: { perAgent, ranking } as Json,
      })
      .eq("id", runId);
    return { agents: agents.length, fills: fillsTotal, ranking };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin.from("cycle_runs").update({ status: "erro", finished_at: new Date().toISOString(), message }).eq("id", runId);
    throw e;
  }
}

async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Recomputes every metric from stored history (snapshots + trades) and stores the day's board. */
export async function runRanking(admin: Admin, now = Date.now()) {
  const { data: agents, error } = await admin.from("agents").select("*").neq("status", "arquivado");
  if (error) throw error;
  const weekly = await fetchKlines("BTCUSDT", "1w", { limit: 200 });
  const regimes = classifyWeeks(closedOnly(weekly, now));

  const rows = [];
  for (const a of agents as AgentRow[]) {
    const snaps = await fetchAll((f, t) =>
      admin.from("equity_snapshots").select("taken_at, equity").eq("agent_id", a.id).order("taken_at").range(f, t),
    );
    const trades = await fetchAll((f, t) =>
      admin.from("trades").select("side, fee").eq("agent_id", a.id).order("candle_time").range(f, t),
    );
    const m = computeMetrics({
      initialCapital: Number(a.initial_capital),
      currentEquity: Number(a.equity),
      equity: snaps.map((s) => ({ t: Date.parse(s.taken_at), equity: Number(s.equity) })),
      feesPaid: trades.reduce((s, t) => s + Number(t.fee), 0),
      closedTrades: trades.filter((t) => t.side === "venda").length,
      startedAt: Date.parse(a.created_at),
      now,
      regimes,
    });
    rows.push({ id: a.id, name: a.name, initialCapital: Number(a.initial_capital), ...m });
  }

  const ranked = rankAgents(rows);
  const date = new Date(now).toISOString().slice(0, 10);
  if (ranked.length) {
    const up = await admin.from("ranking_snapshots").upsert(
      ranked.map((r) => ({
        snapshot_date: date,
        taken_at: new Date(now).toISOString(),
        agent_id: r.id,
        position: r.position,
        equity: r.equity,
        return_pct: r.returnPct,
        max_drawdown_pct: r.maxDrawdownPct,
        trades_count: r.tradesCount,
        fees_paid: r.feesPaid,
        weekly_consistency_pct: r.weeklyConsistencyPct,
        days_running: r.daysRunning,
        promotion: { ...r.promotion, score: r.score } as unknown as Json,
      })),
      { onConflict: "snapshot_date,agent_id" },
    );
    if (up.error) throw up.error;
  }
  await admin.from("cycle_runs").insert({
    kind: "ranking",
    status: "ok",
    finished_at: new Date().toISOString(),
    message: `Quadro de ${date} com ${ranked.length} agentes`,
  });
  return { date, agents: ranked.length };
}
