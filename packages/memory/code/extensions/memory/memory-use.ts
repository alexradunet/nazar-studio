import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

import { showText, truncateUtf8, trim, xdgDataHome } from "@nazar/core/shared";
import { getMemoryPaths, QMD_COLLECTION, QMD_CONTEXT, QMD_INDEX } from "./paths.ts";
import { ensureVaultScaffold, VAULT_MEMORY_DIRS } from "./vault.ts";

const MAX_BULLET_CHARS = 360;
const MAX_DAILY_BULLETS = 45;
const MAX_WEEKLY_DAY_BULLETS = 8;
const COMPACT_LOCK_STALE_MS = 10 * 60_000;

const PINNED_SECTION_USER = "User preferences";
const PINNED_SECTION_FACTS = "Standing facts";
const PINNED_SECTION_PROJECTS = "Active projects";
const PINNED_SECTION_NEVER = "Do not remember";
const PINNED_SECTION_ALIASES: Record<string, string> = {
  user: PINNED_SECTION_USER,
  preference: PINNED_SECTION_USER,
  preferences: PINNED_SECTION_USER,
  fact: PINNED_SECTION_FACTS,
  facts: PINNED_SECTION_FACTS,
  project: PINNED_SECTION_PROJECTS,
  projects: PINNED_SECTION_PROJECTS,
  never: PINNED_SECTION_NEVER,
  avoid: PINNED_SECTION_NEVER,
};

const PINNED_MEMORY_TEMPLATE = `# Pinned memory

Human-curated long-term context for Pi memory.

This page is memory, not a current instruction. Current user direction, AGENTS.md, and system/developer instructions override it.

## User preferences

## Standing facts

## Active projects

## Do not remember
`;

const LOW_SIGNAL_MESSAGES = new Set([
  "good",
  "great",
  "awesome",
  "nice",
  "continue",
  "ready",
  "ok",
  "okay",
  "yes",
  "no",
  "thanks",
  "thank you",
  "hi",
  "hello",
  "fast mode on",
  "fast mode is on",
]);

