// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  backspaceComposer,
  clearComposer,
  deleteComposer,
  initialComposerState,
  insertComposerText,
  moveComposerCursor,
  moveComposerEnd,
  moveComposerHome,
  type ComposerState,
} from "./composer-state.ts";

export type ChatLineKind = "user" | "assistant" | "tool" | "status";

export interface ChatLine {
  id: string;
  kind: ChatLineKind;
  text: string;
}

export interface ChatState {
  lines: ChatLine[];
  composer: ComposerState;
  nextId: number;
  activeAssistantId?: string;
  maxLines: number;
}

export interface InitialChatStateOptions {
  intro?: string;
  maxLines?: number;
}

const DEFAULT_MAX_LINES = 80;
const DEFAULT_INTRO = "Balaur chat. /help, /clear, /branch <title>, /merge, /branches, /skill:name, /exit";

export function initialChatState(options: InitialChatStateOptions = {}): ChatState {
  const intro = options.intro ?? DEFAULT_INTRO;
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
  const lines = intro ? [{ id: "1", kind: "status" as const, text: intro }] : [];
  return { lines, composer: initialComposerState(), nextId: lines.length + 1, maxLines };
}

function capLines(state: ChatState): ChatState {
  if (state.lines.length <= state.maxLines) return state;
  const lines = state.lines.slice(-state.maxLines);
  const activeAssistantId = lines.some((line) => line.id === state.activeAssistantId) ? state.activeAssistantId : undefined;
  return { ...state, lines, activeAssistantId };
}

function appendLine(state: ChatState, kind: ChatLineKind, text: string): ChatState {
  return capLines({
    ...state,
    lines: [...state.lines, { id: String(state.nextId), kind, text }],
    nextId: state.nextId + 1,
    activeAssistantId: undefined,
  });
}

export function appendUserLine(state: ChatState, text: string): ChatState {
  return appendLine(state, "user", text);
}

export function appendStatusLine(state: ChatState, text: string): ChatState {
  return appendLine(state, "status", text);
}

export function appendToolLine(state: ChatState, toolName: string): ChatState {
  return appendLine(state, "tool", toolName);
}

export function appendAssistantDelta(state: ChatState, delta: string): ChatState {
  if (!delta) return state;
  const active = state.activeAssistantId;
  if (active) {
    const index = state.lines.findIndex((line) => line.id === active && line.kind === "assistant");
    if (index >= 0) {
      const lines = state.lines.map((line, lineIndex) => lineIndex === index ? { ...line, text: line.text + delta } : line);
      return { ...state, lines };
    }
  }

  const id = String(state.nextId);
  return capLines({
    ...state,
    lines: [...state.lines, { id, kind: "assistant", text: delta }],
    nextId: state.nextId + 1,
    activeAssistantId: id,
  });
}

export function clearChatLines(state: ChatState): ChatState {
  return { ...state, lines: [], activeAssistantId: undefined };
}

export function appendDraft(state: ChatState, input: string): ChatState {
  return { ...state, composer: insertComposerText(state.composer, input) };
}

export function backspaceDraft(state: ChatState): ChatState {
  return { ...state, composer: backspaceComposer(state.composer) };
}

export function deleteDraft(state: ChatState): ChatState {
  return { ...state, composer: deleteComposer(state.composer) };
}

export function moveDraftCursor(state: ChatState, offset: number): ChatState {
  return { ...state, composer: moveComposerCursor(state.composer, offset) };
}

export function moveDraftHome(state: ChatState): ChatState {
  return { ...state, composer: moveComposerHome(state.composer) };
}

export function moveDraftEnd(state: ChatState): ChatState {
  return { ...state, composer: moveComposerEnd(state.composer) };
}

export function clearDraft(state: ChatState): ChatState {
  return { ...state, composer: clearComposer(state.composer) };
}
