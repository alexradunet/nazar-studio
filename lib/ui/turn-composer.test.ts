// SPDX-License-Identifier: AGPL-3.0-or-later
// Unit coverage for the copy-safe panel primitives. The end-to-end "every row
// fits the panel width" regression lives in avatars.test.ts; these tests pin the
// pure helpers (column math, bg-fill SGR rewriting, OSC/image extraction).
import { expect, test } from "vitest";
import { visibleWidth } from "./ansi.ts";
import {
  analyzeTextCells,
  bodyColumnWidth,
  bodyOnlyColumnWidth,
  extractImageSequences,
  lineHasTextContent,
  nameplateRow,
  paintBgStrip,
  splitLeadingControlSequences,
  trimOuterBlankLines,
} from "./turn-composer.ts";
import { panelStyle } from "./panel-style.ts";

test("body column widths stay positive and within the panel; a wider avatar narrows the body", () => {
  for (const w of [40, 80, 120, 209]) {
    expect(bodyColumnWidth(w, 19)).toBeGreaterThan(0);
    expect(bodyColumnWidth(w, 19)).toBeLessThan(w);
    expect(bodyOnlyColumnWidth(w)).toBeGreaterThan(0);
    expect(bodyOnlyColumnWidth(w)).toBeLessThanOrEqual(w);
    expect(bodyColumnWidth(w, 30)).toBeLessThan(bodyColumnWidth(w, 10));
  }
});

test("trimOuterBlankLines drops leading/trailing blanks but keeps inner ones", () => {
  expect(trimOuterBlankLines(["", "  ", "a", "", "b", "  ", ""])).toEqual(["a", "", "b"]);
  expect(trimOuterBlankLines(["", "   "])).toEqual([]);
});

test("lineHasTextContent ignores SGR colour codes and OSC-133 zone markers", () => {
  expect(lineHasTextContent("hello")).toBe(true);
  expect(lineHasTextContent("   ")).toBe(false);
  expect(lineHasTextContent("\x1b[38;2;1;2;3m\x1b[39m")).toBe(false);
  expect(lineHasTextContent("\x1b]133;A\x07\x1b]133;B\x07")).toBe(false);
});

test("splitLeadingControlSequences peels OSC-133 prefixes; analyzeTextCells maps lines to cells", () => {
  const { controls, rest } = splitLeadingControlSequences("\x1b]133;A\x07hello");
  expect(controls).toBe("\x1b]133;A\x07");
  expect(rest).toBe("hello");
  expect(analyzeTextCells(["\x1b]133;A\x07hi"])[0]).toEqual({ controls: "\x1b]133;A\x07", text: "hi" });
});

test("extractImageSequences pulls Kitty APC and iTerm2 OSC payloads out of the line", () => {
  const kitty = "\x1b_Ga=T,f=100;BASE64DATA\x1b\\";
  const iterm = "\x1b]1337;File=name=a:DATA\x07";
  const { apc, rest } = extractImageSequences(`pre${kitty}mid${iterm}post`);
  expect(apc).toContain(kitty);
  expect(apc).toContain(iterm);
  expect(rest).toBe("premidpost");
});

test("paintBgStrip fills to width and rewrites internal SGR resets so the bg survives", () => {
  const bg = [10, 20, 30] as const;
  const bgOpen = "\x1b[48;2;10;20;30m";

  const out = paintBgStrip("hi", bg, 6);
  expect(out).toContain(bgOpen);
  expect(visibleWidth(out)).toBe(6);

  // \x1b[0m (full reset) must turn OFF reverse-video (mode 27) etc., not leak it.
  expect(paintBgStrip("a\x1b[0mb", bg, 6)).toContain("\x1b[22;23;24;25;27;28;29;39m");
  // \x1b[49m (bg reset) must re-open our bg rather than punch a hole.
  expect(paintBgStrip("a\x1b[49mb", bg, 6).split(bgOpen).length).toBeGreaterThan(2);

  // No background → just padded text, no SGR fill.
  expect(paintBgStrip("hi", undefined, 6)).toBe("hi    ");
});

test("nameplateRow fills exactly to width and stays within width when space is tight", () => {
  const style = panelStyle("assistant");
  expect(visibleWidth(nameplateRow("NAZAR", 30, style, "1.2k tok"))).toBe(30);
  expect(visibleWidth(nameplateRow("A very long title here", 12, style, "meta"))).toBeLessThanOrEqual(12);
});
