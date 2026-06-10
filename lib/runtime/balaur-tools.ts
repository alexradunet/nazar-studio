// SPDX-License-Identifier: AGPL-3.0-or-later
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import { findVaultDuplicates, getVaultEntry, searchVault, writeVaultEntry } from "../vault.ts";

export const vaultSearchTool: AgentTool<any> = {
  name: "vault_search",
  label: "Vault Search",
  description: "Search Balaur's Johnny Decimal Markdown vault by keyword/full-text query.",
  parameters: Type.Object({
    query: Type.String({ description: "Search query in the user's words." }),
    k: Type.Optional(Type.Number({ description: "Maximum number of results, default 5." })),
  }),
  execute: async (_toolCallId, params: any) => {
    const hits = searchVault(params.query, params.k ?? 5);
    const text = hits.length
      ? hits.map((h) => `- [[${h.title}]] (${h.jd}, ${h.kind}, ${h.status}) ${h.snippet}`.trim()).join("\n")
      : "No matching vault entries.";

    return { content: [{ type: "text" as const, text }], details: { hits } };
  },
};

export const vaultWriteTool: AgentTool<any> = {
  name: "vault_write",
  label: "Vault Write",
  description: "Save a user-approved entry to Balaur's Johnny Decimal Markdown vault. Use only when the user explicitly asks to remember/save/write something or confirms it should persist.",
  parameters: Type.Object({
    title: Type.String({ description: "Short entry title; also the [[wikilink]] handle." }),
    content: Type.String({ description: "Entry body as free-form Markdown; preserve the user's wording and structure." }),
    jd: Type.Optional(Type.String({ description: "Johnny Decimal code, e.g. 40.12. Defaults to 30.00 inbox/general." })),
    kind: Type.Optional(Type.Union([
      Type.Literal("user-note"),
      Type.Literal("ai-note"),
      Type.Literal("skill"),
      Type.Literal("memory"),
      Type.Literal("summary"),
    ])),
    status: Type.Optional(Type.Union([Type.Literal("inbox"), Type.Literal("approved"), Type.Literal("rejected")])),
    whenToUse: Type.Optional(Type.String({ description: "Optional retrieval hint in the user's terms." })),
    tags: Type.Optional(Type.Array(Type.String())),
    pinned: Type.Optional(Type.Boolean()),
  }),
  execute: async (_toolCallId, params: any) => {
    const result = writeVaultEntry(params);
    return { content: [{ type: "text" as const, text: `Saved to vault → ${result.path}` }], details: result };
  },
};

export const vaultGetTool: AgentTool<any> = {
  name: "vault_get",
  label: "Vault Get",
  description: "Read the full Markdown of a vault entry by its exact title.",
  parameters: Type.Object({ title: Type.String() }),
  execute: async (_toolCallId, params: any) => {
    const md = getVaultEntry(params.title);
    return { content: [{ type: "text" as const, text: md ?? `No vault entry titled "${params.title}".` }], details: {} };
  },
};

export const vaultDuplicatesTool: AgentTool<any> = {
  name: "vault_duplicates",
  label: "Vault Duplicates",
  description: "List clusters of likely-duplicate vault entries. Detection only; propose any merge for approval before changing files.",
  parameters: Type.Object({}),
  execute: async () => {
    const dups = findVaultDuplicates();
    const text = dups.length
      ? dups.map((d) => `- "${d.title}" — ${d.paths.length} copies:\n  ${d.paths.join("\n  ")}`).join("\n")
      : "No duplicate clusters found.";
    return { content: [{ type: "text" as const, text }], details: { dups } };
  },
};

export const balaurTools = [
  vaultSearchTool,
  vaultWriteTool,
  vaultGetTool,
  vaultDuplicatesTool,
] as const;

export const balaurToolNames = balaurTools.map((tool) => tool.name);
