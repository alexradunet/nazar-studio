// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { borderGlyphs, labeledSoloTop, labeledTopRightSegment, panelBottom, panelTop, soloBottom } from "./borders.ts";
import { visibleWidth } from "./ansi.ts";

test("heavy border style is the only Nazar border", () => {
  expect(panelTop(4, 6)).toBe("┏━━━━┳━━━━━━┓");
  expect(panelBottom(4, 6)).toBe("┗━━━━┻━━━━━━┛");
  expect(soloBottom(6)).toBe("┗━━━━━━┛");
  expect(borderGlyphs().leftVertical).toBe("┃");
  expect(borderGlyphs().rightVertical).toBe("┃");
});

test("labeled top segments preserve visible width", () => {
  const label = "input";
  const segment = labeledTopRightSegment(24, label, (text) => text);
  expect(segment).toContain(" input ");
  expect(visibleWidth(segment)).toBe(25);

  const solo = labeledSoloTop(24, label, (text) => text);
  expect(solo).toContain(" input ");
  expect(solo.startsWith("┏")).toBe(true);
  expect(visibleWidth(solo)).toBe(26);
});
