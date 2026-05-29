---
date: 2026-05-29T18:26:27+0300
author: Alex Radu
commit: 6238334a
branch: main
repository: nazar
topic: "Provider-owned setup onboarding"
tags: [design, setup, onboarding, memory]
status: ready
parent: .rpiv/artifacts/solutions/2026-05-29_17-55-06_setup-onboarding-enhancements.md
last_updated: 2026-05-29T18:26:27+0300
last_updated_by: Alex Radu
---

# Design: Provider-owned Setup Onboarding

## Summary

Nazar setup will keep `@nazar/core` as the setup/orchestration contract owner while moving memory-specific onboarding copy into the canonical `@nazar/memory` package. Core will collect provider-owned onboarding prompts after setup, ask whether to start the first-run chat, persist prompted/skipped state in a private state file, and expose `/nazar onboard` as an explicit rerun path.

## Requirements

- Start a current-model onboarding conversation after setup when a configured provider contributes onboarding.
- Ask one question at a time and require explicit user approval before any memory write.
- Keep memory/Life OS wording out of `@nazar/core`; `@nazar/memory` owns canonical memory onboarding copy.
- Avoid repeated onboarding on setup reruns unless the user explicitly invokes `/nazar onboard`.
- Preserve headless behavior: no surprise agent turn without interactive setup UI.
- Document memory as canonical but separately packaged.

## Current State Analysis

### Key Discoveries

- `SetupProvider` is the existing extension contract for feature-owned setup/status behavior: `packages/core/code/extensions/nazar/setup-registry.ts:3`.
- Core setup discovers and orders providers through `setupProviders()`: `packages/core/code/extensions/nazar/setup-use.ts:52`, `packages/core/code/extensions/nazar/setup-use.ts:82`.
- Provider setup is already selected and executed in one loop: `packages/core/code/extensions/nazar/setup-use.ts:153`, `packages/core/code/extensions/nazar/setup-use.ts:160`.
- Current onboarding copy is hard-coded in core and mentions Life OS/memory tools: `packages/core/code/extensions/nazar/setup-use.ts:15`, `packages/core/code/extensions/nazar/setup-use.ts:23`.
- Current setup completion always triggers onboarding: `packages/core/code/extensions/nazar/setup-use.ts:165`, `packages/core/code/extensions/nazar/setup-use.ts:166`.
- Setup config is intentionally narrow and drops unknown fields: `packages/core/code/extensions/nazar/setup-store.ts:9`, `packages/core/code/tests/pi-core.test.mjs:33`.
- Nazar already has a private state root through `getNazarDirs().stateDir`: `packages/core/code/extensions/nazar/setup-store.ts:27`.
- Memory registers its setup provider from the memory package: `packages/memory/code/extensions/memory/memory-setup.ts:64`.
- Memory owns durable prompt context today through its extension hook: `packages/memory/code/extensions/memory.ts:24`.
- Core boundary tests guard against importing feature packages into core setup: `packages/core/code/tests/pi-review-remediation.test.mjs:13`.

## Scope

### Building

- Optional onboarding prompt hook on `SetupProvider`.
- Core helper module for onboarding contribution collection, prompt composition, and private prompted/skipped state.
- Setup Start/Skip/Later preflight after successful provider setup.
- `/nazar onboard` explicit rerun command that force-includes provider prompts.
- Memory-owned onboarding prompt contribution in `@nazar/memory`.
- Core and memory tests for provider contribution, idempotency, no-provider no-op, manual rerun, and boundary hygiene.
- README wording that memory is canonical but separately packaged.

### Not Building

- Full merge of `@nazar/memory` into `@nazar/core`.
- A meta-package such as `@nazar/nazar`.
- OpenClaw-style bootstrap sentinel files.
- Automatic memory writes during setup.
- Web setup portal, OAuth flows, or non-terminal onboarding surfaces.
- New Life OS tools or changes to memory storage semantics.

## Decisions

### Decision: Provider-owned onboarding hook

Core will extend the existing provider contract rather than hard-code memory behavior. `SetupProvider` already uses optional fields (`configure?`, `statusText?`) at `packages/core/code/extensions/nazar/setup-registry.ts:3`, and memory already registers through that contract at `packages/memory/code/extensions/memory/memory-setup.ts:64`.

### Decision: Private state file for idempotency

