// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync } from "node:fs";
import { totalmem } from "node:os";
import { createAssistantMessageEventStream, type AssistantMessage, type Context, type Model, type SimpleStreamOptions, type Tool, type Usage } from "@earendil-works/pi-ai";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import { modelsDir } from "../paths.ts";
import { createModelDownloadProgressReporter } from "./download-progress.ts";

export const BALAUR_LLAMA_CPP_PROVIDER = "llama-cpp";
export const BALAUR_LLAMA_CPP_API = "balaur-llama-cpp";
export const DEFAULT_BALAUR_LLAMA_CPP_MODEL_URI = "hf:unsloth/gemma-4-12b-it-GGUF:UD-Q4_K_XL";
export const DEFAULT_BALAUR_LLAMA_CPP_MODEL_REF = `${BALAUR_LLAMA_CPP_PROVIDER}/${DEFAULT_BALAUR_LLAMA_CPP_MODEL_URI}`;
export const DEFAULT_BALAUR_LLAMA_CPP_CONTEXT_SIZE = 131072;
export const DEFAULT_BALAUR_LLAMA_CPP_MAX_TOKENS = 2048;
export const DEFAULT_BALAUR_LLAMA_CPP_MIN_RAM_BYTES = 16 * 1000 ** 3;

const EMPTY_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

interface NodeLlamaChatResponseFunctionCall {
  functionName: string;
  params: unknown;
  raw?: unknown;
}

interface NodeLlamaChatResponse {
  response: string;
  functionCalls?: NodeLlamaChatResponseFunctionCall[];
  metadata: { stopReason: string };
}

interface NodeLlamaChat {
  generateResponse: (history: LlamaChatHistoryItem[], options?: Record<string, unknown>) => Promise<NodeLlamaChatResponse>;
  dispose: (options?: { disposeSequence?: boolean }) => void;
}

interface NodeLlamaContext {
  getSequence: () => unknown;
  dispose?: () => Promise<void> | void;
}

interface NodeLlamaModel {
  createContext: (options?: Record<string, unknown>) => Promise<NodeLlamaContext>;
  dispose: () => Promise<void>;
}

type LlamaChatHistoryItem =
  | { type: "system"; text: string }
  | { type: "user"; text: string }
  | { type: "model"; response: LlamaChatModelResponseItem[] };

type LlamaChatModelResponseItem = string | {
  type: "functionCall";
  name: string;
  description?: string;
  params: unknown;
  result: unknown;
  rawCall?: unknown;
  startsNewChunk?: boolean;
};

interface LoadedLlamaCppRuntime {
  chat: NodeLlamaChat;
  context: NodeLlamaContext;
  model: NodeLlamaModel;
}

export interface BalaurLlamaCppProviderOptions {
  model: Model<any>;
  cli?: boolean;
  onStatus?: (text: string) => void;
}

export function createBalaurLlamaCppModel(modelUri = DEFAULT_BALAUR_LLAMA_CPP_MODEL_URI): Model<any> {
  const isDefault = modelUri === DEFAULT_BALAUR_LLAMA_CPP_MODEL_URI;
  return {
    id: modelUri,
    name: isDefault ? "Gemma 4 12B Instruct UD-Q4_K_XL" : modelUri,
    api: BALAUR_LLAMA_CPP_API,
    provider: BALAUR_LLAMA_CPP_PROVIDER,
    baseUrl: "local://node-llama-cpp",
    reasoning: true,
    thinkingLevelMap: { off: null, minimal: null, low: null, medium: null, high: null, xhigh: null },
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 262144,
    maxTokens: DEFAULT_BALAUR_LLAMA_CPP_MAX_TOKENS,
  };
}

export function isBalaurLlamaCppModel(model: Model<any>): boolean {
  return model.provider === BALAUR_LLAMA_CPP_PROVIDER && model.api === BALAUR_LLAMA_CPP_API;
}

export function assertBalaurLlamaCppRam(totalBytes = totalmem(), minBytes = DEFAULT_BALAUR_LLAMA_CPP_MIN_RAM_BYTES): void {
  if (totalBytes >= minBytes) return;
  const actualGb = (totalBytes / 1000 ** 3).toFixed(1);
  const requiredGb = (minBytes / 1000 ** 3).toFixed(0);
  throw new Error(`Balaur's default local model requires at least ${requiredGb}GB RAM; detected ${actualGb}GB.`);
}

