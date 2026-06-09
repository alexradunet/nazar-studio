// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared runtime-status rendering for the editor's nameplate meta slot.
//
// Pulls model / git / tools / context info from the Pi extension API and
// renders it as a single coloured string suitable for the right side of a
// nameplate band. Width-aware: drops trailing fields when there isn't room.
//
// Used today by the editor; the footer previously rendered the same info
// but its right side has been retired (the editor carries it now).
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { spawnSync } from "node:child_process";
import { visibleWidth } from "./ansi.ts";
import { panelStyle, type PanelStyle } from "./panel-style.ts";

export type RuntimeMetaContext = {
  pi: ExtensionAPI;
  ctx: ExtensionContext;
  /** Optional source for the git branch + dirty-state — Pi's footer hook
   *  provides this in its footerData; the editor uses our own probe instead. */
  getGitBranch?(): string | undefined;
};

const DIRTY_CACHE_MS = 2500;
const dirtyCache = new WeakMap<object, { value: boolean; checkedAt: number }>();

/** The subset of Pi's Model object the nameplate reads (best-effort). */
type ModelInfo = { baseUrl?: unknown; name?: unknown; id?: unknown } | undefined;

function isLocalModel(model: ModelInfo): boolean {
  const baseUrl = String(model?.baseUrl || "");
  return /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:|\/|$)/.test(baseUrl);
}

function shortModelLabel(model: ModelInfo): string {
  const raw = String(model?.name || model?.id || "no-model");
  return raw
    .replace(/^qwen_/, "qwen/")
    .replace(/_/g, "/")
    .replace(/\bQwen[_/]/i, "qwen/");
}

function contextBar(percent: number, narrow: boolean): string {
  const safe = Math.max(0, Math.min(100, Math.round(percent)));
  if (narrow) return `ctx ${safe}%`;
  const cells = 8;
  const filled = Math.max(0, Math.min(cells, Math.round((safe / 100) * cells)));
  const bar = `${"▰".repeat(filled)}${"▱".repeat(cells - filled)}`;
  return `ctx ${bar} ${safe}%`;
}

function contextRoleFor(percent: number | null | undefined): "dim" | "warning" | "error" {
  if (percent == null) return "dim";
  if (percent >= 95) return "error";
  if (percent >= 85) return "warning";
  return "dim";
}

function spawnGitDirty(cwd: string | undefined): boolean {
  try {
    const result = spawnSync(
      "git",
      ["--no-optional-locks", "status", "--porcelain", "--untracked-files=normal"],
      { cwd: cwd || process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 500 },
    );
    return result.status === 0 && result.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

function cachedRepoDirty(key: object, cwd: string | undefined): boolean {
  const entry = dirtyCache.get(key);
  const now = Date.now();
  if (entry && now - entry.checkedAt < DIRTY_CACHE_MS) return entry.value;
  const value = spawnGitDirty(cwd);
  dirtyCache.set(key, { value, checkedAt: now });
  return value;
}

function probeGitBranch(cwd: string | undefined): string | undefined {
  try {
    const result = spawnSync(
      "git",
      ["--no-optional-locks", "rev-parse", "--abbrev-ref", "HEAD"],
      { cwd: cwd || process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 500 },
    );
    if (result.status !== 0) return undefined;
    const branch = result.stdout.trim();
    return branch || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Build the runtime-meta line as a single coloured string.
 *
 * `widthBudget` is the column budget for the rendered text. The renderer
 * keeps adding fields (in priority order) while they fit; the rest are
 * dropped. ctx + model are the always-shown essentials.
 */
export function renderRuntimeMeta(
  meta: RuntimeMetaContext,
  widthBudget: number,
  style: PanelStyle = panelStyle("system"),
): string {
  const { pi, ctx } = meta;
  const model = ctx.model;
  const usage = ctx.getContextUsage?.();
  // If the caller provides getGitBranch (even one that returns undefined),
  // honour that — it's the explicit "no git" signal. Only fall back to our
  // env-probe when no source is provided at all, e.g. ad-hoc render outside
  // Pi's session lifecycle where footerData.onBranchChange isn't wired.
  const branch = meta.getGitBranch ? meta.getGitBranch() : probeGitBranch(ctx.cwd);
  const dirty = branch ? cachedRepoDirty(ctx, ctx.cwd) : false;
  const toolCount = (() => {
    try { return pi.getActiveTools()?.length || pi.getAllTools()?.length || 0; }
    catch { return 0; }
  })();

  const narrow = widthBudget < 60;

  // Priority order: ctx (most essential), model, git, tool-count, mode label.
  const fields: Array<{ text: string; paint: (s: string) => string }> = [];

  if (usage?.percent != null) {
    fields.push({
      text: contextBar(usage.percent, narrow),
      paint: contextRoleFor(usage.percent) === "error" ? style.paint.title : style.paint.muted,
    });
  }

  if (model) {
    fields.push({ text: shortModelLabel(model), paint: style.paint.title });
  }

  if (branch) {
    fields.push({
      text: `git:${branch}${dirty ? "*" : ""}`,
      paint: dirty ? style.paint.accent : style.paint.muted,
    });
  }

  if (toolCount > 0) {
    fields.push({ text: `${toolCount} tools`, paint: style.paint.muted });
  }

  if (model) {
    fields.push({
      text: isLocalModel(model) ? "local/private" : "frontier/opt-in",
      paint: isLocalModel(model) ? style.paint.title : style.paint.accent,
    });
  }

  // Build progressively, dropping trailing fields when over budget.
  const sep = style.paint.muted(" · ");
  const sepWidth = visibleWidth(sep);
  const kept: string[] = [];
  let used = 0;
  for (const f of fields) {
    const w = visibleWidth(f.text);
    const candidate = used === 0 ? w : used + sepWidth + w;
    if (candidate > widthBudget) break;
    kept.push(f.paint(f.text));
    used = candidate;
  }
  return kept.join(sep);
}
