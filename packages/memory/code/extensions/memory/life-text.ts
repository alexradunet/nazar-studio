import { truncateUtf8 } from "@nazar/core/shared";

import { lifeStatePath, readLifeState, type LifeGoal, type LifeReflection, type LifeState } from "./life-state.ts";

export type LifeReadoutSection = "all" | "profile" | "goals" | "reflections";

export type LifeReadoutOptions = {
  section?: LifeReadoutSection;
  maxGoals?: number;
  maxReflections?: number;
  maxBytes?: number;
  state?: LifeState;
};

const DEFAULT_MAX_GOALS = 8;
const DEFAULT_MAX_REFLECTIONS = 8;
const DEFAULT_MAX_READOUT_BYTES = 8 * 1024;

function profileLines(state: LifeState): string[] {
  const entries = Object.entries(state.profile).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return ["- No profile fields stored yet."];
  return entries.map(([key, value]) => `- ${key}: ${value}`);
}

function goalLine(goal: LifeGoal): string {
  const progress = goal.progress === undefined ? "" : ` · ${goal.progress}%`;
  const note = goal.note ? ` — ${goal.note}` : "";
  return `- ${goal.id}: ${goal.name} [${goal.status}${progress}]${note}`;
}

function reflectionLine(reflection: LifeReflection): string {
  const tags = reflection.tags.length > 0 ? ` #${reflection.tags.join(" #")}` : "";
  return `- ${reflection.id} (${reflection.createdAt.slice(0, 10)}): ${reflection.text}${tags}`;
}

function limitedGoals(state: LifeState, maxGoals: number): LifeGoal[] {
  return state.goals.slice(0, Math.max(0, maxGoals));
}

function limitedReflections(state: LifeState, maxReflections: number): LifeReflection[] {
  return state.reflections.slice(-Math.max(0, maxReflections)).reverse();
}

export function formatLifeProfile(state = readLifeState()): string {
  return ["## Profile", ...profileLines(state)].join("\n");
}

export function formatLifeGoals(state = readLifeState(), maxGoals = DEFAULT_MAX_GOALS): string {
  const goals = limitedGoals(state, maxGoals);
  return ["## Goals", ...(goals.length ? goals.map(goalLine) : ["- No goals stored yet."])].join("\n");
}

export function formatLifeReflections(state = readLifeState(), maxReflections = DEFAULT_MAX_REFLECTIONS): string {
  const reflections = limitedReflections(state, maxReflections);
  return ["## Reflections", ...(reflections.length ? reflections.map(reflectionLine) : ["- No reflections stored yet."])].join("\n");
}

export function lifeStatusText(state = readLifeState()): string {
  return [
    "Life OS continuity status",
    `State file: ${lifeStatePath()}`,
    `Schema version: ${state.schemaVersion}`,
    `Profile fields: ${Object.keys(state.profile).length}`,
    `Goals: ${state.goals.length}`,
    `Reflections: ${state.reflections.length}`,
    `Updated: ${state.updatedAt}`,
  ].join("\n");
}

export function lifeReadoutText(options: LifeReadoutOptions = {}): string {
  const state = options.state ?? readLifeState();
  const section = options.section ?? "all";
  const maxGoals = options.maxGoals ?? DEFAULT_MAX_GOALS;
  const maxReflections = options.maxReflections ?? DEFAULT_MAX_REFLECTIONS;
  const chunks = ["# Life OS continuity readout", `Updated: ${state.updatedAt}`];

  if (section === "all" || section === "profile") chunks.push("", formatLifeProfile(state));
  if (section === "all" || section === "goals") chunks.push("", formatLifeGoals(state, maxGoals));
  if (section === "all" || section === "reflections") chunks.push("", formatLifeReflections(state, maxReflections));

  return truncateUtf8(chunks.join("\n"), options.maxBytes ?? DEFAULT_MAX_READOUT_BYTES);
}
