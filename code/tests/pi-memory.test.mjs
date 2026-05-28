import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import {
  addJournalEntry,
  compactMemory,
  compactSessionFile,
  ensureMemoryIndex,
  forgetPinnedMemory,
  getRuntimePaths,
  memoryStatusText,
  registerMemoryUse,
  rememberPinnedMemory,
  searchMemoryText,
} from "../extensions/memory/memory-use.ts";
import { getMemoryPaths, QMD_COLLECTION, QMD_CONTEXT, QMD_INDEX } from "../extensions/memory/paths.ts";
import { defaultVoiceModelDir, writeNazarSetupConfig } from "../extensions/nazar/setup-store.ts";

const DAY = "2026-05-24";
const ENV_KEYS = [
  "PI_PROJECT_ROOT",
  "PI_MEMORY_LLM_WIKI",
  "PI_MEMORY_DAILY_SESSIONS_DIR",
  "PI_MEMORY_MAIN_SESSION_DIR",
  "PI_MEMORY_SUB_SESSION_DIR",
  "PI_MEMORY_DIR",
  "PI_MEMORY_WIKI_DIR",
  "PI_MEMORY_ACTIVE_FILE",
  "PI_MEMORY_LOCK_DIR",
  "PI_MEMORY_ARCHIVE_DIR",
  "PI_MEMORY_ROOT",
  "PI_MEMORY_PAGES_DIR",
  "PI_AI_MEMORY_DIR",
  "PI_HUMAN_MEMORY_DIR",
  "PI_PERSONAL_MEMORY_DIR",
  "NAZAR_HOME",
  "NAZAR_CONFIG_DIR",
  "NAZAR_STATE_DIR",
  "NAZAR_DATA_DIR",
  "XDG_RUNTIME_DIR",
  "XDG_DATA_HOME",
];

function makeProject(staleEnv = false) {
  const tmp = mkdtempSync(join(tmpdir(), "pi-memory-test-"));
  const root = join(tmp, "repo");
  mkdirSync(root, { recursive: true });
  const previous = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));

  process.env.PI_PROJECT_ROOT = root;
  process.env.XDG_RUNTIME_DIR = join(tmp, "run");
  process.env.XDG_DATA_HOME = join(tmp, "data");
  process.env.NAZAR_CONFIG_DIR = join(tmp, "config");
  process.env.NAZAR_STATE_DIR = join(tmp, "state");
  process.env.NAZAR_DATA_DIR = join(tmp, "nazar-data");

  for (const key of ENV_KEYS) {
    if (!["PI_PROJECT_ROOT", "XDG_RUNTIME_DIR", "XDG_DATA_HOME", "NAZAR_CONFIG_DIR", "NAZAR_STATE_DIR", "NAZAR_DATA_DIR"].includes(key)) delete process.env[key];
  }

  if (staleEnv) {
    process.env.PI_MEMORY_LLM_WIKI = join(tmp, "stale-llm-wiki");
    process.env.PI_MEMORY_DAILY_SESSIONS_DIR = join(tmp, "stale-daily");
    process.env.PI_MEMORY_DIR = join(tmp, "stale-memory");
    process.env.PI_MEMORY_WIKI_DIR = join(tmp, "stale-pages");
    process.env.PI_MEMORY_ACTIVE_FILE = join(tmp, "stale-active.md");
  }

  const restore = () => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };

  return { tmp, root, restore, paths: getMemoryPaths(root) };
}

function cleanup(ctx) {
  ctx.restore();
  rmSync(ctx.tmp, { recursive: true, force: true });
}

function message(role, text, timestamp = "2026-05-24T10:00:00.000Z") {
  return JSON.stringify({ timestamp, message: { role, content: text } });
}

function toolResult(text, timestamp = "2026-05-24T10:01:00.000Z") {
  return JSON.stringify({ timestamp, message: { role: "toolResult", content: text } });
}

function writeJsonl(path, lines) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
}

function findJsonl(root) {
  if (!existsSync(root)) return [];
  const out = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (entry.isFile() && path.endsWith(".jsonl")) out.push(path);
    }
  }
  return out.sort();
}

