/**
 * Window-exact indicators: every value depends only on the last N candles, so
 * the live cycle (recent window) and a backtest (long history) produce the same
 * number for the same candle. That is what makes the ranking reproducible.
 */

export function sma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Exponential moving average with a warmup equal to its period. */
export function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0 || values.length < period) return out;
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i]!;
  out[period - 1] = seed / period;
  const alpha = 2 / (period + 1);
  for (let i = period; i < values.length; i++)
    out[i] = values[i]! * alpha + out[i - 1]! * (1 - alpha);
  return out;
}

export function stdev(values: number[], period: number): number[] {
  const mean = sma(values, period);
  const out = new Array<number>(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    let acc = 0;
    for (let j = i - period + 1; j <= i; j++) acc += (values[j]! - mean[i]!) ** 2;
    out[i] = Math.sqrt(acc / period);
  }
  return out;
}

/** RSI with simple averages of gains and losses (Cutler). */
export function rsi(closes: number[], period: number): number[] {
  const out = new Array<number>(closes.length).fill(NaN);
  const gains = new Array<number>(closes.length).fill(0);
  const losses = new Array<number>(closes.length).fill(0);
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    gains[i] = d > 0 ? d : 0;
    losses[i] = d < 0 ? -d : 0;
  }
  let g = 0;
  let l = 0;
  for (let i = 1; i < closes.length; i++) {
    g += gains[i]!;
    l += losses[i]!;
    if (i > period) {
      g -= gains[i - period]!;
      l -= losses[i - period]!;
    }
    if (i >= period) {
      const ag = g / period;
      const al = l / period;
      out[i] = al === 0 ? (ag === 0 ? 50 : 100) : 100 - 100 / (1 + ag / al);
    }
  }
  return out;
}

/** Average true range as a simple mean of true ranges. */
export function atr(highs: number[], lows: number[], closes: number[], period: number): number[] {
  const tr = highs.map((h, i) =>
    i === 0
      ? h - lows[i]!
      : Math.max(h - lows[i]!, Math.abs(h - closes[i - 1]!), Math.abs(lows[i]! - closes[i - 1]!)),
  );
  const out = sma(tr, period);
  // The first TR has no previous close; start the series after it.
  for (let i = 0; i < Math.min(period, out.length); i++) out[i] = NaN;
  return out;
}

/** Highest value of the previous `period` items, excluding the current one. */
export function priorHighest(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  for (let i = period; i < values.length; i++) {
    let m = -Infinity;
    for (let j = i - period; j < i; j++) m = Math.max(m, values[j]!);
    out[i] = m;
  }
  return out;
}

/** Lowest value of the previous `period` items, excluding the current one. */
export function priorLowest(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  for (let i = period; i < values.length; i++) {
    let m = Infinity;
    for (let j = i - period; j < i; j++) m = Math.min(m, values[j]!);
    out[i] = m;
  }
  return out;
}
