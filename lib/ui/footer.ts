// SPDX-License-Identifier: AGPL-3.0-or-later
// Truthful one-line runtime footer for Nazar's Pi terminal.
import { spawnSync } from "node:child_process";
import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { compact, visibleWidth } from "./ansi.ts";
import { paintPanelBorderPart, panelStyle, type PanelStyle } from "./panel-style.ts";

const FOOTER_HORIZONTAL_PADDING = 1;

function isLocalModel(model: any): boolean {
  const baseUrl = String(model?.baseUrl || "");
  return /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:|\/|$)/.test(baseUrl);
}

function modelModeLabel(model: any): string {
  if (!model) return "no model";
  return isLocalModel(model) ? "local/private" : "frontier/opt-in";
}

function shortModelLabel(model: any): string {
  const raw = String(model?.name || model?.id || "no-model");
  return raw
    .replace(/^qwen_/, "qwen/")
    .replace(/_/g, "/")
    .replace(/\bQwen[_/]/i, "qwen/");
}

function joinStyled(parts: string[], style: PanelStyle): string {
  const separator = " | ";
  return parts.join(paintPanelBorderPart(style, "separator", separator));
}

function padFooter(line: string, width: number): string {
  const totalPadding = FOOTER_HORIZONTAL_PADDING * 2;
  if (width <= totalPadding) return compact(line, width);
  const innerWidth = width - totalPadding;
  const inner = compact(line, innerWidth);
  const rightFill = Math.max(0, innerWidth - visibleWidth(inner));
  return `${" ".repeat(FOOTER_HORIZONTAL_PADDING)}${inner}${" ".repeat(rightFill + FOOTER_HORIZONTAL_PADDING)}`;
}

function contextLabel(usage: any, width: number): string | undefined {
  if (usage?.percent == null) return undefined;
  const percent = Math.max(0, Math.min(100, Math.round(usage.percent)));
  if (width < 80) return `ctx ${percent}%`;
  // ▰▱ mana-bar gauge — compact RPG context meter
  const cells = 8;
  const filled = Math.max(0, Math.min(cells, Math.round((percent / 100) * cells)));
  const bar = `${"▰".repeat(filled)}${"▱".repeat(cells - filled)}`;
  return `ctx ${bar} ${percent}%`;
}

function contextColor(percent: number | null | undefined): "dim" | "warning" | "error" {
  if (percent == null) return "dim";
  if (percent >= 95) return "error";
  if (percent >= 85) return "warning";
  return "dim";
}

function repoDirty(cwd: string | undefined): boolean {
  try {
    const result = spawnSync("git", ["--no-optional-locks", "status", "--porcelain", "--untracked-files=normal"], {
      cwd: cwd || process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 500,
    });
    return result.status === 0 && result.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

export function footerFactory(pi: ExtensionAPI, ctx: ExtensionContext, onTui?: (tui: any) => void) {
  let dirtyCached = false;
  let dirtyCheckedAt = 0;

  function cachedRepoDirty(): boolean {
    const now = Date.now();
    if (now - dirtyCheckedAt < 2500) return dirtyCached;
    dirtyCheckedAt = now;
    dirtyCached = repoDirty((ctx as any).cwd);
    return dirtyCached;
  }

  return (tui: any, theme: Theme, footerData: any) => {
    onTui?.(tui);
    const unsubscribe = footerData.onBranchChange?.(() => {
      dirtyCheckedAt = 0;
      tui.requestRender?.();
    });

    return {
      dispose() { unsubscribe?.(); },
      invalidate() {},
      render(width: number): string[] {
        const toolCount = (() => {
          try { return pi.getActiveTools()?.length || pi.getAllTools()?.length || 0; }
          catch { return 0; }
        })();
        const branch = footerData.getGitBranch?.();
        const dirty = Boolean(branch) && cachedRepoDirty();
        const usage = ctx.getContextUsage?.();
        const innerWidth = Math.max(1, width - FOOTER_HORIZONTAL_PADDING * 2);
        const context = contextLabel(usage, innerWidth);

        const model = (ctx as any).model;
        const style = panelStyle("system", isLocalModel(model) ? "idle" : "warning");
        const left = style.paint.title(theme.bold("Nazar"));
        const mode = model
          ? theme.fg(isLocalModel(model) ? "success" : "warning", modelModeLabel(model))
          : theme.fg("dim", modelModeLabel(model));
        const branchText = branch
          ? theme.fg(dirty ? "warning" : "dim", `git:${branch}${dirty ? "*" : ""}`)
          : undefined;
        const contextText = context
          ? theme.fg(contextColor(usage?.percent), context)
          : undefined;

        const rightParts = [
          mode,
          theme.fg("dim", shortModelLabel(model)),
          branchText,
          toolCount ? theme.fg("dim", `${toolCount} tools`) : undefined,
          contextText,
        ].filter(Boolean) as string[];
        const right = joinStyled(rightParts, style);

        const gap = innerWidth - visibleWidth(left) - visibleWidth(right);
        const line = gap <= 1
          ? compact(`${left} ${right}`, innerWidth)
          : compact(left + " ".repeat(gap) + right, innerWidth);
        return [padFooter(line, width)];
      },
    };
  };
}
