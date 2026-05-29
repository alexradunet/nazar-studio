import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import { Container, type SelectItem, SelectList, Text } from "@earendil-works/pi-tui";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { hasInteractiveUi, showText } from "@nazar/core/shared";
import { getNazarDirs, nazarSetupConfigPath, readNazarSetupConfig, type SetupProfile, writeNazarSetupConfig } from "./setup-store.ts";
import { setupProviders, type SetupProvider } from "./setup-registry.ts";

async function show(ctx: ExtensionContext, title: string, text: string, level: "info" | "warning" | "error" = "info"): Promise<void> {
  await showText(ctx, "nazar-setup", text, title, level);
}

async function providerStatus(provider: SetupProvider): Promise<string> {
  try {
    const text = provider.statusText ? await provider.statusText() : "No status provider registered.";
    const lines = text.split("\n").filter((line) => line.trim()).map((line) => `- ${line}`);
    return [`${provider.label}:`, ...(lines.length > 0 ? lines : ["- no status"]), ""].join("\n");
  } catch (error) {
    return [`${provider.label}:`, `- status error: ${error instanceof Error ? error.message : String(error)}`, ""].join("\n");
  }
}

async function statusText(): Promise<string> {
  const config = readNazarSetupConfig();
  const dirs = getNazarDirs();
  const providers = setupProviders();
  const sections = await Promise.all(providers.map(providerStatus));

  return [
    "Nazar setup status",
    "",
    `Profile: ${config.profile || "unknown"}`,
    `Config: ${nazarSetupConfigPath()}`,
    `Config dir: ${dirs.configDir}`,
    `State dir: ${dirs.stateDir}`,
    `Data dir: ${dirs.dataDir}`,
    "",
    ...(sections.length > 0 ? sections : ["No feature setup providers are registered.", ""]),
  ].join("\n").trimEnd();
}

async function choose(ctx: ExtensionContext, title: string, options: string[]): Promise<string | undefined> {
  if (!hasInteractiveUi(ctx)) return undefined;
  return ctx.ui.select(title, options);
}

async function configureProfile(ctx: ExtensionContext): Promise<SetupProfile | undefined> {
  const selected = await choose(ctx, "What kind of computer is this?", ["laptop", "desktop", "remote", "headless", "custom"]);
  if (!selected) return undefined;
  const profile = selected as SetupProfile;
  writeNazarSetupConfig({ profile });
  return profile;
}

function configurableProviders(): SetupProvider[] {
  return setupProviders().filter((provider) => provider.configure);
}

function validSetupSections(): string[] {
  return ["all", ...configurableProviders().map((provider) => provider.id)];
}

type SetupAction = "all" | "status" | "doctor" | "cancel" | string;

async function showSetupMenu(ctx: ExtensionContext): Promise<SetupAction | undefined> {
  const providers = configurableProviders();
  const items: SelectItem[] = [
    { value: "all", label: "Run full setup (recommended)", description: providers.length > 0 ? `Profile plus ${providers.map((provider) => provider.label).join(", ")}` : "Profile only; no feature providers registered" },
    ...providers.map((provider) => ({ value: provider.id, label: `Configure ${provider.label}`, description: provider.label })),
    { value: "status", label: "Show status", description: "Inspect current Nazar setup without changing files" },
    { value: "doctor", label: "Run doctor", description: "Show status plus post-setup notes" },
    { value: "cancel", label: "Cancel", description: "Close setup without changes" },
  ];

  const result = await ctx.ui.custom<string | null>((tui, theme, _keybindings, done) => {
    const container = new Container();
    container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    container.addChild(new Text(theme.fg("accent", theme.bold("Nazar setup")), 1, 0));
    container.addChild(new Text(theme.fg("dim", "Choose what to configure. Secrets and auth tokens stay outside Nazar setup config."), 1, 0));

    const selectList = new SelectList(items, Math.min(items.length, 10), {
      selectedPrefix: (text) => theme.fg("accent", text),
      selectedText: (text) => theme.fg("accent", text),
      description: (text) => theme.fg("muted", text),
      scrollInfo: (text) => theme.fg("dim", text),
      noMatch: (text) => theme.fg("warning", text),
    });
    selectList.onSelect = (item) => done(item.value);
    selectList.onCancel = () => done(null);
    container.addChild(selectList);
    container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter select • esc cancel"), 1, 0));
    container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

    return {
      render(width: number) {
        return container.render(width);
      },
      invalidate() {
        container.invalidate();
      },
      handleInput(data: string) {
        selectList.handleInput(data);
        tui.requestRender();
      },
    };
  });

  return (result || undefined) as SetupAction | undefined;
}

