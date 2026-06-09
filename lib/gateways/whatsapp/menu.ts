// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * gateways/whatsapp/menu.ts — the /nazar-whatsapp menu logic, factored out of
 * the extension so it unit-tests without a TUI. buildMenuOptions() derives the
 * choices from current state; applyMenuAction() performs one via injected I/O.
 */
import type { EffectiveConfig, StoredConfig } from "../config-store.ts";

export type MenuAction =
  | "connect"
  | "disconnect"
  | "set-owner"
  | "auth-qr"
  | "auth-pairing"
  | "toggle-mirror"
  | "toggle-toolpings"
  | "toggle-autoconnect"
  | "logoff"
  | "status";

export interface MenuOption {
  label: string;
  value: MenuAction;
}

export interface MenuState {
  connected: boolean;
  status: string;
  config: EffectiveConfig;
}

const onOff = (b: boolean) => (b ? "on" : "off");

export function buildMenuOptions(state: MenuState): MenuOption[] {
  const c = state.config;
  const options: MenuOption[] = [];
  options.push({ value: "connect", label: state.connected ? "Reconnect" : "Connect / link device" });
  if (state.connected) options.push({ value: "disconnect", label: "Disconnect" });
  options.push({ value: "set-owner", label: c.owner ? `Set my number (now ${c.owner})` : "Set my number (required)" });
  options.push(
    c.authMode === "pairing"
      ? { value: "auth-qr", label: "Auth: pairing → switch to QR" }
      : { value: "auth-pairing", label: "Auth: QR → switch to pairing code" },
  );
  options.push({ value: "toggle-mirror", label: `Mirror local turns: ${onOff(c.mirrorLocal)}` });
  options.push({ value: "toggle-toolpings", label: `Tool pings: ${onOff(c.toolPings)}` });
  options.push({ value: "toggle-autoconnect", label: `Auto-connect on startup: ${onOff(c.autoConnect)}` });
  options.push({ value: "logoff", label: "Log off (delete linked device)" });
  options.push({ value: "status", label: "Status" });
  return options;
}

export interface MenuDeps {
  getConfig: () => EffectiveConfig;
  saveConfig: (patch: StoredConfig) => EffectiveConfig;
  connect: () => Promise<void> | void;
  disconnect: () => Promise<void> | void;
  logoff: () => Promise<void> | void;
  statusText: () => string;
  /** Prompt the owner for a value; resolves undefined when cancelled. */
  input: (label: string, initial: string) => Promise<string | undefined>;
}

export async function applyMenuAction(action: MenuAction, deps: MenuDeps): Promise<string> {
  const c = deps.getConfig();
  switch (action) {
    case "connect":
      await deps.connect();
      return "Connecting… watch for a QR or pairing code if this is the first link.";
    case "disconnect":
      await deps.disconnect();
      return "WhatsApp disconnected.";
    case "set-owner": {
      const value = await deps.input("Your WhatsApp number — the only one allowed to drive Pi", c.owner);
      if (value === undefined || !value.trim()) return "Cancelled — owner unchanged.";
      deps.saveConfig({ gateway: "whatsapp", owner: value.trim() });
      return `Owner set to ${value.trim()}. Choose Connect to link the device.`;
    }
    case "auth-qr":
      deps.saveConfig({ authMode: "qr" });
      return "Auth method set to QR.";
    case "auth-pairing": {
      deps.saveConfig({ authMode: "pairing" });
      const num = await deps.input("Nazar's own WhatsApp number (for the pairing code)", c.pairingNumber);
      if (num !== undefined && num.trim()) deps.saveConfig({ pairingNumber: num.trim() });
      return "Auth method set to pairing code.";
    }
    case "toggle-mirror": {
      const next = !c.mirrorLocal;
      deps.saveConfig({ mirrorLocal: next });
      return `Mirror local turns: ${onOff(next)}.`;
    }
    case "toggle-toolpings": {
      const next = !c.toolPings;
      deps.saveConfig({ toolPings: next });
      return `Tool pings: ${onOff(next)}.`;
    }
    case "toggle-autoconnect": {
      const next = !c.autoConnect;
      deps.saveConfig({ autoConnect: next });
      return `Auto-connect on startup: ${onOff(next)}.`;
    }
    case "logoff":
      await deps.logoff();
      return "Logged off and deleted the linked-device session. Choose Connect to re-link.";
    case "status":
      return deps.statusText();
    default:
      return "Unknown action.";
  }
}
