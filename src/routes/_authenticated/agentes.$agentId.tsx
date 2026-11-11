import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Shell } from "@/components/office/Shell";
import { PendingMark } from "@/components/office/PendingMark";
import { AgentActions } from "@/components/office/AgentActions";
import { EquityChart, PriceTradesChart } from "@/components/office/Charts";
import { CriteriaList } from "@/components/office/Criteria";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { closedOnly, fetchKlines } from "@/lib/engine/binance";
import { classifyWeeks, computeMetrics } from "@/lib/engine/metrics";
import { normalizeState } from "@/lib/engine/simulator";
import { STRATEGIES, type Params } from "@/lib/engine/strategies";
import type { Archetype } from "@/lib/engine/types";
import { agentQuery, agentTradesQuery, agentsQuery, equityQuery, type Agent } from "@/lib/office/queries";
import { dateTimeBR, money, pair, pct, pctPlain, qty, signClass, usd } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/agentes/$agentId")({
  head: () => ({
    meta: [
      { title: "Ficha do agente · Escritório de Agentes" },
      { name: "description", content: "Parâmetros, histórico de patrimônio, operações sobre o preço e o motivo de cada entrada." },
      { property: "og:title", content: "Ficha do agente · Escritório de Agentes" },
      { property: "og:description", content: "Parâmetros, histórico de patrimônio e registro de operações do agente." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(agentQuery(params.agentId)),
  component: AgentPage,
});

function AgentPage() {
  const { agentId } = Route.useParams();
  const { data: agent } = useSuspenseQuery(agentQuery(agentId));
  if (!agent) {
    return (
      <Shell title="Agente não encontrado">
        <Link to="/escritorio" className="text-primary underline">Voltar ao escritório</Link>
      </Shell>
    );
  }
  return <AgentDetail agent={agent} />;
}

function AgentDetail({ agent }: { agent: Agent }) {
  const strategy = STRATEGIES[agent.archetype as Archetype];
  const params = agent.params as Params;
  const state = normalizeState(agent.state, Number(agent.initial_capital));
  const equity = useQuery(equityQuery(agent.id));
  const trades = useQuery(agentTradesQuery(agent.id));
  const agents = useQuery(agentsQuery);
  const parent = agents.data?.find((a) => a.id === agent.parent_id);
  const [symbol, setSymbol] = useState(agent.symbols[0]);

  const regimes = useQuery({
    queryKey: ["btc-weekly"],
    queryFn: async () => classifyWeeks(closedOnly(await fetchKlines("BTCUSDT", "1w", { limit: 200 }))),
    staleTime: 3_600_000,
  });
  const candles = useQuery({
    queryKey: ["candles", symbol, params.timeframe],
    queryFn: async () => (await fetchKlines(symbol, params.timeframe, { limit: 500 })).map((c) => ({ t: c.openTime, close: c.close })),
    refetchInterval: 60_000,
  });

  const metrics = useMemo(() => {
    const fees = (trades.data ?? []).reduce((s, t) => s + Number(t.fee), 0);
    return computeMetrics({
      initialCapital: Number(agent.initial_capital),
      currentEquity: Number(agent.equity),
      equity: equity.data ?? [],
      feesPaid: trades.data ? fees : state.feesPaid,
      closedTrades: state.closedTrades,
      startedAt: Date.parse(agent.created_at),
      now: Date.now(),
      regimes: regimes.data,
    });
  }, [agent, equity.data, trades.data, regimes.data, state.feesPaid, state.closedTrades]);

  const range = candles.data?.length ? [candles.data[0].t, candles.data[candles.data.length - 1].t] : [0, 0];
  const inRange = (trades.data ?? []).filter((t) => t.symbol === symbol && Date.parse(t.candle_time) >= range[0]);
  const buys = inRange.filter((t) => t.side === "compra").map((t) => ({ t: Date.parse(t.candle_time), price: Number(t.price) }));
  const sells = inRange.filter((t) => t.side === "venda").map((t) => ({ t: Date.parse(t.candle_time), price: Number(t.price) }));

  return (
    <Shell
      title={`${agent.name} v${agent.version}`}
      subtitle={
        <>
          {strategy.logic}
          {parent && (
            <span className="mt-1 block">
              Clonado de{" "}
              <Link to="/agentes/$agentId" params={{ agentId: parent.id }} className="text-primary underline-offset-4 hover:underline">
                {parent.name} v{parent.version}
              </Link>
              .
            </span>
          )}
        </>
      }
      actions={<AgentActions agent={agent} />}
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="grid gap-5">
          <section className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-5">
            <Kpi label="Patrimônio" value={money(Number(agent.equity))} />
            <Kpi label="Retorno" value={pct(metrics.returnPct)} className={signClass(metrics.returnPct)} />
            <Kpi label="Drawdown máx." value={pctPlain(metrics.maxDrawdownPct, 2)} />
            <Kpi label="Operações" value={String(metrics.tradesCount)} />
            <Kpi label="Taxas pagas" value={money(metrics.feesPaid)} />
          </section>

          <Panel title="Histórico de patrimônio">
            <EquityChart data={equity.data ?? []} initial={Number(agent.initial_capital)} />
          </Panel>

          <Panel
            title="Operações sobre o preço"
            right={
              <div className="flex gap-1">
                {agent.symbols.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSymbol(s)}
                    className={cn("rounded-sm px-2 py-1 font-mono text-xs", s === symbol ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}
                  >
                    {pair(s)}
                  </button>
                ))}
              </div>
            }
          >
            <PriceTradesChart candles={candles.data ?? []} buys={buys} sells={sells} />
            <p className="mt-2 text-xs text-muted-foreground">
              Últimas 500 velas de {params.timeframe}. <span className="text-gain">▲ compra</span> · <span className="text-loss">◆ venda</span>
            </p>
          </Panel>

          <Panel title="Registro de operações e motivos">
            {!trades.data?.length ? (
              <p className="py-6 text-sm text-muted-foreground">Nenhuma operação ainda. Cada entrada aparece aqui com o motivo e os indicadores do momento.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quando</TableHead>
                      <TableHead>Lado</TableHead>
                      <TableHead>Par</TableHead>
                      <TableHead className="text-right">Preço</TableHead>
                      <TableHead className="text-right">Qtd.</TableHead>
                      <TableHead className="text-right">Taxa</TableHead>
                      <TableHead className="text-right">Resultado</TableHead>
                      <TableHead>Motivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trades.data.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="num whitespace-nowrap text-xs">{dateTimeBR(t.candle_time)}</TableCell>
                        <TableCell className={cn("text-xs font-semibold uppercase", t.side === "compra" ? "text-gain" : "text-loss")}>{t.side}</TableCell>
                        <TableCell className="text-xs">{pair(t.symbol)}</TableCell>
                        <TableCell className="num text-right text-xs">{money(Number(t.price))}</TableCell>
                        <TableCell className="num text-right text-xs">{qty(Number(t.quantity))}</TableCell>
                        <TableCell className="num text-right text-xs">{money(Number(t.fee))}</TableCell>
                        <TableCell className={cn("num text-right text-xs", signClass(t.realized_pnl === null ? null : Number(t.realized_pnl)))}>
                          {t.realized_pnl === null ? "—" : money(Number(t.realized_pnl))}
                        </TableCell>
                        <TableCell className="min-w-72 text-xs text-muted-foreground" title={JSON.stringify(t.indicators)}>
                          {t.reason}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Panel>
        </div>

        <aside className="grid content-start gap-5">
          <Panel title="Personalidade">
            <dl className="grid gap-1.5 text-sm">
              <Row k="Arquétipo" v={strategy.label} />
              <Row k="Estado" v={agent.status} />
              <Row k="Tempo gráfico" v={params.timeframe} />
              <Row k="Frequência esperada" v={strategy.frequency} />
              <Row k="Perfil de risco" v={<>{strategy.riskLabel}<PendingMark id="risco" /></>} />
              <Row k="Pares" v={agent.symbols.map(pair).join(", ")} />
              <Row k="Capital inicial" v={usd(Number(agent.initial_capital), 0)} />
              <Row k="Caixa" v={usd(Number(agent.cash))} />
            </dl>
            <p className="mt-4 mb-2 flex items-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Parâmetros (imutáveis) <PendingMark id="estrategias" />
            </p>
            <dl className="grid gap-1.5 text-sm">
              {strategy.fields.map((f) => (
                <Row key={f.key} k={f.label} v={f.kind === "pct" ? pctPlain(Number(params[f.key]), 1) : String(params[f.key])} />
              ))}
            </dl>
            {agent.notes && <p className="mt-4 text-xs text-muted-foreground">{agent.notes}</p>}
          </Panel>

          <Panel title="Posições abertas">
            {Object.keys(state.positions).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma. O agente está procurando entrada.</p>
            ) : (
              Object.entries(state.positions).map(([s, p]) => (
                <dl key={s} className="grid gap-1 text-sm">
                  <Row k={pair(s)} v={`${qty(p.qty)} @ ${money(p.entryPrice)}`} />
                  <Row k="Stop" v={money(p.stop)} />
                  {p.target !== null && <Row k="Alvo" v={money(p.target)} />}
                  <Row k="Desde" v={dateTimeBR(p.openedAt)} />
                </dl>
              ))
            )}
          </Panel>

          <Panel title="Critérios de promoção">
            <CriteriaList criteria={metrics.promotion.criteria} />
            <p className="mt-3 text-xs text-muted-foreground">Calculado agora a partir do histórico salvo. Nenhum agente é promovido antes de 90 dias.</p>
          </Panel>
        </aside>
      </div>
    </Shell>
  );
}

function Panel({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
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

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="num text-right">{v}</dd>
    </div>
  );
}
