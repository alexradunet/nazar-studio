// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import type { MarkdownTheme } from "@earendil-works/pi-tui";
import { nazarMarkdownTheme } from "./markdown-theme.ts";

// Minimal MarkdownTheme stub: each painter wraps its input in a tag so we
// can assert "the wrapper called the base painter" without depending on
// real ANSI colour codes.
function tagTheme(): MarkdownTheme {
  return {
    heading: (t) => `<h>${t}</h>`,
    link: (t) => `<a>${t}</a>`,
    linkUrl: (t) => `<u>${t}</u>`,
    code: (t) => `<c>${t}</c>`,
    codeBlock: (t) => `<cb>${t}</cb>`,
    codeBlockBorder: (t) => `<cbb>${t}</cbb>`,
    quote: (t) => `<q>${t}</q>`,
    quoteBorder: (t) => `<qb>${t}</qb>`,
    hr: (t) => `<hr>${t}</hr>`,
    listBullet: (t) => `<lb>${t}</lb>`,
    bold: (t) => `<b>${t}</b>`,
    italic: (t) => `<i>${t}</i>`,
    strikethrough: (t) => `<s>${t}</s>`,
    underline: (t) => `<u>${t}</u>`,
  };
}

test("opening fence with language renders as a muted ◇ LANG chip", () => {
  const wrapped = nazarMarkdownTheme(tagTheme());
  const out = wrapped.codeBlockBorder("```typescript");
  // The chip text is muted via the base painter (the <cbb> tag here).
  expect(out).toBe("<cbb>◇ TYPESCRIPT</cbb>");
  // No literal triple-backticks survive into the output.
  expect(out).not.toContain("```");
});

test("opening fence accepts multi-character language identifiers", () => {
  const wrapped = nazarMarkdownTheme(tagTheme());
  expect(wrapped.codeBlockBorder("```bash")).toBe("<cbb>◇ BASH</cbb>");
  expect(wrapped.codeBlockBorder("```rust")).toBe("<cbb>◇ RUST</cbb>");
});

test("closing fence (or langless opening) renders as an empty row", () => {
  const wrapped = nazarMarkdownTheme(tagTheme());
  expect(wrapped.codeBlockBorder("```")).toBe("");
});

test("code body lines get a ▏ left stripe in the muted chip colour", () => {
  const wrapped = nazarMarkdownTheme(tagTheme());
  const out = wrapped.codeBlock("const x = 1;");
  // Left stripe painted by codeBlockBorder; body by codeBlock.
  expect(out).toBe("<cbb>▏ </cbb><cb>const x = 1;</cb>");
});

test("wrapping an already-wrapped theme is a no-op (idempotent)", () => {
  const base = tagTheme();
  const once = nazarMarkdownTheme(base);
  const twice = nazarMarkdownTheme(once);
  // Same object reference — the wrapper does NOT double-wrap.
  expect(twice).toBe(once);
  // And it still produces the expected output (no nesting).
  expect(twice.codeBlockBorder("```python")).toBe("<cbb>◇ PYTHON</cbb>");
});

test("non-code MarkdownTheme roles pass through unchanged", () => {
  const base = tagTheme();
  const wrapped = nazarMarkdownTheme(base);
  expect(wrapped.heading("Hello")).toBe(base.heading("Hello"));
  expect(wrapped.link("link")).toBe(base.link("link"));
  expect(wrapped.code("inline")).toBe(base.code("inline"));
  expect(wrapped.quote("q")).toBe(base.quote("q"));
});
