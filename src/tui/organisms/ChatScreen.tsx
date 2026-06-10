// SPDX-License-Identifier: AGPL-3.0-or-later
import { Box } from "ink";
import type { RuntimeSessionState } from "../../../lib/runtime/events.ts";
import type { ChatState } from "../../../lib/tui/chat-state.ts";
import { TUI_THEME } from "../../../lib/tui/theme.ts";
import { ChatLineView } from "../molecules/ChatLineView.tsx";
import { Composer } from "../molecules/Composer.tsx";
import { BalaurIdentity } from "../molecules/BalaurIdentity.tsx";
import { SessionStatusStrip } from "../molecules/SessionStatusStrip.tsx";

export function ChatScreen({ assistantAvatar, identityAvatar, session, state, userAvatar }: { assistantAvatar: string[]; identityAvatar: string[]; session: RuntimeSessionState; state: ChatState; userAvatar: string[] }) {
  return (
    <Box flexDirection="column" paddingX={TUI_THEME.spacing.screenPaddingX} width="100%">
      <BalaurIdentity avatar={identityAvatar} />
      <Box flexDirection="column" flexGrow={1}>
        {state.lines.map((line) => <ChatLineView key={line.id} assistantAvatar={assistantAvatar} line={line} userAvatar={userAvatar} />)}
      </Box>
      <SessionStatusStrip state={session} />
      <Composer composer={state.composer} />
    </Box>
  );
}
