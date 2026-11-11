import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Shell } from "@/components/office/Shell";
import { PendingMark } from "@/components/office/PendingMark";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Criterion } from "@/lib/engine/metrics";
import { recomputeRanking } from "@/lib/office/office.functions";
import { agentsQuery, rankingQuery } from "@/lib/office/queries";
import { dateTimeBR, money, pct, pctPlain, signClass } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/ranking")({
  head: () => ({
    meta: [
      { title: "Ranking · Escritório de Agentes" },
      { name: "description", content: "Quadro diário multi-critério: retorno, drawdown, operações, taxas e consistência semanal." },
      { property: "og:title", content: "Ranking · Escritório de Agentes" },
      { property: "og:description", content: "Quadro diário multi-critério dos agentes de trading simulado." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([context.queryClient.ensureQueryData(rankingQuery), context.queryClient.ensureQueryData(agentsQuery)]);
  },
  component: Ranking,
});

function Ranking() {
  const { data } = useSuspenseQuery(rankingQuery);
  const { data: agents } = useSuspenseQuery(agentsQuery);
  const qc = useQueryClient();
  const recompute = useServerFn(recomputeRanking);
  const m = useMutation({
    mutationFn: () => recompute(),
    onSuccess: () => {
      toast.success("Quadro recalculado a partir do histórico.");
      qc.invalidateQueries({ queryKey: ["ranking"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falhou"),
  });
  const byId = new Map(agents.map((a) => [a.id, a]));

  return (
    <Shell
      title="Quadro de ranking"
      subtitle={
        <>
          Atualizado todo dia às 21:00 de Brasília (00:00 UTC). A ordem é multi-critério
          <PendingMark id="ordem" />: retorno sozinho premia risco excessivo.
        </>
      }
      actions={
        <Button variant="outline" onClick={() => m.mutate()} disabled={m.isPending}>
          <RefreshCw className={m.isPending ? "size-4 animate-spin" : "size-4"} /> Recalcular agora
        </Button>
      }
    >
      {!data.date ? (
        <p className="rounded-md border border-border bg-card p-6 text-muted-foreground">
          O primeiro quadro sai no primeiro ciclo depois das 21:00 de Brasília. Você pode recalcular agora para ver o estado atual.
        </p>
      ) : (
        <>
          <p className="mb-3 font-mono text-xs text-muted-foreground">
            Quadro de {data.date.split("-").reverse().join("/")} · calculado em {dateTimeBR(data.rows[0]?.taken_at ?? data.date)}
          </p>
          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Agente</TableHead>
                  <TableHead className="text-right">Retorno</TableHead>
                  <TableHead className="text-right">Drawdown máx.</TableHead>
                  <TableHead className="text-right">Operações</TableHead>
                  <TableHead className="text-right">Taxas pagas</TableHead>
                  <TableHead className="text-right">Semanas positivas</TableHead>
                  <TableHead className="text-right">Dias</TableHead>
                  <TableHead>Promoção</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r) => {
                  const a = byId.get(r.agent_id);
                  const promo = r.promotion as { eligible?: boolean; criteria?: Criterion[] };
                  const okCount = promo.criteria?.filter((c) => c.ok).length ?? 0;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="num text-lg font-semibold text-primary">{r.position}</TableCell>
                      <TableCell>
                        <Link to="/agentes/$agentId" params={{ agentId: r.agent_id }} className="font-medium hover:text-primary">
                          {a?.name ?? "—"} <span className="font-mono text-xs text-muted-foreground">v{a?.version}</span>
                        </Link>
                      </TableCell>
                      <TableCell className={`num text-right ${signClass(Number(r.return_pct))}`}>{pct(Number(r.return_pct))}</TableCell>
                      <TableCell className="num text-right">{pctPlain(Number(r.max_drawdown_pct), 2)}</TableCell>
                      <TableCell className="num text-right">{r.trades_count}</TableCell>
                      <TableCell className="num text-right">{money(Number(r.fees_paid))}</TableCell>
                      <TableCell className="num text-right">{r.weekly_consistency_pct === null ? "—" : pctPlain(Number(r.weekly_consistency_pct), 0)}</TableCell>
                      <TableCell className="num text-right">{Math.floor(Number(r.days_running))}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1" title={promo.criteria?.map((c) => `${c.ok ? "✓" : "✗"} ${c.label}: ${c.detail}`).join("\n")}>
                          {promo.criteria?.map((c) =>
                            c.ok ? <Check key={c.id} className="size-3.5 text-gain" /> : <X key={c.id} className="size-3.5 text-muted-foreground" />,
                          )}
                          <span className="ml-1 text-xs text-muted-foreground">{okCount}/{promo.criteria?.length ?? 5}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p className="mt-4 max-w-3xl text-xs text-muted-foreground">
            Operações = giros completos (compra e venda). Taxas em USDT. Semanas positivas contam só semanas UTC completas. Promoção exige os
            cinco critérios: 90 dias, retorno positivo, drawdown abaixo de 15%<PendingMark id="drawdown" />, 60% de semanas positivas e
            resultado positivo em dois períodos de mercado<PendingMark id="regime" />.
          </p>
        </>
      )}
    </Shell>
  );
}
