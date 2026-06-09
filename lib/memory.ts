// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * memory.ts — Nazar memory engine.
 *
 * Durable memory lives as plain Markdown pages with YAML frontmatter under
 * vault/memory/<type>/<slug>.md — the SOURCE OF TRUTH — indexed by a disposable node:sqlite
 * FTS5 accelerator. Frontmatter is only an optional retrieval aid (`whenToUse`, tags, pinned).
 * The body is user-shaped Markdown; Nazar must not impose a life/coding/project schema.
 *
 * SKILLS (procedures) are NOT here — they're Pi-native skill files (skills/*.md) that Pi
 * discovers + injects + invokes (/skill:name). Memory = saved pages; skills = Pi. See SELF_EVOLUTION.md.
 */
import type { DatabaseSync } from "node:sqlite";
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { openDatabase } from "./sqlite.ts";
import { vaultRoot } from "./paths.ts";

// Re-exported so extensions (e.g. vault.ts) keep importing the vault root from here.
export { vaultRoot } from "./paths.ts";

const memDir = (): string => join(vaultRoot(), "memory");
const dbPath = (): string => join(vaultRoot(), ".sqlite", "index.db");

// FTS5 index over memory pages. title/whentouse/tags/body are searchable; the rest are stored.
const FTS_DDL =
  "CREATE VIRTUAL TABLE IF NOT EXISTS memory USING fts5(" +
  "path UNINDEXED, title, whentouse, tags, type UNINDEXED, body, pinned UNINDEXED)";
const BODY_COL = 5; // 0-based column index of `body` for snippet()

