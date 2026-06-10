// SPDX-License-Identifier: AGPL-3.0-or-later
export type LocalCommand = "help" | "clear" | "exit" | "model";

export interface TuiCommandSuggestion {
  command: string;
  description: string;
  display: string;
}

type CommandHelpEntry = {
  command: string;
  help: string;
  aliases?: readonly string[];
};

type CommandSuggestionEntry = {
  match: string;
  suggestion: TuiCommandSuggestion;
};

const TUI_VISIBLE_COMMANDS: readonly CommandHelpEntry[] = [
  { command: "/help", help: "show commands and shortcuts" },
  { command: "/clear", help: "clear the visible chat" },
  { command: "/model", help: "show current model/provider" },
  { command: "/branch <title>", help: "start a focused sub-conversation" },
  { command: "/merge", help: "compact active branch into master" },
  { command: "/branches", help: "show branch state" },
  { command: "/skill:name", help: "apply a Markdown skill" },
  { command: "/exit", help: "quit", aliases: ["/quit"] },
];

const TUI_COMMAND_SHORTCUTS = [
  "Shortcuts:",
  "  Enter                 send",
  "  Ctrl+C / Ctrl+D       quit",
  "  Ctrl+L                clear visible chat",
  "  Ctrl+U                clear input",
  "  Ctrl+A / Ctrl+E       move to start/end",
  "  ← / →                 move cursor",
  "  Backspace / Delete    edit at cursor",
].join("\n");

const TUI_COMMAND_SUGGESTIONS = TUI_VISIBLE_COMMANDS.map((entry) => toSuggestionEntry(entry.command, entry.command, entry.help));

const TUI_COMMAND_ALIAS_SUGGESTIONS = TUI_VISIBLE_COMMANDS.flatMap((entry) =>
  entry.aliases?.map((alias) => toSuggestionEntry(entry.command, alias, entry.help)) ?? [],
);

export interface ParsedLocalCommand {
  command: LocalCommand;
}

export const TUI_COMMAND_HELP = [
  "Commands:",
  ...TUI_VISIBLE_COMMANDS.map((entry) => `  ${entry.command.padEnd(21)}${entry.help}`),
  "",
  TUI_COMMAND_SHORTCUTS,
].join("\n");

function toSuggestionEntry(command: string, display: string, description: string): CommandSuggestionEntry {
  return { match: display, suggestion: { command, description, display } };
}

export function isSlashCommandInput(text: string): boolean {
  return text.trimStart().startsWith("/");
}

export function suggestLocalCommands(text: string): TuiCommandSuggestion[] {
  const trimmed = text.trimStart();
  if (!isSlashCommandInput(trimmed)) return [];
  if (trimmed === "/") return TUI_COMMAND_SUGGESTIONS.map((entry) => entry.suggestion);
  const suggestions = [...TUI_COMMAND_SUGGESTIONS, ...TUI_COMMAND_ALIAS_SUGGESTIONS];
  return suggestions.filter((entry) => matchesSuggestion(trimmed, entry.match)).map((entry) => entry.suggestion);
}

function matchesSuggestion(input: string, command: string): boolean {
  if (command.startsWith(input)) return true;
  const placeholderIndex = command.indexOf("<");
  if (placeholderIndex >= 0) {
    return input.startsWith(command.slice(0, placeholderIndex).trimEnd());
  }
  const colonIndex = command.indexOf(":");
  return colonIndex >= 0 && input.startsWith(command.slice(0, colonIndex + 1));
}

export function parseLocalCommand(text: string): ParsedLocalCommand | undefined {
  const trimmed = text.trim();
  if (trimmed === "/help") return { command: "help" };
  if (trimmed === "/clear") return { command: "clear" };
  if (trimmed === "/exit" || trimmed === "/quit") return { command: "exit" };
  if (trimmed === "/model") return { command: "model" };
  return undefined;
}
