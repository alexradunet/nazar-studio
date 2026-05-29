import { join, resolve } from "node:path";

import { readNazarSetupConfig } from "@nazar/core/setup";

export type MemoryPaths = {
  PROJECT_ROOT: string;
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
export const QMD_CONTEXT = "Pi memory: curated durable pages under the configured Nazar vault or repo-local fallback.";

function optionalPath(root: string, value?: string): string | undefined {
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
  const setupMemory = readNazarSetupConfig().memory;
  const VAULT_DIR = optionalPath(PROJECT_ROOT, process.env.NAZAR_HOME) || optionalPath(PROJECT_ROOT, setupMemory?.vaultDir);
  const NAZAR_DIR = VAULT_DIR ? join(VAULT_DIR, "05_Nazar") : join(PROJECT_ROOT, "memory");
  const LLM_WIKI_DIR = join(NAZAR_DIR, "llm-wiki");
  const LLM_WIKI_PAGES_DIR = join(LLM_WIKI_DIR, "wiki");

  const MEMORY_ROOT = VAULT_DIR ? join(NAZAR_DIR, "runtime") : join(PROJECT_ROOT, "memory");
  const PAGES_DIR = VAULT_DIR || join(MEMORY_ROOT, "pages");
  const AI_PAGES_DIR = VAULT_DIR ? LLM_WIKI_PAGES_DIR : join(PAGES_DIR, "ai");
  const PERSONAL_PAGES_DIR = VAULT_DIR || join(PAGES_DIR, "personal");
  const ROLLUPS_DIR = join(MEMORY_ROOT, "rollups");
  const STATE_DIR = join(MEMORY_ROOT, "state");
  const PINNED_MEMORY_PAGE = samePath(VAULT_DIR, PERSONAL_PAGES_DIR) ? join(NAZAR_DIR, "pinned-memory.md") : join(PERSONAL_PAGES_DIR, "pinned-memory.md");

  return {
    PROJECT_ROOT,
    VAULT_DIR,
    NAZAR_DIR,
    LLM_WIKI_DIR,
    LLM_WIKI_PAGES_DIR,
    MEMORY_ROOT,
    PAGES_DIR,
    AI_PAGES_DIR,
    PERSONAL_PAGES_DIR,
    ROLLUPS_DIR,
    STATE_DIR,
    PINNED_MEMORY_PAGE,
  };
}
