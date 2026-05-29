---
date: 2026-05-29T11:55:28+0300
author: Alex Radu
commit: 19034189
branch: main
repository: nazar
topic: "Pi-native Life OS personal continuity"
tags: [design, memory, life-os, personal-continuity]
status: ready
parent: .rpiv/artifacts/research/2026-05-29_11-50-23_pi-native-life-os-personal-continuity.md
last_updated: 2026-05-29T13:12:14+0300
last_updated_by: Alex Radu
last_updated_note: "Applied plan review fixes for goal id parsing, acyclic Life state storage, and status verification coverage"
---

# Design: Pi-native Life OS personal continuity

## Summary
Add a Pi-native Life OS personal-continuity MVP inside `@nazar/memory`. The design stores profile, goals, and reflections in one private versioned `life.json` under the existing memory `STATE_DIR`, exposes explicit `/memory life ...` commands, registers focused model tools, and keeps default prompt injection unchanged.

## Requirements
- Store a minimal Life OS profile, active goals, and dated reflections.
- Use `@nazar/memory` as the owner and keep core feature-free.
- Use existing `getMemoryPaths().STATE_DIR` and private JSON writes; add no new path matrix.
- Expose explicit inspectable `/memory life ...` commands.
- Register a few focused model tools with TypeBox schemas, truncation, and `toolError`.
- Keep raw Life OS records private/on-demand; do not inject them by default.
- Provide bounded summaries/readouts suitable for command/tool consumers and future briefings.
- Support explicit remove/reset behavior with unambiguous selectors.
- Preserve existing `/memory`, `memory_status`, `memory_search`, QMD, and durable-context behavior.

## Current State Analysis

### Key Discoveries
- `packages/memory/code/extensions/memory.ts:15-84` is the memory extension owner for setup, commands, prompt injection, compaction, and tools.
- `packages/memory/code/extensions/memory/memory-use.ts:992-1055` registers the `/memory` router and is the right seam for a thin `/memory life` delegation branch.
- `packages/memory/code/extensions/memory/paths.ts:37-56` resolves `STATE_DIR` from existing memory paths.
- `packages/core/code/extensions/shared.ts:156-165` provides private file and JSON writes.
- `packages/memory/code/extensions/memory/memory-use.ts:388-396` builds durable context only from pinned memory and rollups; Life OS must not enter this path in the MVP.
- `packages/memory/code/tests/pi-memory.test.mjs:570-603` locks command-surface expectations and must be extended without reintroducing `/context`, `/journal`, query, or compact commands.

### Existing Patterns to Follow
- Existing command branches call small helper functions and output through `showText()` (`memory-use.ts:1000-1053`).
- Existing model tools register with TypeBox params, prompt guidance, `truncateToolOutput()`, and `toolError()` (`memory.ts:46-84`).
- Existing private setup config writes use `writePrivateJsonSync()` (`setup-store.ts:91-105`).
- Existing forget behavior fails ambiguous deletion (`memory-use.ts:419-443`), which is the local reversibility precedent.

## Scope

### Building
- New private state/read/write helpers for one versioned Life OS JSON document.
- Bounded text/readout helpers for profile, goals, reflections, and summary output.
- `/memory life` command namespace for status, profile, goal, goals, reflect, reflections, readout, and reset/remove operations.
- Focused Life OS model tools for readout/profile update/goal update/reflection logging.
- Tests for state paths, private-state non-injection, command routing, tool wiring, and package safety.
- README module map update for the new Life OS modules.

### Not Building
- No default prompt injection of Life OS state.
- No QMD indexing of raw `life.json` state.
- No new top-level `/life` command.
- No new `NAZAR_LIFE_*` env vars or setup config keys.
- No scheduler, daemon, Hermes runtime loop, voice/retired messaging bridge/retired media control delivery, wellness logs, or daily briefing workflow.
- No broad refactor of `memory-use.ts` beyond thin delegation.

## Decisions

### Owner stays `@nazar/memory`
**Decision**: Keep the MVP inside `@nazar/memory`.
**Evidence**: `packages/memory/code/extensions/memory.ts:15-84` already owns the memory extension surfaces.

### State file layout
**Ambiguity**: One versioned JSON document vs split domain files vs Markdown state.
**Explored**:
- One versioned `life.json` under `STATE_DIR` — uses `paths.ts:50` and `writePrivateJsonSync()` at `shared.ts:164-165`; simplest atomic read/write and migration.
- Split JSON files — mirrors Hermes, but increases path/write/migration surface.
- Markdown state — human-readable, but weaker for structured updates and privacy boundary.
**Decision**: One versioned `life.json`.

### Command namespace
**Decision**: Use `/memory life ...` rather than `/life` or direct `/memory profile` commands.
**Evidence**: `registerMemoryUse()` already owns the `/memory` router at `memory-use.ts:992-1055`; command tests assert no extra memory-adjacent command surfaces at `pi-memory.test.mjs:570-603`.

### Tool write policy
**Ambiguity**: Narrow write tools vs read-only tools vs one action-enum capture tool.
**Decision**: Add narrow write tools with focused schemas.
**Evidence**: Existing focused tools use explicit schemas and tool wrappers in `memory.ts:46-84`; AGENTS requires TypeBox schemas and `toolError` for tools.

### Prompt exposure
**Decision**: No default Life OS injection in the MVP.
**Evidence**: Durable context currently combines pinned bullets and rollups only, capped at 8 KiB (`memory-use.ts:388-396`), and user selected no default injection.

### Reversibility
**Ambiguity**: Explicit remove/reset vs soft-delete archive vs undo log.
**Decision**: Use explicit unambiguous update/remove/reset operations.
**Evidence**: `forgetPinnedMemory()` removes exactly one matching bullet and fails ambiguous queries (`memory-use.ts:419-443`); this keeps MVP simple and testable.

### Module boundaries
**Decision**: Add small modules: `life-state.ts`, `life-text.ts`, `life-use.ts`, `life-tools.ts`.
**Evidence**: AGENTS calls `memory-use.ts` oversized and requires small single-purpose modules (`AGENTS.md:29`, `AGENTS.md:64`).

## Architecture

### packages/memory/code/extensions/memory/life-state.ts — NEW
Private versioned Life OS state model, read/write helpers, update/remove/reset operations.

```ts
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { writePrivateJsonSync } from "@nazar/core/shared";

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
```

### packages/memory/code/extensions/memory/life-text.ts — NEW
Bounded Markdown/text rendering for Life OS state, command output, and tool readouts.

```ts
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
```

### packages/memory/code/extensions/memory/life-use.ts — NEW
`/memory life ...` command parser and command-result helpers.

