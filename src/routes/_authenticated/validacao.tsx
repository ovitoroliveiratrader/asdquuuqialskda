import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FlaskConical } from "lucide-react";
import { Shell } from "@/components/office/Shell";
import { EquityChart } from "@/components/office/Charts";
import { CriteriaList } from "@/components/office/Criteria";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { closedOnly, fetchKlineRange, fetchKlines } from "@/lib/engine/binance";
import { INITIAL_CAPITAL } from "@/lib/engine/config";
import { classifyWeeks, computeMetrics, maxDrawdown } from "@/lib/engine/metrics";
import { initialState, runAgent } from "@/lib/engine/simulator";
import { STRATEGIES, TIMEFRAME_MS, type Params } from "@/lib/engine/strategies";
import type { Archetype, Candle, EquityPoint, Fill, Timeframe } from "@/lib/engine/types";
import { agentsQuery, type Agent } from "@/lib/office/queries";
import { dateBR, dateTimeBR, money, pair, pct, pctPlain, signClass } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/validacao")({
  head: () => ({
    meta: [
      { title: "Validação histórica · Escritório de Agentes" },
      { name: "description", content: "Rode qualquer agente sobre candles reais da Binance, com período de desenvolvimento e de teste separados." },
      { property: "og:title", content: "Validação histórica · Escritório de Agentes" },
      { property: "og:description", content: "Backtest dos agentes em candles reais da Binance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(agentsQuery),
  component: Validation,
});

const PERIODS: Record<Timeframe, [number, number, number]> = {
  "1m": [3, 7, 14],
  "5m": [7, 30, 60],
  "15m": [30, 90, 180],
  "1h": [90, 180, 365],
  "4h": [180, 365, 730],
  "1d": [365, 730, 1460],
};
const DAY = 86_400_000;
const DEV_SHARE = 0.7;

type Result = {
  agent: Agent;
  days: number;
  candlesLoaded: number;
  fills: Fill[];
  equity: EquityPoint[];
  metrics: ReturnType<typeof computeMetrics>;
  dev: { returnPct: number; mdd: number; from: number; to: number };
  test: { returnPct: number; mdd: number; from: number; to: number };
  splitCheck: number;
  start: number;
};

function segment(points: EquityPoint[], startEquity: number) {
  const end = points[points.length - 1]?.equity ?? startEquity;
  return { returnPct: end / startEquity - 1, mdd: maxDrawdown(startEquity, points) };
}

function Validation() {
  const { data: agents } = useSuspenseQuery(agentsQuery);
  if (!agents[0]) {
    return (
      <Shell title="Validação histórica">
        <p className="text-muted-foreground">Nenhum agente cadastrado.</p>
      </Shell>
    );
  }
  return <ValidationRunner agents={agents} first={agents[0]} />;
}

function ValidationRunner({ agents, first }: { agents: Agent[]; first: Agent }) {
  const [agentId, setAgentId] = useState(() => agents.find((a) => a.archetype === "paciente")?.id ?? first.id);
  const agent = agents.find((a) => a.id === agentId) ?? first;
  const tf = (agent.params as Params).timeframe;
  const [days, setDays] = useState<number>(PERIODS[tf][1]);
  const [progress, setProgress] = useState("");
  const periods = PERIODS[tf];

  const m = useMutation({
    mutationFn: async (): Promise<Result> => {
      const p = agent.params as Params;
      const strategy = STRATEGIES[agent.archetype as Archetype];
      const now = Date.now();
      const start = now - days * DAY;
      const warmStart = start - (strategy.warmup(p) + 5) * TIMEFRAME_MS[p.timeframe];
      const bySymbol: Record<string, Candle[]> = {};
      let loaded = 0;
      for (const s of agent.symbols) {
        bySymbol[s] = closedOnly(
          await fetchKlineRange(s, p.timeframe, warmStart, now, (n) => setProgress(`Baixando ${pair(s)}: ${(loaded + n).toLocaleString("pt-BR")} velas`)),
          now,
        );
        loaded += bySymbol[s].length;
      }
      setProgress("Simulando…");
      await new Promise((r) => setTimeout(r, 0));

      // Warmup candles are processed for indicators but trading only counts from `start`.
      const warm: Record<string, Candle[]> = {};
      const live: Record<string, number> = {};
      for (const [s, cs] of Object.entries(bySymbol)) {
        warm[s] = cs.filter((c) => c.openTime < start);
        live[s] = warm[s]?.[warm[s].length - 1]?.openTime ?? -Infinity;
      }
      const base = initialState(INITIAL_CAPITAL);
      base.lastProcessed = Object.fromEntries(Object.entries(live).filter(([, v]) => Number.isFinite(v)));
      const run = runAgent({ state: base, archetype: agent.archetype as Archetype, params: p, candlesBySymbol: bySymbol, recordEquity: true });

      // Reproducibility check: process the same history in two halves, like consecutive live cycles.
      const mid = start + (now - start) / 2;
      const firstHalf = Object.fromEntries(Object.entries(bySymbol).map(([s, cs]) => [s, cs.filter((c) => c.openTime < mid)]));
      const a = runAgent({ state: base, archetype: agent.archetype as Archetype, params: p, candlesBySymbol: firstHalf });
      const b = runAgent({ state: a.state, archetype: agent.archetype as Archetype, params: p, candlesBySymbol: bySymbol });
      const splitCheck = Math.abs(b.state.cash - run.state.cash);

      const weekly = closedOnly(await fetchKlines("BTCUSDT", "1w", { limit: 1000 }), now);
      const lastEq = run.equity[run.equity.length - 1]?.equity ?? INITIAL_CAPITAL;
      const metrics = computeMetrics({
        initialCapital: INITIAL_CAPITAL,
        currentEquity: lastEq,
        equity: run.equity,
        feesPaid: run.state.feesPaid,
        closedTrades: run.state.closedTrades,
        startedAt: start,
        now,
        regimes: classifyWeeks(weekly),
      });

      const cut = start + (now - start) * DEV_SHARE;
      const devPts = run.equity.filter((e) => e.t < cut);
      const testPts = run.equity.filter((e) => e.t >= cut);
      const devEnd = devPts[devPts.length - 1]?.equity ?? INITIAL_CAPITAL;

      setProgress("");
      return {
        agent,
        days,
        candlesLoaded: loaded,
        fills: run.fills,
        equity: run.equity,
        metrics,
        dev: { ...segment(devPts, INITIAL_CAPITAL), from: start, to: cut },
        test: { ...segment(testPts, devEnd), from: cut, to: now },
        splitCheck,
        start,
      };
    },
    onError: () => setProgress(""),
  });

  const r = m.data;
  const chart = useMemo(() => {
    if (!r) return [];
    const step = Math.max(1, Math.floor(r.equity.length / 800));
    return r.equity.filter((_, i) => i % step === 0 || i === r.equity.length - 1);
  }, [r]);

  return (
    <Shell
      title="Validação histórica"
      subtitle="O mesmo motor dos ciclos ao vivo, rodado sobre candles reais da Binance. Os primeiros 70% do período são de desenvolvimento e os 30% finais de teste: um agente bom no primeiro e ruim no segundo provavelmente foi ajustado ao passado."
    >
      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-md border border-border bg-card p-4">
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">Agente</span>
          <Select
            value={agent.id}
            onValueChange={(v) => {
              setAgentId(v);
              const t = (agents.find((a) => a.id === v)?.params as Params | undefined)?.timeframe ?? "4h";
              setDays(PERIODS[t][1]);
            }}
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name} v{a.version} · {(a.params as Params).timeframe}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">Período</span>
          <div className="flex gap-1">
            {periods.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={cn("rounded-sm px-3 py-2 font-mono text-xs", d === days ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}
              >
                {d} dias
              </button>
            ))}
          </div>
        </div>
        <Button onClick={() => m.mutate()} disabled={m.isPending}>
          <FlaskConical className="size-4" /> {m.isPending ? "Rodando…" : "Rodar validação"}
        </Button>
        {progress && <span className="num text-xs text-muted-foreground">{progress}</span>}
        {m.error && <span className="text-xs text-loss">{m.error instanceof Error ? m.error.message : "Falhou"}</span>}
      </div>

      {!r ? (
        <p className="text-sm text-muted-foreground">
          Próximo passo do briefing: validar o Paciente em dados históricos reais antes de confiar no escritório. Escolha o período e rode.
        </p>
      ) : (
        <div className="grid gap-5">
          <div className="grid gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-6">
            <Kpi label="Patrimônio final" value={money(r.metrics.equity)} />
            <Kpi label="Retorno" value={pct(r.metrics.returnPct)} className={signClass(r.metrics.returnPct)} />
            <Kpi label="Drawdown máx." value={pctPlain(r.metrics.maxDrawdownPct, 2)} />
            <Kpi label="Operações" value={String(r.metrics.tradesCount)} />
            <Kpi label="Taxas pagas" value={money(r.metrics.feesPaid)} />
            <Kpi label="Semanas positivas" value={pctPlain(r.metrics.weeklyConsistencyPct, 0)} />
          </div>

          <div className="grid items-start gap-5 lg:grid-cols-[1fr_340px]">
            <section className="rounded-md border border-border bg-card p-5">
              <h2 className="mb-3 text-lg font-semibold">Patrimônio simulado · {r.agent.name} v{r.agent.version}</h2>
              <EquityChart data={chart} initial={INITIAL_CAPITAL} />
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Segment title="Desenvolvimento (70%)" s={r.dev} />
                <Segment title="Teste (30%)" s={r.test} />
              </div>
            </section>
            <aside className="grid content-start gap-5">
              <section className="rounded-md border border-border bg-card p-5">
                <h2 className="mb-3 text-lg font-semibold">Critérios de promoção</h2>
                <CriteriaList criteria={r.metrics.promotion.criteria} />
              </section>
              <section className="rounded-md border border-border bg-card p-5 text-sm">
                <h2 className="mb-2 text-lg font-semibold">Conferência</h2>
                <p className="text-muted-foreground">
                  {r.candlesLoaded.toLocaleString("pt-BR")} velas reais baixadas. Processar o histórico de uma vez ou em duas partes (como ciclos
                  consecutivos) deu diferença de <span className={cn("num", r.splitCheck < 0.01 ? "text-gain" : "text-loss")}>{money(r.splitCheck)} USDT</span>.
                </p>
              </section>
            </aside>
          </div>

          <section className="rounded-md border border-border bg-card p-5">
            <h2 className="mb-3 text-lg font-semibold">Execuções ({r.fills.length})</h2>
            {r.fills.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma entrada no período: as condições do agente não se cumpriram.</p>
            ) : (
              <div className="max-h-[480px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quando</TableHead>
                      <TableHead>Lado</TableHead>
                      <TableHead>Par</TableHead>
                      <TableHead className="text-right">Preço</TableHead>
                      <TableHead className="text-right">Resultado</TableHead>
                      <TableHead>Motivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...r.fills].reverse().slice(0, 300).map((f, i) => (
                      <TableRow key={i}>
                        <TableCell className="num whitespace-nowrap text-xs">{dateTimeBR(f.candleTime)}</TableCell>
                        <TableCell className={cn("text-xs font-semibold uppercase", f.side === "compra" ? "text-gain" : "text-loss")}>{f.side}</TableCell>
                        <TableCell className="text-xs">{pair(f.symbol)}</TableCell>
                        <TableCell className="num text-right text-xs">{money(f.price)}</TableCell>
                        <TableCell className={cn("num text-right text-xs", signClass(f.realizedPnl))}>{f.realizedPnl === null ? "—" : money(f.realizedPnl)}</TableCell>
                        <TableCell className="min-w-72 text-xs text-muted-foreground">{f.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </div>
      )}
    </Shell>
  );
}

function Segment({ title, s }: { title: string; s: { returnPct: number; mdd: number; from: number; to: number } }) {
  return (
    <div className="rounded-sm bg-muted p-3">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="num mt-1 text-sm">
        <span className={signClass(s.returnPct)}>{pct(s.returnPct)}</span> · drawdown {pctPlain(s.mdd, 2)}
      </p>
      <p className="num mt-1 text-[11px] text-muted-foreground">
        {dateBR(s.from)} → {dateBR(s.to)}
      </p>
    </div>
  );
}

function Kpi({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("num mt-0.5 text-lg font-medium", className)}>{value}</p>
    </div>
  );
}
