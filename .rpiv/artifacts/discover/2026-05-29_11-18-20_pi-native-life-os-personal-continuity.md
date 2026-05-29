---
date: 2026-05-29T11:18:20+0300
author: Alex Radu
commit: 19034189
branch: main
repository: nazar
topic: "Pi-native Life OS personal continuity"
tags: [intent, frd, memory, life-os, personal-continuity]
status: complete
last_updated: 2026-05-29T11:18:20+0300
last_updated_by: Alex Radu
---

# FRD: Pi-native Life OS personal continuity

## Summary
Build a Hermes Life OS-inspired system inside Pi/Nazar, with the first MVP focused on **personal continuity** rather than the full Life OS vision. The initial feature should help Pi remember who the user is, what goals matter, and what reflections/patterns should carry across sessions, while keeping raw personal logs private and on-demand.

## Problem & Intent
The developer wants a similar system to Hermes Life OS, but implemented cleanly in Pi/Nazar. Long-term, the system can grow into personal continuity, daily rhythm, wellness pattern tracking, and assistant orchestration. First, it should make Pi feel continuous across sessions: it should carry durable context, profile, goals, and reflections without polluting every prompt with raw logs.

Developer framing captured during interview: "All of them but first we go with personal continuity."

## Goals
- Preserve personal continuity across Pi sessions through structured profile, goals, and reflections.
- Keep the implementation Pi-native: package-local extension code, commands, tools, and skills only.
- Reuse Nazar's existing memory vault/runtime paths and private write helpers.
- Keep raw Life OS data private and on-demand by default.
- Enable later daily briefings, wellness tracking, voice/retired messaging bridge delivery, and broader Life OS orchestration to consume the continuity core.

## Non-Goals
- Do not port Hermes' Python/OpenRouter/Rich/argparse runtime loop.
- Do not implement the full Hermes mode surface in the MVP.
- Do not add a new daemon, MCP server, wrapper CLI, scheduler, or Pi core patch.
- Do not add voice, retired messaging bridge, retired media control, health/wellness logs, or briefing delivery in the first slice.
- Do not inject raw personal logs into the default Pi system prompt.

## Functional Requirements
1. The system SHALL store a minimal Life OS profile for stable identity/context facts that should survive sessions.
2. The system SHALL store active goals with enough structure to update, list, and reflect on them over time.
3. The system SHALL store dated reflections that can capture wins, struggles, decisions, or self-observations.
4. The system SHALL expose Life OS continuity state through explicit user-facing memory commands.
5. The system SHOULD expose model-callable tools for safe capture/retrieval of profile, goals, and reflections, pending exact naming confirmation.
6. The system SHALL keep raw Life OS records private and on-demand only unless the user explicitly promotes a summary into existing pinned/curated memory.
7. The system SHALL produce bounded summaries suitable for later prompt injection or briefing workflows without exposing full raw logs by default.
8. The system SHALL support inspection of stored profile/goals/reflections through a command or tool output that is truncated using existing Nazar output limits.
9. The system SHALL leave broader Life OS domains — wellness logs, daily rhythm, dream journal, transports, and evaluation rubric — as future slices.

## Non-Functional Requirements
- **Performance**: Reading or summarizing the MVP continuity state should be fast enough for interactive Pi command/tool use; no background daemon is required.
- **Security**: New private state files must use shared private-write helpers and must not be committed to git. Raw logs must not be injected by default.
- **UX / Accessibility**: Commands should be explicit, inspectable, and reversible; headless output must work through existing `showText`/console fallback behavior.
- **Reliability**: Malformed or missing Life OS state should fail gracefully with clear setup/recovery text, not break Pi startup or memory injection.

## Constraints & Assumptions
- Implementation belongs in `@nazar/memory`, because `packages/memory/code/extensions/memory.ts:15-84` already owns memory setup, prompt injection, rollups, commands, and tools.
- Storage should reuse `getMemoryPaths()` in `packages/memory/code/extensions/memory/paths.ts:37-51`; no new `NAZAR_LIFE_*` path matrix should be introduced.
- New private structured state should use `writePrivateFileSync()` / `writePrivateJsonSync()` from `packages/core/code/extensions/shared.ts:156-165`.
- Raw logs remain on-demand only; default context injection should stay bounded like `buildDurableMemoryContext()` at `packages/memory/code/extensions/memory/memory-use.ts:388-396`.
- `packages/memory/code/extensions/memory/memory-use.ts` is already oversized, so implementation should use small dedicated modules rather than growing the monolith.
- Assumption: because the user said "continue" after the capture-surface question, initial research/design may assume explicit commands plus model tools, but exact names and UX remain open.

