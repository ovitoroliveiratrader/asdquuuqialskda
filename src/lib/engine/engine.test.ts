import { describe, expect, it } from "vitest";
import { INITIAL_CAPITAL, PROMOTION } from "./config";
import { sma, rsi } from "./indicators";
import { computeMetrics, maxDrawdown, rankAgents, weekStart, weeklyReturns } from "./metrics";
import { initialState, macroAllowsEntry, markToMarket, runAgent } from "./simulator";
import { STRATEGIES, type Params } from "./strategies";
import type { Candle } from "./types";

const H = 3_600_000;
const mk = (
  i: number,
  close: number,
  o = close,
  hi = Math.max(o, close),
  lo = Math.min(o, close),
): Candle => ({
  openTime: i * H,
  open: o,
  high: hi,
  low: lo,
  close,
  volume: 1,
  closeTime: (i + 1) * H - 1,
});

const seguidorParams: Params = {
  timeframe: "1h",
  mediaRapida: 2,
  mediaLenta: 3,
  canalEntrada: 3,
  canalSaida: 2,
  atrPeriodo: 2,
  stopAtr: 2,
  riscoPorOperacao: 0.01,
  alocacaoMaxima: 0.5,
};

const relampagoParams: Params = {
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
};

const breakoutCandles = () =>
  [100, 100, 100, 100, 110, 112].map((c, i) => ({
    ...mk(i, c, i === 5 ? 111 : c),
    volume: i === 4 ? 2 : 1,
  }));

describe("indicadores", () => {
  it("média simples usa só a janela", () => {
    expect(sma([1, 2, 3, 4], 2).slice(1)).toEqual([1.5, 2.5, 3.5]);
  });
  it("RSI é 100 quando só há altas", () => {
    expect(rsi([1, 2, 3, 4], 3)[3]).toBe(100);
  });
});

