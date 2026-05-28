import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerTtsUse } from "./voice/tts-use.ts";
import { registerVoiceUse } from "./voice/voice-use.ts";

export default function (pi: ExtensionAPI) {
  registerTtsUse(pi);
  registerVoiceUse(pi);
}
