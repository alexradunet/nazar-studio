// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * gateways/factory.ts — resolve a Gateway implementation from config.
 *
 * Separate from index.ts so callers can import it without a cycle. The in-memory
 * "fake" gateway powers wiring smokes and tests.
 */
import type { Gateway } from "./types.ts";
import type { GatewayConfig } from "./config.ts";
import { FakeGateway } from "./fake-gateway.ts";

export function createGateway(config: GatewayConfig): Gateway | undefined {
  switch (config.gateway) {
    case "fake":
      return new FakeGateway();
    default:
      return undefined;
  }
}
