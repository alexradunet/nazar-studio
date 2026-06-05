// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * personality.ts — Nazar persona + operating rules, injected in-process.
 *
 * Pi package manifests load extensions / skills / prompts / themes but NOT context files, so the
 * persona that install.sh + seed-pi-config.sh used to hand-copy into ~/.pi/agent (SYSTEM.md +
 * AGENTS.md) now travels WITH the package and is injected into the system prompt at
 * before_agent_start. That keeps `pi install npm:pi-nazar-studio` fully self-contained.
 *
 * The persona applies on ALL models (it is identity, not private data). Private MEMORY recall is
 * handled separately by extensions/memory.ts and stays local-model-only. Set NAZAR_PERSONA=0 to
 * disable injection (e.g. when you want a bare Pi prompt on a frontier model).
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { packageRoot } from "../lib/paths.ts";

const PERSONA_MARKER = "You are **Nazar**";

function readDoc(name: string): string {
  try {
    return readFileSync(join(packageRoot(), name), "utf8").trim();
  } catch {
    return "";
  }
}

/** SYSTEM.md (the persona) followed by AGENTS.md (the operating rules). */
function personaBlock(): string {
  return [readDoc("SYSTEM.md"), readDoc("AGENTS.md")].filter(Boolean).join("\n\n---\n\n");
}

function log(pi: ExtensionAPI, message: string): void {
  (pi as unknown as { log?: (message: string) => void }).log?.(message);
}

export default function (pi: ExtensionAPI) {
  if (process.env.NAZAR_PERSONA === "0") {
    log(pi, "[personality] persona injection disabled (NAZAR_PERSONA=0)");
    return;
  }
  const persona = personaBlock();
  if (!persona) {
    log(pi, "[personality] SYSTEM.md/AGENTS.md not found in package — skipping persona injection");
    return;
  }

  pi.on("before_agent_start", (event: any) => {
    const base: string = typeof event?.systemPrompt === "string" ? event.systemPrompt : "";
    if (base.includes(PERSONA_MARKER)) return; // already present — never double-inject
    // Persona leads (Nazar's identity); memory recall, if any, is appended by memory.ts.
    return { systemPrompt: `${persona}\n\n${base}` };
  });

  log(pi, "[personality] Nazar persona + operating rules will be injected each turn");
}
