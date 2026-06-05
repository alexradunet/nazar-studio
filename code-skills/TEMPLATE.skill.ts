// SPDX-License-Identifier: AGPL-3.0-or-later
// Nazar CODE skill template — the HEAVIER rung. Most skills are Pi-native procedure files
// (skills/*.md via skill_write); reach for a code extension only when you need
// genuinely new tooling (API calls, computation). See docs/SELF_EVOLUTION.md.
//
// Flow: copy to code-skills/proposed/<name>.ts, fill it in, then run
//   make skill-check FILE=code-skills/proposed/<name>.ts
// A human reviews the PR; once merged it's loaded with `/reload` in Pi.
//
// @capability: reads=[vault] writes=[] network=[none]   <-- REQUIRED: declare blast radius
//
// Rules for agent-authored skills: no child_process, no eval, no raw secret access,
// no network outside the declared allowlist, touch only declared paths.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "example_skill",
    label: "example",
    description: "One line so the agent knows exactly when to use this skill.",
    parameters: Type.Object({ input: Type.String() }),
    async execute(_id: string, p: { input: string }) {
      // Keep it pure and bounded.
      return { content: [{ type: "text", text: `TODO: handle ${p.input}` }], details: {} };
    },
  });
}
