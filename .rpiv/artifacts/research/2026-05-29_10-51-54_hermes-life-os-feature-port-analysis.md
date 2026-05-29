---
date: 2026-05-29T10:51:54+0300
author: Alex Radu
commit: 19034189
branch: main
repository: nazar
topic: "Hermes Life OS feature port analysis"
tags: [research, codebase, hermes-life-os, memory, local-first, pi-extension]
status: complete
last_updated: 2026-05-29T10:51:54+0300
last_updated_by: Alex Radu
---

# Research: Hermes Life OS feature port analysis

## Research Question
Analyze `https://github.com/Lethe044/hermes-life-os` and identify which features are worth implementing in Nazar in a clean, Pi-native way. The user specifically asked to use RPIV and selected **Life memory core** as the first feature family to optimize for.

## Summary
Hermes Life OS is best treated as a feature-inspiration repository, not an architecture to port. Its durable ideas are structured life logs, deterministic pattern detection, personalized briefing workflows, and a tool-trace evaluation rubric; its implementation shell is a monolithic Python OpenRouter/Rich/argparse demo that conflicts with Nazar's Pi-extension-only architecture. For Nazar, the first clean slice should live in `@nazar/memory`: private structured life events, normalized schemas, deterministic/offline pattern summaries, and bounded searchable/brief prompt context. Daily briefings, retired messaging bridge/voice delivery, and reward-style evaluation should consume that memory core later rather than driving the first implementation.

## Detailed Findings

### Hermes repository shape
- Hermes stores most behavior in one large demo file, `.rpiv/external/hermes-life-os/demo/demo_life_os.py`, with path constants for `~/.hermes/life-os` and JSON/JSONL stores at `.rpiv/external/hermes-life-os/demo/demo_life_os.py:68-80`.
- User-facing modes are prompt presets in `DEMO_SCENARIOS`: onboard, morning, checkin, evening, weekly, nutrition, sleep, fitness, mental, focus, dream, health, and chat (`.rpiv/external/hermes-life-os/demo/demo_life_os.py:862-1028`; `.rpiv/external/hermes-life-os/README.md:98-114`).
- All non-chat modes run through the same OpenRouter client/tool loop in `run_life_os()` (`.rpiv/external/hermes-life-os/demo/demo_life_os.py:1074-1252`).
- Hermes' README advertises memory, skills, cron, gateway, subagents, and Atropos RL (`.rpiv/external/hermes-life-os/README.md:40-59`), but the demo implements manual CLI modes plus local parallel execution of read-only tools; cron and gateway delivery beyond terminal output are product framing, not live implementation.

### Nazar ownership and package boundaries
- Nazar core is a setup shell: `packages/core/code/extensions/nazar.ts:5-6` delegates to setup command registration, while `packages/core/code/extensions/nazar/setup-use.ts:174-204` owns `/nazar`, `/nazar-setup`, and `/nazar-status`.
- `@nazar/memory` owns durable memory surfaces: its extension registers setup, `/memory`, prompt injection, compaction, `memory_status`, and `memory_search` (`packages/memory/code/extensions/memory.ts:15-84`).
- `@nazar/voice`, `@nazar/retired-media-control`, and `@nazar/retired-messaging-bridge` already own STT/TTS, music, and remote-message transport surfaces (`packages/voice/code/extensions/voice.ts:10-18`; `packages/retired-media-control/code/extensions/retired-media-control.ts:6-9`; `packages/retired-messaging-bridge/code/extensions/retired-messaging-bridge.ts:6-9`).
- Project rules prohibit copying Hermes as a new runtime: Nazar must stay within Pi extension APIs, commands, tools, lifecycle events, skills, and guarded UI (`AGENTS.md:19-36`).

### Life memory core is the best first port
- Hermes' reusable data model is a stream of personal events plus structured side stores for profile, habits, goals, meals, sleep, hydration, fitness, focus, and mental state (`.rpiv/external/hermes-life-os/demo/demo_life_os.py:68-78`).
- Tool branches show the candidate event families: meals (`demo_life_os.py:323-342`), sleep (`demo_life_os.py:345-365`), hydration (`demo_life_os.py:365-382`), workouts (`demo_life_os.py:386-399`), stress/meditation/gratitude/focus (`demo_life_os.py:407-462`), habits/goals (`demo_life_os.py:470-519`), dashboards/reports (`demo_life_os.py:539-629`), briefings (`demo_life_os.py:631-657`), profile (`demo_life_os.py:659-675`), and dreams (`demo_life_os.py:679-704`).
- Nazar should not map each Hermes mode to a package. The modes collapse into one `@nazar/memory` capability group, with later consumers in voice/retired messaging bridge/retired media control only when transport or media is actually involved.
- `packages/memory/code/extensions/memory/memory-use.ts` is already an oversized known limitation in `AGENTS.md`; a port should add small modules beside it rather than extending the monolith.

