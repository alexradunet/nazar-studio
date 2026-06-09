// SPDX-License-Identifier: AGPL-3.0-or-later
// Typed contracts for the slices of Pi's render surface that Nazar reaches into.
//
// Pi exports its component classes (AssistantMessageComponent, …) and rich event
// types, but not the *internal* field shapes our render patches read off message
// objects and component instances. Rather than `any`, we model the exact subset
// we touch as small structural ("duck-typed") interfaces. These never change
// runtime behavior — they only document and type-check the access. Reads are
// best-effort: every field is optional because Pi does not guarantee them on the
// erased internal objects we inspect.

/** A content block inside a chat message (text / thinking / tool call). */
export interface MessageContentPart {
  type?: string;
  text?: string;
  thinking?: string;
  redacted?: boolean;
  id?: string;
}

/** The subset of a chat message Nazar reads when rendering panels/nameplates. */
export interface RenderableMessage {
  role?: string;
  text?: string;
  content?: string | MessageContentPart[];
  usage?: { output_tokens?: number; tokens?: number };
  elapsedMs?: number;
  elapsed_ms?: number;
}

/** A session transcript entry, as seeded into avatar panel ordering. */
export interface SessionEntryLike {
  type?: string;
  message?: RenderableMessage;
}

/** The subset of a Pi tool component / tool result Nazar inspects. */
export interface ToolComponentLike {
  toolName?: string;
  toolCallId?: string;
  args?: unknown;
  isPartial?: boolean;
  executionStarted?: boolean;
  elapsedMs?: number;
  elapsed_ms?: number;
  result?: { isError?: boolean; exitCode?: number; details?: unknown };
}

/** A render host (message/tool component instance) and the internal fields we read. */
export interface RenderOwnerLike {
  invalidate?: () => void;
  lastMessage?: RenderableMessage;
  hideThinkingBlock?: boolean;
  markdownTheme?: unknown;
  toolName?: string;
  toolCallId?: string;
  contentBox?: { children?: ReadonlyArray<{ text?: unknown } | undefined> };
}

/** An object we attach internal state to via Symbol keys. Callers guard for null. */
export type SymbolBag = Record<symbol, unknown>;

/** A patchable Pi component class (constructor exposing a prototype). */
export interface PiComponentClass {
  name?: string;
  prototype?: unknown;
}
