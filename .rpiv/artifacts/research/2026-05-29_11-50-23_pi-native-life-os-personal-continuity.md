---
date: 2026-05-29T11:50:23+0300
author: Alex Radu
commit: 19034189
branch: main
repository: nazar
topic: "Pi-native Life OS personal continuity"
tags: [research, codebase, memory, life-os, personal-continuity]
status: complete
last_updated: 2026-05-29T11:50:23+0300
last_updated_by: Alex Radu
---

# Research: Pi-native Life OS personal continuity

## Research Question
How should Nazar implement a Hermes Life OS-inspired personal-continuity MVP in Pi, focused on profile, goals, and reflections inside `@nazar/memory`, while preserving private storage, bounded prompt context, existing memory paths, and clean Pi extension architecture?

## Summary
The existing `@nazar/memory` package is the correct owner for the Life OS personal-continuity MVP. It already owns memory setup, `/memory` commands, prompt-time durable context, session rollups, QMD search, and memory tools. The clean implementation shape is a package-local extension to that surface: add small schema/state/text/tool modules for profile, goals, and reflections; route user commands under `/memory life ...`; register a few focused model tools; persist private structured state under `getMemoryPaths().STATE_DIR`; and keep raw continuity records out of default prompt injection. Existing tests and precedents strongly argue against a new package, path matrix, daemon, scheduler, or growth of `memory-use.ts` into a Life OS dispatcher.

## Detailed Findings

### Existing memory extension ownership
- The memory package declares one Pi extension entry, `./code/extensions/memory.ts`, and one skills root, `./code/extensions/memory/skills` (`packages/memory/package.json:13-18`).
- `memoryExtension(pi)` is a thin entrypoint that registers setup, `/memory`, durable prompt injection, compaction, and memory tools (`packages/memory/code/extensions/memory.ts:15-84`).
- The setup provider is package-local and unregistered on `session_shutdown` (`packages/memory/code/extensions/memory.ts:16-17`; `packages/memory/code/extensions/memory/memory-setup.ts:64-72`).
- `/memory` is currently the only memory command surface, registered by `registerMemoryUse(pi)` (`packages/memory/code/extensions/memory.ts:18`; `packages/memory/code/extensions/memory/memory-use.ts:992-1055`).
- This matches the FRD decision that the MVP belongs in `@nazar/memory`, not core, voice, retired messaging bridge, retired media control, or a new runtime.

### Command surface: lock `/memory life ...`
- The current command handler splits the raw tail into whitespace tokens, treats `parts[0]` as the subcommand, and passes the rest onward (`packages/memory/code/extensions/memory/memory-use.ts:995-998`).
- Existing branches route `status`, `search`, `update`, `index`, `list`, `get`, `pinned`, `remember`, and `forget`, then fall back to `memoryUsage()` help (`packages/memory/code/extensions/memory/memory-use.ts:1000-1053`).
- Existing reversibility precedent is explicit removal, not undo: `forgetPinnedMemory()` removes exactly one matching pinned bullet and fails ambiguous matches instead of deleting multiple entries (`packages/memory/code/extensions/memory/memory-use.ts:419-443`). Life OS commands should preserve that unambiguous remove/update/reset pattern.
- `/memory life profile` currently parses as `command === "life"` and falls through to help because no `life` branch exists.
- Existing command output uses `showText()`, which prints to console in headless mode and uses a widget/notification only when interactive UI exists (`packages/core/code/extensions/shared.ts:104-122`).
- The command-help test asserts only the memory command is registered and explicitly excludes resurrecting `/context`, `/journal`, `/memory query`, or `/memory compact` (`packages/memory/code/tests/pi-memory.test.mjs:570-603`).
- The user selected `/memory life ...` for the MVP. That fits the current router and avoids a new top-level `/life` command.

