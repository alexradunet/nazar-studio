// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "bun:test";
import { renderAvatar, renderToolAvatar } from "./avatar.ts";

test("renders Balaur avatar with sextant and octant ANSI mosaics", () => {
  const sextant = renderAvatar("balaur", { rows: 3, mode: "sextant" });
  const octant = renderAvatar("balaur", { rows: 3, mode: "octant" });

  expect(sextant).toHaveLength(3);
  expect(octant).toHaveLength(3);
  expect(sextant.join("\n")).toContain("\x1b[38;2;");
  expect(octant.join("\n")).toContain("\x1b[38;2;");
});

test("renders user and tool avatars", () => {
  const user = renderAvatar("user", { rows: 3, mode: "sextant" });
  const tool = renderToolAvatar("vault_search", { rows: 3, mode: "sextant" });

  expect(user).toHaveLength(3);
  expect(tool).toHaveLength(3);
  expect(tool.join("\n")).toContain("\x1b[38;2;");
});
