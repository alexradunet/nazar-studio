# `.pi/`

Project-local Pi discovery/configuration directory.

## Contract

- Keep this directory small.
- `settings.json` is the source of truth for project-local Pi resources.
- Do not store raw sessions here manually.
- Do not treat `.pi/npm/` or `.pi/git/` as project source; they are package/cache directories managed by Pi.

## Current resources

- Project extensions are loaded from `.pi/settings.json`:
  - `../packages/core/code/extensions/nazar.ts`
  - `../packages/memory/code/extensions/memory.ts`
  - `../packages/voice/code/extensions/voice.ts`
- Project skills are loaded from `.pi/settings.json`.
- Installed package resources are listed in `.pi/settings.json`.

## Operational note

After editing project extensions or skills, run `/reload` in Pi or restart Pi from the repository root.
