// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * paths.ts — canonical path resolution for the balaur package.
 *
 * Uses Bun's module metadata and centralizes the three roots every extension
 * must agree on:
 *   - packageRoot() — the installed package (holds src/, lib/, assets/, …).
 *   - dataDir()     — PRIVATE data: runtimes, logs, and the SQLite index.
 *   - vaultRoot()   — the owner's PRIVATE Markdown vault.
 *
 * Resolution is lazy so VAULT_PATH / BALAUR_DATA_DIR can be set per-process (and per-test).
 */
import { dirname, join } from "node:path";
import { runtimeEnv } from "./env.ts";

/** Directory of a module URL using Bun's native file URL helper. */
export function moduleDir(metaUrl: string): string {
  return dirname(Bun.fileURLToPath(metaUrl));
}

/** The installed package root (the dir that holds src/, lib/, assets/, …). */
export function packageRoot(): string {
  return join(import.meta.dir, "..");
}

/**
 * Private DATA root — runtimes, logs, and the disposable SQLite index.
 * Resolution order:
 *   1. BALAUR_DATA_DIR (explicit override)
 *   2. $XDG_DATA_HOME/balaur, else ~/.local/share/balaur
 *   3. <packageRoot>/.balaur-data (last-resort fallback when there is no HOME)
 */
export function dataDir(): string {
  const env = runtimeEnv();
  if (env.BALAUR_DATA_DIR) return env.BALAUR_DATA_DIR;
  const home = env.HOME ?? env.USERPROFILE ?? "";
  const xdg = env.XDG_DATA_HOME || (home ? join(home, ".local", "share") : "");
  if (xdg) return join(xdg, "balaur");
  return join(packageRoot(), ".balaur-data");
}

/**
 * Vault root — the owner's PRIVATE data, kept OUTSIDE the code package. Resolution order:
 *   1. VAULT_PATH (the explicit, authoritative override)
 *   2. dataDir() (the default — keeps the vault next to runtime state)
 */
export function vaultRoot(): string {
  return runtimeEnv().VAULT_PATH || dataDir();
}
