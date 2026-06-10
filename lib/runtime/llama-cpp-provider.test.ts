// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "bun:test";
import { Type } from "@earendil-works/pi-ai";
import {
  assertBalaurLlamaCppRam,
  DEFAULT_BALAUR_LLAMA_CPP_MODEL_URI,
  BALAUR_LLAMA_CPP_API,
  BALAUR_LLAMA_CPP_PROVIDER,
  llamaChatHistoryFromContext,
  llamaFunctionsFromTools,
  resolveBalaurLlamaCppContextSize,
  resolveBalaurLlamaCppMaxTokens,
} from "./llama-cpp-provider.ts";
import { resolveBalaurModel } from "./agent-engine.ts";

test("defaults Balaur to the local Granite llama.cpp model", () => {
  const model = resolveBalaurModel();
  expect(model.provider).toBe(BALAUR_LLAMA_CPP_PROVIDER);
  expect(model.api).toBe(BALAUR_LLAMA_CPP_API);
  expect(model.id).toBe(DEFAULT_BALAUR_LLAMA_CPP_MODEL_URI);
});

test("enforces the 16GB local model RAM floor", () => {
  expect(() => assertBalaurLlamaCppRam(16 * 1000 ** 3)).not.toThrow();
  expect(() => assertBalaurLlamaCppRam(12 * 1000 ** 3)).toThrow(/requires at least 16GB RAM/);
});

test("resolves llama.cpp context size from env", () => {
  expect(resolveBalaurLlamaCppContextSize({})).toBe(131072);
  expect(resolveBalaurLlamaCppContextSize({ BALAUR_LLAMA_CPP_CONTEXT_SIZE: "auto" })).toBe("auto");
  expect(resolveBalaurLlamaCppContextSize({ BALAUR_LLAMA_CPP_CONTEXT_SIZE: "16384" })).toBe(16384);
  expect(() => resolveBalaurLlamaCppContextSize({ BALAUR_LLAMA_CPP_CONTEXT_SIZE: "0" })).toThrow(/positive integer/);
});

test("resolves llama.cpp generation token cap from env", () => {
  expect(resolveBalaurLlamaCppMaxTokens({})).toBe(2048);
  expect(resolveBalaurLlamaCppMaxTokens({ BALAUR_LLAMA_CPP_MAX_TOKENS: "64" })).toBe(64);
  expect(() => resolveBalaurLlamaCppMaxTokens({ BALAUR_LLAMA_CPP_MAX_TOKENS: "auto" })).toThrow(/positive integer/);
});

test("converts runtime tools to llama.cpp function definitions", () => {
  const functions = llamaFunctionsFromTools([{ name: "vault_search", description: "Search vault", parameters: Type.Object({ query: Type.String() }) }]);
  expect(functions?.vault_search.description).toBe("Search vault");
  expect(functions?.vault_search.params).toMatchObject({ type: "object", properties: { query: { type: "string" } } });
});

test("converts runtime context to llama.cpp chat history with tool results", () => {
  const history = llamaChatHistoryFromContext({
    systemPrompt: "You are Balaur.",
    messages: [
      { role: "user", content: "remember this", timestamp: 1 },
      {
        role: "assistant",
        api: "balaur-llama-cpp",
        provider: "llama-cpp",
        model: DEFAULT_BALAUR_LLAMA_CPP_MODEL_URI,
        content: [
          { type: "text", text: "Checking." },
          { type: "toolCall", id: "call-1", name: "vault_search", arguments: { query: "this" } },
        ],
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: "toolUse",
        timestamp: 2,
      },
      { role: "toolResult", toolCallId: "call-1", toolName: "vault_search", content: [{ type: "text", text: "found" }], details: { matches: 1 }, isError: false, timestamp: 3 },
      { role: "user", content: [{ type: "text", text: "continue" }], timestamp: 4 },
    ],
  });

  expect(history).toEqual([
    { type: "system", text: "You are Balaur." },
    { type: "user", text: "remember this" },
    { type: "model", response: ["Checking.", { type: "functionCall", name: "vault_search", params: { query: "this" }, result: { matches: 1 } }] },
    { type: "user", text: "continue" },
    { type: "model", response: [] },
  ]);
});
