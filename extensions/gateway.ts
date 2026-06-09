// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * gateway.ts — Nazar Pi extension: talk to Pi through a messaging gateway
 * (WhatsApp first; Signal/others later). Everything — device registration and
 * config — is done from inside Pi via the /nazar-whatsapp command; settings
 * persist to JSON under the nazar data dir (env vars remain an optional
 * fallback). Bound to the Pi session: it connects on session_start (when linked
 * and auto-connect is on) and disconnects on session_shutdown. No daemon, no
 * RPC; keep it alive by running Pi in tmux.
 *
 * A single configured owner number may drive the agent (the master lock). The
 * local terminal stays usable alongside the chat (dual control). WhatsApp needs
 * the optional 'baileys' (+ 'qrcode-terminal') packages, imported only on connect.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { applyMenuAction, buildMenuOptions, createGatewayController } from "../lib/gateways/index.ts";

function piLog(pi: ExtensionAPI, message: string): void {
  (pi as unknown as { log?: (message: string) => void }).log?.(message);
}

export default function (pi: ExtensionAPI) {
  const controller = createGatewayController(pi, { log: (message) => piLog(pi, message) });
  controller.registerLifecycle();

  pi.registerCommand("nazar-whatsapp", {
    description: "Set up and control the WhatsApp gateway: connect/link, owner number, auth, toggles, logoff.",
    handler: async (_args: string, ctx: any) => {
      if (!ctx?.hasUI || typeof ctx?.ui?.select !== "function") {
        try {
          ctx?.ui?.notify?.("/nazar-whatsapp needs an interactive terminal.", "error");
        } catch {
          /* ignore */
        }
        return;
      }

      const options = buildMenuOptions({
        connected: controller.isConnected(),
        status: controller.statusText(),
        config: controller.getConfig(),
      });

      let choice: string | undefined;
      try {
        choice = await ctx.ui.select(controller.statusText(), options.map((o) => o.label), { timeout: 60000 });
      } catch {
        return;
      }
      if (!choice) return;
      const action = options.find((o) => o.label === choice)?.value;
      if (!action) return;

      try {
        const summary = await applyMenuAction(action, {
          getConfig: () => controller.getConfig(),
          saveConfig: (patch) => controller.saveConfig(patch),
          connect: () => controller.connect(),
          disconnect: () => controller.disconnect(),
          logoff: () => controller.logoff(),
          statusText: () => controller.statusText(),
          input: (label, initial) => ctx.ui.input(label, initial ?? "", { timeout: 60000 }),
        });
        ctx.ui.notify(summary, "info");
      } catch (err) {
        try {
          ctx.ui.notify(`WhatsApp action failed: ${String(err)}`, "error");
        } catch {
          /* ignore */
        }
      }
    },
  });
}
