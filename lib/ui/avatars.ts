// SPDX-License-Identifier: AGPL-3.0-or-later
// Thin Pi adapter: patches the built-in message/tool render methods to use
// Nazar's border-free RPG turn panels. All layout logic lives in turn-composer.ts.
import {
  AssistantMessageComponent,
  BranchSummaryMessageComponent,
  CompactionSummaryMessageComponent,
  SkillInvocationMessageComponent,
  ToolExecutionComponent,
  UserMessageComponent,
} from "@earendil-works/pi-coding-agent";
import {
  AvatarCell,
  bodyColumnWidth,
  bodyOnlyColumnWidth,
  composeBodyOnlyPanel,
  composeMessagePanel,
  PANEL_TOP_PADDING_ASSISTANT,
  trimOuterBlankLines,
} from "./turn-composer.ts";
import {
  emptyAvatarLine,
  renderNazarExpression,
  renderRoleAvatar,
  renderToolPixelAvatar,
  type AvatarBackground,
  type RenderedAvatar,
} from "./pixel-avatar.ts";
import { NAZAR_MOOD_FRAME, nazarMoodFrame } from "./nazar-mood.ts";
import { AVATAR_FIELDS } from "./tokens.ts";
import { panelStyle, type PanelState, type PanelStyle } from "./panel-style.ts";
import { roleNameplate, type SpriteRole } from "./sprites.ts";
import { nazarMarkdownTheme } from "./markdown-theme.ts";
import { renderChapterDivider } from "./divider.ts";
import { uiQuality } from "./graphics-state.ts";

const AVATAR_ORIGINALS = Symbol.for("nazar.rpgAvatarOriginals");
const DEFAULT_RICH_AVATAR_RECENT_LIMIT = 20;
// Animation cadence — running tools self-schedule a re-render every tick so
// their pixel-art sprite cycles frames (anvil striking, lens scanning, etc).
const TOOL_ANIMATION_INTERVAL_MS = 180;
let PANEL_SEQUENCE = new WeakMap<object, number>();
const PANEL_KEY_SEQUENCE = new Map<string, number>();
let panelSequenceCounter = 0;
let refreshScheduled = false;

const PANEL_RENDER_CACHE = Symbol.for("nazar.panelRenderCache");

type PanelRenderCache = {
  key: string;
  lines: string[];
};

function panelRenderEnvKey(): string {
  return [
    uiQuality(),
    process.env.NAZAR_UI_QUALITY ?? "",
    process.env.NAZAR_AVATAR_ROWS ?? "",
    process.env.NAZAR_CELL_WIDTH_PX ?? "",
    process.env.NAZAR_CELL_HEIGHT_PX ?? "",
    process.env.NAZAR_AVATAR_RECENT_LIMIT ?? "",
  ].join("|");
}

function panelRenderCacheKey(kind: string, width: number, state: string): string {
  return [kind, width, panelSequenceCounter, panelRenderEnvKey(), state].join("\0");
}

function clearPanelRenderCache(owner: unknown): void {
  if ((typeof owner !== "object" && typeof owner !== "function") || owner === null) return;
  delete (owner as any)[PANEL_RENDER_CACHE];
}

function cachedPanelRender(
  owner: unknown,
  kind: string,
  width: number,
  state: string,
  render: () => string[],
): string[] {
  if ((typeof owner !== "object" && typeof owner !== "function") || owner === null) return render();
  const beforeKey = panelRenderCacheKey(kind, width, state);
  const cache = (owner as any)[PANEL_RENDER_CACHE] as PanelRenderCache | undefined;
  if (cache?.key === beforeKey) return cache.lines;

  const lines = render();
  (owner as any)[PANEL_RENDER_CACHE] = {
    key: panelRenderCacheKey(kind, width, state),
    lines,
  };
  return lines;
}

// The assistant message currently being generated in the live agent turn.
// Only this one reflects Nazar's live mood (focused / pleased / concerned …);
// saved messages render the calm open-eye face so thinking animation does not
// ripple backward through the transcript.
let activeAssistantComponent: unknown = null;
let assistantAvatarLive = false;

export function beginActiveAssistantAvatar(): void {
  activeAssistantComponent = null;
  assistantAvatarLive = true;
}

export function settleActiveAssistantAvatar(): void {
  activeAssistantComponent = null;
  assistantAvatarLive = false;
}

