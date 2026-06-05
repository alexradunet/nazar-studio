// SPDX-License-Identifier: AGPL-3.0-or-later
// Two-column RPG turn panel compositor for Nazar's Pi terminal.
//
// Panel anatomy (left avatar column + right nameplate-over-body column,
// copy-safe by construction):
//
//   PAD │ portrait field │ GAP │ nameplate band (themed plaque)
//   PAD │ portrait pixel │ GAP │ body row (ambient tint)
//   PAD │ portrait pixel │ GAP │ body row
//   PAD │ portrait pixel │ GAP │ body row
//   PAD │ portrait field │ GAP │ body row
//   ─── blank row gap ───
//
// Copy-safety: SGR colour codes are never captured by terminal selection — only
// glyphs are. All structural decoration (nameplate band, portrait field, body
// ambient) lives in background fills. The only glyph characters that ever land
// in the output are the half-block pixels (▀/▄/█) inside the portrait column.
// Body text rows are background-filled but otherwise unadorned, so selecting
// the conversation copies clean text with no box-drawing contamination.

import { compact, padVisible, visibleWidth } from "./ansi.ts";
import { truecolorBg } from "./graphics-protocol.ts";
import type { AvatarBackground, AvatarRenderLine } from "./pixel-avatar.ts";
import { centerAvatarLine, emptyAvatarLine } from "./pixel-avatar.ts";
import { panelStyle, type PanelStyle } from "./panel-style.ts";

// ── Constants ──────────────────────────────────────────────────────────────

const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";

export const PANEL_TOP_PADDING_ASSISTANT = 1;
export const PANEL_TEXT_PADDING = 1;
const PANEL_BOTTOM_GAP = 1;

const DEFAULT_OUTER_PAD_X = 2;
const COLUMN_GAP = 2;

// ── Types ──────────────────────────────────────────────────────────────────

export type AvatarCell = {
  height: number;
  width: number;
  background?: AvatarBackground;
  content(index: number): AvatarRenderLine;
};

export type MessageTextCell = {
  controls: string;
  text: string;
};

export type PanelAlignment = "left" | "right";

export type ComposeOptions = {
  /** Right-aligned meta string for the nameplate band (already styled). */
  meta?: string;
  /** Outer left/right padding columns. Default 2. */
  outerPadX?: number;
  /** Blank rows appended after the panel as a separator. Default 1. */
  bottomGap?: number;
  /**
   * Which side of the panel the avatar column sits on. "left" (default) is
   * used for the AI / tools (assistant turns); "right" is used for user
   * turns so the conversation reads like a chat: them on the left, you on
   * the right. Body content stays left-aligned for readability either way.
   */
  align?: PanelAlignment;
};

// ── OSC 133 helpers ────────────────────────────────────────────────────────

export function splitLeadingControlSequences(line: string): { controls: string; rest: string } {
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

// ── Content helpers ────────────────────────────────────────────────────────

export function lineHasTextContent(line: string): boolean {
  return line
    .replace(/\x1b\]133;[ABC]\x07/g, "")
    .replace(/\x1b\[[0-9;]*m/g, "")
    .trim().length > 0;
}

export function trimOuterBlankLines(lines: string[]): string[] {
  const present = lines.map((l) => lineHasTextContent(l ?? ""));
  const first = present.findIndex(Boolean);
  if (first < 0) return [];
  let last = lines.length - 1;
  while (last > first && !present[last]) last--;
  return lines.slice(first, last + 1);
}

export function analyzeTextCells(lines: string[]): MessageTextCell[] {
  return lines.map((line) => {
    const { controls, rest } = splitLeadingControlSequences(line);
    return { controls, text: rest };
  });
}

// ── Background-fill helpers ────────────────────────────────────────────────

/**
 * Pull every Kitty graphics APC and iTerm2 image OSC out of a line. The
 * image transmission sequences carry base64-encoded image data and are
 * fragile — any byte manipulation (truncation, replacement, sandwiching
 * inside a bg-paint frame) can corrupt them. We extract them up-front so
 * they can be emitted verbatim BEFORE the rest of the line goes through
 * normal paint/wrap. The terminal receives the APC first → stores the
 * image; the placeholder cells in `rest` then match it for overlay.
 */
export function extractImageSequences(text: string): { apc: string; rest: string } {
  let apc = "";
  let rest = text;
  let changed = true;
  while (changed) {
    changed = false;
    // Kitty APC: ESC _ G ... ESC backslash
    const kitty = rest.match(/\x1b_G[\s\S]*?\x1b\\/);
    if (kitty && kitty.index !== undefined) {
      apc += kitty[0];
      rest = rest.slice(0, kitty.index) + rest.slice(kitty.index + kitty[0].length);
      changed = true;
      continue;
    }
    // iTerm2 inline image OSC: ESC ] 1337 ; File = ... BEL
    const iterm = rest.match(/\x1b\]1337;File=[\s\S]*?\x07/);
    if (iterm && iterm.index !== undefined) {
      apc += iterm[0];
      rest = rest.slice(0, iterm.index) + rest.slice(iterm.index + iterm[0].length);
      changed = true;
    }
  }
  return { apc, rest };
}

