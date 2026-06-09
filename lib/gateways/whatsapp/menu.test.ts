// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test, vi } from "vitest";
import { applyMenuAction, buildMenuOptions, type MenuDeps } from "./menu.ts";
import type { EffectiveConfig } from "../config-store.ts";

function cfg(over: Partial<EffectiveConfig> = {}): EffectiveConfig {
  return {
    gateway: "whatsapp",
    owner: "+40712345678",
    authMode: "qr",
    pairingNumber: "",
    mirrorLocal: false,
    toolPings: false,
    autoConnect: true,
    sessionDir: "/tmp/s",
    configured: true,
    ...over,
  };
}

function makeDeps(initial = cfg()) {
  let current = initial;
  const saved: Record<string, unknown>[] = [];
  const deps: MenuDeps & { saved: Record<string, unknown>[] } = {
    getConfig: () => current,
    saveConfig: (patch) => {
      saved.push(patch as Record<string, unknown>);
      current = { ...current, ...patch } as EffectiveConfig;
      return current;
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
    logoff: vi.fn(),
    statusText: () => "WhatsApp: connected",
    input: vi.fn(async () => "+15551234567"),
    saved,
  };
  return deps;
}

describe("buildMenuOptions", () => {
  test("shows Disconnect only when connected", () => {
    expect(buildMenuOptions({ connected: false, status: "x", config: cfg() }).some((o) => o.value === "disconnect")).toBe(false);
    expect(buildMenuOptions({ connected: true, status: "x", config: cfg() }).some((o) => o.value === "disconnect")).toBe(true);
  });

  test("offers the opposite auth mode", () => {
    expect(buildMenuOptions({ connected: false, status: "x", config: cfg({ authMode: "qr" }) }).some((o) => o.value === "auth-pairing")).toBe(true);
    expect(buildMenuOptions({ connected: false, status: "x", config: cfg({ authMode: "pairing" }) }).some((o) => o.value === "auth-qr")).toBe(true);
  });
});

describe("applyMenuAction", () => {
  test("set-owner saves the entered number and selects whatsapp", async () => {
    const deps = makeDeps();
    await applyMenuAction("set-owner", deps);
    expect(deps.saved.some((p) => p.owner === "+15551234567" && p.gateway === "whatsapp")).toBe(true);
  });

  test("toggle-mirror flips and persists", async () => {
    const deps = makeDeps(cfg({ mirrorLocal: false }));
    await applyMenuAction("toggle-mirror", deps);
    expect(deps.saved.some((p) => p.mirrorLocal === true)).toBe(true);
  });

  test("toggle-autoconnect flips and persists", async () => {
    const deps = makeDeps(cfg({ autoConnect: true }));
    await applyMenuAction("toggle-autoconnect", deps);
    expect(deps.saved.some((p) => p.autoConnect === false)).toBe(true);
  });

  test("connect, disconnect, and logoff call the controller", async () => {
    const deps = makeDeps();
    await applyMenuAction("connect", deps);
    await applyMenuAction("disconnect", deps);
    await applyMenuAction("logoff", deps);
    expect(deps.connect).toHaveBeenCalledOnce();
    expect(deps.disconnect).toHaveBeenCalledOnce();
    expect(deps.logoff).toHaveBeenCalledOnce();
  });

  test("status returns the controller status text", async () => {
    expect(await applyMenuAction("status", makeDeps())).toContain("connected");
  });
});
