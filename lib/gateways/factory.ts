// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * gateways/factory.ts — resolve a Gateway implementation from config.
 *
 * Separate from index.ts so the controller can import it without a cycle.
 * WhatsApp uses Baileys (optional peer dep, imported only on connect). The
 * in-memory "fake" gateway powers a wiring smoke and tests.
 */
import type { Gateway } from "./types.ts";
import type { GatewayConfig } from "./config.ts";
import { FakeGateway } from "./fake-gateway.ts";
import { WhatsAppGateway } from "./whatsapp/whatsapp-gateway.ts";

export interface CreateGatewayDeps {
  log?: (message: string) => void;
}

export function createGateway(config: GatewayConfig, deps: CreateGatewayDeps = {}): Gateway | undefined {
  switch (config.gateway) {
    case "fake":
      return new FakeGateway();
    case "whatsapp":
      return new WhatsAppGateway({
        sessionDir: config.sessionDir,
        authMode: config.authMode,
        pairingNumber: config.pairingNumber || undefined,
        log: deps.log,
      });
    default:
      return undefined;
  }
}
