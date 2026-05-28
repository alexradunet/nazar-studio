export function callbackParts(input: string): { code: string; state: string } {
  const text = input.trim();
  if (!text) throw new Error("Missing callback URL. Paste the full Spotify callback URL, not only the authorization code.");

  let params: URLSearchParams;
  try {
    params = new URL(text).searchParams;
  } catch {
    if (!text.includes("code=")) throw new Error("Expected the full Spotify callback URL containing code and state parameters.");
    params = new URLSearchParams(text.replace(/^.*\?/, ""));
  }

  const error = params.get("error") || "";
  if (error) throw new Error(`Spotify authorization failed: ${error}`);

  const code = params.get("code") || "";
  const state = params.get("state") || "";
  if (!code) throw new Error("Callback URL did not contain a code parameter.");
  if (!state) throw new Error("Callback URL did not contain a state parameter; refusing code-only OAuth completion.");
  return { code, state };
}

export function spotifyUrlToUri(input: string): string | undefined {
  try {
    const url = new URL(input);
    if (url.hostname !== "open.spotify.com") return undefined;
    const segments = url.pathname.split("/").filter(Boolean);
    const [kind, id] = segments[0]?.startsWith("intl-") ? segments.slice(1, 3) : segments.slice(0, 2);
    if (!kind || !id) return undefined;
    if (!["track", "album", "playlist", "artist", "show", "episode"].includes(kind)) return undefined;
    return `spotify:${kind}:${id}`;
  } catch {
    return undefined;
  }
}

export function normalizeSpotifyUri(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Spotify URI/URL is empty.");
  if (trimmed.startsWith("spotify:")) return trimmed;
  const uri = spotifyUrlToUri(trimmed);
  if (uri) return uri;
  throw new Error("Expected a spotify: URI or open.spotify.com URL.");
}
