import { join, resolve } from "node:path";

import { readNazarSetupConfig } from "../nazar/setup-store.ts";

export type MemoryPaths = {
  PROJECT_ROOT: string;
  CODE_ROOT: string;
  VAULT_DIR?: string;
  NAZAR_DIR: string;
  LLM_WIKI_DIR: string;
  LLM_WIKI_PAGES_DIR: string;
  MEMORY_ROOT: string;
  PAGES_DIR: string;
  AI_PAGES_DIR: string;
  PERSONAL_PAGES_DIR: string;
  ROLLUPS_DIR: string;
  STATE_DIR: string;
  PINNED_MEMORY_PAGE: string;
};

export const QMD_INDEX = "memory-wiki";
export const QMD_COLLECTION = "memory-pages";
export const QMD_CONTEXT = "Pi memory: curated durable pages under configurable AI/wiki and human vault dirs.";

function envPath(name: string, root: string, fallback: string, configured?: string): string {
  const value = process.env[name]?.trim() || configured?.trim();
  return value ? resolve(root, value) : fallback;
}

function configuredPath(root: string, value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? resolve(root, trimmed) : undefined;
}

function samePath(a: string | undefined, b: string | undefined): boolean {
  return Boolean(a && b && resolve(a) === resolve(b));
}

export function projectRoot(): string {
  return resolve(process.env.PI_PROJECT_ROOT || process.cwd());
}

export function getMemoryPaths(root = projectRoot()): MemoryPaths {
  const PROJECT_ROOT = resolve(root);
  const CODE_ROOT = join(PROJECT_ROOT, "code");
  const setupMemory = readNazarSetupConfig().memory;
  const ENV_VAULT_DIR = configuredPath(PROJECT_ROOT, process.env.NAZAR_HOME);
  const VAULT_DIR = ENV_VAULT_DIR || configuredPath(PROJECT_ROOT, setupMemory?.vaultDir);
  // NAZAR_HOME is a portable vault override: when present, derive all default
  // memory paths from that vault and ignore setup-config custom subpaths unless
  // explicit PI_* path env vars override them below.
  const configuredUnlessEnvVault = (value: string | undefined): string | undefined => (ENV_VAULT_DIR ? undefined : value);
  const NAZAR_DIR = VAULT_DIR ? join(VAULT_DIR, "05_Nazar") : join(PROJECT_ROOT, "memory");
  const LLM_WIKI_DIR = join(NAZAR_DIR, "llm-wiki");
  const LLM_WIKI_RAW_DIR = join(LLM_WIKI_DIR, "raw");
  const LLM_WIKI_PAGES_DIR = join(LLM_WIKI_DIR, "wiki");

  const MEMORY_ROOT = envPath("PI_MEMORY_ROOT", PROJECT_ROOT, VAULT_DIR ? join(NAZAR_DIR, "runtime") : join(PROJECT_ROOT, "memory"), configuredUnlessEnvVault(setupMemory?.rootDir));
  const PAGES_DIR = envPath("PI_MEMORY_PAGES_DIR", PROJECT_ROOT, VAULT_DIR || join(MEMORY_ROOT, "pages"), configuredUnlessEnvVault(setupMemory?.pagesDir));
  const AI_PAGES_DIR = envPath("PI_AI_MEMORY_DIR", PROJECT_ROOT, VAULT_DIR ? LLM_WIKI_PAGES_DIR : join(PAGES_DIR, "ai"), configuredUnlessEnvVault(setupMemory?.aiPagesDir));
  const PERSONAL_PAGES_DIR = envPath("PI_HUMAN_MEMORY_DIR", PROJECT_ROOT, VAULT_DIR || join(PAGES_DIR, "personal"), process.env.PI_PERSONAL_MEMORY_DIR?.trim() || configuredUnlessEnvVault(setupMemory?.humanPagesDir));
  const ROLLUPS_DIR = join(MEMORY_ROOT, "rollups");
  const STATE_DIR = join(MEMORY_ROOT, "state");
  const JOURNAL_DIR = join(MEMORY_ROOT, "journal");
  const JOURNAL_ENTRIES_DIR = join(JOURNAL_DIR, "entries");
  const SOURCES_DIR = join(MEMORY_ROOT, "sources");
  const INDEXES_DIR = join(MEMORY_ROOT, "indexes");
  const ARCHIVE_DIR = join(MEMORY_ROOT, "archive");
  const PINNED_MEMORY_PAGE = samePath(VAULT_DIR, PERSONAL_PAGES_DIR) ? join(NAZAR_DIR, "pinned-memory.md") : join(PERSONAL_PAGES_DIR, "pinned-memory.md");

  return {
    PROJECT_ROOT,
    CODE_ROOT,
    VAULT_DIR,
    NAZAR_DIR,
    LLM_WIKI_DIR,
    LLM_WIKI_RAW_DIR,
    LLM_WIKI_PAGES_DIR,
    MEMORY_ROOT,
    PAGES_DIR,
    AI_PAGES_DIR,
    PERSONAL_PAGES_DIR,
    ROLLUPS_DIR,
    STATE_DIR,
    JOURNAL_DIR,
    JOURNAL_ENTRIES_DIR,
    SOURCES_DIR,
    INDEXES_DIR,
    ARCHIVE_DIR,
    PINNED_MEMORY_PAGE,
  };
}
