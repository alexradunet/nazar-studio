// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect, beforeEach } from "vitest";
import { mkdtempSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  writeMemory, searchMemory, getMemory, reindexMemory, recallContext, findDuplicates,
} from "./memory.ts";

beforeEach(() => { process.env.VAULT_PATH = mkdtempSync(join(tmpdir(), "nazar-mem-")); });

// ── memory pages ─────────────────────────────────────────────────────────────
test("write + keyword recall", () => {
  writeMemory({ title: "Andreea", type: "people", content: "partner; lactose-sensitive; prefers trains over cars" });
  const hits = searchMemory("lactose");
  expect(hits.length).toBe(1);
  expect(hits[0].title).toBe("Andreea");
  expect(hits[0].snippet).toContain("[lactose]");
});

test("upsert updates in place (no duplicate)", () => {
  writeMemory({ title: "Note X", content: "first" });
  writeMemory({ title: "Note X", content: "second" });
  expect(reindexMemory()).toBe(1);
  expect(getMemory("Note X")).toContain("second");
});

test("empty / whitespace query does not throw", () => {
  writeMemory({ title: "A", content: "hello world" });
  expect(() => searchMemory("")).not.toThrow();
  expect(() => searchMemory("   ")).not.toThrow();
});

test("FTS special characters never throw", () => {
  writeMemory({ title: "A", content: "hello" });
  for (const q of ['"', "* OR", 'a("b)', "NEAR(x)", "--", "'", "AND OR NOT", "()", "x*"]) {
    expect(() => searchMemory(q)).not.toThrow();
  }
});

test("Romanian diacritics slugify cleanly", () => {
  const r = writeMemory({ title: "Cătălin Ăî", type: "people", content: "z" });
  expect(r.path).toContain("/people/");
  expect(r.path.toLowerCase()).toContain("catalin");
});

test("path-traversal title is neutralized", () => {
  const r = writeMemory({ title: "../../etc/passwd", content: "z" });
  expect(r.path).not.toContain("..");
  expect(r.path).toContain("/memory/");
  expect(r.path.endsWith(".md")).toBe(true);
});

test("punctuation-only title falls back to 'note'", () => {
  const r = writeMemory({ title: "!!!", content: "z" });
  expect(r.path.endsWith("/note.md")).toBe(true);
});

test("slug collision between distinct titles is disambiguated", () => {
  const a = writeMemory({ title: "Café", content: "1" });
  const b = writeMemory({ title: "Cafe", content: "2" });
  expect(a.path).not.toBe(b.path);
  expect(reindexMemory()).toBe(2);
});

test("getMemory returns null for unknown title", () => {
  expect(getMemory("does-not-exist")).toBeNull();
});

test("body containing '---' does not break reindex/parse", () => {
  writeMemory({ title: "Dashes", content: "line one\n---\nline two more" });
  expect(reindexMemory()).toBe(1);
  expect(searchMemory("more").length).toBe(1);
});

test("reindex on empty vault returns 0 and README is skipped", () => {
  expect(reindexMemory()).toBe(0);
});

test("k limit is clamped and honored", () => {
  for (let i = 0; i < 8; i++) writeMemory({ title: `P${i}`, content: "common token apple" });
  expect(searchMemory("apple", 3).length).toBe(3);
  expect(() => searchMemory("apple", -5)).not.toThrow();
  expect(() => searchMemory("apple", 9999)).not.toThrow();
});

test("search ignores stale index rows for deleted pages", () => {
  const stale = writeMemory({ title: "Old identity", content: "stale dragon name" });
  writeMemory({ title: "Current identity", content: "current dragon name" });
  unlinkSync(stale.path);
  const hits = searchMemory("dragon name", 5);
  expect(hits.some((h) => h.title === "Old identity")).toBe(false);
  expect(hits.some((h) => h.title === "Current identity")).toBe(true);
});

// ── recall (pinned + relevant saved pages) ───────────────────────────────────
test("recallContext surfaces matching memory as notes", () => {
  writeMemory({ title: "Andreea", type: "people", content: "partner; prefers trains over cars" });
  const block = recallContext("planning a trip with Andreea");
  expect(block).toContain("[[Andreea]]");
  expect(block.toLowerCase()).toContain("from your memory");
});

test("recallContext returns '' when nothing matches and nothing pinned", () => {
  writeMemory({ title: "Z", type: "notes", content: "totally unrelated" });
  expect(recallContext("xylophone qwerty zzz")).toBe("");
});

test("whenToUse is searchable and aids recall", () => {
  writeMemory({ title: "Train booking", type: "notes", content: "the body", whenToUse: "planning rail travel in Romania" });
  expect(searchMemory("rail travel").some((h) => h.title === "Train booking")).toBe(true);
});

test("pinned pages are always recalled, even with no match", () => {
  writeMemory({ title: "Operating principles", content: "be calm and direct", pinned: true });
  const block = recallContext("something completely unrelated njqxz");
  expect(block).toContain("[[Operating principles]]");
});

// ── consolidation (the "organize" half) ──────────────────────────────────────
test("findDuplicates clusters same-normalized-title pages", () => {
  writeMemory({ title: "Café", content: "1" });
  writeMemory({ title: "Cafe", content: "2" }); // same slug 'cafe', different page
  const dups = findDuplicates();
  expect(dups.length).toBe(1);
  expect(dups[0].paths.length).toBe(2);
});
