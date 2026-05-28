# `.pi/`

Project-local Pi discovery/configuration directory.

## Contract

- Keep this directory small.
- `settings.json` is the source of truth for project-local Pi resources.
- Do not store raw sessions here manually.
- Do not treat `.pi/npm/` or `.pi/git/` as project source; they are package/cache directories managed by Pi.

## Current resources

- Project extensions are loaded from `.pi/settings.json`:
  - `../code/extensions/nazar.ts`
  - `../code/extensions/memory.ts`
  - `../code/extensions/voice.ts`
  - `../code/extensions/spotify.ts`
  - `../code/extensions/whatsapp.ts`
- The memory extension contributes the `memory-janitor` Agent Skill through Pi resource discovery.
- Installed package resources are listed in `.pi/settings.json`.

## Operational note

After editing project extensions or skills, run `/reload` in Pi or restart Pi from `/home/nazar/nazar`.
