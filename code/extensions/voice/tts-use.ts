import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { sherpaModelStatus, speakWithSherpa, stopSherpaSpeech } from "./sherpa-runtime.ts";

type TtsState = {
  enabled: boolean;
  speaking: boolean;
  queue: string[];
  streamBuffer: string;
  fullTextSeen: string;
  lastError: string;
};

const CONFIG = {
  minChars: 90,
  debounceMs: 150,
  maxChunkChars: 450,
  interruptOnNewMessage: true,
  simplifyPaths: true,
  pathTailSegments: 2,
  maxPathLength: 42,
};

const STATE: TtsState = {
  enabled: true,
  speaking: false,
  queue: [],
  streamBuffer: "",
  fullTextSeen: "",
  lastError: "",
};

let debounceTimer: NodeJS.Timeout | undefined;
let currentSpeech: Promise<void> | undefined;

const HELP_TEXT = `Pi local TTS commands
- /tts on — enable speaking assistant replies
- /tts off — disable TTS and stop current speech
- /tts stop — stop current speech and clear queued speech
- /tts status — show TTS status
- /tts test — speak a short English local sherpa TTS test
- /tts help — show this help

TTS uses embedded sherpa-onnx-node local speech synthesis.`;

function hasInteractiveUi(ctx: { hasUI?: boolean }): boolean {
  return ctx.hasUI !== false;
}

function isSubagentRuntime(): boolean {
  return process.env.PI_SUBAGENT_CHILD === "1" || Boolean(process.env.PI_SUBAGENT_RUN_ID || process.env.PI_SUBAGENT_CHILD_AGENT);
}

function canAutoSpeak(ctx: { hasUI?: boolean }): boolean {
  return STATE.enabled && hasInteractiveUi(ctx) && !isSubagentRuntime();
}

function extractText(message: any): string {
  const parts = message?.content;
  if (typeof parts === "string") return parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((part) => part?.type === "text" && typeof part?.text === "string")
    .map((part) => part.text)
    .join("");
}

function stripEmojis(text: string): string {
  return text.replace(/\p{Extended_Pictographic}/gu, "").replace(/[\uFE0E\uFE0F\u200D]/g, "");
}

function normalizeMarkdownForTts(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/(^|\s)#(?=[A-Za-z][\w-]*\b)/g, "$1");
}

function addPausePunctuation(text: string): string {
  return text.replace(/\n\s*\n+/g, ". ").replace(/\n/g, ", ");
}

