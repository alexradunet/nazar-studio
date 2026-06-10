// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "bun:test";
import { AVATAR_FIELDS, COLOR, hexToRgb } from "./tokens.ts";

test("design tokens expose React-compatible hex and avatar RGB fields", () => {
  expect(COLOR.teal).toMatch(/^#[0-9a-f]{6}$/i);
  expect(hexToRgb(COLOR.gold)).toEqual([242, 193, 78]);
  expect(AVATAR_FIELDS.balaur).toHaveLength(3);
});
