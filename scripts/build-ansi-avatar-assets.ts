// SPDX-License-Identifier: AGPL-3.0-or-later
// Build low-resolution PNG sprite sheets tuned for Nazar's ANSI half-block renderer.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";
import { moduleDir } from "../lib/paths.ts";

const ROOT = join(moduleDir(import.meta.url), "..");
const AVATAR_DIR = join(ROOT, "assets", "avatars");
const TOOL_DIR = join(AVATAR_DIR, "tools");
const ANSI_DIR = join(AVATAR_DIR, "ansi");
const ANSI_TOOL_DIR = join(ANSI_DIR, "tools");

const SHEETS = [
  ...["nazar", "mage", "mage-female", "mage-alien", "mage-brown", "mage-black", "mage-elder", "mage-blonde"].map((name) => ({
    src: join(AVATAR_DIR, `${name}.png`),
    dst: join(ANSI_DIR, `${name}.png`),
    frame: 170,
    outW: 16,
    outH: 14,
  })),
  ...[
    // original tools
    "scroll", "needle", "quill", "anvil", "lens", "folder", "keeper", "warden", "seer", "new-head", "hammer",
    // domain tools
    "journal", "dumbbell", "plate-fork", "heart-pulse", "moon-stars", "calendar",
    "envelope", "map-pin", "coin-stack", "music-note", "camera", "pill-potion",
    "brain", "compass", "seedling", "hourglass", "key", "bell",
    // dev / engineering
    "terminal", "code", "git-branch", "git-merge", "database", "cloud",
    "browser", "container", "chat", "gamepad", "rocket", "gear",
    // objects / status / actions
    "lightbulb", "trophy", "target", "flask", "atom", "bug", "lock",
    "star", "flag", "gift", "cart", "paint-brush", "wrench", "bookmark",
    // animated coloured globe placeholders (running-state animation overlays)
    "globe-gold", "globe-teal", "globe-violet", "globe-ember", "globe-pearl", "globe-indigo",
  ].map((name) => ({
    src: join(TOOL_DIR, `${name}.png`),
    dst: join(ANSI_TOOL_DIR, `${name}.png`),
    frame: 170,
    outW: 8,
    outH: 6,
  })),
];

type Image = { width: number; height: number; pixels: Buffer };
type Rgba = [number, number, number, number];

function u32(buf: Buffer, offset: number): number { return buf.readUInt32BE(offset); }

function decodePng(path: string): Image {
  const data = readFileSync(path);
  let offset = 8, width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat: Buffer[] = [];
  while (offset < data.length) {
    const length = u32(data, offset); offset += 4;
    const type = data.subarray(offset, offset + 4).toString("ascii"); offset += 4;
    const chunk = data.subarray(offset, offset + length); offset += length + 4;
    if (type === "IHDR") { width = u32(chunk, 0); height = u32(chunk, 4); bitDepth = chunk[8]!; colorType = chunk[9]!; interlace = chunk[12]!; }
    else if (type === "IDAT") idat.push(chunk);
    else if (type === "IEND") break;
  }
  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 6 && colorType !== 2)) throw new Error(`Unsupported PNG ${path}`);
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const inflated = inflateSync(Buffer.concat(idat));
  const rgba = Buffer.alloc(width * height * 4);
  let input = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = inflated[input++];
    const scan = inflated.subarray(input, input + stride); input += stride;
    const out = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[x - channels]! : 0;
      const b = prev[x]!;
      const c = x >= channels ? prev[x - channels]! : 0;
      let v = scan[x]!;
      if (filter === 1) v = (v + a) & 0xff;
      else if (filter === 2) v = (v + b) & 0xff;
      else if (filter === 3) v = (v + Math.floor((a + b) / 2)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      } else if (filter !== 0) throw new Error(`Unsupported filter ${filter}`);
      out[x] = v;
    }
    for (let x = 0; x < width; x++) {
      const s = x * channels, d = (y * width + x) * 4;
      rgba[d] = out[s]!; rgba[d + 1] = out[s + 1]!; rgba[d + 2] = out[s + 2]!; rgba[d + 3] = colorType === 6 ? out[s + 3]! : 255;
    }
    prev = out;
  }
  return { width, height, pixels: rgba };
}

