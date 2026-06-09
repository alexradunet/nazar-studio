// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, expect, test } from "vitest";
import personality from "./personality.ts";

const original = process.env.NAZAR_PERSONA;
afterEach(() => {
  if (original === undefined) delete process.env.NAZAR_PERSONA;
  else process.env.NAZAR_PERSONA = original;
});

function fakePi() {
  const handlers: Record<string, any> = {};
  return { pi: { on: (n: string, h: any) => { handlers[n] = h; }, log() {} } as any, handlers };
}

test("persona injection registers a before_agent_start hook that prepends the persona", () => {
  delete process.env.NAZAR_PERSONA;
  const { pi, handlers } = fakePi();
  personality(pi);
  expect(typeof handlers.before_agent_start).toBe("function");
  const out = handlers.before_agent_start({ systemPrompt: "BASE PROMPT" });
  expect(out.systemPrompt.endsWith("BASE PROMPT")).toBe(true);
  expect(out.systemPrompt.length).toBeGreaterThan("BASE PROMPT".length);
});

test("persona is never double-injected when the marker is already present", () => {
  delete process.env.NAZAR_PERSONA;
  const { pi, handlers } = fakePi();
  personality(pi);
  const out = handlers.before_agent_start({ systemPrompt: "intro\nYou are **Nazar**, the companion." });
  expect(out).toBeUndefined();
});

test("NAZAR_PERSONA=0 disables injection (no hook registered)", () => {
  process.env.NAZAR_PERSONA = "0";
  const { pi, handlers } = fakePi();
  personality(pi);
  expect(handlers.before_agent_start).toBeUndefined();
});
