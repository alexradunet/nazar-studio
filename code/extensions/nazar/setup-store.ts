import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";

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

function windowsAppData(): string {
  return process.env.APPDATA || join(homedir(), "AppData", "Roaming");
}

function windowsLocalAppData(): string {
  return process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
}

export function getNazarDirs(): NazarDirs {
  if (platform() === "win32") {
    return {
      configDir: envPath("NAZAR_CONFIG_DIR") || join(windowsAppData(), "nazar"),
      stateDir: envPath("NAZAR_STATE_DIR") || join(windowsLocalAppData(), "nazar", "state"),
      dataDir: envPath("NAZAR_DATA_DIR") || join(windowsLocalAppData(), "nazar", "data"),
    };
  }

  return {
    configDir: envPath("NAZAR_CONFIG_DIR") || join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "nazar"),
    stateDir: envPath("NAZAR_STATE_DIR") || join(process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"), "nazar"),
    dataDir: envPath("NAZAR_DATA_DIR") || join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "nazar"),
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
  const path = nazarSetupConfigPath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Best effort on platforms that do not support POSIX modes.
  }
  return next;
}

export function ensureSetupDirectories(config = readNazarSetupConfig()): void {
  const memory = { ...defaultMemoryConfig(), ...config.memory };
  for (const dir of [getNazarDirs().configDir, getNazarDirs().stateDir, getNazarDirs().dataDir, memory.vaultDir, memory.rootDir, memory.pagesDir, memory.aiPagesDir, memory.humanPagesDir]) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}
