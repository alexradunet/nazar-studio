// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { readGatewayConfig } from "./config.ts";

test("disabled when NAZAR_GATEWAY is unset, none, or off", () => {
  expect(readGatewayConfig({}).enabled).toBe(false);
  expect(readGatewayConfig({ NAZAR_GATEWAY: "none" }).enabled).toBe(false);
  expect(readGatewayConfig({ NAZAR_GATEWAY: "off" }).enabled).toBe(false);
});

test("parses gateway (lowercased), owner, and mirrorLocal", () => {
  const c = readGatewayConfig({
    NAZAR_GATEWAY: "WhatsApp",
    NAZAR_WHATSAPP_OWNER: "+40712345678",
    NAZAR_GATEWAY_MIRROR_LOCAL: "yes",
  });
  expect(c.enabled).toBe(true);
  expect(c.gateway).toBe("whatsapp");
  expect(c.owner).toBe("+40712345678");
  expect(c.mirrorLocal).toBe(true);
});

test("mirrorLocal defaults off; owner falls back to NAZAR_GATEWAY_OWNER", () => {
  const c = readGatewayConfig({ NAZAR_GATEWAY: "fake", NAZAR_GATEWAY_OWNER: "40712345678" });
  expect(c.mirrorLocal).toBe(false);
  expect(c.owner).toBe("40712345678");
});

test("whatsapp auth defaults to qr; honors pairing, session dir, and number", () => {
  const c = readGatewayConfig({
    NAZAR_GATEWAY: "whatsapp",
    NAZAR_WHATSAPP_OWNER: "1",
    NAZAR_WHATSAPP_AUTH: "pairing",
    NAZAR_WHATSAPP_SESSION_DIR: "/tmp/session",
    NAZAR_WHATSAPP_NUMBER: "+40711000000",
  });
  expect(c.authMode).toBe("pairing");
  expect(c.sessionDir).toBe("/tmp/session");
  expect(c.pairingNumber).toBe("+40711000000");
});

test("auth defaults to qr and a session dir is always resolved", () => {
  const c = readGatewayConfig({ NAZAR_GATEWAY: "whatsapp" });
  expect(c.authMode).toBe("qr");
  expect(c.sessionDir.length).toBeGreaterThan(0);
});
