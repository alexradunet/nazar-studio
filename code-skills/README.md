# Nazar skills — the CODE rung of self-evolution

Self-evolution has **two rungs** (full design: [`../docs/SELF_EVOLUTION.md`](../docs/SELF_EVOLUTION.md)):
1. **Procedure skills** (the default) — Pi-native Markdown playbooks under `skills/`, written
   with `skill_write`; Pi discovers, injects, and invokes them (`/skill:name`). Most growth
   happens here, with no code.
2. **Code skills** (this directory) — TS Pi extensions, for when a capability needs genuinely
   new tooling (API calls, computation). Heavier, and gated by `make skill-check`.

Agent-authored **code** skills live here. Nazar can **propose** one, but a human **approves**
it before it runs.

## The loop (Stage 0 — git-gated)
1. **Detect / decide** — a workflow repeats, or you say "make this a skill."
2. **Generate** — Nazar writes a new skill from [`TEMPLATE.skill.ts`](./TEMPLATE.skill.ts)
   into `code-skills/proposed/<name>.ts` **on a git branch** (never the live process).
3. **Validate** — `make skill-check FILE=code-skills/proposed/<name>.ts`
   (denylist scan + capability header + compile). The automated half of the gate.
4. **Review** — Nazar opens a PR; **you** read the diff and approve it.
5. **Promote** — merge to `main`, then `/reload` in Pi loads the skill.
6. **Rollback** — anything goes wrong → `git revert`. The skill was always just a commit.

## Rules
- Every skill declares a `@capability:` header (reads / writes / network).
- No `child_process`, `eval`, raw secret access, or network outside the allowlist.
- Skills touch only their declared paths.

See [`../docs/SELF_EVOLUTION.md`](../docs/SELF_EVOLUTION.md) for the full design and the
roadmap to more autonomy.
