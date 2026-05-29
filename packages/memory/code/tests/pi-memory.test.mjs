import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import memoryExtension from "../extensions/memory.ts";
import {
  buildDurableMemoryContext,
  compactMemory,
  compactSessionFile,
  durablePinnedDigest,
  forgetPinnedMemory,
  getRuntimePaths,
  memoryStatusText,
  registerMemoryUse,
  rememberPinnedMemory,
  searchMemoryText,
} from "../extensions/memory/memory-use.ts";
import {
  addLifeReflection,
  lifeStatePath,
  readLifeState,
  removeLifeGoal,
  resetLifeState,
  setLifeProfileField,
  upsertLifeGoal,
} from "../extensions/memory/life-state.ts";
import { lifeReadoutText, lifeStatusText } from "../extensions/memory/life-text.ts";
import { registerLifeTools } from "../extensions/memory/life-tools.ts";
import { registerMemorySetupProvider } from "../extensions/memory/memory-setup.ts";
import { getMemoryPaths } from "../extensions/memory/paths.ts";
import { setupProviders } from "@nazar/core/setup-registry";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

const DAY = "2026-05-24";
const ENV_KEYS = [
  "PI_PROJECT_ROOT",
  "NAZAR_HOME",
  "NAZAR_CONFIG_DIR",
  "NAZAR_STATE_DIR",
  "NAZAR_DATA_DIR",
  "XDG_RUNTIME_DIR",
  "XDG_DATA_HOME",
];

