import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerWhatsAppUse } from "./whatsapp/whatsapp-use.ts";

export default function whatsappExtension(pi: ExtensionAPI) {
  registerWhatsAppUse(pi);
}
