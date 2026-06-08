// SPDX-License-Identifier: AGPL-3.0-or-later
// Terminal font helper for Nazar's ANSI avatar ladder.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  defaultKittyConfigPath,
  IOSEVKA_FONT_FAMILY,
  IOSEVKA_URL,
  octantGlyphTestCommand,
  terminalKind,
  upsertKittyFontConfig,
} from "../lib/terminal-font.ts";

function commandOutput(command: string, args: string[] = []): string | undefined {
  try {
    return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return undefined;
  }
}

function hasIosevka(): boolean {
  return /iosevka/i.test(commandOutput("fc-list") ?? "");
}

function hasIosevkaOctants(): boolean {
  return /iosevka/i.test(commandOutput("fc-list", [":charset=1cd00", "family"]) ?? "");
}

function fontStatus(): string {
  const kind = terminalKind();
  const iosevka = hasIosevka();
  const octants = hasIosevkaOctants();
  const lines = [
    `terminal=${kind}`,
    `recommended_font=${IOSEVKA_FONT_FAMILY}`,
    `iosevka_installed=${iosevka ? "yes" : "no"}`,
    `iosevka_octants=${octants ? "yes" : "no"}`,
    `high_mode_test=${octantGlyphTestCommand()}`,
    `upstream=${IOSEVKA_URL}`,
  ];
  if (kind === "kitty") lines.push(`kitty_config=${defaultKittyConfigPath()}`);
  lines.push("Use /nazar-ui medium until the high_mode_test renders solid octant block fragments.");
  return lines.join("\n");
}

function backupPath(path: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${path}.bak-${stamp}`;
}

async function configureKitty(ctx: any): Promise<void> {
  if (terminalKind() !== "kitty") {
    try { ctx.ui.notify("Automatic terminal font configuration currently supports Kitty only. Use /skill:terminal-font for manual steps.", "warning"); } catch { /* ignore */ }
    return;
  }

  if (!hasIosevka()) {
    const note = `${IOSEVKA_FONT_FAMILY} is not visible to fontconfig. Install Iosevka first (${IOSEVKA_URL}), then rerun /nazar-terminal-font configure.`;
    try { ctx.ui.notify(note, "warning"); } catch { /* ignore */ }
    return;
  }

  const path = defaultKittyConfigPath();
  const prompt = `Set Kitty font_family and octant symbol_map to ${IOSEVKA_FONT_FAMILY}?\n${path}\nA backup is written first.`;
  const ok = ctx?.hasUI ? await ctx.ui.confirm("Configure Kitty font?", prompt) : false;
  if (!ok) {
    try { ctx.ui.notify("Kitty font configuration skipped.", "info"); } catch { /* ignore */ }
    return;
  }

  const current = existsSync(path) ? readFileSync(path, "utf8") : "";
  const next = upsertKittyFontConfig(current);
  if (!next.changed) {
    try { ctx.ui.notify(`Kitty already uses ${IOSEVKA_FONT_FAMILY} for Nazar octants.`, "info"); } catch { /* ignore */ }
    return;
  }

  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) copyFileSync(path, backupPath(path));
  writeFileSync(path, next.content, { mode: 0o600 });

  const note = `Updated Kitty config for ${IOSEVKA_FONT_FAMILY}. Restart Kitty or reload config, run: ${octantGlyphTestCommand()}, then /nazar-ui high.`;
  try { ctx.ui.notify(note, "info"); } catch { /* ignore */ }
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("nazar-terminal-font", {
    description: "Check or configure Nazar's recommended terminal font for high/octant avatars.",
    handler: async (args: string, ctx: any) => {
      const action = args.trim().split(/\s+/).filter(Boolean)[0]?.toLowerCase() || "status";
      if (["status", "show", "doctor", "help", "--help"].includes(action)) {
        try { ctx.ui.notify(fontStatus(), "info"); } catch { /* ignore */ }
        return;
      }
      if (action === "configure" || action === "kitty") {
        await configureKitty(ctx);
        return;
      }
      try { ctx.ui.notify("Usage: /nazar-terminal-font [status|configure]", "error"); } catch { /* ignore */ }
    },
  });
}