export function resolveBalaurLlamaCppContextSize(env: NodeJS.ProcessEnv = process.env): number | "auto" {
  const raw = env.BALAUR_LLAMA_CPP_CONTEXT_SIZE?.trim();
  if (!raw) return DEFAULT_BALAUR_LLAMA_CPP_CONTEXT_SIZE;
  if (raw === "auto") return "auto";
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("BALAUR_LLAMA_CPP_CONTEXT_SIZE must be a positive integer or 'auto'.");
  }
  return parsed;
}

export function resolveBalaurLlamaCppMaxTokens(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.BALAUR_LLAMA_CPP_MAX_TOKENS?.trim();
  if (!raw) return DEFAULT_BALAUR_LLAMA_CPP_MAX_TOKENS;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("BALAUR_LLAMA_CPP_MAX_TOKENS must be a positive integer.");
  }
  return parsed;
}

export function llamaFunctionsFromTools(tools: Tool[] | undefined): Record<string, { description?: string; params?: unknown }> | undefined {
  if (!tools?.length) return undefined;
  const functions: Record<string, { description?: string; params?: unknown }> = {};
  for (const tool of tools) {
    functions[tool.name] = {
      description: tool.description,
      params: JSON.parse(JSON.stringify(tool.parameters)),
    };
  }
  return functions;
}

export function llamaChatHistoryFromContext(context: Context): LlamaChatHistoryItem[] {
  const toolResults = new Map<string, unknown>();
  for (const message of context.messages) {
    if (message.role !== "toolResult") continue;
    toolResults.set(message.toolCallId, message.details ?? textFromContent(message.content));
  }

  const history: LlamaChatHistoryItem[] = [];
  if (context.systemPrompt?.trim()) history.push({ type: "system", text: context.systemPrompt });

  for (const message of context.messages) {
    if (message.role === "user") {
      history.push({ type: "user", text: typeof message.content === "string" ? message.content : textFromContent(message.content) });
      continue;
    }
    if (message.role === "assistant") {
      const response: LlamaChatModelResponseItem[] = [];
      for (const block of message.content) {
        if (block.type === "text" && block.text) response.push(block.text);
        if (block.type === "toolCall") {
          response.push({
            type: "functionCall",
            name: block.name,
            params: block.arguments,
            result: toolResults.get(block.id) ?? null,
          });
        }
      }
      if (response.length > 0) history.push({ type: "model", response });
    }
  }

  if (history.at(-1)?.type !== "model") history.push({ type: "model", response: [] });
  return history;
}

export function createBalaurLlamaCppProvider(options: BalaurLlamaCppProviderOptions): { prepare: () => Promise<void>; stream: StreamFn; close: () => Promise<void> } {
  let runtimePromise: Promise<LoadedLlamaCppRuntime> | undefined;

  const getRuntime = async (): Promise<LoadedLlamaCppRuntime> => {
    if (!runtimePromise) runtimePromise = loadRuntime(options);
    return runtimePromise;
  };

  const stream: StreamFn = (model, context, streamOptions) => {
    const events = createAssistantMessageEventStream();
    void runLlamaCppTurn(events, getRuntime, model, context, streamOptions).catch((error) => {
      const message = createAssistantMessage(model, [{ type: "text", text: "" }], "error", sanitizeLocalError(error));
      events.push({ type: "error", reason: "error", error: message });
    });
    return events;
  };

  return {
    prepare: async () => { await getRuntime(); },
    stream,
    close: async () => {
      const runtime = await runtimePromise?.catch(() => undefined);
      runtime?.chat.dispose({ disposeSequence: true });
      await runtime?.context.dispose?.();
      await runtime?.model.dispose();
      runtimePromise = undefined;
    },
  };
}

