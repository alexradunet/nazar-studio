import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { hasInteractiveUi, truncateToolOutput, truncateUtf8 } from "../extensions/shared.ts";
import { registerNazarSetupUse } from "../extensions/nazar/setup-use.ts";
import { nazarSetupConfigPath, writeNazarSetupConfig } from "../extensions/nazar/setup-store.ts";
import { registerSetupProvider, setupProviders } from "../extensions/nazar/setup-registry.ts";

test("interactive UI guard treats missing contexts as headless", () => {
  assert.equal(hasInteractiveUi(undefined), false);
  assert.equal(hasInteractiveUi({ hasUI: false }), false);
  assert.equal(hasInteractiveUi({}), true);
  assert.equal(hasInteractiveUi({ hasUI: true }), true);
});

test("setup provider cleanup does not remove newer same-id registrations", () => {
  const id = `test-provider-${Date.now()}-${Math.random()}`;
  const first = { id, label: "First" };
  const second = { id, label: "Second" };
  const cleanupFirst = registerSetupProvider(first);
  const cleanupSecond = registerSetupProvider(second);
  try {
    cleanupFirst();
    assert.equal(setupProviders().find((provider) => provider.id === id)?.label, "Second");
  } finally {
    cleanupSecond();
  }
  assert.equal(setupProviders().some((provider) => provider.id === id), false);
});

test("setup config rewrites only supported fields", () => {
  const tmp = mkdtempSync(join(tmpdir(), "pi-core-setup-test-"));
  const previousConfigDir = process.env.NAZAR_CONFIG_DIR;
  try {
    process.env.NAZAR_CONFIG_DIR = join(tmp, "config");
    const path = nazarSetupConfigPath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({
      version: 1,
      profile: "laptop",
      memory: { vaultDir: join(tmp, "Vault") },
      removedCapability: { enabled: true },
    }), "utf8");

    const next = writeNazarSetupConfig({ profile: "desktop" });
    const saved = JSON.parse(readFileSync(path, "utf8"));

    assert.equal(next.profile, "desktop");
    assert.deepEqual(Object.keys(saved).sort(), ["memory", "profile", "updatedAt", "version"]);
    assert.equal(saved.memory.vaultDir, join(tmp, "Vault"));
  } finally {
    if (previousConfigDir === undefined) delete process.env.NAZAR_CONFIG_DIR;
    else process.env.NAZAR_CONFIG_DIR = previousConfigDir;
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("nazar setup starts consent-first memory onboarding after successful setup", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "pi-core-onboarding-test-"));
  const previousConfigDir = process.env.NAZAR_CONFIG_DIR;
  const commands = new Map();
  const sent = [];
  const providerId = `test-onboarding-${Date.now()}-${Math.random()}`;
  const cleanupProvider = registerSetupProvider({
    id: providerId,
    label: "Test Memory",
    configure: async () => {},
    statusText: () => "ready",
  });
  const fakePi = {
    registerCommand(name, spec) {
      commands.set(name, spec);
    },
    sendUserMessage(text) {
      sent.push(text);
    },
  };
  const fakeCtx = {
    hasUI: true,
    ui: {
      async select() { return "desktop"; },
      setWidget() {},
      notify() {},
    },
  };

  try {
    process.env.NAZAR_CONFIG_DIR = join(tmp, "config");
    registerNazarSetupUse(fakePi);

    await commands.get("nazar-setup").handler("all", fakeCtx);

    assert.equal(sent.length, 1);
    assert.match(sent[0], /one question at a time/);
    assert.match(sent[0], /consent-based/);
    assert.match(sent[0], /Life OS tools/);
    assert.match(sent[0], /dossier/);
  } finally {
    cleanupProvider();
    if (previousConfigDir === undefined) delete process.env.NAZAR_CONFIG_DIR;
    else process.env.NAZAR_CONFIG_DIR = previousConfigDir;
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("tool output truncation caps text at 50KB", async () => {
  assert.equal(truncateUtf8("short output", 50 * 1024), "short output");

  const output = truncateUtf8("α".repeat(60 * 1024), 50 * 1024);
  assert.equal(Buffer.byteLength(output, "utf8") <= 50 * 1024, true);
  assert.match(output, /\[Output truncated\]$/);

  const lineCapped = await truncateToolOutput(["one", "two", "three"].join("\n"), { maxLines: 2, maxBytes: 1024 });
  assert.equal(lineCapped, "one\ntwo\n\n[Output truncated]");

  const byteCapped = await truncateToolOutput("β".repeat(200), { maxLines: 2000, maxBytes: 64 });
  assert.equal(Buffer.byteLength(byteCapped, "utf8") <= 64, true);
  assert.match(byteCapped, /\[Output truncated\]$/);
});
