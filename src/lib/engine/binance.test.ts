import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPrices, HOSTS } from "./binance";

afterEach(() => vi.unstubAllGlobals());

describe("leitura da Binance", () => {
  it("quando um endereço responde 403, tenta o próximo", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      if (url.startsWith(HOSTS[0])) return new Response("bloqueado", { status: 403 });
      return Response.json([{ symbol: "BTCUSDT", price: "70000" }]);
    });
    expect(await fetchPrices(["BTCUSDT"])).toEqual({ BTCUSDT: 70000 });
    expect(calls[1]!.startsWith(HOSTS[1])).toBe(true);
  });

  it("se todos falharem, o erro lista cada endereço", async () => {
    vi.stubGlobal("fetch", async () => new Response("x", { status: 403 }));
    const err = await fetchPrices(["BTCUSDT"]).catch((e: Error) => e.message);
    for (const h of HOSTS) expect(err).toContain(`${new URL(h).host} 403`);
  });
});
