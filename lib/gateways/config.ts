// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * gateways/config.ts — env-driven gateway configuration (pure + testable).
 *
 * The gateway is OFF unless NAZAR_GATEWAY selects a transport. Owner is the
 * single number allowed to drive Pi (the master lock). mirrorLocal controls
 * whether turns typed at the local terminal also echo to your phone (default
 * off). The WhatsApp fields configure the linked-device session + auth method.
 */
import { join } from "node:path";
import { dataDir } from "../paths.ts";

export interface GatewayConfig {
  /** Whether the gateway extension should arm itself. */
  enabled: boolean;
  /** Selected transport id, lowercased ("whatsapp" | "fake" | …). */
  gateway: string;
  /** Owner phone/JID (raw; the lock normalises it). */
  owner: string;
  /** Echo locally-typed turns to the chat too. */
  mirrorLocal: boolean;
  /** Directory holding the persisted WhatsApp linked-device session. */
  sessionDir: string;
  /** WhatsApp auth method: scan a QR (default) or request a pairing code. */
  authMode: "qr" | "pairing";
  /** Nazar's own WhatsApp number — required only for pairing-code auth. */
  pairingNumber: string;
  /** Send throttled per-tool activity pings to the chat (default off). */
  toolPings: boolean;
}

const TRUEY = new Set(["1", "true", "yes", "on"]);

export function readGatewayConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const gateway = (env.NAZAR_GATEWAY ?? "").trim().toLowerCase();
  const owner = (env.NAZAR_WHATSAPP_OWNER ?? env.NAZAR_GATEWAY_OWNER ?? "").trim();
  const mirrorLocal = TRUEY.has((env.NAZAR_GATEWAY_MIRROR_LOCAL ?? "").trim().toLowerCase());
  const enabled = gateway.length > 0 && gateway !== "none" && gateway !== "off";
  const authMode = (env.NAZAR_WHATSAPP_AUTH ?? "").trim().toLowerCase() === "pairing" ? "pairing" : "qr";
  const sessionDir = (env.NAZAR_WHATSAPP_SESSION_DIR ?? "").trim() || join(dataDir(), "whatsapp-auth");
  const pairingNumber = (env.NAZAR_WHATSAPP_NUMBER ?? "").trim();
  const toolPings = TRUEY.has((env.NAZAR_GATEWAY_TOOL_PINGS ?? "").trim().toLowerCase());
  return { enabled, gateway, owner, mirrorLocal, sessionDir, authMode, pairingNumber, toolPings };
}
