// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "bun:test";
import { isSlashCommandInput, parseLocalCommand, suggestLocalCommands, TUI_COMMAND_HELP } from "./commands.ts";

test("parses local TUI commands", () => {
  expect(parseLocalCommand("/help")).toEqual({ command: "help" });
  expect(parseLocalCommand(" /clear ")).toEqual({ command: "clear" });
  expect(parseLocalCommand("/quit")).toEqual({ command: "exit" });
  expect(parseLocalCommand("/model")).toEqual({ command: "model" });
  expect(parseLocalCommand("/model download")).toBeUndefined();
  expect(parseLocalCommand("/branch work")).toBeUndefined();
});

test("help includes commands and shortcuts", () => {
  expect(TUI_COMMAND_HELP).toContain("/clear");
  expect(TUI_COMMAND_HELP).toContain("Ctrl+U");
  expect(TUI_COMMAND_HELP).toContain("Ctrl+A");
});

test("suggests visible commands from slash input", () => {
  expect(suggestLocalCommands("/").map((entry) => entry.command)).toEqual([
    "/help",
    "/clear",
    "/model",
    "/branch <title>",
    "/merge",
    "/branches",
    "/skill:name",
    "/exit",
  ]);
  expect(suggestLocalCommands("   /cl").map((entry) => entry.command)).toEqual(["/clear"]);
  expect(suggestLocalCommands("/model d")).toEqual([]);
  expect(suggestLocalCommands("/branch work").map((entry) => entry.command)).toEqual(["/branch <title>"]);
  expect(suggestLocalCommands("/skill:foo").map((entry) => entry.command)).toEqual(["/skill:name"]);
  expect(suggestLocalCommands("/exit").map((entry) => entry.display)).toEqual(["/exit"]);
  expect(suggestLocalCommands("/quit").map((entry) => entry.command)).toEqual(["/exit"]);
  expect(suggestLocalCommands("/quit").map((entry) => entry.display)).toEqual(["/quit"]);
  expect(suggestLocalCommands("/wat")).toEqual([]);
  expect(suggestLocalCommands("hello")).toEqual([]);
});

test("detects slash command input", () => {
  expect(isSlashCommandInput("/")).toBe(true);
  expect(isSlashCommandInput("   /cl")).toBe(true);
  expect(isSlashCommandInput("hello /")).toBe(false);
});
