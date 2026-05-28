import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { unregisterSetupProvider } from "@nazar/core/setup-registry";
import { clearTranscriber, setTranscriber } from "@nazar/core/transcriber";

import { transcribeSherpaPcm16 } from "./voice/sherpa-runtime.ts";
import { registerVoiceSetupProvider } from "./voice/setup-provider.ts";
import { registerTtsUse } from "./voice/tts-use.ts";
import { registerVoiceUse } from "./voice/voice-use.ts";

export default function voiceExtension(pi: ExtensionAPI) {
  registerVoiceSetupProvider();
  setTranscriber(transcribeSherpaPcm16);
  pi.on("session_shutdown", () => {
    unregisterSetupProvider("voice");
    clearTranscriber(transcribeSherpaPcm16);
  });
  registerTtsUse(pi);
  registerVoiceUse(pi);
}
