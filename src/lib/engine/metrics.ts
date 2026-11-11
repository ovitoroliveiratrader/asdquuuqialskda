import { PROMOTION, REGIME_THRESHOLD } from "./config";
import type { Candle, EquityPoint } from "./types";

export type Regime = "alta" | "queda" | "lateral";
const WEEK = 7 * 86_400_000;

/** Monday 00:00 UTC of the week containing t (Binance weekly candles open then). */
export function weekStart(t: number): number {
  const d = new Date(t);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
}

export function classifyWeeks(btcWeekly: Candle[], threshold = REGIME_THRESHOLD): Record<number, Regime> {
  const out: Record<number, Regime> = {};
  for (const c of btcWeekly) {
    const ch = c.close / c.open - 1;
    out[c.openTime] = ch > threshold ? "alta" : ch < -threshold ? "queda" : "lateral";
  }
  return out;
}

export function maxDrawdown(initial: number, equity: EquityPoint[]): number {
  let peak = initial;
  let mdd = 0;
  for (const p of equity) {
    if (p.equity > peak) peak = p.equity;
    const dd = peak > 0 ? (peak - p.equity) / peak : 0;
    if (dd > mdd) mdd = dd;
  }
  return mdd;
}

export type WeekResult = { start: number; returnPct: number; regime: Regime | null };

/** Returns of completed UTC weeks, chained from the previous week's last equity. */
export function weeklyReturns(
  initial: number,
  equity: EquityPoint[],
  now: number,
  regimes: Record<number, Regime> = {},
): WeekResult[] {
  if (equity.length === 0) return [];
  const out: WeekResult[] = [];
  let prevEquity = initial;
  let ws = weekStart(equity[0]!.t);
  let idx = 0;
  while (ws + WEEK <= now) {
    let last: number | null = null;
    while (idx < equity.length && equity[idx]!.t < ws + WEEK) {
      last = equity[idx]!.equity;
      idx++;
    }
    const end = last ?? prevEquity;
    out.push({ start: ws, returnPct: prevEquity > 0 ? end / prevEquity - 1 : 0, regime: regimes[ws] ?? null });
    prevEquity = end;
    ws += WEEK;
  }
  return out;
}

export type Criterion = { id: string; label: string; ok: boolean; detail: string };

export type AgentMetrics = {
  equity: number;
  returnPct: number;
  maxDrawdownPct: number;
  tradesCount: number;
  feesPaid: number;
  weeklyConsistencyPct: number | null;
  daysRunning: number;
  weeks: WeekResult[];
  promotion: { eligible: boolean; criteria: Criterion[] };
};

export function computeMetrics(input: {
  initialCapital: number;
  currentEquity: number;
  equity: EquityPoint[];
  feesPaid: number;
  closedTrades: number;
  startedAt: number;
  now: number;
  regimes?: Record<number, Regime> | undefined;
}): AgentMetrics {
  const { initialCapital: cap, now } = input;
  const series = [...input.equity, { t: now, equity: input.currentEquity }].sort((a, b) => a.t - b.t);
  const returnPct = input.currentEquity / cap - 1;
  const mdd = maxDrawdown(cap, series);
  const weeks = weeklyReturns(cap, series, now, input.regimes);
  const consistency = weeks.length ? weeks.filter((w) => w.returnPct > 0).length / weeks.length : null;
  const days = Math.max(0, (now - input.startedAt) / 86_400_000);

  const byRegime: Record<Regime, number> = { alta: 1, queda: 1, lateral: 1 };
  const seen = new Set<Regime>();
  for (const w of weeks) {
    if (!w.regime) continue;
    seen.add(w.regime);
    byRegime[w.regime] *= 1 + w.returnPct;
  }
  const positiveRegimes = [...seen].filter((r) => byRegime[r] > 1);

  const pct = (v: number) => `${(v * 100).toFixed(1).replace(".", ",")}%`;
  const criteria: Criterion[] = [
    { id: "prazo", label: `Pelo menos ${PROMOTION.minDays} dias de simulação`, ok: days >= PROMOTION.minDays, detail: `${Math.floor(days)} dias` },
    { id: "retorno", label: "Retorno positivo após taxas e deslizamento", ok: returnPct > 0, detail: pct(returnPct) },
    { id: "drawdown", label: `Drawdown máximo abaixo de ${pct(PROMOTION.maxDrawdown)}`, ok: mdd < PROMOTION.maxDrawdown, detail: pct(mdd) },
    {
      id: "semanas",
      label: `Positivo em pelo menos ${pct(PROMOTION.minPositiveWeeks)} das semanas`,
      ok: consistency !== null && consistency >= PROMOTION.minPositiveWeeks,
      detail: consistency === null ? "sem semana completa" : `${pct(consistency)} de ${weeks.length} semanas`,
    },
    {
      id: "regimes",
      label: `Positivo em pelo menos ${PROMOTION.minRegimes} períodos de mercado diferentes`,
      ok: positiveRegimes.length >= PROMOTION.minRegimes,
      detail: positiveRegimes.length ? `positivo em: ${positiveRegimes.join(", ")}` : "nenhum período positivo ainda",
    },
  ];

  return {
    equity: input.currentEquity,
    returnPct,
    maxDrawdownPct: mdd,
    tradesCount: input.closedTrades,
    feesPaid: input.feesPaid,
    weeklyConsistencyPct: consistency,
    daysRunning: days,
    weeks,
    promotion: { eligible: criteria.every((c) => c.ok), criteria },
  };
}

export type RankInput = {
  id: string;
  name: string;
  initialCapital: number;
  returnPct: number;
  maxDrawdownPct: number;
  weeklyConsistencyPct: number | null;
  feesPaid: number;
};

/**
 * Multi-criteria order: average of the agent's position in return (higher),
 * drawdown (lower), weekly consistency (higher) and fees over capital (lower).
 */
export function rankAgents<T extends RankInput>(rows: T[]): (T & { position: number; score: number })[] {
  const rankBy = (cmp: (a: T, b: T) => number) => {
    const sorted = [...rows].sort(cmp);
    const pos = new Map<string, number>();
    sorted.forEach((r, i) => {
      const prev = sorted[i - 1];
      pos.set(r.id, prev && cmp(prev, r) === 0 ? pos.get(prev.id)! : i + 1);
    });
    return pos;
  };
  const ret = rankBy((a, b) => b.returnPct - a.returnPct);
  const dd = rankBy((a, b) => a.maxDrawdownPct - b.maxDrawdownPct);
  const cons = rankBy((a, b) => (b.weeklyConsistencyPct ?? -1) - (a.weeklyConsistencyPct ?? -1));
  const fees = rankBy((a, b) => a.feesPaid / a.initialCapital - b.feesPaid / b.initialCapital);
  const scored = rows.map((r) => ({
    ...r,
    score: (ret.get(r.id)! + dd.get(r.id)! + cons.get(r.id)! + fees.get(r.id)!) / 4,
  }));
  scored.sort((a, b) => a.score - b.score || b.returnPct - a.returnPct || a.name.localeCompare(b.name));
  return scored.map((r, i) => ({ ...r, position: i + 1 }));
}
