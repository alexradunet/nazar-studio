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
 *              "detect → suggest → approve" capture loop (SELF_EVOLUTION.md) for memory; a capture
 *              may carry outcome: success|failure (ReasoningBank-style) so failure lessons
 *              (guardrails) live alongside facts. Before asking it dedupes — offering to update a
 *              same-title note or merge into a similar one rather than create a copy.
 *   - SKILLS → procedures as Pi-native skill files (skills/<name>.md, frontmatter
 *              name/description). Pi discovers, injects, and invokes them (/skill:name).
 *              Tools: skill_write (explicit) / skill_suggest (proactive, asks first); neither
 *              silently overwrites an existing skill. See SELF_EVOLUTION.md.
 *
 * The extension injects relevant saved memory into the turn's system prompt on EVERY turn, for
 * all models. On a frontier/cloud model this sends recalled memory to that provider, so keep
 * secrets out of memory (redact before persisting). Recall is owner-enabled for all models by
 * design — see AGENTS.md; flipping it back to local-only is a deliberate privacy choice.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { writeMemory, appendMemory, searchMemory, getMemory, findDuplicates, recallContext, reindexMemory, type Hit } from "../lib/memory.ts";
import { nodeSqliteUpgradePrompt } from "../lib/node-version.ts";
import { moduleDir } from "../lib/paths.ts";
import { promptMemoryChoice } from "../lib/ui/memory-prompt.ts";

/** Where Pi-native skill files live (declared in package.json `pi.skills`). */
const skillsDir = (): string => process.env.NAZAR_SKILLS_DIR || join(moduleDir(import.meta.url), "..", "skills");

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
const OPT_UPDATE_SKILL = "Update the existing skill";
const OPT_SAVE_NEW = "Save as a new note";

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

const STOPWORDS = new Set("the a an and or but of to in for on with is are be it this that you your my our we they them then than so as at by from into over not no never always".split(" "));

/** Distinctive lowercase tokens (>=3 chars, no stopwords) for cheap overlap scoring. */
function tokenize(s: string): Set<string> {
  const out = new Set<string>();
  for (const t of String(s).toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    if (t.length >= 3 && !STOPWORDS.has(t)) out.add(t);
  }
  return out;
}

/** Body of a memory page (frontmatter stripped), by exact title. */
function memoryBody(title: string): string {
  const md = getMemory(title);
  return md ? md.replace(/^---\n[\s\S]*?\n---\n?/, "").trim() : "";
}

/**
 * Dedupe signal for a proposal. An exact (case-insensitive) title match is a "same-title" hit
 * (update in place). Otherwise the top FTS candidate is a "similar" hit when it shares enough
 * distinctive tokens — caught conservatively (>=3 shared AND >=50% coverage) so a genuinely new
 * fact is rarely mistaken for a near-duplicate. FTS5 + token overlap; no embeddings.
 */
function findSimilarPage(title: string, content: string): { hit: Hit; kind: "same-title" | "similar" } | null {
  const exact = sameTitlePage(title);
  if (exact) return { hit: exact, kind: "same-title" };
  const want = tokenize(`${title} ${content}`);
  if (want.size < 3) return null;
  const wantTitle = title.trim().toLowerCase();
  for (const h of searchMemory(`${title} ${content}`, 6)) {
    if (h.title.trim().toLowerCase() === wantTitle) continue;
    const have = tokenize(`${h.title} ${memoryBody(h.title)}`);
    if (!have.size) continue;
    let shared = 0;
    for (const t of want) if (have.has(t)) shared++;
    if (shared >= 3 && shared / Math.min(want.size, have.size) >= 0.5) return { hit: h, kind: "similar" };
  }
  return null;
}

/** Resolve a skill name to its slug + on-disk path. */
function skillFilePath(name: string): { slug: string; path: string } {
  const slug = slugifySkill(name);
  return { slug, path: join(skillsDir(), `${slug}.md`) };
}

/**
 * Write a Pi-native skill file. Refuses to silently clobber an existing skill unless `overwrite`
 * is set — returns { blocked: true } in that case so the caller can ask or relabel instead.
 */
