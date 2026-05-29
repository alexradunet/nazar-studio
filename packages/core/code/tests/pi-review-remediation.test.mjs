import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

function source(path) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

test("core setup is registry-driven and feature-free", () => {
  const setupUse = source("packages/core/code/extensions/nazar/setup-use.ts");
  assert.match(setupUse, /setupProviders/);
  assert.doesNotMatch(setupUse, /\.\.\/\.\.\/memory|@nazar\/memory|@nazar\/voice/);

  const registry = source("packages/core/code/extensions/nazar/setup-registry.ts");
  assert.match(registry, /Symbol\.for\("nazar\.setup-registry"\)/);
  assert.match(registry, /unregisterSetupProvider/);
  assert.match(registry, /providers\.get\(id\) !== provider/);

  const transcriber = source("packages/core/code/extensions/nazar/transcriber-registry.ts");
  assert.match(transcriber, /Symbol\.for\("nazar\.transcriber-registry"\)/);
  assert.match(transcriber, /clearTranscriber/);

});

test("review remediation keeps voice runtime cleanup wired", () => {
  const ttsUse = source("packages/voice/code/extensions/voice/tts-use.ts");
  assert.match(ttsUse, /function clearDebounceTimer/);
  assert.match(ttsUse, /pi\.on\("session_shutdown"[\s\S]*clearDebounceTimer\(\)/);
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


test("voice runtime uses ESM-safe native loading and registers setup/transcriber", async () => {
  const voicePackage = JSON.parse(source("packages/voice/package.json"));
  const setupProvider = source("packages/voice/code/extensions/voice/setup-provider.ts");
  const voiceEntry = source("packages/voice/code/extensions/voice.ts");
  const voiceUse = source("packages/voice/code/extensions/voice/voice-use.ts");
  const ttsUse = source("packages/voice/code/extensions/voice/tts-use.ts");
  const sherpaRuntime = source("packages/voice/code/extensions/voice/sherpa-runtime.ts");
  assert.equal(voicePackage.type, "module");
  assert.equal(voicePackage.optionalDependencies["sherpa-onnx-node"], "1.13.2");
  assert.match(sherpaRuntime, /createRequire\(import\.meta\.url\)/);
  assert.doesNotMatch(sherpaRuntime, /eslint-disable-next-line @typescript-eslint\/no-var-requires/);
  assert.match(sherpaRuntime, /export function resetSherpaRuntime\(\)/);
  assert.match(setupProvider, /parseAvfoundationAudioDevices/);
  assert.match(setupProvider, /"-f", "avfoundation"/);
  assert.match(setupProvider, /`:\$\{deviceId\}`/);
  assert.match(voiceEntry, /setTranscriber\(transcribeSherpaPcm16\)/);
  assert.match(voiceEntry, /clearTranscriber\(transcribeSherpaPcm16\)/);
  assert.match(voiceUse, /resetSherpaRuntime\(\)/);
  assert.match(ttsUse, /resetSherpaRuntime\(\)/);

  const runtime = await import(pathToFileURL(resolve(repoRoot, "packages/voice/code/extensions/voice/sherpa-runtime.ts")).href);
  assert.equal(typeof runtime.sherpaModelStatus, "function");
});

test("tts_toggle advertises itself in the system prompt tool list", () => {
  const ttsUse = source("packages/voice/code/extensions/voice/tts-use.ts");
  assert.match(ttsUse, /name: "tts_toggle"[\s\S]*promptSnippet:/);
});

test("stale websearch extension ignore rule is removed", () => {
  const gitignore = source(".gitignore");
  assert.doesNotMatch(gitignore, /code\/extensions\/websearch\/node_modules/);
  assert.match(gitignore, /packages\/\*\/node_modules/);
});
