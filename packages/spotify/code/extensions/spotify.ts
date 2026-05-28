import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { unregisterSetupProvider } from "@nazar/core/setup-registry";

import { registerSpotifySetupProvider } from "./spotify/setup-provider.ts";
import { registerSpotifyUse } from "./spotify/spotify-use.ts";

export default function spotifyExtension(pi: ExtensionAPI) {
  registerSpotifySetupProvider();
  pi.on("session_shutdown", () => unregisterSetupProvider("spotify"));
  registerSpotifyUse(pi);
}
