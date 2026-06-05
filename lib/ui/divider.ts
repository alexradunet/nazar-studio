// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Chapter / session dividers for the Pi terminal — thin Basm-motif rows
// that mark meaningful moments in the conversation: session opening,
// compaction events, branch boundaries.
//
// Two primitives:
//
//   renderChapterDivider({ width, label, style, glyph })
//     A full-width centred divider row built from box-rule chars (─) with
//     an optional themed label and accent glyph in the middle:
//
//       ─── ✦ session opened · 23:45 ✦ ─────────────────────────────
//
//     Rule chars are painted in the panel style's `muted`; the glyph in
//     `accent`; the label in `title`. Width-aware: if the label doesn't
//     fit, the divider falls back to a plain centred rule with no glyph.
//
//   renderStitchLine({ width, style })
//     A quieter dashed line — alternating rule + space — mirroring the
//     basm.md `.stitch` CSS recipe. For very subtle inline breaks.
//
// Both lines are themed via PanelStyle so callers can pick the role hue
// (assistant gold for session, teal for thinking-state, smoke for system
// neutrality, etc).

import { compact, visibleWidth } from "./ansi.ts";
import type { PanelStyle } from "./panel-style.ts";

const RULE = "─";   // U+2500 BOX DRAWINGS LIGHT HORIZONTAL
const DEFAULT_GLYPH = "✦"; // U+2726 BLACK FOUR POINTED STAR
const STITCH_RULE = "─"; // same glyph, alternating space pattern for the stitch

export interface ChapterDividerOptions {
  width: number;
  label?: string;
  /** Accent glyph flanking the label (default ✦). Set to "" to omit. */
  glyph?: string;
  style: PanelStyle;
}

/**
 * Render a centred chapter divider row.
 *
 * Layout (with label + glyph):
 *
 *   ─── ✦ <label> ✦ ───
 *
 * Layout (no label):
 *
 *   ──────── ✦ ────────
 *
 * Layout (no glyph, no label):
 *
 *   ────────────────────
 */
export function renderChapterDivider(opts: ChapterDividerOptions): string {
  const width = Math.max(0, Math.floor(opts.width));
  if (width === 0) return "";

  const paintRule = opts.style.paint.muted;
  const paintGlyph = opts.style.paint.accent;
  const paintLabel = opts.style.paint.title;
  const glyph = opts.glyph ?? DEFAULT_GLYPH;

  // Compose the centre piece: "✦ label ✦" (or just "✦", or empty)
  const labelText = opts.label ?? "";
  let centre = "";
  let centreVis = 0;
  if (labelText && glyph) {
    centre = ` ${paintGlyph(glyph)} ${paintLabel(labelText)} ${paintGlyph(glyph)} `;
    centreVis = 1 + visibleWidth(glyph) + 1 + visibleWidth(labelText) + 1 + visibleWidth(glyph) + 1;
  } else if (labelText) {
    centre = ` ${paintLabel(labelText)} `;
    centreVis = 1 + visibleWidth(labelText) + 1;
  } else if (glyph) {
    centre = ` ${paintGlyph(glyph)} `;
    centreVis = 1 + visibleWidth(glyph) + 1;
  }

  // If the centre piece doesn't fit, fall back to a plain rule line.
  if (centreVis >= width) {
    return paintRule(RULE.repeat(width));
  }

  const remaining = width - centreVis;
  const leftRule = Math.floor(remaining / 2);
  const rightRule = remaining - leftRule;
  return `${paintRule(RULE.repeat(leftRule))}${centre}${paintRule(RULE.repeat(rightRule))}`;
}

export interface StitchLineOptions {
  width: number;
  style: PanelStyle;
}

/**
 * Render a stitch line — alternating box-rule + space, mirroring the web
 * `.stitch` recipe. Used for quieter sub-breaks (e.g. inside a panel
 * separating sub-sections), not the bold chapter divider above.
 */
export function renderStitchLine(opts: StitchLineOptions): string {
  const width = Math.max(0, Math.floor(opts.width));
  if (width === 0) return "";
  const paintRule = opts.style.paint.muted;
  // Pattern: `─ ─ ─ ─` — rule + space pairs. Each pair is 2 cells; for an
  // odd width we trail with a single rule.
  const pairs = Math.floor(width / 2);
  const tail = width % 2 === 1 ? STITCH_RULE : "";
  const text = `${STITCH_RULE} `.repeat(pairs) + tail;
  return paintRule(compact(text, width));
}
