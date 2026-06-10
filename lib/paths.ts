// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * paths.ts — canonical path resolution for the balaur package.
 *
 * Replaces Bun's `import.meta.dir` with a Node-native `fileURLToPath` helper, and
 * centralizes the three roots every extension must agree on:
 *   - packageRoot() — the installed package (holds src/, lib/, assets/, …).
 *   - dataDir()     — PRIVATE data: runtimes, models, logs, the SQLite index.
 *   - vaultRoot()   — the owner's PRIVATE Markdown vault.
 *
 * Resolution is lazy so VAULT_PATH / BALAUR_DATA_DIR can be set per-process (and per-test).
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/** Directory of the calling module without relying on Bun's `import.meta.dir`. */
export function moduleDir(metaUrl: string): string {
  return dirname(fileURLToPath(metaUrl));
}

/** The installed package root (the dir that holds src/, lib/, assets/, …). */
export function packageRoot(): string {
  return join(moduleDir(import.meta.url), "..");
}

/**
 * Private DATA root — runtimes, models, logs, the disposable SQLite index, and
 * the default vault. Resolution order:
 *   1. BALAUR_DATA_DIR (explicit override)
 *   2. $XDG_DATA_HOME/balaur, else ~/.local/share/balaur
 *   3. <packageRoot>/.balaur-data (last-resort fallback when there is no HOME)
 */
export function dataDir(): string {
  if (process.env.BALAUR_DATA_DIR) return process.env.BALAUR_DATA_DIR;
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  const xdg = process.env.XDG_DATA_HOME || (home ? join(home, ".local", "share") : "");
  if (xdg) return join(xdg, "balaur");
  return join(packageRoot(), ".balaur-data");
}

/** Private local model cache used by the built-in llama.cpp provider. */
export function modelsDir(): string {
  return join(dataDir(), "models");
}

/**
 * Vault root — the owner's PRIVATE data, kept OUTSIDE the code package. Resolution order:
 *   1. VAULT_PATH (the explicit, authoritative override)
 *   2. dataDir() (the default — keeps the vault next to runtimes/models)
 */
export function vaultRoot(): string {
  return process.env.VAULT_PATH || dataDir();
}