type ToolStatus = "pending" | "running" | "ok" | "error";

// ── Recent-avatar perf cap ─────────────────────────────────────────────────

function scheduleAvatarRefresh(owner: unknown): void {
  if (refreshScheduled) return;
  if ((typeof owner !== "object" && typeof owner !== "function") || owner === null) return;
  const invalidate = (owner as any).invalidate;
  if (typeof invalidate !== "function") return;
  refreshScheduled = true;
  setTimeout(() => {
    refreshScheduled = false;
    try { invalidate.call(owner); } catch { /* best-effort */ }
  }, 0);
}

// ── Tool sprite animation tick ─────────────────────────────────────────────
// Running tool components self-schedule a re-render every 180ms so their
// pixel-art sprite cycles through its 9 animation frames (the same cadence
// as ThinkingWidget). On the next render the patch sees the new status — if
// the tool finished, no new tick is scheduled and the loop stops naturally.

const TOOL_ANIM_TIMER = Symbol.for("nazar.toolAnimTimer");

function scheduleToolAnimationTick(component: unknown): void {
  const owner = component as { [TOOL_ANIM_TIMER]?: ReturnType<typeof setTimeout>; invalidate?(): void };
  if (typeof owner !== "object" || owner === null) return;
  if (owner[TOOL_ANIM_TIMER]) return; // already scheduled
  owner[TOOL_ANIM_TIMER] = setTimeout(() => {
    owner[TOOL_ANIM_TIMER] = undefined;
    try { owner.invalidate?.(); } catch { /* best-effort visual refresh */ }
  }, TOOL_ANIMATION_INTERVAL_MS);
}

function panelSequence(owner: unknown, stableKey?: string): number {
  if (stableKey) {
    let seq = PANEL_KEY_SEQUENCE.get(stableKey);
    if (seq === undefined) {
      seq = panelSequenceCounter++;
      PANEL_KEY_SEQUENCE.set(stableKey, seq);
      if (panelSequenceCounter > richAvatarRecentLimit()) scheduleAvatarRefresh(owner);
    }
    return seq;
  }
  if ((typeof owner !== "object" && typeof owner !== "function") || owner === null) return Number.MAX_SAFE_INTEGER;
  let seq = PANEL_SEQUENCE.get(owner);
  if (seq === undefined) {
    seq = panelSequenceCounter++;
    PANEL_SEQUENCE.set(owner, seq);
    if (panelSequenceCounter > richAvatarRecentLimit()) scheduleAvatarRefresh(owner);
  }
  return seq;
}

function richAvatarRecentLimit(): number {
  const raw = (process.env.NAZAR_AVATAR_RECENT_LIMIT || "").trim().toLowerCase();
  if (raw === "all" || raw === "unlimited" || raw === "inf" || raw === "infinite") return Number.POSITIVE_INFINITY;
  if (!raw) return DEFAULT_RICH_AVATAR_RECENT_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : DEFAULT_RICH_AVATAR_RECENT_LIMIT;
}

export function shouldUseRichAvatar(owner: unknown, active = false, stableKey?: string): boolean {
  if (active) return true;
  const limit = richAvatarRecentLimit();
  if (limit === Number.POSITIVE_INFINITY) return true;
  if (limit <= 0) return false;
  const sequence = panelSequence(owner, stableKey);
  return sequence >= panelSequenceCounter - limit;
}

// ── Avatar cells ───────────────────────────────────────────────────────────

function portraitCell(portrait: RenderedAvatar): AvatarCell {
  return {
    height: portrait.height,
    width: portrait.width,
    background: portrait.background,
    content(index) { return portrait.lines[index] ?? emptyAvatarLine(portrait.background); },
  };
}

function badgeCell(background: AvatarBackground, glyph = "◆"): AvatarCell {
  return {
    height: 1,
    width: 3,
    background,
    content(index) { return index === 0 ? { text: ` ${glyph} `, background } : emptyAvatarLine(background); },
  };
}

function roleBackground(role: SpriteRole): AvatarBackground {
  return role === "user" ? AVATAR_FIELDS.user : AVATAR_FIELDS.nazar;
}

function activateAssistantAvatar(owner: unknown, previousMessage: unknown, message: unknown): void {
  if (!assistantAvatarLive) return;
  // Pi invalidates old AssistantMessageComponents by calling updateContent()
  // with their existing lastMessage. Do not let those cache rebuilds steal the
  // live mood from the streaming component.
  if (previousMessage === message) return;
  activeAssistantComponent = owner;
}

