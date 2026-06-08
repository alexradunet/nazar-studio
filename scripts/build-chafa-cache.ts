// SPDX-License-Identifier: AGPL-3.0-or-later
// Prewarm the Chafa ANSI cache used by lib/ui/chafa-render.ts.
//
// For every PNG master sheet (assets/avatars/{nazar,nazar-expr,soul}.png and
// assets/avatars/tools/eye-*.png) this slices the 3×3 / 9-frame grid into 256px
// frames and renders each frame to sextant TRUECOLOR ANSI with `chafa-wasm` at
// the three target heights (9 / 13 / 17 rows). The result is written to
// assets/avatars/chafa-cache.json keyed by "<sheet>#<frame>#<rows>".
//
//   npm i -D chafa-wasm
//   node scripts/build-chafa-cache.ts            # all sizes
//   node scripts/build-chafa-cache.ts 13         # one size
//
// Runtime then does a sync lookup (chafaLinesFor) and blits the cached lines.
// NOTE: validated to the chafa-wasm README API (imageToAnsi(encodedImageBuffer,
// opts)); if your chafa-wasm version accepts raw ImageDataLike instead, pass
// { data, width, height } rather than the PNG buffer.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { promisify } from "node:util";
import { deflateSync, inflateSync } from "node:zlib";
import { moduleDir } from "../lib/paths.ts";
// @ts-ignore - chafa-wasm ships its own types; install with `npm i -D chafa-wasm`
import Chafa from "chafa-wasm";

const ROOT = join(moduleDir(import.meta.url), "..");
const AV = join(ROOT, "assets", "avatars");
const TOOLS = join(AV, "tools");
const OUT = join(AV, "chafa-cache.json");
const SHEET_PX = 256, GRID = 3, FRAMES = 9;
const SIZES = (process.argv.slice(2).map(Number).filter((n) => n > 0)) ;
const ROWS = SIZES.length ? SIZES : [9, 13, 17];
const FIELD = 0x0f1117; // transparent areas filled with the panel field colour

type Img = { width: number; height: number; pixels: Buffer };

function u32(b: Buffer, o: number) { return b.readUInt32BE(o); }
function decodePng(path: string): Img {
  const data = readFileSync(path);
  let o = 8, w = 0, h = 0, bd = 0, ct = 0, il = 0; const idat: Buffer[] = [];
  while (o < data.length) {
    const len = u32(data, o); o += 4; const t = data.subarray(o, o + 4).toString("ascii"); o += 4;
    const c = data.subarray(o, o + len); o += len + 4;
    if (t === "IHDR") { w = u32(c, 0); h = u32(c, 4); bd = c[8]!; ct = c[9]!; il = c[12]!; }
    else if (t === "IDAT") idat.push(c); else if (t === "IEND") break;
  }
  if (bd !== 8 || il !== 0 || (ct !== 6 && ct !== 2)) throw new Error(`Unsupported PNG ${path}`);
  const ch = ct === 6 ? 4 : 3, stride = w * ch, inf = inflateSync(Buffer.concat(idat));
  const rgba = Buffer.alloc(w * h * 4); let inp = 0; let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = inf[inp++]; const scan = inf.subarray(inp, inp + stride); inp += stride; const out = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[x - ch]! : 0, b = prev[x]!, cc = x >= ch ? prev[x - ch]! : 0; let v = scan[x]!;
      if (f === 1) v = (v + a) & 255; else if (f === 2) v = (v + b) & 255; else if (f === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (f === 4) { const p = a + b - cc, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - cc); v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : cc)) & 255; }
      out[x] = v;
    }
    for (let x = 0; x < w; x++) { const s = x * ch, d = (y * w + x) * 4; rgba[d] = out[s]!; rgba[d + 1] = out[s + 1]!; rgba[d + 2] = out[s + 2]!; rgba[d + 3] = ct === 6 ? out[s + 3]! : 255; }
    prev = out;
  }
  return { width: w, height: h, pixels: rgba };
}

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf: Buffer): number { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]!) & 255]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function encodePng(img: Img): Buffer { // RGBA, filter 0
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(img.width, 0); ihdr.writeUInt32BE(img.height, 4); ihdr[8] = 8; ihdr[9] = 6;
  const stride = img.width * 4; const raw = Buffer.alloc((stride + 1) * img.height);
  for (let y = 0; y < img.height; y++) { raw[y * (stride + 1)] = 0; img.pixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride); }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
function frame(img: Img, idx: number): Img {
  const col = idx % GRID, row = (idx / GRID) | 0, ox = col * SHEET_PX, oy = row * SHEET_PX;
  const px = Buffer.alloc(SHEET_PX * SHEET_PX * 4);
  for (let y = 0; y < SHEET_PX; y++) for (let x = 0; x < SHEET_PX; x++) {
    const s = ((oy + y) * img.width + (ox + x)) * 4, d = (y * SHEET_PX + x) * 4;
    px[d] = img.pixels[s]!; px[d + 1] = img.pixels[s + 1]!; px[d + 2] = img.pixels[s + 2]!; px[d + 3] = img.pixels[s + 3]!;
  }
  return { width: SHEET_PX, height: SHEET_PX, pixels: px };
}

async function main() {
  const chafa = await Chafa();
  const imageToAnsi = promisify(chafa.imageToAnsi);
  const sheets: string[] = [];
  for (const n of ["nazar", "nazar-expr", "soul", "mage-alien"]) if (existsSync(join(AV, `${n}.png`))) sheets.push(join(AV, `${n}.png`));
  for (const f of readdirSync(TOOLS)) if (f.startsWith("eye-") && f.endsWith(".png")) sheets.push(join(TOOLS, f));
  const cache: Record<string, string[]> = {};
  for (const path of sheets) {
    const name = basename(path).replace(/\.png$/, ""); const sheet = decodePng(path);
    for (let i = 0; i < FRAMES; i++) {
      const png = encodePng(frame(sheet, i));
      for (const rows of ROWS) {
        const { ansi } = await imageToAnsi(png.buffer, {
          format: chafa.ChafaPixelMode.CHAFA_PIXEL_MODE_SYMBOLS.value,
          height: rows, fontRatio: 0.5,
          colors: chafa.ChafaCanvasMode.CHAFA_CANVAS_MODE_TRUECOLOR.value,
          symbols: "sextant", fg: 0xffffff, bg: FIELD, preprocess: true, optimize: 5, work: 5,
        });
        cache[`${name}#${i}#${rows}`] = String(ansi).replace(/\x1b\[0m\s*$/, "").split("\n");
      }
    }
    process.stdout.write(`cached ${name}\n`);
  }
  writeFileSync(OUT, JSON.stringify(cache)); console.log(`wrote ${OUT} (${Object.keys(cache).length} entries)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
