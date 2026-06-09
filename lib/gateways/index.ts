// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * gateways/index.ts — public surface for the messaging-gateway layer.
 *
 * WhatsApp is the first transport (Baileys, an optional peer dep imported only
 * on connect). The whole thing is set up and driven from inside Pi via the
 * /nazar-whatsapp command; config persists to JSON under the nazar data dir
 * (config-store) with env vars as an optional fallback. Adding a transport is a
 * one-line case in factory.ts plus its implementation file.
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
export { createGateway, type CreateGatewayDeps } from "./factory.ts";
export { createGatewayController, type GatewayController, type GatewayControllerDeps } from "./install.ts";
export { renderQrAscii } from "./qr.ts";
export { stripAnsi, chunkText } from "./format.ts";
export { WhatsAppGateway, type WhatsAppGatewayOptions } from "./whatsapp/whatsapp-gateway.ts";
export {
  gatewayConfigPath,
  loadStoredConfig,
  saveStoredConfig,
  clearStoredConfig,
  resolveEffectiveConfig,
  type StoredConfig,
  type EffectiveConfig,
} from "./config-store.ts";
export {
  buildMenuOptions,
  applyMenuAction,
  type MenuAction,
  type MenuOption,
  type MenuState,
  type MenuDeps,
} from "./whatsapp/menu.ts";
