---
date: 2026-05-29T20:13:16+0300
author: Alex Radu
commit: 9feef684
branch: main
repository: nazar
topic: "Provider-owned setup onboarding"
tags: [plan, setup, onboarding, memory]
status: ready
parent: ".rpiv/artifacts/designs/2026-05-29_18-26-27_provider-owned-setup-onboarding.md"
last_updated: 2026-05-29T20:13:16+0300
last_updated_by: Alex Radu
---

# Provider-owned Setup Onboarding Implementation Plan

## Overview

Implement the provider-owned setup onboarding design from `.rpiv/artifacts/designs/2026-05-29_18-26-27_provider-owned-setup-onboarding.md`. Core remains the setup/orchestration contract owner; providers contribute onboarding prompts; memory stays canonical but separately packaged and owns memory/Life OS onboarding copy.

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

## What We're NOT Doing

- Full merge of `@nazar/memory` into `@nazar/core`.
- A meta-package such as `@nazar/nazar`.
- OpenClaw-style bootstrap sentinel files.
- Automatic memory writes during setup.
- Web setup portal, OAuth flows, or non-terminal onboarding surfaces.
- New Life OS tools or changes to memory storage semantics.

## Phase 1: Onboarding contract + private state

### Overview

Add the provider onboarding contract and core-private helper module for collecting provider prompts, composing one setup onboarding message, and recording prompted/skipped provider versions under Nazar's private state dir.

### Changes Required:

#### 1. Setup provider contract
**File**: `packages/core/code/extensions/nazar/setup-registry.ts`  
**Changes**: Add onboarding reason/context types plus optional `onboardingVersion` and `onboardingPrompt` fields while preserving existing registry exports.

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

#### 2. Setup onboarding helpers
**File**: `packages/core/code/extensions/nazar/setup-onboarding.ts`  
**Changes**: New helper module for private onboarding state, prompt collection, prompt composition, and launch decision UI.

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

function onboardingStateError(path: string, error: unknown): Error {
  const message = errorMessage(error).replaceAll(path, basename(path));
  return new Error(`Nazar setup onboarding state is unreadable at ${basename(path)}: ${message}`, { cause: error });
}

