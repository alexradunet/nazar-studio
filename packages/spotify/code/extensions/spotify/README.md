# `@nazar/spotify` Spotify modules

Spotify Web API implementation for Pi.

## Surface

- `/spotify` command for setup, login, search, devices, current playback, and playback controls.
- `spotify_control` tool for agent-driven Spotify operations.

## Auth

The extension uses Spotify Authorization Code with PKCE:

- Requires only a Spotify Developer app Client ID.
- Does **not** use or store a client secret.
- Default redirect URI: `http://127.0.0.1:53682/callback`.
- Tokens are stored outside the repo under the user's XDG state/config directories.

Setup:

```txt
/spotify config client-id <spotify-client-id>
/spotify login
```

If the local callback cannot be used:

```txt
/spotify auth-url
/spotify finish <callback-url>
```

## Notes

Playback control requires an active Spotify Connect device and usually Spotify Premium. The extension controls Spotify; it does not stream audio inside Pi.
