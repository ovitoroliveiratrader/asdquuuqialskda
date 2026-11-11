import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Archive, Copy, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { STRATEGIES, type Params } from "@/lib/engine/strategies";
import type { Archetype } from "@/lib/engine/types";
import { cloneAgent, setAgentStatus } from "@/lib/office/office.functions";
import type { Agent } from "@/lib/office/queries";

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["agents"] });
    qc.invalidateQueries({ queryKey: ["agent"] });
  };
}

export function AgentActions({ agent }: { agent: Agent }) {
  const refresh = useRefresh();
  const setStatus = useServerFn(setAgentStatus);
  const m = useMutation({
    mutationFn: (status: "ativo" | "pausado" | "arquivado") => setStatus({ data: { agentId: agent.id, status } }),
    onSuccess: (_, status) => {
      toast.success(status === "ativo" ? `${agent.name} voltou a operar.` : status === "pausado" ? `${agent.name} em pausa.` : `${agent.name} arquivado.`);
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falhou"),
  });

  if (agent.status === "arquivado") return <CloneDialog agent={agent} />;

  return (
    <div className="flex flex-wrap gap-2">
      {agent.status === "ativo" ? (
        <Button variant="outline" size="sm" disabled={m.isPending} onClick={() => m.mutate("pausado")}>
          <Pause className="size-4" /> Pausar
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled={m.isPending} onClick={() => m.mutate("ativo")}>
          <Play className="size-4" /> Retomar
        </Button>
      )}
      <CloneDialog agent={agent} />
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" disabled={m.isPending}>
            <Archive className="size-4" /> Arquivar
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar {agent.name} v{agent.version}?</AlertDialogTitle>
            <AlertDialogDescription>
              O agente para de operar e sai do escritório e do ranking. O histórico continua guardado. Um agente arquivado não volta; para testar de
              novo, clone-o.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => m.mutate("arquivado")}>Arquivar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function CloneDialog({ agent }: { agent: Agent }) {
  const strategy = STRATEGIES[agent.archetype as Archetype];
  const params = agent.params as Params;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(agent.name);
  const [notes, setNotes] = useState("");
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(strategy.fields.map((f) => [f.key, f.kind === "pct" ? String(Number(params[f.key]) * 100) : String(params[f.key])])),
  );
  const refresh = useRefresh();
  const navigate = useNavigate();
  const clone = useServerFn(cloneAgent);
  const m = useMutation({
    mutationFn: () =>
      clone({
        data: {
          agentId: agent.id,
          name,
          notes: notes || undefined,
          params: Object.fromEntries(
            strategy.fields.map((f) => [f.key, f.kind === "pct" ? Number(values[f.key]) / 100 : Number(values[f.key])]),
          ),
        },
      }),
    onSuccess: (r) => {
      toast.success(`Nova versão v${r.version} criada. A original continua intacta.`);
      setOpen(false);
      refresh();
      navigate({ to: "/agentes/$agentId", params: { agentId: r.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falhou"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Copy className="size-4" /> Clonar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Clonar {agent.name} v{agent.version}</DialogTitle>
          <DialogDescription>
            Cria uma nova versão com capital zerado em 10.000 USDT e histórico próprio. A versão atual nunca é sobrescrita. Tempo gráfico:{" "}
            {params.timeframe}.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="clone-name">Nome</Label>
            <Input id="clone-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {strategy.fields.map((f) => (
              <div key={f.key} className="grid gap-1.5">
                <Label htmlFor={`p-${f.key}`} className="text-xs">
                  {f.label}
                  {f.kind === "pct" && " (%)"}
                </Label>
                <Input
                  id={`p-${f.key}`}
                  type="number"
                  className="num"
                  step={f.kind === "pct" ? f.step * 100 : f.step}
                  min={f.kind === "pct" ? f.min * 100 : f.min}
                  max={f.kind === "pct" ? f.max * 100 : f.max}
                  value={values[f.key]}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  required
                />
              </div>
            ))}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="clone-notes">Por que esta versão? (opcional)</Label>
            <Textarea id="clone-notes" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={m.isPending}>
              Criar nova versão
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
