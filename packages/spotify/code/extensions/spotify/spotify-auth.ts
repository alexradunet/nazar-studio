import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { platform } from "node:os";
import { basename, join } from "node:path";

import { hasInteractiveUi, showText, writePrivateJsonSync, xdgConfigHome, xdgDataHome, xdgStateHome } from "@nazar/core/shared";

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
export const DEFAULT_REDIRECT_URI = "http://127.0.0.1:53682/callback";
export const AUTH_TIMEOUT_MS = 5 * 60_000;
export const TOKEN_REFRESH_SKEW_MS = 60_000;

export const SCOPES = [
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-modify-playback-state",
];

export type SpotifyConfig = {
  clientId?: string;
  redirectUri?: string;
};

export type EffectiveConfig = {
  clientId: string;
  redirectUri: string;
  clientIdSource: "env" | "config" | "missing";
  redirectUriSource: "env" | "config" | "default";
};

export type AuthSession = {
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  state: string;
  scope: string;
  authUrl: string;
  createdAt: number;
  expiresAt: number;
};

export type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

export type StoredToken = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  scope: string;
  expiresAt: number;
  savedAt: number;
};

export function configPath(): string {
  return join(xdgConfigHome(), "pi", "spotify.json");
}

export function tokenPath(): string {
  return join(xdgStateHome(), "pi", "spotify-token.json");
}

export function authSessionPath(): string {
  return join(xdgDataHome(), "pi", "spotify-auth-session.json");
}

function jsonReadDetail(error: unknown): string {
  if (error instanceof SyntaxError) return `: ${error.message}`;
  if (typeof error === "object" && error && "code" in error && typeof (error as { code?: unknown }).code === "string") {
    return `: ${(error as { code: string }).code}`;
  }
  return "";
}

function readJson<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (error) {
    throw new Error(`Spotify JSON state is unreadable or malformed in ${basename(path)}${jsonReadDetail(error)}`);
  }
}

function writeJson(path: string, value: unknown, mode = 0o600): void {
  writePrivateJsonSync(path, value, mode);
}

export function removeIfExists(path: string): void {
  rmSync(path, { force: true });
}

export function loadStoredConfig(): SpotifyConfig {
  return readJson<SpotifyConfig>(configPath()) || {};
}

export function effectiveConfig(): EffectiveConfig {
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

export function requireConfig(): EffectiveConfig {
  const config = effectiveConfig();
  if (!config.clientId) throw new Error(missingClientIdText());
  return config;
}

export function saveConfig(update: SpotifyConfig): void {
  const current = loadStoredConfig();
  writeJson(configPath(), { ...current, ...update });
}

export function loadToken(): StoredToken | undefined {
  return readJson<StoredToken>(tokenPath());
}

function saveToken(token: StoredToken): void {
  writeJson(tokenPath(), token, 0o600);
}

function saveAuthSession(session: AuthSession): void {
  writeJson(authSessionPath(), session, 0o600);
}

export function loadAuthSession(): AuthSession | undefined {
  return readJson<AuthSession>(authSessionPath());
}

function base64Url(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function createCodeVerifier(): string {
  return base64Url(randomBytes(64)).slice(0, 128);
}

export function codeChallenge(verifier: string): string {
  return base64Url(createHash("sha256").update(verifier).digest());
}

export function missingClientIdText(): string {
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

export function authUrlText(session: AuthSession): string {
  return [
    "Spotify login URL:",
    session.authUrl,
    "",
    `Redirect URI: ${session.redirectUri}`,
    "If the browser does not return to Pi automatically, paste the full final callback URL into:",
    "/spotify finish <callback-url>",
  ].join("\n");
}

export function createAuthSession(now = Date.now()): AuthSession {
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
    createdAt: now,
    expiresAt: now + AUTH_TIMEOUT_MS,
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

export function tokenFromResponse(data: TokenResponse, previous?: StoredToken, now = Date.now()): StoredToken {
  if (!data.access_token && !previous?.accessToken) throw new Error("Spotify token response did not include an access token.");
  const refreshToken = data.refresh_token || previous?.refreshToken;
  if (!refreshToken) throw new Error("Spotify token response did not include a refresh token. Re-run /spotify login.");
  const expiresIn = Number.isFinite(data.expires_in) ? Number(data.expires_in) : 3600;
  return {
    accessToken: data.access_token || previous!.accessToken,
    refreshToken,
    tokenType: data.token_type || previous?.tokenType || "Bearer",
    scope: data.scope || previous?.scope || "",
    expiresAt: now + expiresIn * 1000,
    savedAt: now,
  };
}

export async function exchangeCode(code: string, state: string): Promise<string> {
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

export async function refreshAccessToken(previous: StoredToken): Promise<StoredToken> {
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

export function shouldRefreshToken(token: StoredToken, now = Date.now()): boolean {
  return !token.accessToken || token.expiresAt <= now + TOKEN_REFRESH_SKEW_MS;
}

export async function accessToken(): Promise<string> {
  const token = loadToken();
  if (!token?.refreshToken) throw new Error("Spotify is not logged in. Run /spotify login first.");
  if (!shouldRefreshToken(token)) return token.accessToken;
  return (await refreshAccessToken(token)).accessToken;
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
  await showText(ctx, "spotify", `${instructions}\n\n${browser}\nWaiting up to ${AUTH_TIMEOUT_MS / 60_000} minutes for the local callback...`, "Spotify login started");
  const result = await callback;
  return exchangeCode(result.code, result.state);
}

export function configStatusText(): string {
  const config = effectiveConfig();
  const token = loadToken();
  const pending = loadAuthSession();
  const clientIdPreview = config.clientId ? `${config.clientId.slice(0, 6)}…${config.clientId.slice(-4)}` : "missing";
  return [
    "Spotify extension config",
    `Client ID: ${clientIdPreview} (${config.clientIdSource})`,
    `Redirect URI: ${config.redirectUri} (${config.redirectUriSource})`,
    `Required scopes: ${SCOPES.join(" ")}`,
    `Config path: ${configPath()}`,
    `Token path: ${tokenPath()} (${token ? "present" : "missing"})`,
    `Pending auth session: ${pending ? `yes, expires ${new Date(pending.expiresAt).toISOString()}` : "none"}`,
    "Tokens are stored outside the repository. Do not commit Spotify secrets or refresh tokens.",
  ].join("\n");
}
