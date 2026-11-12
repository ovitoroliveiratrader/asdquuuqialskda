import type { Candle, Timeframe } from "./types";

/**
 * Binance public market-data hosts, tried in order: no API key, read-only.
 * Some server regions get HTTP 403/451 from one host; the next one is tried.
 * Binance US (last) is only a fallback and its prices can differ slightly.
 */
export const HOSTS = [
  "https://data-api.binance.vision",
  "https://api.binance.com",
  "https://api-gcp.binance.com",
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://api3.binance.com",
  "https://api.binance.us",
] as const;

let preferred = 0;
/** Host that answered the last successful request. */
export const lastSource = () => HOSTS[preferred]!;

const SERVER_HEADERS: Record<string, string> =
  typeof window === "undefined" ? { "User-Agent": "escritorio-agentes/1.0 (simulado)", Accept: "application/json" } : {};

async function get(path: string, label: string): Promise<unknown> {
  const errors: string[] = [];
  for (let k = 0; k < HOSTS.length; k++) {
    const idx = (preferred + k) % HOSTS.length;
    const host = HOSTS[idx]!;
    try {
      const res = await fetch(`${host}/api/v3${path}`, { headers: SERVER_HEADERS });
      if (res.ok) {
        preferred = idx;
        return await res.json();
      }
      errors.push(`${new URL(host).host} ${res.status}`);
      if (res.status === 400) break; // bad request: other hosts would answer the same
    } catch (e) {
      errors.push(`${new URL(host).host} ${e instanceof Error ? e.message : "falha"}`);
    }
  }
  throw new Error(`Binance ${label}: ${errors.join(", ")}`);
}

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
  return ((await get(`/klines?${q}`, `${symbol} ${interval}`)) as RawKline[]).map(parse);
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
    cursor = batch[batch.length - 1]!.openTime + 1;
    if (batch.length < 1000) break;
  }
  return out;
}

export async function fetchPrices(symbols: string[]): Promise<Record<string, number>> {
  const q = encodeURIComponent(JSON.stringify(symbols));
  const rows = (await get(`/ticker/price?symbols=${q}`, "preços")) as { symbol: string; price: string }[];
  return Object.fromEntries(rows.map((r) => [r.symbol, Number(r.price)]));
}
