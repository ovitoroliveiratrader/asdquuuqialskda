import { atr, priorHighest, priorLowest, rsi, sma, stdev } from "./indicators";
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
  entry?: { stop: number; target: number | null; reason: string; indicators: Record<string, number> };
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
  { key: "stopAtr", label: "Stop em múltiplos de ATR", kind: "number", min: 0.5, max: 10, step: 0.1 },
  { key: "riscoPorOperacao", label: "Risco por operação", kind: "pct", min: 0.001, max: 0.05, step: 0.001 },
  { key: "alocacaoMaxima", label: "Alocação máxima por par", kind: "pct", min: 0.05, max: 1, step: 0.05 },
];

const paciente: Strategy = {
  archetype: "paciente",
  label: "Paciente",
  logic: "Entra só em tendência confirmada: média rápida acima da lenta, preço acima da média longa e rompendo a máxima recente. Sai quando o preço fecha abaixo da média lenta ou no stop móvel.",
  timeframeLabel: "4h (média longa de 300 velas ≈ 50 dias, filtro diário)",
  frequency: "Baixa",
  riskLabel: "Conservador",
  fields: [
    { key: "mediaRapida", label: "Média rápida (velas)", kind: "int", min: 5, max: 200, step: 1 },
    { key: "mediaLenta", label: "Média lenta (velas)", kind: "int", min: 20, max: 400, step: 1 },
    { key: "mediaLonga", label: "Média longa (velas)", kind: "int", min: 50, max: 600, step: 1 },
    { key: "rompimentoCandles", label: "Rompimento da máxima de N velas", kind: "int", min: 2, max: 60, step: 1 },
    { key: "trailingAtr", label: "Stop móvel em ATR", kind: "number", min: 0.5, max: 10, step: 0.1 },
    ...common,
  ],
  warmup: (p) => Math.max(n(p, "mediaLenta"), n(p, "mediaLonga"), n(p, "atrPeriodo") + 1, n(p, "rompimentoCandles")),
  prepare: (c, p) => {
    const close = c.map((x) => x.close);
    return {
      maF: sma(close, n(p, "mediaRapida")),
      maS: sma(close, n(p, "mediaLenta")),
      maL: sma(close, n(p, "mediaLonga")),
      hh: priorHighest(close, n(p, "rompimentoCandles")),
      atr: atr(c.map((x) => x.high), c.map((x) => x.low), close, n(p, "atrPeriodo")),
    };
  },
  decide: (s, i, c, pos, p) => {
    const ind = { mediaRapida: r2(at(s, "maF", i)), mediaLenta: r2(at(s, "maS", i)), mediaLonga: r2(at(s, "maL", i)), maximaRecente: r2(at(s, "hh", i)), atr: r2(at(s, "atr", i)), fechamento: c.close };
    if (pos) {
      if (c.close < at(s, "maS", i)) return { exit: { reason: `Fechamento ${fmt(c.close)} abaixo da média lenta ${fmt(at(s, "maS", i))}: tendência perdeu força.`, indicators: ind } };
      return { trailStop: c.close - n(p, "trailingAtr") * at(s, "atr", i) };
    }
    if (at(s, "maF", i) > at(s, "maS", i) && c.close > at(s, "maL", i) && c.close > at(s, "hh", i)) {
      return {
        entry: {
          stop: c.close - n(p, "stopAtr") * at(s, "atr", i),
          target: null,
          reason: `Tendência confirmada: média ${p["mediaRapida"]} (${fmt(at(s, "maF", i))}) acima da média ${p["mediaLenta"]} (${fmt(at(s, "maS", i))}), preço acima da média longa (${fmt(at(s, "maL", i))}) e fechamento acima da máxima das últimas ${p["rompimentoCandles"]} velas (${fmt(at(s, "hh", i))}).`,
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
  logic: "Momentum: compra o rompimento da máxima do canal quando a média rápida está acima da lenta. Sai quando o preço perde a mínima do canal de saída ou no stop.",
  timeframeLabel: "1h",
  frequency: "Média",
  riskLabel: "Moderado",
  fields: [
    { key: "mediaRapida", label: "Média rápida (velas)", kind: "int", min: 5, max: 100, step: 1 },
    { key: "mediaLenta", label: "Média lenta (velas)", kind: "int", min: 10, max: 300, step: 1 },
    { key: "canalEntrada", label: "Canal de entrada (velas)", kind: "int", min: 5, max: 100, step: 1 },
    { key: "canalSaida", label: "Canal de saída (velas)", kind: "int", min: 3, max: 100, step: 1 },
    ...common,
  ],
  warmup: (p) => Math.max(n(p, "mediaLenta"), n(p, "canalEntrada"), n(p, "canalSaida"), n(p, "atrPeriodo") + 1),
  prepare: (c, p) => {
    const close = c.map((x) => x.close);
    return {
      maF: sma(close, n(p, "mediaRapida")),
      maS: sma(close, n(p, "mediaLenta")),
      up: priorHighest(c.map((x) => x.high), n(p, "canalEntrada")),
      down: priorLowest(c.map((x) => x.low), n(p, "canalSaida")),
      atr: atr(c.map((x) => x.high), c.map((x) => x.low), close, n(p, "atrPeriodo")),
    };
  },
  decide: (s, i, c, pos, p) => {
    const ind = { mediaRapida: r2(at(s, "maF", i)), mediaLenta: r2(at(s, "maS", i)), canalAlto: r2(at(s, "up", i)), canalBaixo: r2(at(s, "down", i)), atr: r2(at(s, "atr", i)), fechamento: c.close };
    if (pos) {
      if (c.close < at(s, "down", i)) return { exit: { reason: `Fechamento ${fmt(c.close)} abaixo da mínima de ${p["canalSaida"]} velas (${fmt(at(s, "down", i))}): momentum acabou.`, indicators: ind } };
      return {};
    }
    if (c.close > at(s, "up", i) && at(s, "maF", i) > at(s, "maS", i)) {
      return {
        entry: {
          stop: c.close - n(p, "stopAtr") * at(s, "atr", i),
          target: null,
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
  logic: "Compra quando o preço está sobrevendido (RSI baixo e abaixo da banda inferior de Bollinger). Vende quando fica sobrecomprado (RSI alto) ou no stop. Só opera comprado, como no spot.",
  timeframeLabel: "15m",
  frequency: "Média a alta",
  riskLabel: "Moderado",
  fields: [
    { key: "rsiPeriodo", label: "Período do RSI", kind: "int", min: 2, max: 50, step: 1 },
    { key: "rsiEntrada", label: "RSI de sobrevenda (entrada)", kind: "number", min: 5, max: 50, step: 1 },
    { key: "rsiSaida", label: "RSI de sobrecompra (saída)", kind: "number", min: 50, max: 95, step: 1 },
    { key: "bollingerPeriodo", label: "Período de Bollinger", kind: "int", min: 5, max: 100, step: 1 },
    { key: "bollingerDesvios", label: "Desvios de Bollinger", kind: "number", min: 0.5, max: 4, step: 0.1 },
    ...common,
  ],
  warmup: (p) => Math.max(n(p, "rsiPeriodo") + 1, n(p, "bollingerPeriodo"), n(p, "atrPeriodo") + 1),
  prepare: (c, p) => {
    const close = c.map((x) => x.close);
    const mid = sma(close, n(p, "bollingerPeriodo"));
    const sd = stdev(close, n(p, "bollingerPeriodo"));
    return {
      rsi: rsi(close, n(p, "rsiPeriodo")),
      lower: mid.map((m, i) => m - n(p, "bollingerDesvios") * sd[i]!),
      atr: atr(c.map((x) => x.high), c.map((x) => x.low), close, n(p, "atrPeriodo")),
    };
  },
  decide: (s, i, c, pos, p) => {
    const ind = { rsi: r2(at(s, "rsi", i)), bandaInferior: r2(at(s, "lower", i)), atr: r2(at(s, "atr", i)), fechamento: c.close };
    if (pos) {
      if (at(s, "rsi", i) > n(p, "rsiSaida")) return { exit: { reason: `Sobrecomprado: RSI ${fmt(at(s, "rsi", i))} acima de ${p["rsiSaida"]}.`, indicators: ind } };
      return {};
    }
    if (at(s, "rsi", i) < n(p, "rsiEntrada") && c.close < at(s, "lower", i)) {
      return {
        entry: {
          stop: c.close - n(p, "stopAtr") * at(s, "atr", i),
          target: null,
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
  logic: "Operações curtas: compra quando a média rápida cruza para cima da lenta com RSI forte. Sai no alvo percentual, no stop ou quando as médias cruzam de volta.",
  timeframeLabel: "1m",
  frequency: "Muito alta",
  riskLabel: "Agressivo",
  fields: [
    { key: "mediaRapida", label: "Média rápida (velas)", kind: "int", min: 2, max: 50, step: 1 },
    { key: "mediaLenta", label: "Média lenta (velas)", kind: "int", min: 5, max: 200, step: 1 },
    { key: "rsiPeriodo", label: "Período do RSI", kind: "int", min: 2, max: 50, step: 1 },
    { key: "rsiMinimo", label: "RSI mínimo para entrar", kind: "number", min: 40, max: 90, step: 1 },
    { key: "alvoPercentual", label: "Alvo de lucro", kind: "pct", min: 0.001, max: 0.05, step: 0.001 },
    ...common,
  ],
  warmup: (p) => Math.max(n(p, "mediaLenta") + 1, n(p, "rsiPeriodo") + 1, n(p, "atrPeriodo") + 1),
  prepare: (c, p) => {
    const close = c.map((x) => x.close);
    return {
      maF: sma(close, n(p, "mediaRapida")),
      maS: sma(close, n(p, "mediaLenta")),
      rsi: rsi(close, n(p, "rsiPeriodo")),
      atr: atr(c.map((x) => x.high), c.map((x) => x.low), close, n(p, "atrPeriodo")),
    };
  },
  decide: (s, i, c, pos, p) => {
    const ind = { mediaRapida: r2(at(s, "maF", i)), mediaLenta: r2(at(s, "maS", i)), rsi: r2(at(s, "rsi", i)), atr: r2(at(s, "atr", i)), fechamento: c.close };
    if (pos) {
      if (at(s, "maF", i) < at(s, "maS", i)) return { exit: { reason: `Médias cruzaram para baixo (${fmt(at(s, "maF", i))} < ${fmt(at(s, "maS", i))}).`, indicators: ind } };
      return {};
    }
    const crossed = at(s, "maF", i) > at(s, "maS", i) && at(s, "maF", i - 1) <= at(s, "maS", i - 1);
    if (crossed && at(s, "rsi", i) > n(p, "rsiMinimo")) {
      return {
        entry: {
          stop: c.close - n(p, "stopAtr") * at(s, "atr", i),
          target: c.close * (1 + n(p, "alvoPercentual")),
          reason: `Cruzamento de alta: média ${p["mediaRapida"]} (${fmt(at(s, "maF", i))}) passou a média ${p["mediaLenta"]} (${fmt(at(s, "maS", i))}) com RSI ${fmt(at(s, "rsi", i))}.`,
          indicators: ind,
        },
      };
    }
    return {};
  },
};

export const STRATEGIES: Record<Archetype, Strategy> = { paciente, seguidor, contrario, relampago };

export const TIMEFRAME_MS: Record<Timeframe, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};
