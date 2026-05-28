# `code/skills/`

Standalone project-local Agent Skills loaded directly from `.pi/settings.json`.

## Current skills

- `github-manager/` — GitHub profile and repository management workflows through the `gh` CLI.
- `windows-setup/` — Windows dependency installation and Nazar configuration workflows, including FFmpeg voice input setup.

## Historical notes

- The old `spotify-dj/` skill was removed. Spotify is handled by the Pi extension at `code/extensions/spotify.ts` and its `spotify_control` tool plus `/spotify` command.
- The old `wiki-janitor/` skill was renamed to `memory-janitor` and integrated into the memory extension at `code/extensions/memory/skills/memory-janitor/`.

## Rules

- Prefer a Pi TypeScript extension when the harness needs typed tools, commands, OAuth, or runtime integration.
- Prefer an Agent Skill when instructions/workflow guidance are enough.
- Do not store durable user/project memory inside a skill; use the configured memory vault through `/memory`, `memory_status`, and `memory_search`.
- On Windows, every Nazar host dependency should be installed through `winget` when a winget package exists; ask before using any other installer.

## After edits

Run `/reload` in Pi or restart Pi from the repository root.
