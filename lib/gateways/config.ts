// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * gateways/config.ts — env-driven gateway configuration (pure + testable).
 *
 * The gateway is OFF unless NAZAR_GATEWAY selects a transport. Owner is the
 * single number allowed to drive Pi (the master lock). mirrorLocal controls
 * whether turns you type at the local terminal also echo to your phone
 * (default off, so the phone stays quiet unless it asked).
 */

export interface GatewayConfig {
  /** Whether the gateway extension should arm itself. */
  enabled: boolean;
  /** Selected transport id, lowercased ("whatsapp" | "fake" | …). */
  gateway: string;
  /** Owner phone/JID (raw; the lock normalises it). */
  owner: string;
  /** Echo locally-typed turns to the chat too. */
  mirrorLocal: boolean;
}

const TRUEY = new Set(["1", "true", "yes", "on"]);

export function readGatewayConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const gateway = (env.NAZAR_GATEWAY ?? "").trim().toLowerCase();
  const owner = (env.NAZAR_WHATSAPP_OWNER ?? env.NAZAR_GATEWAY_OWNER ?? "").trim();
  const mirrorLocal = TRUEY.has((env.NAZAR_GATEWAY_MIRROR_LOCAL ?? "").trim().toLowerCase());
  const enabled = gateway.length > 0 && gateway !== "none" && gateway !== "off";
  return { enabled, gateway, owner, mirrorLocal };
}
