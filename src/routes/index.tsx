import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Escritório de Agentes · Trading simulado com preços reais" },
      { name: "description", content: "Agentes com personalidades de trading diferentes operam em simulação com preços reais da Binance antes de qualquer capital real." },
      { property: "og:title", content: "Escritório de Agentes · Trading simulado com preços reais" },
      { property: "og:description", content: "Agentes com personalidades de trading diferentes operam em simulação com preços reais da Binance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const PRINCIPLES = [
  ["Simulação antes de dinheiro real", "Nenhum agente recebe capital real sem 90 dias de validação."],
  ["Personalidade é configuração", "Cada agente é um conjunto explícito de parâmetros, versionado."],
  ["Ranking multi-critério", "Retorno, drawdown, consistência e taxas pesam juntos."],
  ["Nenhuma chave com saque", "Este modo não usa chave nenhuma: só preços públicos."],
  ["Tudo reproduzível", "Cada número do ranking sai do histórico salvo."],
];

function Index() {
  return (
    <div className="min-h-screen">
      <div className="mx-auto flex max-w-6xl flex-col px-6 py-10">
        <div className="flex items-center justify-between">
          <span className="font-display text-lg font-semibold">Escritório de Agentes</span>
          <span className="rounded-sm border border-primary/60 px-2 py-0.5 font-mono text-[11px] uppercase tracking-widest text-primary">
            Modo simulado
          </span>
        </div>

        <section className="grid gap-12 py-20 md:grid-cols-[1.3fr_1fr] md:py-28">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">Laboratório privado · v1</p>
            <h1 className="mt-5 text-5xl font-semibold leading-[1.05] md:text-7xl">
              Quatro agentes.
              <br />
              <span className="text-primary">Dinheiro de mentira,</span>
              <br />
              preços de verdade.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              Cada agente opera BTC e ETH com sua própria personalidade, pagando taxas e deslizamento simulados. Só ganha direito a
              capital real quem sustentar resultado ajustado a risco por um período longo.
            </p>
            <Button asChild size="lg" className="mt-9">
              <Link to="/escritorio">
                Entrar no escritório <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>

          <ol className="self-end border-l border-border">
            {PRINCIPLES.map(([t, d], i) => (
              <li key={t} className="relative py-3 pl-6">
                <span className="absolute -left-[5px] top-[18px] size-2.5 rounded-full bg-primary" />
                <p className="font-mono text-[11px] text-muted-foreground">0{i + 1}</p>
                <p className="font-medium">{t}</p>
                <p className="text-sm text-muted-foreground">{d}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
