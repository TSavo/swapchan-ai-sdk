import { z } from "zod";
import { SwapChanClient, chainId, fromBaseUnits, toBaseUnits } from "./client.js";

/** Framework-agnostic tool definitions shared by the AI SDK and LangChain adapters. */
export interface ToolSpec {
  name: string;
  description: string;
  schema: z.ZodObject<any>;
  run: (c: SwapChanClient, input: any) => Promise<unknown>;
}

const chain = z.union([z.string(), z.number()]).describe('Chain name ("base", "solana") or numeric chain id');
const SAFETY = "SwapChan never holds keys. Show the tx to the user and sign only with their wallet.";

async function quoteInput(c: SwapChanClient, i: any) {
  const fromChainId = chainId(i.fromChain), toChainId = chainId(i.toChain ?? i.fromChain);
  const [from, to] = await Promise.all([c.resolveToken(fromChainId, i.fromToken), c.resolveToken(toChainId, i.toToken)]);
  return {
    from, to,
    p: { fromChainId, toChainId, fromToken: from.address, toToken: to.address, amount: toBaseUnits(i.amount, from.decimals),
      slippageBps: i.slippageBps, fromAddress: i.fromAddress, toAddress: i.toAddress, partner: i.partner },
  };
}
const slim = (q: any, to: { decimals: number; symbol: string }) => ({
  quoteId: q.id, provider: q.provider, toAmount: fromBaseUnits(q.toAmount, to.decimals), toAmountMin: fromBaseUnits(q.toAmountMin, to.decimals),
  symbol: to.symbol, gasUsd: q.gasUsd, feeUsd: q.feeUsd, netUsd: q.netUsd, etaSeconds: q.etaSeconds, verified: q.verified, swapUrl: q.swapUrl,
});

const quoteSchema = z.object({
  fromChain: chain, toChain: chain.optional().describe("Destination chain; defaults to fromChain"),
  fromToken: z.string().describe("Symbol (ETH, USDC) or contract address/mint"), toToken: z.string(),
  amount: z.string().describe('Human amount of fromToken, e.g. "1.5"'),
  fromAddress: z.string().optional().describe("Wallet that will sign (improves quote accuracy)"),
  toAddress: z.string().optional(), slippageBps: z.number().int().min(1).max(5000).optional(),
  partner: z.string().optional().describe("SwapChan partner id (earns 5 bp); defaults to the configured one"),
});

export const SPECS: ToolSpec[] = [
  { name: "swapchan_get_quotes", description: "Best-price swap/bridge quotes across every aggregator and bridge (Jupiter, 1inch, 0x, CoW, LI.FI, Relay, KyberSwap, Velora, Across, deBridge, THORChain), ranked best-first net of gas and fees.",
    schema: quoteSchema,
    run: async (c, i) => { const { p, to } = await quoteInput(c, i); const r = await c.quotes(p);
      return { best: r.best, quotes: r.quotes.slice(0, 8).map((q) => slim(q, to)), errors: r.errors }; } },
  { name: "swapchan_build_swap_tx", description: `Build the unsigned transaction for a quoteId. The server decodes and verifies it (router allowlist, recipient, minOut, capped approvals); unverified transactions are never returned. ${SAFETY}`,
    schema: z.object({ quoteId: z.string(), taker: z.string().describe("Address that will sign"), recipient: z.string().optional() }),
    run: (c, i) => c.build(i.quoteId, i.taker, i.recipient) },
  { name: "swapchan_swap_status", description: "Status of a submitted swap or bridge.",
    schema: z.object({ provider: z.string(), txHash: z.string(), fromChain: chain, toChain: chain }),
    run: (c, i) => c.status({ provider: i.provider, txHash: i.txHash, fromChainId: chainId(i.fromChain), toChainId: chainId(i.toChain) }) },
  { name: "swapchan_list_chains", description: "Chains SwapChan supports.", schema: z.object({}), run: (c) => c.chains() },
  { name: "swapchan_resolve_token", description: "Resolve a token symbol or address to address+decimals on a chain.",
    schema: z.object({ chain, token: z.string() }), run: (c, i) => c.resolveToken(chainId(i.chain), i.token) },
  { name: "swapchan_wallet_balances", description: "Native and token balances for a wallet across chains (read-only).",
    schema: z.object({ address: z.string(), chains: z.array(chain).optional() }),
    run: (c, i) => c.onchain("/balances", { address: i.address, chains: i.chains?.map(chainId).join(",") }) },
  { name: "swapchan_token_approvals", description: "ERC-20 approvals an owner has granted on a chain, with risk flags.",
    schema: z.object({ owner: z.string(), chain }), run: (c, i) => c.onchain("/approvals", { owner: i.owner, chainId: chainId(i.chain) }) },
  { name: "swapchan_revoke_approval_tx", description: `Unsigned tx that revokes a token approval. ${SAFETY}`,
    schema: z.object({ chain, token: z.string(), spender: z.string() }),
    run: (c, i) => c.onchain("/revoke", { chainId: chainId(i.chain), token: i.token, spender: i.spender }) },
  { name: "swapchan_explain_tx", description: "Decode and explain a transaction by hash.",
    schema: z.object({ chain, hash: z.string() }), run: (c, i) => c.onchain("/tx", { chainId: chainId(i.chain), hash: i.hash }) },
  { name: "swapchan_gas", description: "Current gas prices.", schema: z.object({ chains: z.array(chain).optional() }),
    run: (c, i) => c.onchain("/gas", { chains: i.chains?.map(chainId).join(",") }) },
  { name: "swapchan_token_info", description: "On-chain token metadata and risk scan.",
    schema: z.object({ chain, address: z.string() }), run: (c, i) => c.onchain("/token", { chainId: chainId(i.chain), address: i.address }) },
  { name: "swapchan_resolve_name", description: "Resolve ENS/SNS names to addresses, or reverse-resolve an address.",
    schema: z.object({ q: z.string() }), run: (c, i) => c.onchain("/name", { q: i.q }) },
  { name: "swapchan_yields", description: "Top DeFi yields (DefiLlama) for an asset; SwapChan can swap you into the underlying.",
    schema: z.object({ asset: z.string().optional(), chain: chain.optional(), minTvlUsd: z.number().optional(), stablecoinOnly: z.boolean().optional(), limit: z.number().int().max(50).optional() }),
    run: (c, i) => c.onchain("/yields", { asset: i.asset, chainId: i.chain === undefined ? undefined : chainId(i.chain), minTvlUsd: i.minTvlUsd, stablecoinOnly: i.stablecoinOnly, limit: i.limit }) },
];
