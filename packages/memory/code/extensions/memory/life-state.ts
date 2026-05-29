import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { writePrivateJsonSync } from "@nazar/core/shared";

import { lifeProjectionText } from "./life-text.ts";
import { getMemoryPaths } from "./paths.ts";

export const LIFE_STATE_VERSION = 1;

export type LifeGoalStatus = "active" | "paused" | "done";

export type LifeProfile = Record<string, string>;

export type LifeGoal = {
  id: string;
  name: string;
  status: LifeGoalStatus;
  progress?: number;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type LifeReflection = {
  id: string;
  text: string;
  tags: string[];
  createdAt: string;
};

export type LifeState = {
  schemaVersion: typeof LIFE_STATE_VERSION;
  profile: LifeProfile;
  goals: LifeGoal[];
  reflections: LifeReflection[];
  updatedAt: string;
};

export type UpsertLifeGoalInput = {
  id?: string;
  name?: string;
  status?: LifeGoalStatus;
  progress?: number;
  note?: string;
};

export type AddLifeReflectionInput = {
  text: string;
  tags?: string[];
};

export type LifeGoalMutation = {
  state: LifeState;
  goal: LifeGoal;
  created: boolean;
};

export type LifeReflectionMutation = {
  state: LifeState;
  reflection: LifeReflection;
};

function isoNow(now = new Date()): string {
  return now.toISOString();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function asObject(value: unknown, field = "value"): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  throw new Error(`${field} must be an object`);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function requireString(value: unknown, field: string): string {
  const text = asString(value);
  if (!text) throw new Error(`${field} is required`);
  return text;
}

function normalizeId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function normalizeLifeKey(value: string): string {
  return normalizeId(value);
}

function normalizeStatus(value: unknown): LifeGoalStatus {
  if (value === undefined || value === "") return "active";
  if (value === "active" || value === "paused" || value === "done") return value;
  throw new Error(`status must be one of active, paused, done`);
}

function normalizeProgress(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("progress must be a finite number");
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeStringRecord(value: unknown): LifeProfile {
  if (value === undefined) return {};
  const object = asObject(value, "profile");
  const out: LifeProfile = {};
  for (const [key, raw] of Object.entries(object)) {
    if (typeof raw !== "string") throw new Error(`profile.${key} must be a string`);
    const normalizedKey = normalizeLifeKey(key);
    const text = raw.trim();
    if (normalizedKey && text) out[normalizedKey] = text;
  }
  return out;
}

function normalizeTags(value: unknown, field = "tags"): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return [...new Set(value.map((entry, index) => requireString(entry, `${field}[${index}]`).slice(0, 40)))];
}

function normalizeGoal(value: unknown, index: number): LifeGoal {
  const object = asObject(value, `goals[${index}]`);
  const name = requireString(object.name, `goals[${index}].name`);
  const id = normalizeId(asString(object.id) || name);
  if (!id) throw new Error(`goals[${index}].id is required`);
  const createdAt = asString(object.createdAt) || isoNow();
  const updatedAt = asString(object.updatedAt) || createdAt;
  const progress = normalizeProgress(object.progress);
  const note = asString(object.note);
  return {
    id,
    name,
    status: normalizeStatus(object.status),
    ...(progress === undefined ? {} : { progress }),
    ...(note ? { note } : {}),
    createdAt,
    updatedAt,
  };
}

function normalizeReflection(value: unknown, index: number): LifeReflection {
  const object = asObject(value, `reflections[${index}]`);
  const text = requireString(object.text, `reflections[${index}].text`);
  const id = normalizeId(requireString(object.id, `reflections[${index}].id`));
  return {
    id,
    text,
    tags: normalizeTags(object.tags, `reflections[${index}].tags`),
    createdAt: asString(object.createdAt) || isoNow(),
  };
}

function normalizeGoalList(value: unknown): LifeGoal[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("goals must be an array");
  return value.map((goal, index) => normalizeGoal(goal, index));
}

function normalizeReflectionList(value: unknown): LifeReflection[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("reflections must be an array");
  return value.map((reflection, index) => normalizeReflection(reflection, index));
}

function uniqueId(base: string, existing: Set<string>): string {
  const fallback = base || "item";
  if (!existing.has(fallback)) return fallback;
  for (let i = 2; i < 10_000; i += 1) {
    const candidate = `${fallback}-${i}`;
    if (!existing.has(candidate)) return candidate;
  }
  throw new Error(`Could not allocate a unique Life OS id for '${fallback}'.`);
}

export function emptyLifeState(now = new Date()): LifeState {
  return {
    schemaVersion: LIFE_STATE_VERSION,
    profile: {},
    goals: [],
    reflections: [],
    updatedAt: isoNow(now),
  };
}

export function lifeStatePath(): string {
  return join(getMemoryPaths().STATE_DIR, "life", "life.json");
}

export function lifeMarkdownPath(): string {
  return join(getMemoryPaths().NAZAR_DIR, "life.md");
}

function writeLifeProjection(state: LifeState): void {
  const path = lifeMarkdownPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${lifeProjectionText(state)}\n`, "utf8");
}

export function normalizeLifeState(value: unknown): LifeState {
  const object = asObject(value, "life state");
  if (object.schemaVersion !== LIFE_STATE_VERSION) throw new Error(`unsupported schemaVersion '${String(object.schemaVersion)}'`);
  return {
    schemaVersion: LIFE_STATE_VERSION,
    profile: normalizeStringRecord(object.profile),
    goals: normalizeGoalList(object.goals),
    reflections: normalizeReflectionList(object.reflections),
    updatedAt: asString(object.updatedAt) || isoNow(),
  };
}

export function readLifeState(): LifeState {
  const path = lifeStatePath();
  if (!existsSync(path)) return emptyLifeState();
  try {
    return normalizeLifeState(JSON.parse(readFileSync(path, "utf8")));
  } catch (error) {
    throw new Error(`Life OS state is unreadable or malformed at ${basename(path)}: ${errorMessage(error)}`);
  }
}

export function writeLifeState(state: LifeState, now = new Date()): LifeState {
  const next = normalizeLifeState({ ...state, schemaVersion: LIFE_STATE_VERSION, updatedAt: isoNow(now) });
  writePrivateJsonSync(lifeStatePath(), next);
  writeLifeProjection(next);
  return next;
}

export function setLifeProfileField(field: string, value: string): LifeState {
  const key = normalizeLifeKey(field);
  const text = value.trim();
  if (!key) throw new Error("Profile field is required.");
  if (!text) throw new Error("Profile value is required.");
  const state = readLifeState();
  state.profile[key] = text;
  return writeLifeState(state);
}

export function removeLifeProfileField(field: string): LifeState {
  const key = normalizeLifeKey(field);
  if (!key) throw new Error("Profile field is required.");
  const state = readLifeState();
  if (!Object.hasOwn(state.profile, key)) throw new Error(`No profile field matched '${field}'.`);
  delete state.profile[key];
  return writeLifeState(state);
}

export function resetLifeProfile(): LifeState {
  const state = readLifeState();
  state.profile = {};
  return writeLifeState(state);
}

export function upsertLifeGoal(input: UpsertLifeGoalInput): LifeGoalMutation {
  const state = readLifeState();
  const requestedId = normalizeId(input.id || input.name || "");
  const byId = requestedId ? state.goals.find((goal) => goal.id === requestedId) : undefined;
  const byName = input.name ? state.goals.find((goal) => goal.name.toLowerCase() === input.name!.trim().toLowerCase()) : undefined;
  const existing = byId || byName;
  const now = isoNow();

  if (existing) {
    const progress = normalizeProgress(input.progress);
    existing.name = input.name?.trim() || existing.name;
    existing.status = input.status ?? existing.status;
    if (progress !== undefined) existing.progress = progress;
    if (input.note !== undefined) {
      const note = input.note.trim();
      if (note) existing.note = note;
      else delete existing.note;
    }
    existing.updatedAt = now;
    return { state: writeLifeState(state), goal: existing, created: false };
  }

  const name = input.name?.trim();
  if (!name) throw new Error("Goal name is required when creating a new goal.");
  const usedIds = new Set(state.goals.map((goal) => goal.id));
  const id = uniqueId(requestedId || normalizeId(name), usedIds);
  const progress = normalizeProgress(input.progress);
  const note = input.note?.trim() || "";
  const goal: LifeGoal = {
    id,
    name,
    status: input.status ?? "active",
    ...(progress === undefined ? {} : { progress }),
    ...(note ? { note } : {}),
    createdAt: now,
    updatedAt: now,
  };
  state.goals.push(goal);
  return { state: writeLifeState(state), goal, created: true };
}

export function removeLifeGoal(id: string): { state: LifeState; goal: LifeGoal } {
  const normalized = normalizeId(id);
  if (!normalized) throw new Error("Goal id is required.");
  const state = readLifeState();
  const index = state.goals.findIndex((goal) => goal.id === normalized);
  if (index === -1) throw new Error(`No goal matched '${id}'.`);
  const [goal] = state.goals.splice(index, 1);
  return { state: writeLifeState(state), goal };
}

export function resetLifeGoals(): LifeState {
  const state = readLifeState();
  state.goals = [];
  return writeLifeState(state);
}

function reflectionId(now: string, text: string, existing: Set<string>): string {
  const stamp = now.replace(/[^0-9]/g, "").slice(0, 14);
  const words = normalizeId(text).split("-").slice(0, 5).join("-");
  return uniqueId(`reflection-${stamp}${words ? `-${words}` : ""}`, existing);
}

export function addLifeReflection(input: AddLifeReflectionInput): LifeReflectionMutation {
  const text = input.text.trim();
  if (!text) throw new Error("Reflection text is required.");
  const state = readLifeState();
  const now = isoNow();
  const reflection: LifeReflection = {
    id: reflectionId(now, text, new Set(state.reflections.map((entry) => entry.id))),
    text,
    tags: normalizeTags(input.tags),
    createdAt: now,
  };
  state.reflections.push(reflection);
  return { state: writeLifeState(state), reflection };
}

export function removeLifeReflection(id: string): { state: LifeState; reflection: LifeReflection } {
  const normalized = normalizeId(id);
  if (!normalized) throw new Error("Reflection id is required.");
  const state = readLifeState();
  const index = state.reflections.findIndex((reflection) => reflection.id === normalized);
  if (index === -1) throw new Error(`No reflection matched '${id}'.`);
  const [reflection] = state.reflections.splice(index, 1);
  return { state: writeLifeState(state), reflection };
}

export function resetLifeReflections(): LifeState {
  const state = readLifeState();
  state.reflections = [];
  return writeLifeState(state);
}

export function resetLifeState(): LifeState {
  return writeLifeState(emptyLifeState());
}