## Acceptance Criteria
- [ ] Running `/memory status` still works and shows existing memory paths after the feature lands.
- [ ] If the default namespace is accepted, running `/memory life profile set <field> <value>` followed by `/memory life profile` displays the stored profile value.
- [ ] If the default namespace is accepted, running `/memory life goal add <name>` followed by `/memory life goals` displays the active goal.
- [ ] If the default namespace is accepted, running `/memory life reflect <text>` followed by `/memory life reflections` displays the dated reflection.
- [ ] Raw Life OS records do not appear in `buildDurableMemoryContext()` output unless explicitly promoted to existing pinned/curated memory.
- [ ] New private state files are written under existing memory/vault runtime paths using private write helpers.
- [ ] `npm test` exits 0.
- [ ] `npm run pack:dry` exits 0.
- [ ] `git diff --check` exits 0.

## Recommended Approach
Extend `@nazar/memory` with a minimal personal-continuity layer for profile, goals, and reflections. Add small pure modules for schema/state/summary behavior, wire explicit `/memory` subcommands and model tools through the existing memory extension, store private structured state under existing memory paths, and keep default prompt injection bounded/curated.

## Decisions

### Initial product focus
**Question**: What problem should a Pi-native Life OS solve for you, and who should feel the improvement first?
**Recommended**: Personal continuity first, with broader Life OS goals later.
**Chosen**: All Life OS goals eventually, but first personal continuity.
**Rationale**: Developer wants the full Hermes-inspired direction, but picked continuity as the MVP entry point.

### Package owner
**Question**: From the probe I inferred the first personal-continuity slice should live in `@nazar/memory`, because `packages/memory/code/extensions/memory.ts:15-84` already owns memory setup, prompt injection, rollups, commands, and tools. Keep that owner?
**Recommended**: Keep memory owner.
**Chosen**: Keep memory owner.
**Rationale**: Evidence: `packages/memory/code/extensions/memory.ts:15-84` is the existing continuity surface; transports can consume memory later.

### Raw log exposure
**Question**: From the probe I inferred raw Life OS events should not enter durable prompt context by default, because `packages/memory/code/extensions/memory/memory-use.ts:388-396` only injects pinned bullets plus recent rollup digest, capped at 8 KiB. Keep raw logs on-demand only?
**Recommended**: On-demand raw logs.
**Chosen**: On-demand raw logs.
**Rationale**: Preserves privacy and avoids prompt bloat while allowing curated summaries later.

### Storage constraint
**Question**: From the probe I inferred Life OS state should reuse `getMemoryPaths()` at `packages/memory/code/extensions/memory/paths.ts:37-51` and private writes from `packages/core/code/extensions/shared.ts:156-165`, with no new path override matrix. Keep that constraint?
**Recommended**: Reuse vault paths.
**Chosen**: Reuse vault paths.
**Rationale**: Keeps one source of truth for memory paths and follows Nazar's private-write pattern.

### First schema scope
**Question**: `packages/memory/code/extensions/memory/memory-use.ts:398-443` currently only has pinned `remember/forget`, and the probe found no structured Life OS schema. What should the first personal-continuity schema include?
**Recommended**: Profile, goals, reflections.
**Chosen**: Profile, goals, reflections.
**Rationale**: Optimizes continuity while avoiding the broader wellness/tracking surface in the MVP.

### Capture surface assumption
**Question**: `packages/memory/code/extensions/memory/memory-use.ts:992-1055` exposes `/memory` commands, while `packages/memory/code/extensions/memory.ts:46-84` exposes model tools. How should profile, goals, and reflections be captured first?
**Recommended**: Commands plus tools.
**Chosen**: Assumed commands plus tools for downstream research/design; exact UX still open.
**Rationale**: The developer said "continue" after this question; treat the recommended path as a working assumption, not a final naming decision.

## Open Questions
- Exact command shape: extend `/memory life ...`, add narrower `/life ...`, or use another memory-owned command namespace?
- Exact tool names and schemas for model-assisted profile, goal, and reflection capture.
- Whether curated Life OS summaries should ever be injected automatically, and what promotion mechanism controls that.
- Deletion/reset behavior for profile, goals, and reflections.
- Schema version and migration policy for the first structured state file(s).

## Suggested Follow-ups
- Daily rhythm / briefing workflows from `.rpiv/external/hermes-life-os/skills/life-os/SKILL.md:18-59` should be a later memory skill/command after the continuity core exists.
- Wellness logs, dream journal, habit tracking, and pattern detection from `.rpiv/artifacts/research/2026-05-29_10-51-54_hermes-life-os-feature-port-analysis.md` should be later slices, not MVP scope.
- Voice and retired messaging bridge delivery should consume this memory capability later through existing package surfaces, not drive the first implementation.

## References
- `.rpiv/artifacts/research/2026-05-29_10-51-54_hermes-life-os-feature-port-analysis.md`
- `AGENTS.md`
- `packages/memory/code/extensions/memory.ts`
- `packages/memory/code/extensions/memory/memory-use.ts`
- `packages/memory/code/extensions/memory/paths.ts`
- `packages/core/code/extensions/shared.ts`
