// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, expect, test } from "vitest";
import type { TUI } from "@earendil-works/pi-tui";
import { visibleWidth } from "./ansi.ts";
import { headerFactory, renderFolkBand } from "./header.ts";
import { clearSessionInfo, recordSessionStart } from "./session-info.ts";

// The header factory ignores its tui argument; a typed null stands in for it.
const noTui = null as unknown as TUI;

const originalFolkBand = process.env.NAZAR_FOLK_BAND;

afterEach(() => {
  if (originalFolkBand === undefined) delete process.env.NAZAR_FOLK_BAND;
  else process.env.NAZAR_FOLK_BAND = originalFolkBand;
  clearSessionInfo();
});

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

test("folk band fills exactly the requested width", () => {
  for (const w of [0, 1, 12, 80, 100, 209]) {
    expect(visibleWidth(renderFolkBand(w))).toBe(w);
  }
});

test("folk band contains only space glyphs — copy-safe by construction", () => {
  // The visual band is built entirely from background-painted spaces.
  // Copying a region containing it should yield whitespace, not pattern
  // characters — exactly the same copy-safety principle as panel bodies.
  const band = renderFolkBand(80);
  expect(stripAnsi(band)).toBe(" ".repeat(80));
});

test("folk band uses background-color SGR (the carpet is paint, not glyphs)", () => {
  const band = renderFolkBand(80);
  expect(band).toContain("\x1b[48;2;"); // 24-bit bg color sequence
});

test("folk band coalesces adjacent cells into one SGR pair per segment", () => {
  // Segments are 3 cells wide; the renderer should emit one bg-open / bg-close
  // pair per segment, not per cell, keeping the byte count proportional to
  // the number of segments rather than the number of cells.
  const band = renderFolkBand(60); // 20 cells / 3 = ~7 segments
  const openCount = (band.match(/\x1b\[48;2;/g) ?? []).length;
  expect(openCount).toBeLessThanOrEqual(Math.ceil(60 / 3));
});

const theme: any = {
  fg(_: string, t: string) { return t; },
  bold(t: string) { return t; },
  italic(t: string) { return t; },
};

test("header renders nameplate + folk band + blank row when enabled", () => {
  delete process.env.NAZAR_FOLK_BAND;
  const lines = headerFactory(noTui, theme).render(100);
  expect(lines).toHaveLength(3);
  // Row 0 is the gold nameplate band — contains the brand name
  expect(stripAnsi(lines[0])).toContain("B A L A U R");
  // Row 1 is the folk band — only spaces after stripping color
  expect(stripAnsi(lines[1]).trim()).toBe("");
  expect(lines[1]).toContain("\x1b[48;2;");
  // Row 2 is the trailing blank
  expect(lines[2].trim()).toBe("");
});

test("NAZAR_FOLK_BAND=off skips the carpet row", () => {
  process.env.NAZAR_FOLK_BAND = "off";
  const lines = headerFactory(noTui, theme).render(100);
  expect(lines).toHaveLength(2); // nameplate + blank, no carpet
  expect(stripAnsi(lines[0])).toContain("B A L A U R");
  expect(lines[1].trim()).toBe("");
});

test("header adapts brand name on narrow widths", () => {
  process.env.NAZAR_FOLK_BAND = "off"; // narrow the assertion to the title row
  const wide = stripAnsi(headerFactory(noTui, theme).render(100)[0]);
  const narrow = stripAnsi(headerFactory(noTui, theme).render(40)[0]);
  expect(wide).toContain("B A L A U R");
  expect(narrow).toContain("NAZAR");
  expect(narrow).not.toContain("B A L A U R");
});

test("header swaps the trailing blank for a chapter divider once session info is recorded", () => {
  delete process.env.NAZAR_FOLK_BAND;
  // Before any recordSessionStart call, the third row is a plain blank
  // (so ad-hoc / unit-test renders stay stable).
  const before = headerFactory(noTui, theme).render(100);
  expect(before[2].trim()).toBe("");

  // After session_start fires, the third row becomes a centred chapter
  // divider with the "session opened · HH:MM" label.
  recordSessionStart("opened");
  const after = headerFactory(noTui, theme).render(100);
  const divider = stripAnsi(after[2]);
  expect(divider).toContain("session opened");
  // Local-time HH:MM somewhere in the label.
  expect(divider).toMatch(/\d{2}:\d{2}/);
  // Flanked by box-rule chars (─) on both sides.
  expect(divider).toMatch(/─.*session opened.*─/);
});

test("chapter divider label uses 'resumed' when the session is restored", () => {
  delete process.env.NAZAR_FOLK_BAND;
  recordSessionStart("resumed");
  const divider = stripAnsi(headerFactory(noTui, theme).render(100)[2]);
  expect(divider).toContain("session resumed");
});