function writeSkillFile(name: string, description: string, content: string, overwrite: boolean): { slug: string; path: string; blocked?: boolean } {
  const { slug, path } = skillFilePath(name);
  if (existsSync(path) && !overwrite) return { slug, path, blocked: true };
  mkdirSync(skillsDir(), { recursive: true });
  const fm =
    `---\nname: ${slug}\ndescription: ${JSON.stringify((description ?? "").trim())}\n---\n\n` +
    `${String(content ?? "").trim()}\n`;
  writeFileSync(path, fm);
  return { slug, path };
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
      outcome: Type.Optional(Type.Union([Type.Literal("success"), Type.Literal("failure")], { description: "Optional ReasoningBank-style lesson tag: 'success' (a validated approach) or 'failure' (a guardrail — what to avoid and why). Omit for ordinary facts." })),
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
      "When an approach FAILED and you found what works, offer to keep the lesson with outcome:\"failure\" — put the guardrail (what to avoid and why -> do this instead) in the content.",
    ],
    parameters: Type.Object({
      title: Type.String({ description: "Short page title for the fact; also the [[wikilink]] handle." }),
      content: Type.String({ description: "The fact as free-form Markdown, in the user's wording." }),
      type: Type.Optional(Type.String({ description: "Optional folder/category slug. Defaults to notes." })),
      whenToUse: Type.Optional(Type.String({ description: "Optional retrieval hint in the user's terms." })),
      tags: Type.Optional(Type.Array(Type.String({ description: "Optional tag." }))),
      outcome: Type.Optional(Type.Union([Type.Literal("success"), Type.Literal("failure")], { description: "Optional ReasoningBank-style lesson tag: 'success' (validated approach) or 'failure' (a guardrail — what to avoid and why; put it in the content). Omit for ordinary facts." })),
    }),
    async execute(_id: string, p: any, signal: any, _onUpdate: any, ctx: any): Promise<any> {
      const proposal = {
        title: String(p?.title ?? "").trim(),
        content: String(p?.content ?? "").trim(),
        type: p?.type as string | undefined,
        whenToUse: p?.whenToUse as string | undefined,
        tags: p?.tags as string[] | undefined,
        outcome: p?.outcome as ("success" | "failure" | undefined),
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
      const dialogOpts = { timeoutMs: 30000, signal };
      const sim = findSimilarPage(proposal.title, proposal.content);
      const mergeLabel = sim?.kind === "similar" ? `Merge into "${sim.hit.title}"` : "";

      let choice: string | undefined;
      try {
        if (sim?.kind === "same-title") {
          choice = await promptMemoryChoice(ctx, {
            question: `Update memory? (note "${sim.hit.title}" exists)`,
            proposal: { ...proposal, type: sim.hit.type },
            heading: "Proposed replacement",
            meta: "existing note found",
            options: [{ label: OPT_UPDATE }, { label: OPT_SKIP }],
          }, dialogOpts);
        } else if (sim?.kind === "similar") {
          choice = await promptMemoryChoice(ctx, {
            question: `Similar note exists: "${sim.hit.title}"`,
            proposal,
            meta: "possible duplicate",
            options: [{ label: mergeLabel }, { label: OPT_SAVE_NEW }, { label: OPT_SKIP }],
          }, dialogOpts);
        } else {
          choice = await promptMemoryChoice(ctx, {
            question: "Remember this?",
            proposal,
            options: [{ label: OPT_SAVE }, { label: OPT_EDIT }, { label: OPT_SKIP }],
          }, dialogOpts);
        }
      } catch {
        return { content: [{ type: "text", text: "Suggestion dismissed." }], details: { skipped: "dialog-error" } };
      }

      // Timeout / Esc → undefined → Skip. Nothing is ever saved without an explicit choice.
      if (!choice || choice === OPT_SKIP) {
        try { ctx.ui.notify("Skipped — won't ask again this session.", "info"); } catch { /* ignore */ }
        return { content: [{ type: "text", text: "Skipped (not saved)." }], details: { skipped: "user" } };
      }

      // Merge into a similar (different-title) note: append to it, preserving its frontmatter.
      if (sim?.kind === "similar" && choice === mergeLabel) {
        const m = appendMemory(sim.hit.title, proposal.content);
        try { ctx.ui.notify(`Merged into ${m?.path ?? sim.hit.title}`, "info"); } catch { /* ignore */ }
        return { content: [{ type: "text", text: `Merged into [[${sim.hit.title}]].` }], details: { merged: true, into: sim.hit.title, ...(m ?? {}) } };
      }

      const toWrite: any = { ...proposal };
      if (sim?.kind === "same-title" && choice === OPT_UPDATE) {
        toWrite.title = sim.hit.title;   // write back to the same page…
        toWrite.type = sim.hit.type;     // …in its existing folder, so it updates in place
      }

      if (choice === OPT_EDIT) {
        const t = await ctx.ui.input("Edit memory · title", proposal.title, { timeout: dialogOpts.timeoutMs, signal });
        if (t === undefined) {
          try { ctx.ui.notify("Edit cancelled — not saved.", "info"); } catch { /* ignore */ }
          return { content: [{ type: "text", text: "Edit cancelled (not saved)." }], details: { skipped: "edit-cancelled" } };
        }
        if (t.trim()) toWrite.title = t.trim();
        const c = await ctx.ui.input("Edit memory · content", proposal.content.slice(0, 100), { timeout: dialogOpts.timeoutMs, signal });
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
    async execute(_id: string, p: { name: string; description: string; content: string; overwrite?: boolean }): Promise<any> {
      const r = writeSkillFile(p.name, p.description, p.content, !!p.overwrite);
      if (r.blocked) {
        return {
          content: [{ type: "text", text: `Skill "${r.slug}" already exists. Re-run with overwrite: true to replace it, or choose a different name.` }],
          details: { blocked: true, path: r.path, name: r.slug },
        };
      }
      return {
        content: [{ type: "text", text: `Learned skill → ${r.path} (invoke with /skill:${r.slug})` }],
        details: { path: r.path, name: r.slug },
      };
    },
  });

  pi.registerTool({
    name: "skill_suggest",
    label: "offer to learn a skill",
    description:
      "PROACTIVELY offer to turn a recurring procedure into a Pi-native SKILL, asking the user to approve first (Save / Edit / Skip). Call this yourself when you notice the user repeating a multi-step workflow worth capturing as a reusable /skill:name playbook, that isn't already a skill. Nothing is written unless the user approves; prefer skill_write when the user explicitly asks to make a skill.",
    promptSnippet: "skill_suggest — offer (with the user's approval) to capture a recurring procedure as a skill.",
    promptGuidelines: [
      "When the user repeats the same multi-step procedure, offer to capture it as a skill with skill_suggest — it asks before writing.",
      "Offer at most once per procedure; don't re-offer a skill that already exists or was skipped this session.",
      "Use skill_write (not skill_suggest) when the user explicitly asks to make a skill.",
    ],
    parameters: Type.Object({
      name: Type.String({ description: "Skill name; kebab-cased for the file and the /skill: handle." }),
      description: Type.String({ description: "When to use it + what it does — Pi's surfacing hint." }),
      content: Type.String({ description: "The procedure (Markdown): steps, conventions, examples." }),
    }),
    async execute(_id: string, p: any, signal: any, _onUpdate: any, ctx: any): Promise<any> {
      const name = String(p?.name ?? "").trim();
      const description = String(p?.description ?? "").trim();
      const content = String(p?.content ?? "").trim();
      if (!name || !content) {
        return { content: [{ type: "text", text: "Nothing to suggest (empty skill name or content)." }], details: { skipped: "empty" } };
      }
      const { slug, path } = skillFilePath(name);
      const exists = existsSync(path);

      const fp = `skill:${suggestFingerprint(name, content)}`;
      if (offeredThisSession.has(fp)) {
        return { content: [{ type: "text", text: "Already offered this skill once this session; not asking again." }], details: { skipped: "already-offered" } };
      }
      if (!ctx?.hasUI || typeof ctx?.ui?.select !== "function") {
        offeredThisSession.add(fp);
        return { content: [{ type: "text", text: `No interactive prompt here. If the user wants a "${slug}" skill, write it with skill_write.` }], details: { headless: true, slug } };
      }

      offeredThisSession.add(fp);
      const dialogOpts = { timeout: 30000, signal };
      let choice: string | undefined;
      try {
        choice = exists
          ? await ctx.ui.select(`Update skill? (/skill:${slug} exists)`, [OPT_UPDATE_SKILL, OPT_SKIP], dialogOpts)
          : await ctx.ui.select(`Make this a skill? (/skill:${slug})`, [OPT_SAVE, OPT_EDIT, OPT_SKIP], dialogOpts);
      } catch {
        return { content: [{ type: "text", text: "Suggestion dismissed." }], details: { skipped: "dialog-error" } };
      }
      if (!choice || choice === OPT_SKIP) {
        try { ctx.ui.notify("Skipped — won't ask again this session.", "info"); } catch { /* ignore */ }
        return { content: [{ type: "text", text: "Skipped (no skill written)." }], details: { skipped: "user" } };
      }

      let finalName = name;
      let finalDesc = description;
      if (choice === OPT_EDIT) {
        const n = await ctx.ui.input("Edit skill · name", name, dialogOpts);
        if (n === undefined) {
          try { ctx.ui.notify("Edit cancelled — no skill written.", "info"); } catch { /* ignore */ }
          return { content: [{ type: "text", text: "Edit cancelled (no skill written)." }], details: { skipped: "edit-cancelled" } };
        }
        if (n.trim()) finalName = n.trim();
        const d = await ctx.ui.input("Edit skill · description", description, dialogOpts);
        if (d === undefined) {
          try { ctx.ui.notify("Edit cancelled — no skill written.", "info"); } catch { /* ignore */ }
          return { content: [{ type: "text", text: "Edit cancelled (no skill written)." }], details: { skipped: "edit-cancelled" } };
        }
        if (d.trim()) finalDesc = d.trim();
      }

      const r = writeSkillFile(finalName, finalDesc, content, choice === OPT_UPDATE_SKILL);
      if (r.blocked) {
        return { content: [{ type: "text", text: `A skill "${r.slug}" already exists — not overwritten.` }], details: { blocked: true, path: r.path, name: r.slug } };
      }
      try { ctx.ui.notify(`Learned skill → /skill:${r.slug}`, "info"); } catch { /* ignore */ }
      return { content: [{ type: "text", text: `Learned skill → ${r.path} (invoke with /skill:${r.slug})` }], details: { saved: true, choice, path: r.path, name: r.slug } };
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

  log(pi, "[memory] tools registered: memory_write, memory_suggest, skill_write, skill_suggest, memory_search, memory_get, memory_duplicates");
}
