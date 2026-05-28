# `memory-janitor`

Agent Skill contributed by the project-local memory extension.

## Purpose

- Maintain `memory/pages/` as a concise, searchable durable wiki.
- Preserve useful raw/source artifacts under `memory/sources/` when needed.
- Update `memory/pages/index.md` and `memory/journal/log.md` for meaningful memory changes.
- Use `/memory` commands, `memory_status`, and `memory_search` rather than separate helper CLIs.

## Loading

`code/extensions/memory.ts` exposes this directory through Pi's `resources_discover` extension event, so `.pi/settings.json` does not need a standalone `skills` entry for it.
