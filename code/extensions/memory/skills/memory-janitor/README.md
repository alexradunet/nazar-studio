# `memory-janitor`

Agent Skill contributed by the project-local memory extension.

## Purpose

- Maintain the configured Nazar memory vault as a concise, searchable durable wiki.
- Preserve useful raw/source artifacts under the configured sources path when needed.
- Keep public git free of memory pages, rollups, journals, sources, and local model/state files.
- Use `/memory` commands, `memory_status`, and `memory_search` rather than separate helper CLIs or hard-coded repo paths.

## Loading

`code/extensions/memory.ts` exposes this directory through Pi's `resources_discover` extension event, so `.pi/settings.json` does not need a standalone `skills` entry for it.
