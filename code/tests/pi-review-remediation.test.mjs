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
  assert.match(memoryExtension, /const TOOL_OUTPUT_LIMIT_BYTES = 50 \* 1024/);
  assert.match(memoryExtension, /truncateUtf8\(await searchMemoryText\([\s\S]*TOOL_OUTPUT_LIMIT_BYTES\)/);
  assert.match(memoryExtension, /truncateUtf8\(memoryStatusText\(\), TOOL_OUTPUT_LIMIT_BYTES\)/);
  assert.match(memoryExtension, /throw toolError\("memory_search", error\)/);
  assert.match(memoryExtension, /StringEnum\(\["search", "query"\]/);
  assert.match(memoryExtension, /before_agent_start[\s\S]*buildDurableMemoryContext\(\)/);
});

test("spotify_control tool truncates action output before returning", () => {
  const spotifyUse = source("code/extensions/spotify/spotify-use.ts");
  assert.match(spotifyUse, /truncateUtf8\(await spotifyAction\(params\), TOOL_OUTPUT_LIMIT_BYTES\)/);
});

test("voice and tts extensions reset sherpa runtime on shutdown", () => {
  const voiceUse = source("code/extensions/voice/voice-use.ts");
  const ttsUse = source("code/extensions/voice/tts-use.ts");
  const sherpaRuntime = source("code/extensions/voice/sherpa-runtime.ts");
  assert.match(sherpaRuntime, /export function resetSherpaRuntime\(\)/);
  assert.match(voiceUse, /resetSherpaRuntime\(\)/);
  assert.match(ttsUse, /resetSherpaRuntime\(\)/);
});

test("tts_toggle advertises itself in the system prompt tool list", () => {
  const ttsUse = source("code/extensions/voice/tts-use.ts");
  assert.match(ttsUse, /name: "tts_toggle"[\s\S]*promptSnippet:/);
});

test("Spotify JSON state errors avoid leaking full paths", () => {
  const spotifyAuth = source("code/extensions/spotify/spotify-auth.ts");
  const readJsonBlock = spotifyAuth.slice(spotifyAuth.indexOf("function readJson"), spotifyAuth.indexOf("function writeJson"));
  assert.match(readJsonBlock, /basename\(path\)/);
  assert.doesNotMatch(readJsonBlock, /malformed at \$\{path\}/);
  assert.doesNotMatch(readJsonBlock, /error\.message : String\(error\)/);
});
