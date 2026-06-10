// SPDX-License-Identifier: AGPL-3.0-or-later
import { Text } from "ink";
import { TUI_THEME } from "../../../lib/tui/theme.ts";

export function PromptGlyph() {
  return <Text color={TUI_THEME.color.prompt}>› </Text>;
}
