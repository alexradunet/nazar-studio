// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "bun:test";
import {
  appendAssistantDelta,
  appendDraft,
  appendStatusLine,
  appendToolLine,
  appendUserLine,
  backspaceDraft,
  clearChatLines,
  clearDraft,
  initialChatState,
} from "./chat-state.ts";

test("assistant streaming deltas merge into one live line", () => {
  let state = initialChatState({ intro: "", maxLines: 10 });

  state = appendAssistantDelta(state, "Hel");
  state = appendAssistantDelta(state, "lo");

  expect(state.lines).toEqual([{ id: "1", kind: "assistant", text: "Hello" }]);
});

test("new user turn starts a new assistant stream", () => {
  let state = initialChatState({ intro: "", maxLines: 10 });

  state = appendAssistantDelta(state, "first");
  state = appendUserLine(state, "again");
  state = appendAssistantDelta(state, "second");

  expect(state.lines.map((line) => `${line.kind}:${line.text}`)).toEqual([
    "assistant:first",
    "user:again",
    "assistant:second",
  ]);
});

test("tool and status messages stay compact", () => {
  let state = initialChatState({ intro: "", maxLines: 10 });

  state = appendToolLine(state, "vault_search");
  state = appendStatusLine(state, "done");

  expect(state.lines).toEqual([
    { id: "1", kind: "tool", text: "vault_search" },
    { id: "2", kind: "status", text: "done" },
  ]);
});

test("draft helpers update input text", () => {
  let state = initialChatState({ intro: "" });

  state = appendDraft(state, "ab");
  state = backspaceDraft(state);
  state = appendDraft(state, "c");
  state = clearDraft(state);

  expect(state.composer).toEqual({ text: "", cursor: 0 });
});

test("clearChatLines removes visible transcript", () => {
  let state = initialChatState({ intro: "", maxLines: 10 });

  state = appendUserLine(state, "one");
  state = appendStatusLine(state, "two");
  state = clearChatLines(state);

  expect(state.lines).toEqual([]);
});

test("state keeps only the latest maxLines", () => {
  let state = initialChatState({ intro: "", maxLines: 2 });

  state = appendUserLine(state, "one");
  state = appendUserLine(state, "two");
  state = appendUserLine(state, "three");

  expect(state.lines.map((line) => line.text)).toEqual(["two", "three"]);
});