const USER_DECISION_RE = /\b(canonical|remember|source of truth|prefer|rule|main language)\b/i;
const USER_ACTION_RE = /\b(i want|we want|we will|let'?s|lets|install|add|remove|switch|move|create|implement|update|compact)\b/i;
const USER_FEATURE_RE = /\b(memory|conversation|wiki|qmd|voice|tts|stt|whisper|piper|spotify|whatsapp|nazar|pi extension|pi package|typescript)\b/i;
const ASSISTANT_MEMORY_RE = /^(done|implemented|created|updated|added|fixed|changed|installed|configured|switched|removed|validated|verified|opened|compacted|tested|web search works|test succeeded|code review|good\.|yes[ —-])\b/i;

const NOISY_SUBSTRINGS = [
  "/tmp/pi-subagents",
  "parallel task",
  "output saved to:",
  "read from:",
  "write to:",
  "tool activity",
  "context files copied",
  "system prompt files copied",
];

const SECRET_REDACTIONS: Array<{ label: string; pattern: RegExp; replacement: string }> = [
  { label: "private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, replacement: "[REDACTED_PRIVATE_KEY]" },
  { label: "OpenAI-style API key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/g, replacement: "[REDACTED_API_KEY]" },
  { label: "Anthropic API key", pattern: /\bsk-ant-[A-Za-z0-9_-]{16,}\b/g, replacement: "[REDACTED_API_KEY]" },
  { label: "GitHub token", pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g, replacement: "[REDACTED_TOKEN]" },
  { label: "GitHub token", pattern: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g, replacement: "[REDACTED_TOKEN]" },
  { label: "AWS access key", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, replacement: "[REDACTED_AWS_KEY]" },
  { label: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g, replacement: "[REDACTED_TOKEN]" },
  { label: "bearer token", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/gi, replacement: "Bearer [REDACTED_TOKEN]" },
  { label: "URL credentials", pattern: /\b([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s@]+@/gi, replacement: "$1[REDACTED_CREDENTIALS]@" },
  { label: "credential assignment", pattern: /\b(api[_ -]?key|secret|token|password|passwd|pwd|authorization)\b\s*[:=]\s*["']?[^"'\s`]{6,}/gi, replacement: "$1=[REDACTED_SECRET]" },
];

type Role = "user" | "assistant";

type MemoryMessage = {
  path: string;
  timestamp: Date;
  role: Role;
  text: string;
};

export type CompactOptions = {
  session?: string;
  sessionDir?: string;
  dryRun?: boolean;
};

export type CompactResult = {
  code: number;
  text: string;
};

type ExecResult = {
  stdout?: string;
  stderr?: string;
  code?: number | null;
};

function now(): Date {
  return new Date();
}

export function getRuntimePaths(): { RUNTIME_DIR: string; COMPACT_LOCK_DIR: string } {
  const RUNTIME_DIR = process.env.XDG_RUNTIME_DIR ? join(process.env.XDG_RUNTIME_DIR, "pi-rollups") : join(xdgDataHome(), "pi-rollups", "run");
  return { RUNTIME_DIR, COMPACT_LOCK_DIR: join(RUNTIME_DIR, "memory-compact.lock") };
}

function rollupDirs(): { DAILY_DIR: string; WEEKLY_DIR: string } {
  const paths = getMemoryPaths();
  return {
    DAILY_DIR: join(paths.ROLLUPS_DIR, "daily"),
    WEEKLY_DIR: join(paths.ROLLUPS_DIR, "weekly"),
  };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function localDateString(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function localToday(): string {
  return localDateString(now());
}

function dateFromDay(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}

function dayString(date: Date): string {
  return localDateString(date);
}

function isoWeek(day: string): string {
  const date = dateFromDay(day);
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${pad2(week)}`;
}

function mondayOfIsoWeek(week: string): Date {
  const [yearText, weekText] = week.split("-W");
  const year = Number(yearText);
  const weekNumber = Number(weekText);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + (weekNumber - 1) * 7);
  return new Date(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate());
}

function isClosedDay(day: string, today = localToday()): boolean {
  return day < today;
}

function isClosedWeek(week: string, today = localToday()): boolean {
  const monday = mondayOfIsoWeek(week);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return dayString(sunday) < today;
}

let ensuredDirsKey: string | undefined;

function ensureDirs(): void {
  const paths = getMemoryPaths();
  const { DAILY_DIR, WEEKLY_DIR } = rollupDirs();
  const runtimeDirs = [
    paths.MEMORY_ROOT,
    paths.PAGES_DIR,
    paths.AI_PAGES_DIR,
    paths.PERSONAL_PAGES_DIR,
    paths.ROLLUPS_DIR,
    paths.STATE_DIR,
    DAILY_DIR,
    WEEKLY_DIR,
  ];
  const vault = paths.VAULT_DIR;
  const vaultDirs = vault
    ? [...VAULT_MEMORY_DIRS.map((name) => join(vault, name)), paths.LLM_WIKI_PAGES_DIR]
    : [];
  // Self-healing memo: reuse one path set for both the cache key and the existence
  // re-check, so an externally deleted runtime or vault directory is rebuilt on the
  // next turn without a /reload while still skipping the mkdir storm on the hot path.
  const required = [...runtimeDirs, ...vaultDirs, paths.PINNED_MEMORY_PAGE];
  const key = required.map((path) => resolve(path)).join("\0");
  if (ensuredDirsKey === key && required.every((path) => existsSync(path))) return;

  ensureVaultScaffold(paths);
  for (const path of runtimeDirs) mkdirSync(path, { recursive: true });
  ensurePinnedMemoryPage(paths);
  ensuredDirsKey = key;
}

export function ensureMemoryStorage(): void {
  ensureDirs();
}

function ensurePinnedMemoryPage(paths = getMemoryPaths()): void {
  mkdirSync(dirname(paths.PINNED_MEMORY_PAGE), { recursive: true });
  if (!existsSync(paths.PINNED_MEMORY_PAGE)) writeFileSync(paths.PINNED_MEMORY_PAGE, PINNED_MEMORY_TEMPLATE, "utf8");
}

function hasErrorCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === code);
}

function compactLockInfo(): string {
  const { COMPACT_LOCK_DIR } = getRuntimePaths();
  try {
    return readFileSync(join(COMPACT_LOCK_DIR, "owner.json"), "utf8").trim();
  } catch {
    return "";
  }
}

function acquireCompactLock(): CompactResult | undefined {
  const { COMPACT_LOCK_DIR } = getRuntimePaths();
  mkdirSync(dirname(COMPACT_LOCK_DIR), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      mkdirSync(COMPACT_LOCK_DIR);
      writeFileSync(
        join(COMPACT_LOCK_DIR, "owner.json"),
        `${JSON.stringify({ pid: process.pid, startedAt: now().toISOString(), cwd: process.cwd() })}\n`,
        "utf8",
      );
      return undefined;
    } catch (error) {
      if (!hasErrorCode(error, "EEXIST")) throw error;

      const ageMs = existsSync(COMPACT_LOCK_DIR) ? Date.now() - statSync(COMPACT_LOCK_DIR).mtimeMs : 0;
      if (ageMs > COMPACT_LOCK_STALE_MS) {
        rmSync(COMPACT_LOCK_DIR, { recursive: true, force: true });
        continue;
      }

      const owner = compactLockInfo();
      return {
        code: 2,
        text: `Memory compaction is already running. Lock: ${COMPACT_LOCK_DIR}${owner ? `\nOwner: ${owner}` : ""}\n`,
      };
    }
  }

  return { code: 2, text: `Could not acquire memory compaction lock: ${COMPACT_LOCK_DIR}\n` };
}

function withCompactLock(action: () => CompactResult): CompactResult {
  const { COMPACT_LOCK_DIR } = getRuntimePaths();
  const lockError = acquireCompactLock();
  if (lockError) return lockError;
  try {
    return action();
  } finally {
    rmSync(COMPACT_LOCK_DIR, { recursive: true, force: true });
  }
}

function normalizePinnedBullet(content: string): string {
  return content.replace(/\s+/g, " ").replace(/^[-\s]+/g, "").trim();
}

function rememberSectionAndText(args: string[]): { section: string; text: string } {
  const first = args[0]?.toLowerCase();
  if (first && PINNED_SECTION_ALIASES[first]) return { section: PINNED_SECTION_ALIASES[first], text: args.slice(1).join(" ") };
  return { section: PINNED_SECTION_FACTS, text: args.join(" ") };
}

function appendPinnedBullet(markdown: string, section: string, content: string): string {
  const bullet = normalizePinnedBullet(content);
  const bulletLine = `- ${bullet}`;
  const lines = markdown.trimEnd().split(/\r?\n/);
  if (lines.some((line) => line.trim() === bulletLine)) return markdown.endsWith("\n") ? markdown : `${markdown}\n`;

  let start = lines.findIndex((line) => line.trim() === `## ${section}`);
  if (start === -1) {
    if (lines.length > 0 && lines.at(-1)?.trim() !== "") lines.push("");
    lines.push(`## ${section}`, "", bulletLine, "");
    return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
  }

  let end = start + 1;
  while (end < lines.length && !lines[end].startsWith("## ")) end += 1;

  const before = lines.slice(0, end);
  while (before.length > start + 1 && before.at(-1)?.trim() === "") before.pop();
  const after = lines.slice(end);
  return `${[...before, bulletLine, "", ...after].join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

function secretLabels(text: string): string[] {
  const labels = new Set<string>();
  for (const { label, pattern } of SECRET_REDACTIONS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) labels.add(label);
    pattern.lastIndex = 0;
  }
  return [...labels];
}

function redactSecrets(text: string): string {
  let redacted = text;
  for (const { pattern, replacement } of SECRET_REDACTIONS) {
    pattern.lastIndex = 0;
    redacted = redacted.replace(pattern, replacement);
    pattern.lastIndex = 0;
  }
  return redacted;
}

export function pinnedMemoryText(): string {
  ensureDirs();
  return readFileSync(getMemoryPaths().PINNED_MEMORY_PAGE, "utf8");
}

const DURABLE_MEMORY_INJECT_BYTES = 8 * 1024;

function pinnedMemoryBullets(markdown: string): string[] {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- ") && line.length > 2);
}

export function durablePinnedDigest(): string {
  ensureDirs();
  const bullets = pinnedMemoryBullets(pinnedMemoryText());
  return bullets.length > 0 ? bullets.join("\n") : "";
}

export function durableRollupDigest(maxBullets = 8): string {
  ensureDirs();
  const { DAILY_DIR, WEEKLY_DIR } = rollupDirs();
  const today = localToday();

  const weeklyFiles = markdownFiles(WEEKLY_DIR)
    .map((path) => ({ path, week: basename(path, ".md") }))
    .filter(({ week }) => isClosedWeek(week, today))
    .sort((a, b) => b.week.localeCompare(a.week));
  if (weeklyFiles.length > 0) {
    const latest = weeklyFiles[0];
    const bullets = extractSectionBullets(readIfExists(latest.path), "Days", maxBullets);
    if (bullets.length > 0) {
      return [`Recent weekly rollup (${latest.week}):`, ...bullets].join("\n");
    }
  }

  const dailyFiles = markdownFiles(DAILY_DIR)
    .map((path) => ({ path, day: basename(path, ".md") }))
    .filter(({ day }) => isClosedDay(day, today))
    .sort((a, b) => b.day.localeCompare(a.day));
  if (dailyFiles.length === 0) return "";

  const latest = dailyFiles[0];
  const bullets = extractSectionBullets(readIfExists(latest.path), "Memory", maxBullets);
  if (bullets.length === 0) return "";
  return [`Recent daily rollup (${latest.day}):`, ...bullets].join("\n");
}

export function buildDurableMemoryContext(maxBytes = DURABLE_MEMORY_INJECT_BYTES): string {
  const chunks: string[] = [];
  const pinned = durablePinnedDigest();
  if (pinned) chunks.push(`### Pinned memory\n${pinned}`);
  const rollup = durableRollupDigest();
  if (rollup) chunks.push(rollup);
  if (chunks.length === 0) return "";
  return truncateUtf8(chunks.join("\n\n"), maxBytes);
}

export function rememberPinnedMemory(args: string[]): CompactResult {
  ensureDirs();
  const paths = getMemoryPaths();
  const { section, text } = rememberSectionAndText(args);
  const bullet = normalizePinnedBullet(text);
  if (!bullet) return { code: 1, text: "Nothing to remember. Usage: /memory remember [user|fact|project|never] <text>\n" };

  const sensitive = secretLabels(bullet);
  if (sensitive.length > 0) {
    return {
      code: 2,
      text: `Refusing to pin memory that looks like a secret (${sensitive.join(", ")}). Store secrets outside memory; remember only a sanitized/generalized note.\n`,
    };
  }

  const before = readFileSync(paths.PINNED_MEMORY_PAGE, "utf8");
  const after = appendPinnedBullet(before, section, bullet);
  if (after !== before) writeFileSync(paths.PINNED_MEMORY_PAGE, after, "utf8");
  return { code: 0, text: `Pinned memory updated (${section}).\nPinned memory: ${paths.PINNED_MEMORY_PAGE}\n` };
}

export function forgetPinnedMemory(query: string): CompactResult {
  ensureDirs();
  const paths = getMemoryPaths();
  const needle = query.trim().toLowerCase();
  if (!needle) return { code: 1, text: "Nothing to forget. Usage: /memory forget <unique substring>\n" };

  const before = readFileSync(paths.PINNED_MEMORY_PAGE, "utf8");
  const lines = before.split(/\r?\n/);
  const matches = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.trim().startsWith("- ") && line.toLowerCase().includes(needle));

  if (matches.length === 0) return { code: 1, text: `No pinned memory bullet matched: ${query}\n` };
  if (matches.length > 1) {
    const matched = matches.map(({ line }) => line.trim()).join("\n");
    return {
      code: 1,
      text: `Ambiguous pinned memory forget query matched ${matches.length} bullets. Use a more specific substring.\n${matched}\n`,
    };
  }

  const removeIndex = matches[0].index;
  const kept = lines.filter((_line, index) => index !== removeIndex);
  writeFileSync(paths.PINNED_MEMORY_PAGE, `${kept.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`, "utf8");
  return { code: 0, text: `Removed 1 pinned memory bullet.\nPinned memory: ${paths.PINNED_MEMORY_PAGE}\n` };
}

function sortByMtime(paths: string[]): string[] {
  return paths.sort((a, b) => {
    const ma = statSync(a).mtimeMs;
    const mb = statSync(b).mtimeMs;
    return ma === mb ? a.localeCompare(b) : ma - mb;
  });
}

function walkFiles(root: string, predicate: (path: string) => boolean): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (entry.isFile() && predicate(path)) out.push(path);
    }
  }

  return out;
}

function sessionFiles(root: string): string[] {
  return sortByMtime(walkFiles(root, (path) => path.endsWith(".jsonl")));
}

function parseTimestamp(value: unknown): Date {
  if (typeof value !== "string" || !value) return now();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return now();
  return date;
}

function textParts(content: unknown): string[] {
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return [];
  const texts: string[] = [];
  for (const part of content) {
    if (part && typeof part === "object" && (part as { type?: unknown }).type === "text" && typeof (part as { text?: unknown }).text === "string") {
      texts.push((part as { text: string }).text);
    }
  }
  return texts;
}

function iterSessionMessages(paths: string[]): MemoryMessage[] {
  const messages: MemoryMessage[] = [];

  for (const path of paths) {
    let lines: string[];
    try {
      lines = readFileSync(path, "utf8").split(/\r?\n/);
    } catch (error) {
      console.error(`warning: cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line.trim()) continue;

      let event: unknown;
      try {
        event = JSON.parse(line);
      } catch {
        console.error(`warning: invalid JSON in ${path}:${i + 1}`);
        continue;
      }

      if (!event || typeof event !== "object") continue;
      const message = (event as { message?: unknown }).message;
      if (!message || typeof message !== "object") continue;
      const role = (message as { role?: unknown }).role;
      if (role !== "user" && role !== "assistant") continue;

      const texts = textParts((message as { content?: unknown }).content);
      if (texts.length === 0) continue;

      messages.push({
        path,
        timestamp: parseTimestamp((event as { timestamp?: unknown }).timestamp),
        role,
        text: texts.join("\n"),
      });
    }
  }

  return messages;
}

function groupByDay(messages: MemoryMessage[]): Map<string, MemoryMessage[]> {
  const grouped = new Map<string, MemoryMessage[]>();
  for (const message of messages) {
    const day = localDateString(message.timestamp);
    const bucket = grouped.get(day) || [];
    bucket.push(message);
    grouped.set(day, bucket);
  }
  return new Map([...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function truncate(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function compactText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<file name="[^"]+">/g, " ")
    .replace(/<\/file>/g, " ")
    .split(/\n\s*(Ran|Validated|Verified|Tested|Commands run):/u, 1)[0]
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-\s]+|[-\s]+$/g, "");
}

function normalizedLowSignal(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]+/g, "").trim();
}

function isNoisy(text: string): boolean {
  const lowered = text.toLowerCase();
  if (LOW_SIGNAL_MESSAGES.has(normalizedLowSignal(text))) return true;
  if (lowered.startsWith("task:") || lowered.startsWith("/fast")) return true;
  return NOISY_SUBSTRINGS.some((fragment) => lowered.includes(fragment));
}

function isMemoryWorthy(message: MemoryMessage): boolean {
  // Deliberately deterministic/offline: this heuristic is cheap, private, and testable,
  // but it is English- and verb-prefix-bound. An opt-in LLM summarizer can replace or
  // augment it later if higher recall becomes worth the token cost and nondeterminism.
  const text = compactText(message.text);
  if (!text || isNoisy(text)) return false;
  if (message.role === "user") {
    return USER_DECISION_RE.test(text) || (USER_ACTION_RE.test(text) && USER_FEATURE_RE.test(text));
  }
  return ASSISTANT_MEMORY_RE.test(text) || text.includes("Changed:") || text.includes("Updated:");
}

function debrandMemoryText(text: string): string {
  // Legacy migration shim for old pre-2026-05-25 raw session wording.
  // TODO: remove after 2026-08-01 once old session compaction is no longer needed.
  const legacy = "nazar";
  return text
    .replace(new RegExp(`\\b${legacy}-memory\\b`, "g"), "Pi memory")
    .replace(new RegExp(`\\b${legacy}-wiki\\b`, "g"), "memory_search")
    .replace(new RegExp(`\\b${legacy}-voice\\b`, "g"), "Pi voice")
    .replace(new RegExp(`\\b${legacy}_`, "g"), "pi_")
    .replace(new RegExp(`\\b${legacy.toUpperCase()}_`, "g"), "PI_")
    .replace(new RegExp(`\\.pi/extensions/${legacy}\\b`, "g"), "packages/memory/code/extensions/memory")
    .replace(new RegExp(`/${legacy}\\b`, "g"), "/memory")
    .replace(new RegExp(`llm-wiki/${legacy}-memory`, "g"), "memory/pages")
    .replace(new RegExp(`${legacy}-pinned-memory\\.md`, "g"), "pinned-memory.md")
    .replace(new RegExp(`\\b${legacy[0].toUpperCase()}${legacy.slice(1)}\\b`, "g"), "Pi")
    .replace(new RegExp(`(?<![/\\w-])${legacy}(?![/\\w-])`, "g"), "pi");
}

function memoryBullet(message: MemoryMessage): string {
  const prefix = message.role === "user" ? "User direction" : "Outcome";
  return `- ${prefix}: ${truncate(redactSecrets(debrandMemoryText(compactText(message.text))), MAX_BULLET_CHARS)}`;
}

function dedupeBullets(bullets: Iterable<string>): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const bullet of bullets) {
    const key = normalizedLowSignal(bullet).slice(0, 180);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(bullet);
  }
  return unique;
}

function dailyMarkdown(day: string, messages: MemoryMessage[]): string {
  const status = isClosedDay(day) ? "closed" : "open";
  const bullets = dedupeBullets(messages.filter(isMemoryWorthy).map(memoryBullet)).slice(0, MAX_DAILY_BULLETS);
  if (bullets.length === 0) {
    bullets.push("- No durable memory extracted. Raw Pi session history remains in Pi's default session storage or the explicit source path used for this refresh.");
  }

  return redactSecrets(
    [
      `# Daily memory: ${day}`,
      "",
      "Generated by the project-local Pi memory extension after Pi compaction or explicit test/helper invocation.",
      `Status: **${status}**.`,
      "",
      "Source: Pi JSONL session file(s) from Pi's default session storage or an explicit session/session-dir input.",
      "This note intentionally omits tool calls, tool outputs, timestamps, and full transcripts.",
      "",
      "## Memory",
      ...bullets,
      "",
    ].join("\n"),
  );
}

function writeDaily(grouped: Map<string, MemoryMessage[]>): string[] {
  const { DAILY_DIR } = rollupDirs();
  const written: string[] = [];
  for (const [day, messages] of grouped) {
    const path = join(DAILY_DIR, `${day}.md`);
    writeFileSync(path, dailyMarkdown(day, messages), "utf8");
    written.push(path);
  }
  return written;
}

function readIfExists(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function extractSectionBullets(markdown: string, section: string, maxLines: number): string[] {
  const out: string[] = [];
  let inside = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith("## ")) {
      inside = line.trim() === `## ${section}`;
      continue;
    }
    if (inside && line.startsWith("#")) inside = false;
    if (inside && line.startsWith("- ")) {
      out.push(line);
      if (out.length >= maxLines) break;
    }
  }
  return out;
}

function markdownFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => join(dir, name))
    .sort();
}

function syncGeneratedDir(dir: string, written: string[]): void {
  const keep = new Set(written.map((path) => resolve(path)));
  for (const path of markdownFiles(dir)) {
    if (!keep.has(resolve(path))) rmSync(path, { force: true });
  }
}

function writeWeekly(dailyPaths: string[]): string[] {
  const { WEEKLY_DIR } = rollupDirs();
  const today = localToday();
  const byWeek = new Map<string, string[]>();

  for (const path of dailyPaths) {
    const day = basename(path, ".md");
    if (!isClosedDay(day, today)) continue;
    const week = isoWeek(day);
    const bucket = byWeek.get(week) || [];
    bucket.push(path);
    byWeek.set(week, bucket);
  }

  const written: string[] = [];
  for (const [week, paths] of [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const lines = [
      `# Weekly memory: ${week}`,
      "",
      "Generated from closed daily memory notes by the project-local Pi memory extension.",
      "",
      "## Days",
    ];

    for (const path of paths.sort()) {
      const day = basename(path, ".md");
      lines.push("", `### [${day}](${relative(WEEKLY_DIR, path)})`);
      const bullets = extractSectionBullets(readIfExists(path), "Memory", MAX_WEEKLY_DAY_BULLETS);
      lines.push(...(bullets.length ? bullets : ["- No durable daily memory extracted."]));
    }

    lines.push("");
    const out = join(WEEKLY_DIR, `${week}.md`);
    writeFileSync(out, redactSecrets(lines.join("\n")), "utf8");
    written.push(out);
  }

  syncGeneratedDir(WEEKLY_DIR, written);
  return written;
}

function compactPathList(options: CompactOptions): string[] {
  if (options.session) return existsSync(options.session) ? [options.session] : [];
  if (options.sessionDir) return sessionFiles(options.sessionDir);
  return [];
}

export function compactMemory(options: CompactOptions = {}): CompactResult {
  if (options.dryRun) {
    const paths = compactPathList(options);
    const messages = iterSessionMessages(paths);
    const grouped = groupByDay(messages);
    return {
      code: 0,
      text: `Would compact ${paths.length} session file(s), ${messages.length} text message(s), ${grouped.size} day chunk(s).\nTool calls/results are intentionally excluded from memory rollups.\n`,
    };
  }

  return withCompactLock(() => {
    ensureDirs();
    const { DAILY_DIR, WEEKLY_DIR } = rollupDirs();

    const paths = compactPathList(options);
    const messages = iterSessionMessages(paths);
    const grouped = groupByDay(messages);

    if (paths.length === 0) {
      const dailyPaths = markdownFiles(DAILY_DIR);
      const weeklyPaths = writeWeekly(dailyPaths);
      return { code: 0, text: `No session source supplied or no session files found. Existing rollups preserved.\nWeekly closed-day rollups: ${weeklyPaths.length} -> ${WEEKLY_DIR}\n` };
    }

    if (grouped.size === 0) return { code: 1, text: "No compactable user/assistant text messages found.\n" };

    const { DAILY_DIR: dailyDir, WEEKLY_DIR: weeklyDir } = rollupDirs();
    const writtenDaily = writeDaily(grouped);
    const dailyPaths = markdownFiles(dailyDir);
    const weeklyPaths = writeWeekly(dailyPaths);

    const lines = [
      `Compacted ${paths.length} session file(s).`,
      `Text messages considered: ${messages.length}; tool calls/results omitted.`,
      `Daily chunks written: ${writtenDaily.length} -> ${dailyDir}`,
      `Weekly closed-day rollups: ${weeklyPaths.length} -> ${weeklyDir}`,
    ];

    return { code: 0, text: `${lines.join("\n")}\n` };
  });
}

export function compactSessionFile(sessionFile: string | undefined): CompactResult {
  if (!sessionFile) return { code: 1, text: "No current Pi session file is available for memory rollup refresh.\n" };
  return compactMemory({ session: sessionFile });
}

export function memoryStatusText(): string {
  ensureDirs();
  const paths = getMemoryPaths();
  const { DAILY_DIR, WEEKLY_DIR } = rollupDirs();
  const { COMPACT_LOCK_DIR } = getRuntimePaths();
  const lockStatus = existsSync(COMPACT_LOCK_DIR) ? `${COMPACT_LOCK_DIR} (present)` : `${COMPACT_LOCK_DIR} (free)`;

  return [
    "Optional memory status",
    `Project root: ${paths.PROJECT_ROOT}`,
    `Nazar vault: ${paths.VAULT_DIR || "(not configured; using ignored local dev fallback)"}`,
    `Nazar control dir: ${paths.NAZAR_DIR}`,
    `LLM wiki pages dir: ${paths.LLM_WIKI_PAGES_DIR}`,
    `Memory root: ${paths.MEMORY_ROOT}`,
    `Rollups dir: ${paths.ROLLUPS_DIR}`,
    `State dir: ${paths.STATE_DIR}`,
    "Pi raw sessions: Pi default session storage (not repo-local); .pi/settings.json does not set sessionDir.",
    `Compaction lock: ${lockStatus}`,
    `Pinned memory page: ${paths.PINNED_MEMORY_PAGE}`,
    `Durable pages dir: ${paths.PAGES_DIR}`,
    `AI pages dir: ${paths.AI_PAGES_DIR}`,
    `Personal pages dir: ${paths.PERSONAL_PAGES_DIR}`,
    `QMD index: ${QMD_INDEX}`,
    `QMD collections: ${memoryCollectionSpecs(paths).map((spec) => spec.name).join(", ")}`,
    `Daily chunks: ${markdownFiles(DAILY_DIR).length}`,
    `Weekly chunks: ${markdownFiles(WEEKLY_DIR).length}`,
  ].join("\n");
}

function unquoteWhole(value: string): string {
  const text = value.trim();
  if (text.length >= 2) {
    const first = text[0];
    const last = text[text.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) return text.slice(1, -1).trim();
  }
  return text;
}

async function qmd(pi: ExtensionAPI, args: string[], timeout = 60_000): Promise<string> {
  const result = (await pi.exec("qmd", ["--index", QMD_INDEX, ...args], { timeout })) as ExecResult;
  if (result.code !== 0) {
    throw new Error(`qmd ${args.join(" ")} failed: ${trim(result.stderr) || trim(result.stdout)}`);
  }
  return result.stdout ?? "";
}

export type MemorySearchScope = "default" | "archive";

type MemoryCollectionSpec = {
  name: string;
  path: string;
  mask: string;
  scopes: MemorySearchScope[];
  description: string;
};

function memoryCollectionSpecs(paths = getMemoryPaths()): MemoryCollectionSpec[] {
  if (!paths.VAULT_DIR) {
    return [{ name: QMD_COLLECTION, path: paths.PAGES_DIR, mask: "**/*.md", scopes: ["default"], description: "durable memory pages" }];
  }

  return [
    { name: "memory-inbox", path: join(paths.VAULT_DIR, "00_Inbox"), mask: "**/*.md", scopes: ["default"], description: "shared human/AI capture inbox" },
    { name: "memory-projects", path: join(paths.VAULT_DIR, "01_Projects"), mask: "**/*.md", scopes: ["default"], description: "active personal projects" },
    { name: "memory-areas", path: join(paths.VAULT_DIR, "02_Areas"), mask: "**/*.md", scopes: ["default"], description: "ongoing areas and responsibilities" },
    { name: "memory-resources", path: join(paths.VAULT_DIR, "03_Resources"), mask: "**/*.md", scopes: ["default"], description: "stable resources and references" },
    { name: "memory-pinned", path: paths.NAZAR_DIR, mask: "pinned-memory.md", scopes: ["default"], description: "pinned durable facts/preferences" },
    { name: "memory-llm-wiki", path: paths.LLM_WIKI_PAGES_DIR, mask: "**/*.md", scopes: ["default"], description: "AI-maintained compiled LLM wiki" },
    { name: "memory-archive", path: join(paths.VAULT_DIR, "04_Archive"), mask: "**/*.md", scopes: ["archive"], description: "cold archived memory" },
  ];
}

function isMemorySearchScope(value: string | undefined): value is MemorySearchScope {
  return value === "default" || value === "archive";
}

function normalizeSearchScope(value?: string): MemorySearchScope {
  return isMemorySearchScope(value) ? value : "default";
}

function memoryCollectionsForScope(scope: MemorySearchScope, paths = getMemoryPaths()): MemoryCollectionSpec[] {
  const normalized = normalizeSearchScope(scope);
  return memoryCollectionSpecs(paths).filter((spec) => spec.scopes.includes(normalized));
}

function hasQmdCollection(listOutput: string, name: string): boolean {
  return listOutput.split("\n").some((line) => line.trim().startsWith(`${name} `) || line.trim() === name);
}

function collectionShowMatchesPages(showOutput: string, pagesDir: string, mask = "**/*.md"): boolean {
  const pathMatch = showOutput.match(/^\s*Path:\s*(.+?)\s*$/m);
  const patternMatch = showOutput.match(/^\s*Pattern:\s*(.+?)\s*$/m);
  if (!pathMatch) return false;
  const shownPath = pathMatch[1].trim();
  const shownPattern = patternMatch?.[1]?.trim() || "";
  return resolve(shownPath) === resolve(pagesDir) && shownPattern === mask;
}

async function ensureQmdCollection(pi: ExtensionAPI, spec: MemoryCollectionSpec, listOutput: string): Promise<void> {
  let hasCollection = hasQmdCollection(listOutput, spec.name);

  if (hasCollection) {
    const show = await qmd(pi, ["collection", "show", spec.name], 30_000).catch(() => "");
    if (!collectionShowMatchesPages(show, spec.path, spec.mask)) {
      await qmd(pi, ["collection", "remove", spec.name], 60_000);
      hasCollection = false;
    }
  }

  if (!hasCollection) {
    try {
      await qmd(pi, ["collection", "add", spec.path, "--name", spec.name, "--mask", spec.mask], 60_000);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes(`Collection '${spec.name}' already exists`)) throw error;
    }
  }
  await qmd(pi, ["context", "add", `qmd://${spec.name}`, QMD_CONTEXT], 30_000);
}

export async function ensureMemoryIndex(pi: ExtensionAPI): Promise<void> {
  ensureDirs();
  const list = await qmd(pi, ["collection", "list"], 30_000).catch(() => "");
  for (const spec of memoryCollectionSpecs()) await ensureQmdCollection(pi, spec, list);
}

export async function updateMemoryIndexText(pi: ExtensionAPI): Promise<string> {
  await ensureMemoryIndex(pi);
  return qmd(pi, ["update"], 120_000);
}

export async function searchMemoryText(pi: ExtensionAPI, query: string, limit = 5, scope: MemorySearchScope = "default"): Promise<string> {
  const normalizedQuery = unquoteWhole(query);
  await updateMemoryIndexText(pi);
  const specs = memoryCollectionsForScope(scope);
  if (specs.length === 0) return `No memory collections are configured for scope '${scope}'.\n`;
  if (specs.length === 1) return qmd(pi, ["search", normalizedQuery, "-c", specs[0].name, "--md", "-n", String(limit)], 120_000);

  const chunks: string[] = [];
  for (const spec of specs) {
    const out = await qmd(pi, ["search", normalizedQuery, "-c", spec.name, "--md", "-n", String(limit)], 120_000);
    if (out.trim()) chunks.push(`## ${spec.name}\n\n${out.trim()}\n`);
  }
  return chunks.length > 0 ? chunks.join("\n") : "No memory results.\n";
}

export async function memoryIndexStatusText(pi: ExtensionAPI): Promise<string> {
  await ensureMemoryIndex(pi);
  return qmd(pi, ["status"], 30_000);
}

export async function listMemoryIndexText(pi: ExtensionAPI, path = ""): Promise<string> {
  await ensureMemoryIndex(pi);
  const specs = memoryCollectionSpecs();
  const target = unquoteWhole(path);
  if (!target && specs.length > 1) {
    return [`Memory QMD collections:`, ...specs.map((spec) => `- ${spec.name}: ${spec.path} (${spec.scopes.join(", ")}) — ${spec.description}`), ""].join("\n");
  }
  const collectionNames = new Set(specs.map((spec) => spec.name));
  const firstPart = target.split(/[\\/]/, 1)[0];
  const qmdTarget = collectionNames.has(firstPart) ? target : `${specs[0].name}${target ? `/${target}` : ""}`;
  return qmd(pi, ["ls", qmdTarget], 30_000);
}

export async function getMemoryIndexText(pi: ExtensionAPI, target: string): Promise<string> {
  await ensureMemoryIndex(pi);
  return qmd(pi, ["get", unquoteWhole(target)], 30_000);
}

function memoryUsage(): string {
  const paths = getMemoryPaths();
  return `/memory - manage Pi memory\n\nUsage:\n  /memory status\n  /memory search [--scope default|archive] <query>\n  /memory update\n  /memory index\n  /memory list [path]\n  /memory ls [path]\n  /memory get <path-or-docid>\n  /memory pinned\n  /memory remember [user|fact|project|never] <text>\n  /memory forget <unique substring>\n\nUse Pi's built-in /compact command to compact the current chat. After successful built-in compaction, this extension refreshes generated rollups in ${paths.ROLLUPS_DIR}.\nPinned memory: ${paths.PINNED_MEMORY_PAGE}\nDurable/search root: ${paths.PAGES_DIR}\nQMD index: ${QMD_INDEX}, collections: ${memoryCollectionSpecs(paths).map((spec) => spec.name).join(", ")}\n`;
}

function parseSearchCommandArgs(args: string[]): { query: string; scope: MemorySearchScope; invalidScope?: string } {
  const queryParts: string[] = [];
  let scope: MemorySearchScope = "default";
  let invalidScope: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const part = args[i];
    if (part === "--scope" && args[i + 1]) {
      const requested = args[i + 1];
      if (isMemorySearchScope(requested)) scope = requested;
      else invalidScope = requested;
      i += 1;
    } else if (part.startsWith("--scope=") && part.length > "--scope=".length) {
      const requested = part.slice("--scope=".length);
      if (isMemorySearchScope(requested)) scope = requested;
      else invalidScope = requested;
    } else {
      queryParts.push(part);
    }
  }
  return { query: queryParts.join(" ").trim(), scope, invalidScope };
}

export function registerMemoryUse(pi: ExtensionAPI): void {
  pi.registerCommand("memory", {
    description: "Manage Pi memory: /memory status|search|update|index|list|ls|get|pinned|remember|forget",
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const command = parts[0] || "status";
      const rest = parts.slice(1);

      if (command === "status") {
        await showText(ctx, "memory", memoryStatusText(), "Memory status updated");
        return;
      }

      if (command === "search") {
        const { query, scope, invalidScope } = parseSearchCommandArgs(rest);
        if (invalidScope) {
          await showText(ctx, "memory", `Unknown memory scope '${invalidScope}'. Use one of: default, archive.`, "Memory search needs a valid scope", "warning");
          return;
        }
        await showText(ctx, "memory", query ? await searchMemoryText(pi, query, 5, scope) : "Usage: /memory search [--scope default|archive] <query>", query ? "Memory search complete" : "Memory search needs text");
        return;
      }

      if (command === "update" || command === "refresh") {
        await showText(ctx, "memory", await updateMemoryIndexText(pi), "Memory index updated");
        return;
      }

      if (command === "index" || command === "qmd-status") {
        await showText(ctx, "memory", await memoryIndexStatusText(pi), "Memory index status updated");
        return;
      }

      if (command === "list" || command === "ls") {
        await showText(ctx, "memory", await listMemoryIndexText(pi, rest.join(" ").trim()), "Memory pages listed");
        return;
      }

      if (command === "get") {
        const target = rest.join(" ").trim();
        await showText(ctx, "memory", target ? await getMemoryIndexText(pi, target) : "Usage: /memory get <path-or-docid>", target ? "Memory page loaded" : "Memory get needs a target");
        return;
      }

      if (command === "pinned") {
        await showText(ctx, "memory", pinnedMemoryText(), "Pinned memory shown");
        return;
      }

      if (command === "remember") {
        const result = rememberPinnedMemory(rest);
        await showText(ctx, "memory", result.text, result.code === 0 ? "Pinned memory updated" : "Pinned memory update failed");
        return;
      }

      if (command === "forget") {
        const result = forgetPinnedMemory(rest.join(" "));
        await showText(ctx, "memory", result.text, result.code === 0 ? "Pinned memory updated" : "Pinned memory update failed");
        return;
      }

      await showText(ctx, "memory", memoryUsage(), "Memory help updated");
    },
  });
}

