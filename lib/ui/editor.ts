// SPDX-License-Identifier: AGPL-3.0-or-later
// Nazar-styled input editor — renders as if it WERE the next user message
// panel, with two carefully-chosen differences:
//
//   1. The body ambient is slightly cooler/lifted than a submitted user
//      panel, so you can tell editor ≠ submitted message at a glance.
//   2. The right-side nameplate meta carries the live runtime status
//      (model · git · tools · context %). The footer no longer shows it.
//
// Submitting an empty editor flows seamlessly into an empty user-message
// panel: identical title, identical column geometry. The bg shift is the
// only visible diff (plus the meta string).
import { CustomEditor, type ExtensionAPI, type ExtensionContext, type KeybindingsManager } from "@earendil-works/pi-coding-agent";
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
import { renderRuntimeMeta, type RuntimeMetaContext } from "./runtime-meta.ts";
import { mix, hexToRgb, COLOR } from "./tokens.ts";
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
 * Same mage portrait as a submitted user message; the typing-animation
 * frames cycle only while there's text in the input.
 */
function userAvatarCell(text: string, typingFrame: number): AvatarCell {
  const drafting = text.length > 0;
  const portrait = drafting
    ? renderUserTypingAvatar(typingFrame)!
    : renderRoleAvatar("user")!;
  return portraitCell(portrait);
}

/**
 * Editor panel style: the user palette, but with a slightly cooler/lifted
 * ambient bg so the editor reads as visually distinct from a submitted
 * user-message panel. Same indigo plaque, same border accent — just a
 * different body fill colour (a subtle nudge toward indigo, lifted away
 * from the near-black nightGreen of submitted user panels).
 */
function editorPanelStyle() {
  const base = rolePanelStyle("user");
  const indigo = hexToRgb(COLOR.indigo);
  // mix(userBg, indigo, 0.18) then lift slightly toward white for a cooler,
  // softer feel than the dark-green user-panel ambient.
  const tinted = mix(base.background ?? [16, 34, 31], indigo, 0.22);
  const lifted = mix(tinted, [255, 255, 255], 0.04);
  return { ...base, background: lifted };
}

export class NazarEditor extends CustomEditor {
  private typingFrame = 0;

  constructor(
    tui: TUI,
    theme: EditorTheme,
    keybindings: KeybindingsManager,
    options: { paddingX?: number; autocompleteMaxVisible?: number },
    private readonly meta?: RuntimeMetaContext,
  ) {
    super(tui, theme, keybindings, options);
  }

  setPaddingX(_padding: number): void {
    // The two-column composer owns all outer padding — tell Pi to render
    // flush so we don't double-pad on the left.
    super.setPaddingX(0);
  }

  handleInput(data: string): void {
    const before = this.getText();
    super.handleInput(data);
    if (this.getText() !== before) {
      // Advance one frame per typed character so the mage's typing
      // animation ticks visibly as you write.
      const incoming = Array.from(data).length;
      this.typingFrame += Math.max(1, incoming);
    }
  }

  render(width: number): string[] {
    const currentText = this.getText();
    const avatar = userAvatarCell(currentText, this.typingFrame);
    const style = editorPanelStyle();

    // Ask Pi to wrap the editor body into the body column; reserve room
    // for the prompt marker so wrapped lines line up under each other.
    const promptWidth = visibleWidth(PROMPT);
    const bodyWrapWidth = bodyColumnWidth(width, avatar.width);
    const editorWidth = Math.max(1, bodyWrapWidth - promptWidth);

    const raw = super.render(editorWidth);
    const bodyLines = raw.filter((line) => !isPlainEditorRule(line));
    const content = bodyLines.length > 0 ? bodyLines : [""];

    const promptPaint = style.paint.accent;
    const continuationPaint = style.paint.border;
    const decorated = content.map((line, i) =>
      i === 0 ? `${promptPaint(PROMPT)}${line}` : `${continuationPaint(CONTINUATION)}${line}`,
    );

    // Title is identical to a submitted user panel — same icon, same name,
    // same descriptor. The cooler body bg + meta string carry the "this is
    // live" signal instead of a separate "drafting…" indicator.
    const title = roleTitle("user");

    // Meta budget: roughly half the panel width minus title + a gap.
    const titleWidth = visibleWidth(title);
    const metaBudget = Math.max(0, Math.floor(width / 2) - 4);
    const meta = this.meta
      ? renderRuntimeMeta(this.meta, Math.max(metaBudget, width - titleWidth - 12), style)
      : "";

    return composeMessagePanel(
      decorated, avatar, avatar.width, width, 0,
      title, style,
      { meta, align: "right", bottomGap: 1 },
    );
  }
}

/**
 * Higher-order editor factory. Capture pi/ctx so the editor's render can
 * pull live runtime info (model, git, usage). Returns the inner factory
 * Pi expects from setEditorComponent.
 */
export function editorFactory(pi?: ExtensionAPI, ctx?: ExtensionContext) {
  const meta: RuntimeMetaContext | undefined = pi && ctx ? { pi, ctx } : undefined;
  return function nazarEditorFactory(tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager): NazarEditor {
    return new NazarEditor(
      tui, theme, keybindings,
      { paddingX: 0, autocompleteMaxVisible: 6 },
      meta,
    );
  };
}
