import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { join, resolve } from "node:path";

import { defaultMemoryConfig, ensureSetupDirectories, readNazarSetupConfig, writeNazarSetupConfig } from "@nazar/core/setup";
import { registerSetupProvider, type SetupProvider } from "@nazar/core/setup-registry";
import { hasInteractiveUi, showText } from "@nazar/core/shared";

import { ensureMemoryStorage } from "./memory-use.ts";
import { getMemoryPaths } from "./paths.ts";

async function show(ctx: ExtensionContext, title: string, text: string, level: "info" | "warning" | "error" = "info"): Promise<void> {
  await showText(ctx, "nazar-setup", text, title, level);
}

async function input(ctx: ExtensionContext, title: string, placeholder = ""): Promise<string | undefined> {
  if (!hasInteractiveUi(ctx)) return undefined;
  return ctx.ui.input(title, placeholder);
}

function memoryConfigFromVault(vaultDir: string) {
  return { vaultDir: resolve(vaultDir) };
}

function memoryConfigSummary(memory: ReturnType<typeof memoryConfigFromVault>): string {
  return [
    `Vault root: ${memory.vaultDir}`,
    "",
    "Derived paths:",
    `- Runtime/state: ${join(memory.vaultDir, "05_Nazar", "runtime")}`,
    `- QMD/search root: ${memory.vaultDir}`,
    `- AI/LLM wiki: ${join(memory.vaultDir, "05_Nazar", "llm-wiki", "wiki")}`,
    `- Human Obsidian vault: ${memory.vaultDir}`,
  ].join("\n");
}

async function configureMemory(ctx: ExtensionContext): Promise<void> {
  const defaults = defaultMemoryConfig();
  const current = readNazarSetupConfig().memory || {};
  const vaultInput = await input(ctx, "Nazar Obsidian vault root", current.vaultDir || defaults.vaultDir);
  const vaultDir = (vaultInput?.trim() || current.vaultDir || defaults.vaultDir).trim();
  if (!vaultDir) {
    await show(ctx, "Memory setup cancelled", "No Nazar vault root was selected. Memory configuration was left unchanged.", "warning");
    return;
  }

  const memory = memoryConfigFromVault(vaultDir);
  writeNazarSetupConfig({ memory });
  ensureSetupDirectories(readNazarSetupConfig());
  ensureMemoryStorage();
  await show(ctx, "Memory configured", `${memoryConfigSummary(memory)}\n\nRun /reload or restart Pi so all extensions see the updated vault paths.`);
}

function memorySetupStatusText(): string {
  const paths = getMemoryPaths();
  return [
    `Vault: ${paths.VAULT_DIR || "(not configured; local dev fallback)"}`,
    `Runtime root: ${paths.MEMORY_ROOT}`,
    `Search/pages root: ${paths.PAGES_DIR}`,
    `AI/wiki pages: ${paths.AI_PAGES_DIR}`,
    `Human vault: ${paths.PERSONAL_PAGES_DIR}`,
  ].join("\n");
}

export function registerMemorySetupProvider(): () => void {
  const provider: SetupProvider = {
    id: "memory",
    label: "Memory",
    order: 10,
    configure: async (_pi, ctx) => configureMemory(ctx),
    statusText: memorySetupStatusText,
  };
  return registerSetupProvider(provider);
}
