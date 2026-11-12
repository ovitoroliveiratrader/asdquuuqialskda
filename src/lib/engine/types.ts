export type Candle = {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
};

export type Archetype = "paciente" | "seguidor" | "contrario" | "relampago";

export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export type Position = {
  qty: number;
  entryPrice: number;
  entryNotional: number;
  entryFee: number;
  stop: number;
  target: number | null;
  openedAt: number;
};

export type PendingEntry = {
  stop: number;
  target: number | null;
  reason: string;
  indicators: Record<string, number>;
  signalCandleTime: number;
};

export type AgentState = {
  cash: number;
  positions: Record<string, Position>;
  /** Entry proposals generated at candle close and filled on a later candle. */
  pendingEntries: Record<string, PendingEntry>;
  /** openTime of the last candle processed per symbol. */
  lastProcessed: Record<string, number>;
  /** Last known close per symbol, used for mark-to-market. */
  lastPrices: Record<string, number>;
  feesPaid: number;
  closedTrades: number;
};

export type Fill = {
  symbol: string;
  side: "compra" | "venda";
  price: number;
  referencePrice: number;
  quantity: number;
  notional: number;
  fee: number;
  slippageCost: number;
  realizedPnl: number | null;
  reason: string;
  indicators: Record<string, number>;
  candleTime: number;
};

export type EquityPoint = { t: number; equity: number };
