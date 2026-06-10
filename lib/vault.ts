// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Johnny Decimal vault engine.
 *
 * The vault is Balaur's source of truth: user notes, AI notes, skills, durable facts,
 * compacted sub-conversation summaries, and inbox items. Markdown stays canonical;
 * SQLite FTS is only a disposable accelerator.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { vaultRoot as ownerRoot } from "./paths.ts";
import { openDatabase, type SqliteDatabase } from "./sqlite.ts";

export type VaultKind = "user-note" | "ai-note" | "skill" | "memory" | "summary";
export type VaultStatus = "inbox" | "approved" | "rejected";

export interface VaultInput {
  title: string;
  content: string;
  jd?: string;
  kind?: VaultKind;
  status?: VaultStatus;
  tags?: string[];
  whenToUse?: string;
  pinned?: boolean;
}

export interface VaultHit {
  path: string;
  title: string;
  jd: string;
  kind: string;
  status: string;
  whenToUse: string;
  snippet: string;
}

const vaultDir = (): string => join(ownerRoot(), "vault");
const dbPath = (): string => join(ownerRoot(), ".sqlite", "vault-index.db");

const FTS_DDL =
  "CREATE VIRTUAL TABLE IF NOT EXISTS vault USING fts5(" +
  "path UNINDEXED, title, jd, kind UNINDEXED, status UNINDEXED, whentouse, tags, body, pinned UNINDEXED)";
const BODY_COL = 7;

function openDb(): SqliteDatabase {
  mkdirSync(dirname(dbPath()), { recursive: true });
  const db = openDatabase(dbPath());
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(FTS_DDL);
  return db;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 64)
    .replace(/^-|-$/g, "") || "note";
}

function shortHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36).slice(0, 6);
}

function cleanJd(jd?: string): string {
  const raw = String(jd ?? "30.00").trim();
  const m = raw.match(/^(\d{2})[.-](\d{2})$/);
  return m ? `${m[1]}.${m[2]}` : "30.00";
}

function jdArea(jd: string): string {
  const major = Number(jd.slice(0, 2));
  const start = Math.floor(major / 10) * 10;
  return `${String(start).padStart(2, "0")}-${String(start + 9).padStart(2, "0")}`;
}

function cleanTags(tags?: string[]): string[] {
  return (tags ?? []).map((t) => String(t).replace(/[\[\],]/g, " ").trim()).filter(Boolean);
}

function cleanKind(kind?: string): VaultKind {
  return kind === "user-note" || kind === "ai-note" || kind === "skill" || kind === "memory" || kind === "summary"
    ? kind
    : "user-note";
}

function cleanStatus(status?: string): VaultStatus {
  return status === "inbox" || status === "approved" || status === "rejected" ? status : "approved";
}