describe("simulador", () => {
  it("Relâmpago gera alvo ATR com relação risco-retorno de pelo menos 2:1", () => {
    const signal = STRATEGIES.relampago.decide(
      {
        maF: [100, 110],
        maS: [105, 105],
        maBase: [90, 90],
        rsi: [55, 55],
        macd: [1, 1],
        stochastic: [20, 40],
        atr: [2, 2],
      },
      1,
      mk(1, 100),
      null,
      relampagoParams,
    );
    expect(signal.entry).toBeDefined();
    const entry = signal.entry!;
    expect(entry.target).not.toBeNull();
    expect(entry.target! - 100).toBeGreaterThanOrEqual(2 * (100 - entry.stop));
  });

  it("Relâmpago vencedor supera 50 USDT líquidos após taxas e slippage", () => {
    const entryPrice = 100;
    const quantity = 80;
    const entryNotional = entryPrice * quantity;
    const entryFee = entryNotional * 0.001;
    const state = initialState(10_000);
    state.cash -= entryNotional + entryFee;
    state.feesPaid = entryFee;
    state.positions["BTCUSDT"] = {
      qty: quantity,
      entryPrice,
      entryNotional,
      entryFee,
      stop: 97.6,
      target: 105,
      openedAt: 0,
    };
    state.lastProcessed["BTCUSDT"] = 28 * H;
    const candles = Array.from({ length: 30 }, (_, i) =>
      mk(i, i === 29 ? 102 : 100, 100, i === 29 ? 106 : 100, 99),
    );
    const out = runAgent({
      state,
      archetype: "relampago",
      params: relampagoParams,
      candlesBySymbol: { BTCUSDT: candles },
    });
    const sell = out.fills.find((f) => f.side === "venda");
    expect(sell?.realizedPnl).toBeGreaterThan(50);
  });

  it("filtro macro usa a vela histórica e não a última vela futura", () => {
    const macro = Array.from({ length: 60 }, (_, i) => {
      const close = i < 50 ? 100 : i === 50 ? 120 : 80;
      return mk(i, close);
    });
    expect(macroAllowsEntry(macro, 51 * H)).toBe(true);
    expect(macroAllowsEntry(macro)).toBe(false);
  });

  it("gera o sinal no fechamento e executa a compra no open do candle seguinte", () => {
    const out = runAgent({
      state: initialState(10_000),
      archetype: "seguidor",
      params: seguidorParams,
      candlesBySymbol: { BTCUSDT: breakoutCandles() },
    });
    const buy = out.fills.find((f) => f.side === "compra")!;
    expect(buy.price).toBeCloseTo(111 * 1.0005, 8);
    expect(buy.referencePrice).toBe(111);
    expect(buy.fee).toBeCloseTo(buy.notional * 0.001, 8);
    expect(out.state.cash).toBeCloseTo(10_000 - buy.notional - buy.fee, 6);
  });

  it("patrimônio = caixa + posições a preço de mercado", () => {
    const out = runAgent({
      state: initialState(10_000),
      archetype: "seguidor",
      params: seguidorParams,
      candlesBySymbol: { BTCUSDT: breakoutCandles() },
    });
    const pos = out.state.positions["BTCUSDT"]!;
    expect(markToMarket(out.state, { BTCUSDT: 120 })).toBeCloseTo(
      out.state.cash + pos.qty * 120,
      6,
    );
  });

  it("não aloca mais que a alocação máxima por par", () => {
    const out = runAgent({
      state: initialState(10_000),
      archetype: "seguidor",
      params: { ...seguidorParams, riscoPorOperacao: 0.05 },
      candlesBySymbol: { BTCUSDT: breakoutCandles() },
    });
    expect(out.fills[0]!.notional).toBeLessThanOrEqual(10_000 * 0.5 + 1e-6);
  });

  it("stop vende no preço do stop com deslizamento e registra lucro/prejuízo após taxas", () => {
    const base = [100, 100, 100, 100, 110].map((c, i) => ({
      ...mk(i, c),
      volume: i === 4 ? 2 : 1,
    }));
    const entryCandle = mk(5, 90, 111, 111, 85);
    const out = runAgent({
      state: initialState(10_000),
      archetype: "seguidor",
      params: seguidorParams,
      candlesBySymbol: { BTCUSDT: [...base, entryCandle] },
    });
    const sell = out.fills.find((f) => f.side === "venda")!;
    const buy = out.fills[0]!;
    const stop = Number(buy.indicators["stop"]);
    expect(sell.referencePrice).toBeCloseTo(Math.min(buy.price, stop), 2);
    expect(sell.price).toBeCloseTo(sell.referencePrice * 0.9995, 6);
    expect(sell.realizedPnl!).toBeCloseTo(sell.notional - sell.fee - buy.notional - buy.fee, 6);
    expect(out.state.closedTrades).toBe(1);
  });

  it("executa uma ordem pendente no preço de mercado durante o ciclo ao vivo", () => {
    const state = initialState(10_000);
    state.pendingEntries["BTCUSDT"] = {
      stop: 90,
      target: 140,
      reason: "sinal confirmado",
      indicators: { atr: 10 },
      signalCandleTime: 1,
    };
    const out = runAgent({
      state,
      archetype: "seguidor",
      params: seguidorParams,
      candlesBySymbol: { BTCUSDT: [] },
      startFresh: true,
      marketPrices: { BTCUSDT: 105 },
      marketTime: 2,
    });
    expect(out.fills).toHaveLength(1);
    expect(out.fills[0]!.referencePrice).toBe(105);
    expect(out.state.pendingEntries).toEqual({});
    expect(out.state.positions["BTCUSDT"]).toBeDefined();
  });

  it("é determinístico: processar em dois ciclos dá o mesmo resultado que de uma vez", () => {
    const closes = [100, 101, 99, 102, 108, 111, 107, 103, 99, 104, 112, 115, 109, 101];
    const candles = closes.map((c, i) => mk(i, c, closes[i - 1] ?? c));
    const all = runAgent({
      state: initialState(10_000),
      archetype: "seguidor",
      params: seguidorParams,
      candlesBySymbol: { BTCUSDT: candles },
    });
    const first = runAgent({
      state: initialState(10_000),
      archetype: "seguidor",
      params: seguidorParams,
      candlesBySymbol: { BTCUSDT: candles.slice(0, 8) },
    });
    const second = runAgent({
      state: first.state,
      archetype: "seguidor",
      params: seguidorParams,
      candlesBySymbol: { BTCUSDT: candles.slice(2) },
    });
    expect(second.state.cash).toBeCloseTo(all.state.cash, 8);
    expect(second.state.pendingEntries).toEqual(all.state.pendingEntries);
    expect(first.fills.length + second.fills.length).toBe(all.fills.length);
  });

  it("no modo ao vivo, um par novo começa no candle mais recente sem operar o passado", () => {
    const out = runAgent({
      state: initialState(10_000),
      archetype: "seguidor",
      params: seguidorParams,
      candlesBySymbol: { BTCUSDT: [100, 100, 100, 100, 110].map((c, i) => mk(i, c)) },
      startFresh: true,
    });
    expect(out.fills).toHaveLength(0);
    expect(out.state.lastProcessed["BTCUSDT"]).toBe(4 * H);
  });

  it("mantém agentes independentes mesmo quando operam o mesmo ativo", () => {
    const candles = breakoutCandles();
    const x = runAgent({
      state: initialState(10_000),
      archetype: "seguidor",
      params: seguidorParams,
      candlesBySymbol: { BTCUSDT: candles },
    });
    const y = runAgent({
      state: initialState(20_000),
      archetype: "seguidor",
      params: seguidorParams,
      candlesBySymbol: { BTCUSDT: candles },
    });
    expect(x.fills.find((f) => f.side === "compra")?.symbol).toBe("BTCUSDT");
    expect(y.fills.find((f) => f.side === "compra")?.symbol).toBe("BTCUSDT");
    expect(x.state.cash).not.toBe(y.state.cash);
  });
});

