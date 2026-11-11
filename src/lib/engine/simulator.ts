import { FEE_RATE, MIN_NOTIONAL, SLIPPAGE_RATE } from "./config";
import { STRATEGIES, type Params } from "./strategies";
import type { AgentState, Archetype, Candle, EquityPoint, Fill } from "./types";

export type SimCosts = { feeRate: number; slippageRate: number; minNotional: number };
export const DEFAULT_COSTS: SimCosts = {
  feeRate: FEE_RATE,
  slippageRate: SLIPPAGE_RATE,
  minNotional: MIN_NOTIONAL,
};

export function initialState(capital: number): AgentState {
  return { cash: capital, positions: {}, lastProcessed: {}, lastPrices: {}, feesPaid: 0, closedTrades: 0 };
}

/** Accepts a stored JSON state and fills any missing fields. */
export function normalizeState(raw: unknown, capital: number): AgentState {
  const base = initialState(capital);
  if (!raw || typeof raw !== "object") return base;
  const s = raw as Partial<AgentState>;
  return {
    cash: typeof s.cash === "number" ? s.cash : base.cash,
    positions: s.positions ?? {},
    lastProcessed: s.lastProcessed ?? {},
    lastPrices: s.lastPrices ?? {},
    feesPaid: s.feesPaid ?? 0,
    closedTrades: s.closedTrades ?? 0,
  };
}

export function positionsValue(state: AgentState, prices: Record<string, number> = state.lastPrices) {
  let v = 0;
  for (const [sym, p] of Object.entries(state.positions)) v += p.qty * (prices[sym] ?? p.entryPrice);
  return v;
}

export function markToMarket(state: AgentState, prices: Record<string, number> = state.lastPrices) {
  return state.cash + positionsValue(state, prices);
}

const clone = (s: AgentState): AgentState => JSON.parse(JSON.stringify(s));

export type RunInput = {
  state: AgentState;
  archetype: Archetype;
  params: Params;
  /** Closed candles only, ascending, for the agent's timeframe. */
  candlesBySymbol: Record<string, Candle[]>;
  /** Live mode: a symbol seen for the first time starts at its latest candle, without trading history. */
  startFresh?: boolean;
  recordEquity?: boolean;
  costs?: SimCosts;
};

export type RunOutput = { state: AgentState; fills: Fill[]; equity: EquityPoint[] };

/**
 * Deterministic engine step. Given the same state, parameters and candles it
 * always returns the same fills, so live cycles and backtests share one code path.
 */
export function runAgent(input: RunInput): RunOutput {
  const costs = input.costs ?? DEFAULT_COSTS;
  const strategy = STRATEGIES[input.archetype];
  const p = input.params;
  const state = clone(input.state);
  const fills: Fill[] = [];
  const equity: EquityPoint[] = [];
  const warmup = strategy.warmup(p);

  type Ev = { sym: string; i: number; candles: Candle[]; series: Record<string, number[]> };
  const events: Ev[] = [];

  for (const [sym, raw] of Object.entries(input.candlesBySymbol)) {
    const candles = dedupe(raw);
    if (candles.length === 0) continue;
    if (state.lastProcessed[sym] === undefined && input.startFresh) {
      const last = candles[candles.length - 1]!;
      state.lastProcessed[sym] = last.openTime;
      state.lastPrices[sym] = last.close;
      continue;
    }
    const after = state.lastProcessed[sym] ?? -Infinity;
    const series = strategy.prepare(candles, p);
    for (let i = 0; i < candles.length; i++) {
      if (candles[i]!.openTime > after) events.push({ sym, i, candles, series });
    }
  }

  events.sort((a, b) => a.candles[a.i]!.closeTime - b.candles[b.i]!.closeTime || (a.sym < b.sym ? -1 : 1));

  for (const ev of events) {
    const c = ev.candles[ev.i]!;
    const sym = ev.sym;
    state.lastPrices[sym] = c.close;
    state.lastProcessed[sym] = c.openTime;

    if (ev.i >= warmup) {
      let exitedNow = false;
      const pos = state.positions[sym];

      if (pos && pos.openedAt < c.openTime) {
        if (c.low <= pos.stop) {
          const ref = Math.min(c.open, pos.stop);
          fills.push(sell(state, sym, ref, c.openTime, `Stop atingido em ${ref.toFixed(2)}.`, { stop: pos.stop, minima: c.low }, costs));
          exitedNow = true;
        } else if (pos.target !== null && c.high >= pos.target) {
          const ref = Math.max(c.open, pos.target);
          fills.push(sell(state, sym, ref, c.openTime, `Alvo de lucro atingido em ${ref.toFixed(2)}.`, { alvo: pos.target, maxima: c.high }, costs));
          exitedNow = true;
        }
      }

      const open = state.positions[sym];
      const signal = strategy.decide(ev.series, ev.i, c, open ?? null, p);

      if (open && signal.exit) {
        fills.push(sell(state, sym, c.close, c.openTime, signal.exit.reason, signal.exit.indicators, costs));
        exitedNow = true;
      } else if (open && signal.trailStop !== undefined && signal.trailStop > open.stop) {
        open.stop = signal.trailStop;
      }

      if (!state.positions[sym] && !exitedNow && signal.entry) {
        const f = buy(state, sym, c, signal.entry, p, costs);
        if (f) fills.push(f);
      }
    }

    if (input.recordEquity) equity.push({ t: c.closeTime, equity: markToMarket(state) });
  }

  return { state, fills, equity };
}

