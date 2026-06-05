// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { renderThemeJson, renderTokensCss } from "../../scripts/build-tokens.ts";
import { COLOR, hexToRgb, TERMINAL_ROLE_PALETTES } from "./tokens.ts";

const root = process.cwd();

test("design/tokens.css is generated from tokens.ts (run npm run build:tokens)", () => {
  const onDisk = readFileSync(join(root, "design/tokens.css"), "utf8");
  expect(onDisk).toBe(renderTokensCss());
});

test("themes/nazar.json is generated from tokens.ts (run npm run build:tokens)", () => {
  const onDisk = readFileSync(join(root, "themes/nazar.json"), "utf8");
  expect(onDisk).toBe(renderThemeJson());
});

test("hexToRgb parses 6- and 3-digit hex", () => {
  expect(hexToRgb("#f2c14e")).toEqual([242, 193, 78]);
  expect(hexToRgb("#fff")).toEqual([255, 255, 255]);
});

test("terminal role palettes are distinct per role", () => {
  const borders = Object.values(TERMINAL_ROLE_PALETTES).map((p) => p.border.join(","));
  expect(new Set(borders).size).toBe(borders.length);
});

test("canonical brand colours come from the token source of truth", () => {
  expect(COLOR.gold).toBe("#f2c14e");
  expect(COLOR.teal).toBe("#2dd4bf");
});

test("web/index.html inline token block is in sync with tokens.ts (run npm run build:tokens)", async () => {
  const { renderWebInlineCss } = await import("../../scripts/build-tokens.ts");
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const html = readFileSync(join(process.cwd(), "web/index.html"), "utf8");
  const START = "/* GENERATED TOKENS START */";
  const END   = "/* GENERATED TOKENS END */";
  const startIdx = html.indexOf(START);
  const endIdx = html.indexOf(END);
  expect(startIdx, "web/index.html is missing GENERATED TOKENS START marker").toBeGreaterThan(-1);
  expect(endIdx,   "web/index.html is missing GENERATED TOKENS END marker").toBeGreaterThan(-1);
  const current = html.slice(startIdx + START.length, endIdx).trim();
  const expected = renderWebInlineCss().trim();
  expect(current).toBe(expected);
});
