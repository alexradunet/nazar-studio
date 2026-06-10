// SPDX-License-Identifier: AGPL-3.0-or-later
import { Agent } from "@earendil-works/pi-agent-core";
import { getModel, type Model } from "@earendil-works/pi-ai";
import { runtimeEnv } from "../env.ts";
import { getBalaurApiKey } from "./auth.ts";
import { createBalaurLlamaCppModel, createBalaurLlamaCppProvider, DEFAULT_BALAUR_LLAMA_CPP_MODEL_REF, isBalaurLlamaCppModel, BALAUR_LLAMA_CPP_PROVIDER } from "./llama-cpp-provider.ts";
import { loadMasterMessages } from "./master-conversation.ts";
import { balaurTools } from "./balaur-tools.ts";
import { skillIndexBlock } from "./skills.ts";

export interface BalaurPiCoreAgentOptions {
  model?: Model<any>;
  modelRef?: string;
  onStatus?: (text: string) => void;
  systemPrompt?: string;
  sessionId?: string;
}

export interface BalaurPiCoreRuntime {
  agent: Agent;
  close: () => void;
}

export type BalaurPiCoreRuntimeOptions = BalaurPiCoreAgentOptions;

export function balaurSystemPrompt(): string {
  return `You are Balaur, a sovereign local-first personal agent.
Be concise, calm, and technically precise.
Use vault_search when saved vault context could help.
Use vault_write only when the user explicitly asks you to remember/save/write something or confirms it should persist.
When the user shares life, food, sport, or health details, treat them as part of the conversation unless they explicitly ask you to save them to the vault.
You are running as a Balaur-owned runtime process, not inside the Pi coding-agent UI.${skillIndexBlock()}`;
}

function parseModelRef(ref: string): { provider: string; id: string } {
  const slash = ref.indexOf("/");
  if (slash <= 0 || slash === ref.length - 1) {
    throw new Error(`Invalid model reference "${ref}". Use provider/model, e.g. anthropic/claude-sonnet-4-20250514.`);
  }
  return { provider: ref.slice(0, slash), id: ref.slice(slash + 1) };
}

export function resolveBalaurModel(modelRef = runtimeEnv().BALAUR_MODEL ?? DEFAULT_BALAUR_LLAMA_CPP_MODEL_REF): Model<any> {
  const { provider, id } = parseModelRef(modelRef);
  if (provider === BALAUR_LLAMA_CPP_PROVIDER) return createBalaurLlamaCppModel(id);
  const model = getModel(provider as never, id as never);
  if (!model) throw new Error(`Unknown model "${modelRef}". Set BALAUR_MODEL=provider/model.`);
  return model;
}

export function createBalaurPiCoreAgent(options: BalaurPiCoreAgentOptions = {}): Agent {
  const model = options.model ?? resolveBalaurModel(options.modelRef);
  const provider = isBalaurLlamaCppModel(model) ? createBalaurLlamaCppProvider({ model, cli: false, onStatus: options.onStatus }) : undefined;
  return new Agent({
    initialState: {
      systemPrompt: options.systemPrompt ?? balaurSystemPrompt(),
      model,
      thinkingLevel: "off",
      tools: [...balaurTools],
      messages: loadMasterMessages(),
    },
    streamFn: provider?.stream,
    sessionId: options.sessionId,
    getApiKey: getBalaurApiKey,
  });
}

export async function createBalaurPiCoreRuntime(options: BalaurPiCoreRuntimeOptions = {}): Promise<BalaurPiCoreRuntime> {
  const model = options.model ?? resolveBalaurModel(options.modelRef);
  const provider = isBalaurLlamaCppModel(model) ? createBalaurLlamaCppProvider({ model, onStatus: options.onStatus }) : undefined;
  await provider?.prepare();
  const agent = new Agent({
    initialState: {
      systemPrompt: options.systemPrompt ?? balaurSystemPrompt(),
      model,
      thinkingLevel: "off",
      tools: [...balaurTools],
      messages: loadMasterMessages(),
    },
    streamFn: provider?.stream,
    sessionId: options.sessionId,
    getApiKey: getBalaurApiKey,
  });
  return {
    agent,
    close: () => {
      agent.abort();
      void provider?.close();
    },
  };
}