function dedupe(candles: Candle[]): Candle[] {
  const seen = new Map<number, Candle>();
  for (const c of candles) seen.set(c.openTime, c);
  return [...seen.values()].sort((a, b) => a.openTime - b.openTime);
}

function buy(
  state: AgentState,
  sym: string,
  c: Candle,
  entry: NonNullable<ReturnType<(typeof STRATEGIES)["paciente"]["decide"]>["entry"]>,
  p: Params,
  costs: SimCosts,
): Fill | null {
  const fillPrice = c.close * (1 + costs.slippageRate);
  const riskPerUnit = fillPrice - entry.stop;
  if (!(riskPerUnit > 0)) return null;
  const eq = markToMarket(state);
  let qty = (eq * Number(p["riscoPorOperacao"])) / riskPerUnit;
  qty = Math.min(qty, (eq * Number(p["alocacaoMaxima"])) / fillPrice, state.cash / (fillPrice * (1 + costs.feeRate)));
  qty = Math.floor(qty * 1e8) / 1e8;
  const notional = qty * fillPrice;
  if (!(notional >= costs.minNotional)) return null;
  const fee = notional * costs.feeRate;
  state.cash -= notional + fee;
  state.feesPaid += fee;
  state.positions[sym] = {
    qty,
    entryPrice: fillPrice,
    entryNotional: notional,
    entryFee: fee,
    stop: entry.stop,
    target: entry.target,
    openedAt: c.openTime,
  };
  return {
    symbol: sym,
    side: "compra",
    price: fillPrice,
    referencePrice: c.close,
    quantity: qty,
    notional,
    fee,
    slippageCost: (fillPrice - c.close) * qty,
    realizedPnl: null,
    reason: entry.reason,
    indicators: { ...entry.indicators, stop: Math.round(entry.stop * 100) / 100 },
    candleTime: c.openTime,
  };
}

function sell(
  state: AgentState,
  sym: string,
  ref: number,
  candleTime: number,
  reason: string,
  indicators: Record<string, number>,
  costs: SimCosts,
): Fill {
  const pos = state.positions[sym]!;
  const fillPrice = ref * (1 - costs.slippageRate);
  const notional = pos.qty * fillPrice;
  const fee = notional * costs.feeRate;
  state.cash += notional - fee;
  state.feesPaid += fee;
  state.closedTrades += 1;
  delete state.positions[sym];
  return {
    symbol: sym,
    side: "venda",
    price: fillPrice,
    referencePrice: ref,
    quantity: pos.qty,
    notional,
    fee,
    slippageCost: (ref - fillPrice) * pos.qty,
    realizedPnl: notional - fee - (pos.entryNotional + pos.entryFee),
    reason,
    indicators,
    candleTime,
  };
}
