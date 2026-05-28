# Nazar

Nazar is a Pi-native, OS-agnostic, local-first memory appliance built from TypeScript extensions. The core runtime provides durable memory and searchable project knowledge; optional integrations add voice/TTS, Spotify control, and WhatsApp bridging.

The public repository contains code, tests, docs, templates, and AI/infrastructure durable memory. Human/private memory should live outside git or in a private checkout.

## Pi resources

`.pi/settings.json` loads:

- `code/extensions/nazar.ts` — `/nazar-setup` and `/nazar-status` for post-install setup/status across memory, voice, WhatsApp, and Spotify.
- `code/extensions/memory.ts` — `/memory`, `memory_status`, `memory_search`, and the integrated `memory-janitor` Agent Skill.
- `code/extensions/voice.ts` — `/tts`, `/voice`, `tts_toggle`, and push-to-talk voice input.
- `code/extensions/spotify.ts` — `/spotify` and `spotify_control` through the Spotify Web API.
- `code/extensions/whatsapp.ts` — a minimal one-whitelisted-contact WhatsApp bridge.
- `code/skills/` — standalone project Agent Skills.

## Host boundary

Nazar does not ship host operating-system configuration. Install Pi, Node.js, QMD, audio helpers, GitHub CLI, or other optional host tools through the package manager for your own platform. On Windows, install Nazar host dependencies through `winget` when a winget package exists. Runtime assumptions belong in TypeScript extension code, settings, or documented environment variables — not in machine-specific host configuration.

## Portable Obsidian memory backend

For real use, point Nazar at a private portable Obsidian vault. The vault root is the personal memory layer; `05_Nazar/` is the AI/system control plane and runtime backend:

```sh
export NAZAR_HOME="$HOME/NazarVault"
# Optional explicit overrides; otherwise derived from NAZAR_HOME:
export PI_MEMORY_ROOT="$NAZAR_HOME/05_Nazar/runtime"
export PI_MEMORY_PAGES_DIR="$NAZAR_HOME"
export PI_AI_MEMORY_DIR="$NAZAR_HOME/05_Nazar/llm-wiki/wiki"
export PI_HUMAN_MEMORY_DIR="$NAZAR_HOME"
```

Nazar scaffolds this Obsidian-friendly layout when `NAZAR_HOME` or `/nazar-setup memory` is used:

```txt
NazarVault/
  00_Inbox/
  01_Projects/
  02_Areas/
  03_Resources/
  04_Archive/
  05_Nazar/
    llm-wiki/{raw,wiki}/
    runtime/{rollups,state,journal,sources,indexes,archive}/
    ai-workbench/{proposals,drafts,scratch}/
    operator-log/
```

`00_Inbox` is shared human/AI capture. `01_Projects`, `02_Areas`, and `03_Resources` are human-owned personal memory. `04_Archive` is cold storage and excluded from default memory search. `05_Nazar/llm-wiki/wiki` is the AI-maintained Karpathy-style compiled wiki layer. `05_Nazar/runtime` contains generated transferable state.

If no vault is configured, repo-local development still falls back to the public `memory/` skeleton. Generated rollups, journals, source reports, human/private pages, and local state are ignored by default in this public repo. Public AI/infrastructure pages live under `memory/pages/ai/`.

## Install and setup

Published package target:

```sh
pi install npm:@nazar/nazar-pi
pi
/nazar-setup   # opens the TUI setup dashboard; choose "Run full setup"
/reload
```

Repo-local development:

```sh
cd /path/to/nazar
pi
/nazar-setup
```

Useful checks:

```sh
pi --no-session --offline -p "/nazar-status"
pi --no-session --offline -p "/memory status"
pi --no-session --offline -p "/tts status"
pi --no-session --offline -p "/voice help"
pi --no-session --offline -p "/spotify help"
pi --no-session --offline -p "/whatsapp status"
node code/tests/pi-memory.test.mjs
node code/tests/pi-spotify.test.mjs
node code/tests/pi-whatsapp.test.mjs
```

## Privacy rule

Do not commit private journal entries, generated rollups, source reports, personal durable pages, OAuth tokens, WhatsApp auth state, or local voice models.
