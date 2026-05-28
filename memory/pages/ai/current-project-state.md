# Current project state

Updated after adding the Nazar setup package surface on 2026-05-28.

## Repository

- Public code/infrastructure repository: `https://github.com/alexradunet/nazar`.
- Private memory-only repository: `https://github.com/alexradunet/nazar-private`.
- The public repository contains TypeScript Pi extension code, tests, docs, and public AI/infrastructure durable pages under `memory/pages/ai/`.
- The private repository intentionally contains only private memory snapshots: human durable pages plus private journal, rollups, sources, and archive material.
- The local checkout remains the source of truth for implementation work, but it has no Git remote configured by default to avoid accidental pushes of private-history branches.
- `AGENTS.md` contains current project instructions.
- `README.md` summarizes the current shape and usage.

## Product boundary

- Nazar is an OS-agnostic TypeScript Pi extension product.
- This repository does not ship host operating-system configuration.
- Install Pi, Node.js, QMD, audio helpers, GitHub CLI, `ffmpeg`, or other optional host tools through the package manager for the user's own platform.
- Canonical Windows rule: install every Nazar host dependency through `winget` when a winget package exists; ask before using Chocolatey, Scoop, manual downloads, or ad-hoc installers.
- Windows voice setup uses `Gyan.FFmpeg` from winget plus `PI_STT_COMMAND`/`PI_STT_ARGS` for FFmpeg DirectShow microphone capture.
- Host-specific service supervision belongs outside the public product tree.

## Pi runtime

- Pi is the default runtime and CLI.
- Normal repo-local usage is:

```sh
cd /path/to/nazar
pi
/nazar-setup
```

- There is no separate project launcher wrapper. Setup/status are exposed through Pi-native commands (`/nazar-setup`, `/nazar-status`).
- `.pi/settings.json` is intentionally small and only loads project resources:
  - `code/extensions/nazar.ts`
  - `code/extensions/memory.ts`
  - `code/extensions/voice.ts`
  - `code/extensions/spotify.ts`
  - `code/extensions/whatsapp.ts`
  - standalone skills from `code/skills/`
  - package `npm:pi-subagents` for subagent orchestration.
- The memory extension contributes the `memory-janitor` Agent Skill through Pi resource discovery.
- The WhatsApp extension provides a one-whitelisted-contact personal bridge with media support. Always-on process supervision is a local deployment choice, not part of the product tree.
- The standalone `github-manager` Agent Skill uses the `gh` CLI when it is available on `PATH`.

## Code layout

- `code/extensions/nazar.ts` registers `/nazar-setup` and `/nazar-status` for post-install setup/status across memory, voice, WhatsApp, and Spotify.
- `code/extensions/nazar/setup-use.ts` provides the provider-based setup flow and a `pi-tui` setup dashboard for interactive Pi, including Spotify OAuth login and WhatsApp QR pairing.
- `code/extensions/nazar/setup-store.ts` stores only non-secret setup preferences under the platform config directory.
- `code/extensions/memory.ts` registers the memory command/tools and discovers the integrated `memory-janitor` Agent Skill.
- `code/extensions/voice.ts` registers the local `/tts` and `/voice` Pi extension. Windows playback uses PowerShell `System.Media.SoundPlayer`; Windows recording uses configured FFmpeg DirectShow args. Automatic TTS is limited to the main interactive conversation and suppressed in subagent/headless child runtimes.
- `code/extensions/spotify.ts` registers the local `/spotify` command and `spotify_control` tool backed by the Spotify Web API.
- `code/extensions/whatsapp.ts` registers `/whatsapp` for the personal 1:1 WhatsApp bridge backed by Baileys. WhatsApp QR pairing can render in a Pi TUI overlay and also prints to terminal fallback.
- `code/extensions/memory/memory-use.ts` implements pinned memory, generated rollups, private journal entry helpers, and scoped QMD search integration.
- `code/extensions/memory/paths.ts` derives memory paths from explicit `PI_*` environment variables first, then Nazar setup config, then repo-local defaults.
- `code/skills/github-manager/` contains the standalone GitHub profile/repository management Agent Skill.
- `code/skills/windows-setup/` contains the standalone Windows setup/configuration Agent Skill.
- `code/tests/` contains standalone tests for memory, Spotify helpers, and WhatsApp helpers.

## Memory layout

- The repository `memory/` tree is a public/local skeleton plus selected public AI pages.
- Real durable/private memory should live outside the git checkout in a private portable Obsidian vault.
- Preferred single portable root: `NAZAR_HOME=$HOME/NazarVault`.
- Vault folders: `00_Inbox`, `01_Projects`, `02_Areas`, `03_Resources`, `04_Archive`, `05_Nazar`.
- Derived runtime/generated memory root: `$NAZAR_HOME/05_Nazar/runtime` (`PI_MEMORY_ROOT`).
- Derived searchable root: `$NAZAR_HOME` (`PI_MEMORY_PAGES_DIR`).
- Derived AI/LLM wiki pages: `$NAZAR_HOME/05_Nazar/llm-wiki/wiki` (`PI_AI_MEMORY_DIR`).
- Derived human/personal memory root: `$NAZAR_HOME` (`PI_HUMAN_MEMORY_DIR`).
- Generated rollups, journal entries, source reports, and state live under `05_Nazar/runtime` and stay out of public git.
- Raw Pi sessions stay in Pi's default session storage, not in this repository.
