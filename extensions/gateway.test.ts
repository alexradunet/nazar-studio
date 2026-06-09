// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, test } from "vitest";
import gatewayExtension from "./gateway.ts";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function fakePi() {
  const events: string[] = [];
  const pi = {
    on: (event: string) => {
      events.push(event);
    },
    sendUserMessage: () => {},
    log: () => {},
  };
  return { pi: pi as unknown as ExtensionAPI, events };
}

const ENV_KEYS = ["NAZAR_GATEWAY", "NAZAR_WHATSAPP_OWNER", "NAZAR_GATEWAY_OWNER", "NAZAR_GATEWAY_MIRROR_LOCAL"];
afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe("gateway extension shell", () => {
  test("no-op when disabled (registers no lifecycle handlers)", () => {
    const { pi, events } = fakePi();
    gatewayExtension(pi);
    expect(events).toHaveLength(0);
  });

  test("no-op when enabled but owner is missing", () => {
    process.env.NAZAR_GATEWAY = "fake";
    const { pi, events } = fakePi();
    gatewayExtension(pi);
    expect(events).toHaveLength(0);
  });

  test("arms lifecycle wiring when enabled with an owner", () => {
    process.env.NAZAR_GATEWAY = "fake";
    process.env.NAZAR_WHATSAPP_OWNER = "+40712345678";
    const { pi, events } = fakePi();
    gatewayExtension(pi);
    expect(events).toEqual(
      expect.arrayContaining(["session_start", "before_agent_start", "message_end", "agent_end", "session_shutdown"]),
    );
  });
});
