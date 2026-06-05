// SPDX-License-Identifier: AGPL-3.0-or-later
// Nazar-styled input editor — renders as if it WERE the next user message
// panel, so submitting flows seamlessly. The avatar, nameplate title, and
// column geometry all match a submitted user turn; the only difference is
// the live `drafting…` meta tag while you have text in the input.
//
// Visual continuity is the whole point: an empty editor looks identical
// to an empty user message panel. As you type, the meta tag appears and
// the mage avatar cycles its typing animation frames; on submit the meta
// vanishes, the editor empties, and the submitted message appears below
// the input with the same plaque, same portrait, same column alignment.
import { CustomEditor, type KeybindingsManager } from "@earendil-works/pi-coding-agent";
import { type EditorTheme, type TUI } from "@earendil-works/pi-tui";
import { visibleWidth } from "./ansi.ts";
import { rolePanelStyle, roleTitle } from "./avatars.ts";
import {
  emptyAvatarLine,
  renderRoleAvatar,
  renderUserTypingAvatar,
  type AvatarBackground,
  type AvatarRenderLine,
  type RenderedAvatar,
} from "./pixel-avatar.ts";
import { bodyColumnWidth, composeMessagePanel } from "./turn-composer.ts";

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

/**
 * The editor uses the SAME mage sprite as a submitted user message — same
 * portrait, same background. While drafting we cycle the typing-animation
 * frames (frames 1–8 of the user sheet); when the input is empty we render
 * the idle frame 0, which is byte-identical to the user-message avatar
 * pi-coding-agent would have produced anyway. Visual continuity preserved.
 */
function userAvatarCell(text: string, typingFrame: number): AvatarCell {
  const drafting = text.length > 0;
  const portrait = drafting
    ? renderUserTypingAvatar(typingFrame)!
    : renderRoleAvatar("user")!;
  return portraitCell(portrait);
}

export class NazarEditor extends CustomEditor {
  private typingFrame = 0;

  setPaddingX(_padding: number): void {
    // The two-column composer owns all outer padding. Tell Pi to render the
    // editor body flush so we don't double-pad on the left.
    super.setPaddingX(0);
  }

  handleInput(data: string): void {
    const before = this.getText();
    super.handleInput(data);
    if (this.getText() !== before) {
      // Advance one frame per typed character so the mage's typing animation
      // ticks visibly as you write. Stops when the input is cleared.
      const incoming = Array.from(data).length;
      this.typingFrame += Math.max(1, incoming);
    }
  }

  render(width: number): string[] {
    const currentText = this.getText();
    const isDrafting = currentText.length > 0;
    const avatar = userAvatarCell(currentText, this.typingFrame);
    // Style mirrors a user-message panel exactly — no `active` state pulse,
    // no panel hue shift. The editor IS the next user message, visually.
    const style = rolePanelStyle("user");

    // Ask Pi to wrap the editor body to the body column (matching user-message
    // panel geometry). Reserve room for the prompt marker.
    const promptWidth = visibleWidth(PROMPT);
    const bodyWrapWidth = bodyColumnWidth(width, avatar.width);
    const editorWidth = Math.max(1, bodyWrapWidth - promptWidth);

    const raw = super.render(editorWidth);
    const bodyLines = raw.filter((line) => !isPlainEditorRule(line));
    const content = bodyLines.length > 0 ? bodyLines : [""];

    // Prepend the prompt on the first row, 2-col continuation indent on
    // subsequent rows so multi-line drafts wrap legibly.
    const promptPaint = style.paint.accent;
    const continuationPaint = style.paint.border;
    const decorated = content.map((line, i) =>
      i === 0 ? `${promptPaint(PROMPT)}${line}` : `${continuationPaint(CONTINUATION)}${line}`,
    );

    // Title is IDENTICAL to a submitted user-message panel — same icon,
    // same name, same descriptor. The only visible difference during a
    // session is the meta tag (`drafting…` while live, empty when idle).
    const title = roleTitle("user");
    const meta = isDrafting ? style.paint.muted("drafting…") : "";

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
