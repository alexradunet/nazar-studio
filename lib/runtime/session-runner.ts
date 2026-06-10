// SPDX-License-Identifier: AGPL-3.0-or-later
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import {
  appendBranchMessage,
  appendMasterMessage,
  createBranch,
  loadConversation,
  loadMasterMessages,
  mergeBranchSummary,
  type ConversationBranch,
} from "./conversation-store.ts";
import { createEventBus, type InboundMessage, type OutboundMessage, type RuntimeSessionState, type RuntimeSource, type StatusNotice, type ToolNotice } from "./events.ts";
import { createBalaurAgent } from "./agent-engine.ts";
import { expandSkillCommand } from "./skills.ts";

export interface BalaurRuntimeOptions {
  onStartupStatus?: (text: string) => void;
  startupSignal?: AbortSignal;
}

export interface BalaurRuntime {
  bus: ReturnType<typeof createEventBus>;
  getState: () => RuntimeSessionState;
  close: () => void;
}

function textFromMessage(message: AgentMessage): string {
  if (message.role !== "assistant") return "";
  return message.content.flatMap((block) => block.type === "text" ? [block.text] : []).join("");
}

type RuntimeTarget = { source: RuntimeSource; sourceId: string };

const TERMINAL_TARGET: RuntimeTarget = { source: "terminal", sourceId: "local" };

export async function createBalaurRuntime(_options: BalaurRuntimeOptions = {}): Promise<BalaurRuntime> {
  const bus = createEventBus();
  let activeBranch: ConversationBranch | null = null;
  let captureAssistantText: string[] | null = null;
  let activeTarget: RuntimeTarget = TERMINAL_TARGET;
  let streaming = false;

  const status = (target: RuntimeTarget, text: string): void => {
    void bus.publish("status", { source: target.source, sourceId: target.sourceId, text } satisfies StatusNotice);
  };

  const agent = createBalaurAgent({ onStatus: (text) => status(activeTarget, text) });

  const runtimeState = (): RuntimeSessionState => ({
    conversation: activeBranch ? "branch" : "master",
    ...(activeBranch ? { branchTitle: activeBranch.title } : {}),
    streaming,
  });

  const publishState = (): void => {
    void bus.publish("state", runtimeState());
  };

  const runAgentPrompt = async (target: RuntimeTarget, prompt: string): Promise<void> => {
    activeTarget = target;
    streaming = true;
    publishState();
    try {
      await agent.prompt(prompt);
    } finally {
      streaming = false;
      publishState();
    }
  };

  const persist = (message: AgentMessage): void => {
    if (message.role !== "user" && message.role !== "assistant" && message.role !== "toolResult") return;
    if (activeBranch) appendBranchMessage(activeBranch, message);
    else appendMasterMessage(message);
  };

  agent.subscribe((event) => {
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      captureAssistantText?.push(event.assistantMessageEvent.delta);
      void bus.publish("outbound", {
        source: activeTarget.source,
        sourceId: activeTarget.sourceId,
        text: event.assistantMessageEvent.delta,
      } satisfies OutboundMessage);
    }
    if (event.type === "message_update" && event.assistantMessageEvent.type === "error") {
      void bus.publish("outbound", {
        source: activeTarget.source,
        sourceId: activeTarget.sourceId,
        text: `\n[error] ${event.assistantMessageEvent.error.errorMessage ?? "model request failed"}\n`,
      } satisfies OutboundMessage);
    }
    if (event.type === "message_end" && event.message.role === "assistant") {
      if (!captureAssistantText?.length) captureAssistantText?.push(textFromMessage(event.message));
      if (event.message.errorMessage) {
        void bus.publish("outbound", {
          source: activeTarget.source,
          sourceId: activeTarget.sourceId,
          text: `\n[error] ${event.message.errorMessage}\n`,
        } satisfies OutboundMessage);
      }
    }
    if (event.type === "message_end") persist(event.message);
    if (event.type === "tool_execution_start") {
      void bus.publish("tool", {
        source: activeTarget.source,
        sourceId: activeTarget.sourceId,
        toolName: event.toolName,
      } satisfies ToolNotice);
    }
  });

  const compactAndMerge = async (target: RuntimeTarget): Promise<void> => {
    if (!activeBranch) {
      status(target, "No active sub-conversation. Start one with /branch <title>.");
      return;
    }
    if (agent.state.isStreaming) {
      status(target, "Wait for the current answer before merging.");
      return;
    }

    const branch = activeBranch;
    const branchMessages = loadConversation(branch.path, 120);
    if (!branchMessages.length) {
      status(target, `Sub-conversation "${branch.title}" is empty; nothing to merge.`);
      activeBranch = null;
      publishState();
      return;
    }

    captureAssistantText = [];
    const transcript = branchMessages.map((m) => `${m.role}: ${m.role === "assistant" ? textFromMessage(m) : "content" in m ? String(m.content) : ""}`).join("\n\n");
    await runAgentPrompt(target, `Compact this finished sub-conversation into a concise merge summary for the master life conversation. Preserve decisions, commitments, preferences, and next actions. Do not mention that you are compacting unless useful.\n\n${transcript}`);
    const summary = captureAssistantText.join("").trim();
    captureAssistantText = null;

    if (!summary) {
      status(target, `Could not compact "${branch.title}"; branch remains active.`);
      return;
    }

    mergeBranchSummary({ branch, summary });
    activeBranch = null;
    agent.state.messages = loadMasterMessages();
    publishState();
    status(target, `Merged sub-conversation "${branch.title}" into master.`);
  };

  const handleCommand = async (text: string, target: RuntimeTarget): Promise<boolean> => {
    if (text.startsWith("/branch ")) {
      if (activeBranch) {
        status(target, `Already in sub-conversation "${activeBranch.title}". Use /merge before starting another.`);
        return true;
      }
      activeBranch = createBranch(text.slice("/branch ".length).trim());
      agent.state.messages = loadMasterMessages();
      publishState();
      status(target, `Started sub-conversation "${activeBranch.title}". Use /merge to compact it back into master.`);
      return true;
    }
    if (text === "/merge") {
      await compactAndMerge(target);
      return true;
    }
    if (text === "/branches") {
      status(target, activeBranch ? `Active sub-conversation: ${activeBranch.title}` : "No active sub-conversation.");
      return true;
    }
    return false;
  };

  bus.on("inbound", async (event: InboundMessage) => {
    const raw = event.text.trim();
    if (!raw) return;
    const target = { source: event.source, sourceId: event.sourceId };
    if (await handleCommand(raw, target)) return;

    const text = expandSkillCommand(raw);
    if (agent.state.isStreaming || streaming) {
      agent.followUp({ role: "user", content: text, timestamp: Date.now() });
      return;
    }
    await runAgentPrompt(target, text);
  });

  return {
    bus,
    getState: runtimeState,
    close: () => {
      agent.abort();
      streaming = false;
      publishState();
    },
  };
}
