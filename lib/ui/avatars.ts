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
  renderNazarExpression,
  renderRoleAvatar,
  renderToolPixelAvatar,
} from "./pixel-avatar.ts";
import { NAZAR_MOOD_FRAME, nazarMoodFrame } from "./nazar-mood.ts";
import { panelStyle } from "./panel-style.ts";
import { type SpriteRole } from "./sprites.ts";
import { nazarMarkdownTheme } from "./markdown-theme.ts";
import { renderChapterDivider } from "./divider.ts";
import { uiQuality } from "./graphics-state.ts";
import type {
  MessageContentPart,
  PiComponentClass,
  RenderableMessage,
  RenderOwnerLike,
  SessionEntryLike,
  SymbolBag,
  ToolComponentLike,
} from "./pi-surface.ts";
import { cachedPanelRender, clearPanelRenderCache } from "./panel-cache.ts";
import {
  badgeCell,
  portraitCell,
  roleBackground,
  roleMessagePanelKey,
  roleMeta,
  rolePanelStyle,
  roleTitle,
  safeToolHint,
  stablePanelKey,
  toolMeta,
  toolStatus,
  toolStatusBackground,
  toolStyle,
  toolTitle,
  type ToolStatus,
} from "./panel-presentation.ts";

// Pi's original prototype render/update methods, stashed before we patch them.
type PiRender = (this: object, width: number) => string[];
type PiUpdate = (this: object, message: unknown) => void;
type PiInvalidate = (this: object) => void;
interface AvatarOriginals {
  assistantRender?: PiRender;
  assistantUpdateContent?: PiUpdate;
  assistantInvalidate?: PiInvalidate;
  toolRender?: PiRender;
  toolInvalidate?: PiInvalidate;
  userRender?: PiRender;
  userInvalidate?: PiInvalidate;
  compactionRender?: PiRender;
  branchRender?: PiRender;
  skillRender?: PiRender;
}

const AVATAR_ORIGINALS = Symbol.for("nazar.rpgAvatarOriginals");
const DEFAULT_RICH_AVATAR_RECENT_LIMIT = 20;
// Animation cadence — running tools self-schedule a re-render every tick so
// their pixel-art sprite cycles frames (anvil striking, lens scanning, etc).
const TOOL_ANIMATION_INTERVAL_MS = 180;
let PANEL_SEQUENCE = new WeakMap<object, number>();
const PANEL_KEY_SEQUENCE = new Map<string, number>();
let panelSequenceCounter = 0;
let refreshScheduled = false;

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

// ── Recent-avatar perf cap ─────────────────────────────────────────────────

