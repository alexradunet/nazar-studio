// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * memory.ts — Nazar Pi extension: durable Markdown memory over the user's vault, plus a thin
 * bridge that turns an agreed procedure into a Pi-NATIVE skill.
 *
 * TWO kinds of knowledge, cleanly split (no custom unified index):
 *   - MEMORY → user-shaped pages in vault/memory/ — engine in ../lib/memory.ts, indexed by a
 *              disposable FTS5 accelerator and recalled by relevance. The extension must not
 *              impose life/coding/project categories; it preserves the user's wording.
 *              Tools: memory_write / memory_search / memory_get / memory_duplicates.
 *   - SKILLS → procedures as Pi-native skill files (skills/<name>.md, frontmatter
 *              name/description). Pi discovers, injects, and invokes them (/skill:name), so
 *              skill_write just writes the file — there is nothing to index. See SELF_EVOLUTION.md.
 *
 * The extension injects relevant saved memory into the turn's system prompt on EVERY turn, for
 * all models. On a frontier/cloud model this sends recalled memory to that provider, so keep
 * secrets out of memory (redact before persisting). Recall is owner-enabled for all models by
 * design — see AGENTS.md; flipping it back to local-only is a deliberate privacy choice.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeMemory, searchMemory, getMemory, findDuplicates, recallContext, reindexMemory } from "../lib/memory.ts";
import { nodeSqliteUpgradePrompt } from "../lib/node-version.ts";
import { moduleDir } from "../lib/paths.ts";

/** Where Pi-native skill files live (declared in package.json `pi.skills`). */
const skillsDir = (): string => join(moduleDir(import.meta.url), "..", "skills");

/** kebab-case a skill name for the filename and the `/skill:` handle. */
function slugifySkill(s: string): string {
  return (s || "")
    .toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-")
    .slice(0, 64).replace(/^-|-$/g, "") || "skill";
}

function log(pi: ExtensionAPI, message: string): void {
  (pi as unknown as { log?: (message: string) => void }).log?.(message);
}

export default function (pi: ExtensionAPI) {
  try {
    reindexMemory();
  } catch (err) {
    log(pi, `[memory] reindex skipped: ${err instanceof Error ? err.message : String(err)}`);
  }

  pi.on("session_start", async (_event, ctx) => {
    const prompt = nodeSqliteUpgradePrompt();
    if (!prompt || !ctx.hasUI) return;
    try { ctx.ui.notify(prompt, "error"); } catch { /* ignore */ }
  });

  pi.on("before_agent_start", (event) => {
    // Recall fires on every turn for all models (owner decision). On frontier/cloud models this
    // sends recalled memory to the provider — keep secrets out of memory. See AGENTS.md.
    const memory = recallContext(event.prompt);
    if (!memory) return;
    return { systemPrompt: `${event.systemPrompt}\n\n${memory}` };
  });

  pi.registerTool({
    name: "memory_write",
    label: "remember",
    description:
      "Save a user-approved durable memory as a Markdown page. Use only when the user explicitly asks to remember/save something or confirms it should persist. Do not infer a life/coding schema; preserve the user's wording. Content is free-form Markdown.",
    parameters: Type.Object({
      title: Type.String({ description: "Short page title; also the [[wikilink]] handle." }),
      content: Type.String({ description: "The memory body as free-form Markdown; preserve the user's wording and structure." }),
      type: Type.Optional(Type.String({ description: "Optional arbitrary folder/category slug. Defaults to notes." })),
      whenToUse: Type.Optional(Type.String({ description: "Optional retrieval hint in the user's terms; omit if not needed." })),
      tags: Type.Optional(Type.Array(Type.String({ description: "Optional user-chosen tag." }))),
      pinned: Type.Optional(Type.Boolean({ description: "Always keep in context; use only when explicitly requested." })),
    }),
    async execute(_id: string, p: any) {
      const r = writeMemory(p);
      return { content: [{ type: "text", text: `Remembered → ${r.path}` }], details: r };
    },
  });

  pi.registerTool({
    name: "skill_write",
    label: "learn a skill",
    description:
      "Turn an agreed recurring procedure into a Pi-native SKILL — a reusable playbook Pi will discover, inject, and let you invoke (/skill:name). Use after you and the user agree a recurring need should become a repeatable capability. It lands in skills/ as a reviewable git change (a rung of self-evolution).",
    parameters: Type.Object({
      name: Type.String({ description: "Skill name; kebab-cased for the file and the /skill: handle." }),
      description: Type.String({ description: "When to use it + what it does — Pi shows this to the model to decide when to surface the skill." }),
      content: Type.String({ description: "The procedure (Markdown): steps, conventions, examples." }),
    }),
    async execute(_id: string, p: { name: string; description: string; content: string }) {
      const slug = slugifySkill(p.name);
      const dir = skillsDir();
      mkdirSync(dir, { recursive: true });
      const path = join(dir, `${slug}.md`);
      const fm =
        `---\nname: ${slug}\ndescription: ${JSON.stringify((p.description ?? "").trim())}\n---\n\n` +
        `${String(p.content ?? "").trim()}\n`;
      writeFileSync(path, fm);
      return {
        content: [{ type: "text", text: `Learned skill → ${path} (invoke with /skill:${slug})` }],
        details: { path, name: slug },
      };
    },
  });

  pi.registerTool({
    name: "memory_search",
    label: "recall",
    description:
      "Search long-term memory (keyword/full-text) and return the most relevant user-authored pages. Use when prior saved context may help; do not treat absence of memory as absence of user preference.",
    parameters: Type.Object({ query: Type.String(), k: Type.Optional(Type.Number()) }),
    async execute(_id: string, p: { query: string; k?: number }) {
      const hits = searchMemory(p.query, p.k ?? 5);
      const text = hits.length
        ? hits.map((h) => `• [[${h.title}]] (${h.type}) — ${h.snippet}`).join("\n")
        : "No matching memory.";
      return { content: [{ type: "text", text }], details: { hits } };
    },
  });

  pi.registerTool({
    name: "memory_get",
    label: "open page",
    description: "Read the full Markdown of a memory page by its exact title.",
    parameters: Type.Object({ title: Type.String() }),
    async execute(_id: string, p: { title: string }) {
      const md = getMemory(p.title);
      return { content: [{ type: "text", text: md ?? `No page titled "${p.title}".` }], details: {} };
    },
  });

  pi.registerTool({
    name: "memory_duplicates",
    label: "find duplicate memory",
    description:
      "List clusters of likely-duplicate memory pages (same normalized title). Use to propose CONSOLIDATION — merge a cluster into one page and delete the rest — so memory organizes itself instead of bloating. Detection only; you propose the merge for approval.",
    parameters: Type.Object({}),
    async execute() {
      const dups = findDuplicates();
      const text = dups.length
        ? dups.map((d) => `• "${d.title}" — ${d.paths.length} copies:\n  ${d.paths.join("\n  ")}`).join("\n")
        : "No duplicate clusters found.";
      return { content: [{ type: "text", text }], details: { dups } };
    },
  });

  log(pi, "[memory] tools registered: memory_write, skill_write, memory_search, memory_get, memory_duplicates");
}
