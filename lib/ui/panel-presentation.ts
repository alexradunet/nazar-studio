// SPDX-License-Identifier: AGPL-3.0-or-later
// Pure presentation + identity helpers for Nazar's turn panels: avatar cells,
// role/tool nameplate titles + meta, tool status, and the stable panel-identity
// keys used to cap rich-avatar rendering. No module state and no Pi patching —
// the stateful adapter + cache live in avatars.ts. Kept separate so the panel
// "look" is unit-testable in isolation and avatars.ts stays under the size rule.
import { panelStyle, type PanelState, type PanelStyle } from "./panel-style.ts";
import { roleNameplate, type SpriteRole } from "./sprites.ts";
import { AVATAR_FIELDS } from "./tokens.ts";
import { emptyAvatarLine, type AvatarBackground, type RenderedAvatar } from "./pixel-avatar.ts";
import type { RenderableMessage, RenderOwnerLike, ToolComponentLike } from "./pi-surface.ts";
import type { AvatarCell } from "./turn-composer.ts";

export type ToolStatus = "pending" | "running" | "ok" | "error";

const BOLD_ON = "\x1b[1m";
const BOLD_OFF = "\x1b[22m";

// ── Avatar cells ───────────────────────────────────────────────────────────

export function portraitCell(portrait: RenderedAvatar): AvatarCell {
  return {
    height: portrait.height,
    width: portrait.width,
    background: portrait.background,
    content(index) { return portrait.lines[index] ?? emptyAvatarLine(portrait.background); },
  };
}

export function badgeCell(background: AvatarBackground, glyph = "◆"): AvatarCell {
  return {
    height: 1,
    width: 3,
    background,
    content(index) { return index === 0 ? { text: ` ${glyph} `, background } : emptyAvatarLine(background); },
  };
}

export function roleBackground(role: SpriteRole): AvatarBackground {
  return role === "user" ? AVATAR_FIELDS.user : AVATAR_FIELDS.nazar;
}

// ── Stable identity keys for the rich-avatar limit ─────────────────────────

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(36);
}

function userComponentText(owner: unknown): string | undefined {
  const markdown = (owner as RenderOwnerLike).contentBox?.children?.[0];
  return typeof markdown?.text === "string" ? markdown.text : undefined;
}