function assistantNazarAvatarFrame(owner: unknown): number {
  return owner === activeAssistantComponent ? nazarMoodFrame() : NAZAR_MOOD_FRAME.neutral;
}

function avatarCell(owner: unknown, role: SpriteRole, active = false, stableKey?: string): AvatarCell {
  if (!shouldUseRichAvatar(owner, active, stableKey)) return badgeCell(roleBackground(role));
  if (role === "user") return portraitCell(renderRoleAvatar("user")!);
  return portraitCell(renderNazarExpression(assistantNazarAvatarFrame(owner))!);
}

function shouldDecorateRolePanel(owner: unknown, role: "user" | "assistant", active = false, renderedLines?: string[]): boolean {
  return shouldUseRichAvatar(owner, active, stablePanelKey(owner, role, renderedLines));
}

// ── Stable identity key for rich-avatar limit ──────────────────────────────

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(36);
}

function userComponentText(owner: unknown): string | undefined {
  const markdown = (owner as any)?.contentBox?.children?.[0];
  return typeof markdown?.text === "string" ? markdown.text : undefined;
}

function messageText(message: any): string | undefined {
  if (typeof message?.content === "string") return message.content;
  if (typeof message?.text === "string") return message.text;
  if (Array.isArray(message?.content)) {
    const text = message.content
      .filter((part: any) => part?.type === "text" && typeof part.text === "string")
      .map((part: any) => part.text)
      .join("\n");
    return text || undefined;
  }
  return undefined;
}

function roleMessagePanelKey(role: "user" | "assistant", message: any): string | undefined {
  if (role === "user") {
    const text = messageText(message);
    return text !== undefined ? `${role}:${stableHash(text)}` : undefined;
  }
  return `${role}:${stableHash(JSON.stringify(message))}`;
}

function stablePanelKey(owner: unknown, role: string, renderedLines?: string[]): string | undefined {
  const any = owner as any;
  if (role === "user") {
    const text = userComponentText(owner);
    if (text !== undefined) return `${role}:${stableHash(text)}`;
  }
  if (role === "assistant" && any?.lastMessage) return roleMessagePanelKey("assistant", any.lastMessage);
  if (role === "tool" && any?.toolCallId) return `${role}:${String(any.toolCallId)}`;
  if (renderedLines && renderedLines.length > 0) return `${role}:${stableHash(renderedLines.join("\n"))}`;
  return undefined;
}

export function seedAvatarPanelOrderFromSessionEntries(entries: readonly unknown[]): void {
  PANEL_SEQUENCE = new WeakMap<object, number>();
  PANEL_KEY_SEQUENCE.clear();
  panelSequenceCounter = 0;

  for (const entry of entries) {
    const any = entry as any;
    if (any?.type !== "message") continue;
    const message = any.message;
    if (message?.role === "user") {
      const key = roleMessagePanelKey("user", message);
      if (key) PANEL_KEY_SEQUENCE.set(key, panelSequenceCounter++);
      continue;
    }
    if (message?.role === "assistant") {
      const key = roleMessagePanelKey("assistant", message);
      if (key) PANEL_KEY_SEQUENCE.set(key, panelSequenceCounter++);
      for (const part of Array.isArray(message.content) ? message.content : []) {
        if (part?.type === "toolCall" && typeof part.id === "string") {
          PANEL_KEY_SEQUENCE.set(`tool:${part.id}`, panelSequenceCounter++);
        }
      }
    }
  }
}

function roleAvatarCell(owner: unknown, role: "user" | "assistant", renderedLines?: string[]): AvatarCell {
  if (role === "user") return avatarCell(owner, "user", false, stablePanelKey(owner, "user", renderedLines));
  return avatarCell(owner, "nazar", false, stablePanelKey(owner, "assistant", renderedLines));
}

// ── Role/tool styling helpers ──────────────────────────────────────────────

