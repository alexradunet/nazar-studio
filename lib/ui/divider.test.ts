// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { visibleWidth } from "./ansi.ts";
import { renderChapterDivider, renderStitchLine } from "./divider.ts";
import { panelStyle } from "./panel-style.ts";

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

test("chapter divider fits exactly the requested width", () => {
  const style = panelStyle("assistant");
  for (const w of [0, 1, 12, 40, 80, 120, 200]) {
    expect(visibleWidth(renderChapterDivider({ width: w, style }))).toBe(w);
  }
});

test("chapter divider centres a label with flanking glyphs", () => {
  const style = panelStyle("assistant");
  const out = stripAnsi(renderChapterDivider({ width: 60, label: "session opened · 23:45", style }));
  // Layout: leftRule + " ✦ label ✦ " + rightRule
  expect(out).toContain("session opened · 23:45");
  expect(out).toContain("✦");
  // Centre piece is sandwiched between rule chars on both sides.
  const labelIdx = out.indexOf("session");
  const before = out.slice(0, labelIdx);
  const after = out.slice(labelIdx + "session opened · 23:45".length);
  expect(before).toMatch(/─+/);
  expect(after).toMatch(/─+/);
});

test("chapter divider falls back to a plain rule when the label wouldn't fit", () => {
  const style = panelStyle("assistant");
  const out = stripAnsi(renderChapterDivider({ width: 8, label: "this is way too long for an 8-cell rule", style }));
  // 8 cells, no label visible, just box-rule chars.
  expect(out).toBe("─".repeat(8));
});

test("chapter divider omits the glyph when caller passes empty glyph", () => {
  const style = panelStyle("assistant");
  const out = stripAnsi(renderChapterDivider({ width: 50, label: "compaction", glyph: "", style }));
  expect(out).toContain("compaction");
  expect(out).not.toContain("✦");
});

test("stitch line is alternating rule + space across the full width", () => {
  const style = panelStyle("system");
  for (const w of [0, 1, 2, 8, 40, 99]) {
    expect(visibleWidth(renderStitchLine({ width: w, style }))).toBeLessThanOrEqual(w);
  }
  const plain = stripAnsi(renderStitchLine({ width: 10, style }));
  // 10 cells = 5 pairs of "─ " → "─ ─ ─ ─ ─ "
  expect(plain).toBe("─ ─ ─ ─ ─ ");
});

test("dividers paint through the panel style (truecolor SGR)", () => {
  const style = panelStyle("assistant");
  expect(renderChapterDivider({ width: 30, label: "x", style })).toContain("\x1b[38;2;");
  expect(renderStitchLine({ width: 30, style })).toContain("\x1b[38;2;");
});