### Persistence, privacy, and local-first boundary
- Hermes uses plain `Path.write_text()` for JSON stores and plain append for `memory.jsonl` (`.rpiv/external/hermes-life-os/demo/demo_life_os.py:96-121`).
- Nazar centralizes private writes in `writePrivateFileSync()` and `writePrivateJsonSync()`, creating `0700` directories and `0600` files best-effort (`packages/core/code/extensions/shared.ts:156-165`).
- Nazar memory paths are lazily resolved through `getMemoryPaths()`, honoring `NAZAR_HOME` or setup config and deriving vault/runtime/page locations from one source of truth (`packages/memory/code/extensions/memory/paths.ts:33-56`).
- Raw health/life logs should not become pinned memory by default. Pinned memory is curated Markdown bullet context, rollups are generated summaries, and QMD pages are searchable curated content (`packages/memory/code/extensions/memory/memory-use.ts:339-395`; `packages/memory/code/extensions/memory/memory-use.ts:852-939`).
- A clean port needs schema versioning, migration/deletion behavior, redaction, private file writes, and bounded prompt exposure; it should not duplicate existing pinned-page/rollup mechanics.

### Pattern detection and briefing workflows
- Hermes' deterministic pattern logic is portable: `detect_patterns()` scans recent memory, computes mood, energy, sleep, hydration, stress, dream, and habit insights (`.rpiv/external/hermes-life-os/demo/demo_life_os.py:170-298`).
- The life-os skill documents a daily rhythm and rules for mood dips, weekday energy, habit streaks, goal stalls, and win patterns (`.rpiv/external/hermes-life-os/skills/life-os/SKILL.md:18-59`). Runtime code implements only some of those rules: mood dips, coarse energy, sleep, hydration, stress, dreams, and habits; goal stalls, win clustering, and nutrition trends are incomplete.
- The first Nazar slice should keep pattern logic deterministic/offline-first. Any LLM-assisted classification or interpretation should be opt-in future work, not baseline behavior.
- Daily briefings should be a later `@nazar/memory` skill or command that consumes structured summaries. They should not require a new scheduler, monolithic loop, or core lifecycle abuse.

### UI, voice, chat, and transport surfaces
- Hermes' UI is terminal-first: argparse flags in `main()` (`.rpiv/external/hermes-life-os/demo/demo_life_os.py:1544-1553`), Rich panels in `send_briefing()` (`demo_life_os.py:646-653`), blocking chat input in `run_chat_mode()` (`demo_life_os.py:1399-1440`), and direct OpenRouter calls in both chat and voice paths.
- Nazar already has Pi commands and guarded UI helpers (`packages/core/code/extensions/shared.ts:104-122`), voice commands/shortcuts/TTS streaming (`packages/voice/code/extensions/voice/voice-use.ts:177-187`; `packages/voice/code/extensions/voice/tts-use.ts:148-286`), and retired messaging bridge outbound reply delivery (`packages/retired-messaging-bridge/code/extensions/retired-messaging-bridge/retired-messaging-bridge-use.ts:797-859`).
- Transport delivery should be explicitly out of scope for the first life-memory slice. Existing voice and retired messaging bridge packages can consume the memory capability later.

### Evaluation and acceptance criteria inspiration
- Hermes' reward function scores five behaviors: briefing sent, memory used, pattern detected, personalization, and expected tool coverage (`.rpiv/external/hermes-life-os/environments/life_os_env.py:93-144`; `.rpiv/external/hermes-life-os/environments/life_os_config.yaml:15-20`).
- Tests assert the reward contract, including high score for a perfect morning trajectory and explicit penalties for missing briefing or memory use (`.rpiv/external/hermes-life-os/tests/test_life_os_env.py:63-108`).
- For Nazar, this is useful as acceptance-test vocabulary only. It should not become runtime scoring, user-facing gamification, or an Atropos dependency.

