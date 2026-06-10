// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ChatLine } from "../../../lib/tui/chat-state.ts";
import { AssistantMessage } from "./messages/AssistantMessage.tsx";
import { StatusNotice } from "./messages/StatusNotice.tsx";
import { ToolNotice } from "./messages/ToolNotice.tsx";
import { UserMessage } from "./messages/UserMessage.tsx";

export function ChatLineView({ assistantAvatar, line, userAvatar }: { assistantAvatar: string[]; line: ChatLine; userAvatar: string[] }) {
  if (line.kind === "assistant") return <AssistantMessage avatar={assistantAvatar} line={line} />;
  if (line.kind === "user") return <UserMessage avatar={userAvatar} line={line} />;
  if (line.kind === "tool") return <ToolNotice line={line} />;
  return <StatusNotice line={line} />;
}
