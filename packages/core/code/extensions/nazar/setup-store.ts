import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { writePrivateJsonSync, xdgConfigHome, xdgDataHome, xdgStateHome } from "@nazar/core/shared";

export type SetupProfile = "laptop" | "desktop" | "termux" | "server" | "remote" | "headless" | "custom" | "unknown";

export type NazarSetupConfig = {
  version: 1;
  profile?: SetupProfile;
  memory?: {
    vaultDir?: string;
  };
  sessions?: {
    sessionDir?: string;
    shellProfile?: string;
    aliasWorkdir?: string;
    agentsPath?: string;
    currentHostPath?: string;
    sync?: "syncthing";
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
  return { vaultDir: defaultNazarHomeDir() };
}

function setupVaultDir(config = readNazarSetupConfig()): string {
  const envVault = envPath("NAZAR_HOME");
  if (envVault) return envVault;
  const configured = config.memory?.vaultDir?.trim();
  return configured ? resolve(configured) : defaultNazarHomeDir();
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
  const vaultDir = update.memory?.vaultDir?.trim() || current.memory?.vaultDir?.trim();
  const sessions = update.sessions || current.sessions;
  const next: NazarSetupConfig = {
    version: 1,
    updatedAt: new Date().toISOString(),
  };
  const profile = update.profile || current.profile;
  if (profile) next.profile = profile;
  if (vaultDir) next.memory = { vaultDir: resolve(vaultDir) };
  if (sessions) {
    const sessionDir = sessions.sessionDir?.trim();
    const shellProfile = sessions.shellProfile?.trim();
    const aliasWorkdir = sessions.aliasWorkdir?.trim();
    const agentsPath = sessions.agentsPath?.trim();
    const currentHostPath = sessions.currentHostPath?.trim();
    const sync = sessions.sync === "syncthing" ? sessions.sync : undefined;
    if (sessionDir || shellProfile || aliasWorkdir || agentsPath || currentHostPath || sync) {
      next.sessions = {
        ...(sessionDir ? { sessionDir: resolve(sessionDir) } : {}),
        ...(shellProfile ? { shellProfile: resolve(shellProfile) } : {}),
        ...(aliasWorkdir ? { aliasWorkdir: resolve(aliasWorkdir) } : {}),
        ...(agentsPath ? { agentsPath: resolve(agentsPath) } : {}),
        ...(currentHostPath ? { currentHostPath: resolve(currentHostPath) } : {}),
        ...(sync ? { sync } : {}),
      };
    }
  }
  writePrivateJsonSync(nazarSetupConfigPath(), next);
  return next;
}

export function ensureSetupDirectories(config = readNazarSetupConfig()): void {
  const dirs = getNazarDirs();
  const vaultDir = setupVaultDir(config);
  for (const dir of [dirs.configDir, dirs.stateDir, dirs.dataDir, vaultDir, join(vaultDir, "05_Nazar", "runtime"), join(vaultDir, "05_Nazar", "llm-wiki", "wiki"), join(vaultDir, "05_Nazar", "session")]) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}
