// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * memory.ts — Nazar Pi extension: durable MEMORY (facts) over the Markdown vault, plus a thin
 * bridge that turns an agreed procedure into a Pi-NATIVE skill.
 *
 * TWO kinds of knowledge, cleanly split (no custom unified index):
 *   - FACTS  → memory pages in vault/memory/ — engine in ../lib/memory.ts, indexed by a
 *              disposable FTS5 accelerator, recalled by relevance (keystone field: whenToUse).
 *              Tools: memory_write / memory_search / memory_get / memory_duplicates.
 *   - SKILLS → procedures as Pi-native skill files (skills/<name>.md, frontmatter
 *              name/description). Pi discovers, injects, and invokes them (/skill:name), so
 *              skill_write just writes the file — there is nothing to index. See SELF_EVOLUTION.md.
 *
 * On local/private models only, the extension injects the most relevant FACTS into the turn's
 * system prompt. It deliberately skips auto-recall on frontier models to avoid moving private
 * memory off the box without an explicit choice.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeMemory, searchMemory, getMemory, findDuplicates, recallContext, reindexMemory } from "../lib/memory.ts";
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

function isLocalModel(model: any): boolean {
  const baseUrl = String(model?.baseUrl || "");
  return /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:|\/|$)/.test(baseUrl);
}

export default function (pi: ExtensionAPI) {
  try {
    reindexMemory();
  } catch (err) {
    pi.log?.(`[memory] reindex skipped: ${err instanceof Error ? err.message : String(err)}`);
  }

  pi.on("before_agent_start", (event, ctx) => {
    if (!isLocalModel(ctx.model)) return;
    const memory = recallContext(event.prompt);
    if (!memory) return;
    return { systemPrompt: `${event.systemPrompt}\n\n${memory}` };
  });

  pi.registerTool({
    name: "memory_write",
    label: "remember",
    description:
      "Save a durable FACT to long-term memory as a Markdown page. Use for things worth remembering across conversations — people, preferences, projects, decisions. Content is free-form; add a `whenToUse` hint so it surfaces at the right moment.",
    parameters: Type.Object({
      title: Type.String({ description: "Short page title; also the [[wikilink]] handle." }),
      content: Type.String({ description: "The note body (Markdown; [[links]] welcome)." }),
      type: Type.Optional(Type.String({ description: "people | projects | prefs | facts | daily | notes" })),
      whenToUse: Type.Optional(Type.String({ description: "Natural-language 'use this when…' so recall surfaces it." })),
      tags: Type.Optional(Type.Array(Type.String())),
      pinned: Type.Optional(Type.Boolean({ description: "Always keep in context (use sparingly)." })),
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
      "Search long-term memory (keyword/full-text) and return the most relevant pages. Call before answering when prior context about the user might help.",
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

  pi.log?.("[memory] tools registered: memory_write, skill_write, memory_search, memory_get, memory_duplicates");
}
