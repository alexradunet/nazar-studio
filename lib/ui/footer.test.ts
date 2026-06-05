// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { visibleWidth } from "./ansi.ts";
import { footerFactory } from "./footer.ts";

const theme: any = {
  fg(_name: string, text: string) { return text; },
  bold(text: string) { return text; },
};

function renderFooter(width: number): string {
  const pi: any = {
    getActiveTools: () => [],
    getAllTools: () => ["read", "write"],
  };
  const ctx: any = {
    model: { provider: "llamafile", baseUrl: "http://127.0.0.1:8082/v1", name: "qwen_test" },
    getContextUsage: () => ({ percent: 42 }),
  };
  const footerData: any = {
    onBranchChange: () => undefined,
    getGitBranch: () => undefined,
  };
  const component = footerFactory(pi, ctx)(undefined, theme, footerData);
  return component.render(width)[0] ?? "";
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
