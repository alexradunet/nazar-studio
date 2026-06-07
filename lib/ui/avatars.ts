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
  analyzeTextCells,
  AvatarCell,
  bodyColumnWidth,
  composeMessagePanel,
  PANEL_TOP_PADDING_ASSISTANT,
  splitLeadingControlSequences,
  trimOuterBlankLines,
} from "./turn-composer.ts";
import {
  centerAvatarLine,
  emptyAvatarLine,
  renderNazarExpression,
  renderRoleAvatar,
  renderToolPixelAvatar,
  type AvatarBackground,
  type AvatarRenderLine,
  type RenderedAvatar,
} from "./pixel-avatar.ts";
import { NAZAR_MOOD_FRAME, nazarMoodFrame } from "./nazar-mood.ts";
import { AVATAR_FIELDS } from "./tokens.ts";
import { panelStyle, type PanelState, type PanelStyle } from "./panel-style.ts";
import { roleNameplate, type SpriteRole } from "./sprites.ts";
import { nazarMarkdownTheme } from "./markdown-theme.ts";
import { renderChapterDivider } from "./divider.ts";

const AVATAR_ORIGINALS = Symbol.for("nazar.rpgAvatarOriginals");
const DEFAULT_RICH_AVATAR_RECENT_LIMIT = 20;
// Animation cadence — running tools self-schedule a re-render every tick so
// their pixel-art sprite cycles frames (anvil striking, lens scanning, etc).
const TOOL_ANIMATION_INTERVAL_MS = 180;
const PANEL_SEQUENCE = new WeakMap<object, number>();
const PANEL_KEY_SEQUENCE = new Map<string, number>();
let panelSequenceCounter = 0;
let refreshScheduled = false;

// The assistant message currently being generated / most recently updated.
// Only this one reflects Nazar's live mood (focused / pleased / concerned …);
// older messages render the calm neutral face so the avatar doesn't animate
// across the whole transcript.
let activeAssistantComponent: unknown = null;

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

function avatarCell(owner: unknown, role: SpriteRole, active = false, stableKey?: string): AvatarCell {
  if (!shouldUseRichAvatar(owner, active, stableKey)) return badgeCell(roleBackground(role));
  if (role === "user") return portraitCell(renderRoleAvatar("user")!);
  // Only the active (latest) assistant message reflects Nazar's live mood;
  // historical messages show the calm neutral face (no transcript-wide animation).
  const frame = owner === activeAssistantComponent ? nazarMoodFrame() : NAZAR_MOOD_FRAME.neutral;
  return portraitCell(renderNazarExpression(frame)!);
}

// ── Stable identity key for rich-avatar limit ──────────────────────────────

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(36);
}

function stablePanelKey(owner: unknown, role: string, renderedLines?: string[]): string | undefined {
  const any = owner as any;
  if (role === "assistant" && any?.lastMessage) return `${role}:${stableHash(JSON.stringify(any.lastMessage))}`;
  if (role === "tool" && any?.toolCallId) return `${role}:${String(any.toolCallId)}`;
  if (renderedLines && renderedLines.length > 0) return `${role}:${stableHash(renderedLines.join("\n"))}`;
  return undefined;
}

function buildCells(owner: unknown, renderedLines?: string[]) {
  const user = avatarCell(owner, "user", false, stablePanelKey(owner, "user", renderedLines));
  const nazar = avatarCell(owner, "nazar", false, stablePanelKey(owner, "assistant", renderedLines));
  return { user, nazar, width: Math.max(user.width, nazar.width) };
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

function toolStatusBackground(status: ToolStatus): AvatarBackground {
  if (status === "error") return AVATAR_FIELDS.toolError;
  if (status === "ok") return AVATAR_FIELDS.toolOk;
  if (status === "running") return AVATAR_FIELDS.toolRunning;
  return AVATAR_FIELDS.toolPending;
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
  shouldUseRichAvatar(owner: object, active = false): boolean {
    return shouldUseRichAvatar(owner, active);
  },
  toolStatus(component: any): ToolStatus {
    return toolStatus(component);
  },
};

// ── Pi monkey-patch ────────────────────────────────────────────────────────
// Pi's public renderer hook covers custom messages only. For role avatars we
// decorate the exported built-in components in one idempotent place.

export function patchRpgAvatars() {
  const g = globalThis as any;
  const originals = g[AVATAR_ORIGINALS] ?? {};
  originals.assistantRender ??= AssistantMessageComponent.prototype.render;
  originals.assistantUpdateContent ??= AssistantMessageComponent.prototype.updateContent;
  originals.toolRender ??= ToolExecutionComponent.prototype.render;
  originals.userRender ??= UserMessageComponent.prototype.render;
  g[AVATAR_ORIGINALS] = originals;

  UserMessageComponent.prototype.render = function patchedUserRender(width: number): string[] {
    // Build the cells FIRST so we know the avatar column width, then ask Pi
    // to render the body wrapped into our narrower body column. Otherwise Pi
    // produces full-width rows that overflow when we paste them into the
    // two-column layout (causes pi-tui's width assertion to fire).
    const cells = buildCells(this);
    const lines = originals.userRender.call(this, bodyColumnWidth(width, cells.width));
    // User messages render with the avatar on the RIGHT so the conversation
    // reads like a chat: agent/tools on the left, you on the right.
    return composeMessagePanel(
      lines, cells.user, cells.width, width, 0,
      roleTitle("user"), rolePanelStyle("user"),
      { meta: roleMeta("user", undefined), align: "right" },
    );
  };

  AssistantMessageComponent.prototype.updateContent = function patchedAssistantUpdateContent(message: any): void {
    // Inject the inscription-style markdown theme. The wrapper is idempotent
    // and reuses the base theme's painters for colour, so it composes
    // cleanly with whatever theme Pi configured at construction time.
    const self = this as any;
    if (self.markdownTheme) {
      self.markdownTheme = nazarMarkdownTheme(self.markdownTheme);
    }

    const hideThinking = Boolean(self.hideThinkingBlock);
    const displayMessage = hideThinking
      ? { ...message, content: message.content.filter((p: any) => p.type !== "thinking") }
      : message;
    originals.assistantUpdateContent.call(this, displayMessage);
    if (hideThinking) self.lastMessage = message;
    // The streaming message is the active one — only it shows the live mood.
    activeAssistantComponent = this;
  };

  AssistantMessageComponent.prototype.render = function patchedAssistantRender(width: number): string[] {
    const cells = buildCells(this);
    const lines = originals.assistantRender.call(this, bodyColumnWidth(width, cells.width));
    if (trimOuterBlankLines(lines).length === 0) return [];
    return composeMessagePanel(
      lines, cells.nazar, cells.width, width, PANEL_TOP_PADDING_ASSISTANT,
      roleTitle("nazar"), rolePanelStyle("nazar"),
      { meta: roleMeta("nazar", (this as any).lastMessage) },
    );
  };

  ToolExecutionComponent.prototype.render = function patchedToolRender(width: number): string[] {
    const tool = toolCell(this);
    const name = String((this as any)?.toolName || "tool").trim() || "tool";
    const status = toolStatus(this);
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
      { meta: toolMeta(this, style) },
    );
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