```ts
import {
  addLifeReflection,
  removeLifeGoal,
  removeLifeProfileField,
  removeLifeReflection,
  resetLifeGoals,
  resetLifeProfile,
  resetLifeReflections,
  resetLifeState,
  setLifeProfileField,
  upsertLifeGoal,
  type LifeGoalStatus,
} from "./life-state.ts";
import { formatLifeGoals, formatLifeProfile, formatLifeReflections, lifeReadoutText, lifeStatusText, type LifeReadoutSection } from "./life-text.ts";

type LifeCommandResult = {
  code: number;
  text: string;
};

type GoalUpdateArgs = {
  id: string;
  status?: LifeGoalStatus;
  progress?: number;
  note?: string;
};

const LIFE_USAGE = `/memory life - manage Life OS personal continuity

Usage:
  /memory life status
  /memory life readout [all|profile|goals|reflections]
  /memory life profile
  /memory life profile set <field> <value>
  /memory life profile remove <field>
  /memory life profile reset
  /memory life goals
  /memory life goal add [--id id] <name>
  /memory life goal update <id> [--progress N] [--note text]
  /memory life goal activate|pause|done <id>
  /memory life goal remove <id>
  /memory life goal reset
  /memory life reflect <text>
  /memory life reflections
  /memory life reflection remove <id>
  /memory life reflection reset
  /memory life reset
`;

function ok(text: string): LifeCommandResult {
  return { code: 0, text: text.endsWith("\n") ? text : `${text}\n` };
}

function fail(text: string): LifeCommandResult {
  return { code: 1, text: text.endsWith("\n") ? text : `${text}\n` };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseSection(value: string | undefined): LifeReadoutSection {
  return value === "profile" || value === "goals" || value === "reflections" ? value : "all";
}

function parseStatus(value: string): LifeGoalStatus | undefined {
  if (value === "activate" || value === "active") return "active";
  if (value === "pause" || value === "paused") return "paused";
  if (value === "done") return "done";
  return undefined;
}

function maybeProgress(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function looksLikeSlugId(value: string | undefined): boolean {
  return Boolean(value && value === value.toLowerCase() && /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(value));
}

function requireRest(args: string[], usage: string): string {
  const text = args.join(" ").replace(/^['\"]|['\"]$/g, "").trim();
  if (!text) throw new Error(usage);
  return text;
}

function profileCommand(args: string[]): LifeCommandResult {
  const action = args[0];
  if (!action) return ok(formatLifeProfile());
  if (action === "set") {
    const field = args[1] || "";
    const value = requireRest(args.slice(2), "Usage: /memory life profile set <field> <value>");
    setLifeProfileField(field, value);
    return ok(`Profile updated: ${field}\n\n${formatLifeProfile()}`);
  }
  if (action === "remove") {
    const field = args[1] || "";
    removeLifeProfileField(field);
    return ok(`Profile field removed: ${field}\n\n${formatLifeProfile()}`);
  }
  if (action === "reset") {
    resetLifeProfile();
    return ok(`Profile reset.\n\n${formatLifeProfile()}`);
  }
  throw new Error(LIFE_USAGE);
}

function parseGoalAdd(args: string[]): { id?: string; name: string } {
  const usage = "Usage: /memory life goal add [--id id] <name>";
  if (args[0] === "--id") return { id: args[1] || "", name: requireRest(args.slice(2), usage) };
  if (looksLikeSlugId(args[0]) && args.length > 1) return { id: args[0], name: requireRest(args.slice(1), usage) };
  return { name: requireRest(args, usage) };
}

function parseGoalUpdate(args: string[]): GoalUpdateArgs {
  const id = args[0] || "";
  let progress: number | undefined;
  let status: LifeGoalStatus | undefined;
  let note = "";
  for (let i = 1; i < args.length; i += 1) {
    const part = args[i];
    if (part === "--progress" && args[i + 1]) {
      progress = maybeProgress(args[i + 1]);
      i += 1;
    } else if (part === "--status" && args[i + 1]) {
      status = parseStatus(args[i + 1]);
      i += 1;
    } else if (part === "--note" && args[i + 1]) {
      note = args.slice(i + 1).join(" ").replace(/^['\"]|['\"]$/g, "").trim();
      break;
    } else if (progress === undefined && maybeProgress(part) !== undefined) {
      progress = maybeProgress(part);
    } else {
      note = args.slice(i).join(" ").replace(/^['\"]|['\"]$/g, "").trim();
      break;
    }
  }
  return { id, ...(status ? { status } : {}), ...(progress === undefined ? {} : { progress }), ...(note ? { note } : {}) };
}

function goalCommand(args: string[]): LifeCommandResult {
  const action = args[0];
  if (action === "add") {
    const input = parseGoalAdd(args.slice(1));
    const result = upsertLifeGoal(input);
    return ok(`Goal ${result.created ? "added" : "updated"}: ${result.goal.id}\n\n${formatLifeGoals()}`);
  }
  if (action === "update") {
    const result = upsertLifeGoal(parseGoalUpdate(args.slice(1)));
    return ok(`Goal updated: ${result.goal.id}\n\n${formatLifeGoals()}`);
  }
  const status = action ? parseStatus(action) : undefined;
  if (status) {
    const id = args[1] || "";
    const result = upsertLifeGoal({ id, status });
    return ok(`Goal updated: ${result.goal.id}\n\n${formatLifeGoals()}`);
  }
  if (action === "remove") {
    const id = args[1] || "";
    const result = removeLifeGoal(id);
    return ok(`Goal removed: ${result.goal.id}\n\n${formatLifeGoals()}`);
  }
  if (action === "reset") {
    resetLifeGoals();
    return ok(`Goals reset.\n\n${formatLifeGoals()}`);
  }
  throw new Error(LIFE_USAGE);
}

function reflectionCommand(args: string[]): LifeCommandResult {
  const action = args[0];
  if (action === "remove") {
    const id = args[1] || "";
    const result = removeLifeReflection(id);
    return ok(`Reflection removed: ${result.reflection.id}\n\n${formatLifeReflections()}`);
  }
  if (action === "reset") {
    resetLifeReflections();
    return ok(`Reflections reset.\n\n${formatLifeReflections()}`);
  }
  throw new Error(LIFE_USAGE);
}

export function lifeMemoryUsage(): string {
  return LIFE_USAGE;
}

export function lifeMemoryCommand(args: string[]): LifeCommandResult {
  try {
    const command = args[0] || "status";
    const rest = args.slice(1);
    if (command === "status") return ok(lifeStatusText());
    if (command === "readout") return ok(lifeReadoutText({ section: parseSection(rest[0]) }));
    if (command === "profile") return profileCommand(rest);
    if (command === "goals") return ok(formatLifeGoals());
    if (command === "goal") return goalCommand(rest);
    if (command === "reflect") {
      const text = requireRest(rest, "Usage: /memory life reflect <text>");
      const result = addLifeReflection({ text });
      return ok(`Reflection logged: ${result.reflection.id}\n\n${formatLifeReflections()}`);
    }
    if (command === "reflections") return ok(formatLifeReflections());
    if (command === "reflection") return reflectionCommand(rest);
    if (command === "reset") {
      resetLifeState();
      return ok(`Life OS continuity state reset.\n\n${lifeStatusText()}`);
    }
    if (command === "help") return ok(LIFE_USAGE);
    return fail(LIFE_USAGE);
  } catch (error) {
    return fail(`Life OS command failed: ${errorMessage(error)}`);
  }
}
```

