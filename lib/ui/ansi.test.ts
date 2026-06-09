// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { compact, padVisible, rgb, visibleWidth } from "./ansi.ts";

test("rgb wraps text in a truecolor fg SGR and resets only the fg", () => {
  const out = rgb(242, 193, 78, "x");
  expect(out).toBe("\x1b[38;2;242;193;78mx\x1b[39m");
  // It must never emit a bg reset (\x1b[49m) — painted panel backgrounds survive.
  expect(out).not.toContain("\x1b[49m");
  expect(visibleWidth(out)).toBe(1);
});

test("compact truncates to the visible width and leaves short text intact", () => {
  expect(compact("abc", 10)).toBe("abc");
  expect(visibleWidth(compact("hello world", 5))).toBeLessThanOrEqual(5);
  // width is floored at 1 even when asked for 0 or negative
  expect(visibleWidth(compact("wide", 0))).toBeLessThanOrEqual(1);
});

test("padVisible pads to the target width and never shrinks wider text", () => {
  expect(padVisible("ab", 5)).toBe("ab   ");
  expect(visibleWidth(padVisible("ab", 5))).toBe(5);
  expect(padVisible("abcdef", 3)).toBe("abcdef");
});

test("padVisible measures visible width, ignoring SGR codes", () => {
  const colored = rgb(0, 0, 0, "ab"); // 2 visible cells, plus invisible SGR
  expect(visibleWidth(padVisible(colored, 5))).toBe(5);
});