test("root Pi settings load moved code resources and no repo sessionDir", () => {
  const settings = JSON.parse(readFileSync(resolve(".pi", "settings.json"), "utf8"));
  assert.deepEqual(settings.extensions, ["../code/extensions/nazar.ts", "../code/extensions/memory.ts", "../code/extensions/voice.ts", "../code/extensions/spotify.ts", "../code/extensions/whatsapp.ts"]);
  assert.deepEqual(settings.skills, ["../code/skills"]);
  assert.equal(Object.hasOwn(settings, "sessionDir"), false);
  assert.equal(settings.packages.includes("npm:pi-mcp-adapter"), false);
  assert.equal(settings.packages.includes("npm:pi-web-access"), false);
});

test("root package exposes Nazar Pi package resources", () => {
  const pkg = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
  assert.equal(pkg.name, "@nazar/nazar-pi");
  assert.equal(pkg.keywords.includes("pi-package"), true);
  assert.deepEqual(pkg.pi.extensions, [
    "./code/extensions/nazar.ts",
    "./code/extensions/memory.ts",
    "./code/extensions/voice.ts",
    "./code/extensions/spotify.ts",
    "./code/extensions/whatsapp.ts",
  ]);
  assert.deepEqual(pkg.pi.skills, ["./code/skills"]);
  assert.equal(pkg.files.includes("!code/extensions/**/node_modules/**"), true);
  assert.equal(pkg.files.some((entry) => entry.startsWith("memory/")), false);
  assert.equal(Object.hasOwn(pkg, "dependencies"), false);
  assert.equal(pkg.optionalDependencies["@whiskeysockets/baileys"], "7.0.0-rc13");
  assert.equal(pkg.optionalDependencies["sherpa-onnx-node"], "1.13.2");
});