function makeProject() {
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

test("project Pi settings load workspace package resources and no repo sessionDir", () => {
  const settings = JSON.parse(readFileSync(resolve(repoRoot, ".pi", "settings.json"), "utf8"));
  assert.deepEqual(settings.extensions, [
    "../packages/core/code/extensions/nazar.ts",
    "../packages/memory/code/extensions/memory.ts",
  ]);
  assert.deepEqual(settings.skills, ["../packages/memory/code/extensions/memory/skills"]);
  assert.equal(Object.hasOwn(settings, "sessionDir"), false);
  assert.equal(settings.packages.includes("npm:pi-mcp-adapter"), false);
  assert.equal(settings.packages.includes("npm:pi-web-access"), false);
});

test("workspace packages expose Nazar Pi package resources", () => {
  const rootPkg = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8"));
  assert.equal(rootPkg.private, true);
  assert.deepEqual(rootPkg.workspaces, ["packages/*"]);
  assert.equal(Object.hasOwn(rootPkg, "pi"), false);

  const core = JSON.parse(readFileSync(resolve(repoRoot, "packages", "core", "package.json"), "utf8"));
  const memory = JSON.parse(readFileSync(resolve(repoRoot, "packages", "memory", "package.json"), "utf8"));

  assert.deepEqual(core.pi.extensions, ["./code/extensions/nazar.ts"]);
  assert.equal(Object.hasOwn(core.pi, "skills"), false);
  assert.deepEqual(memory.pi.extensions, ["./code/extensions/memory.ts"]);
  assert.deepEqual(memory.pi.skills, ["./code/extensions/memory/skills"]);
  assert.equal(existsSync(resolve(repoRoot, "packages", "voice")), false);
});

test("path derivation uses repo-local fallback when no vault is configured", () => {
  const ctx = makeProject();
  try {
    const paths = getMemoryPaths();
    assert.equal(paths.PROJECT_ROOT, ctx.root);
    assert.equal(paths.VAULT_DIR, undefined);
    assert.equal(paths.NAZAR_DIR, join(ctx.root, "memory"));
    assert.equal(paths.LLM_WIKI_DIR, join(ctx.root, "memory", "llm-wiki"));
    assert.equal(paths.LLM_WIKI_PAGES_DIR, join(ctx.root, "memory", "llm-wiki", "wiki"));
    assert.equal(paths.MEMORY_ROOT, join(ctx.root, "memory"));
    assert.equal(paths.PAGES_DIR, join(ctx.root, "memory", "pages"));
    assert.equal(paths.AI_PAGES_DIR, join(ctx.root, "memory", "pages", "ai"));
    assert.equal(paths.PERSONAL_PAGES_DIR, join(ctx.root, "memory", "pages", "personal"));
    assert.equal(paths.ROLLUPS_DIR, join(ctx.root, "memory", "rollups"));
    assert.equal(paths.STATE_DIR, join(ctx.root, "memory", "state"));
    assert.equal(paths.PINNED_MEMORY_PAGE, join(ctx.root, "memory", "pages", "personal", "pinned-memory.md"));

    const status = memoryStatusText();
    assert.match(status, new RegExp(`Memory root: ${join(ctx.root, "memory").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.match(status, new RegExp(`State dir: ${join(ctx.root, "memory", "state").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.doesNotMatch(status, /Code root:/);
    assert.doesNotMatch(status, /Context:/);
    assert.doesNotMatch(status, /Historical daily sessions dir|Subconversation dir|Active memory:/);
    assert.equal(existsSync(join(ctx.root, "memory", "sessions")), false);
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
    assert.equal(existsSync(join(vault, "05_Nazar", "llm-wiki", "wiki", "index.md")), true);
    assert.equal(existsSync(join(vault, "05_Nazar", "llm-wiki", "wiki", "log.md")), true);
  } finally {
    cleanup(ctx);
  }
});

test("memory setup provider scaffolds the configured vault immediately", async () => {
  const ctx = makeProject();
  const cleanupProvider = registerMemorySetupProvider();
  try {
    const vault = join(ctx.tmp, "SetupVault");
    const provider = setupProviders().find((entry) => entry.id === "memory");
    assert.ok(provider?.configure, "memory setup provider should be registered");

    await provider.configure({}, {
      hasUI: true,
      ui: {
        async input() { return vault; },
        setWidget() {},
        notify() {},
      },
    });

    for (const dir of ["00_Inbox", "01_Projects", "02_Areas", "03_Resources", "04_Archive", "05_Nazar"]) {
      assert.equal(existsSync(join(vault, dir)), true, `${dir} should be scaffolded during setup`);
    }
    assert.equal(existsSync(join(vault, "05_Nazar", "AGENTS.md")), true);
    assert.equal(existsSync(join(vault, "05_Nazar", "llm-wiki", "wiki", "index.md")), true);
    assert.equal(existsSync(join(vault, "05_Nazar", "llm-wiki", "wiki", "log.md")), true);
    assert.equal(existsSync(join(vault, "05_Nazar", "pinned-memory.md")), true);
  } finally {
    cleanupProvider();
    cleanup(ctx);
  }
});

test("memory setup provider contributes consent-first onboarding prompt", async () => {
  const ctx = makeProject();
  const cleanupProvider = registerMemorySetupProvider();
  try {
    const provider = setupProviders().find((entry) => entry.id === "memory");
    assert.ok(provider?.onboardingPrompt, "memory setup provider should contribute onboarding");

    const prompt = await provider.onboardingPrompt({ reason: "manual", selectedProviderIds: ["memory"], force: true });

    assert.match(prompt, /canonical memory feature/);
    assert.match(prompt, /one question at a time/);
    assert.match(prompt, /consent-based/);
    assert.match(prompt, /Life OS tools/);
    assert.match(prompt, /dossier/);
    assert.match(prompt, /\/nazar onboard/);
  } finally {
    cleanupProvider();
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
    assert.match(daily, /User direction: Let's update memory and llm-wiki\./);
    assert.match(daily, /Outcome: Done\. Added a compaction lock for generated memory writes\./);
    assert.doesNotMatch(daily, /secret tool output/);
    assert.equal(existsSync(join(ctx.root, "memory", "rollups", "active.md")), false);
    assert.equal(existsSync(join(ctx.root, "memory", "rollups", "monthly")), false);
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
    assert.equal(existsSync(join(ctx.root, "memory", "rollups", "monthly")), false);
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
    writeJsonl(nested, [message("user", "Let's update memory search."), message("assistant", "Done. Updated memory search.")]);

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

test("durable memory digest skips empty pinned template and includes remembered bullets", () => {
  const ctx = makeProject();
  try {
    assert.equal(durablePinnedDigest(), "");
    assert.equal(buildDurableMemoryContext(), "");

    const remembered = rememberPinnedMemory(["fact", "Prefers concise answers"]);
    assert.equal(remembered.code, 0, remembered.text);
    assert.match(durablePinnedDigest(), /Prefers concise answers/);
    assert.match(buildDurableMemoryContext(), /### Pinned memory/);
    assert.match(buildDurableMemoryContext(), /Prefers concise answers/);
  } finally {
    cleanup(ctx);
  }
});

test("durable memory digest includes closed daily rollup bullets when present", () => {
  const ctx = makeProject();
  const session = join(ctx.tmp, "sessions", "rollup.jsonl");
  try {
    writeJsonl(session, [
      message("user", "Let's update memory rollups.", "2026-05-20T10:00:00.000Z"),
      message("assistant", "Done. Updated memory rollups.", "2026-05-20T10:01:00.000Z"),
    ]);
    const compacted = compactMemory({ session });
    assert.equal(compacted.code, 0, compacted.text);

    const digest = buildDurableMemoryContext();
    assert.match(digest, /Recent daily rollup \(2026-05-20\)/);
    assert.match(digest, /Updated memory rollups/);
  } finally {
    cleanup(ctx);
  }
});

test("Life OS state uses versioned private state under memory STATE_DIR", () => {
  const ctx = makeProject();
  try {
    setLifeProfileField("Name", "Alex");
    const goal = upsertLifeGoal({ name: "Ship Life OS", progress: 20, note: "MVP scoped" }).goal;
    addLifeReflection({ text: "Win: research and design are aligned", tags: ["win", "design"] });

    const path = lifeStatePath();
    assert.equal(path, join(ctx.root, "memory", "state", "life", "life.json"));
    assert.equal(existsSync(path), true);

    const markdownPath = join(ctx.root, "memory", "life.md");
    assert.equal(existsSync(markdownPath), true);
    const markdown = readFileSync(markdownPath, "utf8");
    assert.match(markdown, /do not edit this file directly/i);
    assert.match(markdown, /Alex/);
    assert.match(markdown, /Ship Life OS/);
    assert.match(markdown, /research and design are aligned/);

    const raw = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(raw.schemaVersion, 1);
    assert.equal(raw.profile.name, "Alex");
    assert.equal(raw.goals[0].id, goal.id);
    assert.equal(raw.reflections.length, 1);

    const state = readLifeState();
    assert.equal(state.profile.name, "Alex");
    assert.equal(state.goals[0].name, "Ship Life OS");
    assert.equal(state.reflections[0].tags.includes("design"), true);

    resetLifeState();
    const resetMarkdown = readFileSync(markdownPath, "utf8");
    assert.match(resetMarkdown, /No profile fields stored yet\./);
    assert.match(resetMarkdown, /No goals stored yet\./);
    assert.match(resetMarkdown, /No reflections stored yet\./);
  } finally {
    cleanup(ctx);
  }
});

test("Life OS life.md projection lives under the vault control plane when NAZAR_HOME is set", () => {
  const ctx = makeProject();
  try {
    const vault = join(ctx.tmp, "NazarVault");
    process.env.NAZAR_HOME = vault;
    setLifeProfileField("Focus", "Ship Nazar memory");

    const markdownPath = join(vault, "05_Nazar", "life.md");
    assert.equal(existsSync(markdownPath), true);
    assert.match(readFileSync(markdownPath, "utf8"), /Ship Nazar memory/);
    assert.equal(existsSync(join(vault, "05_Nazar", "runtime", "state", "life", "life.json")), true);
  } finally {
    cleanup(ctx);
  }
});

test("Life OS state is private and excluded from durable prompt context by default", () => {
  const ctx = makeProject();
  try {
    setLifeProfileField("Name", "Alex");
    upsertLifeGoal({ name: "Ship private continuity" });
    addLifeReflection({ text: "This reflection should stay on demand." });

    const digest = buildDurableMemoryContext();
    assert.equal(digest, "");
  } finally {
    cleanup(ctx);
  }
});

test("Life OS readouts are bounded and reversible with explicit ids", () => {
  const ctx = makeProject();
  try {
    setLifeProfileField("Name", "Alex");
    const first = upsertLifeGoal({ name: "Ship Life OS", progress: 10 }).goal;
    upsertLifeGoal({ name: "Write docs", status: "paused" });
    addLifeReflection({ text: "First reflection" });
    addLifeReflection({ text: "Second reflection" });

    assert.match(lifeStatusText(), /Goals: 2/);
    const readout = lifeReadoutText({ maxGoals: 1, maxReflections: 1, maxBytes: 600 });
    assert.match(readout, /# Life OS continuity readout/);
    assert.match(readout, new RegExp(first.id));
    assert.doesNotMatch(readout, /First reflection/);
    assert.ok(Buffer.byteLength(readout, "utf8") <= 600);

    const removed = removeLifeGoal(first.id);
    assert.equal(removed.goal.id, first.id);
    assert.equal(readLifeState().goals.some((goal) => goal.id === first.id), false);

    const reset = resetLifeState();
    assert.equal(Object.keys(reset.profile).length, 0);
    assert.equal(reset.goals.length, 0);
    assert.equal(reset.reflections.length, 0);
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

test("legacy memory debranding emits package-era paths", () => {
  const ctx = makeProject();
  const session = join(ctx.tmp, "sessions", "legacy.jsonl");
  try {
    writeJsonl(session, [message("user", "Let's update .pi/extensions/nazar setup docs for Nazar memory.")]);

    const result = compactMemory({ session });
    assert.equal(result.code, 0, result.text);

    const daily = readFileSync(join(ctx.root, "memory", "rollups", "daily", `${DAY}.md`), "utf8");
    assert.match(daily, /packages\/memory\/code\/extensions\/memory/);
    assert.doesNotMatch(daily, /\.pi\/extensions\/(?:nazar|memory)/);
  } finally {
    cleanup(ctx);
  }
});

test("memory search scans repo-local markdown without external commands", async () => {
  const ctx = makeProject();
  let execCalled = false;
  try {
    const note = join(ctx.root, "memory", "pages", "personal", "remote.md");
    mkdirSync(dirname(note), { recursive: true });
    writeFileSync(note, "# Remote Access\n\nCanonical remote access path uses the local tunnel.\n", "utf8");
    const fakePi = { async exec() { execCalled = true; throw new Error("should not call external search"); } };

    const out = await searchMemoryText(fakePi, '"remote access"', 3);

    assert.equal(execCalled, false);
    assert.match(out, /Backend: local markdown scan/);
    assert.match(out, /memory\/pages\/personal\/remote\.md:1/);
    assert.match(out, /Canonical remote access path/);
  } finally {
    cleanup(ctx);
  }
});

test("vault memory search keeps archive out of default scope", async () => {
  const ctx = makeProject();
  try {
    const vault = join(ctx.tmp, "NazarVault");
    process.env.NAZAR_HOME = vault;
    const warm = join(vault, "01_Projects", "warm.md");
    const cold = join(vault, "04_Archive", "cold.md");
    mkdirSync(dirname(warm), { recursive: true });
    mkdirSync(dirname(cold), { recursive: true });
    writeFileSync(warm, "# Warm\n\nCurrent standing fact for active work.\n", "utf8");
    writeFileSync(cold, "# Cold\n\nArchived-only migration note.\n", "utf8");

    const warmOut = await searchMemoryText(undefined, "standing fact", 5, "default");
    assert.match(warmOut, /NAZAR_HOME\/01_Projects\/warm\.md/);
    assert.doesNotMatch(warmOut, /04_Archive/);

    const coldDefault = await searchMemoryText(undefined, "Archived-only", 5, "default");
    assert.match(coldDefault, /No memory results/);
    assert.doesNotMatch(coldDefault, /cold\.md/);

    const coldArchive = await searchMemoryText(undefined, "Archived-only", 5, "archive");
    assert.match(coldArchive, /NAZAR_HOME\/04_Archive\/cold\.md/);
  } finally {
    cleanup(ctx);
  }
});

test("memory life command captures profile, goals, and reflections", async () => {
  const ctx = makeProject();
  const commands = new Map();
  const outputs = [];
  const fakePi = {
    registerCommand(name, spec) {
      commands.set(name, spec);
    },
  };
  const fakeCtx = {
    hasUI: true,
    ui: {
      setWidget(_name, lines) {
        outputs.push(lines.join("\n"));
      },
      notify() {},
    },
  };

  try {
    registerMemoryUse(fakePi);
    const memory = commands.get("memory");
    assert.ok(memory, "memory command should be registered");
    assert.equal(commands.has("life"), false, "life should stay under /memory");

    await memory.handler("life profile set name Alex", fakeCtx);
    await memory.handler("life goal add ship-life-os Ship Life OS", fakeCtx);
    await memory.handler("life goal update ship-life-os --progress 30 --note Research design complete", fakeCtx);
    await memory.handler("life goal add write docs", fakeCtx);
    await memory.handler("life reflect Win: command path works", fakeCtx);
    await memory.handler("life readout", fakeCtx);

    const state = readLifeState();
    assert.equal(state.profile.name, "Alex");
    assert.equal(state.goals[0].id, "ship-life-os");
    assert.equal(state.goals[0].progress, 30);
    assert.match(state.goals[0].note || "", /Research design complete/);
    assert.equal(state.goals[1].id, "write-docs");
    assert.equal(state.goals[1].name, "write docs");
    assert.match(state.reflections[0].text, /command path works/);
    assert.match(String(outputs.at(-1)), /Life OS continuity readout/);
    assert.match(String(outputs.at(-1)), /Alex/);
    assert.match(String(outputs.at(-1)), /Ship Life OS/);
  } finally {
    cleanup(ctx);
  }
});

test("memory life command supports explicit remove and reset operations", async () => {
  const ctx = makeProject();
  const commands = new Map();
  const fakePi = {
    registerCommand(name, spec) {
      commands.set(name, spec);
    },
  };
  const fakeCtx = { hasUI: true, ui: { setWidget() {}, notify() {} } };

  try {
    registerMemoryUse(fakePi);
    const memory = commands.get("memory");
    await memory.handler("life profile set name Alex", fakeCtx);
    await memory.handler("life goal add Ship Life OS", fakeCtx);
    const goalId = readLifeState().goals[0].id;
    await memory.handler(`life goal done ${goalId}`, fakeCtx);
    assert.equal(readLifeState().goals[0].status, "done");
    await memory.handler(`life goal remove ${goalId}`, fakeCtx);
    assert.equal(readLifeState().goals.length, 0);
    await memory.handler("life profile remove name", fakeCtx);
    assert.equal(Object.hasOwn(readLifeState().profile, "name"), false);
    await memory.handler("life reset", fakeCtx);
    assert.equal(readLifeState().reflections.length, 0);
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
  assert.equal(commands.has("life"), false, "life command should not be registered separately");
  assert.match(memory.description, /status\|search\|life\|pinned\|remember\|forget/);
  assert.match(memory.description, /\|life\|/);
  assert.doesNotMatch(memory.description, /query/);
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
  assert.match(helpText, /\/memory search \[--scope default\|archive\]/);
  assert.doesNotMatch(helpText, /\/memory index/);
  assert.doesNotMatch(helpText, /\/memory ls/);
  assert.match(helpText, /\/memory life status\|readout\|profile\|goals\|goal\|reflect\|reflections/);
  assert.doesNotMatch(helpText, /^\/life/m);
  assert.doesNotMatch(helpText, /\/context/);
  assert.doesNotMatch(helpText, /\/journal/);
  assert.doesNotMatch(helpText, /\/memory query/);
  assert.doesNotMatch(helpText, /qmd/i);
  assert.doesNotMatch(helpText, /\/memory compact/);
});

test("memory extension registers focused Life OS tools without a dispatcher", () => {
  const commands = new Map();
  const tools = new Map();
  const fakePi = {
    on() {},
    registerCommand(name, spec) {
      commands.set(name, spec);
    },
    registerTool(spec) {
      tools.set(spec.name, spec);
    },
  };

  memoryExtension(fakePi);

  assert.ok(commands.has("memory"));
  for (const name of ["life_readout", "life_profile_set", "life_profile_remove", "life_goal_update", "life_goal_remove", "life_reflection_add", "life_reflection_remove"]) {
    assert.ok(tools.has(name), `${name} should be registered`);
  }
  assert.equal(tools.has("life"), false);
  assert.equal(tools.has("life_dispatch"), false);
  assert.equal(tools.has("life_reset"), false);
  assert.ok(tools.has("memory_status"));
  assert.ok(tools.has("memory_search"));
});

test("Life OS tools read and mutate private state on demand", async () => {
  const ctx = makeProject();
  const tools = new Map();
  const fakePi = {
    registerTool(spec) {
      tools.set(spec.name, spec);
    },
  };

  try {
    registerLifeTools(fakePi);
    await tools.get("life_profile_set").execute("profile", { field: "Name", value: "Alex" });
    await tools.get("life_goal_update").execute("goal", { id: "ship-life-os", name: "Ship Life OS", progress: 30, note: "Tools work" });
    await tools.get("life_reflection_add").execute("reflection", { text: "Win: focused tools work", tags: ["win"] });

    const readout = await tools.get("life_readout").execute("readout", { section: "all" });
    assert.match(readout.content[0].text, /Life OS continuity readout/);
    assert.match(readout.content[0].text, /Alex/);
    assert.match(readout.content[0].text, /Ship Life OS/);
    assert.equal(readLifeState().goals[0].id, "ship-life-os");

    await tools.get("life_goal_remove").execute("remove-goal", { id: "ship-life-os" });
    assert.equal(readLifeState().goals.length, 0);
    const reflectionId = readLifeState().reflections[0].id;
    await tools.get("life_reflection_remove").execute("remove-reflection", { id: reflectionId });
    assert.equal(readLifeState().reflections.length, 0);
    await tools.get("life_profile_remove").execute("remove-profile", { field: "name" });
    assert.equal(Object.hasOwn(readLifeState().profile, "name"), false);
  } finally {
    cleanup(ctx);
  }
});
