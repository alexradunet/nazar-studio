// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Model } from "@earendil-works/pi-ai";
import { getModels, getProviders } from "@earendil-works/pi-ai";
import { runtimeEnv } from "../env.ts";
import { resolveBalaurModel } from "./agent-engine.ts";
import { DEFAULT_SYNTHETIC_MODEL_REF } from "./synthetic-provider.ts";

const MODEL_CATALOG_SAMPLE_SIZE = 3;

export interface BalaurModelCatalogEntry {
  provider: string;
  count: number;
  examples: string[];
}

export interface BalaurModelCatalog {
  totalModels: number;
  providers: BalaurModelCatalogEntry[];
}

export interface BalaurModelStatus {
  ref: string;
  model: Model<any>;
}

export function getBalaurModelStatus(env: NodeJS.ProcessEnv = runtimeEnv()): BalaurModelStatus {
  const ref = env.BALAUR_MODEL ?? DEFAULT_SYNTHETIC_MODEL_REF;
  return { ref, model: resolveBalaurModel(ref) };
}

export function getBalaurModelCatalog(sampleSize = MODEL_CATALOG_SAMPLE_SIZE): BalaurModelCatalog {
  const providers = getProviders().sort().map((provider) => {
    const models = getModels(provider);
    const ids = models.map((model) => model.id).sort();
    return {
      provider,
      count: ids.length,
      examples: ids.slice(0, sampleSize),
    };
  });
  const totalModels = providers.reduce((sum, provider) => sum + provider.count, 0);
  return { providers, totalModels };
}

export function formatBalaurModelStatus(status: BalaurModelStatus): string {
  const catalog = getBalaurModelCatalog(0);
  const providerNames = catalog.providers.map((entry) => entry.provider).join(", ");
  return [
    `Model · ${status.ref}`,
    `Provider · ${status.model.provider}`,
    `Endpoint · ${status.model.baseUrl}`,
    `Available providers (${catalog.providers.length}) · ${providerNames}`,
    `Available pi-ai models · ${catalog.totalModels}`,
  ].join("\n");
}

export function formatBalaurModelCatalog(catalog: BalaurModelCatalog): string {
  const providerSummary = catalog.providers
    .map((entry) => {
      const examples = entry.examples.join(", ");
      const remainder = entry.count - entry.examples.length;
      const hasMore = remainder > 0 ? ` (+${remainder} more)` : "";
      const shown = examples ? ` [${examples}${hasMore}]` : "";
      return `- ${entry.provider} (${entry.count})${shown}`;
    })
    .join("\n");
  return [`Available models from pi-ai: ${catalog.totalModels}`, providerSummary].join("\n");
}
