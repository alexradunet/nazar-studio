// SPDX-License-Identifier: AGPL-3.0-or-later
// Chafa avatar cache status for Nazar's ANSI-only terminal surface.
import { existsSync, readFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CHAFA_CACHE_PATH, type ChafaCache } from "../lib/ui/chafa-render.ts";

function cacheStatus(): string {
  if (!existsSync(CHAFA_CACHE_PATH)) return "Chafa avatar cache is missing; internal ANSI fallback will render avatars.";

  try {
    const cache = JSON.parse(readFileSync(CHAFA_CACHE_PATH, "utf8")) as ChafaCache;
    const entries = Object.keys(cache).length;
    const rowSizes = [...new Set(Object.keys(cache).map((key) => key.split("#").at(-1) ?? "?"))].sort();
    return `Chafa avatar cache ready: ${entries} entries; rows=${rowSizes.join(",")}.`;
  } catch {
    return "Chafa avatar cache is unreadable; internal ANSI fallback will render avatars.";
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("nazar-chafa", {
    description: "Show Nazar's Chafa ANSI avatar cache status.",
    handler: async (_args: string, ctx: any) => {
      try { ctx.ui.notify(cacheStatus(), "info"); } catch { /* ignore */ }
    },
  });
}
