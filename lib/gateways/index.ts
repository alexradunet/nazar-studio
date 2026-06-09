// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * gateways/index.ts — public surface + the transport factory.
 *
 * createGateway() resolves a Gateway from config. WhatsApp (Baileys) lands in a
 * follow-up PR; today only the in-memory "fake" gateway is built in, used for a
 * wiring smoke (NAZAR_GATEWAY=fake) and tests. Adding a transport is a one-line
 * case here plus its implementation file — nothing else in the core changes.
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

import type { Gateway } from "./types.ts";
import type { GatewayConfig } from "./config.ts";
import { FakeGateway } from "./fake-gateway.ts";

export function createGateway(config: GatewayConfig): Gateway | undefined {
  switch (config.gateway) {
    case "fake":
      return new FakeGateway();
    // case "whatsapp": implemented in the WhatsApp gateway PR (Baileys)
    default:
      return undefined;
  }
}
