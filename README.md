# swapchan-ai-sdk

[Vercel AI SDK](https://ai-sdk.dev) tools for [SwapChan](https://swapchan.com): best-price same-chain and cross-chain swap quotes across every DEX aggregator and bridge (Jupiter, 1inch, 0x, CoW, LI.FI, Relay, KyberSwap, Velora, Across, deBridge, THORChain), server-verified unsigned transactions, and free chain readers. No API key.

```bash
npm i swapchan-ai-sdk ai zod
```

```ts
import { generateText, isStepCount } from "ai";
import { openai } from "@ai-sdk/openai";
import { swapchanTools } from "swapchan-ai-sdk";

const { text } = await generateText({
  model: openai("gpt-5"),
  tools: swapchanTools({ partner: "your-partner-id" }),
  stopWhen: isStepCount(5),
  prompt: "What's the best price to swap 1 ETH on Base to USDC on Arbitrum?",
});
```

## Tools

| Tool | What it does |
| --- | --- |
| `swapchan_get_quotes` | Ranked quotes across every aggregator and bridge (human amounts, symbols or addresses) |
| `swapchan_build_swap_tx` | Unsigned tx for a quote; **only returned if the server verified it** |
| `swapchan_swap_status` | Track a submitted swap or bridge |
| `swapchan_list_chains`, `swapchan_resolve_token` | Chains and token lookup |
| `swapchan_wallet_balances`, `swapchan_token_approvals`, `swapchan_revoke_approval_tx` | Wallet reads and approval revokes |
| `swapchan_explain_tx`, `swapchan_gas`, `swapchan_token_info`, `swapchan_resolve_name`, `swapchan_yields` | Chain readers |

## Safety

SwapChan never holds keys. `swapchan_build_swap_tx` returns an unsigned transaction for the user's own wallet. Before returning it, the SwapChan server decodes the calldata and checks the router/spender is on a per-chain allowlist, the recipient is the user, minOut matches the quote, and approvals are capped at the sell amount. The response carries `verified` and `verification`; this package throws `UnverifiedTxError` and returns nothing unless `verified === true`.

## Make money with SwapChan

Register a partner id at [swapchan.com/partners](https://swapchan.com/partners) (or `POST https://api.swapchan.com/partners`) and pass it as `swapchanTools({ partner })` or per call. You earn **5 bp (half of SwapChan's 0.1% fee) on every swap your agent routes**, so $1M of routed volume pays $500 to your wallet. Details: [swapchan.com/earn](https://swapchan.com/earn).

## Also

- MCP server: `https://mcp.swapchan.com/mcp` ([docs](https://swapchan.com/agents))
- LangChain: [langchain-swapchan](https://github.com/TSavo/langchain-swapchan)
- ElizaOS: [elizaos-plugin-swapchan](https://github.com/TSavo/plugin-swapchan)

## Tests

`npm test` runs mocked build/verification tests and live quote calls against api.swapchan.com.

MIT
