// SPDX-License-Identifier: AGPL-3.0-or-later
import { Box, Text } from "ink";
import { TUI_THEME } from "../../../lib/tui/theme.ts";

export function AvatarArt({ lines }: { lines: string[] }) {
  return (
    <Box flexDirection="column" marginRight={TUI_THEME.spacing.avatarGap}>
      {lines.map((line, index) => <Text key={index}>{line}</Text>)}
    </Box>
  );
}
