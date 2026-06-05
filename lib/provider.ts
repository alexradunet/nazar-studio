// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * provider.ts — build the local llamafile provider config for pi.registerProvider().
 *
 * This replaces the old seed-pi-config.sh step that copied models.json into ~/.pi/agent.
 * Now the provider + models are registered IN-PROCESS by extensions/local-llm.ts, so the
 * package is self-contained: `pi install npm:pi-nazar-studio` is enough — nothing is hand-seeded.
 *
 * models.json (bundled with the package) stays the human-editable source of truth for the
 * model catalog; this reads it at runtime and injects the live API key. The shape mirrors
 * the provider entry Pi already consumed from models.json.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { packageRoot } from "./paths.ts";

export interface ProviderConfig {
  baseUrl: string;
  api: string;
  apiKey: string;
  compat?: Record<string, unknown>;
  models: Array<Record<string, unknown>>;
}

const FALLBACK: ProviderConfig = {
  baseUrl: "http://127.0.0.1:8082/v1",
  api: "openai-completions",
  apiKey: "$LLAMA_LOCAL_KEY",
  compat: {
    supportsDeveloperRole: false,
    supportsReasoningEffort: false,
    supportsUsageInStreaming: false,
    supportsStrictMode: false,
    supportsStore: false,
    maxTokensField: "max_tokens",
  },
  models: [
    {
      id: "lfm2.5-8b-a1b",
      reasoning: false,
      contextWindow: 32768,
      maxTokens: 8192,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    },
  ],
};

/**
 * Read the bundled models.json llamafile provider entry, falling back to a built-in default,
 * then inject the live runtime API key (never the literal "$LLAMA_LOCAL_KEY").
 */
export function llamafileProviderConfig(opts: { apiKey: string; baseUrl?: string }): ProviderConfig {
  let base: ProviderConfig = FALLBACK;
  try {
    const raw = JSON.parse(readFileSync(join(packageRoot(), "models.json"), "utf8")) as {
      providers?: { llamafile?: ProviderConfig };
    };
    const p = raw?.providers?.llamafile;
    if (p && Array.isArray(p.models) && p.models.length) base = p;
  } catch {
    /* bundled models.json missing or malformed — use the built-in fallback */
  }
  const cfg: ProviderConfig = {
    ...base,
    baseUrl: opts.baseUrl || base.baseUrl,
    apiKey: opts.apiKey,
  };
  return cfg;
}
