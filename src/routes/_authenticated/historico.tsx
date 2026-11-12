import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Shell } from "@/components/office/Shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { agentsQuery, allTradesQuery, diaryQuery } from "@/lib/office/queries";
import { dateTimeBR, money, pair, qty, signClass } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/historico")({
  head: () => ({
    meta: [
      { title: "Histórico · Operações e diário dos agentes" },
      {
        name: "description",
        content: "Fita unificada de operações e diário do que cada agente analisou em cada ciclo.",
      },
      { property: "og:title", content: "Histórico · Operações e diário dos agentes" },
      {
        property: "og:description",
        content: "Fita unificada de operações e diário do que cada agente analisou em cada ciclo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(agentsQuery),
  component: History,
});

type DiaryEntry = {
  agentId: string;
  agent: string;
  symbol: string;
  timeframe: string;
  candleTime: number | null;
  close: number | null;
  outcome: "nova_vela" | "sem_vela_nova" | "inicio" | "aquecendo" | "ordem_pendente";
  position: { entry: number; stop: number; target: number | null } | null;
  indicators: Record<string, number>;
  actions: { side: string; price: number; reason: string }[];
};

const IND: Record<string, string> = {
  maF: "Média rápida",
  maS: "Média lenta",
  maL: "Média longa",
  hh: "Máxima recente",
  atr: "ATR",
  up: "Canal de entrada",
  down: "Canal de saída",
  rsi: "RSI",
  lower: "Banda inferior",
  upper: "Banda superior",
  mid: "Banda central",
};

const Select = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...props} className="h-8 rounded-sm border border-border bg-background px-2 text-sm" />
);

function History() {
  const { data: agents } = useSuspenseQuery(agentsQuery);
  const names = useMemo(
    () => Object.fromEntries(agents.map((a) => [a.id, `${a.name} v${a.version}`])),
    [agents],
  );
  return (
    <Shell
      title="Histórico"
      subtitle="Tudo o que os agentes fizeram e o que analisaram em cada ciclo, inclusive quando decidiram não operar."
    >
      <Tabs defaultValue="operacoes">
        <TabsList>
          <TabsTrigger value="operacoes">Operações</TabsTrigger>
          <TabsTrigger value="diario">Diário de decisão</TabsTrigger>
        </TabsList>
        <TabsContent value="operacoes">
          <Trades names={names} agents={agents.map((a) => a.id)} />
        </TabsContent>
        <TabsContent value="diario">
          <Diary agents={agents.map((a) => a.id)} names={names} />
        </TabsContent>
      </Tabs>
    </Shell>
  );
}