### packages/memory/code/extensions/memory/life-tools.ts — NEW
Focused model tool registration for Life OS readout/profile/goal/reflection capture.

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";

import { toolError, truncateToolOutput } from "@nazar/core/shared";

import {
  addLifeReflection,
  removeLifeGoal,
  removeLifeProfileField,
  removeLifeReflection,
  setLifeProfileField,
  upsertLifeGoal,
  type LifeGoalStatus,
} from "./life-state.ts";
import { formatLifeGoals, formatLifeProfile, formatLifeReflections, lifeReadoutText, type LifeReadoutSection } from "./life-text.ts";

type ToolTextResult = {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
};

function toolText(text: string, details: Record<string, unknown>): ToolTextResult {
  return { content: [{ type: "text", text }], details };
}

function readoutSection(value: unknown): LifeReadoutSection {
  if (value === "profile" || value === "goals" || value === "reflections") return value;
  return "all";
}

function goalStatus(value: unknown): LifeGoalStatus | undefined {
  if (value === "active" || value === "paused" || value === "done") return value;
  return undefined;
}

export function registerLifeTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "life_readout",
    label: "Life OS Readout",
    description: "Read a bounded, on-demand Life OS continuity readout from private local state.",
    promptSnippet: "Read profile, goals, and reflections from Life OS continuity state only when the user asks for it.",
    promptGuidelines: [
      "Use life_readout when the user asks for Life OS continuity context, profile, goals, or reflections.",
      "Raw Life OS state is private/on-demand; do not request it unless it is relevant to the user request.",
      "This tool does not index or inject Life OS records into the default prompt.",
    ],
    parameters: Type.Object({
      section: Type.Optional(StringEnum(["all", "profile", "goals", "reflections"] as const)),
      maxGoals: Type.Optional(Type.Number({ description: "Maximum goals to include. Default: 8." })),
      maxReflections: Type.Optional(Type.Number({ description: "Maximum reflections to include. Default: 8." })),
      maxBytes: Type.Optional(Type.Number({ description: "Maximum UTF-8 bytes in the readout. Default: 12000." })),
    }),
    async execute(_toolCallId, params) {
      try {
        const section = readoutSection(params.section);
        const text = await truncateToolOutput(
          lifeReadoutText({ section, maxGoals: params.maxGoals, maxReflections: params.maxReflections, maxBytes: params.maxBytes }),
        );
        return toolText(text, { section });
      } catch (error) {
        throw toolError("life_readout", error);
      }
    },
  });

  pi.registerTool({
    name: "life_profile_set",
    label: "Life Profile Set",
    description: "Set one Life OS profile field in private local state.",
    promptSnippet: "Set a single Life OS profile field when the user asks Pi to remember a stable profile fact.",
    promptGuidelines: [
      "Use life_profile_set only for user-approved stable profile facts.",
      "Use one focused field per call; do not store secrets or raw transcripts.",
    ],
    parameters: Type.Object({
      field: Type.String({ description: "Profile field key, such as name, focus, values, or preference." }),
      value: Type.String({ description: "Profile field value." }),
    }),
    async execute(_toolCallId, params) {
      try {
        const state = setLifeProfileField(params.field, params.value);
        const text = await truncateToolOutput(`Profile updated: ${params.field}\n\n${formatLifeProfile(state)}`);
        return toolText(text, { field: params.field });
      } catch (error) {
        throw toolError("life_profile_set", error);
      }
    },
  });

  pi.registerTool({
    name: "life_profile_remove",
    label: "Life Profile Remove",
    description: "Remove one Life OS profile field from private local state.",
    promptSnippet: "Remove a Life OS profile field by exact field name when the user asks to forget or correct it.",
    promptGuidelines: ["Use life_profile_remove only when the user explicitly asks to remove a specific profile field."],
    parameters: Type.Object({
      field: Type.String({ description: "Profile field key to remove." }),
    }),
    async execute(_toolCallId, params) {
      try {
        const state = removeLifeProfileField(params.field);
        const text = await truncateToolOutput(`Profile field removed: ${params.field}\n\n${formatLifeProfile(state)}`);
        return toolText(text, { field: params.field });
      } catch (error) {
        throw toolError("life_profile_remove", error);
      }
    },
  });

  pi.registerTool({
    name: "life_goal_update",
    label: "Life Goal Update",
    description: "Create or update one Life OS goal in private local state.",
    promptSnippet: "Create or update a Life OS goal with optional status, progress, or note when the user asks Pi to track it.",
    promptGuidelines: [
      "Use life_goal_update only for goals the user explicitly wants tracked.",
      "Pass an id when updating an existing goal; pass a name when creating a goal.",
      "Progress is clamped by state validation to 0..100.",
    ],
    parameters: Type.Object({
      id: Type.Optional(Type.String({ description: "Stable goal id, such as ship-life-os. Required for updates by id." })),
      name: Type.Optional(Type.String({ description: "Goal name. Required when creating a new goal." })),
      status: Type.Optional(StringEnum(["active", "paused", "done"] as const)),
      progress: Type.Optional(Type.Number({ description: "Goal progress percent from 0 to 100." })),
      note: Type.Optional(Type.String({ description: "Short current note for the goal." })),
    }),
    async execute(_toolCallId, params) {
      try {
        const result = upsertLifeGoal({ id: params.id, name: params.name, status: goalStatus(params.status), progress: params.progress, note: params.note });
        const text = await truncateToolOutput(`Goal ${result.created ? "added" : "updated"}: ${result.goal.id}\n\n${formatLifeGoals(result.state)}`);
        return toolText(text, { goalId: result.goal.id, created: result.created });
      } catch (error) {
        throw toolError("life_goal_update", error);
      }
    },
  });

  pi.registerTool({
    name: "life_goal_remove",
    label: "Life Goal Remove",
    description: "Remove one Life OS goal from private local state by id.",
    promptSnippet: "Remove a Life OS goal by id when the user explicitly asks to stop tracking it.",
    promptGuidelines: ["Use life_goal_remove only with an unambiguous goal id from life_readout or `/memory life goals`."],
    parameters: Type.Object({
      id: Type.String({ description: "Goal id to remove." }),
    }),
    async execute(_toolCallId, params) {
      try {
        const result = removeLifeGoal(params.id);
        const text = await truncateToolOutput(`Goal removed: ${result.goal.id}\n\n${formatLifeGoals(result.state)}`);
        return toolText(text, { goalId: result.goal.id });
      } catch (error) {
        throw toolError("life_goal_remove", error);
      }
    },
  });

  pi.registerTool({
    name: "life_reflection_add",
    label: "Life Reflection Add",
    description: "Append one dated Life OS reflection to private local state.",
    promptSnippet: "Append a dated Life OS reflection when the user asks Pi to remember a win, lesson, decision, or reflection.",
    promptGuidelines: [
      "Use life_reflection_add only for user-approved reflections or continuity notes.",
      "Keep reflection text concise and avoid raw transcripts or secrets.",
    ],
    parameters: Type.Object({
      text: Type.String({ description: "Reflection text." }),
      tags: Type.Optional(Type.Array(Type.String({ description: "Short tag." }))),
    }),
    async execute(_toolCallId, params) {
      try {
        const result = addLifeReflection({ text: params.text, tags: params.tags });
        const text = await truncateToolOutput(`Reflection logged: ${result.reflection.id}\n\n${formatLifeReflections(result.state)}`);
        return toolText(text, { reflectionId: result.reflection.id });
      } catch (error) {
        throw toolError("life_reflection_add", error);
      }
    },
  });

  pi.registerTool({
    name: "life_reflection_remove",
    label: "Life Reflection Remove",
    description: "Remove one Life OS reflection from private local state by id.",
    promptSnippet: "Remove a Life OS reflection by id when the user explicitly asks to delete it.",
    promptGuidelines: ["Use life_reflection_remove only with an unambiguous reflection id from life_readout or `/memory life reflections`."],
    parameters: Type.Object({
      id: Type.String({ description: "Reflection id to remove." }),
    }),
    async execute(_toolCallId, params) {
      try {
        const result = removeLifeReflection(params.id);
        const text = await truncateToolOutput(`Reflection removed: ${result.reflection.id}\n\n${formatLifeReflections(result.state)}`);
        return toolText(text, { reflectionId: result.reflection.id });
      } catch (error) {
        throw toolError("life_reflection_remove", error);
      }
    },
  });
}
```

### packages/memory/code/extensions/memory/memory-use.ts:5,965-1055 — MODIFY
Thin import, help text update, command description update, and `/memory life` delegation branch.

```ts
import { lifeMemoryCommand, lifeMemoryUsage } from "./life-use.ts";

