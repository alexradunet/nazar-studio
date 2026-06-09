// SPDX-License-Identifier: AGPL-3.0-or-later
// Minimal, dependency-free PNG decoder (8-bit, non-interlaced, RGB/RGBA) for the
// terminal avatar renderer. Decodes sprite-sheet master PNGs into raw RGBA
// buffers; the mosaic/half-block renderers sample those buffers directly.
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

/** An RGB colour triple (0–255 per channel). */
export type Rgb = readonly [number, number, number];
/** An RGBA colour quad (0–255 per channel). */
export type Rgba = readonly [number, number, number, number];

/** A decoded image: pixel dimensions plus a row-major RGBA pixel buffer. */
export type PngImage = {
  width: number;
  height: number;
  pixels: Buffer; // RGBA
};

/** A single sprite frame extracted from a sheet, tagged with its avatar id. */
export type AvatarFrame = PngImage & { id: string };

function readUInt32BE(buf: Buffer, offset: number): number {
  return buf.readUInt32BE(offset);
}

export function decodePngRgba(path: string): PngImage {
  const data = readFileSync(path);
  if (!data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    throw new Error(`Invalid PNG signature: ${path}`);
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];

  while (offset < data.length) {
    const length = readUInt32BE(data, offset); offset += 4;
    const type = data.subarray(offset, offset + 4).toString("ascii"); offset += 4;
    const chunk = data.subarray(offset, offset + length); offset += length;
    offset += 4; // CRC checked by Git/source control; skip at runtime

    if (type === "IHDR") {
      width = readUInt32BE(chunk, 0);
      height = readUInt32BE(chunk, 4);
      bitDepth = chunk[8]!;
      colorType = chunk[9]!;
      interlace = chunk[12]!;
    } else if (type === "IDAT") {
      idat.push(chunk);
    } else if (type === "IEND") {
      break;
    }
  }

  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`Unsupported PNG format for ${path}: bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace}`);
  }

  const channels = colorType === 6 ? 4 : 3;
  const bpp = channels;
  const inputStride = width * channels;
  const inflated = inflateSync(Buffer.concat(idat));
  const rgba = Buffer.alloc(width * height * 4);
  let input = 0;
  let prev = Buffer.alloc(inputStride);

  for (let y = 0; y < height; y++) {
    const filter = inflated[input++];
    const scan = inflated.subarray(input, input + inputStride);
    input += inputStride;
    const out = Buffer.alloc(inputStride);

    for (let x = 0; x < inputStride; x++) {
      const a = x >= bpp ? out[x - bpp]! : 0;
      const b = prev[x]!;
      const c = x >= bpp ? prev[x - bpp]! : 0;
      let value: number;
      if (filter === 0) value = scan[x]!;
      else if (filter === 1) value = (scan[x]! + a) & 0xff;
      else if (filter === 2) value = (scan[x]! + b) & 0xff;
      else if (filter === 3) value = (scan[x]! + Math.floor((a + b) / 2)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        value = (scan[x]! + pr) & 0xff;
      } else {
        throw new Error(`Unsupported PNG filter ${filter} in ${path}`);
      }
      out[x] = value;
    }

    for (let x = 0; x < width; x++) {
      const src = x * channels;
      const dst = (y * width + x) * 4;
      rgba[dst] = out[src]!;
      rgba[dst + 1] = out[src + 1]!;
      rgba[dst + 2] = out[src + 2]!;
      rgba[dst + 3] = colorType === 6 ? out[src + 3]! : 255;
    }
    prev = out;
  }

  return { width, height, pixels: rgba };
}
