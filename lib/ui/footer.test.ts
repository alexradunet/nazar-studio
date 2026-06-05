// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { visibleWidth } from "./ansi.ts";
import { footerFactory } from "./footer.ts";

const theme: any = {
  fg(_name: string, text: string) { return text; },
  bold(text: string) { return text; },
};

function renderFooter(width: number, ctxOverrides: any = {}): string {
  const pi: any = {
    getActiveTools: () => [],
    getAllTools: () => ["read", "write"],
  };
  const ctx: any = {
    model: { provider: "llamafile", baseUrl: "http://127.0.0.1:8082/v1", name: "qwen_test" },
    getContextUsage: () => ({ percent: 42 }),
    ...ctxOverrides,
  };
  const footerData: any = {
    onBranchChange: () => undefined,
    getGitBranch: () => undefined,
  };
  const component = footerFactory(pi, ctx)(undefined, theme, footerData);
  return component.render(width)[0] ?? "";
}

function plain(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

test("footer keeps one-column outer padding", () => {
  const line = renderFooter(80);
  expect(line.startsWith(" ")).toBe(true);
  expect(line.endsWith(" ")).toBe(true);
  expect(visibleWidth(line)).toBe(80);
});

test("footer stays within narrow widths", () => {
  for (const width of [1, 2, 12, 24]) {
    expect(visibleWidth(renderFooter(width))).toBeLessThanOrEqual(width);
  }
});

test("footer carries the Nazar brand on the left, NO runtime info on the right", () => {
  // Runtime info (model, git, tools, ctx) lives in the editor nameplate
  // meta now — the footer is just a quiet brand-mark bar.
  const text = plain(renderFooter(120)).trim();
  expect(text).toContain("Nazar");
  expect(text).not.toContain("qwen");
  expect(text).not.toContain("tools");
  expect(text).not.toMatch(/git:/);
  expect(text).not.toMatch(/ctx /);
});

test("footer surfaces a context-warning pip only when usage is tight", () => {
  // <85% → no warning pip
  const calm = plain(renderFooter(120, { getContextUsage: () => ({ percent: 42 }) })).trim();
  expect(calm).not.toContain("ctx");
  // 90% → warning ("running tight")
  const tight = plain(renderFooter(120, { getContextUsage: () => ({ percent: 92 }) })).trim();
  expect(tight).toContain("ctx 92%");
  // 97% → error ("running tight")
  const dire = plain(renderFooter(120, { getContextUsage: () => ({ percent: 97 }) })).trim();
  expect(dire).toContain("ctx 97%");
});