function memoryUsage(): string {
  const paths = getMemoryPaths();
  return `/memory - manage Pi memory

Usage:
  /memory status
  /memory search [--scope default|archive] <query>
  /memory update
  /memory index
  /memory list [path]
  /memory ls [path]
  /memory get <path-or-docid>
  /memory life status|readout|profile|goals|goal|reflect|reflections
  /memory pinned
  /memory remember [user|fact|project|never] <text>
  /memory forget <unique substring>

Use Pi's built-in /compact command to compact the current chat. After successful built-in compaction, this extension refreshes generated rollups in ${paths.ROLLUPS_DIR}.
Pinned memory: ${paths.PINNED_MEMORY_PAGE}
Durable/search root: ${paths.PAGES_DIR}
QMD index: ${QMD_INDEX}, collections: ${memoryCollectionSpecs(paths).map((spec) => spec.name).join(", ")}

Life OS continuity:
${lifeMemoryUsage()}`;
}

function parseSearchCommandArgs(args: string[]): { query: string; scope: MemorySearchScope; invalidScope?: string } {
  const queryParts: string[] = [];
  let scope: MemorySearchScope = "default";
  let invalidScope: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const part = args[i];
    if (part === "--scope" && args[i + 1]) {
      const requested = args[i + 1];
      if (isMemorySearchScope(requested)) scope = requested;
      else invalidScope = requested;
      i += 1;
    } else if (part.startsWith("--scope=") && part.length > "--scope=".length) {
      const requested = part.slice("--scope=".length);
      if (isMemorySearchScope(requested)) scope = requested;
      else invalidScope = requested;
    } else {
      queryParts.push(part);
    }
  }
  return { query: queryParts.join(" ").trim(), scope, invalidScope };
}

