import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { currentHostContextText, registerNazarSessionSetupProvider } from "./nazar/session-setup.ts";
import { registerNazarSetupUse } from "./nazar/setup-use.ts";

export default function nazarExtension(pi: ExtensionAPI) {
  const unregisterSessionSetupProvider = registerNazarSessionSetupProvider();
  pi.on("session_shutdown", unregisterSessionSetupProvider);

  pi.on("before_agent_start", (event) => {
    const context = currentHostContextText();
    if (!context) return;
    return {
      systemPrompt: `${event.systemPrompt}\n\n## Current Nazar host (host-local context)\n${context}`,
    };
  });

  registerNazarSetupUse(pi);
}
