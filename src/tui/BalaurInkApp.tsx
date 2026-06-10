// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useMemo, useState } from "react";
import { useApp, useInput } from "ink";
import { renderAvatar } from "../../lib/avatar/avatar.ts";
import {
  appendAssistantDelta,
  appendDraft,
  appendStatusLine,
  appendToolLine,
  appendUserLine,
  backspaceDraft,
  clearChatLines,
  clearDraft,
  deleteDraft,
  initialChatState,
  moveDraftCursor,
  moveDraftEnd,
  moveDraftHome,
  type ChatState,
} from "../../lib/tui/chat-state.ts";
import type { RuntimeSessionState } from "../../lib/runtime/events.ts";
import { formatBalaurModelStatus, getBalaurModelStatus } from "../../lib/runtime/model-status.ts";
import type { BalaurRuntime } from "../../lib/runtime/session-runner.ts";
import { parseLocalCommand, TUI_COMMAND_HELP } from "../../lib/tui/commands.ts";
import { TUI_THEME } from "../../lib/tui/theme.ts";
import { ChatScreen } from "./organisms/ChatScreen.tsx";

export function BalaurInkApp({ runtime }: { runtime: BalaurRuntime }) {
  const { exit } = useApp();
  const identityAvatar = useMemo(() => renderAvatar("balaur", { rows: TUI_THEME.avatar.identityRows, mode: TUI_THEME.avatar.mode }), []);
  const assistantAvatar = useMemo(() => renderAvatar("balaur", { rows: TUI_THEME.avatar.assistantRows, mode: TUI_THEME.avatar.mode }), []);
  const userAvatar = useMemo(() => renderAvatar("user", { rows: TUI_THEME.avatar.userRows, mode: TUI_THEME.avatar.mode }), []);
  const modelStatus = useMemo(() => getBalaurModelStatus(), []);
  const [session, setSession] = useState<RuntimeSessionState>(() => runtime.getState());
  const [state, setState] = useState<ChatState>(() => appendStatusLine(initialChatState(), formatBalaurModelStatus(modelStatus)));

  useEffect(() => {
    const offOut = runtime.bus.on("outbound", (event) => {
      setState((prev) => appendAssistantDelta(prev, event.text));
    });
    const offTool = runtime.bus.on("tool", (event) => {
      setState((prev) => appendToolLine(prev, event.toolName));
    });
    const offStatus = runtime.bus.on("status", (event) => {
      setState((prev) => appendStatusLine(prev, event.text));
    });
    const offState = runtime.bus.on("state", (event) => {
      setSession(event);
    });
    return () => {
      offOut();
      offTool();
      offStatus();
      offState();
    };
  }, [runtime]);

  useInput((value, key) => {
    if (key.ctrl && (value === "c" || value === "d")) {
      runtime.close();
      exit();
      return;
    }
    if (key.ctrl && value === "l") {
      setState((prev) => clearChatLines(prev));
      return;
    }
    if (key.ctrl && value === "u") {
      setState((prev) => clearDraft(prev));
      return;
    }
    if (key.ctrl && value === "a") {
      setState((prev) => moveDraftHome(prev));
      return;
    }
    if (key.ctrl && value === "e") {
      setState((prev) => moveDraftEnd(prev));
      return;
    }
    if (key.leftArrow) {
      setState((prev) => moveDraftCursor(prev, -1));
      return;
    }
    if (key.rightArrow) {
      setState((prev) => moveDraftCursor(prev, 1));
      return;
    }
    if (key.return) {
      const text = state.composer.text.trim();
      setState((prev) => clearDraft(prev));
      if (!text) return;

      const local = parseLocalCommand(text);
      if (local?.command === "exit") {
        runtime.close();
        exit();
        return;
      }
      if (local?.command === "clear") {
        setState((prev) => clearChatLines(prev));
        return;
      }
      if (local?.command === "help") {
        setState((prev) => appendStatusLine(prev, TUI_COMMAND_HELP));
        return;
      }
      if (local?.command === "model") {
        setState((prev) => appendStatusLine(prev, formatBalaurModelStatus(modelStatus)));
        return;
      }
      setState((prev) => appendUserLine(prev, text));
      void runtime.bus.publish("inbound", { source: "terminal", sourceId: "local", text });
      return;
    }
    if (key.backspace) {
      setState((prev) => backspaceDraft(prev));
      return;
    }
    if (key.delete) {
      setState((prev) => deleteDraft(prev));
      return;
    }
    if (!key.ctrl && !key.meta && value) setState((prev) => appendDraft(prev, value));
  });

  return <ChatScreen assistantAvatar={assistantAvatar} identityAvatar={identityAvatar} session={session} state={state} userAvatar={userAvatar} />;
}
