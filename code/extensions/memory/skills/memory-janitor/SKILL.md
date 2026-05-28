---
name: memory-janitor
description: Use when the user asks Pi to curate memory, consolidate docs/research into the configured Nazar memory vault, update pinned memory, clean or organize the memory store, run memory janitorial duty, or preserve durable project knowledge after complex work.
---

# Memory Janitor

Use this Agent Skill to maintain the configured Nazar memory vault and conversation memory hygiene. The project-local memory extension contributes this skill and owns the `/memory` command plus `memory_status` and `memory_search` tools.

## Core rules

- Treat the configured `NAZAR_HOME` vault (or explicit `PI_*` memory paths) as the durable knowledge base.
- Start with `memory_status` to inspect current paths before editing files directly.
- Prefer `/memory remember`, `/memory forget`, `/memory search`, and `/memory update` over hard-coded paths.
- Keep generated rollups generated. Do not manually edit generated rollups except for repair.
- Put human-curated long-term facts in pinned memory, preferably through `/memory remember` inside Pi when practical.
- Put synthesized durable knowledge in the configured durable pages/wiki locations shown by `memory_status`.
- Put raw reports, copied analyses, and source material under the configured sources directory shown by `memory_status`.
- Do not add memory pages, rollups, journals, sources, or model/state files to the public git repository.
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
- `memory_search` — refresh and search durable pages through scoped QMD collections.

## Janitorial workflow

1. **Inventory** relevant docs, analyses, reports, current memory pages, and current paths from `memory_status`.
2. **Classify** each item:
   - raw/source artifact → configured sources directory
   - synthesized durable page → configured durable pages/wiki directory
   - human-curated standing fact → pinned memory
   - transient/generated chat memory → leave to `/compact` and configured rollups
3. **Preserve sources** by copying important transient reports into a dated source folder under the configured sources directory.
4. **Synthesize pages** in the configured durable pages/wiki area with decisions, current state, validation, open questions, and links to sources.
5. **Update maps/logs** if the configured vault has an index/log page.
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

- New pages/sources are under configured external memory paths, not public repo paths.
- Important new pages are discoverable from the vault's index/log convention when present.
- `/memory update` has run after large page changes.
- Built-in `/compact` has run when generated rollups should reflect the current chat.
- The final reply lists changed files and validation commands.

## Safety

- Do not delete source reports or project docs unless the user explicitly asks.
- Do not expose secrets or copy secret material into memory pages, sources, or rollups.
- Do not silently rewrite Agent Skills; ask before skill self-improvement unless the user explicitly requested it.
- Current user direction, `AGENTS.md`, and system/developer instructions override memory.
