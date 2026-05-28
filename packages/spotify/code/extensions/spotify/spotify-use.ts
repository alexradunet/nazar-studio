import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

import { getRemoteTurnOrigin } from "@nazar/core/remote-origin";
import { showText, toolError, truncateToolOutput } from "@nazar/core/shared";
import {
  accessToken,
  authSessionPath,
  authUrlText,
  configPath,
  configStatusText,
  createAuthSession,
  DEFAULT_REDIRECT_URI,
  effectiveConfig,
  exchangeCode,
  loadToken,
  refreshAccessToken,
  removeIfExists,
  saveConfig,
  spotifyLoginWithLocalCallback,
  tokenPath,
  type SpotifyConfig,
} from "./spotify-auth.ts";
import { callbackParts, normalizeSpotifyUri } from "./spotify-utils.ts";

const API_BASE = "https://api.spotify.com";

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
          await showText(ctx, "spotify", HELP_TEXT, "Spotify help updated");
          return;
        }

        if (command === "config" || command === "setup") {
          await showText(ctx, "spotify", await handleConfigCommand(parts), "Spotify config updated");
          return;
        }

        if (command === "login") {
          const result = await spotifyLoginWithLocalCallback(pi, ctx);
          await showText(ctx, "spotify", result, "Spotify login complete");
          return;
        }

        if (command === "auth-url" || command === "auth") {
          const session = createAuthSession();
          await showText(ctx, "spotify", authUrlText(session), "Spotify auth URL ready");
          return;
        }

        if (command === "finish" || command === "callback") {
          const callback = callbackParts(rest);
          await showText(ctx, "spotify", await exchangeCode(callback.code, callback.state), "Spotify login complete");
          return;
        }

        if (command === "logout") {
          removeIfExists(tokenPath());
          removeIfExists(authSessionPath());
          await showText(ctx, "spotify", `Spotify token removed: ${tokenPath()}`, "Spotify logged out");
          return;
        }

        if (command === "status") {
          await showText(ctx, "spotify", await spotifyStatusText(), "Spotify status updated");
          return;
        }

        if (command === "current" || command === "now" || command === "now-playing") {
          await showText(ctx, "spotify", await currentPlaybackText(), "Spotify current track updated");
          return;
        }

        if (command === "devices" || command === "device") {
          await showText(ctx, "spotify", await devicesText(), "Spotify devices updated");
          return;
        }

        if (command === "search") {
          await showText(ctx, "spotify", formatSearchResults(await searchTracks(rest, 5)), "Spotify search complete");
          return;
        }

        if (command === "play") {
          await showText(ctx, "spotify", await playText(isUriLike(rest) ? { uri: rest } : { query: rest }), "Spotify playback updated");
          return;
        }

        const action = commandAction(command);
        if (action) {
          await showText(ctx, "spotify", await spotifyAction({ action }), "Spotify playback updated");
          return;
        }

        if (command === "volume") {
          await showText(ctx, "spotify", await spotifyAction({ action: "volume", volumePercent: Number.parseFloat(rest) }), "Spotify volume updated");
          return;
        }

        if (command === "transfer") {
          await showText(ctx, "spotify", await spotifyAction({ action: "transfer", deviceId: rest }), "Spotify device updated");
          return;
        }

        await showText(ctx, "spotify", `Unknown /spotify command: ${command}\n\n${HELP_TEXT}`, "Unknown Spotify command", "warning");
      } catch (error) {
        await showText(ctx, "spotify", error instanceof Error ? error.message : String(error), "Spotify command failed", "error");
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
      "Before choosing music for a vague vibe request, use memory_search with default scope for durable music preferences, then choose a specific track unless the user asks for a playlist.",
      "spotify_control requires /spotify config client-id and /spotify login once, plus an active Spotify Connect device; playback-control errors may mean Spotify Premium or an active device is missing.",
    ],
    parameters: SpotifyParams,
    async execute(_toolCallId, params) {
      try {
        const text = await truncateToolOutput(await spotifyAction(params));
        return {
          content: [{ type: "text", text }],
          details: { action: params.action, query: params.query, uri: params.uri, deviceId: params.deviceId },
        };
      } catch (error) {
        throw toolError("spotify_control", error);
      }
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
