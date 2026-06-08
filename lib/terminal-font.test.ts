// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { defaultKittyConfigPath, isIosevkaFontName, octantGlyphTestCommand, terminalKind, upsertKittyFontConfig } from "./terminal-font.ts";

test("terminalKind detects Kitty", () => {
  expect(terminalKind({ TERM: "xterm-kitty" })).toBe("kitty");
  expect(terminalKind({ KITTY_WINDOW_ID: "1" })).toBe("kitty");
  expect(terminalKind({ TERM_PROGRAM: "kitty" })).toBe("kitty");
  expect(terminalKind({ TERM: "xterm-256color" })).toBe("unknown");
});

test("defaultKittyConfigPath follows XDG_CONFIG_HOME", () => {
  expect(defaultKittyConfigPath({ HOME: "/home/alex" })).toBe("/home/alex/.config/kitty/kitty.conf");
  expect(defaultKittyConfigPath({ HOME: "/home/alex", XDG_CONFIG_HOME: "/tmp/cfg" })).toBe("/tmp/cfg/kitty/kitty.conf");
});

test("isIosevkaFontName accepts common variants", () => {
  expect(isIosevkaFontName("Iosevka Term")).toBe(true);
  expect(isIosevkaFontName("IosevkaTerm Nerd Font")).toBe(true);
  expect(isIosevkaFontName("Departure Mono")).toBe(false);
});

test("upsertKittyFontConfig creates Nazar font directives", () => {
  const result = upsertKittyFontConfig("include theme.conf\n");
  expect(result.changed).toBe(true);
  expect(result.content).toContain("font_family Iosevka Term");
  expect(result.content).toContain("symbol_map U+1CC00-U+1CEBF,U+1FB00-U+1FBFF Iosevka Term");
});

test("upsertKittyFontConfig replaces existing active directives but preserves comments", () => {
  const result = upsertKittyFontConfig("# font_family Hack\nfont_family Hack\nsymbol_map U+1CD00-U+1CDEF Hack\n");
  expect(result.content).toContain("# font_family Hack");
  expect(result.content).toContain("font_family Iosevka Term");
  expect(result.content).toContain("symbol_map U+1CC00-U+1CEBF,U+1FB00-U+1FBFF Iosevka Term");
});

test("octantGlyphTestCommand prints Unicode escapes", () => {
  expect(octantGlyphTestCommand()).toContain("1CD00");
});
