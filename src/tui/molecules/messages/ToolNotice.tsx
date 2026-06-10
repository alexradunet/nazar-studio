// SPDX-License-Identifier: AGPL-3.0-or-later
import { Text } from "ink";
import type { ChatLine } from "../../../../lib/tui/chat-state.ts";
import { TUI_THEME } from "../../../../lib/tui/theme.ts";

export function ToolNotice({ line }: { line: ChatLine }) {
  return (
    <Text color={TUI_THEME.color.tool} dimColor wrap="wrap">
      • {TUI_THEME.label.tool} · {line.text}
    </Text>
  );
}
