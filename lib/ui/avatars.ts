// SPDX-License-Identifier: AGPL-3.0-or-later
// Old-school RPG portrait panels / lightweight ANSI avatars for Pi's built-in user/assistant messages.
import { AssistantMessageComponent, ToolExecutionComponent, UserMessageComponent } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "./ansi.ts";
import { paintPanelBorderPart, panelHorizontal, panelLabeledTop, panelRule, panelStyle, type PanelState, type PanelStyle } from "./panel-style.ts";
import {
  centerAvatarLine,
  emptyAvatarLine,
  renderRoleAvatar,
  renderToolPixelAvatar,
  type AvatarBackground,
  type AvatarRenderLine,
  type RenderedAvatar,
} from "./pixel-avatar.ts";
import { roleNameplate, type SpriteRole } from "./sprites.ts";

const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";
const AVATAR_ORIGINALS = Symbol.for("nazar.rpgAvatarOriginals");
const MESSAGE_BOTTOM_PADDING_LINES = 0;
const ASSISTANT_TOP_PADDING_LINES = 1;
const MESSAGE_OUTER_PADDING_X = 0;
const MESSAGE_TEXT_PADDING_LINES = 1;
const DEFAULT_RICH_AVATAR_RECENT_LIMIT = 20;
const PANEL_SEQUENCE = new WeakMap<object, number>();
const PANEL_KEY_SEQUENCE = new Map<string, number>();
let panelSequenceCounter = 0;
let refreshScheduled = false;

type AvatarCell = {
  height: number;
  width: number;
  background?: AvatarBackground;
  content(index: number): AvatarRenderLine;
};

type RoleCells = {
  user: AvatarCell;
  nazar: AvatarCell;
  width: number;
};

type ToolStatus = "pending" | "running" | "ok" | "error";

type MessageTextCell = {
  controls: string;
  text: string;
};

function scheduleAvatarRefresh(owner: unknown): void {
  if (refreshScheduled) return;
  if ((typeof owner !== "object" && typeof owner !== "function") || owner === null) return;
  const invalidate = (owner as any).invalidate;
  if (typeof invalidate !== "function") return;
  refreshScheduled = true;
  setTimeout(() => {
    refreshScheduled = false;
    try { invalidate.call(owner); } catch { /* best-effort visual refresh */ }
  }, 0);
}

function panelSequence(owner: unknown, stableKey?: string): number {
  if (stableKey) {
    let sequence = PANEL_KEY_SEQUENCE.get(stableKey);
    if (sequence === undefined) {
      sequence = panelSequenceCounter++;
      PANEL_KEY_SEQUENCE.set(stableKey, sequence);
      if (panelSequenceCounter > richAvatarRecentLimit()) scheduleAvatarRefresh(owner);
    }
    return sequence;
  }

  if ((typeof owner !== "object" && typeof owner !== "function") || owner === null) return Number.MAX_SAFE_INTEGER;
  let sequence = PANEL_SEQUENCE.get(owner);
  if (sequence === undefined) {
    sequence = panelSequenceCounter++;
    PANEL_SEQUENCE.set(owner, sequence);
    if (panelSequenceCounter > richAvatarRecentLimit()) scheduleAvatarRefresh(owner);
  }
  return sequence;
}

function richAvatarRecentLimit(): number {
  const raw = (process.env.NAZAR_AVATAR_RECENT_LIMIT || "").trim().toLowerCase();
  if (raw === "all" || raw === "unlimited" || raw === "inf" || raw === "infinite") return Number.POSITIVE_INFINITY;
  if (!raw) return DEFAULT_RICH_AVATAR_RECENT_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : DEFAULT_RICH_AVATAR_RECENT_LIMIT;
}

function shouldUseRichAvatar(owner: unknown, active = false, stableKey?: string): boolean {
  if (active) return true;
  const limit = richAvatarRecentLimit();
  if (limit === Number.POSITIVE_INFINITY) return true;
  if (limit <= 0) return false;
  const sequence = panelSequence(owner, stableKey);
  return sequence >= panelSequenceCounter - limit;
}

function splitLeadingControlSequences(line: string): { controls: string; rest: string } {
  let controls = "";
  let rest = line;
  let consumed = true;
  while (consumed) {
    consumed = false;
    for (const seq of [OSC133_ZONE_START, OSC133_ZONE_END, OSC133_ZONE_FINAL]) {
      if (rest.startsWith(seq)) {
        controls += seq;
        rest = rest.slice(seq.length);
        consumed = true;
      }
    }
  }
  return { controls, rest };
}

