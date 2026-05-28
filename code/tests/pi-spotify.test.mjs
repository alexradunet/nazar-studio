import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  authSessionPath,
  codeChallenge,
  configPath,
  createAuthSession,
  createCodeVerifier,
  DEFAULT_REDIRECT_URI,
  loadStoredConfig,
  saveConfig,
  shouldRefreshToken,
  tokenFromResponse,
} from "../extensions/spotify/spotify-auth.ts";
import { callbackParts, normalizeSpotifyUri, spotifyUrlToUri } from "../extensions/spotify/spotify-utils.ts";

const ENV_KEYS = [
  "APPDATA",
  "LOCALAPPDATA",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_STATE_HOME",
  "SPOTIFY_CLIENT_ID",
  "SPOTIFY_REDIRECT_URI",
];

function withSpotifyEnv(fn) {
  const tmp = mkdtempSync(join(tmpdir(), "pi-spotify-test-"));
  const previous = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
  process.env.APPDATA = join(tmp, "appdata");
  process.env.LOCALAPPDATA = join(tmp, "localappdata");
  process.env.XDG_CONFIG_HOME = join(tmp, "xdg-config");
  process.env.XDG_DATA_HOME = join(tmp, "xdg-data");
  process.env.XDG_STATE_HOME = join(tmp, "xdg-state");
  delete process.env.SPOTIFY_CLIENT_ID;
  delete process.env.SPOTIFY_REDIRECT_URI;

  try {
    fn(tmp);
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(tmp, { recursive: true, force: true });
  }
}

test("Spotify callback parsing requires code and state", () => {
  assert.deepEqual(callbackParts("http://127.0.0.1:53682/callback?code=abc&state=xyz"), { code: "abc", state: "xyz" });
  assert.deepEqual(callbackParts("code=abc&state=xyz"), { code: "abc", state: "xyz" });
  assert.throws(() => callbackParts("abc"), /full Spotify callback URL/);
  assert.throws(() => callbackParts("http://127.0.0.1:53682/callback?code=abc"), /state parameter/);
  assert.throws(() => callbackParts("http://127.0.0.1:53682/callback?error=access_denied"), /authorization failed/);
});

test("Spotify URL normalization supports normal and locale-prefixed open.spotify.com URLs", () => {
  assert.equal(spotifyUrlToUri("https://open.spotify.com/track/123?si=abc"), "spotify:track:123");
  assert.equal(spotifyUrlToUri("https://open.spotify.com/intl-de/track/456?si=abc"), "spotify:track:456");
  assert.equal(spotifyUrlToUri("https://evilopen.spotify.com/track/456?si=abc"), undefined);
  assert.equal(normalizeSpotifyUri("spotify:playlist:789"), "spotify:playlist:789");
  assert.equal(normalizeSpotifyUri("https://open.spotify.com/album/abc"), "spotify:album:abc");
  assert.throws(() => normalizeSpotifyUri("https://example.com/track/123"), /Expected a spotify:/);
  assert.throws(() => normalizeSpotifyUri("https://evilopen.spotify.com/track/123"), /Expected a spotify:/);
});

test("Spotify PKCE challenge matches RFC 7636 example and verifier shape", () => {
  assert.equal(
    codeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  );
  const verifier = createCodeVerifier();
  assert.match(verifier, /^[A-Za-z0-9_-]{43,128}$/);
});

test("Spotify config save/load and auth session use external state dirs", () => withSpotifyEnv(() => {
  saveConfig({ clientId: "client-123", redirectUri: "http://127.0.0.1:53682/callback" });
  assert.deepEqual(loadStoredConfig(), { clientId: "client-123", redirectUri: DEFAULT_REDIRECT_URI });
  assert.equal(existsSync(configPath()), true);

  const now = 1_700_000_000_000;
  const session = createAuthSession(now);
  assert.equal(session.clientId, "client-123");
  assert.equal(session.redirectUri, DEFAULT_REDIRECT_URI);
  assert.equal(session.createdAt, now);
  assert.equal(session.expiresAt > now, true);
  assert.equal(existsSync(authSessionPath()), true);
  assert.match(session.authUrl, /code_challenge_method=S256/);
}));

test("Spotify token conversion keeps refresh token and applies refresh skew", () => {
  const now = 1_700_000_000_000;
  const token = tokenFromResponse({ access_token: "access-a", refresh_token: "refresh-a", token_type: "Bearer", scope: "scope-a", expires_in: 120 }, undefined, now);
  assert.equal(token.accessToken, "access-a");
  assert.equal(token.refreshToken, "refresh-a");
  assert.equal(token.expiresAt, now + 120_000);
  assert.equal(shouldRefreshToken(token, now + 30_000), false);
  assert.equal(shouldRefreshToken(token, now + 61_000), true);

  const refreshed = tokenFromResponse({ access_token: "access-b", expires_in: 60 }, token, now + 1_000);
  assert.equal(refreshed.accessToken, "access-b");
  assert.equal(refreshed.refreshToken, "refresh-a");
  assert.throws(() => tokenFromResponse({ access_token: "access" }, undefined, now), /refresh token/);
});
