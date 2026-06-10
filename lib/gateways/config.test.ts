// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "bun:test";
import { readGatewayConfig } from "./config.ts";

test("disabled when BALAUR_GATEWAY is unset, none, or off", () => {
  expect(readGatewayConfig({}).enabled).toBe(false);
  expect(readGatewayConfig({ BALAUR_GATEWAY: "none" }).enabled).toBe(false);
  expect(readGatewayConfig({ BALAUR_GATEWAY: "off" }).enabled).toBe(false);
});

test("parses gateway (lowercased), owner, and mirrorLocal", () => {
  const c = readGatewayConfig({
    BALAUR_GATEWAY: "Fake",
    BALAUR_GATEWAY_OWNER: "+40712345678",
    BALAUR_GATEWAY_MIRROR_LOCAL: "yes",
  });
  expect(c.enabled).toBe(true);
  expect(c.gateway).toBe("fake");
  expect(c.owner).toBe("+40712345678");
  expect(c.mirrorLocal).toBe(true);
});

test("mirrorLocal defaults off; owner falls back to BALAUR_GATEWAY_OWNER", () => {
  const c = readGatewayConfig({ BALAUR_GATEWAY: "fake", BALAUR_GATEWAY_OWNER: "40712345678" });
  expect(c.mirrorLocal).toBe(false);
  expect(c.owner).toBe("40712345678");
});

test("toolPings defaults off and can be enabled", () => {
  expect(readGatewayConfig({ BALAUR_GATEWAY: "fake" }).toolPings).toBe(false);
  expect(readGatewayConfig({ BALAUR_GATEWAY: "fake", BALAUR_GATEWAY_TOOL_PINGS: "1" }).toolPings).toBe(true);
});
