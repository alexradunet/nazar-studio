import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { unregisterSetupProvider } from "@nazar/core/setup-registry";

import { registerWhatsAppSetupProvider } from "./whatsapp/setup-provider.ts";
import { registerWhatsAppUse } from "./whatsapp/whatsapp-use.ts";

export default function whatsappExtension(pi: ExtensionAPI) {
  registerWhatsAppSetupProvider();
  pi.on("session_shutdown", () => unregisterSetupProvider("whatsapp"));
  registerWhatsAppUse(pi);
}
