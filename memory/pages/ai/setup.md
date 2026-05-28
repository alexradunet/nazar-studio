# Nazar setup

Created on 2026-05-28.

## Purpose

Nazar provides a post-install setup command for package users:

```txt
/nazar-setup
```

In interactive Pi this opens a `pi-tui` setup dashboard. The default path is "Run full setup", with direct entries for memory, voice, WhatsApp, Spotify, status, and doctor checks.

Target package install shape:

```sh
pi install npm:@nazar/nazar-pi
pi
/nazar-setup
/reload
```

## Architecture

- Core extension entrypoint: `code/extensions/nazar.ts`.
- Setup orchestration: `code/extensions/nazar/setup-use.ts`.
- Non-secret setup config: `code/extensions/nazar/setup-store.ts`.
- Root package manifest: `package.json` with package name `@nazar/nazar-pi` and Pi resource manifest.

`/nazar-setup` coordinates existing extensions rather than replacing them:

- memory paths via the memory extension;
- local TTS/STT models and recorder/player config via the voice extension;
- WhatsApp allowed phone/autostart plus optional QR pairing via the WhatsApp extension config/auth flow;
- Spotify client ID/redirect URI plus optional OAuth login via the Spotify extension config/auth flow.

OAuth tokens, WhatsApp auth state, private memory, and secrets are not stored in Nazar setup config.

The interactive setup surface uses `@earendil-works/pi-tui` `SelectList`/`Text` components framed by Pi's `DynamicBorder`, while command-mode and headless calls still print plain text status. WhatsApp QR pairing uses a Pi TUI overlay/popup and also prints the QR to the terminal as fallback.

## Commands

```txt
/nazar-setup
/nazar-setup status
/nazar-setup doctor
/nazar-setup memory
/nazar-setup voice
/nazar-setup whatsapp
/nazar-setup spotify
/nazar-status
```

## Setup config

The setup store writes only non-secret preferences to the platform config directory:

```txt
{configDir}/nazar/setup.json
```

The path resolver honors:

```txt
NAZAR_CONFIG_DIR
NAZAR_STATE_DIR
NAZAR_DATA_DIR
```

Memory and voice runtime modules read this config as a fallback after environment variables, so explicit `PI_*` variables remain higher priority. `NAZAR_HOME` is the preferred single-root override for the portable private Obsidian vault; when set it takes precedence over older setup memory paths unless explicit `PI_*` variables are also set.

## Portable memory default

`/nazar-setup memory` asks for one user-facing path: the Nazar Obsidian vault root. It then shows the derived internal paths and recommends accepting them:

```txt
~/NazarVault/
  00_Inbox/
  01_Projects/
  02_Areas/
  03_Resources/
  04_Archive/
  05_Nazar/
```

The derived runtime root is `~/NazarVault/05_Nazar/runtime`, and the AI-maintained LLM wiki lives under `~/NazarVault/05_Nazar/llm-wiki/wiki`. Advanced per-path overrides are hidden behind an explicit advanced confirmation.

## Post-setup

Run `/reload` or restart Pi after setup so all extensions see updated config.
