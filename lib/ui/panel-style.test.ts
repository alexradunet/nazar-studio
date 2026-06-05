// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { visibleWidth } from "./ansi.ts";
import { panelLabeledTop, panelRule, panelStyle } from "./panel-style.ts";

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

test("panel style is ANSI-only", () => {
  const style = panelStyle("assistant", "idle");
  expect(style.supports.ansi).toBe(true);
  expect(style.supports.shadow).toBe(false);
  expect(style.paint.border("x")).toContain("\x1b[38;2;");
});

test("panel style colors ANSI by role", () => {
  const user = panelStyle("user", "idle").paint.accent("x");
  const assistant = panelStyle("assistant", "idle").paint.accent("x");
  expect(user).toContain("\x1b[38;2;");
  expect(user).not.toBe(assistant);
});

test("panel style colors tool states distinctly", () => {
  const ok = panelStyle("tool", "ok").paint.accent("tool");
  const error = panelStyle("tool", "error").paint.accent("tool");
  expect(ok).not.toBe(error);
});

test("running ANSI panels support pulse but no shadow layer", () => {
  const style = panelStyle("thinking", "running", { frame: 1 });
  expect(style.supports.pulse).toBe(true);
  expect(style.supports.shadow).toBe(false);
  expect(style.paint.pulse("x")).toContain("\x1b[38;2;");
});

test("panel border primitives preserve visible width", () => {
  const style = panelStyle("assistant", "idle");
  const top = panelLabeledTop(style, 24, style.paint.title("NAZAR"));
  expect(visibleWidth(top)).toBe(26);
  expect(top).toContain("\x1b[38;2;");

  const rule = panelRule(style, 24);
  const plainRule = stripAnsi(rule);
  expect(plainRule.startsWith("═◆")).toBe(true);
  expect(plainRule.endsWith("◆═")).toBe(true);
  expect(visibleWidth(rule)).toBe(24);
});

test("panel states keep per-role border identity", () => {
  const user = panelStyle("user", "idle");
  const assistant = panelStyle("assistant", "idle");
  const tool = panelStyle("tool", "idle");
  expect(user.paint.border("x")).not.toBe(assistant.paint.border("x"));
  expect(assistant.paint.border("x")).not.toBe(tool.paint.border("x"));
  expect(user.paint.border("x")).not.toBe(tool.paint.border("x"));
});

test("running state does not collapse border to a global role color", () => {
  const user = panelStyle("user", "running", { frame: 0 });
  const assistant = panelStyle("assistant", "running", { frame: 0 });
  expect(user.paint.border("x")).not.toBe(assistant.paint.border("x"));
});

test("running pulse changes with animation frame", () => {
  const a = panelStyle("tool", "running", { frame: 1 }).paint.pulse("x");
  const b = panelStyle("tool", "running", { frame: 5 }).paint.pulse("x");
  expect(a).not.toBe(b);
});
