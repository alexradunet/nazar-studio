// SPDX-License-Identifier: AGPL-3.0-or-later
// Slim Nazar-brand footer.
//
// The runtime status (model · git · tools · ctx) used to live here on the
// right. It's been moved into the input editor's nameplate meta slot, so
// the footer is now a quiet brand-mark line: "Nazar" on the left, an
// optional context-warning pip on the right when usage gets high.
import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { compact, visibleWidth } from "./ansi.ts";
import { panelStyle } from "./panel-style.ts";

const FOOTER_HORIZONTAL_PADDING = 1;

function padFooter(line: string, width: number): string {
  const totalPadding = FOOTER_HORIZONTAL_PADDING * 2;
  if (width <= totalPadding) return compact(line, width);
  const innerWidth = width - totalPadding;
  const inner = compact(line, innerWidth);
  const rightFill = Math.max(0, innerWidth - visibleWidth(inner));
  return `${" ".repeat(FOOTER_HORIZONTAL_PADDING)}${inner}${" ".repeat(rightFill + FOOTER_HORIZONTAL_PADDING)}`;
}

function contextWarningPip(usage: any, theme: Theme): string | undefined {
  const percent = usage?.percent;
  if (percent == null || percent < 85) return undefined;
  const role = percent >= 95 ? "error" : "warning";
  const label = `ctx ${Math.round(percent)}% — running tight`;
  return theme.fg(role, label);
}

export function footerFactory(_pi: ExtensionAPI, ctx: ExtensionContext, onTui?: (tui: any) => void) {
  return (tui: any, theme: Theme, footerData: any) => {
    onTui?.(tui);

    return {
      dispose() {},
      invalidate() {},
      render(width: number): string[] {
        const style = panelStyle("system");
        const left = style.paint.title(theme.bold("Nazar"));

        // Only surface a footer pip when context is genuinely tight.
        // Otherwise the right side stays empty — runtime info lives in
        // the editor meta now, no need to repeat it down here.
        const usage = ctx.getContextUsage?.();
        const warning = contextWarningPip(usage, theme) ?? "";

        const innerWidth = Math.max(1, width - FOOTER_HORIZONTAL_PADDING * 2);
        const gap = innerWidth - visibleWidth(left) - visibleWidth(warning);
        const line = gap <= 1
          ? compact(`${left} ${warning}`, innerWidth)
          : compact(left + " ".repeat(gap) + warning, innerWidth);
        return [padFooter(line, width)];
      },
    };
  };
}
