import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  compactSessionFile,
  memoryStatusText,
  registerMemoryUse,
  searchMemoryText,
} from "./memory/memory-use.ts";
import { toolError, truncateUtf8 } from "./shared.ts";

const TOOL_OUTPUT_LIMIT_BYTES = 50 * 1024;

const baseDir = dirname(fileURLToPath(import.meta.url));
const memoryJanitorSkillPath = join(baseDir, "memory", "skills", "memory-janitor");

export default function memoryExtension(pi: ExtensionAPI) {
  registerMemoryUse(pi);

  pi.on("resources_discover", () => ({
    skillPaths: [memoryJanitorSkillPath],
  }));

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
        const text = memoryStatusText();
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
    promptSnippet: "Search durable memory, personal-vault pages, or project knowledge pages using QMD/BM25.",
    promptGuidelines: [
      "Use memory_search when durable project knowledge, decisions, notes, or scoped memory are likely relevant.",
      "Infer scope from the conversation: personal for Obsidian vault notes/preferences, ai for Nazar/project/wiki memory, archive only when explicitly historical/old/inactive, all for explicit broad recall.",
      "memory_search refreshes the local QMD index before searching.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Search query." }),
      limit: Type.Optional(Type.Number({ description: "Maximum number of results. Default: 5." })),
      mode: Type.Optional(Type.String({ enum: ["search", "query"], description: "QMD mode: search for BM25 keyword search, query for hybrid search." } as Record<string, unknown>)),
      scope: Type.Optional(Type.String({ enum: ["default", "personal", "ai", "archive", "all"], description: "Memory scope to search. Default excludes archive." } as Record<string, unknown>)),
    }),
    async execute(_toolCallId, params) {
      try {
        const mode = params.mode === "query" ? "query" : "search";
        const scope = ["personal", "ai", "archive", "all"].includes(params.scope || "") ? params.scope as "personal" | "ai" | "archive" | "all" : "default";
        const text = truncateUtf8(await searchMemoryText(pi, params.query, params.limit ?? 5, mode, scope), TOOL_OUTPUT_LIMIT_BYTES);
        return { content: [{ type: "text", text }], details: { command: `qmd ${mode} ${JSON.stringify(params.query)}` } };
      } catch (error) {
        throw toolError("memory_search", error);
      }
    },
  });
}
