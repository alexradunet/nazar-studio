// SPDX-License-Identifier: AGPL-3.0-or-later
import { Box, Text } from "ink";
import type { RuntimeSessionState } from "../../../lib/runtime/events.ts";
import { formatRuntimeSessionState } from "../../../lib/tui/session-status.ts";
import { TUI_THEME } from "../../../lib/tui/theme.ts";

export function SessionStatusStrip({ state }: { state: RuntimeSessionState }) {
  return (
    <Box marginTop={1}>
      <Text color={TUI_THEME.color.muted} dimColor wrap="truncate-end">{formatRuntimeSessionState(state)}</Text>
    </Box>
  );
}
