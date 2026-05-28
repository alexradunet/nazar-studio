import test from "node:test";
import assert from "node:assert/strict";

import {
  cleanForTts,
  normalizeMarkdownForTts,
  splitLongText,
  splitSpeakableChunks,
} from "../extensions/voice-text.ts";
import { resolveSttInputForTest, resolveTtsOutputForTest } from "../extensions/voice/sherpa-runtime.ts";

function env(values = {}) {
  return (name) => values[name] || "";
}

test("TTS markdown normalization strips syntax but keeps speakable text", () => {
  const input = [
    "# Heading",
    "",
    "See [the docs](https://example.com) and **bold** _italic_ text.",
    "",
    "```ts",
    "const secret = true;",
    "```",
    "- list item",
  ].join("\n");

  const normalized = normalizeMarkdownForTts(input);
  assert.match(normalized, /Heading/);
  assert.match(normalized, /the docs/);
  assert.match(normalized, /bold/);
  assert.match(normalized, /italic/);
  assert.doesNotMatch(normalized, /https:\/\/example\.com/);
  assert.doesNotMatch(normalized, /const secret/);
  assert.doesNotMatch(normalized, /```/);
});

test("TTS cleanup handles empty input, emojis, markdown links, and code blocks", () => {
  assert.equal(cleanForTts(""), "");
  const cleaned = cleanForTts("Hello 👋 [Pi](https://example.com).\n\n```js\nignore();\n```");
  assert.equal(cleaned, "Hello Pi.");
});

test("TTS long text splitting prefers sentence boundaries when practical", () => {
  const first = `${"A".repeat(90)}.`;
  const chunks = splitLongText(`${first} Next sentence is short.`, { maxChunkChars: 100 });
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0], first);
  assert.equal(chunks[1], "Next sentence is short.");
});

test("TTS long text splitting falls back for very long sentences", () => {
  const chunks = splitLongText("x".repeat(95), { maxChunkChars: 40 });
  assert.deepEqual(chunks.map((chunk) => chunk.length), [40, 40, 15]);
});

test("TTS streaming chunk split leaves incomplete rest", () => {
  const result = splitSpeakableChunks("Hello world. More words are still streaming", { minChars: 10 });
  assert.deepEqual(result.chunks, ["Hello world."]);
  assert.equal(result.rest, "More words are still streaming");
});

test("TTS splitting handles single-word and empty input", () => {
  assert.deepEqual(splitLongText("word", { maxChunkChars: 10 }), ["word"]);
  assert.deepEqual(splitLongText("   ", { maxChunkChars: 10 }), []);
  assert.deepEqual(splitSpeakableChunks("", { minChars: 10 }), { chunks: [], rest: "" });
});

test("voice STT resolver supports custom, unavailable native, pulse, and ALSA targets", () => {
  assert.deepEqual(resolveSttInputForTest({ platform: "linux", env: env({ PI_STT_COMMAND: "recorder", PI_STT_ARGS: '["--raw", "--rate", "16000"]' }) }), {
    backend: "custom",
    command: "recorder",
    args: ["--raw", "--rate", "16000"],
    label: "custom STT recorder recorder",
    hint: "The command must write raw signed 16-bit little-endian mono PCM at 16 kHz to stdout.",
  });

  const windows = resolveSttInputForTest({ platform: "win32", env: env() });
  assert.equal(windows.backend, "native");
  assert.equal(windows.unavailableReason, "no default Windows recorder is bundled");

  const mac = resolveSttInputForTest({ platform: "darwin", env: env() });
  assert.equal(mac.backend, "native");
  assert.match(mac.hint, /FFmpeg avfoundation/);

  const pulse = resolveSttInputForTest({ platform: "linux", env: env({ PI_STT_PULSE_SOURCE: "xrdp-source" }), pulseSourceIsXrdp: false });
  assert.equal(pulse.backend, "pulse");
  assert.deepEqual(pulse.args.slice(0, 2), ["--record", "--device=xrdp-source"]);

  const alsa = resolveSttInputForTest({ platform: "linux", env: env({ PI_STT_ALSA_DEVICE: "hw:1,0" }), pulseSourceIsXrdp: false });
  assert.equal(alsa.backend, "alsa");
  assert.deepEqual(alsa.args.slice(0, 2), ["-D", "hw:1,0"]);
});

test("voice TTS resolver supports macOS, custom, pulse, and ALSA targets", () => {
  const mac = resolveTtsOutputForTest("/tmp/speech.wav", { platform: "darwin", env: env() });
  assert.equal(mac.command, "afplay");
  assert.deepEqual(mac.args, ["/tmp/speech.wav"]);

  const custom = resolveTtsOutputForTest("/tmp/speech.wav", { platform: "linux", env: env({ PI_TTS_COMMAND: "player", PI_TTS_ARGS: '["--file", "{file}"]' }) });
  assert.equal(custom.backend, "custom");
  assert.deepEqual(custom.args, ["--file", "/tmp/speech.wav"]);

  const pulse = resolveTtsOutputForTest("/tmp/speech.wav", { platform: "linux", env: env({ PI_TTS_PULSE_SINK: "remote-sink" }), pulseSinkIsXrdp: false });
  assert.equal(pulse.backend, "pulse");
  assert.deepEqual(pulse.args, ["--device=remote-sink", "/tmp/speech.wav"]);

  const alsa = resolveTtsOutputForTest("/tmp/speech.wav", { platform: "linux", env: env({ PI_TTS_ALSA_DEVICE: "hw:0,0" }), pulseSinkIsXrdp: false });
  assert.equal(alsa.backend, "alsa");
  assert.deepEqual(alsa.args, ["--", "aplay", "-D", "hw:0,0", "/tmp/speech.wav"]);
});
