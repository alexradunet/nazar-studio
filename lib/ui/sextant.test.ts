// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { renderMosaic, type RgbaImage } from "./sextant.ts";

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function octantFrame(pattern: number): RgbaImage {
  const pixels = Buffer.alloc(2 * 4 * 4);
  for (let bit = 0; bit < 8; bit++) {
    const on = (pattern & (1 << bit)) !== 0;
    const offset = bit * 4;
    pixels[offset] = on ? 255 : 0;
    pixels[offset + 1] = on ? 255 : 0;
    pixels[offset + 2] = on ? 255 : 0;
    pixels[offset + 3] = 255;
  }
  return { width: 2, height: 4, pixels };
}

test("octant glyph map follows Unicode 16 ordering", () => {
  expect(stripAnsi(renderMosaic(octantFrame(4), [0, 0, 0], 1, 1, "octant")[0]!)).toBe("\u{1cd00}"); // BLOCK OCTANT-3
  expect(stripAnsi(renderMosaic(octantFrame(6), [0, 0, 0], 1, 1, "octant")[0]!)).toBe("\u{1cd01}"); // BLOCK OCTANT-23
  expect(stripAnsi(renderMosaic(octantFrame(7), [0, 0, 0], 1, 1, "octant")[0]!)).toBe("\u{1cd02}"); // BLOCK OCTANT-123
});

test("octant glyph map uses legacy companion glyphs for skipped patterns", () => {
  expect(stripAnsi(renderMosaic(octantFrame(1), [0, 0, 0], 1, 1, "octant")[0]!)).toBe("\u{1cea8}");
  expect(stripAnsi(renderMosaic(octantFrame(3), [0, 0, 0], 1, 1, "octant")[0]!)).toBe("\u{1fb82}");
  expect(stripAnsi(renderMosaic(octantFrame(20), [0, 0, 0], 1, 1, "octant")[0]!)).toBe("\u{1fbe6}");
  expect(stripAnsi(renderMosaic(octantFrame(40), [0, 0, 0], 1, 1, "octant")[0]!)).toBe("\u{1fbe7}");
});
