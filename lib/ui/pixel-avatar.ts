// SPDX-License-Identifier: AGPL-3.0-or-later
// PNG sprite-sheet avatars for Nazar's terminal ANSI renderer.
import { join } from "node:path";
import { getCellDimensions, setCellDimensions, type CellDimensions } from "@earendil-works/pi-tui";
import { visibleWidth } from "./ansi.ts";
import { type GraphicsProtocolBackend } from "./graphics-protocol.ts";
import { uiRenderer } from "./graphics-state.ts";
import { renderMosaic, type MosaicMode } from "./sextant.ts";
import { type SpriteRole } from "./sprites.ts";
import { AVATAR_FIELDS as BACKGROUNDS } from "./tokens.ts";
import { moduleDir } from "../paths.ts";
import { decodePngRgba, type AvatarFrame, type PngImage, type Rgb } from "./png.ts";
import { bg, BG_RESET, paintBg, renderFrameAnsiHalfBlock } from "./half-block.ts";
import { KIND_TO_EYE, TOOL_KINDS, toolKind, type ToolAvatarKind } from "./tool-kind.ts";

// Source sheets are 768×768 RGBA (3×3 grid, 256px stride, transparent bg).
// The ANSI renderer samples frames directly from these high-res sheets.
const SOURCE_FRAME = { width: 256, height: 256 } as const;
const SHEET_COLUMNS = 3;
const AVATAR_FRAME_COUNT = 9;

// Compact daily-chat avatar size. Terminal cells are usually taller than wide,
// so columns are derived from the live cell aspect ratio to keep the 64×64
// sprite square in pixel terms and flush inside the avatar box.
// Default ANSI-mosaic avatar height. 11 rows ≈ 23×11 cells — the daily identity
// size (sextant stays legible across common terminal fonts while compact);
// 9 = compact, 17 = showcase. Override via NAZAR_AVATAR_ROWS (clamped 6–20).
const DEFAULT_AVATAR_ROWS = 11;

const AVATAR_ASSET_DIR = join(moduleDir(import.meta.url), "..", "..", "assets", "avatars");


type ToolAvatarStatus = "pending" | "running" | "ok" | "error";

type CharacterSheetKey = "nazar" | "nazar-expr" | "soul";
type ToolSheetKey = `tool:${ToolAvatarKind}`;
type SheetKey = CharacterSheetKey | ToolSheetKey;
type FrameGeometry = { width: number; height: number };
type SheetAsset = { path: string; frame: FrameGeometry };
type FrameSource = { sheet: SheetKey; index: number; id: string };

const TOOL_STATUS_SUFFIX = /-(pending|running|ok|error)$/;
export type AvatarBackground = Rgb;


export type AvatarRenderBackend = GraphicsProtocolBackend;
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

const CHARACTER_SHEETS: CharacterSheetKey[] = ["nazar", "nazar-expr", "soul"];

const SOURCE_SHEET_ASSETS = Object.fromEntries([
  ...CHARACTER_SHEETS.map((k) => [k, { path: join(AVATAR_ASSET_DIR, `${k}.png`), frame: SOURCE_FRAME }]),
  ...TOOL_KINDS.map((kind) => [`tool:${kind}`, { path: join(AVATAR_ASSET_DIR, "tools", `eye-${KIND_TO_EYE[kind]}.png`), frame: SOURCE_FRAME }]),
] as [SheetKey, SheetAsset][]) as Record<SheetKey, SheetAsset>;

const sheetCache = new Map<string, PngImage>();
const frameCache = new Map<string, AvatarFrame>();

function modIndex(index: number, length: number): number {
  return Math.abs(Math.floor(index)) % length;
}

function userAvatarSheet(): CharacterSheetKey {
  // The operator is "the Seeker": a soul-of-light face inside the same floating
  // crystal orb as Nazar's cosmic eye (a matched pair). Frame 0 is the static
  // idle shown beside messages; frames 1-8 animate (radiance pulse + eye glint)
  // while typing, driven by the editor's per-keystroke typing frame.
  return "soul";
}

