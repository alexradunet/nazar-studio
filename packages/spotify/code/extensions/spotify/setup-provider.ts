import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { writeNazarSetupConfig } from "@nazar/core/setup";
import { registerSetupProvider } from "@nazar/core/setup-registry";
import { showText } from "@nazar/core/shared";

import { spotifyLoginWithLocalCallback } from "./spotify-auth.ts";
import { saveSpotifySetupConfig, spotifySetupStatusText } from "./spotify-use.ts";

async function show(ctx: ExtensionContext, title: string, text: string, level: "info" | "warning" | "error" = "info"): Promise<void> {
  await showText(ctx, "nazar-setup", text, title, level);
}

async function input(ctx: ExtensionContext, title: string, placeholder = ""): Promise<string | undefined> {
  if (ctx.hasUI === false) return undefined;
  return ctx.ui.input(title, placeholder);
}

async function confirm(ctx: ExtensionContext, title: string, message: string): Promise<boolean> {
  if (ctx.hasUI === false) return false;
  return ctx.ui.confirm(title, message);
}

async function configureSpotify(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
  const clientId = await input(ctx, "Spotify Client ID", "");
  const redirectUri = await input(ctx, "Spotify redirect URI", "http://127.0.0.1:53682/callback");
  if (clientId?.trim() || redirectUri?.trim()) {
    saveSpotifySetupConfig({ clientId: clientId?.trim() || undefined, redirectUri: redirectUri?.trim() || undefined });
    writeNazarSetupConfig({ spotify: { configured: Boolean(clientId?.trim()), loggedIn: false } });
  }

  const startLogin = await confirm(ctx, "Spotify login", "Start Spotify OAuth login now? This opens your browser and stores the token outside the repository.");
  if (!startLogin) return;

  try {
    const result = await spotifyLoginWithLocalCallback(pi, ctx);
    writeNazarSetupConfig({ spotify: { configured: true, loggedIn: true } });
    await show(ctx, "Spotify login complete", result);
  } catch (error) {
    await show(ctx, "Spotify login failed", error instanceof Error ? error.message : String(error), "error");
  }
}

export function registerSpotifySetupProvider(): void {
  registerSetupProvider({
    id: "spotify",
    label: "Spotify",
    order: 40,
    configure: configureSpotify,
    statusText: spotifySetupStatusText,
  });
}
