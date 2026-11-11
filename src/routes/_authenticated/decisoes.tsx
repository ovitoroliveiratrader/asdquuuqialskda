import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/office/Shell";
import { FEE_RATE, PENDING_DECISIONS, PROMOTION, SLIPPAGE_RATE } from "@/lib/engine/config";
import { pctPlain } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/decisoes")({
  head: () => ({
    meta: [
      { title: "Decisões pendentes · Escritório de Agentes" },
      { name: "description", content: "Valores sugeridos no briefing e premissas da construção que aguardam confirmação do dono." },
      { property: "og:title", content: "Decisões pendentes · Escritório de Agentes" },
      { property: "og:description", content: "Valores sugeridos e premissas que aguardam confirmação." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Decisions,
});

function Decisions() {
  const fromBriefing = PENDING_DECISIONS.filter((d) => d.origin === "briefing");
  const fromBuilder = PENDING_DECISIONS.filter((d) => d.origin === "construtor");
  return (
    <Shell
      title="Decisões pendentes"
      subtitle="Tudo aqui está em uso, mas ainda não foi confirmado por você. Cada valor aparece marcado como pendente nas telas onde é usado."
    >
      <div className="grid gap-8">
        <Group title="Sugeridos pelo briefing (§8 e §6)" items={fromBriefing} tone="briefing" />
        <Group title="Escolhidos na construção (o briefing não deu número)" items={fromBuilder} tone="construtor" />

        <section className="rounded-md border border-border bg-card p-5 text-sm">
          <h2 className="mb-3 text-lg font-semibold">Regras fixas do modo simulado</h2>
          <ul className="grid list-disc gap-1.5 pl-5 text-muted-foreground">
            <li>Nenhuma ordem real é enviada à Binance. O sistema só lê preços públicos, sem chave de API.</li>
            <li>Quando houver chave no futuro: somente leitura e trade, nunca saque, guardada como segredo do projeto.</li>
            <li>
              Custos por execução: taxa de {pctPlain(FEE_RATE, 2)} e deslizamento de {pctPlain(SLIPPAGE_RATE, 2)}. Um giro completo custa cerca de{" "}
              {pctPlain(2 * (FEE_RATE + SLIPPAGE_RATE), 2)}.
            </li>
            <li>
              Promoção: {PROMOTION.minDays} dias, retorno positivo, drawdown abaixo de {pctPlain(PROMOTION.maxDrawdown, 0)},{" "}
              {pctPlain(PROMOTION.minPositiveWeeks, 0)} das semanas positivas e resultado positivo em {PROMOTION.minRegimes} períodos de mercado.
            </li>
            <li>Agentes operam só comprados (spot). O ciclo usa somente velas já fechadas.</li>
          </ul>
        </section>
      </div>
    </Shell>
  );
}

function Group({ title, items, tone }: { title: string; items: typeof PENDING_DECISIONS; tone: "briefing" | "construtor" }) {
  return (
    <section>
      <h2 className="mb-3 text-xl font-semibold">{title}</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((d) => (
          <article id={d.id} key={d.id} className="scroll-mt-24 rounded-md border border-border bg-card p-4 target:border-pending">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-muted-foreground">{d.topic}</p>
              <span
                className={cn(
                  "shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
                  tone === "briefing" ? "bg-pending text-pending-foreground" : "border border-pending/60 text-pending",
                )}
              >
                {tone === "briefing" ? "sugerido · pendente" : "premissa · pendente"}
              </span>
            </div>
            <p className="mt-1 font-medium">{d.value}</p>
            <p className="mt-2 text-xs text-muted-foreground">{d.note}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
