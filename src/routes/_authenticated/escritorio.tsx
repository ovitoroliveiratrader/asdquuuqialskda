import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Shell } from "@/components/office/Shell";
import { Ticker } from "@/components/office/Ticker";
import { PendingMark } from "@/components/office/PendingMark";
import { normalizeState } from "@/lib/engine/simulator";
import { STRATEGIES, type Params } from "@/lib/engine/strategies";
import type { Archetype } from "@/lib/engine/types";
import { agentsQuery, lastTradesQuery, type Agent, type Trade } from "@/lib/office/queries";
import { dateTimeBR, money, pair, pct, qty, relative, signClass, usd } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/escritorio")({
  head: () => ({
    meta: [
      { title: "Escritório · Mesas dos agentes" },
      { name: "description", content: "Uma mesa por agente: estado atual, patrimônio virtual e últimas operações." },
      { property: "og:title", content: "Escritório · Mesas dos agentes" },
      { property: "og:description", content: "Uma mesa por agente: estado atual, patrimônio virtual e últimas operações." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(agentsQuery),
  component: Office,
});

const ACTIVITY: Record<string, { label: string; dot: string }> = {
  procurando: { label: "Procurando entrada", dot: "bg-primary animate-blink" },
  posicionado: { label: "Posicionado", dot: "bg-gain" },
  pausado: { label: "Em pausa", dot: "bg-muted-foreground" },
};

function Office() {
  const { data: agents } = useSuspenseQuery(agentsQuery);
  const desks = agents.filter((a) => a.status !== "arquivado");
  const trades = useQuery(lastTradesQuery(desks.map((a) => a.id)));

  return (
    <Shell
      title="Escritório"
      subtitle={
        <>
          Tela somente leitura. Cada agente começa com {usd(10000, 0)}
          <PendingMark id="capital" /> e opera BTC/USDT e ETH/USDT
          <PendingMark id="pares" /> com taxa e deslizamento simulados.
        </>
      }
      actions={<Ticker />}
    >
      <div className="grid gap-5 md:grid-cols-2">
        {desks.map((a) => (
          <Desk key={a.id} agent={a} trades={trades.data?.[a.id]} />
        ))}
      </div>
      {desks.length === 0 && <p className="text-muted-foreground">Nenhum agente ativo. Clone um agente arquivado na sala de decisão.</p>}
    </Shell>
  );
}

function Desk({ agent: a, trades }: { agent: Agent; trades?: Trade[] }) {
  const s = STRATEGIES[a.archetype as Archetype];
  const state = normalizeState(a.state, Number(a.initial_capital));
  const ret = Number(a.equity) / Number(a.initial_capital) - 1;
  const act = ACTIVITY[a.activity] ?? ACTIVITY.procurando;
  const positions = Object.entries(state.positions);

  return (
    <Link
      to="/agentes/$agentId"
      params={{ agentId: a.id }}
      className="group block rounded-md border border-border bg-card transition-colors hover:border-primary/60"
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-2xl font-semibold group-hover:text-primary">{a.name}</h2>
          <span className="font-mono text-xs text-muted-foreground">v{a.version}</span>
        </div>
        <span className="flex items-center gap-2 text-xs">
          <span className={cn("size-2 rounded-full", act.dot)} />
          {act.label}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4 px-5 py-4">
        <Stat label="Patrimônio virtual" value={money(Number(a.equity))} sub="USDT" />
        <Stat label="Retorno" value={pct(ret)} className={signClass(ret)} />
        <Stat label="Tempo gráfico" value={(a.params as Params).timeframe} sub={s.riskLabel} />
      </div>

      {positions.length > 0 && (
        <div className="mx-5 mb-3 rounded-sm bg-muted px-3 py-2 text-xs">
          {positions.map(([sym, p]) => (
            <div key={sym} className="num flex justify-between">
              <span>{pair(sym)} · {qty(p.qty)} @ {money(p.entryPrice)}</span>
              <span className="text-muted-foreground">stop {money(p.stop)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-border px-5 py-3">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Últimas três operações</p>
        {!trades ? (
          <p className="text-xs text-muted-foreground">Carregando…</p>
        ) : trades.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhuma operação ainda{a.last_cycle_at ? ` · último ciclo ${relative(a.last_cycle_at)}` : " · aguardando o primeiro ciclo"}.
          </p>
        ) : (
          <ul className="grid gap-1">
            {trades.map((t) => (
              <li key={t.id} className="num flex items-center justify-between gap-3 text-xs">
                <span className={cn("w-14 font-semibold uppercase", t.side === "compra" ? "text-gain" : "text-loss")}>{t.side}</span>
                <span className="flex-1">{pair(t.symbol)} @ {money(Number(t.price))}</span>
                {t.realized_pnl !== null && <span className={signClass(Number(t.realized_pnl))}>{money(Number(t.realized_pnl))}</span>}
                <span className="text-muted-foreground">{dateTimeBR(t.candle_time)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Link>
  );
}

function Stat({ label, value, sub, className }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("num mt-0.5 text-xl font-medium", className)}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
