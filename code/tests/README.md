# `code/tests/`

Standalone regression tests for project-local code.

## Current tests

- `pi-memory.test.mjs` — validates memory path derivation, pinned memory helpers, generated rollups, QMD command construction, and `/memory` command shape.
- `pi-spotify.test.mjs` — validates Spotify callback parsing and URL normalization.
- `pi-whatsapp.test.mjs` — validates WhatsApp JID normalization, inbound filtering, message extraction, and assistant text helpers.

## Run

```sh
node --test
```

## Rules

- Tests should not require network access.
- Use temporary directories for generated data.
- Keep tests runnable from the repository root.
- Add tests when changing memory behavior, path conventions, or command surfaces.
