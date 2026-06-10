// SPDX-License-Identifier: AGPL-3.0-or-later
/** Bun SQLite wrapper for the disposable local FTS index. */
import { Database } from "bun:sqlite";

export type SqliteDatabase = Database;

export function sqliteAvailable(): boolean {
  return true;
}

export function openDatabase(filename: string): SqliteDatabase {
  return new Database(filename);
}
