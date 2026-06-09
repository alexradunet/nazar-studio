// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import type { TUI } from "@earendil-works/pi-tui";
import { visibleWidth } from "./ansi.ts";
import { footerFactory } from "./footer.ts";

// The footer factory ignores its tui argument; a typed null stands in for it.
const noTui = null as unknown as TUI;

const theme: any = {
  fg(_name: string, text: string) { return text; },
  bold(text: string) { return text; },
};

function plain(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function renderFooter(width: number, ctxOverrides: any = {}): string {
  const pi: any = { getActiveTools: () => [], getAllTools: () => [] };
  const ctx: any = {
    getContextUsage: () => ({ percent: 42 }),
    ...ctxOverrides,
  };
  const component = footerFactory(pi, ctx)(noTui, theme, undefined);
  return component.render(width)[0] ?? "";
}

test("footer renders a single blank line when ctx is below the warning threshold", () => {
  const line = renderFooter(80, { getContextUsage: () => ({ percent: 42 }) });
  // Entire row is whitespace — no brand mark, no runtime info.
  expect(plain(line).trim()).toBe("");
  expect(visibleWidth(line)).toBe(80);
});

test("footer renders a single blank line when no ctx usage is available", () => {
  const line = renderFooter(80, { getContextUsage: () => undefined });
  expect(plain(line).trim()).toBe("");
  expect(visibleWidth(line)).toBe(80);
});

test("footer stays within narrow widths", () => {
  for (const width of [1, 2, 12, 24]) {
    expect(visibleWidth(renderFooter(width))).toBeLessThanOrEqual(width);
  }
});

test("footer surfaces a ctx-warning pip when usage is at 85% or above", () => {
  // 84% → still blank
  expect(plain(renderFooter(120, { getContextUsage: () => ({ percent: 84 }) })).trim()).toBe("");
  // 85% → warning
  expect(plain(renderFooter(120, { getContextUsage: () => ({ percent: 85 }) }))).toContain("ctx 85%");
  expect(plain(renderFooter(120, { getContextUsage: () => ({ percent: 92 }) }))).toContain("ctx 92%");
  // 95% → error-level
  expect(plain(renderFooter(120, { getContextUsage: () => ({ percent: 97 }) }))).toContain("ctx 97%");
});

test("footer carries NO brand mark (Nazar) anywhere", () => {
  // The brand mark was removed per user request — the footer is now invisible
  // unless there's a ctx warning.
  for (const percent of [0, 42, 80, 90, 99]) {
    const line = plain(renderFooter(120, { getContextUsage: () => ({ percent }) }));
    expect(line).not.toContain("Nazar");
  }
});
