// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "bun:test";
import {
  backspaceComposer,
  clearComposer,
  deleteComposer,
  initialComposerState,
  insertComposerText,
  moveComposerCursor,
  moveComposerEnd,
  moveComposerHome,
  setComposerText,
} from "./composer-state.ts";

test("inserts text at the cursor", () => {
  let state = initialComposerState("helo");
  state = moveComposerCursor(state, -1);
  state = insertComposerText(state, "l");

  expect(state).toEqual({ text: "hello", cursor: 4 });
});

test("backspace and delete operate around the cursor", () => {
  let state = initialComposerState("abc");
  state = moveComposerCursor(state, -1);
  state = backspaceComposer(state);
  expect(state).toEqual({ text: "ac", cursor: 1 });

  state = deleteComposer(state);
  expect(state).toEqual({ text: "a", cursor: 1 });
});

test("home end and movement clamp to the line", () => {
  let state = initialComposerState("abc");

  state = moveComposerCursor(state, 10);
  expect(state.cursor).toBe(3);
  state = moveComposerHome(state);
  expect(state.cursor).toBe(0);
  state = moveComposerCursor(state, -10);
  expect(state.cursor).toBe(0);
  state = moveComposerEnd(state);
  expect(state.cursor).toBe(3);
});

test("clear and set keep cursor valid", () => {
  let state = initialComposerState("hello");

  state = moveComposerHome(state);
  state = setComposerText(state, "hi");
  expect(state).toEqual({ text: "hi", cursor: 0 });
  state = clearComposer(state);
  expect(state).toEqual({ text: "", cursor: 0 });
});
