import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerSpotifySetupProvider } from "./spotify/setup-provider.ts";
import { registerSpotifyUse } from "./spotify/spotify-use.ts";

export default function spotifyExtension(pi: ExtensionAPI) {
  const unregisterSpotifySetupProvider = registerSpotifySetupProvider();
  pi.on("session_shutdown", unregisterSpotifySetupProvider);
  registerSpotifyUse(pi);
}
