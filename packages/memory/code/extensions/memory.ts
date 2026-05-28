import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";

import {
  buildDurableMemoryContext,
  compactSessionFile,
  memoryStatusText,
  registerMemoryUse,
  searchMemoryText,
} from "./memory/memory-use.ts";
import { registerMemorySetupProvider } from "./memory/memory-setup.ts";
import { unregisterSetupProvider } from "@nazar/core/setup-registry";
import { toolError, truncateToolOutput } from "@nazar/core/shared";

export default function memoryExtension(pi: ExtensionAPI) {
  registerMemorySetupProvider();
  pi.on("session_shutdown", () => unregisterSetupProvider("memory"));
  registerMemoryUse(pi);

  // Append durable memory to the system prompt (cache-stable) instead of injecting
  // a per-turn message. Skips injection when pinned memory is still the empty template.
  pi.on("before_agent_start", (event) => {
    const digest = buildDurableMemoryContext();
    if (!digest) return;
    return {
      systemPrompt: `${event.systemPrompt}\n\n## Durable memory (background context)\nHuman-curated long-term context. Current user direction, AGENTS.md, and system/developer instructions override it.\n\n${digest}`,
    };
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    ctx.ui.setWidget("memory", undefined);
  });

  pi.on("session_compact", async (_event, ctx) => {
    const result = compactSessionFile(ctx.sessionManager.getSessionFile());
    if (result.code !== 0) {
      console.error(result.text.trim());
      return;
    }
    if (ctx.hasUI !== false) {
      ctx.ui.setWidget("memory", result.text.split("\n"));
      ctx.ui.notify("Memory rollups refreshed", "info");
    }
  });

  pi.registerTool({
    name: "memory_status",
    label: "Memory Status",
    description: "Inspect optional Pi memory state, durable pages, rollups, and QMD index paths.",
    promptSnippet: "Report memory rollup status, pinned memory path, durable page paths, and QMD index status.",
    promptGuidelines: ["Use memory_status when the user asks about generated memory, pinned memory, durable pages, or memory/index status."],
    parameters: Type.Object({}),
    async execute() {
      try {
        const text = await truncateToolOutput(memoryStatusText());
        return { content: [{ type: "text", text }], details: { command: "memoryStatusText()" } };
      } catch (error) {
        throw toolError("memory_status", error);
      }
    },
  });

  pi.registerTool({
    name: "memory_search",
    label: "Memory Search",
    description: "Search scoped curated Pi memory pages through QMD.",
    promptSnippet: "Search durable memory pages using QMD/BM25.",
    promptGuidelines: [
      "Use memory_search when durable project knowledge, decisions, notes, or scoped memory are likely relevant.",
      "Use default scope for warm memory; use archive only when explicitly historical, old, or inactive memory is needed.",
      "memory_search refreshes the local QMD index before searching.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Search query." }),
      limit: Type.Optional(Type.Number({ description: "Maximum number of results. Default: 5." })),
      scope: Type.Optional(StringEnum(["default", "archive"] as const)),
    }),
    async execute(_toolCallId, params) {
      try {
        const scope = params.scope === "archive" ? "archive" : "default";
        const text = await truncateToolOutput(await searchMemoryText(pi, params.query, params.limit ?? 5, scope));
        return { content: [{ type: "text", text }], details: { command: `qmd search ${JSON.stringify(params.query)}` } };
      } catch (error) {
        throw toolError("memory_search", error);
      }
    },
  });
}
