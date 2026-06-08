// Run the real lib/ui/sextant.ts renderMosaic on a master frame and dump ANSI.
import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { renderMosaic } from "./nazar-studio/lib/ui/sextant.ts";

function decode(path: string) {
  const d = readFileSync(path); let o = 8, w = 0, h = 0, ct = 0; const idat: Buffer[] = [];
  while (o < d.length) { const len = d.readUInt32BE(o); o += 4; const t = d.subarray(o, o + 4).toString("ascii"); o += 4; const c = d.subarray(o, o + len); o += len + 4;
    if (t === "IHDR") { w = c.readUInt32BE(0); h = c.readUInt32BE(4); ct = c[9]!; } else if (t === "IDAT") idat.push(c); else if (t === "IEND") break; }
  const ch = ct === 6 ? 4 : 3, stride = w * ch, inf = inflateSync(Buffer.concat(idat)); const rgba = Buffer.alloc(w * h * 4); let ip = 0; let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) { const f = inf[ip++]; const sc = inf.subarray(ip, ip + stride); ip += stride; const out = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) { const a = x >= ch ? out[x - ch]! : 0, b = prev[x]!, cc = x >= ch ? prev[x - ch]! : 0; let v = sc[x]!;
      if (f === 1) v = (v + a) & 255; else if (f === 2) v = (v + b) & 255; else if (f === 3) v = (v + ((a + b) >> 1)) & 255; else if (f === 4) { const p = a + b - cc, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - cc); v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : cc)) & 255; } out[x] = v; }
    for (let x = 0; x < w; x++) { const s = x * ch, dd = (y * w + x) * 4; rgba[dd] = out[s]!; rgba[dd + 1] = out[s + 1]!; rgba[dd + 2] = out[s + 2]!; rgba[dd + 3] = ct === 6 ? out[s + 3]! : 255; } prev = out; }
  return { width: w, height: h, pixels: rgba };
}
function frame0(sheet: { width: number; height: number; pixels: Buffer }) {
  const W = 256; const px = Buffer.alloc(W * W * 4);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const s = (y * sheet.width + x) * 4, d = (y * W + x) * 4; px[d] = sheet.pixels[s]!; px[d + 1] = sheet.pixels[s + 1]!; px[d + 2] = sheet.pixels[s + 2]!; px[d + 3] = sheet.pixels[s + 3]!; }
  return { width: W, height: W, pixels: px };
}
const bg = [15, 17, 23] as const;
for (const [name, path] of [["eye", "/agent/workspace/nazar_eye_sheet.png"], ["soul", "/agent/workspace/soul_A_sheet.png"]] as const) {
  const fr = frame0(decode(path));
  for (const mode of ["sextant", "octant"] as const) {
    const lines = renderMosaic(fr, bg, 27, 13, mode);
    // structural assertions
    const cells = [...lines[6]!.matchAll(/\x1b\[38;2;\d+;\d+;\d+;48;2;\d+;\d+;\d+m./g)].length;
    console.log(`${name} ${mode}: lines=${lines.length} cellsInRow6=${cells}`);
    writeFileSync(`/agent/workspace/ts_${name}_${mode}.ansi`, lines.join("\n"));
  }
}
console.log("OK renderMosaic executed");
