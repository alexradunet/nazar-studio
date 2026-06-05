// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, expect, test } from "vitest";
import { __testing } from "./avatars.ts";
import { visibleWidth } from "./ansi.ts";

const originalRecentLimit = process.env.NAZAR_AVATAR_RECENT_LIMIT;

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

afterEach(() => {
  if (originalRecentLimit === undefined) delete process.env.NAZAR_AVATAR_RECENT_LIMIT;
  else process.env.NAZAR_AVATAR_RECENT_LIMIT = originalRecentLimit;
});

test("message panels keep body text rows copyable (no box glyphs)", () => {
  const panel = __testing.composeMessagePanel(["copyable text"], 80).map(stripAnsi);
  // Find the row that contains the body text. In the two-column layout it
  // shares a row with the portrait column (avatar half-blocks on the left,
  // body text on the right). What matters is that the body text appears
  // unadorned by border-drawing glyphs (┏┓┗┛┃═╔╗╚╝ etc.).
  const textLine = panel.find((l) => l.includes("copyable text")) ?? "";
  expect(textLine).toContain("copyable text");
  // No box-drawing chars anywhere — half-blocks ▀/▄/█ in the avatar column
  // are sprite pixels, not decorative borders.
  expect(textLine).not.toMatch(/[║│╔╗╚╝╭╮╰╯┏┓┗┛═]/);
});

test("two-column layout: body text shares row with portrait, panel ends with blank gap", () => {
  const panel = __testing.composeMessagePanel(["answer"], 64).map(stripAnsi);
  // Find the row that contains "answer". In the two-column layout it appears
  // inside the panel rows (alongside the avatar), NOT below a separate portrait.
  const answerIndex = panel.findIndex((l) => l.includes("answer"));
  expect(answerIndex).toBeGreaterThanOrEqual(0);
  // After the last panel row, there is a blank-gap row (separator between
  // consecutive panels). That blank row has length = panel width.
  expect(panel.at(-1)?.trim()).toBe("");
  // The last non-blank row should not be a ━ rule (the rule is retired in
  // the two-column layout).
  const lastNonBlank = [...panel].reverse().find((l) => l.trim().length > 0) ?? "";
  expect(lastNonBlank).not.toMatch(/^━+$/);
});

test("message panels can show the role/tool name inside the nameplate band", () => {
  const panel = __testing.composeMessagePanel(["answer"], 64, "Nazar").map(stripAnsi);
  expect(panel.join("\n")).toContain("Nazar");
  expect(panel.join("\n")).not.toContain("[ Nazar ]");
});

test("nameplate band appears at the top of the right column (panel row 0)", () => {
  const panel = __testing.composeMessagePanel(["answer"], 64, "NAZAR").map(stripAnsi);
  // Row 0 is the nameplate row; it carries the title and no border chars.
  expect(panel[0]).toContain("NAZAR");
  expect(panel[0]).not.toMatch(/[┏┓┗┛┃━┳┻]/);
});

test("every emitted row fits within the requested panel width (pi-tui width assertion)", () => {
  // Regression for the crash: pi-tui asserts that every rendered line must
  // fit within the terminal width. The two-column composer used to overflow
  // when the body text was wider than the body column. Now Pi pre-wraps to
  // the body width and the composer truncates as a safety net.
  const cases = [
    { lines: ["short"], width: 80, title: "Nazar" },
    { lines: ["x".repeat(500)], width: 80, title: "Nazar" },
    { lines: ["x".repeat(500)], width: 209, title: "Nazar" },
    { lines: Array(50).fill("y".repeat(300)), width: 120, title: "Tool · construct" },
    { lines: ["normal line"], width: 30, title: "VeryLongTitleThatDoesNotFitWidth" },
  ];
  for (const tc of cases) {
    const panel = __testing.composeMessagePanel(tc.lines, tc.width, tc.title);
    for (let i = 0; i < panel.length; i++) {
      const w = visibleWidth(panel[i]);
      if (w > tc.width) {
        throw new Error(`row ${i} is ${w} > ${tc.width} (case: title="${tc.title}", body chars=${tc.lines.join("").length})`);
      }
    }
  }
});

test("body text rows are free of box-drawing decoration", () => {
  const panel = __testing.composeMessagePanel(["test content"], 64, "Nazar").map(stripAnsi);
  // Every row may contain ▀/▄/█ sprite pixels in the avatar column, but no
  // box-drawing glyphs anywhere (the bottom rule is retired in two-column).
  for (const line of panel) {
    expect(line).not.toMatch(/[┏┓┗┛┃┳┻╔╗╚╝╠╣╦╩║═]/);
  }
});

test("partial tool results count as running", () => {
  expect(__testing.toolStatus({ result: { details: "streaming" }, isPartial: true })).toBe("running");
});

test("rich avatars are limited to recent panels unless active", () => {
  process.env.NAZAR_AVATAR_RECENT_LIMIT = "2";
  const first = {};
  const second = {};
  const third = {};

  expect(__testing.shouldUseRichAvatar(first)).toBe(true);
  expect(__testing.shouldUseRichAvatar(second)).toBe(true);
  expect(__testing.shouldUseRichAvatar(third)).toBe(true);

  expect(__testing.shouldUseRichAvatar(first)).toBe(false);
  expect(__testing.shouldUseRichAvatar(second)).toBe(true);
  expect(__testing.shouldUseRichAvatar(third)).toBe(true);
  expect(__testing.shouldUseRichAvatar(first, true)).toBe(true);
});
