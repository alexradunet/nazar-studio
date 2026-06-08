// SPDX-License-Identifier: AGPL-3.0-or-later
// Preload Chafa WASM so synchronous Pi avatar renders can use it when ready.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { chafaWasmError, chafaWasmReady, initChafaWasm } from "../lib/ui/chafa.ts";

export default async function (pi: ExtensionAPI) {
  await initChafaWasm();

  pi.registerCommand("nazar-chafa", {
    description: "Show Nazar's Chafa WASM avatar renderer status.",
    handler: async (_args: string, ctx: any) => {
      const status = chafaWasmReady()
        ? "Chafa WASM avatar renderer is ready."
        : `Chafa WASM avatar renderer unavailable; using internal ANSI fallback${chafaWasmError() ? `: ${chafaWasmError()}` : "."}`;
      try { ctx.ui.notify(status, chafaWasmReady() ? "info" : "warning"); } catch { /* ignore */ }
    },
  });
}
