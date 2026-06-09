// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * memory.ts — Nazar Pi extension: durable Markdown memory over the user's vault, plus a thin
 * bridge that turns an agreed procedure into a Pi-NATIVE skill.
 *
 * TWO kinds of knowledge, cleanly split (no custom unified index):
 *   - MEMORY → user-shaped pages in vault/memory/ — engine in ../lib/memory.ts, indexed by a
 *              disposable FTS5 accelerator and recalled by relevance. The extension must not
 *              impose life/coding/project categories; it preserves the user's wording.
 *              Tools: memory_write (explicit) / memory_suggest (proactive, asks first) /
 *              memory_search / memory_get / memory_duplicates. memory_suggest realizes the
 *              "detect → suggest → approve" capture loop (SELF_EVOLUTION.md) for memory.
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
import { writeMemory, searchMemory, getMemory, findDuplicates, recallContext, reindexMemory, type Hit } from "../lib/memory.ts";
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

// Hybrid Save/Edit/Skip dialog labels (themed pi-tui Select; matches the approved design mockup).
const OPT_SAVE = "Save";
const OPT_EDIT = "Edit…";
const OPT_SKIP = "Skip";
const OPT_UPDATE = "Update the existing note";

/**
 * Proactive-capture suggestions already offered this Pi session, so Nazar never re-nags about the
 * same fact. Process-scoped (dies with the session); intentionally not persisted.
 */
const offeredThisSession = new Set<string>();

/** Cheap, stable fingerprint of a proposal for the anti-nag set (djb2 over title + content head). */
function suggestFingerprint(title: string, content: string): string {
  const s = `${title.trim().toLowerCase()}|${content.trim().toLowerCase().slice(0, 200)}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * Find an existing page with the same (case-insensitive) title — the dedupe signal. Returns the
 * matching hit so an "update" writes back to the same page/type, or null. Same-title only by
 * design: cheap and reliable on FTS5; fuzzy cross-title matching is intentionally out of scope.
 */
function sameTitlePage(title: string): Hit | null {
  const want = title.trim().toLowerCase();
  if (!want) return null;
  for (const h of searchMemory(title, 5)) {
    if (h.title.trim().toLowerCase() === want) return h;
  }
  return null;
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
    name: "memory_suggest",
    label: "offer to remember",
    description:
      "PROACTIVELY offer to save a durable fact to long-term memory, asking the user to approve first (Save / Edit / Skip). Call this yourself when the user reveals something worth keeping across sessions — a stable preference, a decision, an identity/role fact, a recurring workflow detail, or a correction of an earlier assumption — that isn't already saved. Do NOT call for transient or task-only details, or for secrets/credentials. Nothing is written unless the user approves; prefer memory_write when the user explicitly asks to remember something.",
    promptSnippet: "memory_suggest — offer (with the user's approval) to remember a durable fact you noticed.",
    promptGuidelines: [
      "When the user states a durable fact about themselves, their preferences, their projects, or a decision, offer to keep it with memory_suggest — it asks before saving.",
      "Offer at most once per fact; never re-offer something already saved or skipped this session.",
      "Never put secrets, credentials, or sensitive data the user didn't ask you to keep into a suggestion.",
      "Use memory_write (not memory_suggest) when the user explicitly says to remember something.",
    ],
    parameters: Type.Object({
      title: Type.String({ description: "Short page title for the fact; also the [[wikilink]] handle." }),
      content: Type.String({ description: "The fact as free-form Markdown, in the user's wording." }),
      type: Type.Optional(Type.String({ description: "Optional folder/category slug. Defaults to notes." })),
      whenToUse: Type.Optional(Type.String({ description: "Optional retrieval hint in the user's terms." })),
      tags: Type.Optional(Type.Array(Type.String({ description: "Optional tag." }))),
    }),
    async execute(_id: string, p: any, signal: any, _onUpdate: any, ctx: any): Promise<any> {
      const proposal = {
        title: String(p?.title ?? "").trim(),
        content: String(p?.content ?? "").trim(),
        type: p?.type as string | undefined,
        whenToUse: p?.whenToUse as string | undefined,
        tags: p?.tags as string[] | undefined,
      };
      if (!proposal.title || !proposal.content) {
        return { content: [{ type: "text", text: "Nothing to suggest (empty title or content)." }], details: { skipped: "empty" } };
      }

      // Anti-nag: never re-offer the same fact within one session.
      const fp = suggestFingerprint(proposal.title, proposal.content);
      if (offeredThisSession.has(fp)) {
        return { content: [{ type: "text", text: "Already offered this once this session; not asking again." }], details: { skipped: "already-offered" } };
      }

      // Headless / no dialog support → degrade to a text nudge instead of prompting.
      if (!ctx?.hasUI || typeof ctx?.ui?.select !== "function") {
        offeredThisSession.add(fp);
        return {
          content: [{ type: "text", text: `No interactive prompt here. If the user wants to keep "${proposal.title}", save it with memory_write.` }],
          details: { headless: true, proposal },
        };
      }

      offeredThisSession.add(fp); // mark offered regardless of the answer
      const dialogOpts = { timeout: 30000, signal };
      const dup = sameTitlePage(proposal.title);

      let choice: string | undefined;
      try {
        choice = dup
          ? await ctx.ui.select(`Update memory? (similar note: ${dup.title})`, [OPT_UPDATE, OPT_SKIP], dialogOpts)
          : await ctx.ui.select("Remember this?", [OPT_SAVE, OPT_EDIT, OPT_SKIP], dialogOpts);
      } catch {
        return { content: [{ type: "text", text: "Suggestion dismissed." }], details: { skipped: "dialog-error" } };
      }

      // Timeout / Esc → undefined → Skip. Nothing is ever saved without an explicit choice.
      if (!choice || choice === OPT_SKIP) {
        try { ctx.ui.notify("Skipped — won't ask again this session.", "info"); } catch { /* ignore */ }
        return { content: [{ type: "text", text: "Skipped (not saved)." }], details: { skipped: "user" } };
      }

      const toWrite: any = { ...proposal };
      if (choice === OPT_UPDATE && dup) {
        toWrite.title = dup.title;   // write back to the same page…
        toWrite.type = dup.type;     // …in its existing folder, so it updates in place
      }

      if (choice === OPT_EDIT) {
        const t = await ctx.ui.input("Edit memory · title", proposal.title, dialogOpts);
        if (t === undefined) {
          try { ctx.ui.notify("Edit cancelled — not saved.", "info"); } catch { /* ignore */ }
          return { content: [{ type: "text", text: "Edit cancelled (not saved)." }], details: { skipped: "edit-cancelled" } };
        }
        if (t.trim()) toWrite.title = t.trim();
        const c = await ctx.ui.input("Edit memory · content", proposal.content.slice(0, 100), dialogOpts);
        if (c === undefined) {
          try { ctx.ui.notify("Edit cancelled — not saved.", "info"); } catch { /* ignore */ }
          return { content: [{ type: "text", text: "Edit cancelled (not saved)." }], details: { skipped: "edit-cancelled" } };
        }
        if (c.trim()) toWrite.content = c.trim();
      }

      const r = writeMemory(toWrite);
      try { ctx.ui.notify(`Remembered → ${r.path}`, "info"); } catch { /* ignore */ }
      return { content: [{ type: "text", text: `Remembered → ${r.path}` }], details: { saved: true, choice, ...r } };
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

  log(pi, "[memory] tools registered: memory_write, memory_suggest, skill_write, memory_search, memory_get, memory_duplicates");
}
