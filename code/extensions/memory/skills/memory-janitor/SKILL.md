---
name: memory-janitor
description: Use when the user asks Pi to curate memory, consolidate docs/research into memory/pages, update pinned memory, clean or organize the memory store, run memory janitorial duty, or preserve durable project knowledge after complex work.
---

# Memory Janitor

Use this Agent Skill to maintain `/home/nazar/nazar/memory` and conversation memory hygiene. The project-local memory extension contributes this skill and owns the `/memory` command plus `memory_status` and `memory_search` tools.

## Core rules

- Treat `/home/nazar/nazar/memory/pages` as the durable knowledge base.
- Read `memory/AGENTS.md`, `memory/pages/index.md`, and recent `memory/journal/log.md` before substantial memory edits.
- Keep `memory/rollups/` generated. Do not manually edit generated rollups except for repair.
- Put human-curated long-term facts in `memory/pages/personal/pinned-memory.md`, preferably through `/memory remember` inside Pi when practical.
- Put synthesized durable knowledge in `memory/pages/`.
- Put raw reports, copied analyses, and source material in `memory/sources/`.
- Update `memory/pages/index.md` and append to `memory/journal/log.md` whenever adding or materially changing memory pages.
- Prefer concise consolidation over dumping duplicate text.
- Use Pi's built-in `/compact` when the current chat should be compacted; do not use or recreate `pi-memory`, `/memory compact`, or `memory_compact`.

## Memory extension surface

Use the native memory extension first:

```txt
/memory status
/memory search <query>
/memory query <query>
/memory update
/memory index
/memory list [path]
/memory get <path-or-docid>
/memory pinned
/memory remember [user|fact|project|never] <text>
/memory forget <unique substring>
```

Tools available to agents:

- `memory_status` — inspect memory paths, rollups, pinned memory, and QMD index status.
- `memory_search` — refresh and search durable pages through QMD collection `memory-pages`.

## Janitorial workflow

1. **Inventory** relevant docs, analyses, reports, and current memory pages.
2. **Classify** each item:
   - raw/source artifact → `memory/sources/...`
   - synthesized durable page → `memory/pages/...`
   - human-curated standing fact → pinned memory
   - transient/generated chat memory → leave to `/compact` and `memory/rollups/`
3. **Preserve sources** by copying important transient reports into a dated source folder, for example:

```txt
memory/sources/project-reports/YYYY-MM-DD/<topic>/
```

4. **Synthesize pages** under `memory/pages/` with decisions, current state, validation, open questions, and links to sources.
5. **Update maps**:
   - add pages/source groups to `memory/pages/index.md`
   - append a dated note to `memory/journal/log.md`
6. **Refresh search** after meaningful changes:

```txt
/memory update
```

7. **Refresh generated rollups** only by using built-in Pi compaction when appropriate:

```txt
/compact
```

## Pinned memory policy

Use pinned memory for stable facts that should be present in future sessions without searching.

Good examples:

- user preferences;
- canonical architecture decisions;
- active long-running projects;
- explicit "do not remember" items.

Avoid pinning:

- temporary debug observations;
- full logs;
- tool output;
- facts already obvious from `AGENTS.md` unless they are frequently needed.

Commands:

```txt
/memory pinned
/memory remember [user|fact|project|never] <text>
/memory forget <unique substring>
```

## Quality checklist

Before finishing memory janitorial work:

- New pages are linked from `memory/pages/index.md`.
- New source directories have a short `README.md` when useful.
- `memory/journal/log.md` explains what changed and why.
- `/memory update` has run after large page changes.
- Built-in `/compact` has run when generated rollups should reflect the current chat.
- The final reply lists changed files and validation commands.

## Safety

- Do not delete source reports or project docs unless the user explicitly asks.
- Do not expose secrets or copy secret material into memory pages, sources, or rollups.
- Do not silently rewrite Agent Skills; ask before skill self-improvement unless the user explicitly requested it.
- Current user direction, `AGENTS.md`, and system/developer instructions override memory.