function messageText(message: RenderableMessage): string | undefined {
  if (typeof message?.content === "string") return message.content;
  if (typeof message?.text === "string") return message.text;
  if (Array.isArray(message?.content)) {
    const text = message.content
      .filter((part) => part?.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n");
    return text || undefined;
  }
  return undefined;
}

export function roleMessagePanelKey(role: "user" | "assistant", message: RenderableMessage): string | undefined {
  if (role === "user") {
    const text = messageText(message);
    return text !== undefined ? `${role}:${stableHash(text)}` : undefined;
  }
  return `${role}:${stableHash(JSON.stringify(message))}`;
}

export function stablePanelKey(owner: unknown, role: string, renderedLines?: string[]): string | undefined {
  const host = owner as RenderOwnerLike;
  if (role === "user") {
    const text = userComponentText(owner);
    if (text !== undefined) return `${role}:${stableHash(text)}`;
  }
  if (role === "assistant" && host?.lastMessage) return roleMessagePanelKey("assistant", host.lastMessage);
  if (role === "tool" && host?.toolCallId) return `${role}:${String(host.toolCallId)}`;
  if (renderedLines && renderedLines.length > 0) return `${role}:${stableHash(renderedLines.join("\n"))}`;
  return undefined;
}

// ── Role styling helpers ───────────────────────────────────────────────────

/** Map a sprite role to its canonical panel style — exported so the editor
 * can match the user-message panel exactly (same hue, same plaque). */
export function rolePanelStyle(role: SpriteRole): PanelStyle {
  return panelStyle(role === "user" ? "user" : "assistant");
}

/** Per-role icon glyph used in the nameplate band. */
function roleIcon(role: SpriteRole): string {
  return role === "user" ? "⛨" : "✦";
}

/** Per-role descriptor shown after the title (e.g. "the oracle"). */
function roleDescriptor(role: SpriteRole): string {
  return role === "user" ? "you" : "the oracle";
}

/**
 * Format the nameplate title: `<icon> NAME · descriptor`.
 * NAME is bold in the role title colour; descriptor is muted.
 * Exported so the input editor can render an IDENTICAL title to the
 * submitted user-message panel below it — visual continuity through submit.
 */
export function roleTitle(role: SpriteRole): string {
  const style = rolePanelStyle(role);
  const icon = roleIcon(role);
  const name = roleNameplate(role).toUpperCase();
  const sub = roleDescriptor(role);
  return `${style.paint.title(`${icon} ${BOLD_ON}${name}${BOLD_OFF}`)} ${style.paint.muted(`· ${sub}`)}`;
}

/** Per-role meta string for the right side of the nameplate. */
export function roleMeta(role: SpriteRole, lastMessage: RenderableMessage | undefined): string {
  const style = rolePanelStyle(role);
  if (role === "user") {
    // User messages don't carry meta today. The right side of the nameplate
    // stays empty so the panel reads as a clean speaker label — which also
    // means the editor (which DOES show "drafting…" while live) is visually
    // distinguishable from a submitted message only by that one indicator.
    return "";
  }
  // Assistant: tokens (if available) + elapsed (if available).
  const tokens = lastMessage?.usage?.output_tokens ?? lastMessage?.usage?.tokens;
  const elapsedMs = lastMessage?.elapsedMs ?? lastMessage?.elapsed_ms;
  const parts: string[] = [];
  if (typeof tokens === "number") parts.push(`◇ ${formatTokens(tokens)}`);
  if (typeof elapsedMs === "number") parts.push(formatElapsed(elapsedMs));
  return parts.length ? style.paint.muted(parts.join(" · ")) : "";
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k tok`;
  return `${n} tok`;
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ── Tool styling + status helpers ──────────────────────────────────────────

function toolPanelState(status: ToolStatus): PanelState {
  if (status === "running") return "running";
  if (status === "ok") return "ok";
  if (status === "error") return "error";
  return "idle";
}

export function toolStyle(status: ToolStatus): PanelStyle {
  return panelStyle("tool", toolPanelState(status), { frame: status === "running" ? Date.now() / 180 : 0 });
}

function toolAccent(style: PanelStyle) {
  return style.supports.pulse ? style.paint.pulse : style.paint.accent;
}

function toolDisplayName(name: string): string {
  return name.replace(/^functions[._-]/, "").replace(/^multi_tool_use[._-]/, "multi").trim() || "tool";
}

/** Format the tool nameplate title: `<icon> NAME · construct`. */
export function toolTitle(name: string, style: PanelStyle): string {
  const display = toolDisplayName(name).toUpperCase();
  const sub = "construct";
  return `${toolAccent(style)(`✦ ${BOLD_ON}${display}${BOLD_OFF}`)} ${style.paint.muted(`· ${sub}`)}`;
}

/** Per-tool meta string: exit/duration (ok/error) or `running` (pending/active). */
export function toolMeta(component: ToolComponentLike, style: PanelStyle): string {
  const status = toolStatus(component);
  const elapsedMs = component?.elapsedMs ?? component?.elapsed_ms;
  if (status === "ok") {
    const exit = component?.result?.exitCode ?? 0;
    const parts = [`exit ${exit}`];
    if (typeof elapsedMs === "number") parts.push(formatElapsed(elapsedMs));
    return style.paint.muted(parts.join(" · "));
  }
  if (status === "error") {
    const exit = component?.result?.exitCode;
    return style.paint.muted(typeof exit === "number" ? `error · exit ${exit}` : "error");
  }
  if (status === "running") return toolAccent(style)("running…");
  return style.paint.muted("pending");
}

export function toolStatus(component: ToolComponentLike): ToolStatus {
  if (component?.result?.isError) return "error";
  if (component?.result && !component?.isPartial) return "ok";
  if (component?.isPartial || component?.executionStarted) return "running";
  return "pending";
}

export function toolStatusBackground(_status: ToolStatus): AvatarBackground {
  return AVATAR_FIELDS.tool;
}

export function safeToolHint(component: ToolComponentLike): string {
  try { return JSON.stringify({ args: component?.args, result: component?.result?.details }) ?? ""; }
  catch { return ""; }
}
