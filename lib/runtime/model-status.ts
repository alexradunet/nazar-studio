// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { Model } from "@earendil-works/pi-ai";
import { runtimeEnv } from "../env.ts";
import { modelsDir } from "../paths.ts";
import { DEFAULT_BALAUR_LLAMA_CPP_MODEL_REF, isBalaurLlamaCppModel } from "./llama-cpp-provider.ts";
import { resolveBalaurModel } from "./agent-engine.ts";

export interface LocalModelCacheStatus {
  cacheDir: string;
  complete: boolean;
  partial: boolean;
  matches: string[];
  partialMatches: string[];
}

export interface BalaurModelStatus {
  ref: string;
  model: Model<any>;
  local: boolean;
  cache?: LocalModelCacheStatus;
  needsDownload: boolean;
}

function normalizeNeedle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function stripGgufSuffix(value: string): string {
  return value.replace(/-?gguf$/i, "");
}

function needlesForModelUri(modelUri: string): string[] {
  if (modelUri.startsWith("hf:")) {
    const [, repo = "", selector = ""] = modelUri.split(":");
    const repoName = stripGgufSuffix(basename(repo));
    return [repoName, selector].map(normalizeNeedle).filter(Boolean);
  }
  return [basename(modelUri, ".gguf")].map(normalizeNeedle).filter(Boolean);
}

function scanFiles(root: string, maxFiles = 2000): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0 && out.length < maxFiles) {
    const dir = stack.pop()!;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else out.push(path);
      if (out.length >= maxFiles) break;
    }
  }
  return out;
}

function fileMatchesNeedles(path: string, needles: string[]): boolean {
  const haystack = normalizeNeedle(basename(path));
  return needles.every((needle) => haystack.includes(needle));
}

export function localModelCacheStatus(modelUri: string, cacheDir = modelsDir()): LocalModelCacheStatus {
  if (modelUri.endsWith(".gguf") && existsSync(modelUri) && statSync(modelUri).isFile()) {
    return { cacheDir, complete: true, partial: false, matches: [modelUri], partialMatches: [] };
  }

  const needles = needlesForModelUri(modelUri);
  const files = scanFiles(cacheDir);
  const matches = files.filter((path) => path.endsWith(".gguf") && fileMatchesNeedles(path, needles));
  const partialMatches = files.filter((path) => path.endsWith(".ipull") && fileMatchesNeedles(path, needles));
  return { cacheDir, complete: matches.length > 0, partial: partialMatches.length > 0, matches, partialMatches };
}

export function getBalaurModelStatus(env: NodeJS.ProcessEnv = runtimeEnv(), cacheDir = modelsDir()): BalaurModelStatus {
  const ref = env.BALAUR_MODEL ?? DEFAULT_BALAUR_LLAMA_CPP_MODEL_REF;
  const model = resolveBalaurModel(ref);
  const local = isBalaurLlamaCppModel(model);
  const cache = local ? localModelCacheStatus(model.id, cacheDir) : undefined;
  return {
    ref,
    model,
    local,
    cache,
    needsDownload: local && cache?.complete !== true,
  };
}

export function formatBalaurModelStatus(status: BalaurModelStatus): string {
  const lines = [`Model · ${status.ref}`, `Provider · ${status.model.provider}`];
  if (!status.local) return lines.join("\n");

  lines.push(`Local cache · ${status.cache?.complete ? "ready" : status.cache?.partial ? "partial download" : "not found"}`);
  if (status.needsDownload) {
    lines.push("Local model download is required before chat can continue. Set BALAUR_MODEL to another provider to skip the local download.");
  }
  return lines.join("\n");
}