function backgroundForFrame(id: string): Rgb {
  if (id.startsWith("user")) return BACKGROUNDS.user;
  if (id.includes("thinking")) return BACKGROUNDS.thinking;
  if (id.startsWith("tool-")) return BACKGROUNDS.tool;
  return BACKGROUNDS.nazar;
}

function sheetFrameId(id: string): string {
  return id.replace(TOOL_STATUS_SUFFIX, "");
}


function sheetAsset(key: SheetKey, assets: Record<SheetKey, SheetAsset> = SOURCE_SHEET_ASSETS): SheetAsset {
  return assets[key];
}

function sheet(key: SheetKey, assets: Record<SheetKey, SheetAsset> = SOURCE_SHEET_ASSETS): PngImage {
  const asset = sheetAsset(key, assets);
  const cached = sheetCache.get(asset.path);
  if (cached) return cached;
  const decoded = decodePngRgba(asset.path);
  sheetCache.set(asset.path, decoded);
  return decoded;
}

function frameSource(id: string): FrameSource {
  const sourceId = sheetFrameId(id);

  if (sourceId === "user") return { sheet: userAvatarSheet(), index: 0, id: sourceId };
  const mageMatch = sourceId.match(/^user-typing-(\d+)$/);
  if (mageMatch) {
    const index = modIndex(Number(mageMatch[1]), AVATAR_FRAME_COUNT);
    return { sheet: userAvatarSheet(), index, id: sourceId };
  }

  const exprMatch = sourceId.match(/^nazar-expr-(\d+)$/);
  if (exprMatch) {
    return { sheet: "nazar-expr", index: modIndex(Number(exprMatch[1]), AVATAR_FRAME_COUNT), id: sourceId };
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

function frameFor(id: string, assets: Record<SheetKey, SheetAsset> = SOURCE_SHEET_ASSETS): AvatarFrame {
  const source = frameSource(id);
  const asset = sheetAsset(source.sheet, assets);
  const cacheKey = `${asset.path}:${source.index}`;
  const cached = frameCache.get(cacheKey);
  if (cached) return { ...cached, id };

  const sheetImage = sheet(source.sheet, assets);
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

function avatarCellDimensions(): CellDimensions {
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
  return raw !== undefined ? Math.max(6, Math.min(20, raw)) : DEFAULT_AVATAR_ROWS;
}

function avatarColumns(rows = avatarRows()): number {
  // Choose interior columns so the *outer bordered panel* is square in pixel
  // terms, then render the sprite flush to that interior. Terminal cells are
  // font-dependent and borders consume cells, so this uses Nazar's calibrated
  // cell dimensions rather than assuming pi-tui's generic 9×18 fallback.
  return Math.max(1, Math.round((rows + 1) * terminalCellAspectRatio()) - 1);
}

function toolRows(): number {
  // Tools render at the same size as role avatars so the avatar column is
  // symmetric across all panel kinds (Nazar/Cico/Bash/etc all line up).
  // NAZAR_TOOL_ROWS can still override (back-compat with the legacy half-size).
  const raw = envPositiveInteger("NAZAR_TOOL_ROWS");
  if (raw !== undefined) return Math.max(6, Math.min(20, raw));
  return avatarRows();
}

// Native mosaic render is pure + deterministic, so memoise per
// (detail, frame, columns, rows, background) — redraws then blit cached lines.
const mosaicMemo = new Map<string, string[]>();

function ansiDetail(): "octant" | "sextant" | "block" {
  const renderer = uiRenderer();
  if (renderer === "half-block") return "block";
  return renderer;
}

function ansiAvatar(frameId: string, rows = avatarRows()): RenderedAvatar {
  const background = backgroundForFrame(frameId);
  const columns = avatarColumns(rows);
  // Render the 768² master directly as native mosaic ANSI — crisp,
  // dependency-free, no image protocol, no separate low-res asset set.
  const frame = frameFor(frameId);
  const detail = ansiDetail();
  let textLines: string[];
  if (detail === "block") {
    textLines = renderFrameAnsi(frame, background, columns, rows);
  } else {
    const key = `${detail}#${frameId}#${columns}#${rows}#${background.join(",")}`;
    let memo = mosaicMemo.get(key);
    if (!memo) {
      memo = renderMosaic(frame, background, columns, rows, detail as MosaicMode);
      mosaicMemo.set(key, memo);
    }
    textLines = memo;
  }
  const lines = textLines.map((line) => textAvatarLine(line));
  return { lines, width: columns, height: lines.length, backend: "ansi" };
}

type RenderAvatarOptions = {
  rows?: number;
  backend?: "auto" | AvatarRenderBackend;
};

function renderFrameAvatar(
  frameId: string,
  options: RenderAvatarOptions = {},
): RenderedAvatar | undefined {
  const rows = options.rows ?? avatarRows();
  return ansiAvatar(frameId, rows);
}

export function avatarLineWidth(line: AvatarRenderLine): number {
  return line.virtualWidth ?? visibleWidth(line.text);
}

function terminalCellAspectRatio(): number {
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
  options: RenderAvatarOptions = {},
): RenderedAvatar | undefined {
  return renderFrameAvatar(role === "user" ? "user" : "nazar", options);
}

export function renderUserTypingAvatar(
  frameIndex = 0,
  options: RenderAvatarOptions = {},
): RenderedAvatar | undefined {
  const index = modIndex(frameIndex, AVATAR_FRAME_COUNT);
  return renderFrameAvatar(index === 0 ? "user" : `user-typing-${index}`, options);
}

export function renderThinkingAvatar(
  frameIndex = 0,
  options: RenderAvatarOptions = {},
): RenderedAvatar | undefined {
  return renderFrameAvatar(`nazar-thinking-${modIndex(frameIndex, AVATAR_FRAME_COUNT)}`, options);
}

/**
 * Render Nazar showing a specific expression (contextual mood). The frame index
 * is the canonical expression order: 0 neutral, 1 smile, 2 thinking, 3 surprised,
 * 4 concerned, 5 pleased, 6 focused, 7 laughing, 8 resting.
 */
export function renderNazarExpression(
  exprIndex = 0,
  options: RenderAvatarOptions = {},
): RenderedAvatar | undefined {
  return renderFrameAvatar(`nazar-expr-${modIndex(exprIndex, AVATAR_FRAME_COUNT)}`, options);
}

export function renderAnsiAvatarFrame(role: SpriteRole): string[] {
  return renderRoleAvatar(role, { backend: "ansi" })?.lines.map((line) => line.text) ?? [];
}

export function renderUserTypingAvatarFrame(frameIndex = 0): string[] {
  return renderUserTypingAvatar(frameIndex, { backend: "ansi" })?.lines.map((line) => line.text) ?? [];
}

export function renderThinkingAvatarFrame(frameIndex = 0): string[] {
  return renderThinkingAvatar(frameIndex, { backend: "ansi" })?.lines.map((line) => line.text) ?? [];
}


function toolFrameId(toolName: string, status: ToolAvatarStatus, hintText = "", frameIndex = 0): string {
  const kind = toolKind(toolName, hintText);
  // Tool sprites are Nazar's eye showing the running tool (a pulsing coloured
  // iris). Running cycles the iris's own 9 pulse frames; pending/ok/error show
  // frame 0. (The legacy globe-borrow machinery is retired with the orb.)
  if (status === "running") {
    return `tool-${kind}-${modIndex(frameIndex, AVATAR_FRAME_COUNT)}-running`;
  }
  return `tool-${kind}-0-${status}`;
}

export function renderToolPixelAvatar(
  toolName: string,
  status: ToolAvatarStatus = "pending",
  frameIndex = Date.now() / 180,
  hintText = "",
  options: RenderAvatarOptions = {},
): RenderedAvatar | undefined {
  const effectiveFrame = status === "running" ? frameIndex : 0;
  return renderFrameAvatar(toolFrameId(toolName, status, hintText, effectiveFrame), { ...options, rows: options.rows ?? toolRows() });
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