function portraitCell(portrait: RenderedAvatar): AvatarCell {
  return {
    height: portrait.height,
    width: portrait.width,
    background: portrait.background,
    content(index) {
      return portrait.lines[index] ?? emptyAvatarLine(portrait.background);
    },
  };
}

function badgeCell(background: AvatarBackground, glyph = "◆"): AvatarCell {
  return {
    height: 1,
    width: 3,
    background,
    content(index) {
      return index === 0 ? { text: ` ${glyph} `, background } : emptyAvatarLine(background);
    },
  };
}

function roleBackground(role: SpriteRole): AvatarBackground {
  return role === "user" ? [31, 40, 64] : [54, 42, 30];
}

function avatarCell(owner: unknown, role: SpriteRole, active = false, stableKey?: string): AvatarCell {
  const rich = shouldUseRichAvatar(owner, active, stableKey);
  if (!rich) return badgeCell(roleBackground(role));
  return portraitCell(renderRoleAvatar(role)!);
}

function spacedUpper(text: string): string {
  return text.toUpperCase().split("").join(" ");
}

function rolePanelStyle(role: SpriteRole) {
  return panelStyle(role === "user" ? "user" : "assistant");
}

function roleAccent(role: SpriteRole): (text: string) => string {
  return rolePanelStyle(role).paint.accent;
}