describe("métricas e promoção", () => {
  it("capital inicial é 10.000 USDT", () => {
    expect(INITIAL_CAPITAL).toBe(10_000);
  });

  it("drawdown máximo mede a maior queda desde um pico", () => {
    expect(
      maxDrawdown(100, [
        { t: 1, equity: 120 },
        { t: 2, equity: 90 },
        { t: 3, equity: 130 },
      ]),
    ).toBeCloseTo(0.25, 8);
  });

  it("consistência conta só semanas completas", () => {
    const monday = Date.UTC(2026, 10, 2);
    expect(weekStart(monday + 3 * 86_400_000)).toBe(monday);
    const week = 7 * 86_400_000;
    const eq = [
      { t: monday + 1, equity: 101 },
      { t: monday + week + 1, equity: 99 },
      { t: monday + 2 * week + 1, equity: 105 },
    ];
    const weeks = weeklyReturns(100, eq, monday + 2 * week + 10);
    expect(weeks.map((w) => w.returnPct > 0)).toEqual([true, false]);
  });

  it("limite de drawdown para promoção é 15%", () => {
    expect(PROMOTION.maxDrawdown).toBe(0.15);
  });

  it("promoção exige 90 dias de simulação", () => {
    const start = Date.UTC(2026, 0, 1);
    const m = computeMetrics({
      initialCapital: 100,
      currentEquity: 110,
      equity: [],
      feesPaid: 0,
      closedTrades: 0,
      startedAt: start,
      now: start + 89 * 86_400_000,
    });
    expect(m.promotion.criteria.find((c) => c.id === "prazo")!.ok).toBe(false);
  });

  it("drawdown de 15% ou mais reprova o critério", () => {
    const start = Date.UTC(2026, 0, 1);
    const m = computeMetrics({
      initialCapital: 100,
      currentEquity: 110,
      equity: [{ t: start + 1, equity: 85 }],
      feesPaid: 0,
      closedTrades: 0,
      startedAt: start,
      now: start + 100 * 86_400_000,
    });
    expect(m.promotion.criteria.find((c) => c.id === "drawdown")!.ok).toBe(false);
  });

  it("semanas positivas precisam ser pelo menos 60%", () => {
    expect(PROMOTION.minPositiveWeeks).toBe(0.6);
  });

  it("ranking não premia só retorno", () => {
    const rows = [
      {
        id: "a",
        name: "Arriscado",
        initialCapital: 100,
        returnPct: 0.3,
        maxDrawdownPct: 0.4,
        weeklyConsistencyPct: 0.3,
        feesPaid: 30,
      },
      {
        id: "b",
        name: "Estável",
        initialCapital: 100,
        returnPct: 0.1,
        maxDrawdownPct: 0.05,
        weeklyConsistencyPct: 0.7,
        feesPaid: 2,
      },
    ];
    expect(rankAgents(rows)[0]!.id).toBe("b");
  });
});
