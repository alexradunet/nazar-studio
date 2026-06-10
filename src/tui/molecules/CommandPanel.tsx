// SPDX-License-Identifier: AGPL-3.0-or-later
import { Box, Text } from "ink";
import { isSlashCommandInput, suggestLocalCommands } from "../../../lib/tui/commands.ts";
import { TUI_THEME } from "../../../lib/tui/theme.ts";

export function CommandPanel({ input }: { input: string }) {
  if (!isSlashCommandInput(input)) return null;

  const suggestions = suggestLocalCommands(input);
  const query = input.trimStart();
  const title = query === "/" ? "Commands" : `Commands matching ${query}`;
  return (
    <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor={TUI_THEME.color.steel} paddingX={1}>
      <Text color={TUI_THEME.color.steel}>{title}</Text>
      {suggestions.length ? suggestions.map((entry) => (
        <Box key={entry.display}>
          <Box width={23}>
            <Text color={TUI_THEME.color.prompt}>{entry.display}</Text>
          </Box>
          <Text color={TUI_THEME.color.muted}>{entry.description}</Text>
        </Box>
      )) : <Text color={TUI_THEME.color.muted}>No matching commands</Text>}
    </Box>
  );
}
