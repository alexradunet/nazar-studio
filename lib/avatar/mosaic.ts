// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Rgb } from "./png.ts";

export type RgbaImage = { width: number; height: number; pixels: Buffer };
export type MosaicMode = "sextant" | "octant";

const SEXTANT_GLYPHS: string[] = (() => {
  const special: Record<number, string> = { 0: " ", 21: "▌", 42: "▐", 63: "█" };
  const tbl: string[] = [];
  let n = 0;
  for (let p = 0; p < 64; p++) {
    if (special[p] !== undefined) tbl[p] = special[p]!;
    else {
      tbl[p] = String.fromCodePoint(0x1fb00 + n);
      n++;
    }
  }
  return tbl;
})();

const OCTANT_SPECIAL: Record<number, string> = {
  0: " ",
  1: "\u{1cea8}",
  2: "\u{1ceab}",
  3: "\u{1fb82}",
  5: "▘",
  10: "▝",
  15: "▀",
  20: "\u{1fbe6}",
  40: "\u{1fbe7}",
  63: "\u{1fb85}",
  64: "\u{1cea3}",
  80: "▖",
  85: "▌",
  90: "▞",
  95: "▛",
  128: "\u{1cea0}",
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
  let cp = 0x1cd00;
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

function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function downsample(frame: RgbaImage, subW: number, subH: number, bg: Rgb): Float64Array {
  const { width: W, height: H, pixels } = frame;
  const out = new Float64Array(subW * subH * 3);
  for (let sy = 0; sy < subH; sy++) {
    const y0 = Math.floor((sy * H) / subH);
    const y1 = Math.max(y0 + 1, Math.floor(((sy + 1) * H) / subH));
    for (let sx = 0; sx < subW; sx++) {
      const x0 = Math.floor((sx * W) / subW);
      const x1 = Math.max(x0 + 1, Math.floor(((sx + 1) * W) / subW));
      let r = 0, g = 0, b = 0, count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * W + x) * 4;
          const a = pixels[i + 3]! / 255;
          r += pixels[i]! * a + bg[0] * (1 - a);
          g += pixels[i + 1]! * a + bg[1] * (1 - a);
          b += pixels[i + 2]! * a + bg[2] * (1 - a);
          count++;
        }
      }
      const o = (sy * subW + sx) * 3;
      out[o] = r / count;
      out[o + 1] = g / count;
      out[o + 2] = b / count;
    }
  }
  return out;
}

export function renderMosaic(frame: RgbaImage, background: Rgb, cols: number, rows: number, mode: MosaicMode): string[] {
  const { subCols, subRows, glyphs } = SPEC[mode];
  const subW = cols * subCols;
  const subH = rows * subRows;
  const sub = downsample(frame, subW, subH, background);
  const n = subCols * subRows;
  const lines: string[] = [];

  for (let cy = 0; cy < rows; cy++) {
    let line = "";
    for (let cx = 0; cx < cols; cx++) {
      const lum: number[] = [];
      const colours: number[][] = [];
      for (let r = 0; r < subRows; r++) {
        for (let c = 0; c < subCols; c++) {
          const o = ((cy * subRows + r) * subW + (cx * subCols + c)) * 3;
          const px = [sub[o]!, sub[o + 1]!, sub[o + 2]!];
          colours.push(px);
          lum.push(luma(px[0]!, px[1]!, px[2]!));
        }
      }
      const min = Math.min(...lum);
      const max = Math.max(...lum);
      const mid = (min + max) / 2;
      let pattern = 0;
      const fg = [0, 0, 0];
      const bg = [0, 0, 0];
      let nf = 0;
      let nb = 0;
      for (let k = 0; k < n; k++) {
        const on = max - min > 8 && lum[k]! > mid;
        const p = colours[k]!;
        if (on) {
          pattern |= 1 << k;
          fg[0] += p[0]!; fg[1] += p[1]!; fg[2] += p[2]!; nf++;
        } else {
          bg[0] += p[0]!; bg[1] += p[1]!; bg[2] += p[2]!; nb++;
        }
      }
      const fr = nf ? Math.round(fg[0]! / nf) : 0;
      const fgc = nf ? Math.round(fg[1]! / nf) : 0;
      const fb = nf ? Math.round(fg[2]! / nf) : 0;
      const br = nb ? Math.round(bg[0]! / nb) : 0;
      const bgc = nb ? Math.round(bg[1]! / nb) : 0;
      const bb = nb ? Math.round(bg[2]! / nb) : 0;
      line += `\x1b[38;2;${fr};${fgc};${fb};48;2;${br};${bgc};${bb}m${glyphs[pattern]}`;
    }
    lines.push(`${line}\x1b[0m`);
  }
  return lines;
}
