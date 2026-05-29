import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

function source(path) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

test("core setup is registry-driven and feature-free", () => {
  const setupUse = source("packages/core/code/extensions/nazar/setup-use.ts");
  assert.match(setupUse, /setupProviders/);
  assert.doesNotMatch(setupUse, /\.\.\/\.\.\/memory|@nazar\/memory|@nazar\/voice/);
  assert.doesNotMatch(setupUse, /Life OS|durable memory tools|\/memory/);
  assert.match(setupUse, /collectSetupOnboarding/);

  const setupOnboarding = source("packages/core/code/extensions/nazar/setup-onboarding.ts");
  assert.doesNotMatch(setupOnboarding, /Life OS|durable memory tools|\/memory/);
  assert.match(setupOnboarding, /getNazarDirs\(\)\.stateDir/);

  const registry = source("packages/core/code/extensions/nazar/setup-registry.ts");
  assert.match(registry, /Symbol\.for\("nazar\.setup-registry"\)/);
  assert.match(registry, /unregisterSetupProvider/);
  assert.match(registry, /providers\.get\(id\) !== provider/);

  const corePackage = JSON.parse(source("packages/core/package.json"));
  assert.equal(Object.hasOwn(corePackage.exports, "./transcriber"), false);

  const setupStore = source("packages/core/code/extensions/nazar/setup-store.ts");
  assert.doesNotMatch(setupStore, /voice\?:/);
  assert.doesNotMatch(setupStore, /defaultVoiceModelDir/);

});

test("memory_search tool truncates search output before returning", () => {
  const memoryExtension = source("packages/memory/code/extensions/memory.ts");
  assert.doesNotMatch(memoryExtension, /TOOL_OUTPUT_LIMIT_BYTES/);
  assert.match(memoryExtension, /hasInteractiveUi\(ctx\)[\s\S]*ctx\.ui\.setWidget\("memory", undefined\)/);
  assert.match(memoryExtension, /await truncateToolOutput\(await searchMemoryText\(/);
  assert.match(memoryExtension, /await truncateToolOutput\(memoryStatusText\(\)\)/);
  assert.match(memoryExtension, /throw toolError\("memory_search", error\)/);
  assert.doesNotMatch(memoryExtension, /StringEnum\(\["search", "query"\]/);
  assert.match(memoryExtension, /StringEnum\(\["default", "archive"\]/);
  assert.match(memoryExtension, /before_agent_start[\s\S]*buildDurableMemoryContext\(\)/);
});

test("stale websearch extension ignore rule is removed", () => {
  const gitignore = source(".gitignore");
  assert.doesNotMatch(gitignore, /code\/extensions\/websearch\/node_modules/);
  assert.match(gitignore, /packages\/\*\/node_modules/);
});