Onboarding prompted/skipped state will live under `getNazarDirs().stateDir` in a private JSON file, not in `setup.json`. Setup config currently preserves only supported user-authored fields at `packages/core/code/extensions/nazar/setup-store.ts:72`, and tests assert unsupported keys are removed at `packages/core/code/tests/pi-core.test.mjs:33`.

### Decision: Ask before launching post-setup chat

After successful setup, core will ask Start/Skip/Later before sending the current-model onboarding prompt. Manual `/nazar onboard` is the explicit rerun path and can force include provider prompts that were previously prompted or skipped.

### Decision: Canonical memory stays separately packaged

Memory is canonical to Nazar's product, but `@nazar/memory` remains the canonical implementation package. `@nazar/core` owns contracts, setup state, and shared helpers; memory owns tools, Life OS state, vault paths, durable prompt context, and memory-specific onboarding text.

## Architecture

### packages/core/code/extensions/nazar/setup-registry.ts — MODIFY

```ts
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export type SetupOnboardingReason = "post-setup" | "manual";

export type SetupOnboardingContext = {
  reason: SetupOnboardingReason;
  selectedProviderIds: string[];
  force: boolean;
};

export type SetupProvider = {
  id: string;
  label: string;
  order?: number;
  configure?: (pi: ExtensionAPI, ctx: ExtensionContext) => Promise<void>;
  statusText?: () => string | Promise<string>;
  onboardingVersion?: number;
  onboardingPrompt?: (context: SetupOnboardingContext) => string | undefined | Promise<string | undefined>;
};

type SetupRegistryState = {
  providers: Map<string, SetupProvider>;
};

const STATE_KEY = Symbol.for("nazar.setup-registry");

function state(): SetupRegistryState {
  const root = globalThis as typeof globalThis & { [STATE_KEY]?: SetupRegistryState };
  root[STATE_KEY] ??= { providers: new Map() };
  return root[STATE_KEY];
}

export function registerSetupProvider(provider: SetupProvider): () => void {
  state().providers.set(provider.id, provider);
  return () => unregisterSetupProvider(provider.id, provider);
}

export function unregisterSetupProvider(id: string, provider?: SetupProvider): void {
  const providers = state().providers;
  if (provider && providers.get(id) !== provider) return;
  providers.delete(id);
}

export function setupProviders(): SetupProvider[] {
  return [...state().providers.values()].sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.label.localeCompare(b.label));
}
```

### packages/core/code/extensions/nazar/setup-onboarding.ts — NEW

