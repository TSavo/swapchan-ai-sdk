/** Minimal client for the public SwapChan HTTP API (https://api.swapchan.com). No API key required. */
export const DEFAULT_BASE_URL = "https://api.swapchan.com";
export const NATIVE_EVM = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

export interface SwapChanClientOptions {
  baseUrl?: string;
  /** SwapChan partner id: earns you 5 bp of routed volume. Register at https://swapchan.com/partners */
  partner?: string;
  apiKey?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export class SwapChanError extends Error {
  constructor(readonly status: number, message: string, readonly body?: unknown) {
    super(message);
    this.name = "SwapChanError";
  }
}

export interface TokenInfo { chainId: number; address: string; symbol: string; decimals: number; name?: string }

export const CHAIN_IDS: Record<string, number> = {
  ethereum: 1, eth: 1, mainnet: 1, optimism: 10, op: 10, bnb: 56, bsc: 56, polygon: 137, matic: 137,
  base: 8453, arbitrum: 42161, arb: 42161, avalanche: 43114, avax: 43114, solana: 792703809, sol: 792703809,
};

export function chainId(c: string | number): number {
  if (typeof c === "number") return c;
  if (/^\d+$/.test(c)) return Number(c);
  const id = CHAIN_IDS[c.trim().toLowerCase()];
  if (id === undefined) throw new Error(`Unknown chain "${c}"; pass a numeric chain id (see list_chains)`);
  return id;
}

export function toBaseUnits(amount: string | number, decimals: number): string {
  const s = String(amount).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`Invalid amount: ${amount}`);
  const [whole, frac = ""] = s.split(".");
  if (frac.length > decimals) throw new Error(`Too many decimals for token (max ${decimals})`);
  return BigInt(whole + frac.padEnd(decimals, "0")).toString();
}

export function fromBaseUnits(amount: string, decimals: number): string {
  const v = BigInt(amount).toString().padStart(decimals + 1, "0");
  const whole = v.slice(0, v.length - decimals);
  const frac = decimals ? v.slice(-decimals).replace(/0+$/, "") : "";
  return frac ? `${whole}.${frac}` : whole;
}

/** Thrown when the server did not positively verify a built transaction. The tx is never returned. */
export class UnverifiedTxError extends SwapChanError {
  constructor(body: unknown) {
    super(502, "SwapChan did not verify this transaction (verified !== true); refusing to return it", body);
    this.name = "UnverifiedTxError";
  }
}

export class SwapChanClient {
  readonly baseUrl: string;
  readonly partner?: string;
  private tokenCache = new Map<number, TokenInfo[]>();
  constructor(private readonly opts: SwapChanClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.partner = opts.partner || undefined;
  }

  async req<T = any>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (init?.body !== undefined) headers["content-type"] = "application/json";
    if (this.opts.apiKey) headers["x-api-key"] = this.opts.apiKey;
    const res = await (this.opts.fetch ?? fetch)(`${this.baseUrl}${path}`, {
      method: init?.method ?? "GET",
      headers,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(this.opts.timeoutMs ?? 25_000),
    });
    const text = await res.text();
    let body: any;
    try { body = text ? JSON.parse(text) : undefined; } catch {
      throw new SwapChanError(res.status, `SwapChan API returned non-JSON (HTTP ${res.status})`);
    }
    if (!res.ok) throw new SwapChanError(res.status, body?.error ?? `HTTP ${res.status}`, body);
    return body as T;
  }

  private qs(o: Record<string, unknown>) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
    return q.toString();
  }

  async resolveToken(chain: number, symbolOrAddress: string): Promise<TokenInfo> {
    const s = symbolOrAddress.trim();
    let list = this.tokenCache.get(chain);
    if (!list) { list = await this.req<TokenInfo[]>(`/tokens?chainId=${chain}`); this.tokenCache.set(chain, list); }
    const hit = list.find((t) => t.address.toLowerCase() === s.toLowerCase() || t.symbol.toLowerCase() === s.toLowerCase());
    if (hit) return hit;
    if (/^(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(s)) return this.req<TokenInfo>(`/token?${this.qs({ chainId: chain, address: s })}`);
    throw new Error(`Unknown token "${s}" on chain ${chain}; pass its contract address/mint`);
  }

  /** All quotes ranked best-first. `amount` is base units. */
  quotes(p: { fromChainId: number; toChainId: number; fromToken: string; toToken: string; amount: string; slippageBps?: number; fromAddress?: string; toAddress?: string; partner?: string }) {
    return this.req<{ quotes: any[]; best: string | null; errors: { provider: string; message: string }[] }>(
      `/quotes?${this.qs({ ...p, partner: p.partner ?? this.partner })}`,
    );
  }

  /** Unsigned tx for a quote id. Throws UnverifiedTxError unless the server returned verified === true. */
  async build(quoteId: string, taker: string, recipient?: string) {
    let out: any;
    try {
      out = await this.req("/build", { method: "POST", body: { quoteId, taker, ...(recipient ? { recipient } : {}) } });
    } catch (e) {
      if (e instanceof SwapChanError && (e.body as any)?.verified === false) throw new UnverifiedTxError(e.body);
      throw e;
    }
    if (!out || out.verified !== true) throw new UnverifiedTxError(out);
    return out;
  }

  status(p: { provider: string; txHash: string; fromChainId: number; toChainId: number }) {
    return this.req(`/status?${this.qs(p)}`);
  }
  chains() { return this.req("/chains"); }
  onchain(path: string, q: Record<string, unknown> = {}) { return this.req(`/onchain${path}?${this.qs(q)}`); }
}
