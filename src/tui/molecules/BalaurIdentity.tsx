// SPDX-License-Identifier: AGPL-3.0-or-later
import { Box, Text } from "ink";
import { TUI_THEME } from "../../../lib/tui/theme.ts";
import { AvatarArt } from "../atoms/AvatarArt.tsx";

export function BalaurIdentity({ avatar }: { avatar: string[] }) {
  return (
    <Box marginBottom={1}>
      <AvatarArt lines={avatar} />
      <Box flexDirection="column">
        <Text color={TUI_THEME.color.title} bold>Balaur</Text>
        <Text color={TUI_THEME.color.muted}>sovereign local-first life agent</Text>
        <Text color={TUI_THEME.color.steel}>vault · skills · one life conversation</Text>
      </Box>
    </Box>
  );
}
