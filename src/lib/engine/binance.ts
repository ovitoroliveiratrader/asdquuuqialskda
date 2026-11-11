import type { Candle, Timeframe } from "./types";

/** Binance public market-data host: no API key, read-only. */
const BASE = "https://data-api.binance.vision/api/v3";

type RawKline = [number, string, string, string, string, string, number, ...unknown[]];

const parse = (k: RawKline): Candle => ({
  openTime: k[0],
  open: Number(k[1]),
  high: Number(k[2]),
  low: Number(k[3]),
  close: Number(k[4]),
  volume: Number(k[5]),
  closeTime: k[6],
});

export async function fetchKlines(
  symbol: string,
  interval: Timeframe | "1w",
  opts: { limit?: number; startTime?: number; endTime?: number } = {},
): Promise<Candle[]> {
  const q = new URLSearchParams({ symbol, interval, limit: String(opts.limit ?? 1000) });
  if (opts.startTime !== undefined) q.set("startTime", String(opts.startTime));
  if (opts.endTime !== undefined) q.set("endTime", String(opts.endTime));
  const res = await fetch(`${BASE}/klines?${q}`);
  if (!res.ok) throw new Error(`Binance ${symbol} ${interval}: HTTP ${res.status}`);
  return ((await res.json()) as RawKline[]).map(parse);
}

/** Only candles that have fully closed. */
export const closedOnly = (candles: Candle[], now = Date.now()) => candles.filter((c) => c.closeTime < now);

/** Paginates forward from startTime until endTime (inclusive range of open times). */
export async function fetchKlineRange(
  symbol: string,
  interval: Timeframe,
  startTime: number,
  endTime: number,
  onProgress?: (loaded: number) => void,
): Promise<Candle[]> {
  const out: Candle[] = [];
  let cursor = startTime;
  for (let guard = 0; guard < 200 && cursor < endTime; guard++) {
    const batch = await fetchKlines(symbol, interval, { startTime: cursor, endTime, limit: 1000 });
    if (batch.length === 0) break;
    out.push(...batch);
    onProgress?.(out.length);
    cursor = batch[batch.length - 1].openTime + 1;
    if (batch.length < 1000) break;
  }
  return out;
}

export async function fetchPrices(symbols: string[]): Promise<Record<string, number>> {
  const q = encodeURIComponent(JSON.stringify(symbols));
  const res = await fetch(`${BASE}/ticker/price?symbols=${q}`);
  if (!res.ok) throw new Error(`Binance preços: HTTP ${res.status}`);
  const rows = (await res.json()) as { symbol: string; price: string }[];
  return Object.fromEntries(rows.map((r) => [r.symbol, Number(r.price)]));
}
