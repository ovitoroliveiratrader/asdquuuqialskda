import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Zap } from "lucide-react";
import { toast } from "sonner";
import { Shell } from "@/components/office/Shell";
import { AgentActions } from "@/components/office/AgentActions";
import { PendingMark } from "@/components/office/PendingMark";
import { Button } from "@/components/ui/button";
import { runCycleNow } from "@/lib/office/office.functions";
import { agentsQuery, cyclesQuery, type Agent } from "@/lib/office/queries";
import { dateTimeBR, money, pct, signClass } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/sala-de-decisao")({
  head: () => ({
    meta: [
      { title: "Sala de decisão · Escritório de Agentes" },
      { name: "description", content: "Pausar, arquivar ou clonar agentes com novos parâmetros, sem sobrescrever versões anteriores." },
      { property: "og:title", content: "Sala de decisão · Escritório de Agentes" },
      { property: "og:description", content: "Pausar, arquivar ou clonar agentes com novos parâmetros." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(agentsQuery),
  component: DecisionRoom,
});

const STATUS: Record<string, string> = {
  ativo: "text-gain",
  pausado: "text-pending",
  arquivado: "text-muted-foreground",
};

function DecisionRoom() {
  const { data: agents } = useSuspenseQuery(agentsQuery);
  const cycles = useQuery(cyclesQuery);
  const qc = useQueryClient();
  const run = useServerFn(runCycleNow);
  const m = useMutation({
    mutationFn: () => run(),
    onSuccess: (r) => {
      toast.success(r.skipped ? "Um ciclo já está rodando." : `Ciclo concluído: ${r.fills} execuções.`);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falhou"),
  });

  const families = new Map<string, Agent[]>();
  for (const a of agents) families.set(a.lineage_id, [...(families.get(a.lineage_id) ?? []), a]);

  return (
    <Shell
      title="Sala de decisão"
      subtitle="Pausar congela o agente sem operar os candles perdidos. Arquivar tira do escritório e do ranking. Clonar cria uma nova versão com os parâmetros que você escolher; a anterior nunca é sobrescrita."
      actions={
        <Button onClick={() => m.mutate()} disabled={m.isPending}>
          <Zap className="size-4" /> {m.isPending ? "Rodando…" : "Rodar ciclo agora"}
        </Button>
      }
    >
      <div className="grid gap-5">
        {[...families.values()].map((versions) => (
          <section key={versions[0]!.lineage_id} className="rounded-md border border-border bg-card">
            <h2 className="border-b border-border px-5 py-3 text-xl font-semibold">Família {versions[0]!.name}</h2>
            <ul className="divide-y divide-border">
              {versions
                .sort((a, b) => b.version - a.version)
                .map((a) => {
                  const ret = Number(a.equity) / Number(a.initial_capital) - 1;
                  return (
                    <li key={a.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
                      <Link to="/agentes/$agentId" params={{ agentId: a.id }} className="min-w-40 font-medium hover:text-primary">
                        {a.name} <span className="font-mono text-xs text-muted-foreground">v{a.version}</span>
                      </Link>
                      <span className={cn("w-20 text-xs font-semibold uppercase", STATUS[a.status])}>{a.status}</span>
                      <span className="num w-28 text-sm">{money(Number(a.equity))}</span>
                      <span className={cn("num w-20 text-sm", signClass(ret))}>{pct(ret)}</span>
                      <span className="text-xs text-muted-foreground">criado {dateTimeBR(a.created_at)}</span>
                      <div className="ml-auto">
                        <AgentActions agent={a} />
                      </div>
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}

        <section className="rounded-md border border-border bg-card p-5">
          <h2 className="mb-1 text-lg font-semibold">Registro do agendador</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Ciclo automático a cada 5 minutos<PendingMark id="ciclo" />. O quadro de ranking é gravado no primeiro ciclo depois das 21:00 de Brasília.
          </p>
          <ul className="grid gap-1 font-mono text-xs">
            {(cycles.data ?? []).map((c) => (
              <li key={c.id} className="flex gap-3">
                <span className="w-24 text-muted-foreground">{dateTimeBR(c.started_at)}</span>
                <span className="w-16">{c.kind}</span>
                <span className={cn("w-14", c.status === "ok" ? "text-gain" : c.status === "erro" ? "text-loss" : "text-pending")}>{c.status}</span>
                <span className="flex-1 truncate text-muted-foreground">{c.message}</span>
              </li>
            ))}
            {cycles.data?.length === 0 && <li className="text-muted-foreground">Nenhum ciclo ainda.</li>}
          </ul>
        </section>
      </div>
    </Shell>
  );
}