async function loadRuntime(options: BalaurLlamaCppProviderOptions): Promise<LoadedLlamaCppRuntime> {
  assertBalaurLlamaCppRam();
  mkdirSync(modelsDir(), { recursive: true });
  options.onStatus?.(`Preparing local model ${options.model.id}. This may take a moment.`);
  const llamaCpp = await import("node-llama-cpp");
  const modelPath = await llamaCpp.resolveModelFile(options.model.id, {
    directory: modelsDir(),
    cli: options.cli ?? true,
    onProgress: createModelDownloadProgressReporter(options.onStatus),
  });
  const llama = await llamaCpp.getLlama();
  const model = await llama.loadModel({ modelPath }) as NodeLlamaModel;
  const context = await model.createContext({
    contextSize: resolveBalaurLlamaCppContextSize(),
    failedCreationRemedy: false,
  });
  const chat = new llamaCpp.LlamaChat({ contextSequence: context.getSequence() as never, chatWrapper: "auto" }) as NodeLlamaChat;
  options.onStatus?.(`Local model ready: ${options.model.name}.`);
  return { chat, context, model };
}

async function runLlamaCppTurn(
  events: ReturnType<typeof createAssistantMessageEventStream>,
  getRuntime: () => Promise<LoadedLlamaCppRuntime>,
  model: Model<any>,
  context: Context,
  options: SimpleStreamOptions | undefined,
): Promise<void> {
  const runtime = await getRuntime();
  const content: AssistantMessage["content"] = [];
  let partial = createAssistantMessage(model, content, "stop");
  let textIndex: number | undefined;

  events.push({ type: "start", partial });

  const response = await runtime.chat.generateResponse(llamaChatHistoryFromContext(context), {
    functions: llamaFunctionsFromTools(context.tools),
    maxTokens: options?.maxTokens ?? resolveBalaurLlamaCppMaxTokens(),
    temperature: 1.0,
    topP: 0.95,
    topK: 64,
    signal: options?.signal,
    stopOnAbortSignal: true,
    onTextChunk: (text: string) => {
      if (textIndex === undefined) {
        textIndex = content.length;
        content.push({ type: "text", text: "" });
        partial = createAssistantMessage(model, content, "stop");
        events.push({ type: "text_start", contentIndex: textIndex, partial });
      }
      const block = content[textIndex];
      if (block?.type === "text") block.text += text;
      partial = createAssistantMessage(model, content, "stop");
      events.push({ type: "text_delta", contentIndex: textIndex, delta: text, partial });
    },
  });

  if (textIndex === undefined && response.response) {
    textIndex = content.length;
    content.push({ type: "text", text: response.response });
    partial = createAssistantMessage(model, content, "stop");
    events.push({ type: "text_start", contentIndex: textIndex, partial });
    events.push({ type: "text_delta", contentIndex: textIndex, delta: response.response, partial });
  }
  if (textIndex !== undefined) {
    const block = content[textIndex];
    partial = createAssistantMessage(model, content, "stop");
    events.push({ type: "text_end", contentIndex: textIndex, content: block?.type === "text" ? block.text : "", partial });
  }

  for (const [index, call] of (response.functionCalls ?? []).entries()) {
    const contentIndex = content.length;
    const toolCall = {
      type: "toolCall" as const,
      id: `llama-cpp-${Date.now()}-${index}`,
      name: call.functionName,
      arguments: isRecord(call.params) ? call.params : {},
    };
    content.push(toolCall);
    partial = createAssistantMessage(model, content, "toolUse");
    events.push({ type: "toolcall_start", contentIndex, partial });
    events.push({ type: "toolcall_end", contentIndex, toolCall, partial });
  }

  const stopReason = response.functionCalls?.length ? "toolUse" : response.metadata.stopReason === "maxTokens" ? "length" : "stop";
  const finalMessage = createAssistantMessage(model, content.length ? content : [{ type: "text", text: response.response }], stopReason);
  events.push({ type: "done", reason: stopReason, message: finalMessage });
}

function createAssistantMessage(
  model: Model<any>,
  content: AssistantMessage["content"],
  stopReason: AssistantMessage["stopReason"],
  errorMessage?: string,
): AssistantMessage {
  return {
    role: "assistant",
    content: [...content],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: EMPTY_USAGE,
    stopReason,
    errorMessage,
    timestamp: Date.now(),
  };
}

function textFromContent(content: { type: string; text?: string }[]): string {
  return content.flatMap((block) => block.type === "text" && block.text ? [block.text] : []).join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeLocalError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.split(modelsDir()).join("<balaur-models>");
}