function parsePage(txt: string): { meta: Record<string, string>; body: string } {
  const m = txt.match(/^---\n([\s\S]*?)\n---\n?/);
  const meta: Record<string, string> = {};
  if (m) {
    for (const line of m[1].split("\n")) {
      const i = line.indexOf(":");
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
  return { meta, body: txt.replace(/^---\n[\s\S]*?\n---\n?/, "") };
}

function indexRow(db: SqliteDatabase, r: {
  path: string;
  title: string;
  jd: string;
  kind: string;
  status: string;
  whenToUse: string;
  tags: string;
  body: string;
  pinned: boolean;
}): void {
  db.prepare("DELETE FROM vault WHERE path = ?").run(r.path);
  db.prepare(
    "INSERT INTO vault (path, title, jd, kind, status, whentouse, tags, body, pinned) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(r.path, r.title, r.jd, r.kind, r.status, r.whenToUse, r.tags, r.body, r.pinned ? "1" : "0");
}

export function writeVaultEntry(input: VaultInput): { path: string; title: string; jd: string; kind: VaultKind; status: VaultStatus } {
  const title = (input.title ?? "").trim() || "untitled";
  const jd = cleanJd(input.jd);
  const kind = cleanKind(input.kind);
  const status = cleanStatus(input.status);
  const dir = join(vaultDir(), jdArea(jd), jd);
  let path = join(dir, `${slugify(title)}.md`);

  if (existsSync(path)) {
    const existing = parsePage(readFileSync(path, "utf8")).meta.title;
    if (existing && existing !== title) path = join(dir, `${slugify(title)}-${shortHash(title)}.md`);
  }

  mkdirSync(dirname(path), { recursive: true });
  const now = new Date().toISOString();
  const created = existsSync(path) ? (parsePage(readFileSync(path, "utf8")).meta.created ?? now) : now;
  const tags = cleanTags(input.tags);
  const whenToUse = (input.whenToUse ?? "").trim();
  const body = String(input.content ?? "").trim();

  const fm = [
    `title: ${JSON.stringify(title)}`,
    `jd: ${JSON.stringify(jd)}`,
    `kind: ${kind}`,
    `status: ${status}`,
  ];
  if (whenToUse) fm.push(`whenToUse: ${JSON.stringify(whenToUse)}`);
  fm.push(`tags: [${tags.join(", ")}]`);
  if (input.pinned) fm.push("pinned: true");
  fm.push(`created: ${created}`, `updated: ${now}`);

  writeFileSync(path, `---\n${fm.join("\n")}\n---\n\n${body}\n`);

  const db = openDb();
  try {
    indexRow(db, { path, title, jd, kind, status, whenToUse, tags: tags.join(" "), body, pinned: !!input.pinned });
  } finally {
    db.close();
  }

  return { path, title, jd, kind, status };
}

export function searchVault(query: string, k = 5): VaultHit[] {
  const limit = Math.max(1, Math.min(50, (k ?? 5) | 0 || 5));
  const db = openDb();
  try {
    const tokens = (String(query ?? "").toLowerCase().match(/[a-z0-9]+/gi) ?? []).slice(0, 16);
    const sel =
      "SELECT path, title, jd, kind, status, whentouse AS whenToUse, " +
      `snippet(vault, ${BODY_COL}, '[', ']', ' … ', 12) AS snippet FROM vault `;
    const candidateLimit = Math.min(50, Math.max(limit * 3, limit));
    const rows = !tokens.length
      ? db.prepare(sel.replace(`snippet(vault, ${BODY_COL}, '[', ']', ' … ', 12)`, "'' ") + "LIMIT ?").all(candidateLimit) as unknown as VaultHit[]
      : db.prepare(sel + "WHERE vault MATCH ? ORDER BY rank LIMIT ?").all(tokens.map((t) => `"${t}"`).join(" OR "), candidateLimit) as unknown as VaultHit[];
    return rows.filter((h) => existsSync(h.path)).slice(0, limit);
  } catch {
    return [];
  } finally {
    db.close();
  }
}

export function getVaultEntry(title: string): string | null {
  const db = openDb();
  try {
    const row = db.prepare("SELECT path FROM vault WHERE title = ? LIMIT 1").get(title) as { path?: string } | undefined;
    return row?.path && existsSync(row.path) ? readFileSync(row.path, "utf8") : null;
  } finally {
    db.close();
  }
}

export function findVaultDuplicates(): { title: string; paths: string[] }[] {
  const db = openDb();
  try {
    const rows = db.prepare("SELECT path, title FROM vault").all() as unknown as { path: string; title: string }[];
    const groups = new Map<string, { title: string; paths: string[] }>();
    for (const r of rows) {
      const key = slugify(r.title || r.path);
      const g = groups.get(key) ?? { title: r.title, paths: [] };
      g.paths.push(r.path);
      groups.set(key, g);
    }
    return [...groups.values()].filter((g) => g.paths.length > 1);
  } catch {
    return [];
  } finally {
    db.close();
  }
}

export function reindexVault(): number {
  const db = openDb();
  try {
    db.exec("DROP TABLE IF EXISTS vault");
    db.exec(FTS_DDL.replace("IF NOT EXISTS ", ""));
    if (!existsSync(vaultDir())) return 0;
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (name.endsWith(".md") && name.toLowerCase() !== "readme.md") files.push(path);
      }
    };
    walk(vaultDir());
    for (const path of files) {
      const { meta, body } = parsePage(readFileSync(path, "utf8"));
      indexRow(db, {
        path,
        title: meta.title ?? path,
        jd: meta.jd ?? "30.00",
        kind: meta.kind ?? "user-note",
        status: meta.status ?? "approved",
        whenToUse: meta.whenToUse ?? meta.whentouse ?? "",
        tags: meta.tags ?? "",
        body,
        pinned: /^(true|1|yes)$/i.test(meta.pinned ?? ""),
      });
    }
    return files.length;
  } finally {
    db.close();
  }
}

export function vaultPath(): string {
  return vaultDir();
}