export function registerMemoryUse(pi: ExtensionAPI): void {
  pi.registerCommand("memory", {
    description: "Manage Pi memory: /memory status|search|update|index|list|ls|get|life|pinned|remember|forget",
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const command = parts[0] || "status";
      const rest = parts.slice(1);

      if (command === "status") {
        await showText(ctx, "memory", memoryStatusText(), "Memory status updated");
        return;
      }

      if (command === "search") {
        const { query, scope, invalidScope } = parseSearchCommandArgs(rest);
        if (invalidScope) {
          await showText(ctx, "memory", `Unknown memory scope '${invalidScope}'. Use one of: default, archive.`, "Memory search needs a valid scope", "warning");
          return;
        }
        await showText(ctx, "memory", query ? await searchMemoryText(pi, query, 5, scope) : "Usage: /memory search [--scope default|archive] <query>", query ? "Memory search complete" : "Memory search needs text");
        return;
      }

      if (command === "update" || command === "refresh") {
        await showText(ctx, "memory", await updateMemoryIndexText(pi), "Memory index updated");
        return;
      }

      if (command === "index" || command === "qmd-status") {
        await showText(ctx, "memory", await memoryIndexStatusText(pi), "Memory index status updated");
        return;
      }

      if (command === "list" || command === "ls") {
        await showText(ctx, "memory", await listMemoryIndexText(pi, rest.join(" ").trim()), "Memory pages listed");
        return;
      }

      if (command === "get") {
        const target = rest.join(" ").trim();
        await showText(ctx, "memory", target ? await getMemoryIndexText(pi, target) : "Usage: /memory get <path-or-docid>", target ? "Memory page loaded" : "Memory get needs a target");
        return;
      }

      if (command === "life") {
        const result = lifeMemoryCommand(rest);
        await showText(ctx, "memory", result.text, result.code === 0 ? "Life OS memory updated" : "Life OS command failed", result.code === 0 ? "info" : "warning");
        return;
      }

      if (command === "pinned") {
        await showText(ctx, "memory", pinnedMemoryText(), "Pinned memory shown");
        return;
      }

      if (command === "remember") {
        const result = rememberPinnedMemory(rest);
        await showText(ctx, "memory", result.text, result.code === 0 ? "Pinned memory updated" : "Pinned memory update failed");
        return;
      }

      if (command === "forget") {
        const result = forgetPinnedMemory(rest.join(" "));
        await showText(ctx, "memory", result.text, result.code === 0 ? "Pinned memory updated" : "Pinned memory update failed");
        return;
      }

      await showText(ctx, "memory", memoryUsage(), "Memory help updated");
    },
  });
}
```

### packages/memory/code/extensions/memory.ts:1-84 — MODIFY
Import and call Life OS tool registration without changing existing lifecycle hooks or tools.

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";

import {
  buildDurableMemoryContext,
  compactSessionFile,
  memoryStatusText,
  registerMemoryUse,
  searchMemoryText,
} from "./memory/memory-use.ts";
import { registerMemorySetupProvider } from "./memory/memory-setup.ts";
import { registerLifeTools } from "./memory/life-tools.ts";
import { hasInteractiveUi, toolError, truncateToolOutput } from "@nazar/core/shared";

export default function memoryExtension(pi: ExtensionAPI) {
  const unregisterMemorySetupProvider = registerMemorySetupProvider();
  pi.on("session_shutdown", unregisterMemorySetupProvider);
  registerMemoryUse(pi);
  registerLifeTools(pi);

  // Append durable memory to the system prompt (cache-stable) instead of injecting
  // a per-turn message. Skips injection when pinned memory is still the empty template.
  pi.on("before_agent_start", (event) => {
    const digest = buildDurableMemoryContext();
    if (!digest) return;
    return {
      systemPrompt: `${event.systemPrompt}\n\n## Durable memory (background context)\nHuman-curated long-term context. Current user direction, AGENTS.md, and system/developer instructions override it.\n\n${digest}`,
    };
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (hasInteractiveUi(ctx)) ctx.ui.setWidget("memory", undefined);
  });

  pi.on("session_compact", async (_event, ctx) => {
    const result = compactSessionFile(ctx.sessionManager.getSessionFile());
    if (result.code !== 0) {
      console.error(result.text.trim());
      return;
    }
    if (ctx.hasUI !== false) {
      ctx.ui.setWidget("memory", result.text.split("\n"));
      ctx.ui.notify("Memory rollups refreshed", "info");
    }
  });

  pi.registerTool({
    name: "memory_status",
    label: "Memory Status",
    description: "Inspect optional Pi memory state, durable pages, rollups, and QMD index paths.",
    promptSnippet: "Report memory rollup status, pinned memory path, durable page paths, and QMD index status.",
    promptGuidelines: ["Use memory_status when the user asks about generated memory, pinned memory, durable pages, or memory/index status."],
    parameters: Type.Object({}),
    async execute() {
      try {
        const text = await truncateToolOutput(memoryStatusText());
        return { content: [{ type: "text", text }], details: { command: "memoryStatusText()" } };
      } catch (error) {
        throw toolError("memory_status", error);
      }
    },
  });

  pi.registerTool({
    name: "memory_search",
    label: "Memory Search",
    description: "Search scoped curated Pi memory pages through QMD.",
    promptSnippet: "Search durable memory pages using QMD/BM25.",
    promptGuidelines: [
      "Use memory_search when durable project knowledge, decisions, notes, or scoped memory are likely relevant.",
      "Use default scope for warm memory; use archive only when explicitly historical, old, or inactive memory is needed.",
      "memory_search refreshes the local QMD index before searching.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Search query." }),
      limit: Type.Optional(Type.Number({ description: "Maximum number of results. Default: 5." })),
      scope: Type.Optional(StringEnum(["default", "archive"] as const)),
    }),
    async execute(_toolCallId, params) {
      try {
        const scope = params.scope === "archive" ? "archive" : "default";
        const text = await truncateToolOutput(await searchMemoryText(pi, params.query, params.limit ?? 5, scope));
        return { content: [{ type: "text", text }], details: { command: `qmd search ${JSON.stringify(params.query)}` } };
      } catch (error) {
        throw toolError("memory_search", error);
      }
    },
  });
}
```

### packages/memory/code/extensions/memory/README.md — MODIFY
Update memory module map and rules for Life OS private state.

````md
# `@nazar/memory` memory modules

Implementation modules for the project-local Pi memory extension.

## Files

- `paths.ts` — derives memory paths and QMD identifiers from the project root, optional `NAZAR_HOME`, optional Nazar setup config, and repo-local development fallback.
- `memory-use.ts` — implements pinned memory, generated rollups, QMD indexing/search, durable-memory system-prompt injection, and `/memory` command helpers.
- `life-state.ts` — owns versioned private Life OS continuity state under `getMemoryPaths().STATE_DIR/life/life.json`.
- `life-text.ts` — renders bounded Life OS status/readouts for command and tool consumers.
- `life-use.ts` — handles the `/memory life ...` command namespace without registering a top-level `/life` command.
- `life-tools.ts` — registers focused Life OS model tools for on-demand readout and narrow profile/goal/reflection updates.
- `vault.ts` — creates the portable vault scaffold and vault-local guidance files.
- `skills/memory-janitor/` — Agent Skill packaged with `@nazar/memory` for durable memory curation workflows.

## Portable vault ownership

Preferred real-use layout is a private Obsidian vault:

```txt
NazarVault/
  00_Inbox/       # shared human/AI capture
  01_Projects/    # human-owned active outcomes
  02_Areas/       # human-owned ongoing responsibilities
  03_Resources/   # stable human-facing references
  04_Archive/     # cold storage, excluded by default
  05_Nazar/       # AI/system control plane
```

When `NAZAR_HOME` is set, memory paths are derived from it:

- runtime/state → `$NAZAR_HOME/05_Nazar/runtime`
- searchable vault/pages root → `$NAZAR_HOME`
- AI-maintained compiled wiki → `$NAZAR_HOME/05_Nazar/llm-wiki/wiki`
- human-authored memory pages → `$NAZAR_HOME`

`05_Nazar/llm-wiki/wiki` stores AI-maintained compiled wiki pages with `index.md` and `log.md`. `05_Nazar/runtime` stores generated transferable state (`rollups`, `state`, and private Life OS continuity JSON).

## Repository fallback

If no vault/setup/env path is configured in a source checkout, data defaults remain repository-local for development compatibility:

- durable pages: `memory/pages/`
- generated rollups/state: `memory/`

The public repo does not track this tree. Treat repo-local `memory/` as ignored local runtime state only; real human/private memory, rollups, copied reports, Life OS state, and local model/state files belong in `NAZAR_HOME` or extension-specific external paths.

## Rules

- Raw Pi JSONL sessions remain in Pi's default session storage.
- Use Pi's built-in `/compact`; this extension listens for `session_compact` and refreshes rollups.
- On each user turn, pinned memory bullets and a bounded recent closed rollup digest are appended to the system prompt when present. Empty pinned-memory templates are skipped.
- Life OS continuity state is private JSON and on-demand only: `/memory life ...` commands and focused `life_*` tools may read or update it, but it is not QMD-indexed and is not appended to the default prompt.
- Keep Life OS reset behavior command-only and explicit (`/memory life reset`, `/memory life profile|goal|reflection reset`); model tools expose narrow set/update/remove operations, not broad reset dispatch.
- Do not reintroduce `/memory compact`, `memory_compact`, `/context`, or a separate memory helper CLI.
- Do not register a top-level `/life` command; Life OS user commands stay under `/memory life ...`.
- In vault mode, QMD uses scoped collections for active folders, pinned memory, the compiled LLM wiki, and archive. Default search excludes `04_Archive`; use `--scope archive` for cold storage.
- Keep memory curation instructions in the integrated `memory-janitor` skill; keep storage/indexing behavior in extension code.
````

### packages/memory/code/tests/pi-memory.test.mjs — MODIFY
Add tests for Life OS state, command surface, prompt/search boundaries, and tool wiring.

```js
import memoryExtension from "../extensions/memory.ts";
import { registerLifeTools } from "../extensions/memory/life-tools.ts";
import {
  addLifeReflection,
  lifeStatePath,
  readLifeState,
  removeLifeGoal,
  resetLifeState,
  setLifeProfileField,
  upsertLifeGoal,
} from "../extensions/memory/life-state.ts";
import { lifeReadoutText, lifeStatusText } from "../extensions/memory/life-text.ts";

