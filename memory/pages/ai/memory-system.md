# Memory system

Updated after removing prompt context on 2026-05-28.

## Purpose

The memory system keeps a small, truthful durable wiki for future Pi sessions. It should be curated knowledge, not a transcript dump. Memory is retrieved explicitly through scoped QMD search instead of prompt-injecting generated context.

## Preferred private backend

Real memory should live in a private portable Obsidian vault. Set:

```sh
NAZAR_HOME="$HOME/NazarVault"
```

Nazar derives:

```txt
PI_MEMORY_ROOT=$NAZAR_HOME/05_Nazar/runtime
PI_MEMORY_PAGES_DIR=$NAZAR_HOME
PI_AI_MEMORY_DIR=$NAZAR_HOME/05_Nazar/llm-wiki/wiki
PI_HUMAN_MEMORY_DIR=$NAZAR_HOME
```

Vault layout:

```txt
NazarVault/
  00_Inbox/        shared human/AI capture
  01_Projects/     active outcomes
  02_Areas/        ongoing responsibilities
  03_Resources/    stable references
  04_Archive/      cold storage, excluded from default search
  05_Nazar/        AI/system control plane
```

`05_Nazar/llm-wiki/raw` stores immutable source snapshots. `05_Nazar/llm-wiki/wiki` stores AI-maintained compiled wiki pages, including `index.md` and `log.md`. `05_Nazar/runtime` stores generated rollups, state, journal entries, sources, indexes, archive, and other transferable backend state.

## Public repository fallback

The public repository tracks AI/infrastructure durable pages under `memory/pages/ai/` plus skeleton README files. If no vault/setup/env path is configured, Nazar still falls back to repo-local `memory/` paths for development compatibility.

Private/generated memory should remain external to the public repo. Never commit real human memory, private journal entries, rollups, source reports, OAuth material, WhatsApp auth state, local model downloads, or secrets.

## QMD search scopes

In repo-local fallback mode, QMD uses the legacy `memory-pages` collection rooted at `memory/pages`.

In vault mode, QMD uses scoped collections:

- `memory-inbox` → `00_Inbox`
- `memory-projects` → `01_Projects`
- `memory-areas` → `02_Areas`
- `memory-resources` → `03_Resources`
- `memory-llm-wiki` → `05_Nazar/llm-wiki/wiki`
- `memory-archive` → `04_Archive`
- `memory-ai` → optional external AI/project pages when configured separately

Default search includes active personal folders plus the compiled LLM wiki and excludes archive. Use `/memory search --scope archive <query>` for cold memory and `/memory search --scope all <query>` for broad recall.

The assistant should infer scope from conversation intent rather than relying on a global context mode.

## Pinned memory

Pinned memory stores stable human-curated facts and preferences. In vault mode it lives at:

```txt
$NAZAR_HOME/05_Nazar/pinned-memory.md
```

Current user instructions and `AGENTS.md` override pinned memory.

Useful commands inside Pi:

```txt
/memory pinned
/memory remember [user|fact|project|never] <text>
/memory forget <unique substring>
```

## Generated rollups and journaling

- Daily/weekly/monthly generated memory lives under `PI_MEMORY_ROOT/rollups`.
- Use Pi's built-in `/compact`; the memory extension listens for `session_compact` and refreshes rollups.
- There is no `/journal` command surface.
- The assistant can append concise private journal entries under `PI_MEMORY_ROOT/journal/entries/YYYY-MM-DD.md` when appropriate, but journal entries are never QMD-indexed by default.
- Journal entries are source material. Promotion to pinned memory, active vault notes, or LLM wiki pages requires explicit approval.

## Maintenance

- The memory extension contributes the `memory-janitor` Agent Skill from `code/extensions/memory/skills/memory-janitor/` for substantial curation work.
- Keep pages concise and current.
- Remove stale historical assumptions instead of preserving them as truth.
- Append/update `05_Nazar/llm-wiki/wiki/log.md` for meaningful LLM-wiki maintenance.
- Run `/memory update` after durable page changes so QMD reflects the current wiki.
- Avoid launching multiple raw `qmd` CLI operations concurrently against the same index; QMD uses SQLite and can report `database is locked`.
