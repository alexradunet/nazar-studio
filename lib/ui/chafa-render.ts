// SPDX-License-Identifier: AGPL-3.0-or-later
// Chafa sextant ANSI cache for Nazar's avatars.
//
// We render the PNG master sheets to Unicode/ANSI character art with Chafa
// (sextant 2×3 mosaics, TRUECOLOR) AHEAD OF TIME and cache the resulting escape
// strings keyed by (sheet, frame, rows). At runtime the renderer does a cheap
// synchronous lookup and blits the cached lines — so Pi's redraw-on-every-change
// stays inexpensive (no per-draw image work, unlike the old Kitty path).
//
// The cache is produced by `scripts/build-chafa-cache.ts` (which uses the
// `chafa-wasm` npm package). If the cache file is absent, `chafaLinesFor`
// returns undefined and pixel-avatar.ts falls back to its built-in half-block
// renderer reading the same masters — so the avatars always render.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { moduleDir } from "../paths.ts";

export const CHAFA_CACHE_PATH = join(moduleDir(import.meta.url), "..", "..", "assets", "avatars", "chafa-cache.json");

/** Map of "<sheet>#<frame>#<rows>" -> ANSI lines (one string per terminal row). */
export type ChafaCache = Record<string, string[]>;

let cache: ChafaCache | null | undefined; // undefined = not yet loaded, null = no cache present

function ensureLoaded(): void {
  if (cache !== undefined) return;
  try {
    cache = existsSync(CHAFA_CACHE_PATH) ? (JSON.parse(readFileSync(CHAFA_CACHE_PATH, "utf8")) as ChafaCache) : null;
  } catch {
    cache = null;
  }
}

export function chafaCacheKey(sheet: string, frame: number, rows: number): string {
  return `${sheet}#${frame}#${rows}`;
}

/**
 * Look up cached Chafa ANSI lines for a sheet frame at a given row height.
 * `sheet` is the master file basename without extension (e.g. "nazar", "soul",
 * "eye-git"). Returns undefined when the cache is missing the entry.
 */
export function chafaLinesFor(sheet: string, frame: number, rows: number): string[] | undefined {
  ensureLoaded();
  if (!cache) return undefined;
  return cache[chafaCacheKey(sheet, frame, rows)];
}

/** Test seam / hot-reload: drop the in-memory cache so the next call re-reads disk. */
export function resetChafaCache(): void {
  cache = undefined;
}