function scheduleAvatarRefresh(owner: unknown): void {
  if (refreshScheduled) return;
  if ((typeof owner !== "object" && typeof owner !== "function") || owner === null) return;
  const invalidate = (owner as RenderOwnerLike).invalidate;
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

export function seedAvatarPanelOrderFromSessionEntries(entries: readonly unknown[]): void {
  PANEL_SEQUENCE = new WeakMap<object, number>();
  PANEL_KEY_SEQUENCE.clear();
  panelSequenceCounter = 0;

  for (const entry of entries) {
    const e = entry as SessionEntryLike;
    if (e?.type !== "message") continue;
    const message = e.message;
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

function toolCell(component: ToolComponentLike): AvatarCell {
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
  messagePanelKey(role: "user" | "assistant", message: RenderableMessage): string | undefined {
    return roleMessagePanelKey(role, message);
  },
  seedAvatarPanelOrderFromSessionEntries,
  toolStatus(component: ToolComponentLike): ToolStatus {
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
  const patchTargets: Array<[PiComponentClass, string]> = [
    [UserMessageComponent, "render"], [UserMessageComponent, "invalidate"],
    [AssistantMessageComponent, "render"], [AssistantMessageComponent, "updateContent"], [AssistantMessageComponent, "invalidate"],
    [ToolExecutionComponent, "render"], [ToolExecutionComponent, "invalidate"],
    [CompactionSummaryMessageComponent, "render"],
    [BranchSummaryMessageComponent, "render"],
    [SkillInvocationMessageComponent, "render"],
  ];
  const missingPatchTargets = patchTargets.filter(
    ([component, method]) => typeof (component?.prototype as Record<string, unknown> | undefined)?.[method] !== "function",
  );
  if (missingPatchTargets.length > 0) {
    const surface = missingPatchTargets.map(([component, method]) => `${component?.name ?? "?"}.${method}`).join(", ");
    try { console.error(`[nazar] RPG avatar patch skipped — Pi render surface changed: ${surface}`); } catch { /* ignore */ }
    return;
  }

  const g = globalThis as SymbolBag;
  const originals = (g[AVATAR_ORIGINALS] as AvatarOriginals | undefined) ?? {};
  originals.assistantRender ??= AssistantMessageComponent.prototype.render as PiRender;
  originals.assistantUpdateContent ??= AssistantMessageComponent.prototype.updateContent as PiUpdate;
  originals.assistantInvalidate ??= AssistantMessageComponent.prototype.invalidate as PiInvalidate;
  originals.toolRender ??= ToolExecutionComponent.prototype.render as PiRender;
  originals.toolInvalidate ??= ToolExecutionComponent.prototype.invalidate as PiInvalidate;
  originals.userRender ??= UserMessageComponent.prototype.render as PiRender;
  originals.userInvalidate ??= UserMessageComponent.prototype.invalidate as PiInvalidate;
  g[AVATAR_ORIGINALS] = originals;
  // After the ??= block every render/invalidate slot is populated; the custom
  // component renders below populate the remaining three before they're read.
  const orig = originals as Required<AvatarOriginals>;

  UserMessageComponent.prototype.invalidate = function patchedUserInvalidate(): void {
    clearPanelRenderCache(this);
    orig.userInvalidate.call(this);
  };

  AssistantMessageComponent.prototype.invalidate = function patchedAssistantInvalidate(): void {
    clearPanelRenderCache(this);
    orig.assistantInvalidate.call(this);
  };

  ToolExecutionComponent.prototype.invalidate = function patchedToolInvalidate(): void {
    clearPanelRenderCache(this);
    orig.toolInvalidate.call(this);
  };

  UserMessageComponent.prototype.render = function patchedUserRender(width: number): string[] {
    return cachedPanelRender(this, () => panelRenderCacheKey("user", width, "static"), () => {
      const bodyOnlyLines = orig.userRender.call(this, bodyOnlyColumnWidth(width));
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
      const lines = orig.userRender.call(this, bodyColumnWidth(width, user.width));
      // Conversation flows left→right: YOU on the left, Nazar (and his tools) on
      // the right — mirroring the input bar (you type on the left, it flows to Nazar).
      return composeMessagePanel(
        lines, user, user.width, width, 0,
        roleTitle("user"), rolePanelStyle("user"),
        { meta: roleMeta("user", undefined), align: "left" },
      );
    });
  };

  AssistantMessageComponent.prototype.updateContent = function patchedAssistantUpdateContent(message: unknown): void {
    clearPanelRenderCache(this);
    // Inject the inscription-style markdown theme. The wrapper is idempotent
    // and reuses the base theme's painters for colour, so it composes
    // cleanly with whatever theme Pi configured at construction time.
    const self = this as unknown as RenderOwnerLike;
    if (self.markdownTheme) {
      self.markdownTheme = nazarMarkdownTheme(self.markdownTheme as Parameters<typeof nazarMarkdownTheme>[0]);
    }

    const previousMessage = self.lastMessage;
    const hideThinking = Boolean(self.hideThinkingBlock);
    const msg = message as RenderableMessage;
    const displayMessage = hideThinking
      ? { ...msg, content: (msg.content as MessageContentPart[]).filter((p) => p.type !== "thinking") }
      : message;
    orig.assistantUpdateContent.call(this, displayMessage);
    if (hideThinking) self.lastMessage = msg;
    activateAssistantAvatar(this, previousMessage, message);
    clearPanelRenderCache(this);
  };

  AssistantMessageComponent.prototype.render = function patchedAssistantRender(width: number): string[] {
    const owner = this as unknown as RenderOwnerLike;
    const lastMessage = owner.lastMessage;
    const state = [
      lastMessage?.usage?.output_tokens ?? lastMessage?.usage?.tokens ?? "",
      lastMessage?.elapsedMs ?? lastMessage?.elapsed_ms ?? "",
      Boolean(owner.hideThinkingBlock),
    ].join(":");
    const render = () => {
      if (!shouldDecorateRolePanel(this, "assistant")) {
        const lines = orig.assistantRender.call(this, bodyOnlyColumnWidth(width));
        if (trimOuterBlankLines(lines).length === 0) return [];
        return composeBodyOnlyPanel(
          lines, width, PANEL_TOP_PADDING_ASSISTANT,
          roleTitle("nazar"), rolePanelStyle("nazar"),
          { meta: roleMeta("nazar", lastMessage) },
        );
      }
      const nazar = roleAvatarCell(this, "assistant");
      const lines = orig.assistantRender.call(this, bodyColumnWidth(width, nazar.width));
      if (trimOuterBlankLines(lines).length === 0) return [];
      return composeMessagePanel(
        lines, nazar, nazar.width, width, PANEL_TOP_PADDING_ASSISTANT,
        roleTitle("nazar"), rolePanelStyle("nazar"),
        { meta: roleMeta("nazar", lastMessage), align: "right" },
      );
    };
    if (this === activeAssistantComponent) return render();
    return cachedPanelRender(this, () => panelRenderCacheKey("assistant", width, state), render);
  };

  ToolExecutionComponent.prototype.render = function patchedToolRender(width: number): string[] {
    const owner = this as unknown as ToolComponentLike;
    const status = toolStatus(owner);
    const state = [
      status,
      owner?.toolName ?? "",
      owner?.elapsedMs ?? owner?.elapsed_ms ?? "",
      Boolean(owner?.result),
      Boolean(owner?.result?.isError),
    ].join(":");
    const render = () => {
      if (!shouldUseRichAvatar(this, status === "running", stablePanelKey(this, "tool"))) {
        const name = String(owner?.toolName || "tool").trim() || "tool";
        const style = toolStyle(status);
        const lines = orig.toolRender.call(this, bodyOnlyColumnWidth(width));
        if (trimOuterBlankLines(lines).length === 0) return [];
        return composeBodyOnlyPanel(
          lines, width, PANEL_TOP_PADDING_ASSISTANT,
          toolTitle(name, style), style,
          { meta: toolMeta(owner, style) },
        );
      }
      const tool = toolCell(owner);
      const name = String(owner?.toolName || "tool").trim() || "tool";
      const lines = orig.toolRender.call(this, bodyColumnWidth(width, tool.width));
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
        { meta: toolMeta(owner, style), align: "right" },
      );
    };
    if (status === "running") return render();
    return cachedPanelRender(this, () => panelRenderCacheKey("tool", width, state), render);
  };

  // ── Custom-message component patches ───────────────────────────────────
  // CompactionSummary, BranchSummary, and SkillInvocation already use Pi's
  // Box (bg fill, copy-safe). We only need to prepend a chapter-divider row
  // that visually marks the conversation boundary. The original render()
  // stays intact; we just wrap its output.

  function prependChapterDivider(origRender: PiRender, label: string) {
    return function patchedCustomRender(this: object, width: number): string[] {
      const inner = origRender.call(this, width);
      if (inner.length === 0) return inner;
      const style = panelStyle("system");
      const div = renderChapterDivider({ width, label, style, glyph: "✦" });
      return [div, ...inner];
    };
  }

  originals.compactionRender ??= CompactionSummaryMessageComponent.prototype.render as PiRender;
  originals.branchRender ??= BranchSummaryMessageComponent.prototype.render as PiRender;
  originals.skillRender ??= SkillInvocationMessageComponent.prototype.render as PiRender;

  CompactionSummaryMessageComponent.prototype.render = prependChapterDivider(
    orig.compactionRender,
    "context compacted",
  );

  BranchSummaryMessageComponent.prototype.render = prependChapterDivider(
    orig.branchRender,
    "branch summary",
  );

  SkillInvocationMessageComponent.prototype.render = prependChapterDivider(
    orig.skillRender,
    "skill invoked",
  );
}