```ts
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { errorMessage, writePrivateJsonSync } from "@nazar/core/shared";
import { getNazarDirs } from "./setup-store.ts";
import type { SetupOnboardingContext, SetupProvider } from "./setup-registry.ts";

const ONBOARDING_STATE_VERSION = 1;

type OnboardingRecord = {
  version: number;
  at: string;
};

type SetupOnboardingState = {
  schemaVersion: typeof ONBOARDING_STATE_VERSION;
  prompted: Record<string, OnboardingRecord>;
  skipped: Record<string, OnboardingRecord>;
};

export type SetupOnboardingContribution = {
  providerId: string;
  label: string;
  version: number;
  prompt: string;
};

export type SetupOnboardingCollection = {
  contributions: SetupOnboardingContribution[];
  prompt: string;
  warnings: string[];
};

export type SetupOnboardingDecision = "start" | "skip" | "later";

function setupOnboardingStatePath(): string {
  return join(getNazarDirs().stateDir, "setup-onboarding.json");
}

function emptySetupOnboardingState(): SetupOnboardingState {
  return { schemaVersion: ONBOARDING_STATE_VERSION, prompted: {}, skipped: {} };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeRecords(value: unknown): Record<string, OnboardingRecord> {
  const out: Record<string, OnboardingRecord> = {};
  for (const [key, raw] of Object.entries(asRecord(value))) {
    const object = asRecord(raw);
    const version = typeof object.version === "number" && Number.isFinite(object.version) ? Math.max(1, Math.floor(object.version)) : 1;
    const at = typeof object.at === "string" && object.at.trim() ? object.at : new Date(0).toISOString();
    out[key] = { version, at };
  }
  return out;
}

function normalizeState(value: unknown): SetupOnboardingState {
  const object = asRecord(value);
  if (object.schemaVersion !== ONBOARDING_STATE_VERSION) return emptySetupOnboardingState();
  return {
    schemaVersion: ONBOARDING_STATE_VERSION,
    prompted: normalizeRecords(object.prompted),
    skipped: normalizeRecords(object.skipped),
  };
}

function readSetupOnboardingState(): SetupOnboardingState {
  const path = setupOnboardingStatePath();
  if (!existsSync(path)) return emptySetupOnboardingState();
  try {
    return normalizeState(JSON.parse(readFileSync(path, "utf8")));
  } catch (error) {
    throw new Error(`Nazar setup onboarding state is unreadable at ${basename(path)}: ${errorMessage(error)}`);
  }
}

function writeSetupOnboardingState(state: SetupOnboardingState): void {
  writePrivateJsonSync(setupOnboardingStatePath(), normalizeState(state));
}

function providerVersion(provider: SetupProvider): number {
  return typeof provider.onboardingVersion === "number" && Number.isFinite(provider.onboardingVersion) ? Math.max(1, Math.floor(provider.onboardingVersion)) : 1;
}

function contributionKey(contribution: Pick<SetupOnboardingContribution, "providerId" | "version">): string {
  return `${contribution.providerId}@${contribution.version}`;
}

function alreadyRecorded(state: SetupOnboardingState, contribution: SetupOnboardingContribution): boolean {
  const key = contributionKey(contribution);
  return Boolean(state.prompted[key] || state.skipped[key]);
}

function composeSetupOnboardingPrompt(contributions: SetupOnboardingContribution[]): string {
  const providerSections = contributions.map((contribution, index) => [
    `## Provider ${index + 1}: ${contribution.label}`,
    contribution.prompt,
  ].join("\n\n"));

  return [
    "Nazar setup just completed. Start a short first-run onboarding conversation using the provider instructions below.",
    "",
    "Core rules:",
    "- Keep it conversational and ask one question at a time.",
    "- Do not write persistent state unless the user explicitly approves the exact concise facts to store.",
    "- Do not store secrets, raw transcripts, temporary task state, or anything that feels like a dossier.",
    "- If the user wants to stop, be warm and tell them they can resume onboarding later.",
    "",
    ...providerSections,
  ].join("\n");
}

export async function collectSetupOnboarding(
  providers: SetupProvider[],
  context: SetupOnboardingContext,
): Promise<SetupOnboardingCollection | undefined> {
  const state = readSetupOnboardingState();
  const contributions: SetupOnboardingContribution[] = [];
  const warnings: string[] = [];

  for (const provider of providers) {
    if (!provider.onboardingPrompt) continue;
    const contribution: SetupOnboardingContribution = {
      providerId: provider.id,
      label: provider.label,
      version: providerVersion(provider),
      prompt: "",
    };
    if (!context.force && alreadyRecorded(state, contribution)) continue;

    try {
      const prompt = (await provider.onboardingPrompt(context))?.trim();
      if (!prompt) continue;
      contributions.push({ ...contribution, prompt });
    } catch (error) {
      warnings.push(`${provider.label}: ${errorMessage(error)}`);
    }
  }

  if (contributions.length === 0 && warnings.length === 0) return undefined;
  return { contributions, warnings, prompt: composeSetupOnboardingPrompt(contributions) };
}

export function recordSetupOnboarding(contributions: SetupOnboardingContribution[], decision: Exclude<SetupOnboardingDecision, "later">): void {
  if (contributions.length === 0) return;
  const state = readSetupOnboardingState();
  const target = decision === "start" ? state.prompted : state.skipped;
  const now = new Date().toISOString();
  for (const contribution of contributions) {
    target[contributionKey(contribution)] = { version: contribution.version, at: now };
  }
  writeSetupOnboardingState(state);
}

export async function chooseSetupOnboardingDecision(ctx: ExtensionContext): Promise<SetupOnboardingDecision> {
  const choice = await ctx.ui.select("Start a short Nazar onboarding chat now?", ["Start onboarding", "Skip", "Later"]);
  if (choice === "Start onboarding") return "start";
  if (choice === "Skip") return "skip";
  return "later";
}
```

### packages/core/code/extensions/nazar/setup-use.ts — MODIFY

```ts
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import { Container, type SelectItem, SelectList, Text } from "@earendil-works/pi-tui";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { errorMessage, hasInteractiveUi, showText } from "@nazar/core/shared";
import { chooseSetupOnboardingDecision, collectSetupOnboarding, recordSetupOnboarding } from "./setup-onboarding.ts";
import { getNazarDirs, nazarSetupConfigPath, readNazarSetupConfig, type SetupProfile, writeNazarSetupConfig } from "./setup-store.ts";
import { setupProviders, type SetupOnboardingReason, type SetupProvider } from "./setup-registry.ts";

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