function openDb(): DatabaseSync {
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
    .replace(/[̀-ͯ]/g, "")  // strip combining diacritics (ă, î, ș, ț …)
    .replace(/[^\w\s-]/g, "")          // drop anything not word/space/hyphen (also kills / and .)
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

/** Parse YAML-ish frontmatter (flat key: value) + body. */
function parsePage(txt: string): { meta: Record<string, string>; body: string } {
  const m = txt.match(/^---\n([\s\S]*?)\n---\n?/);
  const meta: Record<string, string> = {};
  if (m) for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return { meta, body: txt.replace(/^---\n[\s\S]*?\n---\n?/, "") };
}

const cleanTags = (tags?: string[]): string[] =>
  (tags ?? []).map((t) => String(t).replace(/[\[\],]/g, " ").trim()).filter(Boolean);

export interface MemoryInput {
  title: string;
  content: string;
  type?: string;        // arbitrary folder/category slug; defaults to notes
  tags?: string[];
  whenToUse?: string;   // optional retrieval hint in the user's terms
  pinned?: boolean;     // always-in-context; use only when explicitly requested
  outcome?: "success" | "failure"; // ReasoningBank-style lesson tag: a validated approach, or a guardrail (what to avoid)
}

function indexRow(db: DatabaseSync, r: {
  path: string; title: string; whenToUse: string; tags: string; type: string; body: string; pinned: boolean;
}): void {
  db.prepare("DELETE FROM memory WHERE path = ?").run(r.path);
  db.prepare(
    "INSERT INTO memory (path, title, whentouse, tags, type, body, pinned) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(r.path, r.title, r.whenToUse, r.tags, r.type, r.body, r.pinned ? "1" : "0");
}

/** Create or update a memory page, then refresh its index row. */
export function writeMemory(m: MemoryInput): { path: string; title: string } {
  const title = (m.title ?? "").trim() || "untitled";
  const type = (m.type ?? "notes").toLowerCase().replace(/[^\w-]/g, "") || "notes";
  const dir = join(memDir(), type);
  let path = join(dir, `${slugify(title)}.md`);
  // Disambiguate if a DIFFERENT title already occupies this slug.
  if (existsSync(path)) {
    const existing = parsePage(readFileSync(path, "utf8")).meta.title;
    if (existing && existing !== title) path = join(dir, `${slugify(title)}-${shortHash(title)}.md`);
  }
  mkdirSync(dirname(path), { recursive: true });
  const now = new Date().toISOString();
  const created = existsSync(path) ? (parsePage(readFileSync(path, "utf8")).meta.created ?? now) : now;
  const tags = cleanTags(m.tags);
  const whenToUse = (m.whenToUse ?? "").trim();

  const fm: string[] = [`title: ${JSON.stringify(title)}`, `type: ${type}`];
  if (whenToUse) fm.push(`whenToUse: ${JSON.stringify(whenToUse)}`);
  const outcome = m.outcome === "success" || m.outcome === "failure" ? m.outcome : undefined;
  if (outcome) fm.push(`outcome: ${outcome}`);
  fm.push(`tags: [${tags.join(", ")}]`);
  if (m.pinned) fm.push("pinned: true");
  fm.push(`created: ${created}`, `updated: ${now}`);
  writeFileSync(path, `---\n${fm.join("\n")}\n---\n\n${String(m.content ?? "").trim()}\n`);

  const db = openDb();
  try {
    indexRow(db, { path, title, whenToUse, tags: tags.join(" "), type, body: String(m.content ?? ""), pinned: !!m.pinned });
  } finally { db.close(); }
  return { path, title };
}

export interface Hit { path: string; title: string; type: string; whenToUse: string; snippet: string; }

/** Keyword/full-text recall over memory pages. Token-OR match — forgiving and FTS-safe. */
export function searchMemory(query: string, k = 5): Hit[] {
  const limit = Math.max(1, Math.min(50, (k ?? 5) | 0 || 5));
  const db = openDb();
  try {
    const tokens = (String(query ?? "").toLowerCase().match(/[a-z0-9]+/gi) ?? []).slice(0, 16);
    const sel =
      "SELECT path, title, type, whentouse AS whenToUse, " +
      `snippet(memory, ${BODY_COL}, '[', ']', ' … ', 12) AS snippet FROM memory `;
    // The FTS DB is an accelerator, not truth. Over-fetch and drop stale rows so a deleted
    // Markdown page cannot keep influencing recall until the next explicit reindex.
    const candidateLimit = Math.min(50, Math.max(limit * 3, limit));
    const rows = !tokens.length
      ? db.prepare(sel.replace(`snippet(memory, ${BODY_COL}, '[', ']', ' … ', 12)`, "'' ") + "LIMIT ?")
        .all(candidateLimit) as unknown as Hit[]
      : db.prepare(sel + "WHERE memory MATCH ? ORDER BY rank LIMIT ?")
        .all(tokens.map((t) => `"${t}"`).join(" OR "), candidateLimit) as unknown as Hit[];
    return rows.filter((h) => existsSync(h.path)).slice(0, limit);
  } catch {
    return []; // never let a query crash the agent
  } finally { db.close(); }
}

/** All pinned pages (always-in-context). */
function pinnedPages(): Hit[] {
  const db = openDb();
  try {
    const rows = db.prepare("SELECT path, title, type, whentouse AS whenToUse, '' AS snippet FROM memory WHERE pinned = '1' LIMIT 8").all() as unknown as Hit[];
    return rows.filter((h) => existsSync(h.path));
  } catch { return []; } finally { db.close(); }
}

/** Read a full memory page by exact title. */
export function getMemory(title: string): string | null {
  const db = openDb();
  try {
    const row = db.prepare("SELECT path FROM memory WHERE title = ? LIMIT 1").get(title) as { path?: string } | undefined;
    return row?.path && existsSync(row.path) ? readFileSync(row.path, "utf8") : null;
  } finally { db.close(); }
}

/** Rebuild the disposable FTS index from the Markdown pages (source of truth). */
export function reindexMemory(): number {
  const db = openDb();
  try {
    db.exec("DROP TABLE IF EXISTS memory");
    db.exec(FTS_DDL.replace("IF NOT EXISTS ", ""));
    if (!existsSync(memDir())) return 0;
    const files: string[] = [];
    const walk = (d: string): void => {
      for (const name of readdirSync(d)) {
        const p = join(d, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name.endsWith(".md") && name.toLowerCase() !== "readme.md") files.push(p);
      }
    };
    walk(memDir());
    for (const p of files) {
      const { meta, body } = parsePage(readFileSync(p, "utf8"));
      indexRow(db, {
        path: p, title: meta.title ?? p, whenToUse: meta.whenToUse ?? meta.whentouse ?? "",
        tags: meta.tags ?? "", type: meta.type ?? "notes", body,
        pinned: /^(true|1|yes)$/i.test(meta.pinned ?? ""),
      });
    }
    return files.length;
  } finally { db.close(); }
}

/**
 * Find clusters of likely-duplicate memory pages (same normalized title) — the "organize"
 * half of growth. Detection only; the agent proposes the merge. Never deletes.
 */
export function findDuplicates(): { title: string; paths: string[] }[] {
  const db = openDb();
  try {
    const rows = db.prepare("SELECT path, title FROM memory").all() as unknown as { path: string; title: string }[];
    const groups = new Map<string, { title: string; paths: string[] }>();
    for (const r of rows) {
      const key = slugify(r.title || r.path);
      const g = groups.get(key) ?? { title: r.title, paths: [] };
      g.paths.push(r.path);
      groups.set(key, g);
    }
    return [...groups.values()].filter((g) => g.paths.length > 1);
  } catch { return []; } finally { db.close(); }
}

/**
 * Build a memory-recall block for a turn: pinned pages (always) + relevant saved pages.
 * Returns "" when there's nothing. Callers must decide whether the current model is private
 * enough for automatic recall. (Skills are handled by Pi natively, not here.)
 */
export function recallContext(message: string, k = 3): string {
  const pinned = pinnedPages();
  const matched = (typeof message === "string" && message.trim()) ? searchMemory(message, k) : [];
  const seen = new Set<string>();
  const hits: Hit[] = [];
  for (const h of [...pinned, ...matched]) {
    if (seen.has(h.path)) continue;
    seen.add(h.path);
    hits.push(h);
  }
  if (!hits.length) return "";
  const lines = hits.map((h) => `• [[${h.title}]] (${h.type})${h.snippet ? ` — ${h.snippet}` : ""}`).join("\n");
  return `Relevant notes from your memory:\n${lines}\n\n`;
}
