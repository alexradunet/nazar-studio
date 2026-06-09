// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test } from "vitest";
import gatewayExtension from "./gateway.ts";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function fakePi() {
  const events: string[] = [];
  const commands: string[] = [];
  const pi = {
    on: (event: string) => {
      events.push(event);
    },
    registerCommand: (name: string) => {
      commands.push(name);
    },
    sendUserMessage: () => {},
    log: () => {},
  };
  return { pi: pi as unknown as ExtensionAPI, events, commands };
}

describe("gateway extension", () => {
  test("registers /nazar-whatsapp and the Pi lifecycle handlers", () => {
    const { pi, events, commands } = fakePi();
    gatewayExtension(pi);
    expect(commands).toContain("nazar-whatsapp");
    expect(events).toEqual(
      expect.arrayContaining(["session_start", "before_agent_start", "message_end", "agent_end", "session_shutdown"]),
    );
  });
});