### Private structured storage path
- `getMemoryPaths()` is the source of truth for memory paths and resolves `VAULT_DIR` from `NAZAR_HOME` or setup config (`packages/memory/code/extensions/memory/paths.ts:37-40`).
- In vault mode, `MEMORY_ROOT` is `<vault>/05_Nazar/runtime`; without a vault, it falls back to repo-local `memory/` (`packages/memory/code/extensions/memory/paths.ts:41-50`).
- `STATE_DIR` is already defined as `join(MEMORY_ROOT, "state")` (`packages/memory/code/extensions/memory/paths.ts:50`).
- `ensureDirs()` includes `paths.STATE_DIR` in the runtime dirs it creates and self-heals if a previously created directory is deleted (`packages/memory/code/extensions/memory/memory-use.ts:191-218`).
- `ensureMemoryStorage()` is the exported wrapper around that initialization (`packages/memory/code/extensions/memory/memory-use.ts:221-223`).
- Shared private helpers create `0700` parent directories and `0600` files best-effort (`packages/core/code/extensions/shared.ts:156-165`).
- Therefore Life OS profile/goals/reflections can be stored privately under `STATE_DIR` without adding new env vars or setup config keys.

### Setup and scaffolding behavior
- Memory setup prompts for the vault root, writes `{ memory: { vaultDir } }`, ensures setup directories, ensures memory storage, and shows derived paths (`packages/memory/code/extensions/memory/memory-setup.ts:36-50`).
- `writeNazarSetupConfig()` resolves the memory vault path and writes setup config through `writePrivateJsonSync()` (`packages/core/code/extensions/nazar/setup-store.ts:91-105`).
- `ensureSetupDirectories()` creates config/state/data roots, the vault root, runtime root, and wiki root (`packages/core/code/extensions/nazar/setup-store.ts:109-114`).
- `ensureVaultScaffold()` creates the PARA-like vault folders, `05_Nazar/AGENTS.md`, LLM wiki instructions, `wiki/index.md`, and `wiki/log.md` (`packages/memory/code/extensions/memory/vault.ts:6-26`).
- Existing tests assert memory setup provider registration and vault scaffold creation (`packages/memory/code/tests/pi-memory.test.mjs:190-212`).
- Life OS state should not require additional interactive setup; it can initialize lazily under the already-created `STATE_DIR`.

### Prompt exposure boundary
- `buildDurableMemoryContext()` includes pinned bullets and a recent rollup digest, then truncates the combined text to 8 KiB (`packages/memory/code/extensions/memory/memory-use.ts:344`, `packages/memory/code/extensions/memory/memory-use.ts:388-395`).
- `durablePinnedDigest()` extracts only `- ` bullet lines from the pinned memory page; the empty template contributes nothing (`packages/memory/code/extensions/memory/memory-use.ts:339-356`).
- `durableRollupDigest()` prefers a latest closed weekly rollup and falls back to a latest closed daily rollup, extracting at most eight bullets (`packages/memory/code/extensions/memory/memory-use.ts:359-386`).
- The `before_agent_start` hook appends only this bounded digest to the system prompt (`packages/memory/code/extensions/memory.ts:22-27`).
- Tests assert empty pinned memory yields no durable context and remembered pinned bullets enter the context (`packages/memory/code/tests/pi-memory.test.mjs:319-329`); rollup digest inclusion is also tested (`packages/memory/code/tests/pi-memory.test.mjs:339-348`).
- The user selected **no default Life OS injection** for the MVP. Raw profile/goals/reflections should remain on-demand; users can promote concise facts into existing pinned memory when they want prompt-level continuity.
- The FRD still requires bounded summaries/readouts suitable for later prompt injection or briefing workflows. That means the MVP should expose a bounded continuity summary function for command/tool use, but it should not wire that summary into `before_agent_start` by default.

### Model tool pattern
- `memory_status` registers `name`, `label`, `description`, `promptSnippet`, `promptGuidelines`, TypeBox params, truncation, details, and `toolError()` wrapping (`packages/memory/code/extensions/memory.ts:46-59`).
- `memory_search` adds a TypeBox `query`, optional `limit`, and model-compatible `StringEnum(["default", "archive"])` scope (`packages/memory/code/extensions/memory.ts:63-84`).
- `truncateToolOutput()` uses Pi-native truncation when available and a local byte/line fallback otherwise (`packages/core/code/extensions/shared.ts:87-101`).
- `toolError()` prefixes tool errors with the tool name (`packages/core/code/extensions/shared.ts:37-39`).
- The user selected **few focused tools** for Life OS rather than one dispatcher tool or commands-only. Focused tools should follow the same TypeBox/truncation/error contract and keep prompt guidelines explicit that raw records are retrieved only on demand.

