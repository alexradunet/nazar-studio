import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";

import { getRemoteTurnOrigin } from "../remote-origin.ts";
import { callbackParts, normalizeSpotifyUri } from "./spotify-utils.ts";

const API_BASE = "https://api.spotify.com";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const DEFAULT_REDIRECT_URI = "http://127.0.0.1:53682/callback";
const AUTH_TIMEOUT_MS = 5 * 60_000;
const TOKEN_REFRESH_SKEW_MS = 60_000;

const SCOPES = [
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-modify-playback-state",
];

const HELP_TEXT = `Spotify Web API commands
- /spotify status — show config/auth status plus current playback when logged in
- /spotify config — show config paths and effective client ID/redirect URI
- /spotify config client-id <id> — store Spotify app Client ID (not a secret)
- /spotify config redirect-uri <uri> — store redirect URI, default ${DEFAULT_REDIRECT_URI}
- /spotify login — start PKCE OAuth login, open browser, and wait for local callback
- /spotify auth-url — print an OAuth URL for manual login
- /spotify finish <callback-url> — finish a manual auth-url login
- /spotify logout — delete saved Spotify token
- /spotify current — show the current/last playback item
- /spotify devices — list Spotify Connect devices
- /spotify search <query> — search tracks
- /spotify play [spotify-uri|open.spotify.com URL|search query] — play URI or first matching track; no argument resumes
- /spotify pause|resume|toggle|next|previous
- /spotify volume <0-100>
- /spotify transfer <device-id> — transfer playback to a device and start playing

Setup: create a Spotify Developer app with Web API enabled, add the exact redirect URI above, then run /spotify config client-id <id> and /spotify login. Playback control requires an active Spotify Connect device and usually Spotify Premium.`;

type SpotifyConfig = {
  clientId?: string;
  redirectUri?: string;
};

type EffectiveConfig = {
  clientId: string;
  redirectUri: string;
  clientIdSource: "env" | "config" | "missing";
  redirectUriSource: "env" | "config" | "default";
};

type AuthSession = {
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  state: string;
  scope: string;
  authUrl: string;
  createdAt: number;
  expiresAt: number;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type StoredToken = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  scope: string;
  expiresAt: number;
  savedAt: number;
};

type SpotifyDevice = {
  id?: string;
  name?: string;
  type?: string;
  is_active?: boolean;
  is_private_session?: boolean;
  is_restricted?: boolean;
  volume_percent?: number;
};

type SpotifyTrack = {
  id?: string;
  name?: string;
  uri?: string;
  external_urls?: { spotify?: string };
  album?: { name?: string };
  artists?: Array<{ name?: string }>;
  type?: string;
};

type SpotifyPlayback = {
  is_playing?: boolean;
  progress_ms?: number;
  device?: SpotifyDevice;
  item?: SpotifyTrack | { name?: string; type?: string; uri?: string } | null;
};

const SpotifyParams = Type.Object({
  action: StringEnum(["status", "current", "devices", "search", "play", "pause", "resume", "toggle", "next", "previous", "volume", "transfer"] as const),
  query: Type.Optional(Type.String({ description: "Search query for search/play." })),
  uri: Type.Optional(Type.String({ description: "Spotify URI or open.spotify.com URL to play." })),
  deviceId: Type.Optional(Type.String({ description: "Spotify Connect device ID for play/transfer." })),
  volumePercent: Type.Optional(Type.Number({ description: "Volume percent, 0..100." })),
  limit: Type.Optional(Type.Number({ description: "Search result limit, default 5, max 10." })),
});

function dataHome(): string {
  return process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
}

function configHome(): string {
  return process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
}

function stateHome(): string {
  return process.env.XDG_STATE_HOME || join(homedir(), ".local", "state");
}

function configPath(): string {
  return join(configHome(), "pi", "spotify.json");
}

function tokenPath(): string {
  return join(stateHome(), "pi", "spotify-token.json");
}

