// SPDX-License-Identifier: AGPL-3.0-or-later
// Border-free RPG turn panel compositor for Nazar's Pi terminal.
//
// Panel anatomy (portrait-over-text, copy-safe):
//
//   ╔═══════ nameplate band ════════════════════════════════════════════╗
//   ║  [role-accent title]                                [muted meta] ║
//   ╠═══════════════════════════════════════════════════════════════════╣
//   ║  [portrait strip — background fill, avatar pixels, no box lines] ║
//   ╠═══════════════════════════════════════════════════════════════════╣
//   ║  [empty padding row — panel background]                          ║
//   ║  [text body rows — copyable, background-filled]                  ║
//   ║  [empty padding row]                                             ║
//   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Copy-safety principle: SGR color codes are never captured by terminal
// selection — only glyphs are. All visual ornament lives in color (bg fills).
// The only glyph characters in the output are:
//   - ▀/▄/█/ (half-block pixels in the portrait strip)
//   - ━ repeated once in the bottom rule (its own line, not beside body text)
// Every other visual distinction (nameplate, portrait field, body tint) is
// expressed through background fills that copy as blank space.

import { padVisible, visibleWidth } from "./ansi.ts";
import { truecolorBg } from "./graphics-protocol.ts";
import type { AvatarBackground, AvatarRenderLine } from "./pixel-avatar.ts";
import { centerAvatarLine, emptyAvatarLine } from "./pixel-avatar.ts";
import { panelRule, panelStyle, type PanelStyle } from "./panel-style.ts";

// ── Constants ──────────────────────────────────────────────────────────────

const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";

export const PANEL_TOP_PADDING_ASSISTANT = 1;
export const PANEL_TEXT_PADDING = 1;
const PANEL_BOTTOM_PADDING = 0;

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

function paintPanelTextLine(
  text: string,
  controls: string,
  width: number,
  style: PanelStyle,
  fallbackBackground: AvatarBackground | undefined,
): string {
  const painted = paintBgStrip(text, style.background ?? fallbackBackground, width);
  return `${controls}${style.paint.text(painted)}`;
}

// ── Nameplate band ─────────────────────────────────────────────────────────

/** A slightly brighter surface for the nameplate vs the body ambient tint. */
function nameplateBackground(bg: AvatarBackground): AvatarBackground {
  return [
    Math.min(255, Math.round(bg[0] * 1.55 + 10)),
    Math.min(255, Math.round(bg[1] * 1.55 + 10)),
    Math.min(255, Math.round(bg[2] * 1.55 + 10)),
  ];
}

/**
 * Render a full-width nameplate band.
 *
 * `title` may carry SGR color codes; the band itself is a bg-filled strip.
 * Copy result: "  NAZAR                                                    "
 * — the leading/trailing spaces and any filling are all whitespace, so a
 * select-all paste gives clean content without box-drawing contamination.
 */
export function nameplateRow(title: string, panelWidth: number, style: PanelStyle): string {
  const inner = ` ${title} `;
  const titleVisibleWidth = visibleWidth(title);
  const fill = Math.max(0, panelWidth - titleVisibleWidth - 2); // 1 leading + 1 trailing space
  const full = `${inner}${" ".repeat(fill)}`;
  const bg: AvatarBackground = style.background ?? [20, 30, 25];
  const [r, g, b] = nameplateBackground(bg);
  return `${truecolorBg([r, g, b])}${full}\x1b[49m`;
}

// ── Panel compositor ───────────────────────────────────────────────────────

function messagePanelWidth(width: number): number {
  return Math.max(8, width);
}

function separator(width: number, style: PanelStyle): string {
  return panelRule(style, Math.max(1, width));
}

/**
 * Compose a complete border-free RPG turn panel.
 *
 * Row order (top → bottom):
 *   1. Nameplate band      — full-width bg fill, role title, no border glyphs
 *   2. Portrait strip      — bg-filled avatar columns, no box borders
 *   3. Padding row(s)
 *   4. Text body           — bg-filled, fully copyable
 *   5. Padding row(s)
 *   6. Bottom rule         — ━ × panelWidth (its own line, not beside body text)
 *
 * The `align` parameter is accepted for backward compatibility but no longer
 * affects layout — the portrait is always rendered at the leading edge.
 */
export function composeMessagePanel(
  lines: string[],
  avatar: AvatarCell,
  _avatarWidth: number,
  width: number,
  topPaddingLines = 0,
  title?: string,
  style: PanelStyle = panelStyle("system"),
  _align?: string,
): string[] {
  const content = trimOuterBlankLines(lines);
  const textCells = analyzeTextCells(content);
  const panelWidth = messagePanelWidth(width);
  const linesOut: string[] = [];

  // 1. Nameplate band
  if (title) {
    linesOut.push(nameplateRow(title, panelWidth, style));
  }

  // 2. Portrait strip — background-filled, no box borders
  for (let index = 0; index < avatar.height; index++) {
    const avatarLine = avatar.content(index);
    const avatarCols = avatar.width;
    // avatarStartColumn = 1 (no outer padding; Kitty virtual placement aligns to col 1)
    const avatarRendered = centerAvatarLine(avatarLine, avatarCols, 1);
    const fillWidth = Math.max(0, panelWidth - avatarCols);
    linesOut.push(
      paintBgStrip(avatarRendered, avatar.background, avatarCols) +
      paintBgStrip("", style.background, fillWidth),
    );
  }

  // 3. Top text padding
  for (let i = 0; i < PANEL_TEXT_PADDING; i++) {
    linesOut.push(paintPanelTextLine("", "", panelWidth, style, avatar.background));
  }

  // 4. Text body rows
  for (const cell of textCells) {
    linesOut.push(paintPanelTextLine(cell.text, cell.controls, panelWidth, style, avatar.background));
  }

  // 5. Bottom text padding
  for (let i = 0; i < PANEL_TEXT_PADDING; i++) {
    linesOut.push(paintPanelTextLine("", "", panelWidth, style, avatar.background));
  }

  // 6. Bottom rule
  linesOut.push(separator(panelWidth, style));

  return [
    ...Array(topPaddingLines).fill(" ".repeat(Math.max(0, width))),
    ...linesOut,
    ...Array(PANEL_BOTTOM_PADDING).fill(" ".repeat(Math.max(0, width))),
  ];
}