let crcTable: Uint32Array | undefined;
function crc32(buf: Buffer): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); crcTable[n] = c >>> 0; }
  }
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data = Buffer.alloc(0)): Buffer {
  const t = Buffer.from(type, "ascii");
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); t.copy(out, 4); data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([t, data])), 8 + data.length);
  return out;
}
function encodePng(img: Image): Buffer {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(img.width, 0); ihdr.writeUInt32BE(img.height, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((img.width * 4 + 1) * img.height);
  for (let y = 0; y < img.height; y++) { const row = y * (img.width * 4 + 1); raw[row] = 0; img.pixels.copy(raw, row + 1, y * img.width * 4, (y + 1) * img.width * 4); }
  return Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND")]);
}

function pixel(img: Image, x: number, y: number): Rgba {
  const d = (Math.max(0, Math.min(img.height - 1, y)) * img.width + Math.max(0, Math.min(img.width - 1, x))) * 4;
  return [img.pixels[d]!, img.pixels[d + 1]!, img.pixels[d + 2]!, img.pixels[d + 3]!];
}

function srgbToLinear(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value: number): number {
  const c = Math.max(0, Math.min(1, value));
  const srgb = c <= 0.0031308 ? c * 12.92 : 1.055 * (c ** (1 / 2.4)) - 0.055;
  return Math.round(srgb * 255);
}

const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const;

function orderedAlphaThreshold(x: number, y: number): number {
  // Keep thin edges and diagonals alive without soft halos. This is tuned for
  // half-block output, where each source pixel becomes either one terminal
  // half-cell or transparent background.
  return 0.22 + (BAYER_4X4[y % 4]![x % 4]! / 15) * 0.30;
}

function darken([r, g, b]: Rgba, amount = 0.42): Rgba {
  return [Math.round(r * amount), Math.round(g * amount), Math.round(b * amount), 190];
}

function addPixelArtOutline(frame: Buffer, width: number, height: number): void {
  const original = Buffer.from(frame);
  const neighborOffsets = [
    [-1, 0], [1, 0], [0, -1], [0, 1],
    [-1, -1], [1, -1], [-1, 1], [1, 1],
  ] as const;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dst = (y * width + x) * 4;
      if (original[dst + 3]! >= 70) continue;

      let best: Rgba | undefined;
      for (const [ox, oy] of neighborOffsets) {
        const nx = x + ox;
        const ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const src = (ny * width + nx) * 4;
        const alpha = original[src + 3]!;
        if (alpha < 120 || (best && alpha <= best[3])) continue;
        best = [original[src]!, original[src + 1]!, original[src + 2]!, alpha];
      }

      if (!best) continue;
      const outline = darken(best);
      frame[dst] = outline[0];
      frame[dst + 1] = outline[1];
      frame[dst + 2] = outline[2];
      frame[dst + 3] = Math.max(frame[dst + 3]!, outline[3]);
    }
  }
}

function resizeFrame(src: Image, sx: number, sy: number, inSize: number, out: Image, dx: number, dy: number, outW: number, outH: number): void {
  const frame = Buffer.alloc(outW * outH * 4);
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const x0 = Math.floor((x * inSize) / outW), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * inSize) / outW));
      const y0 = Math.floor((y * inSize) / outH), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * inSize) / outH));
      let lr = 0, lg = 0, lb = 0, sa = 0, count = 0;
      let best: Rgba = [0, 0, 0, 0];
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const p = pixel(src, sx + xx, sy + yy); const a = p[3] / 255;
        if (p[3] > best[3]) best = p;
        lr += srgbToLinear(p[0]) * a; lg += srgbToLinear(p[1]) * a; lb += srgbToLinear(p[2]) * a; sa += a; count++;
      }
      const coverage = count ? sa / count : 0;
      const d = (y * outW + x) * 4;
      if (!sa) { frame[d] = frame[d + 1] = frame[d + 2] = frame[d + 3] = 0; continue; }
      const threshold = orderedAlphaThreshold(x, y);
      // Preserve coverage in alpha instead of binarizing it. The runtime glyph
      // optimizer can then decide whether a half-cell should become space,
      // block, or split-colour based on perceptual error. A small ordered boost
      // keeps diagonals alive without turning every translucent fringe solid.
      const alphaCoverage = Math.max(0, Math.min(1, coverage + (coverage >= threshold ? 0.10 : -0.06)));
      const alpha = Math.max(best[3] >= 240 ? 180 : 0, Math.round(alphaCoverage * 255));
      if (alpha < 18) { frame[d] = frame[d + 1] = frame[d + 2] = frame[d + 3] = 0; continue; }
      const avg: Rgba = [linearToSrgb(lr / sa), linearToSrgb(lg / sa), linearToSrgb(lb / sa), alpha];
      const sharpen = Math.min(0.70, (1 - coverage) * 0.62);
      frame[d] = Math.round(avg[0] * (1 - sharpen) + best[0] * sharpen);
      frame[d + 1] = Math.round(avg[1] * (1 - sharpen) + best[1] * sharpen);
      frame[d + 2] = Math.round(avg[2] * (1 - sharpen) + best[2] * sharpen);
      frame[d + 3] = alpha;
    }
  }

  addPixelArtOutline(frame, outW, outH);
  for (let y = 0; y < outH; y++) {
    frame.copy(out.pixels, ((dy + y) * out.width + dx) * 4, y * outW * 4, (y + 1) * outW * 4);
  }
}

mkdirSync(ANSI_TOOL_DIR, { recursive: true });
for (const sheet of SHEETS) {
  const src = decodePng(sheet.src);
  const out = { width: sheet.outW * 3, height: sheet.outH * 3, pixels: Buffer.alloc(sheet.outW * 3 * sheet.outH * 3 * 4) };
  for (let i = 0; i < 9; i++) resizeFrame(src, (i % 3) * sheet.frame, Math.floor(i / 3) * sheet.frame, sheet.frame, out, (i % 3) * sheet.outW, Math.floor(i / 3) * sheet.outH, sheet.outW, sheet.outH);
  mkdirSync(dirname(sheet.dst), { recursive: true });
  writeFileSync(sheet.dst, encodePng(out));
  console.log(`${sheet.dst} (${out.width}x${out.height})`);
}
