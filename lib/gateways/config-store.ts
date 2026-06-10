// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * gateways/config-store.ts — persisted gateway config + env merge.
 *
 * Gateway settings live as JSON under Balaur's data dir so they survive restarts.
 * Env vars remain an optional bootstrap/fallback; stored values take precedence.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { dataDir } from "../paths.ts";
import { readGatewayConfig } from "./config.ts";

export interface StoredConfig {
  gateway?: string;
  owner?: string;
  mirrorLocal?: boolean;
  toolPings?: boolean;
}

export interface EffectiveConfig {
  gateway: string;
  owner: string;
  mirrorLocal: boolean;
  toolPings: boolean;
  /** Enough to run: a transport is selected and an owner is set. */
  configured: boolean;
}

export function gatewayConfigPath(): string {
  return process.env.BALAUR_GATEWAY_CONFIG || join(dataDir(), "gateway", "config.json");
}

export function loadStoredConfig(path = gatewayConfigPath()): StoredConfig {
  try {
    if (!existsSync(path)) return {};
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return raw && typeof raw === "object" ? (raw as StoredConfig) : {};
  } catch {
    return {};
  }
}

export function saveStoredConfig(patch: StoredConfig, path = gatewayConfigPath()): StoredConfig {
  const merged: StoredConfig = { ...loadStoredConfig(path), ...patch };
  for (const key of Object.keys(merged) as (keyof StoredConfig)[]) {
    if (merged[key] === undefined) delete merged[key];
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(merged, null, 2));
  return merged;
}

export function clearStoredConfig(path = gatewayConfigPath()): void {
  try {
    if (existsSync(path)) rmSync(path);
  } catch {
    /* ignore */
  }
}

/** Merge env (fallback) with the persisted file (authoritative). */
export function resolveEffectiveConfig(
  env: NodeJS.ProcessEnv = process.env,
  path = gatewayConfigPath(),
): EffectiveConfig {
  const base = readGatewayConfig(env);
  const stored = loadStoredConfig(path);
  const gateway = (stored.gateway ?? base.gateway) || "";
  const owner = (stored.owner ?? base.owner) || "";
  const mirrorLocal = stored.mirrorLocal ?? base.mirrorLocal;
  const toolPings = stored.toolPings ?? base.toolPings;
  const configured = gateway.length > 0 && gateway !== "none" && gateway !== "off" && owner.length > 0;
  return { gateway, owner, mirrorLocal, toolPings, configured };
}