function simplifyPathsForTts(text: string): string {
  if (!CONFIG.simplifyPaths) return text;
  return text.replace(/(?:~|\/[\w.-]+(?:\/[\w.-]+)+)/g, (fullPath) => {
    const normalized = fullPath.replace(/^~\//, "home/");
    if (normalized.length <= CONFIG.maxPathLength) return fullPath;
    const segments = normalized.split("/").filter(Boolean);
    const tail = segments.slice(-Math.max(1, CONFIG.pathTailSegments)).join("/");
    return `…/${tail}`;
  });
}

function cleanForTts(text: string): string {
  return addPausePunctuation(simplifyPathsForTts(normalizeMarkdownForTts(stripEmojis(text))))
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .trim();
}

function splitLongText(text: string): string[] {
  const chunks: string[] = [];
  let remaining = text.trim();

  while (remaining.length > CONFIG.maxChunkChars) {
    const candidate = remaining.slice(0, CONFIG.maxChunkChars);
    const breakAt = Math.max(candidate.lastIndexOf(". "), candidate.lastIndexOf("! "), candidate.lastIndexOf("? "), candidate.lastIndexOf(", "));
    const cut = breakAt > 80 ? breakAt + 1 : CONFIG.maxChunkChars;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function splitSpeakableChunks(buffer: string): { chunks: string[]; rest: string } {
  const chunks: string[] = [];
  let remaining = buffer;

  while (remaining.length >= CONFIG.minChars) {
    const match = remaining.match(/^([\s\S]*?[.!?\n])\s+/);
    if (!match) break;
    const chunk = match[1].trim();
    if (chunk) chunks.push(chunk);
    remaining = remaining.slice(match[0].length);
  }

  return { chunks, rest: remaining };
}

function enqueue(text: string): void {
  const cleaned = cleanForTts(text);
  if (!cleaned) return;
  STATE.queue.push(...splitLongText(cleaned));
  void processQueue();
}

function stopCurrentSpeech(): void {
  stopSherpaSpeech();
  currentSpeech = undefined;
}

function clearSpeech(): void {
  STATE.queue = [];
  STATE.streamBuffer = "";
  stopCurrentSpeech();
}

function speakText(text: string): Promise<void> {
  const speech = speakWithSherpa(text).finally(() => {
    if (currentSpeech === speech) currentSpeech = undefined;
  });
  currentSpeech = speech;
  return speech;
}

async function processQueue(): Promise<void> {
  if (STATE.speaking || !STATE.enabled) return;
  const next = STATE.queue.shift();
  if (!next) return;

  STATE.speaking = true;
  try {
    await speakText(next);
    STATE.lastError = "";
  } catch (error) {
    STATE.lastError = error instanceof Error ? error.message : String(error);
  } finally {
    STATE.speaking = false;
    if (STATE.queue.length > 0) void processQueue();
  }
}

function flushStreamingBuffer(forceAll = false): void {
  if (!STATE.streamBuffer.trim()) return;

  if (forceAll) {
    enqueue(STATE.streamBuffer);
    STATE.streamBuffer = "";
    return;
  }

  const { chunks, rest } = splitSpeakableChunks(STATE.streamBuffer);
  for (const chunk of chunks) enqueue(chunk);
  STATE.streamBuffer = rest;
}

function isTtsBusy(): boolean {
  return STATE.enabled && (STATE.speaking || STATE.queue.length > 0 || Boolean(currentSpeech) || Boolean(STATE.streamBuffer.trim()));
}

function statusText(ctx?: { hasUI?: boolean }): string {
  return [
    `TTS: ${STATE.enabled ? "on" : "off"}`,
    `Auto-speech scope: main interactive conversation only`,
    `Current runtime: ${isSubagentRuntime() ? "subagent/headless child" : hasInteractiveUi(ctx ?? {}) ? "main interactive" : "non-interactive"}`,
    `Speaking: ${STATE.speaking ? "yes" : "no"}`,
    `Queue: ${STATE.queue.length}`,
    sherpaModelStatus(),
    `minChars=${CONFIG.minChars}, debounceMs=${CONFIG.debounceMs}, maxChunkChars=${CONFIG.maxChunkChars}`,
    `Last error: ${STATE.lastError || "none"}`,
  ].join("\n");
}

export function registerTtsUse(pi: ExtensionAPI) {
  pi.registerCommand("tts", {
    description: "Speak assistant replies with local sherpa TTS: /tts on|off|stop|status|test",
    handler: async (args, ctx) => {
      const command = args.trim().toLowerCase();

      if (command === "" || command === "help") {
        if (!hasInteractiveUi(ctx)) {
          console.log(HELP_TEXT);
          return;
        }
        ctx.ui.setWidget("tts", HELP_TEXT.split("\n"));
        ctx.ui.notify("Pi TTS help updated", "info");
        return;
      }

      if (command === "on") {
        STATE.enabled = true;
        const text = "TTS enabled for the main interactive conversation.";
        if (hasInteractiveUi(ctx)) ctx.ui.notify(text, "info");
        else console.log(text);
        return;
      }

      if (command === "off") {
        STATE.enabled = false;
        clearSpeech();
        if (hasInteractiveUi(ctx)) ctx.ui.notify("TTS disabled", "info");
        else console.log("TTS disabled");
        return;
      }

      if (command === "stop") {
        clearSpeech();
        if (hasInteractiveUi(ctx)) ctx.ui.notify("TTS stopped", "info");
        else console.log("TTS stopped");
        return;
      }

      if (command === "test" || command === "test en") {
        const testText = "Hello. Local sherpa text to speech is active.";
        clearSpeech();
        STATE.speaking = true;
        try {
          await speakText(testText);
          STATE.lastError = "";
          if (hasInteractiveUi(ctx)) ctx.ui.notify("TTS test played", "info");
          else console.log("TTS test played");
        } catch (error) {
          STATE.lastError = error instanceof Error ? error.message : String(error);
          if (hasInteractiveUi(ctx)) ctx.ui.notify(`TTS test failed: ${STATE.lastError}`, "error");
          else console.log(`TTS test failed: ${STATE.lastError}`);
        } finally {
          STATE.speaking = false;
          if (STATE.queue.length > 0) void processQueue();
        }
        return;
      }

      if (command === "status") {
        const text = statusText(ctx);
        if (!hasInteractiveUi(ctx)) {
          console.log(text);
          return;
        }
        ctx.ui.setWidget("tts", text.split("\n"));
        ctx.ui.notify("Pi TTS status updated", "info");
        return;
      }

      const text = `Unknown /tts command: ${command}\n\n${HELP_TEXT}`;
      if (!hasInteractiveUi(ctx)) console.log(text);
      else {
        ctx.ui.setWidget("tts", text.split("\n"));
        ctx.ui.notify("Unknown TTS command", "warning");
      }
    },
  });

  pi.registerTool({
    name: "tts_toggle",
    label: "TTS Toggle",
    description: "Enable or disable Pi text-to-speech for assistant replies.",
    parameters: Type.Object({
      enabled: Type.Boolean({ description: "Whether TTS should be enabled." }),
    }),
    async execute(_toolCallId, params) {
      STATE.enabled = params.enabled;
      if (!STATE.enabled) clearSpeech();
      return { content: [{ type: "text", text: `TTS ${STATE.enabled ? "enabled for the main interactive conversation" : "disabled"}.` }] };
    },
  });

  pi.on("message_start", async (event, ctx) => {
    if (event.message.role !== "assistant") return;
    if (!canAutoSpeak(ctx)) return;
    if (CONFIG.interruptOnNewMessage) clearSpeech();
    STATE.streamBuffer = "";
    STATE.fullTextSeen = "";
    if (debounceTimer) clearTimeout(debounceTimer);
  });

  pi.on("message_update", async (event, ctx) => {
    if (event.message.role !== "assistant") return;
    if (!canAutoSpeak(ctx)) return;

    const full = extractText(event.message);
    if (!full) return;

    let delta = "";
    if (full.startsWith(STATE.fullTextSeen)) {
      delta = full.slice(STATE.fullTextSeen.length);
    } else {
      delta = full;
      STATE.streamBuffer = "";
    }

    STATE.fullTextSeen = full;
    STATE.streamBuffer += delta;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => flushStreamingBuffer(false), CONFIG.debounceMs);
  });

  pi.on("message_end", async (event, ctx) => {
    if (event.message.role !== "assistant") return;
    if (!canAutoSpeak(ctx)) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    flushStreamingBuffer(true);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    clearSpeech();
    ctx.ui.setWidget("tts", undefined);
  });
}
