// SPDX-License-Identifier: AGPL-3.0-or-later
// PNG sprite-sheet avatars for Nazar's ANSI-only terminal UI.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { getCellDimensions, setCellDimensions, type CellDimensions } from "@earendil-works/pi-tui";
import { visibleWidth } from "./ansi.ts";
import { type SpriteRole } from "./sprites.ts";
import { moduleDir } from "../paths.ts";

const RESET = "\x1b[0m";
const BG_RESET = "\x1b[49m";

const ANSI_AVATAR_FRAME = { width: 16, height: 14 } as const;
const ANSI_TOOL_FRAME = { width: 8, height: 6 } as const;
const SHEET_COLUMNS = 3;
const AVATAR_FRAME_COUNT = 9;

// Compact daily-chat avatar size. Terminal cells are usually taller than wide,
// so columns are derived from the live cell aspect ratio to keep the 64×64
// sprite square in pixel terms and flush inside the avatar box.
const DEFAULT_AVATAR_ROWS = 7;

const AVATAR_ASSET_DIR = join(moduleDir(import.meta.url), "..", "..", "assets", "avatars");
const ANSI_ASSET_DIR = join(AVATAR_ASSET_DIR, "ansi");
const ANSI_TOOL_ASSET_DIR = join(ANSI_ASSET_DIR, "tools");

const TOOL_KINDS = [
  "scroll",
  "needle",
  "quill",
  "anvil",
  "lens",
  "folder",
  "keeper",
  "warden",
  "seer",
  "new-head",
  "hammer",
] as const;

type ToolAvatarStatus = "pending" | "running" | "ok" | "error";
type ToolAvatarKind = typeof TOOL_KINDS[number];
type CharacterSheetKey = "mage" | "nazar";
type ToolSheetKey = `tool:${ToolAvatarKind}`;
type SheetKey = CharacterSheetKey | ToolSheetKey;
type FrameGeometry = { width: number; height: number };
type SheetAsset = { path: string; frame: FrameGeometry };
type FrameSource = { sheet: SheetKey; index: number; id: string };

const TOOL_STATUS_SUFFIX = /-(pending|running|ok|error)$/;
export type AvatarBackground = readonly [number, number, number];
type Rgb = AvatarBackground;
type Rgba = readonly [number, number, number, number];

type PngImage = {
  width: number;
  height: number;
  pixels: Buffer; // RGBA
};

type AvatarFrame = PngImage & { id: string };

export type AvatarRenderBackend = "ansi";
export type AvatarRenderLine = {
  /** Text/escape payload for this avatar row. */
  text: string;
  /** Terminal cells occupied by zero-width/control payloads. */
  virtualWidth?: number;
  /** Background used for cell padding around this avatar row. */
  background?: AvatarBackground;
};
export type RenderedAvatar = {
  lines: readonly AvatarRenderLine[];
  width: number;
  height: number;
  backend: AvatarRenderBackend;
  background?: AvatarBackground;
};

const BACKGROUNDS = {
  user: [31, 40, 64],
  nazar: [54, 42, 30],
  thinking: [24, 55, 58],
  toolPending: [52, 43, 28],
  toolRunning: [50, 51, 55],
  toolOk: [22, 54, 58],
  toolError: [70, 30, 27],
} satisfies Record<string, Rgb>;

const SHEET_ASSETS: Record<SheetKey, SheetAsset> = Object.fromEntries([
  ["mage", { path: join(ANSI_ASSET_DIR, "mage.png"), frame: ANSI_AVATAR_FRAME }],
  ["nazar", { path: join(ANSI_ASSET_DIR, "nazar.png"), frame: ANSI_AVATAR_FRAME }],
  ...TOOL_KINDS.map((kind) => [`tool:${kind}`, { path: join(ANSI_TOOL_ASSET_DIR, `${kind}.png`), frame: ANSI_TOOL_FRAME }]),
] as [SheetKey, SheetAsset][]);

const sheetCache = new Map<string, PngImage>();
const frameCache = new Map<string, AvatarFrame>();

function modIndex(index: number, length: number): number {
  return Math.abs(Math.floor(index)) % length;
}