## Code References
- `.rpiv/external/hermes-life-os/README.md:40-59` — Hermes feature claims: memory, skills, cron, gateway, subagents, Atropos RL.
- `.rpiv/external/hermes-life-os/README.md:98-114` — All demo modes.
- `.rpiv/external/hermes-life-os/skills/life-os/SKILL.md:18-59` — Daily rhythm, memory schema, briefing format, pattern rules.
- `.rpiv/external/hermes-life-os/demo/demo_life_os.py:68-80` — Hermes local data paths.
- `.rpiv/external/hermes-life-os/demo/demo_life_os.py:86-121` — JSON load/save and JSONL memory append.
- `.rpiv/external/hermes-life-os/demo/demo_life_os.py:170-298` — Deterministic pattern detection.
- `.rpiv/external/hermes-life-os/demo/demo_life_os.py:304-704` — Monolithic feature-tool dispatcher.
- `.rpiv/external/hermes-life-os/demo/demo_life_os.py:710-854` — OpenAI tool schemas.
- `.rpiv/external/hermes-life-os/demo/demo_life_os.py:862-1028` — Scenario/mode prompt presets.
- `.rpiv/external/hermes-life-os/demo/demo_life_os.py:1074-1252` — OpenRouter agent loop and tool execution.
- `.rpiv/external/hermes-life-os/demo/demo_life_os.py:1260-1399` — Voice/TTS/chat surfaces.
- `.rpiv/external/hermes-life-os/demo/demo_life_os.py:1544-1594` — CLI entrypoint and mode routing.
- `.rpiv/external/hermes-life-os/environments/life_os_env.py:24-177` — Scenarios, reward function, evaluation wrapper.
- `AGENTS.md:19-36` — Nazar product shape and extension constraints.
- `packages/core/code/extensions/shared.ts:104-165` — Guarded UI and private write helpers.
- `packages/memory/code/extensions/memory.ts:15-84` — Memory extension lifecycle/tool surface.
- `packages/memory/code/extensions/memory/paths.ts:33-56` — Memory path source of truth.
- `packages/memory/code/extensions/memory/memory-use.ts:339-395` — Durable memory context/pinned/rollup prompt injection.
- `packages/memory/code/extensions/memory/memory-use.ts:852-939` — QMD memory search collections and search flow.
- `packages/voice/code/extensions/voice.ts:10-18` — Voice package ownership.
- `packages/retired-media-control/code/extensions/retired-media-control/retired-media-control-use.ts:366-485` — retired media control command/tool surface.
- `packages/retired-messaging-bridge/code/extensions/retired-messaging-bridge/retired-messaging-bridge-use.ts:797-859` — retired messaging bridge session/agent reply gateway.

## Integration Points

### Inbound References
- Pi model/tool loop would call any new life-memory tools through `pi.registerTool`, analogous to `memory_status` and `memory_search` (`packages/memory/code/extensions/memory.ts:46-85`).
- Human command use would enter through `/memory` or a narrowly named memory command; `/memory` currently routes subcommands in `packages/memory/code/extensions/memory/memory-use.ts:992-1053`.
- Later briefing/transport consumers could enter through existing voice/retired messaging bridge packages, but they should depend on memory APIs rather than own storage.

### Outbound Dependencies
- New life-memory persistence should depend on `getMemoryPaths()` for storage roots (`packages/memory/code/extensions/memory/paths.ts:33-56`) and `writePrivateJsonSync()`/`writePrivateFileSync()` for secret-bearing/private data (`packages/core/code/extensions/shared.ts:156-165`).
- Tool output should use `truncateToolOutput()` and errors should route through `toolError()` like existing memory and retired media control tools (`packages/memory/code/extensions/memory.ts:46-85`; `packages/retired-media-control/code/extensions/retired-media-control/retired-media-control-use.ts:455-485`).
- Searchable summaries should use existing QMD page mechanics rather than inventing a new index (`packages/memory/code/extensions/memory/memory-use.ts:852-939`).

### Infrastructure Wiring
- Package manifest ownership should remain in `packages/memory/package.json`, with optional skill declarations if the daily rhythm/briefing workflow becomes an Agent Skill.
- Lifecycle hooks must keep their intended meanings: `before_agent_start` for bounded durable context, `session_compact` for rollups, and `session_shutdown` for cleanup (`packages/memory/code/extensions/memory.ts:20-42`; `AGENTS.md:31`).
- No new global scheduler should be introduced without an explicit external scheduler story; Hermes' cron schedule is product framing, not a Pi extension seam.

## Architecture Insights
- **Port concepts, not runtime.** Hermes' OpenRouter loop, argparse CLI, Rich UI, blocking chat, Google STT, and PowerShell/espeak TTS should not be copied.
- **One Nazar owner first.** Life logs, profile/habits/goals, dreams, dashboards, and deterministic patterns all belong in `@nazar/memory` before any transport integration.
- **Keep raw data private and summaries curated.** Structured health/life events are private state; pinned memory and QMD pages are curated context surfaces with bounded exposure.
- **Prefer deterministic heuristics.** Hermes' useful pattern rules are simple scans and thresholds. Nazar should keep the baseline offline/free/reproducible and reserve LLM classification for opt-in future work.
- **Small modules over dispatcher.** Hermes' `dispatch_tool()` is a catalog to mine. Nazar should split path/schema/store/pattern/tool/command helpers into small testable modules.
- **Evaluation as tests, not runtime.** The reward function names the product behaviors to preserve: use memory, detect patterns, personalize from context, deliver a briefing, and cover expected tools.

