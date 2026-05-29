import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerWhatsAppSetupProvider } from "./whatsapp/setup-provider.ts";
import { registerWhatsAppUse } from "./whatsapp/whatsapp-use.ts";

export default function whatsappExtension(pi: ExtensionAPI) {
  const unregisterWhatsAppSetupProvider = registerWhatsAppSetupProvider();
  pi.on("session_shutdown", unregisterWhatsAppSetupProvider);
  registerWhatsAppUse(pi);
}
