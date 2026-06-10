// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "bun:test";
import { TUI_THEME } from "./theme.ts";

test("TUI theme keeps compact sextant avatar defaults", () => {
  expect(TUI_THEME.avatar.mode).toBe("sextant");
  expect(TUI_THEME.avatar.assistantRows).toBeLessThan(TUI_THEME.avatar.identityRows);
  expect(TUI_THEME.avatar.userRows).toBe(TUI_THEME.avatar.assistantRows);
  expect(TUI_THEME.color.title).toMatch(/^#/);
  expect(TUI_THEME.label.assistant).toBe("Balaur");
});