### Search and indexed-memory boundary
- QMD search indexes curated page roots, not runtime state (`packages/memory/code/extensions/memory/memory-use.ts:852-865`).
- In fallback mode, the search collection points at `paths.PAGES_DIR`; in vault mode it includes inbox/projects/areas/resources/pinned/wiki and optionally archive (`packages/memory/code/extensions/memory/memory-use.ts:852-878`).
- Tests assert QMD search excludes `memory/rollups`, `memory/state`, and journal-like paths (`packages/memory/code/tests/pi-memory.test.mjs:478-507`).
- Life OS raw state under `STATE_DIR` will therefore not become searchable through `memory_search` unless a separate curated page/summary is intentionally produced.

### Module boundaries
- `memory-use.ts` already mixes command handling, pinned memory, rollups, session parsing, QMD indexing, and status text. `AGENTS.md` calls it oversized and says decomposition is deferred as a behavior-free refactor (`AGENTS.md:64`).
- AGENTS also requires thin entry points and small single-purpose modules, with pure helpers in `*-utils.ts` or `*-text.ts` when testable (`AGENTS.md:28-29`).
- The Life OS slice should not add schema/state/summary logic to `memory-use.ts`; that file should get only a thin `/memory life` delegation branch if that command shape is implemented.
- Runtime TS files under `packages/memory/code/extensions/**` are included by the package allowlist (`packages/memory/package.json:20-24`), so new Life OS modules there are packable without package manifest changes.
- Tests should live in `packages/memory/code/tests/*.test.mjs`, which is the package test glob (`packages/memory/package.json:27`).

## Code References
- `packages/memory/package.json:13-24` — Pi extension/skills manifest and package files allowlist.
- `package.json:6-11` — workspace package layout and root test/pack scripts.
- `packages/memory/code/extensions/memory.ts:15-84` — memory extension setup, lifecycle, tools, and command registration.
- `packages/memory/code/extensions/memory/memory-use.ts:191-223` — memory directory creation and storage initialization.
- `packages/memory/code/extensions/memory/memory-use.ts:339-396` — pinned/rollup durable context builder and 8 KiB prompt cap.
- `packages/memory/code/extensions/memory/memory-use.ts:795-820` — memory status text, including state dir reporting.
- `packages/memory/code/extensions/memory/memory-use.ts:852-939` — QMD collection specs, index refresh, and search.
- `packages/memory/code/extensions/memory/memory-use.ts:965-1055` — `/memory` usage and command router.
- `packages/memory/code/extensions/memory/paths.ts:37-56` — memory path derivation and `STATE_DIR`.
- `packages/memory/code/extensions/memory/memory-setup.ts:36-72` — memory setup provider and vault configuration flow.
- `packages/memory/code/extensions/memory/vault.ts:6-26` — vault scaffold and local AGENTS/wiki files.
- `packages/core/code/extensions/shared.ts:37-39` — `toolError()` helper.
- `packages/core/code/extensions/shared.ts:87-122` — tool truncation and headless-safe UI helpers.
- `packages/core/code/extensions/shared.ts:156-165` — private file/JSON write helpers.
- `packages/core/code/extensions/nazar/setup-store.ts:87-114` — setup config read/write and setup directory creation.
- `packages/memory/code/tests/pi-memory.test.mjs:190-212` — memory setup provider/vault scaffold test coverage.
- `packages/memory/code/tests/pi-memory.test.mjs:319-348` — durable context tests.
- `packages/memory/code/tests/pi-memory.test.mjs:478-507` — QMD search excludes runtime state/rollups.
- `packages/memory/code/tests/pi-memory.test.mjs:570-603` — command-help and forbidden command-surface assertions.
- `.rpiv/artifacts/discover/2026-05-29_11-18-20_pi-native-life-os-personal-continuity.md` — FRD and user decisions.
- `.rpiv/artifacts/research/2026-05-29_10-51-54_hermes-life-os-feature-port-analysis.md` — Hermes inspiration analysis.

## Integration Points

### Inbound References
- `/memory` command users enter through `registerMemoryUse()` (`packages/memory/code/extensions/memory/memory-use.ts:992-1055`).
- Model-callable memory tools are registered in `memoryExtension()` (`packages/memory/code/extensions/memory.ts:46-84`).
- Setup users enter through the core `/nazar setup memory` provider registry path (`packages/memory/code/extensions/memory/memory-setup.ts:64-72`; `packages/core/code/extensions/nazar/setup-use.ts:119-141`).
- Prompt context enters only through the memory `before_agent_start` hook (`packages/memory/code/extensions/memory.ts:22-27`).

