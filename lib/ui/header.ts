// SPDX-License-Identifier: AGPL-3.0-or-later
// Top-of-screen header for Nazar's Pi terminal — a single gold nameplate
// band carrying the brand mark, the Basm motto, and the trust tagline.
//
// Consistent with the chat-panel system: the header uses the same
// `nameplateRow` primitive as message panels, so the gold plaque, padding,
// and typography all line up. No box-drawing chars beside body content,
// fully copy-safe by construction.
//
// A 1-row "folk band" — a 4-colour Basm carpet stripe (folkred / gold /
// teal / emberDeep) — sits beneath the nameplate as a Romanian-fairy-tale
// separator between header and conversation. Disable via
// NAZAR_FOLK_BAND=off if you'd rather have plain space.
import type { Theme } from "@earendil-works/pi-coding-agent";
import { compact } from "./ansi.ts";
import { panelStyle } from "./panel-style.ts";
import { COLOR, hexToRgb, type Rgb } from "./tokens.ts";
import { nameplateRow } from "./turn-composer.ts";

const HEADER_LEFT_PADDING = 2;

// Folk-band motif: 4-colour carpet cycle pulled from the canonical Basm
// palette. 3-cell segments → 12-cell cycle. The band is rendered as plain
// background-coloured spaces (no glyphs), so copy-and-paste of the header
// region yields whitespace, not pattern characters.
const FOLK_BAND_SEGMENT = 3;
const FOLK_BAND_PALETTE: ReadonlyArray<Rgb> = [
  hexToRgb(COLOR.folkred),
  hexToRgb(COLOR.gold),
  hexToRgb(COLOR.teal),
  hexToRgb(COLOR.emberDeep),
];

function folkBandEnabled(): boolean {
  return (process.env.NAZAR_FOLK_BAND || "").trim().toLowerCase() !== "off";
}

/**
 * Render the Basm folk-band motif as a single full-width row.
 *
 * Each cell is painted with a background colour cycling through the carpet
 * palette every `FOLK_BAND_SEGMENT` cells. The cell content is a literal
 * space, so the row contributes zero glyphs to a clipboard paste — only
 * trailing whitespace, which terminals trim away.
 *
 * Adjacent segments are coalesced into one SGR pair, keeping the rendered
 * byte count low even on wide terminals.
 */
export function renderFolkBand(width: number): string {
  const safeWidth = Math.max(0, Math.floor(width));
  if (safeWidth === 0) return "";
  let out = "";
  let cursor = 0;
  while (cursor < safeWidth) {
    const segmentIndex = Math.floor(cursor / FOLK_BAND_SEGMENT) % FOLK_BAND_PALETTE.length;
    const segmentEnd = Math.min(safeWidth, (Math.floor(cursor / FOLK_BAND_SEGMENT) + 1) * FOLK_BAND_SEGMENT);
    const [r, g, b] = FOLK_BAND_PALETTE[segmentIndex];
    out += `\x1b[48;2;${r};${g};${b}m${" ".repeat(segmentEnd - cursor)}\x1b[49m`;
    cursor = segmentEnd;
  }
  return out;
}

export function headerFactory(_tui: any, theme: Theme) {
  return {
    invalidate() {},
    render(width: number): string[] {
      // Use the assistant palette so the header band carries Nazar's gold
      // brand hue — visually consistent with assistant panels downstream.
      const style = panelStyle("assistant", "idle");

      const bandWidth = Math.max(8, width - HEADER_LEFT_PADDING * 2);
      const wide = width >= 90;
      const medium = width >= 56;
      const veryNarrow = width < 46;

      const titlePlain = veryNarrow ? "NAZAR" : "B A L A U R";
      const motto = "woven, not rendered";
      const tagline = wide
        ? "local-first · private · sovereign · FOSS"
        : medium
          ? "local-first · private · FOSS"
          : "private · FOSS";

      // Title format mirrors the panel-nameplate convention: icon + bold name
      // + muted descriptor. Falls back to bare brand mark on narrow widths.
      const titleSegment = `${style.paint.title(`✦ ${theme.bold(titlePlain)}`)}`;
      const title = wide
        ? `${titleSegment} ${style.paint.muted(`· ${motto}`)}`
        : titleSegment;
      const meta = style.paint.muted(tagline);

      const padded = (line: string) => compact(`${" ".repeat(HEADER_LEFT_PADDING)}${line}`, width);

      const rows = [padded(nameplateRow(title, bandWidth, style, meta))];
      if (folkBandEnabled()) rows.push(renderFolkBand(width));
      rows.push(" ".repeat(Math.max(0, width)));
      return rows;
    },
  };
}
