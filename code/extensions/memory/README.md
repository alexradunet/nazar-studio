# `code/extensions/memory/`

Implementation modules for the project-local Pi memory extension.

## Files

- `paths.ts` — derives memory paths and QMD identifiers from the project root, optional `NAZAR_HOME`, optional Nazar setup config, and explicit `PI_MEMORY_ROOT`, `PI_MEMORY_PAGES_DIR`, `PI_AI_MEMORY_DIR`, and `PI_HUMAN_MEMORY_DIR` overrides.
- `memory-use.ts` — implements pinned memory, generated rollups, QMD indexing/search, durable-memory system-prompt injection, and `/memory` command helpers.
- `vault.ts` — creates the portable vault scaffold and vault-local guidance files.
- `skills/memory-janitor/` — Agent Skill contributed by the memory extension for durable memory curation workflows.

## Portable vault ownership

Preferred real-use layout is a private Obsidian vault:

```txt
NazarVault/
  00_Inbox/       # shared human/AI capture
  01_Projects/    # human-owned active outcomes
  02_Areas/       # human-owned ongoing responsibilities
  03_Resources/   # stable human-facing references
  04_Archive/     # cold storage, excluded by default
  05_Nazar/       # AI/system control plane
```

When `NAZAR_HOME` is set, defaults are derived from it:

- `PI_MEMORY_ROOT` → `$NAZAR_HOME/05_Nazar/runtime`
- `PI_MEMORY_PAGES_DIR` → `$NAZAR_HOME`
- `PI_AI_MEMORY_DIR` → `$NAZAR_HOME/05_Nazar/llm-wiki/wiki`
- `PI_HUMAN_MEMORY_DIR` → `$NAZAR_HOME`

`05_Nazar/llm-wiki/raw` stores immutable source snapshots. `05_Nazar/llm-wiki/wiki` stores AI-maintained compiled wiki pages with `index.md` and `log.md`. `05_Nazar/runtime` stores generated transferable state (`rollups`, `state`, `journal`, `sources`, `indexes`, and `archive`).

## Repository fallback

If no vault/setup/env path is configured in a source checkout, data defaults remain repository-local for development compatibility:

- durable pages: `memory/pages/`
- generated rollups/state: `memory/`

The public repo does not track this tree. Treat repo-local `memory/` as ignored local runtime state only; real human/private memory, journals, rollups, source reports, and local model/state files belong in `NAZAR_HOME` or explicit external `PI_*` paths.

## Rules

- Raw Pi JSONL sessions remain in Pi's default session storage.
- Use Pi's built-in `/compact`; this extension listens for `session_compact` and refreshes rollups.
- On each user turn, pinned memory bullets and a bounded recent closed rollup digest are appended to the system prompt when present. Empty pinned-memory templates are skipped.
- Do not reintroduce `/memory compact`, `memory_compact`, `/context`, or a separate memory helper CLI.
- In vault mode, QMD uses scoped collections for active personal folders, the compiled LLM wiki, optional AI/project pages, and archive. Default search excludes `04_Archive`.
- Keep memory curation instructions in the integrated `memory-janitor` skill; keep storage/indexing behavior in extension code.
