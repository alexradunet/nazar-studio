// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * gateways/index.ts — public surface + the transport factory.
 *
 * createGateway() resolves a Gateway from config. WhatsApp uses Baileys, which
 * is an optional peer dependency dynamically imported only on connect(), so the
 * core never loads it unless the gateway is enabled. The in-memory "fake"
 * gateway powers a wiring smoke (NAZAR_GATEWAY=fake) and tests. Adding a
 * transport is a one-line case here plus its implementation file.
 */
export * from "./types.ts";
export { MasterLock, normalizeId } from "./lock.ts";
export { GatewayManager } from "./manager.ts";
export type {
  GatewayCommand,
  GatewayManagerOptions,
  InboundOutcome,
  Injector,
  Sender,
  TurnOrigin,
} from "./manager.ts";
export { FakeGateway, type RecordedSend } from "./fake-gateway.ts";
export { readGatewayConfig, type GatewayConfig } from "./config.ts";
export { installGateway, type InstalledGateway } from "./install.ts";
export { renderQrAscii } from "./qr.ts";
export { WhatsAppGateway, type WhatsAppGatewayOptions } from "./whatsapp/whatsapp-gateway.ts";

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
