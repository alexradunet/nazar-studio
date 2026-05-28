# `code/extensions/`

Project-local Pi extensions.

## Current extensions

- `nazar.ts` — registers `/nazar-setup` and `/nazar-status` for post-install setup/status across memory, voice, WhatsApp, and Spotify.
- `shared.ts` — cross-extension UI, path, string, and private-file helpers.
- `nazar/` — setup orchestration modules and non-secret setup config helpers.
- `memory.ts` — registers the `/memory` command plus `memory_status` and `memory_search` tools, appends pinned/rollup durable memory into the system prompt on each turn, refreshes rollups after built-in `/compact`, and contributes the `memory-janitor` Agent Skill through Pi resource discovery.
- `memory/` — implementation modules for paths, pinned memory, rollups, QMD integration, and the integrated `memory-janitor` skill.
- `voice.ts` — registers `/tts`, `/voice`, `tts_toggle`, and the Alt+V voice shortcut.
- `voice-text.ts` — pure TTS text normalization and chunking helpers.
- `voice/` — implementation modules for assistant TTS and Pi TUI voice dictation.
- `spotify.ts` — registers `/spotify` and the `spotify_control` tool backed by the Spotify Web API.
- `spotify/` — implementation modules for Spotify PKCE auth, token refresh, search, devices, and playback control.
- `whatsapp.ts` — registers `/whatsapp` for the minimal personal WhatsApp bridge.
- `whatsapp/` — implementation modules for one whitelisted 1:1 Baileys connection, QR overlay pairing, single-master locking/autostart, image forwarding to Pi vision input, and audio-message STT through the voice runtime.

## Rules

- Prefer KISS and minimal developed extension APIs.
- Keep extension entrypoints thin; move implementation into small modules.
- Do not add separate launcher/status command layers.
- Keep memory storage paths centralized in `memory/paths.ts`; real use should set `NAZAR_HOME` to a private portable Obsidian vault. Repo-local `memory/` is an ignored development fallback only.
- Store OAuth tokens outside the repo; never commit client secrets or refresh tokens.

## Validation

```sh
pi --no-session --offline -p "/nazar-status"
pi --no-session --offline -p "/memory status"
pi --no-session --offline -p "/tts status"
pi --no-session --offline -p "/voice help"
pi --no-session --offline -p "/spotify help"
pi --no-session --offline -p "/whatsapp help"
pi --no-session --offline -p "/whatsapp status"
node --test
```

## Reload behavior

Pi's built-in `/reload` emits `session_shutdown` on the current extension runtime, reloads extension modules/skills, then emits `session_start` again. Nazar extensions treat shutdown as the cleanup boundary:

- **memory** — clears the memory widget.
- **voice** — kills any active recorder child, calls `resetSherpaRuntime()`, and clears voice status/widgets.
- **tts** — clears debounce timers, speech queue/playback, resets sherpa TTS/STT caches, and clears the TTS widget.
- **whatsapp** — stops the Baileys socket, releases the master lock, clears `ctxRef`, and closes the QR overlay.

Use `/reload` after `/nazar-setup` path changes. Do not expect in-memory extension state to survive reload; re-establish it in `session_start` handlers if needed.
