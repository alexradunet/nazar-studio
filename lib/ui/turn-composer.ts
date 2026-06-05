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

export type ComposeOptions = {
  /** Right-aligned meta string for the nameplate band (already styled). */
  meta?: string;
  /** Outer left/right padding columns. Default 2. */
  outerPadX?: number;
  /** Blank rows appended after the panel as a separator. Default 1. */
  bottomGap?: number;
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

/** Fill `text` (plus trailing spaces) with a background colour up to `width`. */
export function paintBgStrip(text: string, background: AvatarBackground | undefined, width: number): string {
  const padded = padVisible(text, width);
  if (!background) return padded;
  const [r, g, b] = background;
  return `\x1b[48;2;${r};${g};${b}m${padded}\x1b[49m`;
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
 * Compute the body column width for a given panel width and avatar width.
 * Mirrors the column math used inside `composeMessagePanel`; exposed so
 * adapters can pre-tell Pi to wrap body text into our narrower column
 * rather than emitting full-width rows that we'd have to truncate.
 */
export function bodyColumnWidth(panelWidth: number, avatarWidth: number, options: { outerPadX?: number } = {}): number {
  const PAD = Math.max(0, options.outerPadX ?? DEFAULT_OUTER_PAD_X);
  return Math.max(8, panelWidth - PAD * 2 - Math.max(1, avatarWidth) - COLUMN_GAP);
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
  const GAP = COLUMN_GAP;
  const BODYW = Math.max(8, width - PAD * 2 - AVW - GAP);
  const field = style.portraitField;

  const hasNameplate = Boolean(title);
  const meta = options.meta ?? "";

  // Row collection
  const linesOut: string[] = [];

  // Row 0: portrait field + nameplate (or empty band if no title)
  const padL = " ".repeat(PAD);
  const padG = " ".repeat(GAP);

  if (hasNameplate) {
    linesOut.push(`${padL}${paintPortraitFieldRow(AVW, field)}${padG}${nameplateRow(title!, BODYW, style, meta)}`);
  }

  // Compute total rows = max(avatar height, text rows + 2 padding rows)
  const TEXT_PAD = PANEL_TEXT_PADDING;
  const bodyRowsNeeded = textCells.length + TEXT_PAD * 2;
  const portraitRows = avatar.height;
  const innerRows = Math.max(portraitRows, bodyRowsNeeded);

  // Avatar starts at column PAD + 1 (1-indexed), so kitty placeholder grids
  // align to the correct cell when centerAvatarLine emits absolute-column moves.
  const avatarStartColumn = PAD + 1;

  for (let i = 0; i < innerRows; i++) {
    // Avatar column
    const avLine = i < portraitRows ? avatar.content(i) : null;
    const avCell = avLine
      ? paintAvatarRow(avLine, AVW, avatarStartColumn, field)
      : paintPortraitFieldRow(AVW, field);

    // Body column (one row of top text padding, then text cells, then one row bottom padding)
    const textIdx = i - TEXT_PAD;
    const cell = textIdx >= 0 && textIdx < textCells.length ? textCells[textIdx] : { controls: "", text: "" };
    const bodyCell = paintBodyRow(cell.text, cell.controls, BODYW, style);

    linesOut.push(`${padL}${avCell}${padG}${bodyCell}`);
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
