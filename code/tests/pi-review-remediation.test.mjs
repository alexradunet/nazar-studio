import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path) {
  return readFileSync(resolve(path), "utf8");
}

test("review remediation keeps critical runtime fixes wired", () => {
  const setupUse = source("code/extensions/nazar/setup-use.ts");
  assert.match(setupUse, /import \{ hasInteractiveUi, showText \} from "\.\.\/shared\.ts";/);

  const whatsappUse = source("code/extensions/whatsapp/whatsapp-use.ts");
  assert.match(whatsappUse, /FFMPEG_TIMEOUT_MS/);
  assert.match(whatsappUse, /stdoutBytes > MAX_PCM_BYTES/);
  assert.match(whatsappUse, /ffmpeg timed out after/);
  assert.match(whatsappUse, /ctxRef = undefined/);

  const ttsUse = source("code/extensions/voice/tts-use.ts");
  assert.match(ttsUse, /function clearDebounceTimer/);
  assert.match(ttsUse, /pi\.on\("session_shutdown"[\s\S]*clearDebounceTimer\(\)/);
});

test("memory_search tool truncates search output before returning", () => {
  const memoryExtension = source("code/extensions/memory.ts");
  assert.doesNotMatch(memoryExtension, /TOOL_OUTPUT_LIMIT_BYTES/);
  assert.match(memoryExtension, /await truncateToolOutput\(await searchMemoryText\(/);
  assert.match(memoryExtension, /await truncateToolOutput\(memoryStatusText\(\)\)/);
  assert.match(memoryExtension, /throw toolError\("memory_search", error\)/);
  assert.match(memoryExtension, /StringEnum\(\["search", "query"\]/);
  assert.match(memoryExtension, /before_agent_start[\s\S]*buildDurableMemoryContext\(\)/);
});

test("spotify_control tool truncates action output before returning", () => {
  const spotifyUse = source("code/extensions/spotify/spotify-use.ts");
  assert.doesNotMatch(spotifyUse, /TOOL_OUTPUT_LIMIT_BYTES/);
  assert.match(spotifyUse, /await truncateToolOutput\(await spotifyAction\(params\)\)/);
});

test("voice runtime uses ESM-safe native loading and resets on shutdown", () => {
  const voicePackage = JSON.parse(source("code/extensions/voice/package.json"));
  const setupUse = source("code/extensions/nazar/setup-use.ts");
  const voiceUse = source("code/extensions/voice/voice-use.ts");
  const ttsUse = source("code/extensions/voice/tts-use.ts");
  const sherpaRuntime = source("code/extensions/voice/sherpa-runtime.ts");
  assert.equal(voicePackage.type, "module");
  assert.match(sherpaRuntime, /createRequire\(import\.meta\.url\)/);
  assert.doesNotMatch(sherpaRuntime, /eslint-disable-next-line @typescript-eslint\/no-var-requires/);
  assert.match(sherpaRuntime, /export function resetSherpaRuntime\(\)/);
  assert.match(setupUse, /parseAvfoundationAudioDevices/);
  assert.match(setupUse, /"-f", "avfoundation"/);
  assert.match(setupUse, /`:\$\{deviceId\}`/);
  assert.match(voiceUse, /resetSherpaRuntime\(\)/);
  assert.match(ttsUse, /resetSherpaRuntime\(\)/);
});

test("voice runtime imports under the extension package scope", async () => {
  const runtime = await import("../extensions/voice/sherpa-runtime.ts");
  assert.equal(typeof runtime.sherpaModelStatus, "function");
});

test("tts_toggle advertises itself in the system prompt tool list", () => {
  const ttsUse = source("code/extensions/voice/tts-use.ts");
  assert.match(ttsUse, /name: "tts_toggle"[\s\S]*promptSnippet:/);
});

test("stale websearch extension ignore rule is removed", () => {
  const gitignore = source(".gitignore");
  assert.doesNotMatch(gitignore, /code\/extensions\/websearch\/node_modules/);
  assert.match(gitignore, /code\/extensions\/voice\/node_modules/);
  assert.match(gitignore, /code\/extensions\/whatsapp\/node_modules/);
});

test("Spotify JSON state errors avoid leaking full paths", () => {
  const spotifyAuth = source("code/extensions/spotify/spotify-auth.ts");
  const readJsonBlock = spotifyAuth.slice(spotifyAuth.indexOf("function readJson"), spotifyAuth.indexOf("function writeJson"));
  assert.match(readJsonBlock, /basename\(path\)/);
  assert.doesNotMatch(readJsonBlock, /malformed at \$\{path\}/);
  assert.doesNotMatch(readJsonBlock, /error\.message : String\(error\)/);
});
