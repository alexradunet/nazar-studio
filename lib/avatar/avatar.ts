// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync } from "node:fs";
import { join } from "node:path";
import { packageRoot } from "../paths.ts";
import { AVATAR_FIELDS } from "../design/tokens.ts";
import { renderMosaic, type MosaicMode } from "./mosaic.ts";
import { decodePngRgba, extractFrame, type AvatarFrame, type PngImage, type Rgb } from "./png.ts";

export type AvatarId = "balaur" | "user";
export type AvatarRenderMode = MosaicMode;

const TOOL_EYES: Record<string, string> = {
  vault_search: "search",
  vault_write: "write",
  vault_get: "read",
  vault_duplicates: "merge",
  skill: "skill",
};

export interface RenderAvatarOptions {
  mode?: AvatarRenderMode;
  rows?: number;
  frame?: number;
  background?: Rgb;
}

const DEFAULT_ROWS = 11;
const sheetCache = new Map<string, PngImage>();
const frameCache = new Map<string, AvatarFrame>();

function sheetPath(id: AvatarId): string {
  return join(packageRoot(), "assets", "avatars", id === "user" ? "soul.png" : "balaur.png");
}

function toolSheetPath(toolName: string): string {
  const eye = TOOL_EYES[toolName] ?? (toolName.startsWith("skill") ? TOOL_EYES.skill : "idle");
  return join(packageRoot(), "assets", "avatars", "tools", `eye-${eye}.png`);
}

function loadSheetPath(path: string): PngImage {
  const cached = sheetCache.get(path);
  if (cached) return cached;
  if (!existsSync(path)) throw new Error(`Avatar sheet not found: ${path}`);
  const sheet = decodePngRgba(path);
  sheetCache.set(path, sheet);
  return sheet;
}

function avatarColumns(rows: number): number {
  return Math.max(1, Math.round(rows * 2.1));
}

function loadFrame(keyPrefix: string, path: string, frame: number): AvatarFrame {
  const index = Math.max(0, Math.min(8, frame | 0));
  const key = `${keyPrefix}:${index}`;
  const cached = frameCache.get(key);
  if (cached) return cached;
  const out = extractFrame(loadSheetPath(path), index, key);
  frameCache.set(key, out);
  return out;
}

function renderFrame(frame: AvatarFrame, background: Rgb, options: RenderAvatarOptions): string[] {
  const rows = options.rows ?? DEFAULT_ROWS;
  return renderMosaic(frame, background, avatarColumns(rows), rows, options.mode ?? "sextant");
}

function renderSheet(
  keyPrefix: string,
  path: string,
  background: Rgb,
  options: RenderAvatarOptions,
): string[] {
  const frame = loadFrame(keyPrefix, path, options.frame ?? 0);
  return renderFrame(frame, options.background ?? background, options);
}

export function renderAvatar(id: AvatarId, options: RenderAvatarOptions = {}): string[] {
  return renderSheet(id, sheetPath(id), AVATAR_FIELDS[id], options);
}

export function renderToolAvatar(toolName: string, options: RenderAvatarOptions = {}): string[] {
  return renderSheet(
    `tool:${toolName}`,
    toolSheetPath(toolName),
    AVATAR_FIELDS.tool,
    options,
  );
}
