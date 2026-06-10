// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Model } from "@earendil-works/pi-ai";

export const SYNTHETIC_PROVIDER = "synthetic";
export const SYNTHETIC_API = "openai-completions";
export const SYNTHETIC_BASE_URL = "https://api.synthetic.new/openai/v1";
export const DEFAULT_SYNTHETIC_MODEL_ID = "syn:large:text";
export const DEFAULT_SYNTHETIC_MODEL_REF = `${SYNTHETIC_PROVIDER}/${DEFAULT_SYNTHETIC_MODEL_ID}`;

export function createSyntheticModel(modelId = DEFAULT_SYNTHETIC_MODEL_ID): Model<"openai-completions"> {
  const isDefault = modelId === DEFAULT_SYNTHETIC_MODEL_ID;
  return {
    id: modelId,
    name: isDefault ? "Synthetic Large Text" : modelId,
    api: SYNTHETIC_API,
    provider: SYNTHETIC_PROVIDER as never,
    baseUrl: SYNTHETIC_BASE_URL,
    reasoning: true,
    thinkingLevelMap: { off: null, minimal: null, low: null, medium: null, high: null, xhigh: null },
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 192000,
    maxTokens: 4096,
    compat: {
      supportsDeveloperRole: false,
      supportsUsageInStreaming: false,
      supportsStrictMode: false,
      supportsStore: false,
      maxTokensField: "max_tokens",
    },
  };
}