function Trades({ names, agents }: { names: Record<string, string>; agents: string[] }) {
  const q = useQuery(allTradesQuery);
  const [agent, setAgent] = useState("todos");
  const [sym, setSym] = useState("todos");
  const [res, setRes] = useState("todos");
  const rows = (q.data ?? []).filter((t) => {
    if (agent !== "todos" && t.agent_id !== agent) return false;
    if (sym !== "todos" && t.symbol !== sym) return false;
    const pnl = t.realized_pnl === null ? null : Number(t.realized_pnl);
    if (res === "lucro" && !(pnl !== null && pnl > 0)) return false;
    if (res === "prejuizo" && !(pnl !== null && pnl <= 0)) return false;
    return true;
  });
  const total = rows.reduce(
    (s, t) => s + (t.realized_pnl === null ? 0 : Number(t.realized_pnl)),
    0,
  );
  return (
    <div className="mt-4 grid gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Select value={agent} onChange={(e) => setAgent(e.target.value)} aria-label="Agente">
          <option value="todos">Todos os agentes</option>
          {agents.map((id) => (
            <option key={id} value={id}>
              {names[id]}
            </option>
          ))}
        </Select>
        <Select value={sym} onChange={(e) => setSym(e.target.value)} aria-label="Par">
          <option value="todos">Todos os pares</option>
          <option value="BTCUSDT">BTC/USDT</option>
          <option value="ETHUSDT">ETH/USDT</option>
        </Select>
        <Select value={res} onChange={(e) => setRes(e.target.value)} aria-label="Resultado">
          <option value="todos">Todas as operações</option>
          <option value="lucro">Saídas com lucro</option>
          <option value="prejuizo">Saídas com prejuízo</option>
        </Select>
        <span className="ml-auto text-muted-foreground">
          {rows.length} operações · resultado realizado{" "}
          <span className={cn("num", signClass(total))}>{money(total)}</span>
        </span>
      </div>
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">Nenhuma operação com esses filtros.</p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Agente</TableHead>
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
              {rows.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="num whitespace-nowrap text-xs">
                    {dateTimeBR(t.candle_time)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    <Link
                      to="/agentes/$agentId"
                      params={{ agentId: t.agent_id }}
                      className="hover:text-primary"
                    >
                      {names[t.agent_id] ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-xs font-semibold uppercase",
                      t.side === "compra" ? "text-gain" : "text-loss",
                    )}
                  >
                    {t.side}
                  </TableCell>
                  <TableCell className="text-xs">{pair(t.symbol)}</TableCell>
                  <TableCell className="num text-right text-xs">{money(Number(t.price))}</TableCell>
                  <TableCell className="num text-right text-xs">
                    {qty(Number(t.quantity))}
                  </TableCell>
                  <TableCell className="num text-right text-xs">{money(Number(t.fee))}</TableCell>
                  <TableCell
                    className={cn(
                      "num text-right text-xs",
                      signClass(t.realized_pnl === null ? null : Number(t.realized_pnl)),
                    )}
                  >
                    {t.realized_pnl === null ? "—" : money(Number(t.realized_pnl))}
                  </TableCell>
                  <TableCell className="min-w-72 text-xs text-muted-foreground">
                    {t.reason}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

const OUTCOME: Record<DiaryEntry["outcome"], string> = {
  nova_vela: "Analisou vela nova",
  sem_vela_nova: "Sem vela nova fechada",
  inicio: "Começou a acompanhar o par",
  aquecendo: "Juntando histórico para os indicadores",
  ordem_pendente: "Ordem armada / Pendente para a próxima vela",
};

function verdict(e: DiaryEntry) {
  if (e.actions.length)
    return e.actions
      .map((a) => `${a.side === "compra" ? "Comprou" : "Vendeu"} a ${money(a.price)}: ${a.reason}`)
      .join(" ");
  if (e.outcome !== "nova_vela") return OUTCOME[e.outcome];
  if (e.position)
    return `Manteve a posição (entrada ${money(e.position.entry)}, stop ${money(e.position.stop)}${e.position.target ? `, alvo ${money(e.position.target)}` : ""}).`;
  return "Sem sinal de entrada: condições da estratégia não foram atendidas. Ficou em caixa.";
}

function Diary({ agents, names }: { agents: string[]; names: Record<string, string> }) {
  const q = useQuery(diaryQuery);
  const [agent, setAgent] = useState("todos");
  const [onlyNew, setOnlyNew] = useState(true);
  const runs = (q.data ?? []).map((r) => ({
    run: r,
    entries: ((r.details as { diary?: DiaryEntry[] } | null)?.diary ?? []).filter(
      (e) =>
        (agent === "todos" || e.agentId === agent) &&
        (!onlyNew ||
          e.outcome === "nova_vela" ||
          e.outcome === "ordem_pendente" ||
          e.actions.length),
    ),
  }));
  const withDiary = runs.filter((r) => r.entries.length);
  return (
    <div className="mt-4 grid gap-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Select value={agent} onChange={(e) => setAgent(e.target.value)} aria-label="Agente">
          <option value="todos">Todos os agentes</option>
          {agents.map((id) => (
            <option key={id} value={id}>
              {names[id]}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-muted-foreground">
          <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} />
          Só ciclos com vela nova ou operação
        </label>
        <span className="ml-auto text-xs text-muted-foreground">
          Últimos 60 ciclos · o diário começa a partir de agora
        </span>
      </div>
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : withDiary.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          Ainda não há entradas no diário. Elas aparecem a partir do próximo ciclo (a cada 5
          minutos).
        </p>
      ) : (
        withDiary.map(({ run, entries }) => (
          <section key={run.id} className="rounded-sm border border-border">
            <header className="flex items-baseline justify-between border-b border-border px-4 py-2">
              <span className="num text-sm font-semibold">{dateTimeBR(run.started_at)}</span>
              <span className="text-xs text-muted-foreground">{run.message}</span>
            </header>
            <ul className="divide-y divide-border">
              {entries.map((e, i) => (
                <li key={i} className="grid gap-1 px-4 py-2.5 text-sm">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="font-semibold">{e.agent}</span>
                    <span className="text-xs text-muted-foreground">
                      {pair(e.symbol)} · {e.timeframe}
                    </span>
                    {e.close !== null && (
                      <span className="num text-xs">fechamento {money(e.close)}</span>
                    )}
                    {e.candleTime !== null && (
                      <span className="num text-xs text-muted-foreground">
                        vela de {dateTimeBR(e.candleTime)}
                      </span>
                    )}
                  </div>
                  <p
                    className={cn(
                      "text-sm",
                      e.actions.length ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {verdict(e)}
                  </p>
                  {Object.keys(e.indicators).length > 0 && (
                    <p className="num text-xs text-muted-foreground">
                      {Object.entries(e.indicators)
                        .map(([k, v]) => `${IND[k] ?? k} ${v.toLocaleString("pt-BR")}`)
                        .join(" · ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
