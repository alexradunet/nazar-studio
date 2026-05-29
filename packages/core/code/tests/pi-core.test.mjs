import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { hasInteractiveUi, truncateToolOutput, truncateUtf8 } from "../extensions/shared.ts";
import { defaultVoiceModelDir, writeNazarSetupConfig } from "../extensions/nazar/setup-store.ts";
import { registerSetupProvider, setupProviders } from "../extensions/nazar/setup-registry.ts";

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
  const tmp = mkdtempSync(join(tmpdir(), "pi-core-test-"));
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

  return { tmp, root, restore };
}

function cleanup(ctx) {
  ctx.restore();
  rmSync(ctx.tmp, { recursive: true, force: true });
}

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

test("voice model defaults follow saved memory vault config", () => {
  const ctx = makeProject();
  try {
    const vault = join(ctx.tmp, "ConfiguredVault");
    writeNazarSetupConfig({ memory: { vaultDir: vault } });

    assert.equal(defaultVoiceModelDir(), join(vault, "05_Nazar", "runtime", "state", "voice-models"));
  } finally {
    cleanup(ctx);
  }
});
