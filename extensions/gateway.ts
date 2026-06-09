// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * gateway.ts — Nazar Pi extension: talk to Pi through a messaging gateway
 * (WhatsApp first; Signal/others later). Bound to the Pi session — it connects
 * on session_start and disconnects on session_shutdown. No daemon, no RPC; you
 * keep it alive by running Pi in tmux.
 *
 * A single configured owner number may drive the agent (the master lock). The
 * local terminal stays usable alongside the chat (dual control): inbound
 * messages are injected with deliverAs:"followUp", so Pi's own one-turn-at-a-
 * time loop serialises local + remote input. The chat receives answers plus a
 * compact working/done status.
 *
 * OFF by default. Enable with:
 *   NAZAR_GATEWAY=whatsapp          (the transport; =fake for a wiring smoke)
 *   NAZAR_WHATSAPP_OWNER=<number>   (your personal number — the master lock)
 *   NAZAR_WHATSAPP_AUTH=qr|pairing  (default qr; pairing needs NAZAR_WHATSAPP_NUMBER)
 *   NAZAR_GATEWAY_MIRROR_LOCAL=1    (optional: echo locally-typed turns too)
 *
 * WhatsApp needs the optional 'baileys' (and 'qrcode-terminal') packages; they
 * are dynamically imported only when the gateway connects.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  createGateway,
  GatewayManager,
  installGateway,
  MasterLock,
  readGatewayConfig,
} from "../lib/gateways/index.ts";

function piLog(pi: ExtensionAPI, message: string): void {
  (pi as unknown as { log?: (message: string) => void }).log?.(message);
}

export default function (pi: ExtensionAPI) {
  const config = readGatewayConfig(process.env);
  if (!config.enabled) return; // dormant unless NAZAR_GATEWAY selects a transport

  const gateway = createGateway(config, { log: (message) => piLog(pi, message) });
  if (!gateway) {
    piLog(pi, `[gateway] no implementation for "${config.gateway}" — not started.`);
    return;
  }

  if (!config.owner) {
    piLog(pi, `[gateway] ${gateway.label} not started: set NAZAR_WHATSAPP_OWNER to your number (the master lock).`);
    return;
  }

  const lock = new MasterLock(config.owner);
  const manager = new GatewayManager({
    lock,
    inject: (text, options) => pi.sendUserMessage(text, options),
    send: (chatId, message) => gateway.send(chatId, message),
    mirrorLocal: config.mirrorLocal,
    log: (message) => piLog(pi, message),
  });

  installGateway(pi, gateway, manager);
  piLog(pi, `[gateway] ${gateway.label} armed for owner ${lock.ownerId} (mirrorLocal=${config.mirrorLocal}).`);
}
