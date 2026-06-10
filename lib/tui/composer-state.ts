// SPDX-License-Identifier: AGPL-3.0-or-later
export interface ComposerState {
  text: string;
  cursor: number;
}

export function initialComposerState(text = ""): ComposerState {
  return { text, cursor: text.length };
}

function clampCursor(text: string, cursor: number): number {
  return Math.max(0, Math.min(text.length, cursor));
}

export function setComposerText(state: ComposerState, text: string): ComposerState {
  return { text, cursor: clampCursor(text, state.cursor) };
}

export function insertComposerText(state: ComposerState, input: string): ComposerState {
  if (!input) return state;
  const before = state.text.slice(0, state.cursor);
  const after = state.text.slice(state.cursor);
  return { text: before + input + after, cursor: state.cursor + input.length };
}

export function backspaceComposer(state: ComposerState): ComposerState {
  if (state.cursor <= 0) return state;
  return {
    text: state.text.slice(0, state.cursor - 1) + state.text.slice(state.cursor),
    cursor: state.cursor - 1,
  };
}

export function deleteComposer(state: ComposerState): ComposerState {
  if (state.cursor >= state.text.length) return state;
  return {
    text: state.text.slice(0, state.cursor) + state.text.slice(state.cursor + 1),
    cursor: state.cursor,
  };
}

export function moveComposerCursor(state: ComposerState, offset: number): ComposerState {
  return { ...state, cursor: clampCursor(state.text, state.cursor + offset) };
}

export function moveComposerHome(state: ComposerState): ComposerState {
  return { ...state, cursor: 0 };
}

export function moveComposerEnd(state: ComposerState): ComposerState {
  return { ...state, cursor: state.text.length };
}

export function clearComposer(state: ComposerState): ComposerState {
  return state.text ? initialComposerState() : state;
}