### Outbound Dependencies
- Life OS state should depend on `getMemoryPaths().STATE_DIR` for storage (`packages/memory/code/extensions/memory/paths.ts:50`).
- Private writes should use `writePrivateJsonSync()` / `writePrivateFileSync()` (`packages/core/code/extensions/shared.ts:156-165`).
- Command output should use `showText()` but must pre-bound large Life OS output because `showText()` itself does not truncate (`packages/core/code/extensions/shared.ts:116-122`).
- Tool output should use `truncateToolOutput()` and `toolError()` (`packages/core/code/extensions/shared.ts:37-39`, `packages/core/code/extensions/shared.ts:87-101`).

### Infrastructure Wiring
- No manifest change is needed if new modules live under `packages/memory/code/extensions/**` (`packages/memory/package.json:20-24`).
- No new setup config key is needed because `STATE_DIR` already exists under existing memory roots (`packages/memory/code/extensions/memory/paths.ts:37-51`).
- No QMD collection change is needed for raw MVP state; search intentionally excludes runtime state (`packages/memory/code/extensions/memory/memory-use.ts:852-865`).

## Architecture Insights
- **Single owner:** `@nazar/memory` should own the personal-continuity core; transports and daily rhythm consume it later.
- **Raw private, curated optional:** profile/goals/reflections are private state by default. Prompt context remains pinned/rollup only in the MVP.
- **Use `/memory life ...`:** the command belongs under the existing memory router and should not add a new top-level command.
- **Focused tools, no dispatcher:** a few focused model tools fit the existing tool contract better than one action-enum dispatcher.
- **Reversible by explicit selectors:** profile fields, goals, and reflections need explicit update/remove/reset command paths with unambiguous selectors; existing pinned forget behavior is the local precedent.
- **Small modules:** schema, state, text/summary, command handling, and tool registration should be separate modules. `memory-use.ts` should only delegate.
- **No new path matrix:** existing `STATE_DIR` and private write helpers already satisfy the storage need.
- **Bounded summary/readout:** the MVP needs a bounded continuity summary for command/tool consumers and future briefing workflows, but no default prompt injection.
- **No QMD/raw-state indexing:** raw personal continuity is on-demand; any searchable/briefable page should be an explicit curated output, not the raw state store.

## Precedents & Lessons
5 similar past change groups analyzed.

### Precedent: Package split moved memory behind `@nazar/memory`
**Commit(s)**: `ef99c66d` — "refactor: restructure Nazar into a monorepo with distinct packages for core functionality, memory, voice, retired media control, and retired messaging bridge" (2026-05-29); follow-up `19034189` — "fix: harden package split review findings" (2026-05-29).

**Blast radius**: 69 files across core, memory, feature packages, config, docs, and tests.

**Takeaway**: Keep Life OS package-local in `@nazar/memory`; setup must scaffold storage immediately and lifecycle registrations must remain safe.

### Precedent: Memory path/search simplification
**Commit(s)**: `5b042a3d`, `c26dba1b`, `9005003e` — memory path and search simplification work (2026-05-29); follow-up `19034189` hardened stale path leaks.

**Takeaway**: Add Life OS state under existing `getMemoryPaths()` roots; avoid new env/path knobs.

### Precedent: Initial memory command/tool/prompt surface and hardening
**Commit(s)**: `8bab3cf7` plus follow-ups `0f8dc5c6`, `b7c3027f`, `90df3e37`, `e27792ac`, `f6a613a1`.

**Takeaway**: Every new Life OS command/tool needs bounded output, `toolError`, tests, and no raw-log prompt injection by default.

### Precedent: Wiki-native memory/search flow
**Commit(s)**: `66f67d9e`, `7e612896`, `26e64d5d`, `40131618`; follow-ups `221d37e3`, `8ebc15b2`.

**Takeaway**: Design Life OS schema/store/search as small tested modules with path guards and clear write semantics before exposing tools.

### Precedent: Prompt injection hook correction
**Commit(s)**: `54c2cfa4`; follow-up `7a983cc7` corrected system prompt injection to `before_agent_start`.

