// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { terminalExperienceNotice } from "./terminal-experience.ts";

test("terminalExperienceNotice is quiet for truecolor ANSI with Iosevka", () => {
  expect(terminalExperienceNotice({
    TERM_PROGRAM: "ghostty",
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    NAZAR_TERMINAL_FONT: "Iosevka Term",
  })).toBeUndefined();
});

test("terminalExperienceNotice suggests truecolor ANSI and Iosevka when missing", () => {
  const notice = terminalExperienceNotice({
    TERM: "dumb",
  });

  expect(notice).toContain("modern truecolor ANSI terminal");
  expect(notice).toContain("Iosevka Term");
});

test("terminalExperienceNotice accepts TERMINAL_FONT", () => {
  expect(terminalExperienceNotice({
    TERM: "xterm-256color",
    TERMINAL_FONT: "IosevkaTerm Nerd Font",
  })).toBeUndefined();
});