/**
 * Fill `text` (plus trailing spaces) with a background colour up to `width`.
 *
 * Two concerns the wrapper has to handle:
 *
 * 1. **bg-reset holes.** Body content from Pi (notably the editor's
 *    CustomEditor output) can carry embedded `\x1b[49m` (bg-reset) or
 *    `\x1b[0m` (full-reset) sequences. If we wrapped the strip as plain
 *    `bg-open ... bg-close`, those internal resets would punch holes in
 *    our painted bg — the user sees a black gap where the panel ambient
 *    should be. We rewrite the internal resets to re-open our bg, so
 *    the strip stays uniformly painted from edge to edge.
 *
 * 2. **Image protocol survival.** Kitty / iTerm2 image transmission
 *    sequences carry base64 image data and must reach the terminal
 *    untouched. We pull them out of `text` first and emit them BEFORE
 *    the bg-paint frame — the terminal stores the image, then receives
 *    the painted placeholders (which match by image ID) and overlays.
 */
export function paintBgStrip(text: string, background: AvatarBackground | undefined, width: number): string {
  const { apc, rest } = extractImageSequences(text);
  const padded = padVisible(rest, width);
  if (!background) return apc + padded;
  const [r, g, b] = background;
  const bgOpen = `\x1b[48;2;${r};${g};${b}m`;
  // Internal `\x1b[49m` (bg-reset) → re-open our bg.
  // Internal `\x1b[0m` (full-reset) → keep the fg-reset semantics by emitting
  // `\x1b[39m` (fg-only reset) followed by our bg re-open, so embedded styling
  // can still clear its own fg without tearing the strip.
  // Rewrite internal SGR resets so the painted bg survives intact:
  //
  //   \x1b[0m  — "reset everything" — must NOT just leak attributes through.
  //              pi-tui emits the editor cursor as `\x1b[7m{char}\x1b[0m`
  //              (inverse video on, then full reset). If we naively kept
  //              only the bg, the inverse-video flag would stay ON for the
  //              rest of the line and every cell past the cursor would
  //              render with fg/bg swapped — a visible bright bar where
  //              the panel ambient should be.
  //
  //              We turn off every renderable attribute explicitly:
  //                22 = bold/dim off
  //                23 = italic off
  //                24 = underline off
  //                25 = blink off
  //                27 = reverse off  ← the cursor case
  //                28 = conceal off
  //                29 = strikethrough off
  //                39 = fg → default
  //              …then re-open our bg.
  //
  //   \x1b[49m — bg-reset only → just re-open our bg.
  const sgrReset = `\x1b[22;23;24;25;27;28;29;39m${bgOpen}`;
  const safe = padded
    .replace(/\x1b\[0m/g, sgrReset)
    .replace(/\x1b\[49m/g, bgOpen);
  // APC sequences come first (image transmission), then the painted strip.
  // Putting APC OUTSIDE the bg frame keeps the image data away from any
  // future colour-manipulation pass over `safe`.
  return `${apc}${bgOpen}${safe}\x1b[49m`;
}

// ── Nameplate band ─────────────────────────────────────────────────────────

/**
 * Render a nameplate band — a saturated, themed plaque carrying the role
 * title (already styled) on the left and an optional meta string on the right.
 *
 * The band background is `style.nameplateBg` (the role hue blended toward the
 * ambient: brass for Nazar, teal for tools, indigo for the user). Copy-safe:
 * a select-all paste yields "  NAZAR · the oracle             1.2k tok · 2.4s"
 * with no border-drawing glyphs.
 *
 * If `meta` is empty, the band fills the remaining width with the plaque bg.
 */
export function nameplateRow(
  title: string,
  width: number,
  style: PanelStyle,
  meta = "",
): string {
  const [r, g, b] = style.nameplateBg;
  const open = truecolorBg([r, g, b]);
  const inner = Math.max(0, width - 2); // budget after leading/trailing space
  let displayTitle = title;
  let displayMeta = meta;
  let titleVis = visibleWidth(displayTitle);
  let metaVis = visibleWidth(displayMeta);
  // If title + meta + a 1-col gap don't fit, drop the meta first; if the
  // title alone overflows, truncate it. Either way the band fits `width`.
  if (titleVis + metaVis + 1 > inner) {
    if (titleVis + 1 < inner) {
      const budget = Math.max(0, inner - titleVis - 1);
      displayMeta = compact(displayMeta, budget);
      metaVis = visibleWidth(displayMeta);
    } else {
      displayMeta = "";
      metaVis = 0;
      displayTitle = compact(displayTitle, inner);
      titleVis = visibleWidth(displayTitle);
    }
  }
  if (metaVis > 0) {
    // " title  <fill>  meta " — re-emit `open` after each styled segment to
    // restore the bg in case the segment reset it. Painters in panel-style.ts
    // only reset fg (\x1b[39m), not bg, so persistence is the default; the
    // re-emit is belt-and-braces for any caller that uses \x1b[0m.
    const fill = Math.max(1, inner - titleVis - metaVis);
    return `${open} ${displayTitle}${open}${" ".repeat(fill)}${displayMeta}${open} \x1b[49m`;
  }
  const fill = Math.max(0, inner - titleVis);
  return `${open} ${displayTitle}${open}${" ".repeat(fill)} \x1b[49m`;
}

/**
 * Compute the width Pi should wrap message body text to.
 *
 * Mirrors the column math used inside `composeMessagePanel`, with one extra
 * cell shaved off for the body row's 1-col leading inset (the " " in
 * paintBodyRow). Adapters call Pi with this width so Pi pads to it; the
 * composer then prepends one inset space, landing at the full body-cell
 * width exactly. This avoids the off-by-one that caused every Pi-padded
 * row to get truncated and decorated with a trailing "..." ellipsis.
 */
export function bodyColumnWidth(panelWidth: number, avatarWidth: number, options: { outerPadX?: number } = {}): number {
  const PAD = Math.max(0, options.outerPadX ?? DEFAULT_OUTER_PAD_X);
  return Math.max(8, panelWidth - PAD * 2 - Math.max(1, avatarWidth) - COLUMN_GAP - 1);
}

/** Body cell width (the column the nameplate band + body rows occupy). */
function bodyCellWidth(panelWidth: number, avatarWidth: number, outerPadX: number): number {
  return Math.max(8, panelWidth - outerPadX * 2 - Math.max(1, avatarWidth) - COLUMN_GAP);
}

// ── Panel compositor (two-column) ──────────────────────────────────────────

function paintPortraitFieldRow(width: number, field: AvatarBackground): string {
  return paintBgStrip("", field, width);
}

function paintAvatarRow(line: AvatarRenderLine, width: number, startCol: number, field: AvatarBackground): string {
  // centerAvatarLine handles fg-only painting; we need the cell bg to be the
  // portrait field. Underpaint by emitting a bg-stripped empty row first.
  const rendered = centerAvatarLine(line, width, startCol);
  // The rendered string may carry its own bg (from the avatar renderer) for
  // the avatar pixels themselves; we want the surrounding pad to use the
  // portrait field. paintBgStrip wraps text + padding in the field colour.
  return paintBgStrip(rendered, field, width);
}

function paintBodyRow(
  text: string,
  controls: string,
  width: number,
  style: PanelStyle,
): string {
  // Inset by one column so body text doesn't kiss the column gap. Truncate
  // first as a safety net — Pi *should* already render at `bodyColumnWidth`
  // when called via the patched adapter, but if a caller hands us a wider
  // line we'd otherwise overflow the panel and pi-tui would assert.
  const innerBudget = Math.max(0, width - 1);
  const fitted = compact(text, innerBudget);
  const inner = ` ${padVisible(fitted, innerBudget)}`;
  const painted = paintBgStrip(inner, style.background, width);
  return `${controls}${style.paint.text(painted)}`;
}

/**
 * Compose a complete two-column RPG turn panel.
 *
 * Layout per row:
 *
 *   PAD ┃ portrait column ┃ GAP ┃ right column (nameplate / body)
 *
 * Row 0 of the right column is the nameplate band (when `title` is supplied).
 * The portrait column carries the avatar pixels for `avatar.height` rows,
 * then continues with the portrait field background to match the body height.
 *
 * The legacy `_avatarWidth` parameter is kept for backward compatibility but
 * the actual width is read from `avatar.width`.
 */
export function composeMessagePanel(
  lines: string[],
  avatar: AvatarCell,
  _avatarWidth: number,
  width: number,
  topPaddingLines = 0,
  title?: string,
  style: PanelStyle = panelStyle("system"),
  options: ComposeOptions = {},
): string[] {
  const content = trimOuterBlankLines(lines);
  const textCells = analyzeTextCells(content);

  const PAD = Math.max(0, options.outerPadX ?? DEFAULT_OUTER_PAD_X);
  const AVW = Math.max(1, avatar.width);
  const BODYW = bodyCellWidth(width, AVW, PAD);
  const field = style.portraitField;
  const align: PanelAlignment = options.align ?? "left";

  const hasNameplate = Boolean(title);
  const meta = options.meta ?? "";

  // Row collection
  const linesOut: string[] = [];
  const padL = " ".repeat(PAD);
  const padG = " ".repeat(COLUMN_GAP);

  // Compose a single row from its avatar cell and body cell, in the
  // alignment-appropriate order. Body text stays left-aligned for
  // readability regardless of which side the avatar lives on.
  const composeRow = (avCell: string, bodyCell: string): string => {
    return align === "right"
      ? `${padL}${bodyCell}${padG}${avCell}`
      : `${padL}${avCell}${padG}${bodyCell}`;
  };

  // Row 0: portrait field + nameplate band (or empty band if no title).
  if (hasNameplate) {
    linesOut.push(composeRow(paintPortraitFieldRow(AVW, field), nameplateRow(title!, BODYW, style, meta)));
  }

  // Compute total rows = max(avatar height, text rows + 2 padding rows)
  const TEXT_PAD = PANEL_TEXT_PADDING;
  const bodyRowsNeeded = textCells.length + TEXT_PAD * 2;
  const portraitRows = avatar.height;
  const innerRows = Math.max(portraitRows, bodyRowsNeeded);

  // Avatar's start column (1-indexed) for Kitty placeholder placement —
  // on the left this is PAD + 1; on the right it's PAD + BODYW + GAP + 1.
  const avatarStartColumn = align === "right"
    ? PAD + BODYW + COLUMN_GAP + 1
    : PAD + 1;

  for (let i = 0; i < innerRows; i++) {
    // Avatar column
    const avLine = i < portraitRows ? avatar.content(i) : null;
    const avCell = avLine
      ? paintAvatarRow(avLine, AVW, avatarStartColumn, field)
      : paintPortraitFieldRow(AVW, field);

    // Body column (top padding, then text cells, then bottom padding)
    const textIdx = i - TEXT_PAD;
    const cell = textIdx >= 0 && textIdx < textCells.length ? textCells[textIdx] : { controls: "", text: "" };
    const bodyCell = paintBodyRow(cell.text, cell.controls, BODYW, style);

    linesOut.push(composeRow(avCell, bodyCell));
  }

  // Bottom gap (separator between panels)
  const bottomGap = Math.max(0, options.bottomGap ?? PANEL_BOTTOM_GAP);
  const gapRows: string[] = [];
  for (let i = 0; i < bottomGap; i++) gapRows.push(" ".repeat(width));

  return [
    ...Array(topPaddingLines).fill(" ".repeat(Math.max(0, width))),
    ...linesOut,
    ...gapRows,
  ];
}
