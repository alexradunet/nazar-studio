# `code/`

Implementation code for the Nazar Pi memory appliance.

This directory is the active **Projects** side of the repository's PARA-lite layout: things that execute, test, configure, or extend Pi live here.

## Layout

- `extensions/` — project-local Pi extensions (Nazar setup, memory, voice, Spotify, WhatsApp).
- `skills/` — standalone project-local Agent Skills (`github-manager`, `windows-setup`).
- `tests/` — standalone regression tests.

## Rules

- Prefer TypeScript/JavaScript for Pi extension logic.
- Keep modules small and inspectable.
- Keep shell glue minimal and portable when possible.
- Put host-specific setup in external docs or local notes, not in this public product tree.
- Do not put durable memory pages or generated rollups here; use `../memory/`.