function readSetupOnboardingState(): SetupOnboardingState {
  const path = setupOnboardingStatePath();
  if (!existsSync(path)) return emptySetupOnboardingState();
  try {
    return normalizeState(JSON.parse(readFileSync(path, "utf8")));
  } catch (error) {
    throw onboardingStateError(path, error);
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
  const state = context.force ? emptySetupOnboardingState() : readSetupOnboardingState();
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

### Success Criteria:

#### Automated Verification:
- [ ] Core tests still pass after adding inert contract/state helpers: `node --test packages/core/code/tests/*.test.mjs`
- [ ] Source contains the provider-owned onboarding hook: `rg "onboardingPrompt" packages/core/code/extensions/nazar/setup-registry.ts packages/core/code/extensions/nazar/setup-onboarding.ts`

#### Manual Verification:
- [ ] `setup-onboarding.ts` writes state under `getNazarDirs().stateDir`, not through `writeNazarSetupConfig()`.
- [ ] `setup-registry.ts` keeps existing `registerSetupProvider`, `unregisterSetupProvider`, and `setupProviders` exports backward-compatible.

---

## Phase 2: Core orchestration + `/nazar onboard`

### Overview

Replace core-owned memory onboarding copy with generic provider-owned prompt orchestration. Setup asks Start/Skip/Later after successful provider configuration, records decisions, and `/nazar onboard` force-runs available provider prompts.

### Changes Required:

#### 1. Setup command orchestration
**File**: `packages/core/code/extensions/nazar/setup-use.ts`  
**Changes**: Remove the hard-coded memory prompt; import onboarding helpers; add provider prompt orchestration, setup preflight, `/nazar onboard`, and generic completion text.

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
    try {
      recordSetupOnboarding(collection.contributions, "skip");
    } catch (error) {
      ctx.ui.notify(`Nazar onboarding skip state could not be saved: ${errorMessage(error)}`, "warning");
    }
    ctx.ui.notify("Nazar onboarding skipped. Run /nazar onboard when you want to do it later.", "info");
    return false;
  }
  if (decision === "later") {
    ctx.ui.notify("Nazar onboarding left for later. Run /nazar onboard when ready.", "info");
    return false;
  }

  try {
    pi.sendUserMessage(collection.prompt);
  } catch (error) {
    ctx.ui.notify(`Nazar onboarding could not start: ${errorMessage(error)}`, "warning");
    return false;
  }

  try {
    recordSetupOnboarding(collection.contributions, "start");
  } catch (error) {
    ctx.ui.notify(`Nazar onboarding start state could not be saved: ${errorMessage(error)}`, "warning");
  }
  return true;
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

#### 2. Core setup/onboard behavior tests
**File**: `packages/core/code/tests/pi-core.test.mjs`  
**Changes**: Replace the current core-owned Life OS onboarding test with provider-owned start, skip/idempotency, manual rerun, and no-provider tests.

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

#### 3. Core boundary remediation tests
**File**: `packages/core/code/tests/pi-review-remediation.test.mjs`  
**Changes**: Assert core setup/onboarding helpers no longer own memory/Life OS copy and use private state dir for onboarding state.

```js
  assert.doesNotMatch(setupUse, /Life OS|durable memory tools|\/memory/);
  assert.match(setupUse, /collectSetupOnboarding/);

  const setupOnboarding = source("packages/core/code/extensions/nazar/setup-onboarding.ts");
  assert.doesNotMatch(setupOnboarding, /Life OS|durable memory tools|\/memory/);
  assert.match(setupOnboarding, /getNazarDirs\(\)\.stateDir/);
```

### Success Criteria:

#### Automated Verification:
- [ ] Core tests cover provider-owned start, skip/idempotency, manual force rerun, and no-provider no-op: `node --test packages/core/code/tests/*.test.mjs`
- [ ] Core no longer owns memory/Life OS onboarding copy: `rg "Life OS|durable memory tools|/memory" packages/core/code/extensions/nazar/setup-use.ts packages/core/code/extensions/nazar/setup-onboarding.ts packages/core/code/tests/pi-review-remediation.test.mjs` returns no setup implementation matches except boundary assertions.
- [ ] `/nazar onboard` is registered under the existing command surface: `rg "command === \"onboard\"|/nazar onboard" packages/core/code/extensions/nazar/setup-use.ts packages/core/code/tests/pi-core.test.mjs`

#### Manual Verification:
- [ ] Fresh setup with a contributing provider asks Start/Skip/Later before sending an onboarding prompt.
- [ ] Re-running setup after Start or Skip does not send again.
- [ ] `/nazar onboard` force-runs provider onboarding prompts.
- [ ] Core-only setup providers with no `onboardingPrompt` produce no onboarding chat.

---

## Phase 3: Memory-owned onboarding + canonical docs

### Overview

Move memory/Life OS onboarding instructions into the canonical memory package, prove the provider contributes onboarding copy, and update README product wording to say memory is canonical but separately packaged.

### Changes Required:

#### 1. Memory setup provider onboarding prompt
**File**: `packages/memory/code/extensions/memory/memory-setup.ts`  
**Changes**: Add memory-owned onboarding prompt text and contribute it via `onboardingVersion`/`onboardingPrompt` on the memory setup provider.

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
    "- For approved project/workflow facts that should persist, use `/memory remember` rather than inventing a new durable write path.",
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

#### 2. Memory setup provider onboarding test
**File**: `packages/memory/code/tests/pi-memory.test.mjs`  
**Changes**: Add a test that verifies the memory setup provider contributes consent-first onboarding copy.

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

#### 3. Canonical package wording
**File**: `README.md`  
**Changes**: Update product/install wording to describe `@nazar/memory` as canonical but separately packaged.

```md
Nazar is a TypeScript Pi.Dev extension product currently shipped as two canonical Pi packages: `@nazar/core` and `@nazar/memory`. Memory is part of the default Nazar product experience, but it remains separately packaged so core stays a small setup shell and future capabilities can stay modular.

| **`@nazar/core`** | `/nazar setup`, `/nazar onboard`, `/nazar status`, `/nazar-setup`, `/nazar-status` | Post-install setup/status shell plus shared helpers. |

Install both canonical packages for the local-first memory appliance:

    pi install npm:@nazar/core
    pi install npm:@nazar/memory
```

### Success Criteria:

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

---

## Testing Strategy

### Automated:
- `node --test packages/core/code/tests/*.test.mjs`
- `node --test packages/memory/code/tests/*.test.mjs`
- `npm test`
- `npm run pack:dry`
- `git diff --check`
- `rg "onboardingPrompt" packages/core/code/extensions/nazar/setup-registry.ts packages/core/code/extensions/nazar/setup-onboarding.ts`
- `rg "Life OS|durable memory tools|/memory" packages/core/code/extensions/nazar packages/core/code/tests`
- `rg "Life OS tools|one question at a time|dossier" packages/memory/code/extensions/memory/memory-setup.ts packages/memory/code/tests/pi-memory.test.mjs`

### Manual Testing Steps:
1. Run `/nazar setup memory` in interactive Pi and choose Start onboarding.
2. Confirm one current-model onboarding chat starts with memory-owned instructions.
3. Re-run `/nazar setup memory` and confirm onboarding does not repeat after Start/Skip state.
4. Run `/nazar onboard` and confirm it force-runs provider onboarding prompts.
5. Confirm README describes memory as canonical but separately packaged.

## Performance Considerations

- Provider onboarding collection is small and runs only after setup or manual `/nazar onboard`.
- Private state reads/writes are tiny JSON file operations under Nazar state dir.
- No new per-turn hooks or prompt injection paths are added.

## Migration Notes

- Existing installs have no onboarding state file; missing state means no providers have been prompted/skipped.
- Setup config schema remains unchanged because onboarding state uses a private state file.
- Backward compatibility: older providers without `onboardingPrompt` are ignored.
- Version skew: memory with onboarding fields on older core will have fields ignored; core with older memory simply has no provider onboarding prompt.

## Plan Review (Step 4)

_Independent post-finalization review by artifact-code-reviewer and artifact-coverage-reviewer subagents. Findings triaged at Step 5. Coverage review emitted no findings._

| source | plan-loc | codebase-loc | severity | dimension | finding | recommendation | resolution |
| --- | --- | --- | --- | --- | --- | --- | --- |
| code | Phase 1 §2 (setup-onboarding.ts) | AGENTS.md:42 | concern | codebase-fit | `readSetupOnboardingState()` uses `basename(path)` but appends `${errorMessage(error)}`, and Node filesystem errors can still include the full private state path despite the basename-only convention. | Sanitize filesystem errors before display and preserve the original error only as `cause`. | applied: added `onboardingStateError()` to replace full path text with basename and preserve `cause`. |
| code | Phase 1 §2 (setup-onboarding.ts) | <n/a> | concern | code-quality | `collectSetupOnboarding()` reads prior state before checking `context.force`, so a malformed `setup-onboarding.json` prevents `/nazar onboard` from force-running provider prompts. | When `context.force` is true, skip the prior-state read or recover unreadable state as empty before collecting prompts. | applied: forced onboarding now uses empty state instead of reading prior state. |
| code | Phase 2 §1 (setup-use.ts) | <n/a> | concern | code-quality | The `"start"` branch catches `recordSetupOnboarding()` failures in the same block as `pi.sendUserMessage()`, so a state write error after sending is reported as "could not start" and returns `false`. | Separate send and state-recording error handling and return `true` once the message is sent. | applied: send and state recording are separate try/catch blocks; message send success returns true. |
| code | Phase 2 §1 (setup-use.ts) | <n/a> | concern | code-quality | The `"skip"` branch calls `recordSetupOnboarding(collection.contributions, "skip")` without a catch, so a state read/write error can reject `/nazar setup` after the user chose to skip noncritical onboarding. | Wrap skip recording in a try/catch and notify a warning instead of failing the setup command. | applied: skip state recording warns on failure and setup continues. |
| code | Phase 3 §1 (memory-setup.ts) | packages/memory/code/extensions/memory.ts:49-66 | concern | codebase-fit | The prompt tells the agent to use "durable memory tools" for project/workflow facts, but HEAD only registers `memory_status` and `memory_search` as memory tools; durable writes are exposed through the `/memory remember` command. | Reword that bullet to direct approved durable facts through `/memory remember` unless a real durable write tool is added in a separate phase. | applied: memory prompt now directs approved durable facts through `/memory remember`. |
| code | Phase 3 §3 (README.md) | README.md:30 | suggestion | codebase-fit | Phase 3 updates README product/install wording but leaves the core command table without the new `/nazar onboard` command introduced in Phase 2. | Add `/nazar onboard` to the `@nazar/core` command list in the README table. | applied: README plan block updates the core command table with `/nazar onboard`. |

## Developer Context

- Step 5 triage: Applied all 6 plan-review findings (5 concerns, 1 suggestion). Coverage reviewer emitted no findings.

## References

- Design: `.rpiv/artifacts/designs/2026-05-29_18-26-27_provider-owned-setup-onboarding.md`
- Solution: `.rpiv/artifacts/solutions/2026-05-29_17-55-06_setup-onboarding-enhancements.md`
- `packages/core/code/extensions/nazar/setup-registry.ts:3` — setup provider contract.
- `packages/core/code/extensions/nazar/setup-use.ts:15` — current core-owned onboarding prompt to remove.
- `packages/memory/code/extensions/memory/memory-setup.ts:64` — memory provider registration.
- `README.md:13` — current two-package product framing.
