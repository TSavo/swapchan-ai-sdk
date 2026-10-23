import { tool, type Tool } from "ai";
import { SwapChanClient, type SwapChanClientOptions } from "./client.js";
import { SPECS } from "./specs.js";
export * from "./client.js";
export { SPECS, type ToolSpec } from "./specs.js";

/**
 * SwapChan tools for the Vercel AI SDK.
 * @example const tools = swapchanTools({ partner: "my-partner-id" }); await generateText({ model, tools, prompt });
 */
export function swapchanTools(opts: SwapChanClientOptions & { client?: SwapChanClient } = {}): Record<string, Tool> {
  const client = opts.client ?? new SwapChanClient(opts);
  return Object.fromEntries(
    SPECS.map((s) => [s.name, tool({ description: s.description, inputSchema: s.schema, execute: (input: any) => s.run(client, input) } as any)]),
  );
}
