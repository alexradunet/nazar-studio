import test from "node:test";
import assert from "node:assert/strict";

import {
  cleanForTts,
  normalizeMarkdownForTts,
  splitLongText,
  splitSpeakableChunks,
} from "../extensions/voice-text.ts";

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
