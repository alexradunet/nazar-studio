// SPDX-License-Identifier: AGPL-3.0-or-later
// Nazar-styled input editor: same quiet RPG panel language as chat turns.
import { CustomEditor, type KeybindingsManager } from "@earendil-works/pi-coding-agent";
import { type EditorTheme, type TUI } from "@earendil-works/pi-tui";
import { visibleWidth } from "./ansi.ts";
import { paintPanelBorderPart, panelHorizontal, panelLabeledTop, panelRule, panelStyle, type PanelStyle } from "./panel-style.ts";
import {
  centerAvatarLine,
  emptyAvatarLine,
  renderRoleAvatar,
  renderUserTypingAvatar,
  renderToolPixelAvatar,
  type AvatarBackground,
  type AvatarRenderLine,
  type RenderedAvatar,
} from "./pixel-avatar.ts";
import type { SpriteRole } from "./sprites.ts";

const OUTER_PADDING_X = 1;
const PROMPT = "> ";
const CONTINUATION = "  ";

type AvatarCell = {
  height: number;
  width: number;
  background?: AvatarBackground;
  content(index: number): AvatarRenderLine;
};

function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\]133;[ABC]\x07/g, "")
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/\x1b_pi:c\x07/g, "");
}

function isPlainEditorRule(line: string): boolean {
  const clean = stripAnsi(line).trim();
  return clean.length > 0 && /^─+$/.test(clean);
}

function avatarBoxMetrics(avatarWidth: number) {
  return {
    avatarInnerWidth: Math.max(1, Math.floor(avatarWidth)),
    avatarContentWidth: Math.max(1, Math.floor(avatarWidth)),
  };
}

