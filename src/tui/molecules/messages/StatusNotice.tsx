// SPDX-License-Identifier: AGPL-3.0-or-later
import { Text } from "ink";
import type { ChatLine } from "../../../../lib/tui/chat-state.ts";
import { TUI_THEME } from "../../../../lib/tui/theme.ts";

export function StatusNotice({ line }: { line: ChatLine }) {
  return (
    <Text color={TUI_THEME.color.status} dimColor wrap="wrap">
      • {TUI_THEME.label.status} · {line.text}
    </Text>
  );
}
