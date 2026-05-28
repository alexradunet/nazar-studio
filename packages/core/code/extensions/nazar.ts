import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerNazarSetupUse } from "./nazar/setup-use.ts";

export default function nazarExtension(pi: ExtensionAPI) {
  registerNazarSetupUse(pi);
}
