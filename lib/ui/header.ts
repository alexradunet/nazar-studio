// SPDX-License-Identifier: AGPL-3.0-or-later
// Compact Basm/RPG header for Nazar's ANSI terminal UI.
import type { Theme } from "@earendil-works/pi-coding-agent";
import { compact, padVisible, visibleWidth } from "./ansi.ts";
import { paintPanelBorderPart, panelBottomHorizontal, panelHorizontal, panelLabeledTop, panelStyle, type PanelStyle } from "./panel-style.ts";

type FrameEdge = "top" | "bottom";

function framedLabel(edge: FrameEdge, text: string, innerWidth: number, _theme: Theme, style: PanelStyle): string {
  if (edge === "top") return panelLabeledTop(style, innerWidth, text);

  const g = style.glyphs;
  const totalWidth = innerWidth + 2;
  const prefix = `${paintPanelBorderPart(style, "corner", g.bottomLeft)}${panelBottomHorizontal(style, 1, "base")} `;
  const suffix = " ";
  const fill = totalWidth
    - visibleWidth(prefix)
    - visibleWidth(text)
    - visibleWidth(suffix)
    - visibleWidth(g.bottomRight);

  if (fill < 0) {
    return `${paintPanelBorderPart(style, "corner", g.bottomLeft)}${panelBottomHorizontal(style, innerWidth, "base")}${paintPanelBorderPart(style, "corner", g.bottomRight)}`;
  }
  return `${prefix}${text}${suffix}${panelBottomHorizontal(style, fill, "base")}${paintPanelBorderPart(style, "corner", g.bottomRight)}`;
}

function frameRule(edge: FrameEdge, innerWidth: number, _theme: Theme, style: PanelStyle): string {
  const g = style.glyphs;
  const left = edge === "top" ? g.topLeft : g.bottomLeft;
  const right = edge === "top" ? g.topRight : g.bottomRight;
  const body = edge === "top" ? panelHorizontal(style, innerWidth, "base") : panelBottomHorizontal(style, innerWidth, "base");
  return `${paintPanelBorderPart(style, "corner", left)}${body}${paintPanelBorderPart(style, "corner", right)}`;
}

export function headerFactory(_tui: any, theme: Theme) {
  return {
    invalidate() {},
    render(width: number): string[] {
      const style = panelStyle("system", "idle");
      const g = style.glyphs;
      const titlePlain = width < 46 ? "NAZAR" : "B A L A U R";
      const subtitlePlain = width < 56
        ? "private | sovereign | FOSS"
        : "local-first | private | sovereign | FOSS";
      const innerWidth = Math.min(Math.max(width - 8, 26), width >= 90 ? 76 : 72);
      const title = style.paint.title(theme.bold(titlePlain));
      const subtitle = style.paint.muted(padVisible(subtitlePlain, innerWidth - 2));

      const bottom = width >= 82
        ? framedLabel("bottom", style.paint.muted("woven, not rendered"), innerWidth, theme, style)
        : frameRule("bottom", innerWidth, theme, style);

      return [
        compact(`  ${framedLabel("top", title, innerWidth, theme, style)}`, width),
        compact(`  ${paintPanelBorderPart(style, "vertical", `${g.leftVertical} `)}${subtitle}${paintPanelBorderPart(style, "vertical", ` ${g.rightVertical}`)}`, width),
        compact(`  ${bottom}`, width),
      ];
    },
  };
}
