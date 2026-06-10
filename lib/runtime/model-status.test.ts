// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { expect, test } from "bun:test";
import { DEFAULT_BALAUR_LLAMA_CPP_MODEL_REF, DEFAULT_BALAUR_LLAMA_CPP_MODEL_URI } from "./llama-cpp-provider.ts";
import { formatBalaurModelStatus, getBalaurModelStatus, localModelCacheStatus } from "./model-status.ts";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "balaur-model-status-"));
}

test("detects missing, partial, and complete llama.cpp model cache files", () => {
  const root = tempDir();
  expect(localModelCacheStatus(DEFAULT_BALAUR_LLAMA_CPP_MODEL_URI, root)).toMatchObject({ complete: false, partial: false });

  writeFileSync(join(root, "hf_bartowski_granite-3.1-8b-instruct.Q4_K_M.gguf.ipull"), "partial");
  expect(localModelCacheStatus(DEFAULT_BALAUR_LLAMA_CPP_MODEL_URI, root)).toMatchObject({ complete: false, partial: true });

  mkdirSync(join(root, "llm"));
  writeFileSync(join(root, "llm", "hf_bartowski_granite-3.1-8b-instruct.Q4_K_M.gguf"), "complete");
  expect(localModelCacheStatus(DEFAULT_BALAUR_LLAMA_CPP_MODEL_URI, root)).toMatchObject({ complete: true, partial: true });
});

test("formats local model status with startup download hint", () => {
  const root = tempDir();
  const status = getBalaurModelStatus({ BALAUR_MODEL: DEFAULT_BALAUR_LLAMA_CPP_MODEL_REF }, root);
  const text = formatBalaurModelStatus(status);

  expect(status.needsDownload).toBe(true);
  expect(text).toContain("Model · llama-cpp/");
  expect(text).toContain("download is required");
});