test("Life OS state uses versioned private state under memory STATE_DIR", () => {
  const ctx = makeProject();
  try {
    setLifeProfileField("Name", "Alex");
    const goal = upsertLifeGoal({ name: "Ship Life OS", progress: 20, note: "MVP scoped" }).goal;
    addLifeReflection({ text: "Win: research and design are aligned", tags: ["win", "design"] });

    const path = lifeStatePath();
    assert.equal(path, join(ctx.root, "memory", "state", "life", "life.json"));
    assert.equal(existsSync(path), true);

    const raw = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(raw.schemaVersion, 1);
    assert.equal(raw.profile.name, "Alex");
    assert.equal(raw.goals[0].id, goal.id);
    assert.equal(raw.reflections.length, 1);

    const state = readLifeState();
    assert.equal(state.profile.name, "Alex");
    assert.equal(state.goals[0].name, "Ship Life OS");
    assert.equal(state.reflections[0].tags.includes("design"), true);
  } finally {
    cleanup(ctx);
  }
});

test("Life OS state is private and excluded from durable prompt context by default", () => {
  const ctx = makeProject();
  try {
    setLifeProfileField("Name", "Alex");
    upsertLifeGoal({ name: "Ship private continuity" });
    addLifeReflection({ text: "This reflection should stay on demand." });

    const digest = buildDurableMemoryContext();
    assert.equal(digest, "");
  } finally {
    cleanup(ctx);
  }
});

