// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * gateways/index.ts — public surface for the messaging-gateway layer.
 *
 * Config persists to JSON under the Balaur data dir (config-store), with env vars
 * as an optional fallback. Future gateway wiring should attach to Balaur's
 * runtime event bus.
 */
export * from "./types.ts";
export { MasterLock, normalizeId } from "./lock.ts";
export { GatewayManager } from "./manager.ts";
export type {
  GatewayCommand,
  GatewayManagerOptions,
  InboundOutcome,
  Injector,
  PresenceSink,
  Sender,
  TurnOrigin,
} from "./manager.ts";
export { FakeGateway, type RecordedSend } from "./fake-gateway.ts";
export { readGatewayConfig, type GatewayConfig } from "./config.ts";
export { createGateway } from "./factory.ts";
export { stripAnsi, chunkText } from "./format.ts";
export {
  gatewayConfigPath,
  loadStoredConfig,
  saveStoredConfig,
  clearStoredConfig,
  resolveEffectiveConfig,
  type StoredConfig,
  type EffectiveConfig,
} from "./config-store.ts";
