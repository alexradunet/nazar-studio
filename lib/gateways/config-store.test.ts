// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearStoredConfig, loadStoredConfig, resolveEffectiveConfig, saveStoredConfig } from "./config-store.ts";

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "nazar-gw-"));
  path = join(dir, "config.json");
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("config store", () => {
  test("empty when no file exists", () => {
    expect(loadStoredConfig(path)).toEqual({});
  });

  test("save merges across calls and persists", () => {
    saveStoredConfig({ gateway: "whatsapp", owner: "+40712345678" }, path);
    saveStoredConfig({ mirrorLocal: true }, path);
    expect(loadStoredConfig(path)).toEqual({ gateway: "whatsapp", owner: "+40712345678", mirrorLocal: true });
  });

  test("clear removes the file", () => {
    saveStoredConfig({ owner: "x" }, path);
    clearStoredConfig(path);
    expect(loadStoredConfig(path)).toEqual({});
  });
});

describe("resolveEffectiveConfig", () => {
  test("stored wins over env; configured when gateway+owner set", () => {
    saveStoredConfig({ gateway: "whatsapp", owner: "+40712345678", toolPings: true }, path);
    const eff = resolveEffectiveConfig(
      { NAZAR_GATEWAY: "whatsapp", NAZAR_WHATSAPP_OWNER: "+1", NAZAR_GATEWAY_TOOL_PINGS: "0" },
      path,
    );
    expect(eff.owner).toBe("+40712345678");
    expect(eff.toolPings).toBe(true);
    expect(eff.configured).toBe(true);
    expect(eff.autoConnect).toBe(true);
  });

  test("falls back to env when nothing is stored", () => {
    const eff = resolveEffectiveConfig({ NAZAR_GATEWAY: "whatsapp", NAZAR_WHATSAPP_OWNER: "+1" }, path);
    expect(eff.owner).toBe("+1");
    expect(eff.configured).toBe(true);
  });

  test("not configured without an owner", () => {
    expect(resolveEffectiveConfig({}, path).configured).toBe(false);
  });
});
