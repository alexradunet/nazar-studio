// SPDX-License-Identifier: AGPL-3.0-or-later
import { Box, Text } from "ink";
import type { ChatLine } from "../../../../lib/tui/chat-state.ts";
import { TUI_THEME } from "../../../../lib/tui/theme.ts";
import { AvatarArt } from "../../atoms/AvatarArt.tsx";

export function AssistantMessage({ avatar, line }: { avatar: string[]; line: ChatLine }) {
  return (
    <Box marginBottom={TUI_THEME.spacing.messageGap}>
      <AvatarArt lines={avatar} />
      <Box flexDirection="column" flexGrow={1} flexShrink={1}>
        <Text color={TUI_THEME.color.assistantLabel} bold>{TUI_THEME.label.assistant}</Text>
        <Text color={TUI_THEME.color.assistant} wrap="wrap">{line.text}</Text>
      </Box>
    </Box>
  );
}