function messagePanelWidth(width: number): number {
  return Math.max(12, width - OUTER_PADDING_X * 2);
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

function avatarCell(role: SpriteRole, typingFrame?: number): AvatarCell {
  const portrait = role === "user" && typingFrame !== undefined
    ? renderUserTypingAvatar(typingFrame)
    : renderRoleAvatar(role);
  return portraitCell(portrait!);
}

function quillAvatarCell(typingFrame: number, isTyping = false): AvatarCell {
  const status = isTyping ? "running" : "pending";
  const portrait = renderToolPixelAvatar("quill", status, typingFrame, "");
  if (!portrait) {
    return avatarCell("user", isTyping ? typingFrame : undefined);
  }
  return portraitCell(portrait);
}

function userAvatarCell(text: string, typingFrame: number): AvatarCell {
  const hasText = text.length > 0;
  return hasText
    ? quillAvatarCell(typingFrame, true)
    : quillAvatarCell(typingFrame, false);
}

function spacedUpper(text: string): string {
  return text.toUpperCase().split("").join(" ");
}

function paintBg(text: string, background: AvatarBackground | undefined, width = visibleWidth(text)): string {
  const padded = `${text}${" ".repeat(Math.max(0, width - visibleWidth(text)))}`;
  if (!background) return padded;
  const [r, g, b] = background;
  return `\x1b[48;2;${r};${g};${b}m${padded}\x1b[49m`;
}

function labeledHeaderTop(innerWidth: number, title: string, style: PanelStyle): string {
  return panelLabeledTop(style, innerWidth, title);
}

const HEADER_SIDE_PADDING = 5;

function headerLeftColumn(panelWidth: number, boxWidth: number): number {
  return Math.min(HEADER_SIDE_PADDING, Math.max(0, panelWidth - boxWidth));
}

function positionedHeaderTop(box: string, boxWidth: number, panelWidth: number): string {
  return `${" ".repeat(headerLeftColumn(panelWidth, boxWidth))}${box}`;
}

function connectedHeaderBottom(innerWidth: number, boxWidth: number, panelWidth: number, style: PanelStyle, background?: AvatarBackground): string {
  const g = style.glyphs;
  const leftWidth = headerLeftColumn(panelWidth, boxWidth);
  const rightWidth = Math.max(0, panelWidth - boxWidth - leftWidth);
  return `${panelHorizontal(style, leftWidth, "base")}${paintPanelBorderPart(style, "join", g.bottomRight)}${paintBg("", background, innerWidth)}${paintPanelBorderPart(style, "join", g.bottomLeft)}${panelHorizontal(style, rightWidth, "base")}`;
}

export class NazarEditor extends CustomEditor {
  private typingFrame = 0;

  setPaddingX(_padding: number): void {
    // Keep panel and internal input padding aligned to the configured column spacing.
    super.setPaddingX(OUTER_PADDING_X);
  }

  handleInput(data: string): void {
    const before = this.getText();
    super.handleInput(data);
    if (this.getText() !== before) {
      // Advance a frame per input character, so each typed letter can render a fresh
      // quill stroke when writing is active.
      const incoming = Array.from(data).length;
      const delta = Math.max(1, incoming);
      this.typingFrame += delta;
    }
  }

  render(width: number): string[] {
    const currentText = this.getText();
    const avatar = userAvatarCell(currentText, this.typingFrame);
    const avatarWidth = avatar.width;
    const { avatarInnerWidth, avatarContentWidth } = avatarBoxMetrics(avatarWidth);
    const panelWidth = messagePanelWidth(width);
    const promptWidth = visibleWidth(PROMPT);
    const editorWidth = Math.max(1, panelWidth - promptWidth);

    const raw = super.render(editorWidth);
    const bodyLines = raw.filter((line) => !isPlainEditorRule(line));
    const content = bodyLines.length > 0 ? bodyLines : [""];

    const pad = " ".repeat(OUTER_PADDING_X);
    const style = panelStyle("user", currentText.length > 0 ? "active" : "idle", { frame: this.typingFrame });
    const g = style.glyphs;
    const title = style.paint.title(spacedUpper("input"));
    const titleWidth = visibleWidth(`${g.ornament} ${title} ${g.ornament}`);
    const innerWidth = Math.max(avatarInnerWidth, titleWidth + 2);
    const boxWidth = innerWidth + 2;
    const boxLeftColumn = headerLeftColumn(panelWidth, boxWidth);
    const lines = [`${pad}${positionedHeaderTop(labeledHeaderTop(innerWidth, title, style), boxWidth, panelWidth)}${pad}`];
    lines.push(`${pad}${" ".repeat(boxLeftColumn)}${paintPanelBorderPart(style, "vertical", g.leftVertical)}${paintBg("", avatar.background, innerWidth)}${paintPanelBorderPart(style, "vertical", g.rightVertical)}${pad}`);

    const avatarStartColumn = OUTER_PADDING_X + boxLeftColumn + 2; // header box left border
    for (let index = 0; index < avatar.height; index++) {
      const avatarLine = avatar.content(index);
      lines.push(`${pad}${" ".repeat(boxLeftColumn)}${paintPanelBorderPart(style, "vertical", g.leftVertical)}${centerAvatarLine(avatarLine, innerWidth, avatarStartColumn)}${paintPanelBorderPart(style, "vertical", g.rightVertical)}${pad}`);
    }
    lines.push(`${pad}${connectedHeaderBottom(innerWidth, boxWidth, panelWidth, style, avatar.background)}${pad}`);

    for (let index = 0; index < content.length; index++) {
      const marker = index === 0 ? style.paint.accent(PROMPT) : style.paint.border(CONTINUATION);
      const line = paintBg(`${marker}${content[index] ?? ""}`, style.background ?? avatar.background, panelWidth);
      lines.push(`${pad}${style.paint.text(line)}${pad}`);
    }
    lines.push(`${pad}${panelRule(style, panelWidth)}${pad}`);

    return lines;
  }
}

export function editorFactory(tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager): NazarEditor {
  return new NazarEditor(tui, theme, keybindings, { paddingX: OUTER_PADDING_X, autocompleteMaxVisible: 6 });
}
