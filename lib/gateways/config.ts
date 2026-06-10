// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * gateways/config.ts — env-driven gateway configuration (pure + testable).
 *
 * The gateway is OFF unless BALAUR_GATEWAY selects a transport. Owner is the
 * single identity allowed through the master lock. mirrorLocal controls whether
 * turns typed at the local terminal also echo to the external chat (default off).
 */
import { runtimeEnv } from "../env.ts";

export interface GatewayConfig {
  /** Whether the gateway extension should arm itself. */
  enabled: boolean;
  /** Selected transport id, lowercased ("fake" | future adapters). */
  gateway: string;
  /** Owner identity (raw; the lock normalises it). */
  owner: string;
  /** Echo locally-typed turns to the chat too. */
  mirrorLocal: boolean;
  /** Send throttled per-tool activity pings to the chat (default off). */
  toolPings: boolean;
}

const TRUEY = new Set(["1", "true", "yes", "on"]);

export function readGatewayConfig(env: NodeJS.ProcessEnv = runtimeEnv()): GatewayConfig {
  const gateway = (env.BALAUR_GATEWAY ?? "").trim().toLowerCase();
  const owner = (env.BALAUR_GATEWAY_OWNER ?? "").trim();
  const mirrorLocal = TRUEY.has((env.BALAUR_GATEWAY_MIRROR_LOCAL ?? "").trim().toLowerCase());
  const enabled = gateway.length > 0 && gateway !== "none" && gateway !== "off";
  const toolPings = TRUEY.has((env.BALAUR_GATEWAY_TOOL_PINGS ?? "").trim().toLowerCase());
  return { enabled, gateway, owner, mirrorLocal, toolPings };
}