const BOLD_ON = "\x1b[1m";
const BOLD_OFF = "\x1b[22m";

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
function roleMeta(role: SpriteRole, lastMessage: any): string {
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

function toolPanelState(status: ToolStatus): PanelState {
  if (status === "running") return "running";
  if (status === "ok") return "ok";
  if (status === "error") return "error";
  return "idle";
}

function toolStyle(status: ToolStatus): PanelStyle {
  return panelStyle("tool", toolPanelState(status), { frame: status === "running" ? Date.now() / 180 : 0 });
}

function toolAccent(style: PanelStyle) {
  return style.supports.pulse ? style.paint.pulse : style.paint.accent;
}

function toolDisplayName(name: string): string {
  return name.replace(/^functions[._-]/, "").replace(/^multi_tool_use[._-]/, "multi").trim() || "tool";
}

/** Format the tool nameplate title: `<icon> NAME · construct`. */
function toolTitle(name: string, style: PanelStyle): string {
  const display = toolDisplayName(name).toUpperCase();
  const sub = "construct";
  return `${toolAccent(style)(`✦ ${BOLD_ON}${display}${BOLD_OFF}`)} ${style.paint.muted(`· ${sub}`)}`;
}

/** Per-tool meta string: exit/duration (ok/error) or `running` (pending/active). */
function toolMeta(component: any, style: PanelStyle): string {
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

// ── Tool status helpers ────────────────────────────────────────────────────

export function toolStatus(component: any): ToolStatus {
  if (component?.result?.isError) return "error";
  if (component?.result && !component?.isPartial) return "ok";
  if (component?.isPartial || component?.executionStarted) return "running";
  return "pending";
}

function toolStatusBackground(_status: ToolStatus): AvatarBackground {
  return AVATAR_FIELDS.tool;
}

function safeToolHint(component: any): string {
  try { return JSON.stringify({ args: component?.args, result: component?.result?.details }) ?? ""; }
  catch { return ""; }
}

function toolCell(component: any): AvatarCell {
  const status = toolStatus(component);
  const name = String(component?.toolName || "tool").trim() || "tool";
  const rich = shouldUseRichAvatar(component, status === "running", stablePanelKey(component, "tool"));
  if (!rich) return badgeCell(toolStatusBackground(status));
  const frame = status === "running" ? Date.now() / 180 : 0;
  return portraitCell(renderToolPixelAvatar(name, status, frame, safeToolHint(component))!);
}

// ── Testing surface ────────────────────────────────────────────────────────

function testAvatarCell(): AvatarCell {
  return portraitCell(renderRoleAvatar("nazar", { backend: "ansi" })!);
}

export const __testing = {
  composeMessagePanel(lines: string[], width = 80, title?: string): string[] {
    const avatar = testAvatarCell();
    return composeMessagePanel(lines, avatar, avatar.width, width, 0, title);
  },
  nazarAvatarFrame(owner: unknown): number {
    return assistantNazarAvatarFrame(owner);
  },
  beginActiveAssistantAvatar,
  activateAssistantAvatar,
  setActiveAssistantComponent(owner: unknown): void {
    activeAssistantComponent = owner;
  },
  shouldUseRichAvatar(owner: object, active = false): boolean {
    return shouldUseRichAvatar(owner, active);
  },
  shouldUseRichAvatarKey(stableKey: string, active = false): boolean {
    return shouldUseRichAvatar({}, active, stableKey);
  },
  messagePanelKey(role: "user" | "assistant", message: any): string | undefined {
    return roleMessagePanelKey(role, message);
  },
  seedAvatarPanelOrderFromSessionEntries,
  toolStatus(component: any): ToolStatus {
    return toolStatus(component);
  },
};

// ── Pi monkey-patch ────────────────────────────────────────────────────────
// Pi's public renderer hook covers custom messages only. For role avatars we
// decorate the exported built-in components in one idempotent place.

export function patchRpgAvatars() {
  // Defensive guard: we monkeypatch private Pi render methods below. If a Pi
  // upgrade renames or removes any of them, skip patching and fall back to Pi's
  // built-in rendering rather than storing `undefined` and crashing on the next
  // render. (lib/ui/avatars-patch.test.ts asserts this surface at CI; this is the
  // matching runtime safety net.)
  const patchTargets: Array<[any, string]> = [
    [UserMessageComponent, "render"], [UserMessageComponent, "invalidate"],
    [AssistantMessageComponent, "render"], [AssistantMessageComponent, "updateContent"], [AssistantMessageComponent, "invalidate"],
    [ToolExecutionComponent, "render"], [ToolExecutionComponent, "invalidate"],
    [CompactionSummaryMessageComponent, "render"],
    [BranchSummaryMessageComponent, "render"],
    [SkillInvocationMessageComponent, "render"],
  ];
  const missingPatchTargets = patchTargets.filter(([component, method]) => typeof component?.prototype?.[method] !== "function");
  if (missingPatchTargets.length > 0) {
    const surface = missingPatchTargets.map(([component, method]) => `${component?.name ?? "?"}.${method}`).join(", ");
    try { console.error(`[nazar] RPG avatar patch skipped — Pi render surface changed: ${surface}`); } catch { /* ignore */ }
    return;
  }

  const g = globalThis as any;
  const originals = g[AVATAR_ORIGINALS] ?? {};
  originals.assistantRender ??= AssistantMessageComponent.prototype.render;
  originals.assistantUpdateContent ??= AssistantMessageComponent.prototype.updateContent;
  originals.assistantInvalidate ??= AssistantMessageComponent.prototype.invalidate;
  originals.toolRender ??= ToolExecutionComponent.prototype.render;
  originals.toolInvalidate ??= ToolExecutionComponent.prototype.invalidate;
  originals.userRender ??= UserMessageComponent.prototype.render;
  originals.userInvalidate ??= UserMessageComponent.prototype.invalidate;
  g[AVATAR_ORIGINALS] = originals;

  UserMessageComponent.prototype.invalidate = function patchedUserInvalidate(): void {
    clearPanelRenderCache(this);
    originals.userInvalidate.call(this);
  };

  AssistantMessageComponent.prototype.invalidate = function patchedAssistantInvalidate(): void {
    clearPanelRenderCache(this);
    originals.assistantInvalidate.call(this);
  };

  ToolExecutionComponent.prototype.invalidate = function patchedToolInvalidate(): void {
    clearPanelRenderCache(this);
    originals.toolInvalidate.call(this);
  };

  UserMessageComponent.prototype.render = function patchedUserRender(width: number): string[] {
    return cachedPanelRender(this, "user", width, "static", () => {
      const bodyOnlyLines = originals.userRender.call(this, bodyOnlyColumnWidth(width));
      if (!shouldDecorateRolePanel(this, "user", false, bodyOnlyLines)) {
        return composeBodyOnlyPanel(
          bodyOnlyLines, width, 0,
          roleTitle("user"), rolePanelStyle("user"),
          { meta: roleMeta("user", undefined) },
        );
      }
      // Build the cells FIRST so we know the avatar column width, then ask Pi
      // to render the body wrapped into our narrower body column. Otherwise Pi
      // produces full-width rows that overflow when we paste them into the
      // two-column layout (causes pi-tui's width assertion to fire).
      const user = roleAvatarCell(this, "user", bodyOnlyLines);
      const lines = originals.userRender.call(this, bodyColumnWidth(width, user.width));
      // Conversation flows left→right: YOU on the left, Nazar (and his tools) on
      // the right — mirroring the input bar (you type on the left, it flows to Nazar).
      return composeMessagePanel(
        lines, user, user.width, width, 0,
        roleTitle("user"), rolePanelStyle("user"),
        { meta: roleMeta("user", undefined), align: "left" },
      );
    });
  };

  AssistantMessageComponent.prototype.updateContent = function patchedAssistantUpdateContent(message: any): void {
    clearPanelRenderCache(this);
    // Inject the inscription-style markdown theme. The wrapper is idempotent
    // and reuses the base theme's painters for colour, so it composes
    // cleanly with whatever theme Pi configured at construction time.
    const self = this as any;
    if (self.markdownTheme) {
      self.markdownTheme = nazarMarkdownTheme(self.markdownTheme);
    }

    const previousMessage = self.lastMessage;
    const hideThinking = Boolean(self.hideThinkingBlock);
    const displayMessage = hideThinking
      ? { ...message, content: message.content.filter((p: any) => p.type !== "thinking") }
      : message;
    originals.assistantUpdateContent.call(this, displayMessage);
    if (hideThinking) self.lastMessage = message;
    activateAssistantAvatar(this, previousMessage, message);
    clearPanelRenderCache(this);
  };

  AssistantMessageComponent.prototype.render = function patchedAssistantRender(width: number): string[] {
    const any = this as any;
    const lastMessage = any.lastMessage;
    const state = [
      lastMessage?.usage?.output_tokens ?? lastMessage?.usage?.tokens ?? "",
      lastMessage?.elapsedMs ?? lastMessage?.elapsed_ms ?? "",
      Boolean(any.hideThinkingBlock),
    ].join(":");
    const render = () => {
      if (!shouldDecorateRolePanel(this, "assistant")) {
        const lines = originals.assistantRender.call(this, bodyOnlyColumnWidth(width));
        if (trimOuterBlankLines(lines).length === 0) return [];
        return composeBodyOnlyPanel(
          lines, width, PANEL_TOP_PADDING_ASSISTANT,
          roleTitle("nazar"), rolePanelStyle("nazar"),
          { meta: roleMeta("nazar", lastMessage) },
        );
      }
      const nazar = roleAvatarCell(this, "assistant");
      const lines = originals.assistantRender.call(this, bodyColumnWidth(width, nazar.width));
      if (trimOuterBlankLines(lines).length === 0) return [];
      return composeMessagePanel(
        lines, nazar, nazar.width, width, PANEL_TOP_PADDING_ASSISTANT,
        roleTitle("nazar"), rolePanelStyle("nazar"),
        { meta: roleMeta("nazar", lastMessage), align: "right" },
      );
    };
    if (this === activeAssistantComponent) return render();
    return cachedPanelRender(this, "assistant", width, state, render);
  };

  ToolExecutionComponent.prototype.render = function patchedToolRender(width: number): string[] {
    const status = toolStatus(this);
    const any = this as any;
    const state = [
      status,
      any?.toolName ?? "",
      any?.elapsedMs ?? any?.elapsed_ms ?? "",
      Boolean(any?.result),
      Boolean(any?.result?.isError),
    ].join(":");
    const render = () => {
      if (!shouldUseRichAvatar(this, status === "running", stablePanelKey(this, "tool"))) {
        const name = String(any?.toolName || "tool").trim() || "tool";
        const style = toolStyle(status);
        const lines = originals.toolRender.call(this, bodyOnlyColumnWidth(width));
        if (trimOuterBlankLines(lines).length === 0) return [];
        return composeBodyOnlyPanel(
          lines, width, PANEL_TOP_PADDING_ASSISTANT,
          toolTitle(name, style), style,
          { meta: toolMeta(this, style) },
        );
      }
      const tool = toolCell(this);
      const name = String(any?.toolName || "tool").trim() || "tool";
      const lines = originals.toolRender.call(this, bodyColumnWidth(width, tool.width));
      if (trimOuterBlankLines(lines).length === 0) return [];
      const style = toolStyle(status);
      // Self-driving sprite animation while the tool is still running: the
      // tick scheduled here calls invalidate() in 180ms, which triggers a
      // re-render with a fresh frame index. When status becomes "ok" or
      // "error", no new tick is scheduled and the loop stops on its own.
      if (status === "running") scheduleToolAnimationTick(this);
      return composeMessagePanel(
        lines, tool, tool.width, width, PANEL_TOP_PADDING_ASSISTANT,
        toolTitle(name, style), style,
        { meta: toolMeta(this, style), align: "right" },
      );
    };
    if (status === "running") return render();
    return cachedPanelRender(this, "tool", width, state, render);
  };

  // ── Custom-message component patches ───────────────────────────────────
  // CompactionSummary, BranchSummary, and SkillInvocation already use Pi's
  // Box (bg fill, copy-safe). We only need to prepend a chapter-divider row
  // that visually marks the conversation boundary. The original render()
  // stays intact; we just wrap its output.

  function prependChapterDivider(origRender: (this: any, w: number) => string[], label: string) {
    return function patchedCustomRender(this: any, width: number): string[] {
      const inner = origRender.call(this, width);
      if (inner.length === 0) return inner;
      const style = panelStyle("system");
      const div = renderChapterDivider({ width, label, style, glyph: "✦" });
      return [div, ...inner];
    };
  }

  originals.compactionRender ??= CompactionSummaryMessageComponent.prototype.render;
  originals.branchRender ??= BranchSummaryMessageComponent.prototype.render;
  originals.skillRender ??= SkillInvocationMessageComponent.prototype.render;

  CompactionSummaryMessageComponent.prototype.render = prependChapterDivider(
    originals.compactionRender,
    "context compacted",
  );

  BranchSummaryMessageComponent.prototype.render = prependChapterDivider(
    originals.branchRender,
    "branch summary",
  );

  SkillInvocationMessageComponent.prototype.render = prependChapterDivider(
    originals.skillRender,
    "skill invoked",
  );
}
