import {
  atr,
  ema,
  macd,
  priorHighest,
  priorLowest,
  rsi,
  sma,
  stdev,
  stochastic,
} from "./indicators";
import type { Archetype, Candle, Position, Timeframe } from "./types";

export type Params = Record<string, number | string> & { timeframe: Timeframe };

export type ParamField = {
  key: string;
  label: string;
  kind: "int" | "pct" | "number";
  min: number;
  max: number;
  step: number;
};

export type Signal = {
  entry?: {
    stop: number;
    target: number | null;
    reason: string;
    indicators: Record<string, number>;
  };
  exit?: { reason: string; indicators: Record<string, number> };
  trailStop?: number;
};

type Series = Record<string, number[]>;
const at = (s: Series, k: string, i: number): number => s[k]?.[i] ?? NaN;

export type Strategy = {
  archetype: Archetype;
  label: string;
  logic: string;
  timeframeLabel: string;
  frequency: string;
  riskLabel: string;
  fields: ParamField[];
  warmup: (p: Params) => number;
  prepare: (candles: Candle[], p: Params) => Series;
  decide: (s: Series, i: number, c: Candle, pos: Position | null, p: Params) => Signal;
};

const n = (p: Params, k: string) => Number(p[k]);
const r2 = (v: number) => Math.round(v * 100) / 100;
const fmt = (v: number) => r2(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

const common: ParamField[] = [
  { key: "atrPeriodo", label: "Período do ATR", kind: "int", min: 5, max: 50, step: 1 },
  {
    key: "stopAtr",
    label: "Stop em múltiplos de ATR",
    kind: "number",
    min: 0.5,
    max: 10,
    step: 0.1,
  },
  {
    key: "riscoPorOperacao",
    label: "Risco por operação",
    kind: "pct",
    min: 0.001,
    max: 0.05,
    step: 0.001,
  },
  {
    key: "alocacaoMaxima",
    label: "Alocação máxima por par",
    kind: "pct",
    min: 0.05,
    max: 1,
    step: 0.05,
  },
];

const paciente: Strategy = {
  archetype: "paciente",
  label: "Paciente",
  logic:
    "Compra pullbacks em tendência de alta: EMA 21 acima da EMA 55, preço acima da EMA 200, correção próxima da EMA curta e rompimento da máxima recente.",
  timeframeLabel: "4h",
  frequency: "Baixa",
  riskLabel: "Conservador",
  fields: [
    { key: "mediaRapida", label: "Média rápida (velas)", kind: "int", min: 5, max: 200, step: 1 },
    { key: "mediaLenta", label: "Média lenta (velas)", kind: "int", min: 20, max: 400, step: 1 },
    { key: "mediaLonga", label: "Média longa (velas)", kind: "int", min: 50, max: 600, step: 1 },
    {
      key: "rompimentoCandles",
      label: "Rompimento da máxima de N velas",
      kind: "int",
      min: 2,
      max: 60,
      step: 1,
    },
    {
      key: "trailingAtr",
      label: "Stop móvel em ATR",
      kind: "number",
      min: 0.5,
      max: 10,
      step: 0.1,
    },
    ...common,
  ],
  warmup: (p) =>
    Math.max(
      n(p, "mediaLenta"),
      n(p, "mediaLonga"),
      n(p, "atrPeriodo") + 1,
      n(p, "rompimentoCandles"),
    ),
  prepare: (c, p) => {
    const close = c.map((x) => x.close);
    return {
      maF: ema(close, n(p, "mediaRapida")),
      maS: ema(close, n(p, "mediaLenta")),
      maL: ema(close, n(p, "mediaLonga")),
      hh: priorHighest(close, n(p, "rompimentoCandles")),
      atr: atr(
        c.map((x) => x.high),
        c.map((x) => x.low),
        close,
        n(p, "atrPeriodo"),
      ),
    };
  },
  decide: (s, i, c, pos, p) => {
    const ind = {
      mediaRapida: r2(at(s, "maF", i)),
      mediaLenta: r2(at(s, "maS", i)),
      mediaLonga: r2(at(s, "maL", i)),
      maximaRecente: r2(at(s, "hh", i)),
      atr: r2(at(s, "atr", i)),
      fechamento: c.close,
    };
    if (pos) {
      if (c.close < at(s, "maS", i))
        return {
          exit: {
            reason: `Fechamento ${fmt(c.close)} abaixo da média lenta ${fmt(at(s, "maS", i))}: tendência perdeu força.`,
            indicators: ind,
          },
        };
      return { trailStop: c.close - n(p, "trailingAtr") * at(s, "atr", i) };
    }
    if (
      at(s, "maF", i) > at(s, "maS", i) &&
      c.close > at(s, "maL", i) &&
      c.low <= at(s, "maF", i) + 0.5 * at(s, "atr", i) &&
      c.close > at(s, "hh", i)
    ) {
      return {
        entry: {
          stop: c.close - n(p, "stopAtr") * at(s, "atr", i),
          reason: `Tendência confirmada: média ${p["mediaRapida"]} (${fmt(at(s, "maF", i))}) acima da média ${p["mediaLenta"]} (${fmt(at(s, "maS", i))}), preço acima da média longa (${fmt(at(s, "maL", i))}) e fechamento acima da máxima das últimas ${p["rompimentoCandles"]} velas (${fmt(at(s, "hh", i))}).`,
          target: c.close + 2 * n(p, "stopAtr") * at(s, "atr", i),
          indicators: ind,
        },
      };
    }
    return {};
  },
};

const seguidor: Strategy = {
  archetype: "seguidor",
  label: "Seguidor",
  logic:
    "Momentum: compra rompimentos de 20 períodos alinhados por EMA 20/50 e confirmados por volume 1,3x a média. Protege o trade no breakeven após 1 ATR.",
  timeframeLabel: "1h",
  frequency: "Média",
  riskLabel: "Moderado",
  fields: [
    { key: "mediaRapida", label: "Média rápida (velas)", kind: "int", min: 5, max: 100, step: 1 },
    { key: "mediaLenta", label: "Média lenta (velas)", kind: "int", min: 10, max: 300, step: 1 },
    {
      key: "canalEntrada",
      label: "Canal de entrada (velas)",
      kind: "int",
      min: 5,
      max: 100,
      step: 1,
    },
    { key: "canalSaida", label: "Canal de saída (velas)", kind: "int", min: 3, max: 100, step: 1 },
    ...common,
  ],
  warmup: (p) =>
    Math.max(n(p, "mediaLenta"), n(p, "canalEntrada"), n(p, "canalSaida"), n(p, "atrPeriodo") + 1),
  prepare: (c, p) => {
    const close = c.map((x) => x.close);
    return {
      maF: ema(close, n(p, "mediaRapida")),
      maS: ema(close, n(p, "mediaLenta")),
      up: priorHighest(
        c.map((x) => x.high),
        n(p, "canalEntrada"),
      ),
      down: priorLowest(
        c.map((x) => x.low),
        n(p, "canalSaida"),
      ),
      atr: atr(
        c.map((x) => x.high),
        c.map((x) => x.low),
        close,
        n(p, "atrPeriodo"),
      ),
      volumeMedia: sma(
        c.map((x) => x.volume),
        20,
      ),
    };
  },
  decide: (s, i, c, pos, p) => {
    const ind = {
      mediaRapida: r2(at(s, "maF", i)),
      mediaLenta: r2(at(s, "maS", i)),
      canalAlto: r2(at(s, "up", i)),
      canalBaixo: r2(at(s, "down", i)),
      atr: r2(at(s, "atr", i)),
      fechamento: c.close,
    };
    if (pos) {
      if (c.close < at(s, "down", i))
        return {
          exit: {
            reason: `Fechamento ${fmt(c.close)} abaixo da mínima de ${p["canalSaida"]} velas (${fmt(at(s, "down", i))}): momentum acabou.`,
            indicators: ind,
          },
        };
      if (c.close >= pos.entryPrice + at(s, "atr", i)) return { trailStop: pos.entryPrice * 1.002 };
      return {};
    }
    if (
      c.close > at(s, "up", i) &&
      at(s, "maF", i) > at(s, "maS", i) &&
      (!Number.isFinite(at(s, "volumeMedia", i)) || c.volume > 1.3 * at(s, "volumeMedia", i))
    ) {
      return {
        entry: {
          stop: c.close - n(p, "stopAtr") * at(s, "atr", i),
          target: c.close + 2 * n(p, "stopAtr") * at(s, "atr", i),
          reason: `Rompimento: fechamento ${fmt(c.close)} acima da máxima de ${p["canalEntrada"]} velas (${fmt(at(s, "up", i))}) com média ${p["mediaRapida"]} (${fmt(at(s, "maF", i))}) acima da média ${p["mediaLenta"]} (${fmt(at(s, "maS", i))}).`,
          indicators: ind,
        },
      };
    }
    return {};
  },
};

const contrario: Strategy = {
  archetype: "contrario",
  label: "Contrário",
  logic:
    "Compra quando o preço está sobrevendido (RSI baixo e abaixo da banda inferior de Bollinger). Vende quando fica sobrecomprado (RSI alto) ou no stop. Só opera comprado, como no spot.",
  timeframeLabel: "15m",
  frequency: "Média a alta",
  riskLabel: "Moderado",
  fields: [
    { key: "rsiPeriodo", label: "Período do RSI", kind: "int", min: 2, max: 50, step: 1 },
    {
      key: "rsiEntrada",
      label: "RSI de sobrevenda (entrada)",
      kind: "number",
      min: 5,
      max: 50,
      step: 1,
    },
    {
      key: "rsiSaida",
      label: "RSI de sobrecompra (saída)",
      kind: "number",
      min: 50,
      max: 95,
      step: 1,
    },
    {
      key: "bollingerPeriodo",
      label: "Período de Bollinger",
      kind: "int",
      min: 5,
      max: 100,
      step: 1,
    },
    {
      key: "bollingerDesvios",
      label: "Desvios de Bollinger",
      kind: "number",
      min: 0.5,
      max: 4,
      step: 0.1,
    },
    ...common,
  ],
  warmup: (p) => Math.max(n(p, "rsiPeriodo") + 1, n(p, "bollingerPeriodo"), n(p, "atrPeriodo") + 1),
  prepare: (c, p) => {
    const close = c.map((x) => x.close);
    const mid = sma(close, n(p, "bollingerPeriodo"));
    const sd = stdev(close, n(p, "bollingerPeriodo"));
    return {
      rsi: rsi(close, n(p, "rsiPeriodo")),
      mid,
      upper: mid.map((m, i) => m + n(p, "bollingerDesvios") * sd[i]!),
      lower: mid.map((m, i) => m - n(p, "bollingerDesvios") * sd[i]!),
      trend: ema(close, 100),
      atr: atr(
        c.map((x) => x.high),
        c.map((x) => x.low),
        close,
        n(p, "atrPeriodo"),
      ),
    };
  },
  decide: (s, i, c, pos, p) => {
    const ind = {
      rsi: r2(at(s, "rsi", i)),
      bandaInferior: r2(at(s, "lower", i)),
      bandaCentral: r2(at(s, "mid", i)),
      tendencia: r2(at(s, "trend", i)),
      atr: r2(at(s, "atr", i)),
      fechamento: c.close,
    };
    if (pos) {
      if (at(s, "rsi", i) > 68 || c.close >= at(s, "mid", i))
        return {
          exit: {
            reason: `Sobrecomprado: RSI ${fmt(at(s, "rsi", i))} acima de ${p["rsiSaida"]}.`,
            indicators: ind,
          },
        };
      return {};
    }
    const recoveredRsi = at(s, "rsi", i) > 28 && at(s, "rsi", i) < 45 && at(s, "rsi", i - 1) <= 30;
    if (
      c.close > at(s, "trend", i) * 0.96 &&
      c.low < at(s, "lower", i) &&
      c.close >= at(s, "lower", i) &&
      recoveredRsi
    ) {
      return {
        entry: {
          stop: Math.min(c.low, c.close - 1.5 * at(s, "atr", i)),
          target: Math.max(at(s, "mid", i), c.close + 2 * 1.5 * at(s, "atr", i)),
          reason: `Sobrevendido: RSI ${fmt(at(s, "rsi", i))} abaixo de ${p["rsiEntrada"]} e fechamento ${fmt(c.close)} abaixo da banda inferior (${fmt(at(s, "lower", i))}).`,
          indicators: ind,
        },
      };
    }
    return {};
  },
};

const relampago: Strategy = {
  archetype: "relampago",
  label: "Relâmpago",
  logic:
    "Momentum de baixo ruído: EMA 9/21 cruza com preço acima da EMA 50, RSI entre 52 e 65, MACD positivo e Estocástico saindo da sobrevenda.",
  timeframeLabel: "5m (configurável entre 1m e 15m)",
  frequency: "Muito alta",
  riskLabel: "Agressivo",
  fields: [
    { key: "mediaRapida", label: "Média rápida (velas)", kind: "int", min: 2, max: 50, step: 1 },
    { key: "mediaLenta", label: "Média lenta (velas)", kind: "int", min: 5, max: 200, step: 1 },
    { key: "rsiPeriodo", label: "Período do RSI", kind: "int", min: 2, max: 50, step: 1 },
    {
      key: "rsiMinimo",
      label: "RSI mínimo para entrar",
      kind: "number",
      min: 40,
      max: 90,
      step: 1,
    },
    {
      key: "alvoAtr",
      label: "Alvo de lucro (múltiplo do ATR)",
      kind: "number",
      min: 1.5,
      max: 5,
      step: 0.1,
    },
    ...common,
  ],
  warmup: (p) => Math.max(n(p, "mediaLenta") + 1, n(p, "rsiPeriodo") + 1, n(p, "atrPeriodo") + 1),
  prepare: (c, p) => {
    const close = c.map((x) => x.close);
    return {
      maF: ema(close, n(p, "mediaRapida")),
      maS: ema(close, n(p, "mediaLenta")),
      maBase: ema(close, 50),
      rsi: rsi(close, n(p, "rsiPeriodo")),
      macd: macd(close).histogram,
      stochastic: stochastic(
        c.map((x) => x.high),
        c.map((x) => x.low),
        close,
        14,
      ),
      atr: atr(
        c.map((x) => x.high),
        c.map((x) => x.low),
        close,
        n(p, "atrPeriodo"),
      ),
    };
  },
  decide: (s, i, c, pos, p) => {
    const ind = {
      mediaRapida: r2(at(s, "maF", i)),
      mediaLenta: r2(at(s, "maS", i)),
      mediaBase: r2(at(s, "maBase", i)),
      macd: r2(at(s, "macd", i)),
      estocastico: r2(at(s, "stochastic", i)),
      rsi: r2(at(s, "rsi", i)),
      atr: r2(at(s, "atr", i)),
      fechamento: c.close,
    };
    if (pos) {
      if (at(s, "maF", i) < at(s, "maS", i))
        return {
          exit: {
            reason: `Médias cruzaram para baixo (${fmt(at(s, "maF", i))} < ${fmt(at(s, "maS", i))}).`,
            indicators: ind,
          },
        };
      return {};
    }
    const crossed = at(s, "maF", i) > at(s, "maS", i) && at(s, "maF", i - 1) <= at(s, "maS", i - 1);
    const momentum = at(s, "macd", i) > 0;
    const stochasticRecovery =
      at(s, "stochastic", i) > at(s, "stochastic", i - 1) && at(s, "stochastic", i - 1) < 30;
    if (
      crossed &&
      c.close > at(s, "maBase", i) &&
      at(s, "rsi", i) >= Math.max(52, n(p, "rsiMinimo")) &&
      at(s, "rsi", i) <= 65 &&
      momentum &&
      stochasticRecovery
    ) {
      const stopDistance = n(p, "stopAtr") * at(s, "atr", i);
      const targetDistance = (n(p, "alvoAtr") || 2.5) * at(s, "atr", i);
      return {
        entry: {
          stop: c.close - stopDistance,
          target: c.close + targetDistance,
          reason: `Cruzamento de alta com confluência: média ${p["mediaRapida"]} (${fmt(at(s, "maF", i))}) acima da média ${p["mediaLenta"]} (${fmt(at(s, "maS", i))}), RSI ${fmt(at(s, "rsi", i))}, Estocástico em recuperação e alvo projetado em ${((targetDistance / c.close) * 100).toFixed(2)}% (+${n(p, "alvoAtr") || 2.5} ATR).`,
          indicators: ind,
        },
      };
    }
    return {};
  },
};

export const STRATEGIES: Record<Archetype, Strategy> = { paciente, seguidor, contrario, relampago };

/** Defaults for new agents; persisted agents can be migrated independently. */
export const DEFAULT_PARAMS: Record<Archetype, Params> = {
  paciente: {
    timeframe: "4h",
    mediaRapida: 21,
    mediaLenta: 55,
    mediaLonga: 200,
    rompimentoCandles: 3,
    atrPeriodo: 14,
    stopAtr: 2,
    trailingAtr: 2.5,
    riscoPorOperacao: 0.005,
    alocacaoMaxima: 0.5,
  },
  seguidor: {
    timeframe: "1h",
    mediaRapida: 20,
    mediaLenta: 50,
    canalEntrada: 20,
    canalSaida: 10,
    atrPeriodo: 14,
    stopAtr: 1.5,
    riscoPorOperacao: 0.01,
    alocacaoMaxima: 0.5,
  },
  contrario: {
    timeframe: "15m",
    rsiPeriodo: 14,
    rsiEntrada: 30,
    rsiSaida: 68,
    bollingerPeriodo: 20,
    bollingerDesvios: 2,
    atrPeriodo: 14,
    stopAtr: 1.5,
    riscoPorOperacao: 0.01,
    alocacaoMaxima: 0.5,
  },
  relampago: {
    timeframe: "5m",
    mediaRapida: 9,
    mediaLenta: 21,
    rsiPeriodo: 14,
    rsiMinimo: 52,
    atrPeriodo: 14,
    stopAtr: 1.2,
    alvoAtr: 2.5,
    riscoPorOperacao: 0.01,
    alocacaoMaxima: 0.5,
  },
};

export const TIMEFRAME_MS: Record<Timeframe, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};