test("path derivation uses only repo root and ignores stale PI_MEMORY env vars", () => {
  const ctx = makeProject(true);
  try {
    const paths = getMemoryPaths();
    assert.equal(paths.PROJECT_ROOT, ctx.root);
    assert.equal(paths.CODE_ROOT, join(ctx.root, "code"));
    assert.equal(paths.VAULT_DIR, undefined);
    assert.equal(paths.NAZAR_DIR, join(ctx.root, "memory"));
    assert.equal(paths.LLM_WIKI_DIR, join(ctx.root, "memory", "llm-wiki"));
    assert.equal(paths.LLM_WIKI_RAW_DIR, join(ctx.root, "memory", "llm-wiki", "raw"));
    assert.equal(paths.LLM_WIKI_PAGES_DIR, join(ctx.root, "memory", "llm-wiki", "wiki"));
    assert.equal(paths.MEMORY_ROOT, join(ctx.root, "memory"));
    assert.equal(paths.PAGES_DIR, join(ctx.root, "memory", "pages"));
    assert.equal(paths.AI_PAGES_DIR, join(ctx.root, "memory", "pages", "ai"));
    assert.equal(paths.PERSONAL_PAGES_DIR, join(ctx.root, "memory", "pages", "personal"));
    assert.equal(paths.ROLLUPS_DIR, join(ctx.root, "memory", "rollups"));
    assert.equal(paths.STATE_DIR, join(ctx.root, "memory", "state"));
    assert.equal(paths.JOURNAL_DIR, join(ctx.root, "memory", "journal"));
    assert.equal(paths.JOURNAL_ENTRIES_DIR, join(ctx.root, "memory", "journal", "entries"));
    assert.equal(paths.SOURCES_DIR, join(ctx.root, "memory", "sources"));
    assert.equal(paths.INDEXES_DIR, join(ctx.root, "memory", "indexes"));
    assert.equal(paths.ARCHIVE_DIR, join(ctx.root, "memory", "archive"));
    assert.equal(paths.PINNED_MEMORY_PAGE, join(ctx.root, "memory", "pages", "personal", "pinned-memory.md"));

    const status = memoryStatusText();
    assert.match(status, new RegExp(`Memory root: ${join(ctx.root, "memory").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.doesNotMatch(status, /Context:/);
    assert.doesNotMatch(status, /stale-llm-wiki/);
    assert.doesNotMatch(status, /Historical daily sessions dir|Subconversation dir|PI_MEMORY|Active memory:/);
    assert.equal(existsSync(join(ctx.root, "memory", "sessions")), false);
  } finally {
    cleanup(ctx);
  }
});

test("configurable memory roots can split ai and human durable memory", () => {
  const ctx = makeProject();
  try {
    process.env.PI_MEMORY_ROOT = join(ctx.tmp, "private-memory");
    process.env.PI_MEMORY_PAGES_DIR = join(ctx.tmp, "durable-pages");
    process.env.PI_AI_MEMORY_DIR = join(ctx.tmp, "durable-pages", "ai-memory");
    process.env.PI_HUMAN_MEMORY_DIR = join(ctx.tmp, "durable-pages", "human-memory");

    const paths = getMemoryPaths();
    assert.equal(paths.MEMORY_ROOT, join(ctx.tmp, "private-memory"));
    assert.equal(paths.PAGES_DIR, join(ctx.tmp, "durable-pages"));
    assert.equal(paths.AI_PAGES_DIR, join(ctx.tmp, "durable-pages", "ai-memory"));
    assert.equal(paths.PERSONAL_PAGES_DIR, join(ctx.tmp, "durable-pages", "human-memory"));
    assert.equal(paths.PINNED_MEMORY_PAGE, join(ctx.tmp, "durable-pages", "human-memory", "pinned-memory.md"));
  } finally {
    cleanup(ctx);
  }
});

test("voice model defaults follow saved memory config", () => {
  const ctx = makeProject();
  try {
    const vault = join(ctx.tmp, "ConfiguredVault");
    writeNazarSetupConfig({
      memory: {
        vaultDir: vault,
        rootDir: join(vault, "05_Nazar", "runtime"),
        pagesDir: vault,
        aiPagesDir: join(vault, "05_Nazar", "llm-wiki", "wiki"),
        humanPagesDir: vault,
      },
    });

    assert.equal(defaultVoiceModelDir(), join(vault, "05_Nazar", "runtime", "state", "voice-models"));
  } finally {
    cleanup(ctx);
  }
});

test("NAZAR_HOME configures a portable Obsidian vault backend", () => {
  const ctx = makeProject();
  try {
    const vault = join(ctx.tmp, "NazarVault");
    process.env.NAZAR_HOME = vault;

    const paths = getMemoryPaths();
    assert.equal(paths.VAULT_DIR, vault);
    assert.equal(paths.PERSONAL_PAGES_DIR, vault);
    assert.equal(paths.PAGES_DIR, vault);
    assert.equal(paths.NAZAR_DIR, join(vault, "05_Nazar"));
    assert.equal(paths.MEMORY_ROOT, join(vault, "05_Nazar", "runtime"));
    assert.equal(paths.AI_PAGES_DIR, join(vault, "05_Nazar", "llm-wiki", "wiki"));
    assert.equal(paths.PINNED_MEMORY_PAGE, join(vault, "05_Nazar", "pinned-memory.md"));

    const result = compactMemory({ session: join(ctx.tmp, "missing.jsonl") });
    assert.equal(result.code, 0, result.text);
    for (const dir of ["00_Inbox", "01_Projects", "02_Areas", "03_Resources", "04_Archive", "05_Nazar"]) {
      assert.equal(existsSync(join(vault, dir)), true, `${dir} should be scaffolded`);
    }
    assert.equal(existsSync(join(vault, "05_Nazar", "llm-wiki", "AGENTS.md")), true);
  } finally {
    cleanup(ctx);
  }
});

test("dry-run with no explicit session source writes nothing", () => {
  const ctx = makeProject();
  try {
    const result = compactMemory({ dryRun: true });
    assert.equal(result.code, 0, result.text);
    assert.match(result.text, /Would compact 0 session file\(s\), 0 text message\(s\), 0 day chunk\(s\)\./);
    assert.equal(existsSync(join(ctx.root, "memory")), false);
    assert.equal(existsSync(join(ctx.root, "memory", "sessions")), false);
  } finally {
    cleanup(ctx);
  }
});

test("explicit session compaction writes rollups and omits tool results", () => {
  const ctx = makeProject();
  const session = join(ctx.tmp, "sessions", "main.jsonl");
  try {
    writeJsonl(session, [
      message("user", "Let's update memory and llm-wiki."),
      toolResult("secret tool output should not enter memory"),
      message("assistant", "Done. Added a compaction lock for generated memory writes."),
    ]);

    const result = compactMemory({ session });
    assert.equal(result.code, 0, result.text);
    assert.match(result.text, /Compacted 1 session file\(s\)\./);
    assert.doesNotMatch(result.text, /context/i);

    const daily = readFileSync(join(ctx.root, "memory", "rollups", "daily", `${DAY}.md`), "utf8");
    assert.match(daily, /Outcome: Done\. Added a compaction lock for generated memory writes\./);
    assert.match(daily, /scoped QMD collections/);
    assert.doesNotMatch(daily, /secret tool output/);
    assert.equal(existsSync(join(ctx.root, "memory", "rollups", "active.md")), false);
    assert.equal(existsSync(join(ctx.root, "memory", "pages", "personal", "pinned-memory.md")), true);
    assert.equal(existsSync(join(ctx.root, "memory", "sessions")), false);
  } finally {
    cleanup(ctx);
  }
});

test("compactSessionFile refreshes rollups from the current Pi session file", () => {
  const ctx = makeProject();
  const session = join(ctx.tmp, "sessions", "current.jsonl");
  try {
    writeJsonl(session, [message("user", "Let's update memory rollups."), message("assistant", "Done. Refreshed memory rollups from the current session.")]);

    const result = compactSessionFile(session);
    assert.equal(result.code, 0, result.text);
    assert.match(result.text, /Compacted 1 session file\(s\)\./);
    assert.equal(existsSync(join(ctx.root, "memory", "context", "bootstrap.md")), false);
    assert.equal(existsSync(join(ctx.root, "memory", "rollups", "active.md")), false);
    assert.equal(existsSync(join(ctx.root, "memory", "rollups", "daily", `${DAY}.md`)), true);
  } finally {
    cleanup(ctx);
  }
});

test("explicit session-dir compaction recurses without any default session scan", () => {
  const ctx = makeProject();
  const sessionDir = join(ctx.tmp, "session-dir");
  const main = join(sessionDir, "main.jsonl");
  const nested = join(sessionDir, "branch", "run-0", "session.jsonl");
  try {
    writeJsonl(main, [message("user", "Remember canonical memory path."), message("assistant", "Done. Updated memory path docs.")]);
    writeJsonl(nested, [message("user", "Let's update qmd memory search."), message("assistant", "Done. Updated QMD search.")]);

    const dryRun = compactMemory({ sessionDir, dryRun: true });
    assert.equal(dryRun.code, 0, dryRun.text);
    assert.match(dryRun.text, /Would compact 2 session file\(s\), 4 text message\(s\), 1 day chunk\(s\)\./);
    assert.equal(findJsonl(sessionDir).length, 2, "explicit session-dir compaction must not move raw sessions");
  } finally {
    cleanup(ctx);
  }
});

test("successful compaction removes its lock and active locks are refused", () => {
  const ctx = makeProject();
  const session = join(ctx.tmp, "sessions", "main.jsonl");
  try {
    writeJsonl(session, [message("user", "Let's update memory."), message("assistant", "Done. Updated memory.")]);
    const lock = getRuntimePaths().COMPACT_LOCK_DIR;

    const ok = compactMemory({ session });
    assert.equal(ok.code, 0, ok.text);
    assert.equal(existsSync(lock), false);

    mkdirSync(lock, { recursive: true });
    writeFileSync(join(lock, "owner.json"), '{"pid":123,"startedAt":"now"}\n', "utf8");
    const blocked = compactMemory({ session });
    assert.equal(blocked.code, 2);
    assert.match(blocked.text, /Memory compaction is already running/);
    assert.match(blocked.text, /"pid":123/);
    assert.equal(existsSync(lock), true, "active lock should remain for the owner");
  } finally {
    cleanup(ctx);
  }
});

test("pinned memory remember/forget handles ambiguity and refuses secrets", () => {
  const ctx = makeProject();
  try {
    assert.equal(rememberPinnedMemory(["fact", "ambiguous one"]).code, 0);
    assert.equal(rememberPinnedMemory(["fact", "ambiguous two"]).code, 0);

    const ambiguous = forgetPinnedMemory("ambiguous");
    assert.equal(ambiguous.code, 1);
    assert.match(ambiguous.text, /Ambiguous pinned memory forget query matched 2 bullets/);

    const exact = forgetPinnedMemory("ambiguous one");
    assert.equal(exact.code, 0, exact.text);
    const pinned = readFileSync(join(ctx.root, "memory", "pages", "personal", "pinned-memory.md"), "utf8");
    assert.doesNotMatch(pinned, /ambiguous one/);
    assert.match(pinned, /ambiguous two/);

    const secret = "sk-proj-abcdefghijklmnopqrstuvwxyz1234567890";
    const refused = rememberPinnedMemory(["fact", `production API key ${secret}`]);
    assert.equal(refused.code, 2);
    assert.match(refused.text, /Refusing to pin memory that looks like a secret/);
    assert.doesNotMatch(refused.text, new RegExp(secret));
    const afterSecret = readFileSync(join(ctx.root, "memory", "pages", "personal", "pinned-memory.md"), "utf8");
    assert.doesNotMatch(afterSecret, new RegExp(secret));
  } finally {
    cleanup(ctx);
  }
});

test("generated memory redacts obvious secrets", () => {
  const ctx = makeProject();
  const session = join(ctx.tmp, "sessions", "main.jsonl");
  const secret = "UltraSecret123";
  try {
    writeJsonl(session, [message("user", `Remember canonical deployment credential password=${secret} for future maintenance.`)]);

    const result = compactMemory({ session });
    assert.equal(result.code, 0, result.text);

    const daily = readFileSync(join(ctx.root, "memory", "rollups", "daily", `${DAY}.md`), "utf8");
    assert.doesNotMatch(daily, new RegExp(secret));
    assert.equal(existsSync(join(ctx.root, "memory", "context", "bootstrap.md")), false);
    assert.match(daily, /password=\[REDACTED_SECRET\]/);
  } finally {
    cleanup(ctx);
  }
});

test("QMD collection self-heals when memory-pages points at old llm-wiki/pages", async () => {
  const ctx = makeProject();
  const calls = [];
  try {
    const fakePi = {
      async exec(command, args) {
        calls.push([command, args]);
        assert.equal(command, "qmd");
        assert.deepEqual(args.slice(0, 2), ["--index", QMD_INDEX]);
        const rest = args.slice(2);
        if (rest.join(" ") === "collection list") return { code: 0, stdout: `${QMD_COLLECTION}  /home/nazar/nazar/llm-wiki/pages\n` };
        if (rest.join(" ") === `collection show ${QMD_COLLECTION}`) {
          return { code: 0, stdout: `Collection: ${QMD_COLLECTION}\n  Path:     /home/nazar/nazar/llm-wiki/pages\n  Pattern:  **/*.md\n` };
        }
        return { code: 0, stdout: "ok\n" };
      },
    };

    await ensureMemoryIndex(fakePi);

    const qmdCalls = calls.map(([, args]) => args.slice(2));
    assert.deepEqual(qmdCalls[0], ["collection", "list"]);
    assert.deepEqual(qmdCalls[1], ["collection", "show", QMD_COLLECTION]);
    assert.deepEqual(qmdCalls[2], ["collection", "remove", QMD_COLLECTION]);
    assert.deepEqual(qmdCalls[3], ["collection", "add", join(ctx.root, "memory", "pages"), "--name", QMD_COLLECTION, "--mask", "**/*.md"]);
    assert.deepEqual(qmdCalls[4], ["context", "add", `qmd://${QMD_COLLECTION}`, QMD_CONTEXT]);
  } finally {
    cleanup(ctx);
  }
});

test("QMD collection add tolerates already-existing collection race", async () => {
  const ctx = makeProject();
  const calls = [];
  try {
    const fakePi = {
      async exec(command, args) {
        calls.push([command, args]);
        assert.equal(command, "qmd");
        assert.deepEqual(args.slice(0, 2), ["--index", QMD_INDEX]);
        const rest = args.slice(2);
        if (rest.join(" ") === "collection list") return { code: 0, stdout: "" };
        if (rest.join(" ") === `collection add ${join(ctx.root, "memory", "pages")} --name ${QMD_COLLECTION} --mask **/*.md`) {
          return { code: 1, stderr: `Collection '${QMD_COLLECTION}' already exists.\nUse a different name with --name <name>\n` };
        }
        return { code: 0, stdout: "ok\n" };
      },
    };

    await ensureMemoryIndex(fakePi);

    const qmdCalls = calls.map(([, args]) => args.slice(2));
    assert.deepEqual(qmdCalls[0], ["collection", "list"]);
    assert.deepEqual(qmdCalls[1], ["collection", "add", join(ctx.root, "memory", "pages"), "--name", QMD_COLLECTION, "--mask", "**/*.md"]);
    assert.deepEqual(qmdCalls[2], ["context", "add", `qmd://${QMD_COLLECTION}`, QMD_CONTEXT]);
  } finally {
    cleanup(ctx);
  }
});

test("memory search uses the memory-pages collection only", async () => {
  const ctx = makeProject();
  const calls = [];
  try {
    const fakePi = {
      async exec(command, args) {
        calls.push([command, args]);
        assert.equal(command, "qmd");
        assert.deepEqual(args.slice(0, 2), ["--index", QMD_INDEX]);
        const rest = args.slice(2);
        if (rest.join(" ") === "collection list") return { code: 0, stdout: `${QMD_COLLECTION}  ${join(ctx.root, "memory", "pages")}\n` };
        if (rest.join(" ") === `collection show ${QMD_COLLECTION}`) {
          return { code: 0, stdout: `Collection: ${QMD_COLLECTION}\n  Path:     ${join(ctx.root, "memory", "pages")}\n  Pattern:  **/*.md\n` };
        }
        return { code: 0, stdout: "ok\n" };
      },
    };

    const out = await searchMemoryText(fakePi, '"remote access"', 3);
    assert.equal(out, "ok\n");

    const qmdCalls = calls.map(([, args]) => args.slice(2));
    assert.deepEqual(qmdCalls.at(-1), ["search", "remote access", "-c", QMD_COLLECTION, "--md", "-n", "3"]);
    for (const [, args] of calls) {
      assert.equal(args.includes(join(ctx.root, "memory", "rollups")), false);
      assert.equal(args.includes(join(ctx.root, "memory", "sources")), false);
      assert.equal(args.includes(join(ctx.root, "memory", "state")), false);
      assert.equal(args.includes(join(ctx.root, "memory", "journal")), false);
    }
  } finally {
    cleanup(ctx);
  }
});

test("NAZAR_HOME memory search uses scoped vault collections", async () => {
  const ctx = makeProject();
  const calls = [];
  try {
    const vault = join(ctx.tmp, "NazarVault");
    process.env.NAZAR_HOME = vault;
    const fakePi = {
      async exec(command, args) {
        calls.push([command, args]);
        assert.equal(command, "qmd");
        assert.deepEqual(args.slice(0, 2), ["--index", QMD_INDEX]);
        if (args.slice(2).join(" ") === "collection list") return { code: 0, stdout: "" };
        return { code: 0, stdout: "ok\n" };
      },
    };

    const out = await searchMemoryText(fakePi, "old note", 2, "search", "archive");
    assert.equal(out, "ok\n");

    const qmdCalls = calls.map(([, args]) => args.slice(2));
    const addedCollections = qmdCalls
      .filter((args) => args[0] === "collection" && args[1] === "add")
      .map((args) => args[4])
      .sort();
    assert.deepEqual(addedCollections, ["memory-archive", "memory-areas", "memory-inbox", "memory-llm-wiki", "memory-pinned", "memory-projects", "memory-resources"]);
    assert.deepEqual(qmdCalls.at(-1), ["search", "old note", "-c", "memory-archive", "--md", "-n", "2"]);
  } finally {
    cleanup(ctx);
  }
});

test("vault memory search indexes pinned memory and advanced page overrides", async () => {
  const ctx = makeProject();
  const calls = [];
  try {
    const vault = join(ctx.tmp, "NazarVault");
    const pages = join(ctx.tmp, "search-root");
    const human = join(ctx.tmp, "human-root");
    const ai = join(ctx.tmp, "ai-root");
    process.env.NAZAR_HOME = vault;
    process.env.PI_MEMORY_PAGES_DIR = pages;
    process.env.PI_HUMAN_MEMORY_DIR = human;
    process.env.PI_AI_MEMORY_DIR = ai;
    const fakePi = {
      async exec(command, args) {
        calls.push([command, args]);
        assert.equal(command, "qmd");
        assert.deepEqual(args.slice(0, 2), ["--index", QMD_INDEX]);
        if (args.slice(2).join(" ") === "collection list") return { code: 0, stdout: "" };
        return { code: 0, stdout: "ok\n" };
      },
    };

    await searchMemoryText(fakePi, "standing fact", 2, "search", "default");

    const qmdCalls = calls.map(([, args]) => args.slice(2));
    const collectionAdds = qmdCalls.filter((args) => args[0] === "collection" && args[1] === "add");
    assert.ok(collectionAdds.some((args) => args[2] === pages && args[4] === QMD_COLLECTION));
    assert.ok(collectionAdds.some((args) => args[2] === human && args[4] === "memory-personal"));
    assert.ok(collectionAdds.some((args) => args[2] === ai && args[4] === "memory-ai"));
    const searchedCollections = qmdCalls.filter((args) => args[0] === "search").map((args) => args[3]);
    assert.equal(searchedCollections.includes(QMD_COLLECTION), true);
    assert.equal(searchedCollections.includes("memory-personal"), true);
    assert.equal(searchedCollections.includes("memory-ai"), true);
  } finally {
    cleanup(ctx);
  }
});

test("journal helper writes private entries without editing pinned memory", () => {
  const ctx = makeProject();
  try {
    const date = new Date("2026-05-24T12:34:56.000Z");
    const pinnedPath = join(ctx.root, "memory", "pages", "personal", "pinned-memory.md");
    const before = existsSync(pinnedPath) ? readFileSync(pinnedPath, "utf8") : "";
    const added = addJournalEntry("I felt calm today", date);
    const after = existsSync(pinnedPath) ? readFileSync(pinnedPath, "utf8") : "";
    assert.equal(added.code, 0, added.text);
    assert.doesNotMatch(added.text, /I felt calm/);

    const path = join(ctx.root, "memory", "journal", "entries", `${DAY}.md`);
    const entry = readFileSync(path, "utf8");
    assert.match(entry, /I felt calm today/);
    assert.match(entry, /Private source material/);
    assert.match(entry, /Pi assistant/);
    assert.doesNotMatch(after, /I felt calm today/);
    if (before) assert.equal(after, before);
  } finally {
    cleanup(ctx);
  }
});

test("journal command payloads are excluded from generated rollups", () => {
  const ctx = makeProject();
  const session = join(ctx.tmp, "sessions", "journal.jsonl");
  const privatePayload = "deeply private sentinel memory qmd";
  try {
    writeJsonl(session, [message("user", `/journal add ${privatePayload}`), message("assistant", `Done. Added a journal entry about ${privatePayload}.`)]);
    const result = compactMemory({ session });
    assert.equal(result.code, 0, result.text);

    const daily = readFileSync(join(ctx.root, "memory", "rollups", "daily", `${DAY}.md`), "utf8");
    assert.doesNotMatch(daily, new RegExp(privatePayload));
    assert.equal(existsSync(join(ctx.root, "memory", "context", "bootstrap.md")), false);
  } finally {
    cleanup(ctx);
  }
});

test("command descriptions/help list memory surfaces without /context, /journal, or /memory compact", async () => {
  const commands = new Map();
  const fakePi = {
    registerCommand(name, spec) {
      commands.set(name, spec);
    },
  };

  registerMemoryUse(fakePi);

  const memory = commands.get("memory");
  assert.ok(memory, "memory command should be registered");
  assert.equal(commands.has("context"), false, "context command should not be registered");
  assert.equal(commands.has("journal"), false, "journal command should not be registered");
  assert.match(memory.description, /status\|search\|query\|update\|index\|list\|ls\|get/);
  assert.doesNotMatch(memory.description, /\|compact|compact\|/);

  let helpText = "";
  await memory.handler("help", {
    hasUI: true,
    ui: {
      setWidget(_name, lines) {
        helpText = lines.join("\n");
      },
      notify() {},
    },
  });
  assert.match(helpText, /\/memory index/);
  assert.match(helpText, /\/memory ls \[path\]/);
  assert.doesNotMatch(helpText, /\/context/);
  assert.doesNotMatch(helpText, /\/journal/);
  assert.doesNotMatch(helpText, /\/memory compact/);
});
