import { describe, expect, it } from "vitest";
import { SwapChanClient, UnverifiedTxError, swapchanTools, toBaseUnits } from "../src/index.js";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
const opts = { toolCallId: "t", messages: [] } as any;
const mock = (b: unknown, status = 200) => { const calls: any[] = []; return { calls, fetch: (async (u: any, i: any) => { calls.push([String(u), i]); return json(b, status); }) as typeof fetch }; };

describe("swapchanTools", () => {
  it("exposes all tools", () => {
    const t = swapchanTools();
    expect(Object.keys(t)).toContain("swapchan_build_swap_tx");
    expect(Object.keys(t).length).toBe(13);
  });
  it("converts amounts", () => expect(toBaseUnits("1.5", 6)).toBe("1500000"));

  it("returns verified builds", async () => {
    const m = mock({ chainId: 1, to: "0xr", data: "0x", value: "0", verified: true, verification: { level: "full" } });
    const t = swapchanTools({ fetch: m.fetch });
    const r: any = await t.swapchan_build_swap_tx.execute!({ quoteId: "q", taker: "0xabc" }, opts);
    expect(r.verified).toBe(true);
    expect(JSON.parse(m.calls[0][1].body)).toEqual({ quoteId: "q", taker: "0xabc" });
  });
  it("refuses builds without verified === true", async () => {
    for (const b of [{ to: "0xr", data: "0x" }, { to: "0xr", verified: false }]) {
      const t = swapchanTools({ fetch: mock(b).fetch });
      await expect(t.swapchan_build_swap_tx.execute!({ quoteId: "q", taker: "0xabc" }, opts)).rejects.toBeInstanceOf(UnverifiedTxError);
    }
  });
  it("maps server verification failure (502 verified:false)", async () => {
    const c = new SwapChanClient({ fetch: mock({ error: "no route passed payload verification", verified: false }, 502).fetch });
    await expect(c.build("q", "0xabc")).rejects.toBeInstanceOf(UnverifiedTxError);
  });
  it("passes partner id to quotes", async () => {
    const m = mock({ quotes: [], best: null, errors: [] });
    const c = new SwapChanClient({ fetch: m.fetch, partner: "p1" });
    await c.quotes({ fromChainId: 1, toChainId: 1, fromToken: "a", toToken: "b", amount: "1" });
    expect(m.calls[0][0]).toContain("partner=p1");
  });
});

describe("live API", () => {
  it("quotes 0.1 ETH -> USDC on Ethereum", async () => {
    const t = swapchanTools();
    const r: any = await t.swapchan_get_quotes.execute!({ fromChain: "ethereum", fromToken: "ETH", toToken: "USDC", amount: "0.1",
      fromAddress: "0xeb0eC7a28E4B6B175806E21D9D3afE45792C5c7B" }, opts);
    expect(r.quotes.length).toBeGreaterThan(0);
    expect(Number(r.quotes[0].toAmount)).toBeGreaterThan(50);
  }, 40_000);
  it("reads gas", async () => {
    const r: any = await swapchanTools().swapchan_gas.execute!({ chains: ["base"] }, opts);
    expect(r).toBeTruthy();
  }, 30_000);
});
