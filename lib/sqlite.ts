// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * sqlite.ts — thin wrapper around Node's built-in SQLite (node:sqlite).
 *
 * Why a wrapper:
 *   1. node:sqlite emits a one-time "SQLite is an experimental feature"
 *      ExperimentalWarning. In a TUI that line is noise, so we install a narrow
 *      filter that swallows ONLY that warning and passes everything else through.
 *   2. node:sqlite is loaded lazily (after the filter is installed) via
 *      createRequire, so the warning can never escape before we suppress it and a
 *      missing/old runtime degrades gracefully instead of crashing extension load.
 *
 * node:sqlite ships SQLite compiled with FTS5, which is all the memory index needs.
 * The Markdown vault remains the source of truth; this DB is a disposable accelerator.
 */
import { createRequire } from "node:module";
import type { DatabaseSync } from "node:sqlite";

const require_ = createRequire(import.meta.url);

let filterInstalled = false;
function installExperimentalWarningFilter(): void {
  if (filterInstalled) return;
  filterInstalled = true;
  const original = process.emitWarning.bind(process);
  // Override is runtime-compatible with all emitWarning overloads.
  (process as { emitWarning: typeof process.emitWarning }).emitWarning = ((
    warning: string | Error,
    ...args: unknown[]
  ) => {
    const text = typeof warning === "string" ? warning : warning?.message ?? "";
    const opt = args[0] as string | { type?: string } | undefined;
    const type = typeof opt === "string" ? opt : opt?.type;
    if (type === "ExperimentalWarning" && /sqlite/i.test(String(text))) return;
    return (original as (...a: unknown[]) => void)(warning, ...args);
  }) as typeof process.emitWarning;
}

type SqliteModule = { DatabaseSync: new (filename: string) => DatabaseSync };
let mod: SqliteModule | undefined;

/** True when node:sqlite is importable in this runtime (Node 22.5+, flag-free on 23.4+/24). */
export function sqliteAvailable(): boolean {
  installExperimentalWarningFilter();
  try {
    if (!mod) mod = require_("node:sqlite") as SqliteModule;
    return !!mod?.DatabaseSync;
  } catch {
    return false;
  }
}

/** Open (or create) an on-disk SQLite database. Throws if node:sqlite is unavailable. */
export function openDatabase(filename: string): DatabaseSync {
  installExperimentalWarningFilter();
  if (!mod) mod = require_("node:sqlite") as SqliteModule;
  return new mod.DatabaseSync(filename);
}
