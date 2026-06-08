// SPDX-License-Identifier: AGPL-3.0-or-later
// Native mosaic renderer for Nazar's avatars — pure TypeScript, zero deps.
//
// Turns an RGBA sprite frame into Unicode block-mosaic character art with
// TRUECOLOR SGR (one fg + one bg colour per cell). Two grids are supported:
//   • SEXTANT (2×3, Unicode 13 "Symbols for Legacy Computing", U+1FB00…)
//   • OCTANT  (2×4, Unicode 16 "…Supplement", U+1CD00…) — 33% more vertical
//     resolution, the higher-fidelity option where the font/terminal supports it
//     (e.g. kitty renders these built-in). Same 2-colours-per-cell limit.
// A `cols × rows` block samples the frame at `subCols·cols × subRows·rows`.
// No wasm and no build step.
import type { Rgb } from "./graphics-protocol.ts";

export type RgbaImage = { width: number; height: number; pixels: Buffer };
export type MosaicMode = "sextant" | "octant";

// --- glyph maps ------------------------------------------------------------
// Subpixel bit weights within a cell: weight(row,col) = 1 << (row*subCols + col).
// SEXTANT (2×3): left column 1+4+16=21 → ▌, right column 2+8+32=42 → ▐.
const SEXTANT_GLYPHS: string[] = (() => {
  const special: Record<number, string> = { 0: " ", 21: "▌", 42: "▐", 63: "█" };
  const tbl: string[] = []; let n = 0;
  for (let p = 0; p < 64; p++) {
    if (special[p] !== undefined) tbl[p] = special[p]!;
    else { tbl[p] = String.fromCodePoint(0x1fb00 + n); n++; }
  }
  return tbl;
})();

// OCTANT (2×4): Unicode 16 did not encode all 256 patterns contiguously.
// U+1CD00 starts at BLOCK OCTANT-3; 26 patterns reuse older/new companion block
// glyphs (space/full/halves/quadrants/quarters). Source: official Unicode 16
// names from UnicodeData.txt and the U1CC00 chart.
const OCTANT_BASE = 0x1cd00;
const OCTANT_SPECIAL: Record<number, string> = {
  0: " ",
  1: "\u{1cea8}", // LEFT HALF UPPER ONE QUARTER BLOCK
  2: "\u{1ceab}", // RIGHT HALF UPPER ONE QUARTER BLOCK
  3: "\u{1fb82}", // UPPER ONE QUARTER BLOCK
  5: "▘",
  10: "▝",
  15: "▀",
  20: "\u{1fbe6}", // MIDDLE LEFT ONE QUARTER BLOCK
  40: "\u{1fbe7}", // MIDDLE RIGHT ONE QUARTER BLOCK
  63: "\u{1fb85}", // UPPER THREE QUARTERS BLOCK
  64: "\u{1cea3}", // LEFT HALF LOWER ONE QUARTER BLOCK
  80: "▖",
  85: "▌",
  90: "▞",
  95: "▛",
  128: "\u{1cea0}", // RIGHT HALF LOWER ONE QUARTER BLOCK
  160: "▗",
  165: "▚",
  170: "▐",
  175: "▜",
  192: "▂",
  240: "▄",
  245: "▙",
  250: "▟",
  252: "▆",
  255: "█",
};
const OCTANT_GLYPHS: string[] = (() => {
  const tbl: string[] = [];
  let cp = OCTANT_BASE;
  for (let pattern = 0; pattern < 256; pattern++) {
    const special = OCTANT_SPECIAL[pattern];
    if (special !== undefined) tbl[pattern] = special;
    else tbl[pattern] = String.fromCodePoint(cp++);
  }
  return tbl;
})();

const SPEC: Record<MosaicMode, { subCols: number; subRows: number; glyphs: string[] }> = {
  sextant: { subCols: 2, subRows: 3, glyphs: SEXTANT_GLYPHS },
  octant: { subCols: 2, subRows: 4, glyphs: OCTANT_GLYPHS },
};

function luma(r: number, g: number, b: number): number { return 0.299 * r + 0.587 * g + 0.114 * b; }

/** Area-average the frame into a subW×subH grid, compositing alpha over `bg`. */
function downsample(frame: RgbaImage, subW: number, subH: number, bg: Rgb): Float64Array {
  const { width: W, height: H, pixels } = frame;
  const out = new Float64Array(subW * subH * 3);
  for (let sy = 0; sy < subH; sy++) {
    const y0 = Math.floor((sy * H) / subH), y1 = Math.max(y0 + 1, Math.floor(((sy + 1) * H) / subH));
    for (let sx = 0; sx < subW; sx++) {
      const x0 = Math.floor((sx * W) / subW), x1 = Math.max(x0 + 1, Math.floor(((sx + 1) * W) / subW));
      let r = 0, g = 0, b = 0, count = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * W + x) * 4; const a = pixels[i + 3]! / 255;
        r += pixels[i]! * a + bg[0] * (1 - a); g += pixels[i + 1]! * a + bg[1] * (1 - a); b += pixels[i + 2]! * a + bg[2] * (1 - a); count++;
      }
      const o = (sy * subW + sx) * 3; out[o] = r / count; out[o + 1] = g / count; out[o + 2] = b / count;
    }
  }
  return out;
}

/** Render `frame` as `cols × rows` mosaic cells (truecolor). Returns one ANSI string per row. */
export function renderMosaic(frame: RgbaImage, background: Rgb, cols: number, rows: number, mode: MosaicMode = "sextant"): string[] {
  const { subCols, subRows, glyphs } = SPEC[mode];
  const subW = cols * subCols, subH = rows * subRows;
  const sub = downsample(frame, subW, subH, background);
  const n = subCols * subRows;
  const lines: string[] = [];
  for (let cy = 0; cy < rows; cy++) {
    let line = "";
    for (let cx = 0; cx < cols; cx++) {
      const lum: number[] = []; const cols3: number[][] = [];
      for (let r = 0; r < subRows; r++) for (let c = 0; c < subCols; c++) {
        const o = ((cy * subRows + r) * subW + (cx * subCols + c)) * 3;
        const px = [sub[o]!, sub[o + 1]!, sub[o + 2]!]; cols3.push(px); lum.push(luma(px[0]!, px[1]!, px[2]!));
      }
      const min = Math.min(...lum), max = Math.max(...lum), mid = (min + max) / 2;
      let pattern = 0; const fg = [0, 0, 0], bg = [0, 0, 0]; let nf = 0, nb = 0;
      for (let k = 0; k < n; k++) {
        const on = max - min > 8 && lum[k]! > mid;
        const p = cols3[k]!;
        if (on) { pattern |= 1 << k; fg[0] += p[0]!; fg[1] += p[1]!; fg[2] += p[2]!; nf++; }
        else { bg[0] += p[0]!; bg[1] += p[1]!; bg[2] += p[2]!; nb++; }
      }
      const fr = nf ? Math.round(fg[0]! / nf) : 0, fgc = nf ? Math.round(fg[1]! / nf) : 0, fb = nf ? Math.round(fg[2]! / nf) : 0;
      const br = nb ? Math.round(bg[0]! / nb) : 0, bgc = nb ? Math.round(bg[1]! / nb) : 0, bb = nb ? Math.round(bg[2]! / nb) : 0;
      line += `\x1b[38;2;${fr};${fgc};${fb};48;2;${br};${bgc};${bb}m${glyphs[pattern]}`;
    }
    lines.push(line + "\x1b[0m");
  }
  return lines;
}