function onboardingProviders(): SetupProvider[] {
  return setupProviders().filter((provider) => provider.onboardingPrompt);
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
  return `Usage: /nazar setup [all${optionalSections}]\n       /nazar onboard\n       /nazar status\n       /nazar doctor`;
}

async function runSetupOnboarding(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  providers: SetupProvider[],
  reason: SetupOnboardingReason,
  force = false,
): Promise<boolean> {
  if (!hasInteractiveUi(ctx) || providers.length === 0) return false;

  let collection;
  try {
    collection = await collectSetupOnboarding(providers, {
      reason,
      selectedProviderIds: providers.map((provider) => provider.id),
      force,
    });
  } catch (error) {
    ctx.ui.notify(`Nazar onboarding could not inspect setup state: ${errorMessage(error)}`, "warning");
    return false;
  }

  if (!collection) return false;
  for (const warning of collection.warnings) {
    ctx.ui.notify(`Nazar onboarding provider skipped: ${warning}`, "warning");
  }
  if (collection.contributions.length === 0) return false;

  const decision = reason === "post-setup" && !force ? await chooseSetupOnboardingDecision(ctx) : "start";
  if (decision === "skip") {
    recordSetupOnboarding(collection.contributions, "skip");
    ctx.ui.notify("Nazar onboarding skipped. Run /nazar onboard when you want to do it later.", "info");
    return false;
  }
  if (decision === "later") {
    ctx.ui.notify("Nazar onboarding left for later. Run /nazar onboard when ready.", "info");
    return false;
  }

  try {
    pi.sendUserMessage(collection.prompt);
    recordSetupOnboarding(collection.contributions, "start");
    return true;
  } catch (error) {
    ctx.ui.notify(`Nazar onboarding could not start: ${errorMessage(error)}`, "warning");
    return false;
  }
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
  await runSetupOnboarding(pi, ctx, selected, "post-setup");
}

async function showDoctor(ctx: ExtensionContext): Promise<void> {
  await show(ctx, "Nazar setup status", `${await statusText()}\n\nDoctor notes:\n- Reload/restart Pi after setup changes.\n- Runtime credentials and tokens are never stored in Nazar setup config.\n- On Windows, use winget for host dependencies when available.`);
}

