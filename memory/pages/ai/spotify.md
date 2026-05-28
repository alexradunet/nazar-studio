# Spotify integration

Updated after adding Spotify login to Nazar setup on 2026-05-28.

## Current shape

- Spotify is handled by a Pi TypeScript extension, not a standalone Agent Skill.
- Entry point: `code/extensions/spotify.ts`.
- Implementation: `code/extensions/spotify/spotify-use.ts`.
- Pi surface:
  - `/spotify` command for setup, auth, status, search, devices, and playback controls.
  - `/nazar-setup spotify` can save Spotify config and start OAuth login as part of the broader Nazar setup flow.
  - `spotify_control` tool for agent-driven Spotify search/playback operations.
- The old `code/skills/spotify-dj/` skill and local MPRIS/playerctl helper were removed.

## Auth and state

- The extension uses Spotify Authorization Code with PKCE.
- It requires a Spotify Developer app Client ID but does not use or store a client secret.
- Default redirect URI: `http://127.0.0.1:53682/callback`.
- Manual `/spotify finish` requires the full callback URL with `code` and `state`; code-only completion is intentionally refused.
- Spotify config/token/auth-session files are stored under the user's XDG config/state/data directories outside the repository.
- Do not commit Spotify secrets, refresh tokens, or callback URLs containing auth codes.

## Usage

First-time setup:

```txt
/nazar-setup spotify
```

Direct extension setup remains available:

```txt
/spotify config client-id <spotify-client-id>
/spotify login
```

Manual login fallback:

```txt
/spotify auth-url
/spotify finish <callback-url>
```

Common operations:

```txt
/spotify status
/spotify current
/spotify devices
/spotify search <query>
/spotify play <spotify-uri-or-search-query>
/spotify pause|resume|toggle|next|previous
/spotify volume <0-100>
```

## Music preference memory

`memory/pages/personal/music-preferences.md` remains the durable taste page. For vague vibe requests, consult it first and choose a specific track by default unless the user asks for a playlist.

## Constraints

- Playback control requires an active Spotify Connect device and usually Spotify Premium.
- The extension controls Spotify remotely; it does not stream audio inside Pi.
- `/spotify search Daft Punk Around the World` was validated with the current OAuth token on 2026-05-26, so the initial playback scopes are sufficient for search on this account.
