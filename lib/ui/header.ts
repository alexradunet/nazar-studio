// SPDX-License-Identifier: AGPL-3.0-or-later
// Top-of-screen header for Nazar's Pi terminal — a single gold nameplate
// band carrying the brand mark, the Basm motto, and the trust tagline.
//
// Consistent with the chat-panel system: the header uses the same
// `nameplateRow` primitive as message panels, so the gold plaque, padding,
// and typography all line up. No box-drawing chars beside body content,
// fully copy-safe by construction.
import type { Theme } from "@earendil-works/pi-coding-agent";
import { compact } from "./ansi.ts";
import { panelStyle } from "./panel-style.ts";
import { nameplateRow } from "./turn-composer.ts";

const HEADER_LEFT_PADDING = 2;

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

      return [
        padded(nameplateRow(title, bandWidth, style, meta)),
        " ".repeat(Math.max(0, width)),
      ];
    },
  };
}