async function onboardCommand(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
  if (!hasInteractiveUi(ctx)) {
    await show(ctx, "Nazar onboarding", "Interactive onboarding requires Pi interactive mode. Run /nazar onboard in the TUI.");
    return;
  }
  const started = await runSetupOnboarding(pi, ctx, onboardingProviders(), "manual", true);
  if (!started) await show(ctx, "Nazar onboarding", "No Nazar onboarding prompts are registered. Install/configure a Nazar provider such as memory, then run /nazar onboard again.", "warning");
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
    description: "Nazar setup and status: /nazar setup|onboard|status|doctor",
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const command = (parts[0] || "status").toLowerCase();
      if (command === "setup") {
        await setupCommand(pi, ctx, parts[1] || "");
        return;
      }
      if (command === "onboard") {
        await onboardCommand(pi, ctx);
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
```

### packages/core/code/tests/pi-core.test.mjs — MODIFY

```js
test("nazar setup starts provider-owned onboarding once after confirmation", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "pi-core-onboarding-test-"));
  const previousConfigDir = process.env.NAZAR_CONFIG_DIR;
  const previousStateDir = process.env.NAZAR_STATE_DIR;
  const commands = new Map();
  const sent = [];
  const selections = ["desktop", "Start onboarding", "desktop"];
  const providerId = `test-onboarding-${Date.now()}-${Math.random()}`;
  const cleanupProvider = registerSetupProvider({
    id: providerId,
    label: "Test Memory",
    configure: async () => {},
    statusText: () => "ready",
    onboardingVersion: 1,
    onboardingPrompt: () => "Memory onboarding instructions from provider.",
  });
  const fakePi = {
    registerCommand(name, spec) {
      commands.set(name, spec);
    },
    sendUserMessage(text) {
      sent.push(text);
    },
  };
  const fakeCtx = {
    hasUI: true,
    ui: {
      async select() { return selections.shift(); },
      setWidget() {},
      notify() {},
    },
  };

  try {
    process.env.NAZAR_CONFIG_DIR = join(tmp, "config");
    process.env.NAZAR_STATE_DIR = join(tmp, "state");
    registerNazarSetupUse(fakePi);

    await commands.get("nazar-setup").handler("all", fakeCtx);
    await commands.get("nazar-setup").handler("all", fakeCtx);

    assert.equal(sent.length, 1);
    assert.match(sent[0], /Provider 1: Test Memory/);
    assert.match(sent[0], /Memory onboarding instructions from provider/);
    assert.match(sent[0], /one question at a time/);
  } finally {
    cleanupProvider();
    if (previousConfigDir === undefined) delete process.env.NAZAR_CONFIG_DIR;
    else process.env.NAZAR_CONFIG_DIR = previousConfigDir;
    if (previousStateDir === undefined) delete process.env.NAZAR_STATE_DIR;
    else process.env.NAZAR_STATE_DIR = previousStateDir;
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("nazar setup skip records onboarding and manual onboard force-runs it", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "pi-core-onboarding-skip-test-"));
  const previousConfigDir = process.env.NAZAR_CONFIG_DIR;
  const previousStateDir = process.env.NAZAR_STATE_DIR;
  const commands = new Map();
  const sent = [];
  const selections = ["desktop", "Skip", "desktop"];
  const providerId = `test-onboarding-skip-${Date.now()}-${Math.random()}`;
  const cleanupProvider = registerSetupProvider({
    id: providerId,
    label: "Test Memory",
    configure: async () => {},
    onboardingPrompt: () => "Memory onboarding instructions from provider.",
  });
  const fakePi = {
    registerCommand(name, spec) {
      commands.set(name, spec);
    },
    sendUserMessage(text) {
      sent.push(text);
    },
  };
  const fakeCtx = {
    hasUI: true,
    ui: {
      async select() { return selections.shift(); },
      setWidget() {},
      notify() {},
    },
  };

  try {
    process.env.NAZAR_CONFIG_DIR = join(tmp, "config");
    process.env.NAZAR_STATE_DIR = join(tmp, "state");
    registerNazarSetupUse(fakePi);

    await commands.get("nazar-setup").handler("all", fakeCtx);
    await commands.get("nazar-setup").handler("all", fakeCtx);
    await commands.get("nazar").handler("onboard", fakeCtx);

    assert.equal(sent.length, 1);
    assert.match(sent[0], /Memory onboarding instructions from provider/);
  } finally {
    cleanupProvider();
    if (previousConfigDir === undefined) delete process.env.NAZAR_CONFIG_DIR;
    else process.env.NAZAR_CONFIG_DIR = previousConfigDir;
    if (previousStateDir === undefined) delete process.env.NAZAR_STATE_DIR;
    else process.env.NAZAR_STATE_DIR = previousStateDir;
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("nazar setup does not start onboarding when providers contribute no prompt", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "pi-core-no-onboarding-test-"));
  const previousConfigDir = process.env.NAZAR_CONFIG_DIR;
  const previousStateDir = process.env.NAZAR_STATE_DIR;
  const commands = new Map();
  const sent = [];
  const providerId = `test-provider-only-${Date.now()}-${Math.random()}`;
  const cleanupProvider = registerSetupProvider({
    id: providerId,
    label: "Test Provider",
    configure: async () => {},
    statusText: () => "ready",
  });
  const fakePi = {
    registerCommand(name, spec) {
      commands.set(name, spec);
    },
    sendUserMessage(text) {
      sent.push(text);
    },
  };
  const fakeCtx = { hasUI: true, ui: { async select() { return "desktop"; }, setWidget() {}, notify() {} } };

  try {
    process.env.NAZAR_CONFIG_DIR = join(tmp, "config");
    process.env.NAZAR_STATE_DIR = join(tmp, "state");
    registerNazarSetupUse(fakePi);

    await commands.get("nazar-setup").handler("all", fakeCtx);

    assert.equal(sent.length, 0);
  } finally {
    cleanupProvider();
    if (previousConfigDir === undefined) delete process.env.NAZAR_CONFIG_DIR;
    else process.env.NAZAR_CONFIG_DIR = previousConfigDir;
    if (previousStateDir === undefined) delete process.env.NAZAR_STATE_DIR;
    else process.env.NAZAR_STATE_DIR = previousStateDir;
    rmSync(tmp, { recursive: true, force: true });
  }
});
```

### packages/core/code/tests/pi-review-remediation.test.mjs — MODIFY

```js
  assert.doesNotMatch(setupUse, /Life OS|durable memory tools|\/memory/);
  assert.match(setupUse, /collectSetupOnboarding/);

  const setupOnboarding = source("packages/core/code/extensions/nazar/setup-onboarding.ts");
  assert.doesNotMatch(setupOnboarding, /Life OS|durable memory tools|\/memory/);
  assert.match(setupOnboarding, /getNazarDirs\(\)\.stateDir/);
