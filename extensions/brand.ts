// SPDX-License-Identifier: AGPL-3.0-or-later
// Nazar branding for the terminal TUI (avatar + design). No-ops cleanly when Pi is running
// without UI. Installed as a Pi package via `pi install npm:pi-nazar-studio`, so package/extension
// management is the host `pi` CLI's native job — this extension no longer shells out to a
// vendored bin/pi wrapper.
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { uiCapabilitySummary } from "../lib/ui/design.ts";
import { setGraphicsQuality, type GraphicsQuality } from "../lib/ui/graphics-state.ts";
import { patchRpgAvatars } from "../lib/ui/avatars.ts";
import { editorFactory } from "../lib/ui/editor.ts";
import { footerFactory } from "../lib/ui/footer.ts";
import { headerFactory } from "../lib/ui/header.ts";
import { recordSessionStart } from "../lib/ui/session-info.ts";

function applyNazarUI(pi: ExtensionAPI, ctx: ExtensionContext, onTui?: (tui: any) => void) {
  if (!ctx?.hasUI) return; // no terminal UI to brand
  try { ctx.ui.setTitle?.("Nazar"); } catch { /* ignore */ }
  try { ctx.ui.setHeader?.(headerFactory); } catch { /* ignore */ }
  try { ctx.ui.setWidget?.("nazar", undefined); } catch { /* clear old widget on /reload */ }
  try { ctx.ui.setWidget?.("nazar-thinking", undefined); } catch { /* remove legacy thinking widget */ }
  try { ctx.ui.setFooter?.(footerFactory(pi, ctx, onTui)); } catch { /* ignore */ }
  // Pass pi + ctx so the editor's nameplate meta can pull live runtime
  // info (model · git · tools · ctx). When pi/ctx are unavailable the
  // editor falls back to an empty meta — graceful degradation.
  try { ctx.ui.setEditorComponent?.(editorFactory(pi, ctx)); } catch { /* keep Pi's default editor */ }
  try { ctx.ui.setToolsExpanded?.(false); } catch { /* less visual noise by default */ }
}

export default function (pi: ExtensionAPI) {
  patchRpgAvatars();

  let renderTui: any;
  const activeToolAnimations = new Set<string>();
  let toolAnimationTicker: ReturnType<typeof setInterval> | undefined;

  function startToolAnimationTicker() {
    if (toolAnimationTicker || !renderTui) return;
    toolAnimationTicker = setInterval(() => {
      try { renderTui?.requestRender?.(); } catch { /* ignore */ }
    }, 180);
  }

  function stopToolAnimationTicker() {
    if (!toolAnimationTicker) return;
    clearInterval(toolAnimationTicker);
    toolAnimationTicker = undefined;
  }

  function trackToolAnimation(id: unknown) {
    if (typeof id !== "string" || !id) return;
    activeToolAnimations.add(id);
    startToolAnimationTicker();
  }

  function untrackToolAnimation(id: unknown) {
    if (typeof id === "string") activeToolAnimations.delete(id);
    if (activeToolAnimations.size === 0) stopToolAnimationTicker();
  }


  pi.on("session_start", async (_event: unknown, ctx: any) => {
    // Record the start moment so the header's third row can render a
    // "session opened · HH:MM" chapter divider. /reload re-fires this
    // event and overwrites the timestamp, which is the intended behaviour.
    recordSessionStart("opened");
    applyNazarUI(pi, ctx, (tui) => { renderTui = tui; });
  });

  pi.on("model_select", async (_event: unknown, _ctx: any) => {
    try { renderTui?.requestRender?.(); } catch { /* ignore */ }
  });

  pi.on("message_update", async (event: any) => {
    if (event?.message?.role === "assistant" && Array.isArray(event.message.content)) {
      for (const part of event.message.content) {
        if (part?.type === "toolCall") trackToolAnimation(part.id);
      }
      try { renderTui?.requestRender?.(); } catch { /* ignore */ }
    }
  });

  pi.on("tool_execution_start", async (event: any) => {
    trackToolAnimation(event?.toolCallId);
  });

  pi.on("tool_execution_end", async (event: any) => {
    untrackToolAnimation(event?.toolCallId);
  });

  pi.on("agent_end", async (_event: unknown) => {
    activeToolAnimations.clear();
    stopToolAnimationTicker();
  });

  pi.on("session_shutdown", async (_event: unknown) => {
    activeToolAnimations.clear();
    stopToolAnimationTicker();
  });

  pi.registerCommand("nazar-ui", {
    description: "Show Nazar's terminal graphics backend status.",
    handler: async (args: string, ctx: any) => {
      const requested = args.trim().split(/\s+/).filter(Boolean)[0]?.toLowerCase();
      const validInputs = new Set(["", "basic", "hd", "auto", "ansi", "kitty", "status", "show", "help", "--help"]);

      if (requested && !validInputs.has(requested)) {
        try { ctx.ui.notify("Usage: /nazar-ui [basic|hd|auto|status].", "error"); } catch { /* ignore */ }
        return;
      }

      if (requested === "basic" || requested === "ansi") setGraphicsQuality("basic");
      if (requested === "hd" || requested === "kitty") setGraphicsQuality("hd");
      if (requested === "auto") setGraphicsQuality("auto");

      const mode = (requested === "basic" || requested === "ansi" || requested === "hd" || requested === "kitty" || requested === "auto")
        ? `Set Nazar UI to ${requested === "ansi" ? "basic" : requested === "kitty" ? "hd" : requested as GraphicsQuality}. `
        : "";
      const note = `${mode}Look: basic=ANSI cell avatars, hd=Kitty placeholder cell avatars. ${uiCapabilitySummary()}`;
      try { ctx.ui.notify(note, "info"); } catch { /* ignore */ }
      try { renderTui?.requestRender?.(); } catch { /* ignore */ }
    },
  });


  pi.registerCommand("nazar", {
    description: "About Nazar",
    handler: async (_args: string, ctx: any) => {
      const msg =
        "Nazar — your personal wise companion, installed as a Pi package. Local-first by default; " +
        "frontier models only when deliberately switched. Memory and life-tracking stay in your " +
        "Markdown vault. Manage the package with the host CLI: pi list · pi update npm:pi-nazar-studio, " +
        "then /reload.";
      try { ctx.ui.notify(msg, "info"); } catch { /* ignore */ }
    },
  });
}
