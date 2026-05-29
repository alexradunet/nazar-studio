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
  const text = args.join(" ").replace(/^[ '\"]+|[ '\"]+$/g, "").trim();
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
      note = args.slice(i + 1).join(" ").replace(/^[ '\"]+|[ '\"]+$/g, "").trim();
      break;
    } else if (progress === undefined && maybeProgress(part) !== undefined) {
      progress = maybeProgress(part);
    } else {
      note = args.slice(i).join(" ").replace(/^[ '\"]+|[ '\"]+$/g, "").trim();
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