```

### packages/memory/code/extensions/memory/memory-setup.ts — MODIFY

```ts
function memoryOnboardingPrompt(): string {
  return [
    "You are onboarding Nazar's canonical memory feature after setup.",
    "",
    "Memory onboarding goals:",
    "- Keep it conversational and ask one question at a time; do not dump a questionnaire.",
    "- First ask what the user wants to be called and what they want Nazar to help with.",
    "- Explain that memory is optional and consent-based. After each answer, summarize the exact concise facts you would save and ask before writing them.",
    "- If Life OS tools are available, use them only after approval for stable profile facts, active goals, and reflections.",
    "- If durable memory tools are available, use them only after approval for project/workflow facts that should persist.",
    "- Do not store secrets, raw transcripts, temporary task state, or anything that feels like a dossier.",
    "- If the user wants to skip, be warm and tell them they can return later with `/nazar onboard`, `/memory life readout`, or `/memory status`.",
  ].join("\n");
}

export function registerMemorySetupProvider(): () => void {
  const provider: SetupProvider = {
    id: "memory",
    label: "Memory",
    order: 10,
    configure: async (_pi, ctx) => configureMemory(ctx),
    statusText: memorySetupStatusText,
    onboardingVersion: 1,
    onboardingPrompt: () => memoryOnboardingPrompt(),
  };
  return registerSetupProvider(provider);
}
```

### packages/memory/code/tests/pi-memory.test.mjs — MODIFY

```js
test("memory setup provider contributes consent-first onboarding prompt", async () => {
  const ctx = makeProject();
  const cleanupProvider = registerMemorySetupProvider();
  try {
    const provider = setupProviders().find((entry) => entry.id === "memory");
    assert.ok(provider?.onboardingPrompt, "memory setup provider should contribute onboarding");

    const prompt = await provider.onboardingPrompt({ reason: "manual", selectedProviderIds: ["memory"], force: true });

    assert.match(prompt, /canonical memory feature/);
    assert.match(prompt, /one question at a time/);
    assert.match(prompt, /consent-based/);
    assert.match(prompt, /Life OS tools/);
    assert.match(prompt, /dossier/);
    assert.match(prompt, /\/nazar onboard/);
  } finally {
    cleanupProvider();
    cleanup(ctx);
  }
});
```

### README.md — MODIFY

```md
Nazar is a TypeScript Pi.Dev extension product currently shipped as two canonical Pi packages: `@nazar/core` and `@nazar/memory`. Memory is part of the default Nazar product experience, but it remains separately packaged so core stays a small setup shell and future capabilities can stay modular.

Install both canonical packages for the local-first memory appliance:

    pi install npm:@nazar/core
    pi install npm:@nazar/memory
