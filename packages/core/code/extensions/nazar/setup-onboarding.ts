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

export function setupOnboardingErrorMessage(error: unknown, extraPaths: string[] = []): string {
  const dirs = getNazarDirs();
  let message = errorMessage(error);
  const knownPaths = [setupOnboardingStatePath(), dirs.configDir, dirs.stateDir, dirs.dataDir, ...extraPaths]
    .filter((path) => path.trim())
    .sort((a, b) => b.length - a.length);

  message = message
    .replace(/[A-Za-z]:[\\/][^\s"'`<>]+/g, (match) => basename(match))
    .replace(/\/(?:[^/\s"'`<>]+\/)+[^/\s"'`<>]+/g, (match) => basename(match));

  for (const path of knownPaths) {
    message = message.replaceAll(path, basename(path));
  }

  return message;
}

function onboardingStateError(path: string, error: unknown): Error {
  const message = setupOnboardingErrorMessage(error, [path]);
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
  const path = setupOnboardingStatePath();
  try {
    writePrivateJsonSync(path, normalizeState(state));
  } catch (error) {
    throw onboardingStateError(path, error);
  }
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

function composeSetupOnboardingPrompt(contributions: SetupOnboardingContribution[], context: SetupOnboardingContext): string {
  const providerSections = contributions.map((contribution, index) => [
    `## Provider ${index + 1}: ${contribution.label}`,
    contribution.prompt,
  ].join("\n\n"));
  const intro = context.reason === "manual"
    ? "Nazar onboarding was requested manually. Start a short onboarding conversation using the provider instructions below."
    : "Nazar setup just completed. Start a short first-run onboarding conversation using the provider instructions below.";

  return [
    intro,
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
      warnings.push(`${provider.label}: ${setupOnboardingErrorMessage(error)}`);
    }
  }

  if (contributions.length === 0 && warnings.length === 0) return undefined;
  return { contributions, warnings, prompt: composeSetupOnboardingPrompt(contributions, context) };
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
