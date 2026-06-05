// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { MIN_KITTY_VERSION, terminalExperienceNotice } from "./terminal-experience.ts";

test("terminalExperienceNotice is quiet for modern kitty with Departure Mono", () => {
  expect(terminalExperienceNotice({
    KITTY_WINDOW_ID: "1",
    TERM_PROGRAM_VERSION: MIN_KITTY_VERSION,
    COLORTERM: "truecolor",
    TERM: "xterm-kitty",
    NAZAR_TERMINAL_FONT: "Departure Mono",
  })).toBeUndefined();
});

test("terminalExperienceNotice suggests kitty and Departure Mono when missing", () => {
  const notice = terminalExperienceNotice({
    TERM_PROGRAM: "xterm",
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    NAZAR_TERMINAL_FONT: "JetBrains Mono",
  });

  expect(notice).toContain("use kitty");
  expect(notice).toContain("https://departuremono.com/");
});

test("terminalExperienceNotice flags old kitty versions and legacy ANSI", () => {
  const notice = terminalExperienceNotice({
    KITTY_WINDOW_ID: "1",
    KITTY_VERSION: "0.20.0",
    TERM: "dumb",
    NAZAR_TERMINAL_FONT: "Departure Mono",
  });

  expect(notice).toContain("upgrade kitty 0.20.0");
  expect(notice).toContain("modern truecolor ANSI terminal");
});
