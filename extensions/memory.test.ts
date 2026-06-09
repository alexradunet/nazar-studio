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

// Fake Pi UI context for memory_suggest's hybrid dialog. `choice` is the select() answer
// (a string, a fn, or undefined to simulate timeout/Esc); `inputs` feed successive input() calls.
function fakeCtx(opts: { choice?: any; inputs?: any[]; hasUI?: boolean } = {}) {
  const choice = "choice" in opts ? opts.choice : "Save";
  const inputs = opts.inputs ?? [];
  const hasUI = opts.hasUI ?? true;
  const calls: { select: any[]; input: any[]; notify: any[] } = { select: [], input: [], notify: [] };
  let i = 0;
  const ctx: any = {
    hasUI,
    ui: {
      select: async (title: string, options: string[]) => { calls.select.push({ title, options }); return typeof choice === "function" ? choice(title, options) : choice; },
      input: async (title: string, placeholder?: string) => { calls.input.push({ title, placeholder }); return inputs[i++]; },
      notify: (message: string, type?: string) => { calls.notify.push({ message, type }); },
    },
  };
  return { ctx, calls };
}

test("memory extension registers the memory + skill tools and recall hooks", () => {
  const { pi, tools, handlers } = fakePi();
  memory(pi);
  expect(tools.map((t) => t.name).sort()).toEqual(
    ["memory_duplicates", "memory_get", "memory_search", "memory_suggest", "memory_write", "skill_write"],
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

test("memory_suggest saves the proposed page when the user picks Save", async () => {
  const { pi, tools } = fakePi();
  memory(pi);
  const suggest = tools.find((t) => t.name === "memory_suggest");
  const search = tools.find((t) => t.name === "memory_search");
  const { ctx, calls } = fakeCtx({ choice: "Save" });
  const r = await suggest.execute("sug", { title: "Coffee order", content: "oat flat white, no sugar" }, undefined, undefined, ctx);
  expect(calls.select.length).toBe(1);
  expect(r.details.saved).toBe(true);
  const hits = (await search.execute("id", { query: "oat flat white" })).details.hits;
  expect(hits.some((h: any) => h.title === "Coffee order")).toBe(true);
});

test("memory_suggest does not save when the user picks Skip", async () => {
  const { pi, tools } = fakePi();
  memory(pi);
  const suggest = tools.find((t) => t.name === "memory_suggest");
  const search = tools.find((t) => t.name === "memory_search");
  const { ctx } = fakeCtx({ choice: "Skip" });
  await suggest.execute("sug", { title: "Skip me", content: "transient detail abc123" }, undefined, undefined, ctx);
  expect((await search.execute("id", { query: "transient detail abc123" })).details.hits.length).toBe(0);
});

test("memory_suggest treats a timeout/dismiss as skip (saves nothing)", async () => {
  const { pi, tools } = fakePi();
  memory(pi);
  const suggest = tools.find((t) => t.name === "memory_suggest");
  const search = tools.find((t) => t.name === "memory_search");
  const { ctx } = fakeCtx({ choice: undefined }); // select() resolves undefined
  const r = await suggest.execute("sug", { title: "Timed out", content: "no answer xyz789" }, undefined, undefined, ctx);
  expect(r.details.skipped).toBe("user");
  expect((await search.execute("id", { query: "no answer xyz789" })).details.hits.length).toBe(0);
});

test("memory_suggest applies edits before saving", async () => {
  const { pi, tools } = fakePi();
  memory(pi);
  const suggest = tools.find((t) => t.name === "memory_suggest");
  const search = tools.find((t) => t.name === "memory_search");
  const get = tools.find((t) => t.name === "memory_get");
  const { ctx } = fakeCtx({ choice: "Edit…", inputs: ["Sharpened title", "edited body uvw"] });
  await suggest.execute("sug", { title: "Rough title", content: "rough body" }, undefined, undefined, ctx);
  expect((await search.execute("id", { query: "edited body uvw" })).details.hits.some((h: any) => h.title === "Sharpened title")).toBe(true);
  expect((await get.execute("id", { title: "Rough title" })).content[0].text).toContain("No page titled");
});

test("memory_suggest offers to update an existing same-title note", async () => {
  const { pi, tools } = fakePi();
  memory(pi);
  const write = tools.find((t) => t.name === "memory_write");
  const suggest = tools.find((t) => t.name === "memory_suggest");
  const get = tools.find((t) => t.name === "memory_get");
  await write.execute("id", { title: "Deploy", content: "old deploy steps" });
  const { ctx, calls } = fakeCtx({ choice: "Update the existing note" });
  await suggest.execute("sug", { title: "Deploy", content: "new deploy notes lmnop" }, undefined, undefined, ctx);
  expect(calls.select[0].title).toContain("Update memory?");
  expect(calls.select[0].options).toContain("Update the existing note");
  expect((await get.execute("id", { title: "Deploy" })).content[0].text).toContain("new deploy notes lmnop");
});

test("memory_suggest degrades to a text nudge when there's no UI", async () => {
  const { pi, tools } = fakePi();
  memory(pi);
  const suggest = tools.find((t) => t.name === "memory_suggest");
  const search = tools.find((t) => t.name === "memory_search");
  const { ctx, calls } = fakeCtx({ hasUI: false });
  const r = await suggest.execute("sug", { title: "Headless", content: "no ui here qrst" }, undefined, undefined, ctx);
  expect(calls.select.length).toBe(0);
  expect(r.details.headless).toBe(true);
  expect((await search.execute("id", { query: "no ui here qrst" })).details.hits.length).toBe(0);
});

test("memory_suggest does not re-ask the same fact twice in one session", async () => {
  const { pi, tools } = fakePi();
  memory(pi);
  const suggest = tools.find((t) => t.name === "memory_suggest");
  const { ctx, calls } = fakeCtx({ choice: "Skip" });
  const proposal = { title: "Ask once", content: "same fact repeated" };
  await suggest.execute("sug", proposal, undefined, undefined, ctx);
  await suggest.execute("sug", proposal, undefined, undefined, ctx);
  expect(calls.select.length).toBe(1);
});
