# `memory-janitor`

Agent Skill contributed by the project-local memory extension.

## Purpose

- Maintain the configured Nazar memory vault as a concise, searchable durable wiki.
- Preserve useful raw/source artifacts as durable source notes under the configured pages/wiki path when needed.
- Keep public git free of memory pages, rollups, raw transcripts, and local model/state files.
- Use `/memory` commands, `memory_status`, and `memory_search` rather than separate helper CLIs or hard-coded repo paths.

## Loading

`@nazar/memory` exposes this directory through its Pi package manifest. The source checkout also lists it in `.pi/settings.json` for local development.