test("Life OS readouts are bounded and reversible with explicit ids", () => {
  const ctx = makeProject();
  try {
    setLifeProfileField("Name", "Alex");
    const first = upsertLifeGoal({ name: "Ship Life OS", progress: 10 }).goal;
    upsertLifeGoal({ name: "Write docs", status: "paused" });
    addLifeReflection({ text: "First reflection" });
    addLifeReflection({ text: "Second reflection" });

    assert.match(lifeStatusText(), /Goals: 2/);
    const readout = lifeReadoutText({ maxGoals: 1, maxReflections: 1, maxBytes: 600 });
    assert.match(readout, /# Life OS continuity readout/);
    assert.match(readout, new RegExp(first.id));
    assert.doesNotMatch(readout, /First reflection/);
    assert.ok(Buffer.byteLength(readout, "utf8") <= 600);

    const removed = removeLifeGoal(first.id);
    assert.equal(removed.goal.id, first.id);
    assert.equal(readLifeState().goals.some((goal) => goal.id === first.id), false);

    const reset = resetLifeState();
    assert.equal(Object.keys(reset.profile).length, 0);
    assert.equal(reset.goals.length, 0);
    assert.equal(reset.reflections.length, 0);
  } finally {
    cleanup(ctx);
  }
});

test("memory life command captures profile, goals, and reflections", async () => {
  const ctx = makeProject();
  const commands = new Map();
  const outputs = [];
  const fakePi = {
    registerCommand(name, spec) {
      commands.set(name, spec);
    },
  };
  const fakeCtx = {
    hasUI: true,
    ui: {
      setWidget(_name, lines) {
        outputs.push(lines.join("\n"));
      },
      notify() {},
    },
  };

  try {
    registerMemoryUse(fakePi);
    const memory = commands.get("memory");
    assert.ok(memory, "memory command should be registered");
    assert.equal(commands.has("life"), false, "life should stay under /memory");

    await memory.handler("life profile set name Alex", fakeCtx);
    await memory.handler("life goal add ship-life-os Ship Life OS", fakeCtx);
    await memory.handler("life goal update ship-life-os --progress 30 --note Research design complete", fakeCtx);
    await memory.handler("life goal add write docs", fakeCtx);
    await memory.handler("life reflect Win: command path works", fakeCtx);
    await memory.handler("life readout", fakeCtx);

    const state = readLifeState();
    assert.equal(state.profile.name, "Alex");
    assert.equal(state.goals[0].id, "ship-life-os");
    assert.equal(state.goals[0].progress, 30);
    assert.match(state.goals[0].note || "", /Research design complete/);
    assert.equal(state.goals[1].id, "write-docs");
    assert.equal(state.goals[1].name, "write docs");
    assert.match(state.reflections[0].text, /command path works/);
    assert.match(String(outputs.at(-1)), /Life OS continuity readout/);
    assert.match(String(outputs.at(-1)), /Alex/);
    assert.match(String(outputs.at(-1)), /Ship Life OS/);
  } finally {
    cleanup(ctx);
  }
});

test("memory life command supports explicit remove and reset operations", async () => {
  const ctx = makeProject();
  const commands = new Map();
  const fakePi = {
    registerCommand(name, spec) {
      commands.set(name, spec);
    },
  };
  const fakeCtx = { hasUI: true, ui: { setWidget() {}, notify() {} } };

  try {
    registerMemoryUse(fakePi);
    const memory = commands.get("memory");
    await memory.handler("life profile set name Alex", fakeCtx);
    await memory.handler("life goal add Ship Life OS", fakeCtx);
    const goalId = readLifeState().goals[0].id;
    await memory.handler(`life goal done ${goalId}`, fakeCtx);
    assert.equal(readLifeState().goals[0].status, "done");
    await memory.handler(`life goal remove ${goalId}`, fakeCtx);
    assert.equal(readLifeState().goals.length, 0);
    await memory.handler("life profile remove name", fakeCtx);
    assert.equal(Object.hasOwn(readLifeState().profile, "name"), false);
    await memory.handler("life reset", fakeCtx);
    assert.equal(readLifeState().reflections.length, 0);
  } finally {
    cleanup(ctx);
  }
});

test("command descriptions/help list memory surfaces without /context, /journal, or /memory compact", async () => {
  const commands = new Map();
  const fakePi = {
    registerCommand(name, spec) {
      commands.set(name, spec);
    },
  };

  registerMemoryUse(fakePi);

  const memory = commands.get("memory");
  assert.ok(memory, "memory command should be registered");
  assert.equal(commands.has("context"), false, "context command should not be registered");
  assert.equal(commands.has("journal"), false, "journal command should not be registered");
  assert.equal(commands.has("life"), false, "life command should not be registered separately");
  assert.match(memory.description, /status\|search\|update\|index\|list\|ls\|get/);
  assert.match(memory.description, /\|life\|/);
  assert.doesNotMatch(memory.description, /query/);
  assert.doesNotMatch(memory.description, /\|compact|compact\|/);

  let helpText = "";
  await memory.handler("help", {
    hasUI: true,
    ui: {
      setWidget(_name, lines) {
        helpText = lines.join("\n");
      },
      notify() {},
    },
  });
  assert.match(helpText, /\/memory index/);
  assert.match(helpText, /\/memory ls \[path\]/);
  assert.match(helpText, /\/memory life status\|readout\|profile\|goals\|goal\|reflect\|reflections/);
  assert.doesNotMatch(helpText, /^\/life/m);
  assert.doesNotMatch(helpText, /\/context/);
  assert.doesNotMatch(helpText, /\/journal/);
  assert.doesNotMatch(helpText, /\/memory query/);
  assert.doesNotMatch(helpText, /\/memory compact/);
});

test("memory extension registers focused Life OS tools without a dispatcher", () => {
  const commands = new Map();
  const tools = new Map();
  const fakePi = {
    on() {},
    registerCommand(name, spec) {
      commands.set(name, spec);
    },
    registerTool(spec) {
      tools.set(spec.name, spec);
    },
  };

  memoryExtension(fakePi);

  assert.ok(commands.has("memory"));
  for (const name of ["life_readout", "life_profile_set", "life_profile_remove", "life_goal_update", "life_goal_remove", "life_reflection_add", "life_reflection_remove"]) {
    assert.ok(tools.has(name), `${name} should be registered`);
  }
  assert.equal(tools.has("life"), false);
  assert.equal(tools.has("life_dispatch"), false);
  assert.equal(tools.has("life_reset"), false);
  assert.ok(tools.has("memory_status"));
  assert.ok(tools.has("memory_search"));
});

test("Life OS tools read and mutate private state on demand", async () => {
  const ctx = makeProject();
  const tools = new Map();
  const fakePi = {
    registerTool(spec) {
      tools.set(spec.name, spec);
    },
  };

  try {
    registerLifeTools(fakePi);
    await tools.get("life_profile_set").execute("profile", { field: "Name", value: "Alex" });
    await tools.get("life_goal_update").execute("goal", { id: "ship-life-os", name: "Ship Life OS", progress: 30, note: "Tools work" });
    await tools.get("life_reflection_add").execute("reflection", { text: "Win: focused tools work", tags: ["win"] });

    const readout = await tools.get("life_readout").execute("readout", { section: "all" });
    assert.match(readout.content[0].text, /Life OS continuity readout/);
    assert.match(readout.content[0].text, /Alex/);
    assert.match(readout.content[0].text, /Ship Life OS/);
    assert.equal(readLifeState().goals[0].id, "ship-life-os");

    await tools.get("life_goal_remove").execute("remove-goal", { id: "ship-life-os" });
    assert.equal(readLifeState().goals.length, 0);
    const reflectionId = readLifeState().reflections[0].id;
    await tools.get("life_reflection_remove").execute("remove-reflection", { id: reflectionId });
    assert.equal(readLifeState().reflections.length, 0);
    await tools.get("life_profile_remove").execute("remove-profile", { field: "name" });
    assert.equal(Object.hasOwn(readLifeState().profile, "name"), false);
  } finally {
    cleanup(ctx);
  }
});
```

## Slices

### Slice 1: Life state and readout foundation

**Files**: `packages/memory/code/extensions/memory/life-state.ts`, `packages/memory/code/extensions/memory/life-text.ts`, `packages/memory/code/tests/pi-memory.test.mjs`

#### Automated Verification:
- [ ] `packages/memory/code/extensions/memory/life-state.ts` exports `LIFE_STATE_VERSION`, `lifeStatePath()`, `readLifeState()`, `writeLifeState()`, profile/goal/reflection mutation helpers, and `resetLifeState()`.
- [ ] `packages/memory/code/extensions/memory/life-state.ts` stores state at `join(getMemoryPaths().STATE_DIR, "life", "life.json")` and writes through `writePrivateJsonSync()`.
- [ ] `packages/memory/code/extensions/memory/life-state.ts` throws on unsupported schema versions or malformed persisted goal/reflection/profile structures instead of silently deleting malformed data.
- [ ] `packages/memory/code/extensions/memory/life-text.ts` exports bounded status/readout helpers and uses `truncateUtf8()` for readouts.
- [ ] `packages/memory/code/tests/pi-memory.test.mjs` includes tests proving Life OS state is under `memory/state/life/life.json`, is absent from `buildDurableMemoryContext()` by default, and supports explicit id-based removal/reset.

#### Manual Verification:
- [ ] Inspect the Slice 1 code and confirm it adds no command routing, no model tools, no QMD collection, and no `before_agent_start` prompt injection.
- [ ] Confirm malformed or unsupported `life.json` state would fail through an explicit Life OS state error instead of silently deleting user data.

### Slice 2: `/memory life ...` commands

**Files**: `packages/memory/code/extensions/memory/life-use.ts`, `packages/memory/code/extensions/memory/memory-use.ts`, `packages/memory/code/tests/pi-memory.test.mjs`

#### Automated Verification:
- [ ] `packages/memory/code/extensions/memory/life-use.ts` exports `lifeMemoryCommand()` and `lifeMemoryUsage()` and routes `status`, `readout`, `profile`, `goals`, `goal`, `reflect`, `reflections`, `reflection`, `reset`, and `help`.
- [ ] `packages/memory/code/extensions/memory/life-use.ts` supports `/memory life goal add <name>`, `/memory life goal add <slug-id> <name>`, `/memory life goal add --id <id> <name>`, and `/memory life goal update <id> --progress N --note <text>`.
- [ ] `packages/memory/code/extensions/memory/memory-use.ts` imports `lifeMemoryCommand`/`lifeMemoryUsage`, lists `/memory life ...` in help, includes `life` in the command description, delegates `command === "life"` to `lifeMemoryCommand(rest)`, preserves `parseSearchCommandArgs()`, and preserves existing `status`, `search`, `remember`, and `forget` branches.
- [ ] `/memory status` output still reports existing memory paths and `State dir` after the `life` branch is added.
- [ ] `packages/memory/code/tests/pi-memory.test.mjs` includes command tests proving `/memory life` captures profile/goals/reflections, supports explicit remove/reset operations, and does not register a separate `/life` command.

#### Manual Verification:
- [ ] Inspect the Slice 2 routing and confirm it only adds a thin `life` branch to `memory-use.ts` without changing existing `status`, `search`, `remember`, or `forget` behavior.
- [ ] Confirm `/memory life readout` remains on-demand command output and does not alter `buildDurableMemoryContext()` or QMD collections.

### Slice 3: Focused Life OS tools and docs

**Files**: `packages/memory/code/extensions/memory/life-tools.ts`, `packages/memory/code/extensions/memory.ts`, `packages/memory/code/extensions/memory/README.md`, `packages/memory/code/tests/pi-memory.test.mjs`

#### Automated Verification:
- [ ] `packages/memory/code/extensions/memory/life-tools.ts` exports `registerLifeTools()` and registers focused tools `life_readout`, `life_profile_set`, `life_profile_remove`, `life_goal_update`, `life_goal_remove`, `life_reflection_add`, and `life_reflection_remove` with no `life`/`life_dispatch`/`life_reset` dispatcher tool.
- [ ] Each Life OS tool uses TypeBox parameters, `StringEnum` for enum params, `truncateToolOutput()` for returned text, and `toolError("<tool>", error)` in `catch` blocks.
- [ ] `packages/memory/code/extensions/memory.ts` imports and calls `registerLifeTools(pi)` while preserving existing `memory_status`, `memory_search`, `before_agent_start`, `session_compact`, and `session_shutdown` behavior.
- [ ] `packages/memory/code/extensions/memory/README.md` documents `life-state.ts`, `life-text.ts`, `life-use.ts`, `life-tools.ts`, private on-demand Life OS state, no default prompt injection/QMD indexing, no top-level `/life`, and command-only reset.
- [ ] `packages/memory/code/tests/pi-memory.test.mjs` includes tests proving focused Life OS tool registration, on-demand readout, profile/goal/reflection mutation, explicit removal, and absence of dispatcher/reset tools.
- [ ] Full terminal validation passes: `npm test`, `npm run pack:dry`, and `git diff --check`.

#### Manual Verification:
- [ ] Inspect `memory.ts` and confirm Life OS tool registration does not change durable-memory prompt injection or QMD search collections.
- [ ] Confirm model tools expose narrow set/update/remove operations only; broad reset remains explicit command-only UX.
- [ ] Confirm README keeps Life OS state private/on-demand and does not document any new package, daemon, scheduler, MCP server, wrapper CLI, or new path matrix.

## Desired End State

```txt
/memory life status
/memory life profile set name Alex
/memory life profile set focus "Pi-native Life OS personal continuity"
/memory life profile
/memory life goal add ship-life-os "Ship the Life OS continuity MVP"
/memory life goal update ship-life-os --progress 30 --note "Research/design complete"
/memory life goals
/memory life reflect "Win: clarified the memory-owned architecture"
/memory life readout
```

Model tools can retrieve a bounded Life OS readout and perform narrow state updates when the user asks Pi to remember profile facts, goals, or reflections.

## File Map

```txt
packages/memory/code/extensions/memory/life-state.ts      # NEW — versioned private Life OS state and mutations
packages/memory/code/extensions/memory/life-text.ts       # NEW — bounded text/readout rendering
packages/memory/code/extensions/memory/life-use.ts        # NEW — `/memory life ...` command handling
packages/memory/code/extensions/memory/life-tools.ts      # NEW — focused Life OS model tools
packages/memory/code/extensions/memory/memory-use.ts      # MODIFY — thin `/memory life` delegation and help text
packages/memory/code/extensions/memory.ts                 # MODIFY — register Life OS tools
packages/memory/code/extensions/memory/README.md          # MODIFY — document new modules/private-state rule
packages/memory/code/tests/pi-memory.test.mjs             # MODIFY — state, command, tool, prompt/search regression tests
```

## Ordering Constraints
- Slice 1 must land first because commands/tools depend on state and readout helpers.
- Slice 2 depends on Slice 1 and wires user-facing commands.
- Slice 3 depends on Slice 1 and can reuse command/state helpers for model tools.
- Source implementation should be sequential. Tests can be grouped by slice but all run under `npm test`.

## Verification Notes
- Verify `/memory status` still reports existing memory paths and `State dir`.
- Verify `buildDurableMemoryContext()` does not include Life OS profile/goals/reflections by default.
- Verify QMD search setup does not include `memory/state` or `memory/state/life`.
- Verify no `/context`, `/journal`, `/memory query`, `/memory compact`, or new `/life` command appears.
- Verify tools use TypeBox schemas, `truncateToolOutput()`, and `toolError()` like `memory_status`/`memory_search`.
- Verify private JSON writes use `writePrivateJsonSync()`.
- Run `npm test`, `npm run pack:dry`, and `git diff --check`.

## Performance Considerations
- `life.json` is expected to be small in the MVP; full-document read/write is acceptable and simpler than indexing/event sourcing.
- Readout functions cap goals/reflections and output bytes to avoid large command/tool responses.
- No prompt-time Life OS reads are performed in the MVP, so agent startup cost is unchanged.

## Migration Notes
- Initial schema version is `1` in one `life.json` document.
- Missing state initializes to an empty schema in memory and writes only on mutation.
- Malformed state returns a command/tool error with the basename/path context sanitized by normal error surfaces; implementation should avoid deleting malformed data automatically.
- Future schema migrations should happen in the Life OS state module, not setup config.

## Pattern References
- `packages/memory/code/extensions/memory/paths.ts:37-56` — path derivation and `STATE_DIR`.
- `packages/core/code/extensions/shared.ts:156-165` — private JSON write pattern.
- `packages/memory/code/extensions/memory/memory-use.ts:419-443` — unambiguous delete/forget behavior.
- `packages/memory/code/extensions/memory/memory-use.ts:965-1055` — `/memory` command router pattern.
- `packages/memory/code/extensions/memory.ts:46-84` — model tool registration pattern.
- `packages/memory/code/tests/pi-memory.test.mjs:38-65` — temp project/env test setup pattern.

## Developer Context
**Q (`packages/memory/code/extensions/memory/paths.ts:50`): How should the Life OS MVP persist profile/goals/reflections?**
A: One versioned `life.json`.

**Q (`packages/memory/code/extensions/memory.ts:46-84`): Should Life OS model tools be allowed to write MVP state?**
A: Narrow write tools.

**Q (`packages/memory/code/extensions/memory/memory-use.ts:419-443`): What reversible behavior should `/memory life ...` use?**
A: Explicit remove/reset.

**Q (`packages/memory/code/extensions/memory/memory-use.ts:992-1055`): Which command shape should research lock for the MVP?**
A: `/memory life ...`.

**Q (`packages/memory/code/extensions/memory/memory-use.ts:388-396`): Should MVP Life OS summaries enter default prompt context?**
A: No default injection.

**Q (`packages/memory/code/extensions/memory.ts:46-84`): What model tool shape should Life OS use first?**
A: Few focused tools.

**Q (design summary): Ready to proceed to decomposition?**
A: Proceed.

**Q (decomposition): Approve three slices for state/readout, commands, tools/docs?**
A: Approve.

**Q (Slice 1 micro-checkpoint): Approve Life state and readout foundation?**
A: Approve.

**Q (Slice 2 micro-checkpoint): Approve `/memory life ...` commands?**
A: Approve.

**Q (Slice 3 micro-checkpoint): Approve focused Life OS model tools and docs?**
A: Approve.

## Design History
- Slice 1: Life state and readout foundation — approved as generated; verifier warning about project-level `npm test`/`npm run pack:dry`/`git diff --check` deferred to terminal slice per design workflow.
- Slice 2: `/memory life ...` commands — approved after verifier pass; locked
- Slice 3: Focused Life OS tools and docs — approved after verifier pass; locked. Terminal implementation commands remain in Slice 3 Success Criteria.
- Plan review follow-up: applied parser disambiguation, removed the Life state circular dependency, and added `/memory status` criteria coverage after Step 4 plan review.

## References
- `.rpiv/artifacts/research/2026-05-29_11-50-23_pi-native-life-os-personal-continuity.md`
- `.rpiv/artifacts/discover/2026-05-29_11-18-20_pi-native-life-os-personal-continuity.md`
- `.rpiv/artifacts/research/2026-05-29_10-51-54_hermes-life-os-feature-port-analysis.md`
- `AGENTS.md`