export function spotifySetupStatusText(): string {
  const config = effectiveConfig();
  const token = loadToken();
  return [
    `Client ID: ${config.clientId ? `configured (${config.clientIdSource})` : "missing"}`,
    `Redirect URI: ${config.redirectUri} (${config.redirectUriSource})`,
    `Config path: ${configPath()}`,
    `Token: ${token ? (token.expiresAt > Date.now() ? "present" : "expired/refreshable") : "missing"}`,
    `Token path: ${tokenPath()}`,
  ].join("\n");
}

export function saveSpotifySetupConfig(update: SpotifyConfig): void {
  saveConfig(update);
}

function authSessionPath(): string {
  return join(dataHome(), "pi", "spotify-auth-session.json");
}

function readJson<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (error) {
    throw new Error(`Spotify JSON state is unreadable or malformed at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function writeJson(path: string, value: unknown, mode = 0o600): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { chmodSync(dir, 0o700); } catch { /* Best effort on platforms without POSIX modes. */ }
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode });
  try {
    chmodSync(path, mode);
  } catch {
    // Best effort only; the file is still under the user's config/state dir.
  }
}

function removeIfExists(path: string): void {
  rmSync(path, { force: true });
}

function loadStoredConfig(): SpotifyConfig {
  return readJson<SpotifyConfig>(configPath()) || {};
}

function effectiveConfig(): EffectiveConfig {
  const stored = loadStoredConfig();
  const envClientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const envRedirectUri = process.env.SPOTIFY_REDIRECT_URI?.trim();
  const storedClientId = stored.clientId?.trim();
  const storedRedirectUri = stored.redirectUri?.trim();

  return {
    clientId: envClientId || storedClientId || "",
    redirectUri: envRedirectUri || storedRedirectUri || DEFAULT_REDIRECT_URI,
    clientIdSource: envClientId ? "env" : storedClientId ? "config" : "missing",
    redirectUriSource: envRedirectUri ? "env" : storedRedirectUri ? "config" : "default",
  };
}

function requireConfig(): EffectiveConfig {
  const config = effectiveConfig();
  if (!config.clientId) throw new Error(missingClientIdText());
  return config;
}

function saveConfig(update: SpotifyConfig): void {
  const current = loadStoredConfig();
  writeJson(configPath(), { ...current, ...update });
}

function loadToken(): StoredToken | undefined {
  return readJson<StoredToken>(tokenPath());
}

function saveToken(token: StoredToken): void {
  writeJson(tokenPath(), token, 0o600);
}

function saveAuthSession(session: AuthSession): void {
  writeJson(authSessionPath(), session, 0o600);
}

function loadAuthSession(): AuthSession | undefined {
  return readJson<AuthSession>(authSessionPath());
}

function base64Url(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function createCodeVerifier(): string {
  return base64Url(randomBytes(64)).slice(0, 128);
}

function codeChallenge(verifier: string): string {
  return base64Url(createHash("sha256").update(verifier).digest());
}

function missingClientIdText(): string {
  return [
    "Spotify Client ID is not configured.",
    "Create a Spotify Developer app with Web API enabled, add the redirect URI shown by /spotify config, then run:",
    "/spotify config client-id <your-client-id>",
    "You can also set SPOTIFY_CLIENT_ID in the environment. The client ID is not a secret; do not store client secrets in this repo.",
  ].join("\n");
}

function htmlEscape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function authHtml(title: string, body: string): string {
  return `<!doctype html><meta charset="utf-8"><title>${htmlEscape(title)}</title><body style="font-family:sans-serif;line-height:1.4"><h1>${htmlEscape(title)}</h1><p>${htmlEscape(body)}</p><p>You can close this tab and return to Pi.</p></body>`;
}

function hasInteractiveUi(ctx: { hasUI?: boolean }): boolean {
  return ctx.hasUI !== false;
}

async function showText(ctx: ExtensionContext, text: string, title: string, level: "info" | "warning" | "error" = "info"): Promise<void> {
  if (!hasInteractiveUi(ctx)) {
    console.log(text);
    return;
  }
  ctx.ui.setWidget("spotify", text.split("\n"));
  ctx.ui.notify(title, level);
}

function authUrlText(session: AuthSession): string {
  return [
    "Spotify login URL:",
    session.authUrl,
    "",
    `Redirect URI: ${session.redirectUri}`,
    "If the browser does not return to Pi automatically, paste the full final callback URL into:",
    "/spotify finish <callback-url>",
  ].join("\n");
}

function createAuthSession(): AuthSession {
  const config = requireConfig();
  const verifier = createCodeVerifier();
  const state = base64Url(randomBytes(24));
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: config.redirectUri,
    scope: SCOPES.join(" "),
    state,
    code_challenge_method: "S256",
    code_challenge: codeChallenge(verifier),
  });
  const session: AuthSession = {
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    codeVerifier: verifier,
    state,
    scope: SCOPES.join(" "),
    authUrl: `${AUTHORIZE_URL}?${params.toString()}`,
    createdAt: Date.now(),
    expiresAt: Date.now() + AUTH_TIMEOUT_MS,
  };
  saveAuthSession(session);
  return session;
}

async function tokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await response.text();
  let data: TokenResponse = {};
  try {
    data = text ? (JSON.parse(text) as TokenResponse) : {};
  } catch {
    data = { error_description: text };
  }

  if (!response.ok) {
    const message = data.error_description || data.error || text || `${response.status} ${response.statusText}`;
    throw new Error(`Spotify token request failed: ${message}`);
  }
  return data;
}

function tokenFromResponse(data: TokenResponse, previous?: StoredToken): StoredToken {
  if (!data.access_token && !previous?.accessToken) throw new Error("Spotify token response did not include an access token.");
  const refreshToken = data.refresh_token || previous?.refreshToken;
  if (!refreshToken) throw new Error("Spotify token response did not include a refresh token. Re-run /spotify login.");
  const expiresIn = Number.isFinite(data.expires_in) ? Number(data.expires_in) : 3600;
  return {
    accessToken: data.access_token || previous!.accessToken,
    refreshToken,
    tokenType: data.token_type || previous?.tokenType || "Bearer",
    scope: data.scope || previous?.scope || "",
    expiresAt: Date.now() + expiresIn * 1000,
    savedAt: Date.now(),
  };
}

async function exchangeCode(code: string, state: string): Promise<string> {
  const session = loadAuthSession();
  if (!session) throw new Error("No pending Spotify auth session. Run /spotify login or /spotify auth-url first.");
  if (Date.now() > session.expiresAt) {
    removeIfExists(authSessionPath());
    throw new Error("Pending Spotify auth session expired. Run /spotify login again.");
  }
  if (!state || state !== session.state) throw new Error("Spotify auth state mismatch; refusing callback.");

  const data = await tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: session.redirectUri,
      client_id: session.clientId,
      code_verifier: session.codeVerifier,
    }),
  );
  const token = tokenFromResponse(data);
  saveToken(token);
  removeIfExists(authSessionPath());
  return [
    "Spotify login complete.",
    `Granted scopes: ${token.scope || "(not reported)"}`,
    `Token saved outside the repo: ${tokenPath()}`,
  ].join("\n");
}

async function refreshAccessToken(previous: StoredToken): Promise<StoredToken> {
  const config = requireConfig();
  const data = await tokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: previous.refreshToken,
      client_id: config.clientId,
    }),
  );
  const token = tokenFromResponse(data, previous);
  saveToken(token);
  return token;
}

async function accessToken(): Promise<string> {
  const token = loadToken();
  if (!token?.refreshToken) throw new Error("Spotify is not logged in. Run /spotify login first.");
  if (token.accessToken && token.expiresAt > Date.now() + TOKEN_REFRESH_SKEW_MS) return token.accessToken;
  return (await refreshAccessToken(token)).accessToken;
}

async function spotifyFetch<T>(path: string, init: RequestInit = {}, retriedAfterRefresh = false): Promise<T | undefined> {
  const token = await accessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const text = await response.text();
  let data: any = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (response.status === 401 && !retriedAfterRefresh) {
    const current = loadToken();
    if (current?.refreshToken) {
      await refreshAccessToken(current);
      return spotifyFetch<T>(path, init, true);
    }
  }

  if (!response.ok) {
    const retryAfter = response.headers.get("retry-after");
    const rateLimit = response.status === 429 && retryAfter ? ` Retry after ${retryAfter}s.` : "";
    const message = data?.error?.message || data?.error_description || (typeof data === "string" ? data : "") || `${response.status} ${response.statusText}`;
    throw new Error(`Spotify API ${response.status}: ${message}.${rateLimit}`.replace(/\.\./g, "."));
  }

  return data as T | undefined;
}

function isLoopbackRedirect(uri: string): boolean {
  try {
    const url = new URL(uri);
    return url.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function requestUrl(req: IncomingMessage, redirect: URL): URL {
  return new URL(req.url || "/", redirect.origin);
}

function waitForCallback(redirectUri: string, expectedState: string): Promise<{ code: string; state?: string }> {
  const redirect = new URL(redirectUri);
  const port = Number(redirect.port || 80);
  const hostname = redirect.hostname;

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, value?: { code: string; state?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      server.close(() => undefined);
      if (error) reject(error);
      else resolve(value!);
    };

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = requestUrl(req, redirect);
      if (url.pathname !== redirect.pathname) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
        return;
      }

      const error = url.searchParams.get("error") || "";
      const code = url.searchParams.get("code") || "";
      const state = url.searchParams.get("state") || undefined;

      if (error) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(authHtml("Spotify login failed", error));
        finish(new Error(`Spotify authorization failed: ${error}`));
        return;
      }

      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(authHtml("Spotify login failed", "Missing authorization code."));
        finish(new Error("Spotify callback did not include a code."));
        return;
      }

      if (state !== expectedState) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(authHtml("Spotify login failed", "State mismatch."));
        finish(new Error("Spotify auth state mismatch; refusing callback."));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(authHtml("Spotify login complete", "Pi received the authorization callback."));
      finish(undefined, { code, state });
    });

    const timeout = setTimeout(() => finish(new Error("Timed out waiting for Spotify callback. Use /spotify auth-url and /spotify finish for manual login.")), AUTH_TIMEOUT_MS);
    server.once("error", (error) => finish(error instanceof Error ? error : new Error(String(error))));
    server.listen(port, hostname);
  });
}

async function maybeOpenAuthUrl(pi: ExtensionAPI, url: string): Promise<string> {
  const opener = platform() === "win32"
    ? { command: "cmd.exe", args: ["/c", "start", "", url], label: "Windows default browser" }
    : platform() === "darwin"
      ? { command: "open", args: [url], label: "open" }
      : { command: "xdg-open", args: [url], label: "xdg-open" };

  try {
    const result = (await pi.exec(opener.command, opener.args, { timeout: 3000 })) as { code?: number | null; stderr?: string; stdout?: string };
    if (result.code === 0) return `Opened the Spotify authorization URL with ${opener.label}.`;
    return `Could not open browser automatically: ${(result.stderr || result.stdout || `exit ${result.code}`).trim()}`;
  } catch (error) {
    return `Could not open browser automatically: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function spotifyLoginWithLocalCallback(pi: ExtensionAPI, ctx: ExtensionContext): Promise<string> {
  const session = createAuthSession();
  const instructions = authUrlText(session);

  if (!hasInteractiveUi(ctx) || !isLoopbackRedirect(session.redirectUri)) {
    return `${instructions}\n\nManual login mode: open the URL, then run /spotify finish <callback-url>.`;
  }

  const callback = waitForCallback(session.redirectUri, session.state);
  const browser = await maybeOpenAuthUrl(pi, session.authUrl);
  await showText(ctx, `${instructions}\n\n${browser}\nWaiting up to ${AUTH_TIMEOUT_MS / 60_000} minutes for the local callback...`, "Spotify login started");
  const result = await callback;
  return exchangeCode(result.code, result.state);
}

function configStatusText(): string {
  const config = effectiveConfig();
  const token = loadToken();
  const pending = loadAuthSession();
  const clientIdPreview = config.clientId ? `${config.clientId.slice(0, 6)}…${config.clientId.slice(-4)}` : "missing";
  return [
    "Spotify extension config",
    `Client ID: ${clientIdPreview} (${config.clientIdSource})`,
    `Redirect URI: ${config.redirectUri} (${config.redirectUriSource})`,
    `Required scopes: ${SCOPES.join(" ")}`,
    `Config file: ${configPath()}`,
    `Token file: ${tokenPath()} ${token ? "(present)" : "(missing)"}`,
    `Pending auth session: ${pending ? `${authSessionPath()} (expires ${new Date(pending.expiresAt).toLocaleString()})` : "none"}`,
    "Tokens are stored outside the repository. Do not commit Spotify secrets or refresh tokens.",
  ].join("\n");
}

function msToTime(ms: number | undefined): string {
  if (!Number.isFinite(ms)) return "?:??";
  const total = Math.max(0, Math.floor(Number(ms) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function artistNames(track: SpotifyTrack | undefined): string {
  const artists = track?.artists?.map((artist) => artist.name).filter(Boolean) || [];
  return artists.length > 0 ? artists.join(", ") : "Unknown artist";
}

function formatTrack(track: SpotifyTrack | undefined, index?: number): string {
  if (!track) return "Unknown track";
  const prefix = index === undefined ? "" : `${index}. `;
  const name = track.name || "Unknown title";
  const artists = artistNames(track);
  const uri = track.uri || (track.id ? `spotify:track:${track.id}` : "");
  const album = track.album?.name ? ` — ${track.album.name}` : "";
  return `${prefix}${artists} — ${name}${album}${uri ? ` (${uri})` : ""}`;
}

function formatPlayback(playback: SpotifyPlayback | undefined): string {
  if (!playback?.item) return "No active Spotify playback.";
  const item = playback.item as SpotifyTrack;
  const state = playback.is_playing ? "Playing" : "Paused";
  const device = playback.device?.name ? ` on ${playback.device.name}` : "";
  const progress = playback.progress_ms === undefined ? "" : ` at ${msToTime(playback.progress_ms)}`;
  if (item.type === "track" || item.artists) return `${state}${device}${progress}: ${formatTrack(item)}`;
  return `${state}${device}${progress}: ${item.name || "Unknown item"}${item.uri ? ` (${item.uri})` : ""}`;
}

async function currentPlaybackText(): Promise<string> {
  const playback = await spotifyFetch<SpotifyPlayback>("/v1/me/player");
  return formatPlayback(playback);
}

function formatDevices(devices: SpotifyDevice[]): string {
  if (devices.length === 0) return "No Spotify Connect devices are available. Open Spotify on this computer, phone, browser, or speaker, then try again.";
  return devices
    .map((device, index) => {
      const active = device.is_active ? "active" : "idle";
      const restricted = device.is_restricted ? ", restricted" : "";
      const volume = device.volume_percent === undefined || device.volume_percent === null ? "volume ?" : `volume ${device.volume_percent}%`;
      return `${index + 1}. ${device.name || "Unnamed device"} — ${device.type || "unknown"}, ${active}, ${volume}${restricted}\n   id: ${device.id || "(no id)"}`;
    })
    .join("\n");
}

async function devicesText(): Promise<string> {
  const data = await spotifyFetch<{ devices?: SpotifyDevice[] }>("/v1/me/player/devices");
  return formatDevices(data?.devices || []);
}

function boundedLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return 5;
  return Math.max(1, Math.min(10, Math.floor(Number(limit))));
}

async function searchTracks(query: string, limit?: number): Promise<SpotifyTrack[]> {
  const trimmed = query.trim();
  if (!trimmed) throw new Error("Search query is required.");
  const params = new URLSearchParams({ q: trimmed, type: "track", limit: String(boundedLimit(limit)) });
  const data = await spotifyFetch<{ tracks?: { items?: SpotifyTrack[] } }>(`/v1/search?${params.toString()}`);
  return data?.tracks?.items || [];
}

function formatSearchResults(tracks: SpotifyTrack[]): string {
  if (tracks.length === 0) return "No tracks found.";
  return tracks.map((track, index) => formatTrack(track, index + 1)).join("\n");
}

function playbackBodyForUri(uri: string): Record<string, unknown> {
  const normalized = normalizeSpotifyUri(uri);
  if (normalized.startsWith("spotify:track:")) return { uris: [normalized] };
  if (normalized.startsWith("spotify:episode:")) return { uris: [normalized] };
  return { context_uri: normalized };
}

function deviceQuery(deviceId: string | undefined): string {
  const id = deviceId?.trim();
  if (!id) return "";
  return `?${new URLSearchParams({ device_id: id }).toString()}`;
}

async function playText(input: { uri?: string; query?: string; deviceId?: string }): Promise<string> {
  let body: Record<string, unknown> | undefined;
  let selected: SpotifyTrack | undefined;

  if (input.uri?.trim()) {
    body = playbackBodyForUri(input.uri);
  } else if (input.query?.trim()) {
    const tracks = await searchTracks(input.query, 1);
    selected = tracks[0];
    if (!selected?.uri) throw new Error(`No Spotify track found for: ${input.query}`);
    body = { uris: [selected.uri] };
  }

  await spotifyFetch(`/v1/me/player/play${deviceQuery(input.deviceId)}`, {
    method: "PUT",
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (selected) return `Playing search result: ${formatTrack(selected)}`;
  if (input.uri?.trim()) return `Playing: ${normalizeSpotifyUri(input.uri)}`;
  return "Playback resumed.";
}

async function transferText(deviceId: string): Promise<string> {
  const id = deviceId.trim();
  if (!id) throw new Error("Device ID is required. Run /spotify devices first.");
  await spotifyFetch("/v1/me/player", {
    method: "PUT",
    body: JSON.stringify({ device_ids: [id], play: true }),
  });
  return `Transferred playback to device ${id}.`;
}

function assertLocalPlaybackAction(action: string): void {
  if (!["play", "pause", "resume", "toggle", "next", "previous", "volume", "transfer"].includes(action)) return;
  const origin = getRemoteTurnOrigin();
  if (!origin) return;
  throw new Error(`Refusing Spotify playback action '${action}' from ${origin.source} turn ${origin.id}. Use the local Pi session for side-effectful playback controls.`);
}

async function spotifyAction(params: {
  action: "status" | "current" | "devices" | "search" | "play" | "pause" | "resume" | "toggle" | "next" | "previous" | "volume" | "transfer";
  query?: string;
  uri?: string;
  deviceId?: string;
  volumePercent?: number;
  limit?: number;
}): Promise<string> {
  assertLocalPlaybackAction(params.action);
  switch (params.action) {
    case "status":
      return spotifyStatusText();
    case "current":
      return currentPlaybackText();
    case "devices":
      return devicesText();
    case "search":
      return formatSearchResults(await searchTracks(params.query || "", params.limit));
    case "play":
      return playText(params);
    case "pause":
      await spotifyFetch(`/v1/me/player/pause${deviceQuery(params.deviceId)}`, { method: "PUT" });
      return "Spotify paused.";
    case "resume":
      return playText({ deviceId: params.deviceId });
    case "toggle": {
      const playback = await spotifyFetch<SpotifyPlayback>("/v1/me/player");
      if (playback?.is_playing) {
        await spotifyFetch(`/v1/me/player/pause${deviceQuery(params.deviceId)}`, { method: "PUT" });
        return "Spotify paused.";
      }
      return playText({ deviceId: params.deviceId });
    }
    case "next":
      await spotifyFetch(`/v1/me/player/next${deviceQuery(params.deviceId)}`, { method: "POST" });
      return "Skipped to next track.";
    case "previous":
      await spotifyFetch(`/v1/me/player/previous${deviceQuery(params.deviceId)}`, { method: "POST" });
      return "Skipped to previous track.";
    case "volume": {
      const volume = Math.max(0, Math.min(100, Math.round(Number(params.volumePercent))));
      if (!Number.isFinite(volume)) throw new Error("volumePercent is required for volume action.");
      const query = new URLSearchParams({ volume_percent: String(volume) });
      if (params.deviceId?.trim()) query.set("device_id", params.deviceId.trim());
      await spotifyFetch(`/v1/me/player/volume?${query.toString()}`, { method: "PUT" });
      return `Spotify volume set to ${volume}%.`;
    }
    case "transfer":
      return transferText(params.deviceId || "");
  }
}

async function spotifyStatusText(): Promise<string> {
  const config = effectiveConfig();
  const token = loadToken();
  const lines = [configStatusText()];
  if (!config.clientId) return lines.join("\n\n");
  if (!token) {
    lines.push("Spotify is not logged in. Run /spotify login.");
    return lines.join("\n\n");
  }

  const expiresInMs = token.expiresAt - Date.now();
  lines.push(`Login: token present; expires ${expiresInMs > 0 ? `in ${Math.round(expiresInMs / 60_000)} min` : "now/expired"}`);
  try {
    lines.push(await currentPlaybackText());
  } catch (error) {
    lines.push(`Current playback check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return lines.join("\n\n");
}

function commandAndRest(args: string): { command: string; rest: string; parts: string[] } {
  const parts = args.trim().split(/\s+/).filter(Boolean);
  return { command: (parts[0] || "status").toLowerCase(), rest: parts.slice(1).join(" "), parts: parts.slice(1) };
}

async function handleConfigCommand(restParts: string[]): Promise<string> {
  const subcommand = (restParts[0] || "show").toLowerCase();
  const value = restParts.slice(1).join(" ").trim();
  if (subcommand === "show" || subcommand === "status" || subcommand === "") return configStatusText();
  if (subcommand === "client-id" || subcommand === "clientid") {
    if (!value) return "Usage: /spotify config client-id <spotify-client-id>";
    saveConfig({ clientId: value });
    return `Spotify Client ID saved to ${configPath()}.`;
  }
  if (subcommand === "redirect-uri" || subcommand === "redirect") {
    if (!value) return "Usage: /spotify config redirect-uri <redirect-uri>";
    new URL(value);
    saveConfig({ redirectUri: value });
    return `Spotify redirect URI saved to ${configPath()}. Add the exact same URI in the Spotify Developer app.`;
  }
  return `Unknown /spotify config command: ${subcommand}\n\n${HELP_TEXT}`;
}

function isUriLike(text: string): boolean {
  return text.trim().startsWith("spotify:") || text.includes("open.spotify.com/");
}

function commandAction(command: string): "pause" | "resume" | "toggle" | "next" | "previous" | undefined {
  if (["pause", "resume", "toggle", "next", "previous"].includes(command)) return command as ReturnType<typeof commandAction>;
  return undefined;
}

export function registerSpotifyUse(pi: ExtensionAPI): void {
  pi.registerCommand("spotify", {
    description: "Control Spotify through the Spotify Web API: /spotify status|login|current|devices|search|play|pause|resume|toggle|next|previous|volume",
    handler: async (args, ctx) => {
      const { command, rest, parts } = commandAndRest(args);
      try {
        if (command === "help") {
          await showText(ctx, HELP_TEXT, "Spotify help updated");
          return;
        }

        if (command === "config" || command === "setup") {
          await showText(ctx, await handleConfigCommand(parts), "Spotify config updated");
          return;
        }

        if (command === "login") {
          const result = await spotifyLoginWithLocalCallback(pi, ctx);
          await showText(ctx, result, "Spotify login complete");
          return;
        }

        if (command === "auth-url" || command === "auth") {
          const session = createAuthSession();
          await showText(ctx, authUrlText(session), "Spotify auth URL ready");
          return;
        }

        if (command === "finish" || command === "callback") {
          const callback = callbackParts(rest);
          await showText(ctx, await exchangeCode(callback.code, callback.state), "Spotify login complete");
          return;
        }

        if (command === "logout") {
          removeIfExists(tokenPath());
          removeIfExists(authSessionPath());
          await showText(ctx, `Spotify token removed: ${tokenPath()}`, "Spotify logged out");
          return;
        }

        if (command === "status") {
          await showText(ctx, await spotifyStatusText(), "Spotify status updated");
          return;
        }

        if (command === "current" || command === "now" || command === "now-playing") {
          await showText(ctx, await currentPlaybackText(), "Spotify current track updated");
          return;
        }

        if (command === "devices" || command === "device") {
          await showText(ctx, await devicesText(), "Spotify devices updated");
          return;
        }

        if (command === "search") {
          await showText(ctx, formatSearchResults(await searchTracks(rest, 5)), "Spotify search complete");
          return;
        }

        if (command === "play") {
          await showText(ctx, await playText(isUriLike(rest) ? { uri: rest } : { query: rest }), "Spotify playback updated");
          return;
        }

        const action = commandAction(command);
        if (action) {
          await showText(ctx, await spotifyAction({ action }), "Spotify playback updated");
          return;
        }

        if (command === "volume") {
          await showText(ctx, await spotifyAction({ action: "volume", volumePercent: Number.parseFloat(rest) }), "Spotify volume updated");
          return;
        }

        if (command === "transfer") {
          await showText(ctx, await spotifyAction({ action: "transfer", deviceId: rest }), "Spotify device updated");
          return;
        }

        await showText(ctx, `Unknown /spotify command: ${command}\n\n${HELP_TEXT}`, "Unknown Spotify command", "warning");
      } catch (error) {
        await showText(ctx, error instanceof Error ? error.message : String(error), "Spotify command failed", "error");
      }
    },
  });

  pi.registerTool({
    name: "spotify_control",
    label: "Spotify Control",
    description: "Control Spotify playback and search tracks through the Spotify Web API. Requires /spotify login first.",
    promptSnippet: "Search Spotify, check current playback, list devices, and control Spotify playback via the Spotify Web API.",
    promptGuidelines: [
      "Use spotify_control when the user asks to control Spotify playback, check the current song, search Spotify, or play a track through Spotify.",
      "Before choosing music for a vague vibe request, use memory_search with personal/default scope for durable music preferences, then choose a specific track unless the user asks for a playlist.",
      "spotify_control requires /spotify config client-id and /spotify login once, plus an active Spotify Connect device; playback-control errors may mean Spotify Premium or an active device is missing.",
    ],
    parameters: SpotifyParams,
    async execute(_toolCallId, params) {
      const text = await spotifyAction(params);
      return {
        content: [{ type: "text", text }],
        details: { action: params.action, query: params.query, uri: params.uri, deviceId: params.deviceId },
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("spotify_control ")) + theme.fg("muted", args.action || "");
      if (args.query) text += ` ${theme.fg("dim", `\"${args.query}\"`)}`;
      if (args.uri) text += ` ${theme.fg("dim", args.uri)}`;
      return new Text(text, 0, 0);
    },
    renderResult(result, _options, theme) {
      const first = result.content[0];
      const text = first?.type === "text" ? first.text : "";
      return new Text(theme.fg("muted", text), 0, 0);
    },
  });
}