```

## Slices

### Slice 1: Onboarding contract + private state

**Files**: `packages/core/code/extensions/nazar/setup-registry.ts`, `packages/core/code/extensions/nazar/setup-onboarding.ts`

#### Automated Verification:
- [ ] Core tests still pass after adding inert contract/state helpers: `node --test packages/core/code/tests/*.test.mjs`
- [ ] Source contains the provider-owned onboarding hook: `rg "onboardingPrompt" packages/core/code/extensions/nazar/setup-registry.ts packages/core/code/extensions/nazar/setup-onboarding.ts`

#### Manual Verification:
- [ ] `setup-onboarding.ts` writes state under `getNazarDirs().stateDir`, not through `writeNazarSetupConfig()`.
- [ ] `setup-registry.ts` keeps existing `registerSetupProvider`, `unregisterSetupProvider`, and `setupProviders` exports backward-compatible.

### Slice 2: Core orchestration + `/nazar onboard`

**Files**: `packages/core/code/extensions/nazar/setup-use.ts`, `packages/core/code/tests/pi-core.test.mjs`, `packages/core/code/tests/pi-review-remediation.test.mjs`

#### Automated Verification:
- [ ] Core tests cover provider-owned start, skip/idempotency, manual force rerun, and no-provider no-op: `node --test packages/core/code/tests/*.test.mjs`
- [ ] Core no longer owns memory/Life OS onboarding copy: `rg "Life OS|durable memory tools|/memory" packages/core/code/extensions/nazar/setup-use.ts packages/core/code/extensions/nazar/setup-onboarding.ts packages/core/code/tests/pi-review-remediation.test.mjs` returns no setup implementation matches except boundary assertions.
- [ ] `/nazar onboard` is registered under the existing command surface: `rg "command === \"onboard\"|/nazar onboard" packages/core/code/extensions/nazar/setup-use.ts packages/core/code/tests/pi-core.test.mjs`

#### Manual Verification:
- [ ] Fresh setup with a contributing provider asks Start/Skip/Later before sending an onboarding prompt.
- [ ] Re-running setup after Start or Skip does not send again.
- [ ] `/nazar onboard` force-runs provider onboarding prompts.
- [ ] Core-only setup providers with no `onboardingPrompt` produce no onboarding chat.

### Slice 3: Memory-owned onboarding + canonical docs

**Files**: `packages/memory/code/extensions/memory/memory-setup.ts`, `packages/memory/code/tests/pi-memory.test.mjs`, `README.md`

#### Automated Verification:
- [ ] Memory tests prove the memory setup provider contributes onboarding copy: `node --test packages/memory/code/tests/*.test.mjs`
- [ ] Workspace tests pass: `npm test`
- [ ] Package dry-run still includes core and memory package resources: `npm run pack:dry`
- [ ] Diff has no whitespace errors: `git diff --check`
- [ ] Memory owns onboarding copy: `rg "Life OS tools|one question at a time|dossier" packages/memory/code/extensions/memory/memory-setup.ts packages/memory/code/tests/pi-memory.test.mjs`
- [ ] Core remains free of memory-owned onboarding copy: `rg "Life OS|durable memory tools|/memory" packages/core/code/extensions/nazar packages/core/code/tests` returns no implementation-owned matches except boundary assertions.

#### Manual Verification:
- [ ] `/nazar setup memory` uses the memory provider prompt when the user selects Start onboarding.
- [ ] `/nazar onboard` can rerun the memory onboarding conversation.
- [ ] README describes memory as canonical but separately packaged.

## Desired End State

Fresh setup with memory installed:

```text
/nazar setup memory
# setup configures memory
# Nazar asks: Start a short Memory onboarding chat now?
# Start launches one current-model user message assembled from memory-owned onboarding copy.
```

Manual rerun:

```text
/nazar onboard
# Force-runs provider onboarding prompts even if previously prompted/skipped.
```

Provider contribution shape:

```ts
const provider: SetupProvider = {
  id: "memory",
  label: "Memory",
  order: 10,
  configure: async (_pi, ctx) => configureMemory(ctx),
  statusText: memorySetupStatusText,
  onboardingVersion: 1,
  onboardingPrompt: () => memoryOnboardingPrompt(),
};
```

## File Map

```text
packages/core/code/extensions/nazar/setup-registry.ts          # MODIFY — provider onboarding hook types
packages/core/code/extensions/nazar/setup-onboarding.ts        # NEW — contribution collection, prompt composition, private state
packages/core/code/extensions/nazar/setup-use.ts               # MODIFY — setup preflight and /nazar onboard wiring
packages/core/code/tests/pi-core.test.mjs                      # MODIFY — setup/onboard behavior tests
packages/core/code/tests/pi-review-remediation.test.mjs        # MODIFY — core boundary string/import assertions
packages/memory/code/extensions/memory/memory-setup.ts         # MODIFY — memory-owned onboarding prompt contribution
packages/memory/code/tests/pi-memory.test.mjs                  # MODIFY — memory provider contribution tests
README.md                                                      # MODIFY — canonical memory package wording
```

## Ordering Constraints

- Slice 1 must land before any provider can contribute onboarding.
- Slice 2 depends on Slice 1 helpers and types.
- Slice 3 depends on Slice 1 provider hook and Slice 2 orchestration behavior.
- Tests should be updated with the slice that introduces the behavior they verify.
- No slices are parallelizable because each builds on the prior public contract.

## Verification Notes

- Run workspace tests: `npm test`.
- Run package dry packs: `npm run pack:dry`.
- Check whitespace: `git diff --check`.
- Verify core setup no longer contains memory-specific strings: `rg "Life OS|/memory|durable memory tools" packages/core/code/extensions/nazar/setup-use.ts packages/core/code/tests` should find no core-owned onboarding copy.
- Verify memory owns onboarding copy: `rg "Life OS tools|one question at a time|dossier" packages/memory/code/extensions/memory/memory-setup.ts packages/memory/code/tests` should find memory-owned text/tests.
- Verify no bootstrap sentinel is created: existing memory tests checking `memory/context/bootstrap.md` absence should continue to pass.

## Performance Considerations

- Provider onboarding collection is small and runs only after setup or manual `/nazar onboard`.
- Private state reads/writes are tiny JSON file operations under Nazar state dir.
- No new per-turn hooks or prompt injection paths are added.

## Migration Notes

- Existing installs have no onboarding state file; missing state means no providers have been prompted/skipped.
- Setup config schema remains unchanged because onboarding state uses a private state file.
- Backward compatibility: older providers without `onboardingPrompt` are ignored.
- Version skew: memory with onboarding fields on older core will have fields ignored; core with older memory simply has no provider onboarding prompt.

## Pattern References

- `packages/core/code/extensions/nazar/setup-registry.ts:3-8` — optional provider fields and registry contract.
- `packages/core/code/extensions/nazar/setup-use.ts:153-162` — selected-provider execution loop.
- `packages/core/code/extensions/nazar/setup-use.ts:173-196` — command helper and subcommand branching pattern.
- `packages/core/code/extensions/shared.ts:143-165` — private file/json write helpers.
- `packages/memory/code/extensions/memory/memory-setup.ts:64-72` — memory setup provider registration.
- `packages/memory/code/extensions/memory.ts:24-30` — memory-owned prompt/context precedent.
- `packages/core/code/tests/pi-core.test.mjs:60-99` — fake Pi command/sendUserMessage test pattern.
- `packages/memory/code/tests/pi-memory.test.mjs:194-217` — memory setup provider scaffolding test pattern.

## Developer Context

- Question: Where should one-time onboarding state live? Evidence: setup config is narrow at `packages/core/code/extensions/nazar/setup-store.ts:9`, unknown fields are dropped by `packages/core/code/tests/pi-core.test.mjs:33`, and `getNazarDirs().stateDir` exists at `packages/core/code/extensions/nazar/setup-store.ts:27`. Answer: Private state file.
- Question: How should setup launch onboarding after providers configure? Evidence: current auto-launch happens at `packages/core/code/extensions/nazar/setup-use.ts:165`; the solution recommends consent and `/nazar onboard` for reruns. Answer: Ask first.
- Decomposition approved: 3 slices — contract/state foundation, core orchestration, memory contribution/docs.

## Design History

- Slice 1: Onboarding contract + private state — approved as generated
- Slice 2: Core orchestration + `/nazar onboard` — approved as generated
- Slice 3: Memory-owned onboarding + canonical docs — approved as generated

## References

- `.rpiv/artifacts/solutions/2026-05-29_17-55-06_setup-onboarding-enhancements.md` — upstream solution and follow-up package strategy.
- `packages/core/code/extensions/nazar/setup-registry.ts:3` — setup provider contract.
- `packages/core/code/extensions/nazar/setup-use.ts:15` — current core-owned onboarding prompt to remove.
- `packages/memory/code/extensions/memory/memory-setup.ts:64` — memory provider registration.
- `README.md:13` — current two-package product framing.
- OpenClaw bootstrapping: https://docs.openclaw.ai/start/bootstrapping
- OpenClaw onboard: https://docs.openclaw.ai/cli/onboard
- Hermes persistent memory: https://hermes-agent.nousresearch.com/docs/user-guide/features/memory
