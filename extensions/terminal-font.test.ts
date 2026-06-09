// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import terminalFont from "./terminal-font.ts";

test("terminal-font extension registers the nazar-terminal-font command", () => {
  const commands: Record<string, any> = {};
  const pi = { registerCommand: (name: string, def: any) => { commands[name] = def; } } as any;
  terminalFont(pi);
  expect(commands["nazar-terminal-font"]).toBeDefined();
  expect(typeof commands["nazar-terminal-font"].handler).toBe("function");
  expect(typeof commands["nazar-terminal-font"].description).toBe("string");
});