function roleTitle(role: SpriteRole): string {
  return roleAccent(role)(spacedUpper(roleNameplate(role)));
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

function toolAccent(style: PanelStyle): (text: string) => string {
  return style.supports.pulse ? style.paint.pulse : style.paint.accent;
}

function toolTitle(name: string, style: PanelStyle): string {
  return toolAccent(style)(spacedUpper(toolDisplayName(name)));
}

function lineHasTextContent(line: string): boolean {
  return line
    .replace(/\x1b\]133;[ABC]\x07/g, "")
    .replace(/\x1b\[[0-9;]*m/g, "")
    .trim().length > 0;
}

function contentPresence(lines: string[]): boolean[] {
  return lines.map((line) => lineHasTextContent(line ?? ""));
}

function trimOuterBlankLines(lines: string[]): string[] {
  const present = contentPresence(lines);
  const first = present.findIndex(Boolean);
  if (first < 0) return [];
  let last = lines.length - 1;
  while (last > first && !present[last]) last--;
  return lines.slice(first, last + 1);
}

function analyzeTextCells(lines: string[]): MessageTextCell[] {
  return lines.map((line) => {
    const { controls, rest } = splitLeadingControlSequences(line);
    return { controls, text: rest };
  });
}

function avatarBoxMetrics(avatarWidth: number) {
  return {
    avatarInnerWidth: Math.max(1, Math.floor(avatarWidth)),
    avatarContentWidth: Math.max(1, Math.floor(avatarWidth)),
  };
}

function messagePanelWidth(width: number): number {
  return Math.max(8, width - MESSAGE_OUTER_PADDING_X * 2);
}

function messageTextWidth(width: number, _avatarWidth: number): number {
  // Copy-safe mode: message text owns full rows. Decorations live above it,
  // never beside it, so terminal selection can start at the left margin and
  // avoid avatar/border cells entirely.
  return Math.max(1, messagePanelWidth(width));
}

function addOuterPadding(line: string, _width: number): string {
  const { controls, rest } = splitLeadingControlSequences(line);
  // Lines are composed to the panel width already. Do not re-pad by
  // Do not re-pad by visibleWidth(): terminal control rows can have a virtual
  // cell width, so visibleWidth would under-count and over-pad.
  return `${controls}${" ".repeat(MESSAGE_OUTER_PADDING_X)}${rest}${" ".repeat(MESSAGE_OUTER_PADDING_X)}`;
}

function separator(width: number, style: PanelStyle): string {
  return panelRule(style, Math.max(1, width));
}

function labeledHeaderTop(innerWidth: number, title: string | undefined, style: PanelStyle): string {
  return panelLabeledTop(style, innerWidth, title);
}

type HeaderAlign = "left" | "center" | "right";
const HEADER_SIDE_PADDING = 5;

function headerLeftColumn(panelWidth: number, boxWidth: number, align: HeaderAlign): number {
  if (align === "left") return Math.min(HEADER_SIDE_PADDING, Math.max(0, panelWidth - boxWidth));
  if (align === "right") return Math.max(0, panelWidth - boxWidth - HEADER_SIDE_PADDING);
  return Math.max(0, Math.floor((panelWidth - boxWidth) / 2));
}

function positionedHeaderTop(box: string, boxWidth: number, panelWidth: number, align: HeaderAlign): string {
  return `${" ".repeat(headerLeftColumn(panelWidth, boxWidth, align))}${box}`;
}

function connectedHeaderBottom(innerWidth: number, boxWidth: number, panelWidth: number, align: HeaderAlign, style: PanelStyle, background?: AvatarBackground): string {
  const g = style.glyphs;
  const leftWidth = headerLeftColumn(panelWidth, boxWidth, align);
  const rightWidth = Math.max(0, panelWidth - boxWidth - leftWidth);
  return `${panelHorizontal(style, leftWidth, "base")}${paintPanelBorderPart(style, "join", g.bottomRight)}${paintBg("", background, innerWidth)}${paintPanelBorderPart(style, "join", g.bottomLeft)}${panelHorizontal(style, rightWidth, "base")}`;
}

function paintBg(text: string, background: AvatarBackground | undefined, width = visibleWidth(text)): string {
  const padded = `${text}${" ".repeat(Math.max(0, width - visibleWidth(text)))}`;
  if (!background) return padded;
  const [r, g, b] = background;
  return `\x1b[48;2;${r};${g};${b}m${padded}\x1b[49m`;
}

function paintPanelTextLine(
  text: string,
  controls: string,
  width: number,
  style: PanelStyle,
  fallbackBackground: AvatarBackground | undefined,
): string {
  const painted = paintBg(text, style.background ?? fallbackBackground, width);
  return `${controls}${style.paint.text(painted)}`;
}

function composeMessagePanel(
  lines: string[],
  avatar: AvatarCell,
  avatarWidth: number,
  width: number,
  topPaddingLines = 0,
  title?: string,
  style: PanelStyle = panelStyle("system"),
  align: HeaderAlign = "center",
): string[] {
  const content = trimOuterBlankLines(lines);
  const textCells = analyzeTextCells(content);
  const panelWidth = messagePanelWidth(width);
  const { avatarInnerWidth, avatarContentWidth } = avatarBoxMetrics(avatarWidth);
  const g = style.glyphs;
  const titleWidth = title ? visibleWidth(`${g.ornament} ${title} ${g.ornament}`) : 0;
  const innerWidth = Math.max(avatarInnerWidth, titleWidth + 2);
  const boxWidth = innerWidth + 2;
  const boxLeftColumn = headerLeftColumn(panelWidth, boxWidth, align);
  const linesOut: string[] = [];

  linesOut.push(positionedHeaderTop(labeledHeaderTop(innerWidth, title, style), boxWidth, panelWidth, align));
  linesOut.push(`${" ".repeat(boxLeftColumn)}${paintPanelBorderPart(style, "vertical", g.leftVertical)}${paintBg("", avatar.background, innerWidth)}${paintPanelBorderPart(style, "vertical", g.rightVertical)}`);

  const avatarStartColumn = MESSAGE_OUTER_PADDING_X + boxLeftColumn + 2; // header box left border
  for (let index = 0; index < avatar.height; index++) {
    const avatarLine = avatar.content(index);
    linesOut.push(`${" ".repeat(boxLeftColumn)}${paintPanelBorderPart(style, "vertical", g.leftVertical)}${centerAvatarLine(avatarLine, innerWidth, avatarStartColumn)}${paintPanelBorderPart(style, "vertical", g.rightVertical)}`);
  }
  linesOut.push(connectedHeaderBottom(innerWidth, boxWidth, panelWidth, align, style, avatar.background));

  for (let index = 0; index < MESSAGE_TEXT_PADDING_LINES; index++) {
    linesOut.push(paintPanelTextLine("", "", panelWidth, style, avatar.background));
  }
  for (const cell of textCells) {
    linesOut.push(paintPanelTextLine(cell.text, cell.controls, panelWidth, style, avatar.background));
  }
  for (let index = 0; index < MESSAGE_TEXT_PADDING_LINES; index++) {
    linesOut.push(paintPanelTextLine("", "", panelWidth, style, avatar.background));
  }
  linesOut.push(separator(panelWidth, style));

  return [
    ...Array(topPaddingLines).fill(" ".repeat(Math.max(0, width))),
    ...linesOut.map((line) => addOuterPadding(line, width)),
    ...Array(MESSAGE_BOTTOM_PADDING_LINES).fill(" ".repeat(Math.max(0, width))),
  ];
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function stablePanelKey(owner: unknown, role: string, renderedLines?: string[]): string | undefined {
  const anyOwner = owner as any;
  if (role === "assistant" && anyOwner?.lastMessage) return `${role}:${stableHash(JSON.stringify(anyOwner.lastMessage))}`;
  if (role === "tool" && anyOwner?.toolCallId) return `${role}:${String(anyOwner.toolCallId)}`;
  if (renderedLines && renderedLines.length > 0) return `${role}:${stableHash(renderedLines.join("\n"))}`;
  return undefined;
}

function buildCells(owner: unknown, renderedLines?: string[]): RoleCells {
  const user = avatarCell(owner, "user", false, stablePanelKey(owner, "user", renderedLines));
  const nazar = avatarCell(owner, "nazar", false, stablePanelKey(owner, "assistant", renderedLines));
  return { user, nazar, width: Math.max(user.width, nazar.width) };
}

function toolStatus(component: any): ToolStatus {
  if (component?.result?.isError) return "error";
  if (component?.result && !component?.isPartial) return "ok";
  // Streaming/partial tool output is active even if Pi has not set executionStarted yet.
  if (component?.isPartial || component?.executionStarted) return "running";
  return "pending";
}

function safeToolHint(component: any): string {
  try {
    return JSON.stringify({ args: component?.args, result: component?.result?.details }) ?? "";
  } catch {
    return "";
  }
}

function toolStatusBackground(status: ToolStatus): AvatarBackground {
  if (status === "error") return [70, 30, 27];
  if (status === "ok") return [22, 54, 58];
  if (status === "running") return [50, 51, 55];
  return [52, 43, 28];
}

function toolDisplayName(name: string): string {
  return name
    .replace(/^functions[._-]/, "")
    .replace(/^multi_tool_use[._-]/, "multi")
    .trim() || "tool";
}

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

function toolCell(component: any): AvatarCell {
  const status = toolStatus(component);
  const name = String(component?.toolName || "tool").trim() || "tool";
  const rich = shouldUseRichAvatar(component, status === "running", stablePanelKey(component, "tool"));
  if (!rich) return badgeCell(toolStatusBackground(status));
  const frame = status === "running" ? Date.now() / 180 : 0;
  const portrait = renderToolPixelAvatar(
    name,
    status,
    frame,
    safeToolHint(component),
  );
  return portraitCell(portrait ?? renderToolPixelAvatar(name, status, frame, safeToolHint(component))!);
}


// Pi's public renderer hook is for custom messages only. For role avatars we decorate
// the exported built-in message components in one idempotent place.
export function patchRpgAvatars() {
  const g = globalThis as any;
  const originals = g[AVATAR_ORIGINALS] ?? {};
  originals.assistantRender ??= AssistantMessageComponent.prototype.render;
  originals.assistantUpdateContent ??= AssistantMessageComponent.prototype.updateContent;
  originals.toolRender ??= ToolExecutionComponent.prototype.render;
  originals.userRender ??= UserMessageComponent.prototype.render;
  g[AVATAR_ORIGINALS] = originals;

  UserMessageComponent.prototype.render = function patchedUserRender(width: number): string[] {
    const lines = originals.userRender.call(this, messageTextWidth(width, 0));
    const cells = buildCells(this, lines);
    return composeMessagePanel(lines, cells.user, cells.width, width, 0, roleTitle("user"), rolePanelStyle("user"), "left");
  };

  AssistantMessageComponent.prototype.updateContent = function patchedAssistantUpdateContent(message: any): void {
    const hideThinking = Boolean((this as any).hideThinkingBlock);
    const displayMessage = hideThinking
      ? { ...message, content: message.content.filter((part: any) => part.type !== "thinking") }
      : message;
    originals.assistantUpdateContent.call(this, displayMessage);
    if (hideThinking) (this as any).lastMessage = message;
  };

  AssistantMessageComponent.prototype.render = function patchedAssistantRender(width: number): string[] {
    const lines = originals.assistantRender.call(this, messageTextWidth(width, 0));
    if (trimOuterBlankLines(lines).length === 0) return [];
    const cells = buildCells(this, lines);
    return composeMessagePanel(lines, cells.nazar, cells.width, width, ASSISTANT_TOP_PADDING_LINES, roleTitle("nazar"), rolePanelStyle("nazar"), "right");
  };

  ToolExecutionComponent.prototype.render = function patchedToolRender(width: number): string[] {
    const tool = toolCell(this);
    const avatarWidth = tool.width;
    const name = String((this as any)?.toolName || "tool").trim() || "tool";
    const status = toolStatus(this);
    const lines = originals.toolRender.call(this, messageTextWidth(width, avatarWidth));
    if (trimOuterBlankLines(lines).length === 0) return [];
    const style = toolStyle(status);
    return composeMessagePanel(lines, tool, avatarWidth, width, ASSISTANT_TOP_PADDING_LINES, toolTitle(name, style), style, "right");
  };
}
