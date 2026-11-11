/**
 * Simulation constants. Every value the briefing left open is listed in
 * PENDING_DECISIONS with its origin, so the owner can confirm or change it.
 */

export const SIMULATED_MODE = true as const;

/** Spot fee per side, standard tier, paying in USDT (no BNB discount). */
export const FEE_RATE = 0.001;
/** Adverse price slippage applied to every simulated fill. */
export const SLIPPAGE_RATE = 0.0005;
/** Binance spot minimum order value; smaller entries are skipped. */
export const MIN_NOTIONAL = 10;
/** Initial virtual capital per agent, in USDT. */
export const INITIAL_CAPITAL = 10_000;
/** Trading pairs. */
export const SYMBOLS = ["BTCUSDT", "ETHUSDT"] as const;

/** Promotion criteria (briefing §6.3). */
export const PROMOTION = {
  minDays: 90,
  maxDrawdown: 0.15,
  minPositiveWeeks: 0.6,
  minRegimes: 2,
} as const;

/** BTC weekly change that classifies a week as alta (above) or queda (below). */
export const REGIME_THRESHOLD = 0.03;

/** Decision cycle cadence and daily ranking time. */
export const CYCLE_MINUTES = 5;
export const RANKING_HOUR_UTC = 0;

export type DecisionOrigin = "briefing" | "construtor";

export type PendingDecision = {
  id: string;
  topic: string;
  value: string;
  origin: DecisionOrigin;
  note: string;
};

/**
 * "briefing" = valor sugerido no briefing (§8), adotado até você confirmar.
 * "construtor" = o briefing não deu número; o valor foi escolhido na construção.
 */
export const PENDING_DECISIONS: PendingDecision[] = [
  {
    id: "agentes",
    topic: "Quantidade de agentes iniciais",
    value: "4 (Paciente, Seguidor, Contrário, Relâmpago)",
    origin: "briefing",
    note: "Sugestão do briefing §8.1: os quatro arquétipos.",
  },
  {
    id: "capital",
    topic: "Capital fictício inicial por agente",
    value: "10.000 USDT, igual para todos",
    origin: "construtor",
    note: "O briefing sugere o mesmo valor para todos, mas não diz qual. 10.000 USDT foi escolhido na construção.",
  },
  {
    id: "pares",
    topic: "Pares de negociação",
    value: "BTC/USDT e ETH/USDT",
    origin: "briefing",
    note: "Sugestão do briefing §8.3.",
  },
  {
    id: "drawdown",
    topic: "Limite de drawdown para promoção",
    value: "15%",
    origin: "briefing",
    note: "Sugestão do briefing §8.4.",
  },
  {
    id: "ia",
    topic: "Agente com IA para notícias",
    value: "Nenhum por enquanto",
    origin: "briefing",
    note: "Briefing §8.5 deixa para o futuro. Hoje todas as decisões são regras fixas, sem custo por chamada.",
  },
  {
    id: "taxa",
    topic: "Taxa simulada",
    value: "0,10% por lado (sem desconto BNB)",
    origin: "briefing",
    note: "Briefing §6.1. O cenário mais caro foi adotado para não superestimar resultados.",
  },
  {
    id: "deslizamento",
    topic: "Deslizamento simulado",
    value: "0,05% contra o agente em cada execução",
    origin: "construtor",
    note: "O briefing pede que o deslizamento seja modelado, mas não dá número.",
  },
  {
    id: "ciclo",
    topic: "Frequência do ciclo de decisão",
    value: "A cada 5 minutos",
    origin: "construtor",
    note: "O briefing diz 'a cada poucos minutos'.",
  },
  {
    id: "risco",
    topic: "Risco por operação de cada arquétipo",
    value: "Conservador 0,5% · Moderado 1% · Agressivo 2% do patrimônio",
    origin: "construtor",
    note: "O briefing dá só os rótulos (conservador, moderado, agressivo).",
  },
  {
    id: "regime",
    topic: "Classificação de período de mercado",
    value: "Semana de alta se BTC subir mais de 3%, queda se cair mais de 3%, senão lateral",
    origin: "construtor",
    note: "Usado no critério 4 de promoção (dois períodos de mercado diferentes).",
  },
  {
    id: "ordem",
    topic: "Ordem do quadro de ranking",
    value: "Média das posições em retorno, drawdown, consistência e taxas sobre o capital",
    origin: "construtor",
    note: "O briefing pede ranking multi-critério sem definir pesos. Todos têm o mesmo peso.",
  },
  {
    id: "estrategias",
    topic: "Regras e parâmetros das estratégias",
    value: "Ver ficha de cada agente",
    origin: "construtor",
    note: "O briefing descreve a lógica central; os números (médias, RSI, stops) foram escolhidos na construção. Somente compra (spot), sem venda a descoberto.",
  },
];
