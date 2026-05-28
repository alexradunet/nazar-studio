import test from "node:test";
import assert from "node:assert/strict";

import { callbackParts, normalizeSpotifyUri, spotifyUrlToUri } from "../extensions/spotify/spotify-utils.ts";

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
