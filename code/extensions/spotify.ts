import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerSpotifyUse } from "./spotify/spotify-use.ts";

export default function spotifyExtension(pi: ExtensionAPI) {
  registerSpotifyUse(pi);
}
