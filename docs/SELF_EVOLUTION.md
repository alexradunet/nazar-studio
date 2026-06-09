<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Self-evolution — the software that grows with you

Nazar gets more useful over time by **growing its own knowledge** — facts it remembers and
procedures it learns. Growth is **suggest → approve**: Nazar proposes a reviewable change; you
say yes; it ships. No model retraining, no black box. We deliberately split the two so each
rides the simplest mechanism that fits, instead of a custom unified index:

## Two kinds of knowledge, each on its native rail

| | Memory (facts) | Skill (procedure) |
|---|---|---|
| Is | a **fact** (who/what/preference/decision) | a **procedure** (how to do a recurring thing) |
| Lives | `vault/memory/` — **private** (gitignored) | `skills/<name>.md` — **tracked** (reviewable) |
| Tool | `memory_write` (explicit) · `memory_suggest` (proactive, asks first) | `skill_write` (explicit) · `skill_suggest` (proactive, asks first) |
| Engine | Nazar's own FTS5 index; auto-recalled every turn on all models (`recallContext`) | **Pi-native skills** — Pi discovers, injects & invokes them (`/skill:name`) |
| Keystone | `whenToUse` (natural-language "use this when…") | `description` (Pi's surfacing hint) |

**Memory** is plain Markdown facts under `vault/memory/`, indexed by a disposable FTS5
accelerator and recalled by relevance; the body is organic and the frontmatter (`whenToUse` /
`tags` / `pinned`) is an optional retrieval aid. Pinned pages are always in context; the rest
surface when relevant.

**Skills are Pi-native.** A skill is a Markdown file under `skills/` with `name` /
`description` frontmatter (the Agent-Skills standard). Pi itself discovers them, injects their
descriptions into the prompt, and lets you invoke one explicitly with `/skill:name` — so Nazar
keeps **no custom skill index**. `skill_write` simply writes the file; `pi/` is a Pi package
(its `package.json` `pi` manifest), so the new skill is loaded on the next start.

A third, heavier rung exists for when a procedure needs **real new code** (API calls,
computation): a **code skill** — a TS Pi *extension* under [`../code-skills/`](../code-skills/)
(distinct from the Markdown procedure skills in `skills/`), gated by `npm run skill-check`. Most
growth never needs it; prefer a procedure skill.

## The growth loop

```
detect → suggest → approve → write → ship → refine / consolidate
```

- **detect** — Nazar notices a recurring or structured need *in conversation* (you journal
  most evenings; you keep asking for the same report). Judgment, not telemetry.
- **suggest** — it offers plainly: "want me to make this a repeatable skill + a memory area?"
- **approve** — you say yes (or shape it). Nothing is created unilaterally.
- **write** — `skill_write` the procedure (with a clear `description`); set up the memory area.
- **ship** — it's a git change under `skills/`: commit → push → `/reload` in the `pi`
  terminal, and Pi loads the new skill. Memory facts are personal and just live in the private
  vault (backed up via `backup.sh`).
- **refine / consolidate / prune** — improve a skill file as you learn what works; run
  `memory_duplicates` to spot near-duplicate facts and propose a **merge**; and propose
  **removing** a skill that's gone unused or been superseded. Knowledge organizes itself by
  addition *and* subtraction, not just accretion.
- **reflect (periodically)** — when asked (or in a quiet moment), Nazar reviews recent activity
  and proposes a small batch of evolutions (add / consolidate / prune) as one reviewable change.
  Judgment, not telemetry. (A future Pi extension/tmux bridge could run proactive checks —
  deferred until you want that.)

## Principle & safety

- **Never edits its own running process blindly.** Skills (`skills/`) and code skills land as
  reviewable git changes; memory is reversible (`git revert`, or the vault's own history).
- **Code skills** keep the gate: `scripts/skill-validate.ts` (denylist + capability header +
  compile) before a human approves. Procedure pages need only your approval (no code = low risk).
- **Human-in-the-loop by default.** Nazar suggests; you approve.

## Staged autonomy

- **Stage 0** — explicit capture ("make this a skill"). *(Works today.)*
- **Stage 1 (now)** — Nazar **suggests** evolutions from needs it notices; you approve.
- **Stage 2** — auto-detect candidates from usage, still human-approved.
- **Stage 3 (horizon)** — broader self-modification, gated by evals + rollback.

Each step forward requires the previous one to be boring and trusted first.

## Prior art & why we stay minimal (Pareto)

Nazar's design is a deliberate **80/20** of a crowded space. What we borrow, and the heavy
machinery we *decline* (great ideas at disproportionate cost for a single-user box):

- **Hermes** (Nous Research) — auto-synthesizes workflows into version-controlled Markdown
  skills; 3-layer memory (durable + FTS5 + a Honcho user-model). **Take:** version-controlled
  Markdown skills. **Skip:** the Honcho user-model and *auto*-synthesis (we suggest, you approve).
- **Hyperagent** — skills + memories as knowledge items with a `whenToUse` surfacing hint and a
  suggest → draft-card → confirm flow. **Take:** `whenToUse` + the suggest-then-confirm gate.
  **Skip:** the card is just a **git diff**; the store is just files.
- **titan-pi-memory** — auto-capture + LLM fact-extraction + **embeddings** + SQLite + a graph
  UI. **Skip all of it:** FTS5 + `whenToUse` gives ~80% of recall for a fraction of the moving
  parts (no embedding model, extraction provider, server, or graph).
- **pi-evolve-daily** — a daily analyzer with apply/skip/**rollback**. **Take:** the periodic
  *reflection* idea (as protocol; `git revert` is our rollback). **Skip:** the standing job.
- **pk-pi-hermes-evolve** — evolve instruction artifacts via an LLM-judge + DSPy/GEPA, datasets,
  OpenTelemetry. **Take:** never-overwrite + human-review (already our git gate). **Skip:** the
  whole eval harness — overkill for a personal agent.
- **pi-skill-evolution** — mines session history (n-grams) for skill candidates + tracks skill
  **health**. **Take:** *pruning* unused/superseded skills — but by judgment. **Skip:** the
  mining + metrics infrastructure.
- **pi-evo-research** — population-guided **benchmark** optimization of code. Different problem;
  **Skip.** We do keep its best rule: *a simpler change beats a complex one of equal value.*

The throughline: plain files + git + your approval — FTS5 for facts, **Pi's own skill system**
for procedures. We add a feature only when ~80% of its value can't be had for ~20% of the build,
and we **remove** anything that stops paying for itself: we carried a unified memory+skill index
briefly and **cut it** once Pi-native skills did the procedure half for free (and dropped an
`importance` field that wasn't earning its place in ranking).