**Takeaway**: If Life OS ever injects summaries, use `before_agent_start`, preserve existing prompt text, and inject only curated bounded context.

### Composite Lessons
- Stale paths are recurring failure mode: reuse `getMemoryPaths()`, avoid new knobs, and test status/search/package behavior.
- Raw personal data must stay private/on-demand; only curated summaries should reach prompt context.
- New tools/commands need narrow schemas, bounded output, invalid-arg tests, and headless-safe output.
- Setup/lifecycle code is fragile; avoid unnecessary changes there for the MVP.
- Keep MVP small: profile/goals/reflections only, no scheduler, no transport, no new runtime.

## Historical Context (from `.rpiv/artifacts/`)
- `.rpiv/artifacts/discover/2026-05-29_11-18-20_pi-native-life-os-personal-continuity.md` — FRD for the personal-continuity MVP.
- `.rpiv/artifacts/research/2026-05-29_10-51-54_hermes-life-os-feature-port-analysis.md` — Hermes Life OS feature-inspiration analysis.
- `.rpiv/artifacts/plans/2026-05-29_00-13-03_nazar-pareto-split.md` — package split plan and package-boundary lessons.
- `.rpiv/artifacts/reviews/2026-05-29_06-21-09_nazar-pareto-split.md` — package split review and follow-up risks.
- `.rpiv/artifacts/plans/2026-05-28_20-30-52_comprehensive-review-remediation.md` — truncation, privacy, and tool-hardening remediation context.

## Developer Context
**Q (discover: Initial product focus): What problem should a Pi-native Life OS solve for you, and who should feel the improvement first?**
A: All Life OS goals eventually, but first personal continuity.

**Q (discover: Package owner): From the probe I inferred the first personal-continuity slice should live in `@nazar/memory`, because `packages/memory/code/extensions/memory.ts:15-84` already owns memory setup, prompt injection, rollups, commands, and tools. Keep that owner?**
A: Keep memory owner.

**Q (discover: Raw log exposure): From the probe I inferred raw Life OS events should not enter durable prompt context by default, because `packages/memory/code/extensions/memory/memory-use.ts:388-396` only injects pinned bullets plus recent rollup digest, capped at 8 KiB. Keep raw logs on-demand only?**
A: On-demand raw logs.

**Q (discover: Storage constraint): From the probe I inferred Life OS state should reuse `getMemoryPaths()` at `packages/memory/code/extensions/memory/paths.ts:37-51` and private writes from `packages/core/code/extensions/shared.ts:156-165`, with no new path override matrix. Keep that constraint?**
A: Reuse vault paths.

**Q (discover: First schema scope): `packages/memory/code/extensions/memory/memory-use.ts:398-443` currently only has pinned `remember/forget`, and the probe found no structured Life OS schema. What should the first personal-continuity schema include?**
A: Profile, goals, reflections.

**Q (discover: Capture surface assumption): `packages/memory/code/extensions/memory/memory-use.ts:992-1055` exposes `/memory` commands, while `packages/memory/code/extensions/memory.ts:46-84` exposes model tools. How should profile, goals, and reflections be captured first?**
A: Assumed commands plus tools for downstream research/design; exact UX was left open at discover time.

**Q (`packages/memory/code/extensions/memory/memory-use.ts:992-1055`): Which command shape should research lock for the MVP?**
A: `/memory life ...`.

**Q (`packages/memory/code/extensions/memory/memory-use.ts:388-396`): Should MVP Life OS summaries enter default prompt context?**
A: No default injection.

**Q (`packages/memory/code/extensions/memory.ts:46-84`): What model tool shape should Life OS use first?**
A: Few focused tools.

## Related Research
- `.rpiv/artifacts/research/2026-05-29_10-51-54_hermes-life-os-feature-port-analysis.md`

## Open Questions
- Exact focused tool names and TypeBox schemas for profile, goals, and reflections.
- Exact deletion/reset command syntax and confirmation behavior for profile, goals, and reflections. Research resolves the strategy as explicit unambiguous update/remove/reset commands, following `forgetPinnedMemory()`; design must choose the concrete UX.
- Schema version and migration policy for the first structured state file(s).
- Whether a later curated Life OS summary should become prompt-injectable, and what explicit promotion mechanism would control it.
