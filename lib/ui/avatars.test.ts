// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, expect, test } from "vitest";
import { __testing } from "./avatars.ts";

const originalRecentLimit = process.env.NAZAR_AVATAR_RECENT_LIMIT;

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

afterEach(() => {
  if (originalRecentLimit === undefined) delete process.env.NAZAR_AVATAR_RECENT_LIMIT;
  else process.env.NAZAR_AVATAR_RECENT_LIMIT = originalRecentLimit;
});

test("message panels keep message rows free of decorative borders", () => {
  const panel = __testing.composeMessagePanel(["copyable text"], 80);
  const textLine = stripAnsi(panel.find((line) => line.includes("copyable text")) ?? "");
  expect(textLine.trim()).toBe("copyable text");
  // No box-drawing chars beside body text — copy-safe by construction
  expect(textLine).not.toMatch(/[║│╔╗╚╝╭╮╰╯┏┓┗┛▗▖▝▘▐▌]/);
});

test("message panels render portrait above copyable text rows", () => {
  const panel = __testing.composeMessagePanel(["answer"], 64).map(stripAnsi);
  // Portrait rows come first; answer appears later — no bordered box
  const answerIndex = panel.findIndex((line) => line.trim() === "answer");
  expect(answerIndex).toBeGreaterThan(0);
  expect(panel.at(-3)?.trim()).toBe("answer");
  expect(panel.at(-2)?.trim()).toBe("");
  expect(panel.at(-1)).toBe("━".repeat(64));
});

test("message panels keep one-row vertical content padding", () => {
  const panel = __testing.composeMessagePanel(["answer"], 64).map(stripAnsi);
  const answerIndex = panel.findIndex((line) => line.includes("answer"));
  expect(panel.at(answerIndex - 1)?.trim()).toBe("");
  expect(panel.at(answerIndex + 1)?.trim()).toBe("");
});

test("message panels can show the role/tool name inside the avatar header", () => {
  const panel = __testing.composeMessagePanel(["answer"], 64, "Nazar").map(stripAnsi);
  expect(panel.join("\n")).toContain("Nazar");
  expect(panel.join("\n")).not.toContain("[ Nazar ]");
});

test("message panels show nameplate band as first row when title provided", () => {
  const panel = __testing.composeMessagePanel(["answer"], 64, "NAZAR").map(stripAnsi);
  // Nameplate is row 0; contains the title; has no box-border glyphs
  expect(panel[0]).toContain("NAZAR");
  expect(panel[0]).not.toMatch(/[┏┓┗┛┃━┳┻]/);
});

test("message panels have no box-border glyphs except the bottom rule", () => {
  const panel = __testing.composeMessagePanel(["test content"], 64, "Nazar").map(stripAnsi);
  // Every row except the last (the ━ separator) must be free of box chars
  for (const line of panel.slice(0, -1)) {
    expect(line).not.toMatch(/[┏┓┗┛┃┳┻╔╗╚╝╠╣╦╩║═]/);
  }
  // The bottom rule is the only row that may contain ━
  expect(panel.at(-1)).toBe("━".repeat(64));
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
