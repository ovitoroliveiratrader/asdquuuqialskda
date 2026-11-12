import type { Candle, Timeframe } from "./types";

/**
 * Public market-data hosts, tried in order. No API key and no order endpoint is
 * used. The alternative exchange fallback is only for simulation continuity;
 * its prices can differ slightly from Binance and are recorded as the source.
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

const CACHE_TTL_MS = 45_000;
const cache = new Map<string, { expires: number; value: unknown }>();
let preferred = 0;
let source: string = HOSTS[0]!;

/** Host or public exchange that answered the last successful request. */
export const lastSource = () => source;

const SERVER_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
  Accept: "application/json",
  "Cache-Control": "no-cache",
};

const cacheEnabled = () => typeof window === "undefined" && process.env["NODE_ENV"] !== "test";

async function get(path: string, label: string): Promise<unknown> {
  const cached = cache.get(path);
  if (cacheEnabled() && cached && cached.expires > Date.now()) return cached.value;

  const errors: string[] = [];
  for (let k = 0; k < HOSTS.length; k++) {
    const idx = (preferred + k) % HOSTS.length;
    const host = HOSTS[idx]!;
    try {
      const res = await fetch(`${host}/api/v3${path}`, { headers: SERVER_HEADERS });
      if (res.ok) {
        preferred = idx;
        source = host;
        const value = await res.json();
        if (cacheEnabled()) cache.set(path, { expires: Date.now() + CACHE_TTL_MS, value });
        return value;
      }
      errors.push(`${new URL(host).host} ${res.status}`);
      if (res.status === 400) break;
    } catch (e) {
      errors.push(`${new URL(host).host} ${e instanceof Error ? e.message : "falha"}`);
    }
  }
  throw new Error(`Binance ${label}: ${errors.join(", ")}`);
}

type RawKline = [number, string, string, string, string, string, number, ...unknown[]];

const parse = (k: RawKline): Candle => ({
  openTime: Number(k[0]),
  open: Number(k[1]),
  high: Number(k[2]),
  low: Number(k[3]),
  close: Number(k[4]),
  volume: Number(k[5]),
  closeTime: Number(k[6]),
});

const KRAKEN_PAIRS: Record<string, string> = { BTCUSDT: "XBTUSD", ETHUSDT: "ETHUSD" };
const KRAKEN_INTERVALS: Record<Timeframe | "1w", number> = {
  "1m": 1,
  "5m": 5,
  "15m": 15,
  "1h": 60,
  "4h": 240,
  "1d": 1440,
  "1w": 10080,
};

async function fetchKrakenKlines(symbol: string, interval: Timeframe | "1w"): Promise<Candle[]> {
  const pair = KRAKEN_PAIRS[symbol];
  if (!pair) throw new Error(`Par ${symbol} não mapeado para o fallback Kraken`);
  const q = new URLSearchParams({ pair, interval: String(KRAKEN_INTERVALS[interval]) });
  const res = await fetch(`https://api.kraken.com/0/public/OHLC?${q}`, { headers: SERVER_HEADERS });
  if (!res.ok) throw new Error(`Kraken ${res.status}`);
  const body = (await res.json()) as { error?: string[]; result?: Record<string, unknown> };
  if (body.error?.length || !body.result)
    throw new Error(`Kraken ${body.error?.join(", ") ?? "resposta inválida"}`);
  const rows = Object.entries(body.result).find(([key]) => key !== "last")?.[1];
  if (!Array.isArray(rows)) throw new Error("Kraken OHLC sem candles");
  source = "https://api.kraken.com";
  return (rows as Array<[number, string, string, string, string, string, string, number]>).map(
    (r) => ({
      openTime: Number(r[0]) * 1000,
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
      volume: Number(r[6]),
      closeTime: (Number(r[0]) + KRAKEN_INTERVALS[interval] * 60) * 1000 - 1,
    }),
  );
}

export async function fetchKlines(
  symbol: string,
  interval: Timeframe | "1w",
  opts: { limit?: number; startTime?: number; endTime?: number } = {},
): Promise<Candle[]> {
  const q = new URLSearchParams({ symbol, interval, limit: String(opts.limit ?? 1000) });
  if (opts.startTime !== undefined) q.set("startTime", String(opts.startTime));
  if (opts.endTime !== undefined) q.set("endTime", String(opts.endTime));
  try {
    return ((await get(`/klines?${q}`, `${symbol} ${interval}`)) as RawKline[]).map(parse);
  } catch (primaryError) {
    try {
      return fetchKrakenKlines(symbol, interval);
    } catch (fallbackError) {
      throw new Error(
        `${primaryError instanceof Error ? primaryError.message : primaryError}; fallback: ${fallbackError instanceof Error ? fallbackError.message : fallbackError}`,
      );
    }
  }
}

/** Only candles that have fully closed. */
export const closedOnly = (candles: Candle[], now = Date.now()) =>
  candles.filter((c) => c.closeTime < now);

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
  if (symbols.length === 0) return {};
  let primaryError: unknown;
  try {
    // Do not send the symbols=[] JSON query to Binance.US; it rejects it.
    const rows = (await get("/ticker/price", "preços")) as { symbol: string; price: string }[];
    const wanted = new Set(symbols);
    const result = Object.fromEntries(
      rows.filter((r) => wanted.has(r.symbol)).map((r) => [r.symbol, Number(r.price)]),
    );
    if (Object.keys(result).length === symbols.length) return result;
  } catch (error) {
    primaryError = error;
    // Try the individual/fallback path below.
  }

  const result: Record<string, number> = {};
  for (const symbol of symbols) {
    try {
      const row = (await get(
        `/ticker/price?symbol=${encodeURIComponent(symbol)}`,
        `preço ${symbol}`,
      )) as { symbol: string; price: string };
      result[symbol] = Number(row.price);
      continue;
    } catch {
      try {
        const candles = await fetchKrakenKlines(symbol, "1m");
        const last = candles[candles.length - 1];
        if (!last) throw new Error(`Sem preço alternativo para ${symbol}`);
        result[symbol] = last.close;
      } catch {
        if (primaryError instanceof Error) throw primaryError;
        throw new Error(`Sem preço para ${symbol}`);
      }
    }
  }
  return result;
}
