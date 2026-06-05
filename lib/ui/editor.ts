// SPDX-License-Identifier: AGPL-3.0-or-later
// Nazar-styled input editor: same two-column RPG panel language as user
// chat turns. The avatar sits on the right (mirroring user messages) so
// submitting the draft visually flows into the next user turn — same
// portrait, same nameplate plaque, same column geometry.
import { CustomEditor, type KeybindingsManager } from "@earendil-works/pi-coding-agent";
import { type EditorTheme, type TUI } from "@earendil-works/pi-tui";
import { visibleWidth } from "./ansi.ts";
import { panelStyle } from "./panel-style.ts";
import {
  emptyAvatarLine,
  renderRoleAvatar,
  renderUserTypingAvatar,
  renderToolPixelAvatar,
  type AvatarBackground,
  type AvatarRenderLine,
  type RenderedAvatar,
} from "./pixel-avatar.ts";
import { userDisplayName, type SpriteRole } from "./sprites.ts";
import { bodyColumnWidth, composeMessagePanel } from "./turn-composer.ts";

const PROMPT = "> ";
const CONTINUATION = "  ";
const BOLD_ON = "\x1b[1m";
const BOLD_OFF = "\x1b[22m";

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
  // While the user is drafting, swap the static mage portrait for the
  // animated quill tool sprite — a small visible "you are writing" cue.
  const status = isTyping ? "running" : "pending";
  const portrait = renderToolPixelAvatar("quill", status, typingFrame, "");
  if (!portrait) {
    return avatarCell("user", isTyping ? typingFrame : undefined);
  }
  return portraitCell(portrait);
}

function userAvatarCell(text: string, typingFrame: number): AvatarCell {
  return quillAvatarCell(typingFrame, text.length > 0);
}

export class NazarEditor extends CustomEditor {
  private typingFrame = 0;

  setPaddingX(_padding: number): void {
    // The two-column composer owns the outer padding; tell Pi to render the
    // editor body flush so we don't double-pad on the left.
    super.setPaddingX(0);
  }

  handleInput(data: string): void {
    const before = this.getText();
    super.handleInput(data);
    if (this.getText() !== before) {
      // Advance a frame per input character so each typed letter can render
      // a fresh quill stroke when writing is active.
      const incoming = Array.from(data).length;
      const delta = Math.max(1, incoming);
      this.typingFrame += delta;
    }
  }

  render(width: number): string[] {
    const currentText = this.getText();
    const isDrafting = currentText.length > 0;
    const avatar = userAvatarCell(currentText, this.typingFrame);
    const style = panelStyle("user", isDrafting ? "active" : "idle", { frame: this.typingFrame });

    // Ask Pi to wrap the editor body to the narrower body column (matching
    // the user-message panel geometry). Reserve room for the prompt marker.
    const promptWidth = visibleWidth(PROMPT);
    const bodyWrapWidth = bodyColumnWidth(width, avatar.width);
    const editorWidth = Math.max(1, bodyWrapWidth - promptWidth);

    const raw = super.render(editorWidth);
    const bodyLines = raw.filter((line) => !isPlainEditorRule(line));
    const content = bodyLines.length > 0 ? bodyLines : [""];

    // Prepend the prompt on the first row, a 2-col continuation indent on
    // subsequent rows so multi-line drafts wrap legibly.
    const promptPaint = style.paint.accent;
    const continuationPaint = style.paint.border;
    const decorated = content.map((line, i) =>
      i === 0 ? `${promptPaint(PROMPT)}${line}` : `${continuationPaint(CONTINUATION)}${line}`,
    );

    // Title format mirrors user-message panels: ✦ INPUT · <username>. When
    // the user submits, the panel below visually inherits the same plaque,
    // same portrait position, same body column — only the body content
    // changes from a live draft to the submitted message.
    const name = userDisplayName();
    const title = `${style.paint.title(`✦ ${BOLD_ON}INPUT${BOLD_OFF}`)} ${style.paint.muted(`· ${name.toLowerCase()}`)}`;
    const meta = isDrafting ? style.paint.muted("drafting…") : style.paint.muted("ready");

    return composeMessagePanel(
      decorated, avatar, avatar.width, width, 0,
      title, style,
      { meta, align: "right", bottomGap: 1 },
    );
  }
}

export function editorFactory(tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager): NazarEditor {
  return new NazarEditor(tui, theme, keybindings, { paddingX: 0, autocompleteMaxVisible: 6 });
}
