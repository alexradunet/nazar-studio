import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { writePrivateJsonSync, xdgConfigHome, xdgDataHome, xdgStateHome } from "../shared.ts";

export type SetupProfile = "laptop" | "desktop" | "remote" | "headless" | "custom" | "unknown";

export type NazarSetupConfig = {
  version: 1;
  profile?: SetupProfile;
  memory?: {
    vaultDir?: string;
    rootDir?: string;
    pagesDir?: string;
    aiPagesDir?: string;
    humanPagesDir?: string;
  };
  voice?: {
    modelDir?: string;
    sttCommand?: string;
    sttArgs?: string[];
    ttsCommand?: string;
    ttsArgs?: string[];
  };
  whatsapp?: {
    configured?: boolean;
    paired?: boolean;
  };
  spotify?: {
    configured?: boolean;
    loggedIn?: boolean;
  };
  updatedAt?: string;
};

export type NazarDirs = {
  configDir: string;
  stateDir: string;
  dataDir: string;
};

function envPath(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? resolve(value) : undefined;
}

export function getNazarDirs(): NazarDirs {
  return {
    configDir: envPath("NAZAR_CONFIG_DIR") || join(xdgConfigHome(), "nazar"),
    stateDir: envPath("NAZAR_STATE_DIR") || join(xdgStateHome(), "nazar", "state"),
    dataDir: envPath("NAZAR_DATA_DIR") || join(xdgDataHome(), "nazar", "data"),
  };
}

export function nazarSetupConfigPath(): string {
  return join(getNazarDirs().configDir, "setup.json");
}

export function defaultNazarHomeDir(): string {
  return envPath("NAZAR_HOME") || join(homedir(), "NazarVault");
}

export function defaultMemoryConfig(): Required<NonNullable<NazarSetupConfig["memory"]>> {
  const vaultDir = defaultNazarHomeDir();
  return {
    vaultDir,
    rootDir: join(vaultDir, "05_Nazar", "runtime"),
    pagesDir: vaultDir,
    aiPagesDir: join(vaultDir, "05_Nazar", "llm-wiki", "wiki"),
    humanPagesDir: vaultDir,
  };
}

export function defaultVoiceModelDir(config = readNazarSetupConfig()): string {
  const memory = { ...defaultMemoryConfig(), ...config.memory };
  return join(memory.rootDir, "state", "voice-models");
}

function parseNazarSetupConfig(strict: boolean): NazarSetupConfig {
  const path = nazarSetupConfigPath();
  try {
    if (!existsSync(path)) return { version: 1 };
    const parsed = JSON.parse(readFileSync(path, "utf8")) as NazarSetupConfig;
    return { version: 1, ...parsed };
  } catch (error) {
    if (strict) throw new Error(`Nazar setup config is unreadable or malformed at ${path}: ${error instanceof Error ? error.message : String(error)}`);
    return { version: 1 };
  }
}

export function readNazarSetupConfig(): NazarSetupConfig {
  return parseNazarSetupConfig(false);
}

export function writeNazarSetupConfig(update: Partial<NazarSetupConfig>): NazarSetupConfig {
  const current = parseNazarSetupConfig(true);
  const mergedMemory = { ...current.memory, ...update.memory };
  const memory = {
    vaultDir: mergedMemory.vaultDir,
    rootDir: mergedMemory.rootDir,
    pagesDir: mergedMemory.pagesDir,
    aiPagesDir: mergedMemory.aiPagesDir,
    humanPagesDir: mergedMemory.humanPagesDir,
  };
  const next: NazarSetupConfig = {
    ...current,
    ...update,
    version: 1,
    memory,
    voice: { ...current.voice, ...update.voice },
    whatsapp: { ...current.whatsapp, ...update.whatsapp },
    spotify: { ...current.spotify, ...update.spotify },
    updatedAt: new Date().toISOString(),
  };
  writePrivateJsonSync(nazarSetupConfigPath(), next);
  return next;
}

export function ensureSetupDirectories(config = readNazarSetupConfig()): void {
  const dirs = getNazarDirs();
  const memory = { ...defaultMemoryConfig(), ...config.memory };
  for (const dir of [dirs.configDir, dirs.stateDir, dirs.dataDir, memory.vaultDir, memory.rootDir, memory.pagesDir, memory.aiPagesDir, memory.humanPagesDir]) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}
