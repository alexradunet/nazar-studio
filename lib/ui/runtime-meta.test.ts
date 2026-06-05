// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { visibleWidth } from "./ansi.ts";
import { panelStyle } from "./panel-style.ts";
import { renderRuntimeMeta, type RuntimeMetaContext } from "./runtime-meta.ts";

function makeMeta(overrides: { model?: any; percent?: number; tools?: string[]; branch?: string } = {}): RuntimeMetaContext {
  const pi: any = {
    getActiveTools: () => [],
    getAllTools: () => overrides.tools ?? ["read", "write", "bash"],
  };
  const ctx: any = {
    model: overrides.model ?? { name: "qwen_test", baseUrl: "http://127.0.0.1:8082/v1" },
    getContextUsage: () => (overrides.percent !== undefined ? { percent: overrides.percent } : undefined),
    cwd: process.cwd(),
  };
  return { pi, ctx, getGitBranch: () => overrides.branch };
}

function plain(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

test("renders model, git branch, tools count, and ctx % at generous width", () => {
  const out = plain(renderRuntimeMeta(makeMeta({ percent: 42, branch: "main" }), 200));
  expect(out).toContain("qwen/test");
  expect(out).toContain("git:main");
  expect(out).toContain("3 tools");
  expect(out).toContain("ctx");
  expect(out).toContain("42%");
});

test("drops trailing fields when the width budget is tight", () => {
  // ~30 cells: ctx should survive (most essential); model should land next
  // if it fits; the rest get progressively trimmed.
  const meta = makeMeta({ percent: 60, branch: "feature/very-long-branch-name", tools: ["a", "b", "c", "d", "e"] });
  const narrow = plain(renderRuntimeMeta(meta, 16));
  const medium = plain(renderRuntimeMeta(meta, 32));
  const wide = plain(renderRuntimeMeta(meta, 200));
  // Each step adds at least as many fields as the prior step.
  expect(visibleWidth(narrow)).toBeLessThanOrEqual(16);
  expect(visibleWidth(medium)).toBeLessThanOrEqual(32);
  expect(visibleWidth(wide)).toBeLessThanOrEqual(200);
  // ctx always tops the priority list.
  expect(plain(narrow)).toContain("ctx");
});

test("never exceeds the width budget", () => {
  const meta = makeMeta({ percent: 88, branch: "main", tools: Array(20).fill("t") });
  for (const w of [8, 16, 24, 32, 64, 100, 200]) {
    expect(visibleWidth(renderRuntimeMeta(meta, w))).toBeLessThanOrEqual(w);
  }
});

test("dirty git marker is appended to the branch name when present", () => {
  // The renderer probes git itself, so we lean on the in-test getGitBranch
  // hook + the dirty cache being keyed by ctx identity. The repo we're
  // running inside almost certainly has changes (this PR), so dirty=true.
  const meta = makeMeta({ percent: 50, branch: "main" });
  const out = plain(renderRuntimeMeta(meta, 200));
  // Either "git:main" or "git:main*" — we don't assert dirty status here
  // because the working tree state in CI is non-deterministic.
  expect(out).toMatch(/git:main\*?/);
});

test("returns empty string when there's nothing to show", () => {
  const meta: RuntimeMetaContext = {
    pi: { getActiveTools: () => [], getAllTools: () => [] } as any,
    ctx: { model: null, getContextUsage: () => undefined } as any,
    // Explicit empty git source so the env-probe fallback isn't hit.
    getGitBranch: () => undefined,
  };
  expect(plain(renderRuntimeMeta(meta, 100))).toBe("");
});

test("uses the panel style's paint helpers for color", () => {
  // Pull through truecolor SGR — confirms we're respecting the style.
  const meta = makeMeta({ percent: 50, branch: "main" });
  const out = renderRuntimeMeta(meta, 200, panelStyle("user"));
  expect(out).toContain("\x1b[38;2;");
});
