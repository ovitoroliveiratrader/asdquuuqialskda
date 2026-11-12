import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AlertTriangle, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CYCLE_MINUTES } from "@/lib/engine/config";
import { cyclesQuery, ownerQuery } from "@/lib/office/queries";
import { relative } from "@/lib/format";

const NAV = [
  { to: "/escritorio", label: "Escritório" },
  { to: "/historico", label: "Histórico" },
  { to: "/ranking", label: "Ranking" },
  { to: "/sala-de-decisao", label: "Sala de decisão" },
  { to: "/validacao", label: "Validação" },
  { to: "/decisoes", label: "Decisões pendentes" },
] as const;

export function Shell({ title, subtitle, children, actions }: { title: string; subtitle?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  const owner = useQuery(ownerQuery);
  const navigate = useNavigate();

  return (
    <TooltipProvider delayDuration={150}>
      <div className="min-h-screen">
        <header className="border-b border-border bg-background/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3">
            <Link to="/escritorio" className="flex items-baseline gap-2">
              <span className="font-display text-xl font-semibold">Escritório de Agentes</span>
              <span className="rounded-sm bg-primary px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-primary-foreground">
                Simulado
              </span>
            </Link>
            <nav className="flex flex-wrap gap-1 text-sm">
              {NAV.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  className="rounded-sm px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  activeProps={{ className: "bg-accent text-foreground" }}
                >
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              <span className="hidden md:inline">{owner.data?.email}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await supabase.auth.signOut();
                  navigate({ to: "/auth", search: { redirect: undefined } });
                }}
              >
                <LogOut className="size-4" /> Sair
              </Button>
            </div>
          </div>
        </header>

        {owner.data && !owner.data.isOwner ? (
          <main className="mx-auto max-w-3xl px-5 py-16">
            <h1 className="text-3xl">Acesso restrito</h1>
            <p className="mt-3 text-muted-foreground">
              Este escritório é privado. Somente a conta dona, a primeira criada, vê os agentes e o ranking.
            </p>
          </main>
        ) : (
          <>
            {owner.data?.isOwner && <CycleHealth />}
            <main className="mx-auto max-w-7xl px-5 py-8">
              <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h1 className="text-4xl font-semibold">{title}</h1>
                  {subtitle && <div className="mt-2 max-w-3xl text-sm text-muted-foreground">{subtitle}</div>}
                </div>
                {actions}
              </div>
              {children}
            </main>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}

function CycleHealth() {
  const { data } = useQuery(cyclesQuery);
  if (!data) return null;
  const lastOk = data.find((r) => r.kind === "ciclo" && r.status === "ok");
  const lastErr = data.find((r) => r.kind === "ciclo" && r.status === "erro");
  const stale = !lastOk || Date.now() - Date.parse(lastOk.started_at) > 3 * CYCLE_MINUTES * 60_000;
  const errNewer = lastErr && (!lastOk || Date.parse(lastErr.started_at) > Date.parse(lastOk.started_at));
  if (!stale && !errNewer) return null;
  return (
    <div className="border-b border-destructive/40 bg-destructive/10">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-5 py-2 text-sm text-foreground">
        <AlertTriangle className="size-4 text-loss" />
        {errNewer ? (
          <span>Último ciclo falhou {relative(lastErr!.started_at)}: {lastErr!.message}</span>
        ) : lastOk ? (
          <span>Alerta: nenhum ciclo concluído {relative(lastOk.started_at).replace("há", "nos últimos")}. Os números podem estar parados.</span>
        ) : (
          <span>Nenhum ciclo rodou ainda. O primeiro ciclo automático acontece em até {CYCLE_MINUTES} minutos.</span>
        )}
      </div>
    </div>
  );
}
