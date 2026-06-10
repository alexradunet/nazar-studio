// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { DEFAULT_BALAUR_LLAMA_CPP_MODEL_REF, DEFAULT_BALAUR_LLAMA_CPP_MODEL_URI } from "./llama-cpp-provider.ts";
import { ensureBalaurLocalModel } from "./model-download.ts";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "balaur-model-download-"));
}

function cachedModelPath(root: string): string {
  mkdirSync(join(root, "llm"), { recursive: true });
  return join(root, "llm", "hf_unsloth_gemma-4-12b-it.UD-Q4_K_XL.gguf");
}

test("skips download when the local model is cached", async () => {
  const root = tempDir();
  writeFileSync(cachedModelPath(root), "complete");

  const status = await ensureBalaurLocalModel({
    cacheDir: root,
    env: { BALAUR_MODEL: DEFAULT_BALAUR_LLAMA_CPP_MODEL_REF },
    resolveModelFile: async () => {
      throw new Error("should not download cached model");
    },
  });

  expect(status.needsDownload).toBe(false);
});

test("downloads missing local model and reports progress", async () => {
  const root = tempDir();
  const lines: string[] = [];

  const status = await ensureBalaurLocalModel({
    cacheDir: root,
    env: { BALAUR_MODEL: DEFAULT_BALAUR_LLAMA_CPP_MODEL_REF },
    onStatus: (line) => lines.push(line),
    resolveModelFile: async (modelUri, options) => {
      expect(modelUri).toBe(DEFAULT_BALAUR_LLAMA_CPP_MODEL_URI);
      options.onProgress?.({ downloadedSize: 50, totalSize: 100 });
      const path = cachedModelPath(root);
      writeFileSync(path, "complete");
      return path;
    },
  });

  expect(status.needsDownload).toBe(false);
  expect(lines).toContain("Downloading local model · 50% [##########----------] (50 B / 100 B)");
  expect(lines.at(-1)).toContain("Local model ready");
});
