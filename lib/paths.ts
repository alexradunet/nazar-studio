// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * paths.ts — canonical path resolution for the pi-nazar-studio package.
 *
 * Replaces Bun's `import.meta.dir` with a Node-native `fileURLToPath` helper, and
 * centralizes the three roots every extension must agree on:
 *   - packageRoot() — the installed package (holds extensions/, lib/, assets/, …).
 *   - dataDir()     — PRIVATE data: runtimes, models, logs, the SQLite index.
 *   - vaultRoot()   — the owner's PRIVATE Markdown (memory/ + journal/diet/sport).
 *
 * Resolution is lazy so VAULT_PATH / NAZAR_DATA_DIR can be set per-process (and per-test).
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/** Directory of the calling module — a Node/jiti/tsx/vitest-safe `import.meta.dir`. */
export function moduleDir(metaUrl: string): string {
  return dirname(fileURLToPath(metaUrl));
}

/** The installed package root (the dir that holds extensions/, lib/, assets/, …). */
export function packageRoot(): string {
  return join(moduleDir(import.meta.url), "..");
}

/**
 * Private DATA root — runtimes, models, logs, the disposable SQLite index, and (by
 * default) the vault. Resolution order:
 *   1. NAZAR_DATA_DIR (explicit override)
 *   2. $XDG_DATA_HOME/nazar, else ~/.local/share/nazar
 *   3. <packageRoot>/.nazar-data (last-resort fallback when there is no HOME)
 */
export function dataDir(): string {
  if (process.env.NAZAR_DATA_DIR) return process.env.NAZAR_DATA_DIR;
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  const xdg = process.env.XDG_DATA_HOME || (home ? join(home, ".local", "share") : "");
  return xdg ? join(xdg, "nazar") : join(packageRoot(), ".nazar-data");
}

/**
 * Vault root — the owner's PRIVATE data, kept OUTSIDE the code package. Resolution order:
 *   1. VAULT_PATH (the explicit, authoritative override)
 *   2. dataDir() (the default — keeps memory/journal next to runtimes/models)
 */
export function vaultRoot(): string {
  return process.env.VAULT_PATH || dataDir();
}
