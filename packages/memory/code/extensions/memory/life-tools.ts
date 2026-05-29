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
      maxBytes: Type.Optional(Type.Number({ description: "Maximum UTF-8 bytes in the readout. Default: 8192." })),
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
