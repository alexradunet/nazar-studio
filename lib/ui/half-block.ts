// SPDX-License-Identifier: AGPL-3.0-or-later
// ANSI half-block sampler + renderer: turns a decoded sprite frame into rows of
// Unicode ▀/▄/█ glyphs with truecolor fg/bg. Pure and deterministic. This is the
// universal-fallback quality tier (sextant/octant live in sextant.ts). The
// colour primitives (fg/bg/paintBg) are shared with the panel renderer.
import { truecolorBg, truecolorFg } from "./graphics-protocol.ts";
import type { AvatarFrame, Rgb, Rgba } from "./png.ts";

export const RESET = "\x1b[0m";
export const BG_RESET = "\x1b[49m";

function pixelAt(frame: AvatarFrame, x: number, y: number): Rgba {
  const cx = Math.max(0, Math.min(frame.width - 1, x));
  const cy = Math.max(0, Math.min(frame.height - 1, y));
  const offset = (cy * frame.width + cx) * 4;
  return [frame.pixels[offset]!, frame.pixels[offset + 1]!, frame.pixels[offset + 2]!, frame.pixels[offset + 3]!];
}

type RegionSample = { color: Rgb; coverage: number; contrast: number };

function mixRgb(a: Rgb, b: Rgb, amount: number): Rgb {
  const t = Math.max(0, Math.min(1, amount));
  return [
    Math.round(a[0] * (1 - t) + b[0] * t),
    Math.round(a[1] * (1 - t) + b[1] * t),
    Math.round(a[2] * (1 - t) + b[2] * t),
  ];
}

function luminance([r, g, b]: Rgb): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function colorDistance(a: Rgb, b: Rgb): number {
  const dr = (a[0] - b[0]) / 255;
  const dg = (a[1] - b[1]) / 255;
  const db = (a[2] - b[2]) / 255;
  return Math.sqrt(dr * dr + dg * dg + db * db) / Math.sqrt(3);
}

function sampleRegion(frame: AvatarFrame, x0: number, x1: number, y0: number, y1: number, background: Rgb = [0, 0, 0]): RegionSample {
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let sa = 0;
  let total = 0;
  let dominant: Rgb = background;
  let dominantScore = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const [r, g, b, a] = pixelAt(frame, x, y);
      const alpha = a / 255;
      const rgb: Rgb = [r, g, b];
      const pixelContrast = colorDistance(rgb, background);
      const score = alpha * (0.55 + pixelContrast);
      if (score > dominantScore) {
        dominant = rgb;
        dominantScore = score;
      }
      sr += r * alpha;
      sg += g * alpha;
      sb += b * alpha;
      sa += alpha;
      total++;
    }
  }
  if (total === 0 || sa === 0) return { color: background, coverage: 0, contrast: 0 };
  const average: Rgb = [Math.round(sr / sa), Math.round(sg / sa), Math.round(sb / sa)];
  const coverage = Math.min(1, sa / total);
  const averageContrast = Math.max(Math.abs(luminance(average) - luminance(background)), colorDistance(average, background));
  // Half-block avatars are tiny. Pure averaging makes sprite edges muddy, so
  // pull edge/low-coverage cells toward their strongest real source pixel.
  const sharpen = Math.min(0.55, Math.max(0, (1 - coverage) * 0.42 + averageContrast * 0.28));
  const color = mixRgb(average, dominant, sharpen);
  const contrast = Math.max(Math.abs(luminance(color) - luminance(background)), colorDistance(color, background));
  return { color, coverage, contrast };
}

export function fg(color: Rgb): string {
  return truecolorFg(color);
}

export function bg(color: Rgb): string {
  return truecolorBg(color);
}

export function paintBg(text: string, color: Rgb | undefined): string {
  return color ? `${bg(color)}${text}${BG_RESET}` : text;
}

function sampleWeight(sample: RegionSample): number {
  // Coverage describes shape; contrast keeps thin but important lines alive.
  return Math.max(0.08, sample.coverage + Math.min(0.35, sample.contrast * 0.45));
}

function desiredColor(sample: RegionSample, background: Rgb): Rgb {
  return mixRgb(background, sample.color, Math.max(0, Math.min(1, sample.coverage)));
}

function candidateError(sample: RegionSample, displayed: Rgb, background: Rgb): number {
  const desired = desiredColor(sample, background);
  const colorError = colorDistance(displayed, desired);
  const shapeError = colorDistance(displayed, background) < 0.03 ? sample.coverage : Math.max(0, 0.35 - sample.coverage) * 0.45;
  return colorError * colorError * sampleWeight(sample) + shapeError * shapeError * 0.18;
}

function blendedForeground(a: RegionSample, b: RegionSample): Rgb {
  const aw = sampleWeight(a);
  const bw = sampleWeight(b);
  return mixRgb(a.color, b.color, bw / Math.max(0.001, aw + bw));
}

function halfBlockFromSamples(topSample: RegionSample, bottomSample: RegionSample, background: Rgb): string {
  const fullColor = blendedForeground(topSample, bottomSample);
  const candidates = [
    { char: " ", fg: background, bg: background, top: background, bottom: background },
    { char: "▀", fg: topSample.color, bg: background, top: topSample.color, bottom: background },
    { char: "▄", fg: bottomSample.color, bg: background, top: background, bottom: bottomSample.color },
    { char: "█", fg: fullColor, bg: background, top: fullColor, bottom: fullColor },
    { char: "▀", fg: topSample.color, bg: bottomSample.color, top: topSample.color, bottom: bottomSample.color },
  ];

  let best = candidates[0]!;
  let bestError = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const error = candidateError(topSample, candidate.top, background) + candidateError(bottomSample, candidate.bottom, background);
    if (error < bestError) {
      best = candidate;
      bestError = error;
    }
  }

  if (best.char === " ") return " ";
  if (best.char === "█") return `${fg(best.fg)}█${RESET}`;
  if (colorDistance(best.bg, background) < 0.03) return `${fg(best.fg)}${best.char}${RESET}`;
  return `${fg(best.fg)}${bg(best.bg)}${best.char}${RESET}`;
}

export function renderFrameAnsiHalfBlock(frame: AvatarFrame, background: Rgb, sampleWidth: number, sampleHeight: number): string[] {
  const rows: string[] = [];
  for (let y = 0; y < sampleHeight; y += 2) {
    let line = "";
    const topY0 = Math.floor((y * frame.height) / sampleHeight);
    const topY1 = Math.max(topY0 + 1, Math.floor(((y + 1) * frame.height) / sampleHeight));
    const bottomY0 = Math.floor(((y + 1) * frame.height) / sampleHeight);
    const bottomY1 = Math.max(bottomY0 + 1, Math.floor(((y + 2) * frame.height) / sampleHeight));
    for (let x = 0; x < sampleWidth; x++) {
      const x0 = Math.floor((x * frame.width) / sampleWidth);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * frame.width) / sampleWidth));
      line += halfBlockFromSamples(
        sampleRegion(frame, x0, x1, topY0, topY1, background),
        sampleRegion(frame, x0, x1, bottomY0, bottomY1, background),
        background,
      );
    }
    rows.push(line);
  }
  return rows;
}
