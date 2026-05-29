import test from "node:test";
import assert from "node:assert/strict";
import { hasInteractiveUi, truncateToolOutput, truncateUtf8 } from "../extensions/shared.ts";
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