function backgroundForFrame(id: string): Rgb {
  if (id.startsWith("user")) return BACKGROUNDS.user;
  if (id.includes("thinking")) return BACKGROUNDS.thinking;
  if (id.startsWith("tool-") && id.endsWith("-error")) return BACKGROUNDS.toolError;
  if (id.startsWith("tool-") && id.endsWith("-ok")) return BACKGROUNDS.toolOk;
  if (id.startsWith("tool-") && id.endsWith("-running")) return BACKGROUNDS.toolRunning;
  if (id.startsWith("tool-")) return BACKGROUNDS.toolPending;
  return BACKGROUNDS.nazar;
}

function sheetFrameId(id: string): string {
  return id.replace(TOOL_STATUS_SUFFIX, "");
}

function readUInt32BE(buf: Buffer, offset: number): number {
  return buf.readUInt32BE(offset);
}

function decodePngRgba(path: string): PngImage {
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

function sheetAsset(key: SheetKey): SheetAsset {
  return SHEET_ASSETS[key];
}

function sheet(key: SheetKey): PngImage {
  const cached = sheetCache.get(key);
  if (cached) return cached;
  const decoded = decodePngRgba(sheetAsset(key).path);
  sheetCache.set(key, decoded);
  return decoded;
}

function frameSource(id: string): FrameSource {
  const sourceId = sheetFrameId(id);

  if (sourceId === "user") return { sheet: "mage", index: 0, id: sourceId };
  const mageMatch = sourceId.match(/^user-typing-(\d+)$/);
  if (mageMatch) {
    const index = modIndex(Number(mageMatch[1]), AVATAR_FRAME_COUNT);
    return { sheet: "mage", index, id: sourceId };
  }

  if (sourceId === "nazar") return { sheet: "nazar", index: 0, id: sourceId };
  const nazarMatch = sourceId.match(/^nazar-thinking-(\d+)$/);
  if (nazarMatch) {
    const index = modIndex(Number(nazarMatch[1]), AVATAR_FRAME_COUNT);
    return { sheet: "nazar", index, id: sourceId };
  }

  for (const kind of TOOL_KINDS) {
    if (sourceId === `tool-${kind}`) return { sheet: `tool:${kind}`, index: 0, id: sourceId };
    const toolMatch = sourceId.match(new RegExp(`^tool-${kind}-(\\d+)$`));
    if (toolMatch) {
      const index = modIndex(Number(toolMatch[1]), AVATAR_FRAME_COUNT);
      return { sheet: `tool:${kind}`, index, id: sourceId };
    }
  }

  throw new Error(`Unknown avatar frame: ${sourceId}`);
}

function frameFor(id: string): AvatarFrame {
  const source = frameSource(id);
  const asset = sheetAsset(source.sheet);
  const cacheKey = `${source.sheet}:${source.index}`;
  const cached = frameCache.get(cacheKey);
  if (cached) return { ...cached, id };

  const sheetImage = sheet(source.sheet);
  const columns = SHEET_COLUMNS;
  const { width, height } = asset.frame;
  const frame = Buffer.alloc(width * height * 4);
  const sourceX = (source.index % columns) * width;
  const sourceY = Math.floor(source.index / columns) * height;

  if (sourceX + width > sheetImage.width || sourceY + height > sheetImage.height) {
    throw new Error(`Avatar frame ${source.id} exceeds ${source.sheet} sheet bounds`);
  }

  for (let y = 0; y < height; y++) {
    const srcStart = ((sourceY + y) * sheetImage.width + sourceX) * 4;
    const dstStart = y * width * 4;
    sheetImage.pixels.copy(frame, dstStart, srcStart, srcStart + width * 4);
  }

  const result = { id: source.id, width, height, pixels: frame };
  frameCache.set(cacheKey, result);
  return { ...result, id };
}

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

function fg([r, g, b]: Rgb): string {
  return `\x1b[38;2;${r};${g};${b}m`;
}

function bg([r, g, b]: Rgb): string {
  return `\x1b[48;2;${r};${g};${b}m`;
}

function paintBg(text: string, color: Rgb | undefined): string {
  return color ? `${bg(color)}${text}${BG_RESET}` : text;
}

function sampleIsOn(sample: RegionSample, threshold: number): boolean {
  const edgeBoost = Math.min(0.30, sample.contrast * 0.52);
  return sample.coverage > 0 && sample.coverage + edgeBoost >= threshold;
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

  if (best.char === " ") return paintBg(" ", background);
  if (best.char === "█") return `${fg(best.fg)}${bg(background)}█${RESET}`;
  return `${fg(best.fg)}${bg(best.bg)}${best.char}${RESET}`;
}

function renderFrameAnsiHalfBlock(frame: AvatarFrame, background: Rgb, sampleWidth: number, sampleHeight: number): string[] {
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

function renderFrameAnsi(frame: AvatarFrame, background: Rgb, columns: number, rows: number): string[] {
  return renderFrameAnsiHalfBlock(frame, background, columns, rows * 2);
}

function textAvatarLine(text: string, background?: Rgb): AvatarRenderLine {
  return { text, background };
}

function envPositiveInteger(name: string): number | undefined {
  const raw = (process.env[name] || "").trim();
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function avatarCellDimensions(): CellDimensions {
  const base = getCellDimensions();
  const widthPx = envPositiveInteger("NAZAR_CELL_WIDTH_PX") ?? base.widthPx;
  const heightPx = envPositiveInteger("NAZAR_CELL_HEIGHT_PX") ?? base.heightPx;
  const calibrated = { widthPx, heightPx };

  // Keep ANSI sprite geometry aligned with Nazar's calibrated terminal cells.
  // Some terminals/fonts do not answer cell-size probes, so pi-tui stays on its
  // 9×18 fallback even when the live font raster is closer to e.g. 9×17.
  if (calibrated.widthPx !== base.widthPx || calibrated.heightPx !== base.heightPx) {
    setCellDimensions(calibrated);
  }

  return calibrated;
}

function avatarRows(): number {
  const raw = envPositiveInteger("NAZAR_AVATAR_ROWS");
  return raw !== undefined ? Math.max(3, Math.min(12, raw)) : DEFAULT_AVATAR_ROWS;
}

function avatarColumns(rows = avatarRows()): number {
  // Choose interior columns so the *outer bordered panel* is square in pixel
  // terms, then render the sprite flush to that interior. Terminal cells are
  // font-dependent and borders consume cells, so this uses Nazar's calibrated
  // cell dimensions rather than assuming pi-tui's generic 9×18 fallback.
  return Math.max(1, Math.round((rows + 2) * terminalCellAspectRatio()) - 2);
}

function toolRows(): number {
  const raw = envPositiveInteger("NAZAR_TOOL_ROWS");
  if (raw !== undefined) return Math.max(2, Math.min(8, raw));
  return Math.max(2, Math.floor(avatarRows() / 2));
}

function ansiAvatar(frameId: string, rows = avatarRows()): RenderedAvatar {
  const frame = frameFor(frameId);
  const background = backgroundForFrame(frameId);
  const columns = avatarColumns(rows);
  const lines = renderFrameAnsi(frame, background, columns, rows).map((line) => textAvatarLine(line, background));
  return { lines, width: columns, height: lines.length, backend: "ansi", background };
}

function renderFrameAvatar(
  frameId: string,
  options: { rows?: number } = {},
): RenderedAvatar | undefined {
  return ansiAvatar(frameId, options.rows ?? avatarRows());
}

export function avatarLineWidth(line: AvatarRenderLine): number {
  return line.virtualWidth ?? visibleWidth(line.text);
}

export function terminalCellAspectRatio(): number {
  const { widthPx, heightPx } = avatarCellDimensions();
  if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx) || widthPx <= 0 || heightPx <= 0) return 2;
  return heightPx / widthPx;
}

export function avatarPixelAspect(widthCells: number, heightRows: number): number {
  const { widthPx, heightPx } = avatarCellDimensions();
  const width = Math.max(1, widthCells * widthPx);
  const height = Math.max(1, heightRows * heightPx);
  return width / height;
}

function cursorToColumn(column: number): string {
  return `\x1b[${Math.max(1, Math.floor(column))}G`;
}

export function centerAvatarLine(line: AvatarRenderLine, width: number, startColumn = 1): string {
  const contentWidth = avatarLineWidth(line);
  const pad = Math.max(0, width - contentWidth);
  const left = Math.floor(pad / 2);
  const right = pad - left;

  if (line.virtualWidth !== undefined) {
    // Some control payloads are zero-width to the TUI width calculator, but
    // occupy cells on screen. Jump to the exact absolute column after them so
    // right-side panel borders line up without printing spaces over the content.
    return `${paintBg(" ".repeat(left), line.background)}${line.text}${cursorToColumn(startColumn + left + line.virtualWidth)}${paintBg(" ".repeat(right), line.background)}`;
  }

  return `${paintBg(" ".repeat(left), line.background)}${line.background ? `${bg(line.background)}${line.text}${BG_RESET}` : line.text}${paintBg(" ".repeat(right), line.background)}`;
}

export function emptyAvatarLine(background?: AvatarBackground): AvatarRenderLine {
  return { text: "", background };
}

export function stringAvatarLine(text: string, background?: AvatarBackground): AvatarRenderLine {
  return { text, background };
}

export function renderRoleAvatar(
  role: SpriteRole,
  options: { rows?: number } = {},
): RenderedAvatar | undefined {
  return renderFrameAvatar(role === "user" ? "user" : "nazar", options);
}

export function renderUserTypingAvatar(
  frameIndex = 0,
  options: { rows?: number } = {},
): RenderedAvatar | undefined {
  const index = modIndex(frameIndex, AVATAR_FRAME_COUNT);
  return renderFrameAvatar(index === 0 ? "user" : `user-typing-${index}`, options);
}

export function renderThinkingAvatar(
  frameIndex = 0,
  options: { rows?: number } = {},
): RenderedAvatar | undefined {
  return renderFrameAvatar(`nazar-thinking-${modIndex(frameIndex, AVATAR_FRAME_COUNT)}`, options);
}

export function renderAnsiAvatarFrame(role: SpriteRole): string[] {
  return renderRoleAvatar(role, { backend: "ansi" })?.lines.map((line) => line.text) ?? [];
}

export function renderUserTypingAvatarFrame(frameIndex = 0): string[] {
  return renderUserTypingAvatar(frameIndex, { backend: "ansi" })?.lines.map((line) => line.text) ?? [];
}

// Backward-compatible alias for the old implementation name.
export function renderPixelAvatar(role: SpriteRole): string[] {
  return renderAnsiAvatarFrame(role);
}

export function renderThinkingAvatarFrame(frameIndex = 0): string[] {
  return renderThinkingAvatar(frameIndex, { backend: "ansi" })?.lines.map((line) => line.text) ?? [];
}

function hasAny(text: string, needles: readonly string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function toolKind(toolName: string, hintText = ""): ToolAvatarKind {
  const text = `${toolName} ${hintText}`.toLowerCase();

  if (hasAny(text, ["open-websearch", "fetch-web", "fetchgithub", "fetch-github", "websearch", "web search"])) return "seer";
  if (/\bsearch\b/.test(text) && !hasAny(text, ["grep", "ripgrep", "search files"])) return "seer";
  if (hasAny(text, ["memory", "journal", "diet", "sport", "vault", "keeper"])) return "keeper";
  if (hasAny(text, ["doctor", "health", "warden"])) return "warden";
  if (hasAny(text, ["skill_write", "skill-write", "skill", "evolv", "new head"])) return "new-head";
  if (hasAny(text, ["read"])) return "scroll";
  if (hasAny(text, ["edit", "patch", "replace"])) return "needle";
  if (hasAny(text, ["write"])) return "quill";
  if (hasAny(text, ["grep", "find"])) return "lens";
  if (hasAny(text, ["ls", "list", "tree"])) return "folder";
  if (hasAny(text, ["bash", "shell", "command"])) return "anvil";

  return "hammer";
}

function toolFrameId(toolName: string, status: ToolAvatarStatus, hintText = "", frameIndex = 0): string {
  const kind = toolKind(toolName, hintText);
  return `tool-${kind}-${modIndex(frameIndex, AVATAR_FRAME_COUNT)}-${status}`;
}

export function renderToolPixelAvatar(
  toolName: string,
  status: ToolAvatarStatus = "pending",
  frameIndex = Date.now() / 180,
  hintText = "",
  options: { rows?: number } = {},
): RenderedAvatar | undefined {
  const effectiveFrame = status === "running" ? frameIndex : 0;
  return renderFrameAvatar(toolFrameId(toolName, status, hintText, effectiveFrame), { ...options, rows: toolRows() });
}

export function renderToolAvatar(
  toolName: string,
  status: ToolAvatarStatus = "pending",
  frameIndex = Date.now() / 180,
  hintText = "",
): string[] {
  return renderToolPixelAvatar(toolName, status, frameIndex, hintText, { backend: "ansi" })?.lines.map((line) => line.text) ?? [];
}

export function pixelAvatarWidth(role: SpriteRole): number {
  return renderRoleAvatar(role, { backend: "ansi" })?.width ?? 0;
}
