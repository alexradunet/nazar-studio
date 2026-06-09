// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import memory from "./memory.ts";

// Redirect the vault (and its disposable SQLite index) to a throwaway dir.
beforeEach(() => { process.env.VAULT_PATH = mkdtempSync(join(tmpdir(), "nazar-memext-")); });

function fakePi() {
  const tools: any[] = [];
  const handlers: Record<string, any> = {};
  return {
    pi: {
      registerTool: (t: any) => tools.push(t),
      on: (n: string, h: any) => { handlers[n] = h; },
      log() {},
    } as any,
    tools,
    handlers,
  };
}

test("memory extension registers the memory + skill tools and recall hooks", () => {
  const { pi, tools, handlers } = fakePi();
  memory(pi);
  expect(tools.map((t) => t.name).sort()).toEqual(
    ["memory_duplicates", "memory_get", "memory_search", "memory_write", "skill_write"],
  );
  expect(typeof handlers.session_start).toBe("function");
  expect(typeof handlers.before_agent_start).toBe("function");
});

test("memory_write persists a page that memory_search then recalls", async () => {
  const { pi, tools } = fakePi();
  memory(pi);
  const write = tools.find((t) => t.name === "memory_write");
  const search = tools.find((t) => t.name === "memory_search");
  await write.execute("id", { title: "Trip", content: "book trains to Cluj" });
  const res = await search.execute("id", { query: "trains" });
  expect(res.details.hits.some((h: any) => h.title === "Trip")).toBe(true);
});

test("recall augments every turn, frontier and local alike", async () => {
  const { pi, tools, handlers } = fakePi();
  memory(pi);
  await tools.find((t) => t.name === "memory_write")
    .execute("id", { title: "Pinned", content: "always-on fact", pinned: true });

  // Gate dropped: recall now fires for all models (owner decision). Both turns get the memory.
  for (const baseUrl of ["https://api.openai.com/v1", "http://127.0.0.1:8082/v1"]) {
    const res = await handlers.before_agent_start(
      { prompt: "anything", systemPrompt: "S" },
      { model: { baseUrl } },
    );
    expect(res?.systemPrompt).toContain("S");
    expect(res?.systemPrompt).toContain("Pinned");
  }
});