## Recommended Feature Port Shortlist
1. **Life memory core (selected first):** private structured events for life domains, normalized schema versions, deterministic pattern summaries, explicit deletion/reset behavior, and bounded outputs.
2. **Pattern summary command/tool:** a memory-owned command/tool that summarizes recent life patterns from structured state without exposing raw logs by default.
3. **Daily rhythm skill/command:** a later memory skill or `/memory brief` command that renders morning/check-in/evening/weekly briefings from the summaries.
4. **Transport consumers:** later optional delivery over existing `@nazar/voice` and `@nazar/retired-messaging-bridge`, consuming memory summaries rather than owning scheduling/storage.
5. **Rubric-backed tests:** acceptance tests inspired by Hermes reward components, not Atropos integration.

## Precedents & Lessons
5 similar past changes analyzed.

### Precedent: Nazar package split
**Commit(s)**: `ef99c66d` — "refactor: restructure Nazar into a monorepo with distinct packages for core functionality, memory, voice, retired media control, and retired messaging bridge" (2026-05-29); follow-up `19034189` — "fix: harden package split review findings" (2026-05-29).

**Blast radius**: 68 files across package manifests, core, memory, voice, retired media control, retired messaging bridge, docs/config.

**Takeaway**: Add Hermes-facing features through package-local entrypoints and small core seams; include stale-path, lifecycle, and package-boundary tests.

### Precedent: Review-driven shared/setup hardening
**Commit(s)**: `b7c3027f`, `90df3e37`, `e27792ac`, `f6a613a1` — review remediation and hardening around shared helpers, setup paths, truncation, voice, retired media control, retired messaging bridge.

**Takeaway**: Prefer small verified seams and tests over broad rewrites, especially around output truncation, privacy, setup, and shutdown behavior.

### Precedent: Memory path/search simplification
**Commit(s)**: `9005003e` — simplified memory path configuration and search behavior; follow-up `19034189` hardened package-era path leaks.

**Takeaway**: Do not add a new path override matrix for life data. Use the existing vault/runtime model and test status/search/path behavior.

### Precedent: Pi-facing layout reorganizations
**Commit(s)**: `51ee02ba`, `e64f7cc4`, `6ea0073e`, `0fdf80dd` — reorganized Pi-facing paths and cleaned stale references.

**Takeaway**: Any new memory modules need grep-driven stale reference checks and workspace-wide tests.

### Precedent: retired messaging bridge transport replacement
**Commit(s)**: `2b4964c4`, `158e1fe3`, `edc030d5`, `94d053b6` — heavy transport dependency changes required multiple runtime/API follow-ups.

**Takeaway**: Avoid new transport integrations in the first life-memory slice; if later needed, isolate optional/heavy deps package-locally and load lazily.

### Composite Lessons
- Package/layout changes fail first through stale paths, exports, settings, manifests, and tests.
- Memory changes should stay KISS: one vault model, bounded output, non-destructive legacy handling.
- Privacy/truncation guards are first-class: sanitize local paths, cap tool output, and write private files.
- Optional native/heavy dependencies belong in feature packages and must be lazily loaded with smoke tests.

## Historical Context (from `.rpiv/artifacts/`)
- `.rpiv/artifacts/plans/2026-05-29_00-13-03_nazar-pareto-split.md` — package split and core seam plan.
- `.rpiv/artifacts/reviews/2026-05-29_06-21-09_nazar-pareto-split.md` — review of package split hardening risks.
- `.rpiv/artifacts/plans/2026-05-28_19-35-46_core-review-remediation.md` — shared helper/setup remediation plan.
- `.rpiv/artifacts/plans/2026-05-28_20-30-52_comprehensive-review-remediation.md` — comprehensive privacy/truncation/shutdown remediation plan.

## Developer Context
**Q (`.rpiv/external/hermes-life-os/demo/demo_life_os.py:862-1028`): Hermes exposes many modes, but Nazar should collapse them into package-local features. Which feature family should this RPIV artifact optimize for first?**
A: Life memory core.

## Related Research
- None yet for Hermes Life OS.

## Open Questions
- Exact first-slice schema: which life event domains should be included initially, and which should be deferred?
- Retention/deletion model: should life logs have a `/memory life reset` style command, per-domain deletion, or only manual file deletion at first?
- Prompt exposure policy: which summaries, if any, should enter `before_agent_start` durable context versus staying searchable/on-demand only?
- User-facing command shape: should the first slice extend `/memory` subcommands or register a narrower command such as `/life` under the memory package?