function setupUsage(): string {
  const sections = validSetupSections().filter((section) => section !== "all");
  const optionalSections = sections.length > 0 ? `|${sections.join("|")}` : "";
  return `Usage: /nazar setup [all${optionalSections}]\n       /nazar status\n       /nazar doctor`;
}

async function runSetup(pi: ExtensionAPI, ctx: ExtensionContext, section?: string): Promise<void> {
  if (!hasInteractiveUi(ctx)) {
    await show(ctx, "Nazar setup", `${await statusText()}\n\nInteractive setup requires Pi interactive mode. Run /nazar setup in the TUI.`);
    return;
  }

  mkdirSync(dirname(nazarSetupConfigPath()), { recursive: true, mode: 0o700 });

  if (!section || section === "all") await configureProfile(ctx);

  const providers = configurableProviders();
  const selected = !section || section === "all" ? providers : providers.filter((provider) => provider.id === section);
  if (selected.length === 0 && section && section !== "all") {
    await show(ctx, "Nazar setup help", setupUsage(), "warning");
    return;
  }

  for (const provider of selected) {
    await show(ctx, `Nazar setup: ${provider.label}`, `Configuring ${provider.label.toLowerCase()}…`);
    await provider.configure?.(pi, ctx);
  }

  await show(ctx, "Nazar setup complete", `${await statusText()}\n\nNext: run /reload or restart Pi so setup changes are active.`);
}

async function showDoctor(ctx: ExtensionContext): Promise<void> {
  await show(ctx, "Nazar setup status", `${await statusText()}\n\nDoctor notes:\n- Reload/restart Pi after setup changes.\n- Runtime credentials and tokens are never stored in Nazar setup config.\n- On Windows, use winget for host dependencies when available.`);
}

async function setupCommand(pi: ExtensionAPI, ctx: ExtensionContext, section = ""): Promise<void> {
  let target = section.trim().toLowerCase();
  if (!target && hasInteractiveUi(ctx)) {
    const action = await showSetupMenu(ctx);
    if (!action || action === "cancel") {
      ctx.ui.notify("Nazar setup cancelled", "info");
      return;
    }
    target = action;
  }

  if (target === "status") {
    await show(ctx, "Nazar setup status", await statusText());
    return;
  }
  if (target === "doctor") {
    await showDoctor(ctx);
    return;
  }
  if (target && !validSetupSections().includes(target)) {
    await show(ctx, "Nazar setup help", setupUsage(), "warning");
    return;
  }
  await runSetup(pi, ctx, target || "all");
}

export function registerNazarSetupUse(pi: ExtensionAPI): void {
  pi.registerCommand("nazar", {
    description: "Nazar setup and status: /nazar setup|status|doctor",
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const command = (parts[0] || "status").toLowerCase();
      if (command === "setup") {
        await setupCommand(pi, ctx, parts[1] || "");
        return;
      }
      if (command === "status") {
        await show(ctx, "Nazar setup status", await statusText());
        return;
      }
      if (command === "doctor") {
        await showDoctor(ctx);
        return;
      }
      await show(ctx, "Nazar help", setupUsage(), "warning");
    },
  });

  pi.registerCommand("nazar-setup", {
    description: "Configure installed Nazar feature packages after installation",
    handler: async (args, ctx) => setupCommand(pi, ctx, args),
  });

  pi.registerCommand("nazar-status", {
    description: "Show Nazar setup status",
    handler: async (_args, ctx) => show(ctx, "Nazar setup status", await statusText()),
  });
}
