# `@nazar/memory` memory modules

Implementation modules for the project-local Pi memory extension.

## Files

- `paths.ts` — derives memory paths from the project root, optional `NAZAR_HOME`, optional Nazar setup config, and repo-local development fallback.
- `memory-use.ts` — implements pinned memory, generated rollups, dependency-free local markdown search, durable-memory system-prompt injection, and `/memory` command helpers.
- `life-state.ts` — owns versioned private Life OS continuity state under `getMemoryPaths().STATE_DIR/life/life.json` and projects a read-only `life.md` beside the control plane on every write.
- `life-text.ts` — renders bounded Life OS status/readouts for command and tool consumers and the vault-facing `life.md` projection.
- `life-use.ts` — handles the `/memory life ...` command namespace without registering a top-level `/life` command.
- `life-tools.ts` — registers focused Life OS model tools for on-demand readout and narrow profile/goal/reflection updates.
- `vault.ts` — creates the portable vault scaffold and vault-local guidance files.
- `skills/memory-janitor/` — Agent Skill packaged with `@nazar/memory` for durable memory curation workflows.

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

When `NAZAR_HOME` is set, memory paths are derived from it:

- runtime/state → `$NAZAR_HOME/05_Nazar/runtime`
- searchable vault/pages root → `$NAZAR_HOME`
- AI-maintained compiled wiki → `$NAZAR_HOME/05_Nazar/llm-wiki/wiki`
- human-authored memory pages → `$NAZAR_HOME`

`05_Nazar/llm-wiki/wiki` stores AI-maintained compiled wiki pages with `index.md` and `log.md`. `05_Nazar/life.md` is a generated read-only Life OS projection for Obsidian browsing; canonical Life OS state stays in `05_Nazar/runtime/state/life/life.json`. `05_Nazar/runtime` stores generated transferable state (`rollups`, `state`, and private Life OS continuity JSON).

## Repository fallback

If no vault/setup/env path is configured in a source checkout, data defaults remain repository-local for development compatibility:

- durable pages: `memory/pages/`
- generated rollups/state: `memory/`

The public repo does not track this tree. Treat repo-local `memory/` as ignored local runtime state only; real human/private memory, rollups, copied reports, Life OS state, and local model/state files belong in `NAZAR_HOME` or extension-specific external paths.

## Rules

- Raw Pi JSONL sessions remain in Pi's default session storage.
- Use Pi's built-in `/compact`; this extension listens for `session_compact` and refreshes rollups.
- On each user turn, pinned memory bullets and a bounded recent closed rollup digest are appended to the system prompt when present. Empty pinned-memory templates are skipped.
- Life OS continuity state is private JSON and on-demand only: `/memory life ...` commands and focused `life_*` tools may read or update it, but it is not searched by `memory_search` and is not appended to the default prompt.
- Keep Life OS reset behavior command-only and explicit (`/memory life reset`, `/memory life profile|goal|reflection reset`); model tools expose narrow set/update/remove operations, not broad reset dispatch.
- Do not reintroduce `/memory compact`, `memory_compact`, `/context`, or a separate memory helper CLI.
- Do not register a top-level `/life` command; Life OS user commands stay under `/memory life ...`.
- In vault mode, local markdown search scans active folders, pinned memory, and the compiled LLM wiki. Default search excludes `04_Archive`; use `--scope archive` for cold storage.
- Keep memory curation instructions in the integrated `memory-janitor` skill; keep storage/indexing behavior in extension code.
