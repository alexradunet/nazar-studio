// SPDX-License-Identifier: AGPL-3.0-or-later
// Nazar footer — effectively invisible now.
//
// The footer used to carry the runtime status (model · git · tools · ctx).
// That moved into the input editor's nameplate meta in PR #55. What remained
// after that was just a "Nazar" brand mark on the left — the user asked to
// remove it too, so the footer now renders as a single blank line to preserve
// Pi's layout contract (footer always returns at least one row) while being
// fully invisible. The only exception: a ctx-warning pip surfaces when usage
// climbs to 85%+ so the alert is never silently hidden.
import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { compact, visibleWidth } from "./ansi.ts";

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

export function footerFactory(_pi: ExtensionAPI, ctx: ExtensionContext, _onTui?: (tui: any) => void) {
  return (_tui: any, theme: Theme, _footerData: any) => {
    return {
      dispose() {},
      invalidate() {},
      render(width: number): string[] {
        // Only surface a warning when context is genuinely tight.
        // Otherwise return a plain blank line — the footer is invisible.
        const usage = ctx.getContextUsage?.();
        const warning = contextWarningPip(usage, theme);

        if (!warning) {
          // Blank line to satisfy Pi's footer height contract.
          return [" ".repeat(Math.max(0, width))];
        }

        const innerWidth = Math.max(1, width - FOOTER_HORIZONTAL_PADDING * 2);
        const gap = Math.max(1, innerWidth - visibleWidth(warning));
        const line = compact(" ".repeat(gap) + warning, innerWidth);
        return [padFooter(line, width)];
      },
    };
  };
}
