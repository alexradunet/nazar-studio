---
date: 2026-05-29T17:55:06+0300
author: Alex Radu
commit: 6238334a
branch: main
repository: nazar
topic: "Post-setup memory onboarding enhancements"
confidence: high
complexity: medium
status: ready
tags: [solutions, setup, onboarding, memory]
last_updated: 2026-05-29T18:05:57+0300
last_updated_by: Alex Radu
last_updated_note: "Evaluated whether canonical memory should merge into core"
---

# Solution Analysis: Post-setup memory onboarding enhancements

**Date**: 2026-05-29T17:55:06+0300  
**Author**: Alex Radu  
**Commit**: 6238334a  
**Branch**: main  
**Repository**: nazar

## Research Question

How can Nazar enhance the newly added post-`/nazar setup` onboarding conversation so it better populates memory, learns the user, and feels personal from first use without over-coupling core to memory or repeating annoyingly?

## Summary

**Problem**: The current implementation starts a useful current-model onboarding chat after setup, but the prompt is owned by `@nazar/core` and hard-codes memory/Life OS language even when memory may not be installed.  
**Recommended**: Provider-owned onboarding hook — extend setup providers so packages contribute onboarding prompts, while core only orchestrates launch, idempotency, and UI-safe delivery.  
**Effort**: Medium (~1 day).  
**Confidence**: High.

## Problem Statement

**Requirements:**
- Start a current-model conversation after setup so onboarding feels personal.
- Ask one question at a time and store memory only after explicit user approval.
- Keep core setup registry-driven and feature-free.
- Avoid repeated onboarding on every setup rerun.
- Support skip/rerun paths.

**Constraints:**
- Nazar is Pi-extension-only; use Pi extension primitives, not wrapper frameworks.
- Memory/Life OS language belongs in `@nazar/memory`, not `@nazar/core`.
- Do not store secrets, raw transcripts, temporary task state, or dossier-like user profiling.
- Preserve headless behavior: no surprise agent turn when interactive setup is unavailable.

**Success criteria:**
- Core sends onboarding only when at least one configured provider contributes onboarding.
- Memory provider owns memory/Life OS copy.
- Setup does not re-prompt unless the user explicitly asks to rerun onboarding.
- Tests prove provider prompt ownership, no-provider no-op, skip/rerun behavior, and memory package contribution.

## Current State

**Existing implementation:**
- `SetupProvider` currently supports provider-owned `configure` and `statusText`: `packages/core/code/extensions/nazar/setup-registry.ts:3`.
- Core discovers setup providers for status/menu/setup: `packages/core/code/extensions/nazar/setup-use.ts:52`, `packages/core/code/extensions/nazar/setup-use.ts:82`, `packages/core/code/extensions/nazar/setup-use.ts:162`.
- Current onboarding prompt is core-owned and mentions Life OS/memory tools: `packages/core/code/extensions/nazar/setup-use.ts:15`, `packages/core/code/extensions/nazar/setup-use.ts:23`.
- Core sends the onboarding user message directly after successful setup: `packages/core/code/extensions/nazar/setup-use.ts:33`, `packages/core/code/extensions/nazar/setup-use.ts:166`.
- Memory provider already registers setup/status through the registry: `packages/memory/code/extensions/memory/memory-setup.ts:64`.
- Memory extension registers Life OS tools separately: `packages/memory/code/extensions/memory.ts:20`.

**Relevant patterns:**
- Registry-owned setup extension point: `packages/core/code/extensions/nazar/setup-registry.ts:3`.
- Provider execution loop: `packages/core/code/extensions/nazar/setup-use.ts:162`.
- Vault scaffolding during memory setup: `packages/memory/code/extensions/memory/memory-setup.ts:49`.
- Durable memory prompt injection is already memory-owned: `packages/memory/code/extensions/memory.ts:24`.
- Tests already fake `sendUserMessage` for setup onboarding: `packages/core/code/tests/pi-core.test.mjs:60`.

**Integration points:**
- `packages/core/code/extensions/nazar/setup-registry.ts:3` — add optional onboarding hook/descriptor.
- `packages/core/code/extensions/nazar/setup-use.ts:160` — collect onboarding from selected providers after successful configure.
- `packages/core/code/extensions/nazar/setup-store.ts:9` — persist minimal onboarding state if idempotency lives in setup config.
- `packages/memory/code/extensions/memory/memory-setup.ts:64` — contribute memory/Life OS onboarding text from memory package.

## Solution Options

### Option 1: Provider-owned onboarding hook

**How it works:**
Extend `SetupProvider` with optional onboarding metadata, for example `onboardingPrompt?: () => string | Promise<string>`. After successful setup, core collects prompts from the selected configured providers, wraps them in a generic current-model instruction, and calls `pi.sendUserMessage()` once. Memory owns the memory/Life OS content.

**Pros:**
- Best architectural fit: setup is already provider-owned via `SetupProvider` (`setup-registry.ts:3`).
- Removes memory/Life OS wording from core (`setup-use.ts:15`, `setup-use.ts:23`).
- Avoids onboarding when only `@nazar/core` is installed.
- Established ecosystem pattern: OpenClaw and Hermes both use plugin/provider-owned setup surfaces.

**Cons:**
- Requires changing both core and memory package tests.
- Needs prompt combination/error isolation so one provider cannot break setup.

**Complexity:** Medium (~1 day)
- Files to modify: 4–6.
- Risk level: Low-medium.

### Option 2: Bootstrap sentinel ritual

**How it works:**
Memory setup seeds a one-time marker/template in private runtime or vault control state. The model sees the bootstrap instruction, follows a one-question-at-a-time ritual, writes approved facts, then clears/deletes the marker.

**Pros:**
- Strong OpenClaw precedent: first-run `BOOTSTRAP.md` ritual is deleted when complete.
- Natural path for richer future onboarding with templates.
- Uses durable local files rather than hidden in-session state.

**Cons:**
- Higher risk of creating unused write-only artifacts unless all read/clear paths are implemented.
- Must avoid searchable/leaky markdown placement.
- Existing tests guard against resurrecting old bootstrap-style context artifacts.

**Complexity:** Medium (~1–2 days)
- Files to create: likely 1 helper module.
- Files to modify: memory setup + memory lifecycle + tests.
- Risk level: Medium.

### Option 3: Harden current trigger

**How it works:**
Keep the current core prompt, but add idempotent state, launch confirmation, skip/rerun controls, and headless messaging.

**Pros:**
- Lowest implementation cost.
- Builds directly on the existing `triggerSetupOnboarding()` path (`setup-use.ts:30`).
- Fast way to prevent repeated setup annoyance.

**Cons:**
- Keeps memory-specific copy in core, conflicting with feature-free core boundaries.
- Still launches even when memory package is absent unless extra guards are added.
- Hardens the wrong ownership shape.

**Complexity:** Low (~0.5 day)
- Files to modify: 2–3.
- Risk level: Medium due to architecture drift.

### Option 4: Manual `/nazar onboard` command

**How it works:**
Add explicit `/nazar onboard` (and maybe `/nazar setup --onboard`) to start or rerun the onboarding chat. Setup can offer to launch it after configuration, but the command provides a clear recovery path.

**Pros:**
- Established CLI pattern (`openclaw onboard`, `/init`, `/memory refresh`).
- Useful for users who skip initial onboarding.
- Easy to test with the same fake `sendUserMessage` pattern.

**Cons:**
- Alone, it does not solve first-use personalization unless setup still triggers or prompts for it.
- Needs careful command ownership if memory is optional.
- Should reuse provider-owned prompts to avoid duplicate prompt sources.

**Complexity:** Low-medium (~0.5–1 day)
- Files to modify: 2–4.
- Risk level: Low-medium.

## Comparison

| Criteria | Provider hook | Bootstrap sentinel | Harden trigger | `/nazar onboard` |
|----------|---------------|-------------------|----------------|------------------|
| Complexity | Medium | Medium | Low | Low-medium |
| Codebase fit | High | Medium-high | Medium | High |
| Integration risk | Low-medium | Medium | Medium | Low-medium |
| Migration cost | Low | Medium | Low | Low |
| Verification cost | Low-medium | Medium | Medium | Low-medium |
| Novelty | Low | Medium | Low-medium | Low |

## Recommendation

**Selected:** Provider-owned onboarding hook

**Rationale:**
- It preserves Nazar's registry-driven setup model: `SetupProvider` already owns package configuration/status (`setup-registry.ts:3`).
- It fixes the current ownership drift where core contains memory/Life OS text (`setup-use.ts:15`, `setup-use.ts:23`).
- It handles optional package install correctly: no memory provider means no memory onboarding.
- External precedent supports provider/plugin-owned setup: OpenClaw plugin/provider setup and Hermes memory provider setup both place domain-specific prompting/config in the provider layer.

**Why not alternatives:**
- Bootstrap sentinel: good future path, but too easy to overbuild and create unused artifacts before the simpler hook proves useful.
- Harden trigger: useful idempotency/preflight ideas, but keeps memory coupling in core.
- `/nazar onboard`: valuable as an explicit rerun command, but best built on the provider-owned prompt source rather than as the primary architecture.

**Trade-offs:**
- Accept a small `SetupProvider` API expansion for cleaner package ownership.
- Direct provider-send through existing `configure(pi, ctx)` would be the absolute KISS variant, but a core-collected hook wins because it can combine prompts once, centralize idempotency, isolate provider errors, and power `/nazar onboard` without duplicating prompt sources.
- Defer richer OpenClaw-style bootstrap files until there is a concrete read/write/clear path.

**Implementation approach:**
1. Add provider-owned onboarding descriptor to `SetupProvider`.
2. Move current memory/Life OS prompt text into `registerMemorySetupProvider()`.
3. Change core setup completion to collect prompts from selected providers and send one generic current-model onboarding message.
4. Add idempotency state: record prompted/skipped provider ids in an explicit setup config field (or a small private state file if we do not want setup config growth), skip already-prompted providers unless rerun is explicit.
5. Add optional launch preflight: “Start a short memory onboarding chat now?” with Start / Skip / Later.
6. Add `/nazar onboard` as a rerun command that uses the same provider prompt collection.

**Integration points:**
- `packages/core/code/extensions/nazar/setup-registry.ts:3` — optional onboarding field.
- `packages/core/code/extensions/nazar/setup-use.ts:160` — collect selected provider prompts.
- `packages/core/code/extensions/nazar/setup-use.ts:199` — add `/nazar onboard` branch.
- `packages/memory/code/extensions/memory/memory-setup.ts:64` — memory-owned prompt contribution.
- `packages/core/code/extensions/nazar/setup-store.ts:9` — minimal state for prompted/skipped provider ids if persisted in setup config.

**Patterns to follow:**
- Provider registry pattern: `packages/core/code/extensions/nazar/setup-registry.ts:3`.
- Safe UI guard pattern: `packages/core/code/extensions/nazar/setup-use.ts:143`.
- Memory-owned prompt injection pattern: `packages/memory/code/extensions/memory.ts:24`.
- Existing fake command/tool tests: `packages/core/code/tests/pi-core.test.mjs:60`.

**Risks:**
- Prompt duplication: mitigate by one combiner and provider ids.
- Provider errors: isolate and notify rather than failing setup.
- Repeated annoyance: persist prompted/skipped ids and provide explicit rerun.
- Over-personalization: keep consent text and “not a dossier” rule in provider prompt.

## Scope Boundaries

- Build provider-owned onboarding prompt contribution.
- Build one-time/skip/rerun behavior.
- Keep actual memory writes in model tools after user approval.
- Do not add a web setup portal.
- Do not add a full OpenClaw-style bootstrap file system yet.
- Do not auto-write user profile facts during setup without model/user confirmation.

## Testing Strategy

**Unit tests:**
- Core provider with onboarding prompt triggers one `sendUserMessage`.
- No provider prompt triggers no `sendUserMessage` and no memory-specific completion text.
- Provider prompt failure is isolated.
- Prompted provider ids suppress repeated onboarding.
- Explicit `/nazar onboard` reruns onboarding.

**Integration tests:**
- Memory setup provider contributes memory/Life OS prompt text from `@nazar/memory`.
- Core tests assert core no longer contains Life OS-specific strings.
- Headless setup does not start onboarding.

**Manual verification:**
- [ ] Fresh `/nazar setup memory` asks whether to start onboarding.
- [ ] Starting launches exactly one current-model chat.
- [ ] Skipping does not launch a chat.
- [ ] Rerunning setup does not re-prompt unless `/nazar onboard` is used.
- [ ] Core-only install does not mention `/memory` or Life OS.

## Open Questions

**Resolved during research:**
- Should package-specific onboarding live in core? No — the registry pattern and project instructions favor provider/package ownership.
- Is a one-time bootstrap ritual a known pattern? Yes — OpenClaw's bootstrap sentinel is direct precedent.
- Should memory distinguish user profile from general memory? Yes — Hermes uses `USER.md` vs `MEMORY.md`, and Nazar already has Life OS profile/goals/reflections versus pinned/durable memory.

**Requires user input:**
- Should setup auto-start onboarding after confirmation, or should it only show “run `/nazar onboard`”? Default recommendation: ask confirmation once, with Skip/Later.

**Blockers:**
- None for provider-owned hook.

## References

- `packages/core/code/extensions/nazar/setup-registry.ts:3` — current `SetupProvider` shape.
- `packages/core/code/extensions/nazar/setup-use.ts:15` — current core-owned onboarding prompt.
- `packages/core/code/extensions/nazar/setup-use.ts:33` — current `pi.sendUserMessage()` trigger.
- `packages/memory/code/extensions/memory/memory-setup.ts:64` — memory setup provider registration.
- `packages/memory/code/extensions/memory.ts:24` — memory-owned durable prompt injection precedent.
- [OpenClaw bootstrapping](https://docs.openclaw.ai/start/bootstrapping) — first-run ritual and one-question-at-a-time profile bootstrap.
- [OpenClaw onboard](https://docs.openclaw.ai/cli/onboard) — idempotent onboarding/rerun/reset behavior.
- [OpenClaw plugin setup](https://docs.openclaw.ai/plugins/sdk-setup) — plugin-owned setup contribution precedent.
- [Hermes persistent memory](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory) — `USER.md` / `MEMORY.md` separation.
- [Hermes memory provider plugin](https://hermes-agent.nousresearch.com/docs/developer-guide/memory-provider-plugin) — provider-owned memory setup precedent.

## Follow-up Analysis 2026-05-29T18:05:57+0300

**Prompt:** Memory should be part of Nazar canonical features; should `@nazar/memory` merge into `@nazar/core`?

**Short answer:** Treat memory as canonical, but do not full-merge the implementation into `@nazar/core` yet. Prefer a **canonical bundle/contract**: core owns Nazar-level setup/onboarding contracts, while `@nazar/memory` remains the canonical memory implementation package installed by default.

**Why:**
- Product-wise, memory is canonical: the README frames Nazar around memory and the quick start installs both `@nazar/core` and `@nazar/memory`.
- Architecture-wise, full merge fights the current boundaries: core is a setup shell/shared-helper package, memory owns its extension, tools, vault paths, Life OS state, skills, and tests.
- The current package graph is clean: memory depends on core; core does not depend on memory.
- Core tests explicitly protect the registry-driven, feature-free setup boundary.

**Full merge risks:**
- `@nazar/core` would absorb memory's extra peers (`typebox`, `@earendil-works/pi-ai`), commands, tools, compaction hook, durable prompt injection, vault scaffolding, Life OS state, and memory skill packaging.
- Tests/docs/package manifests would need broad rewrites.
- It would make future optional canonical features harder to keep modular.

**Recommended adjusted path:**
1. Keep `@nazar/memory` as a separate package, but document it as a **canonical Nazar package**, not an optional add-on.
2. Add a root/meta install path later, for example `@nazar/nazar` or a package bundle that installs/enables core + memory by default.
3. Move memory-specific onboarding text out of core into the memory setup provider.
4. Let core expose canonical contracts only: setup provider registry, onboarding descriptor, setup state, shared helpers.
5. If the public product needs one package, make `@nazar/memory` re-exported/bundled by a meta-package rather than physically folded into core.

**Verdict change:** The original recommendation still stands, but the wording should shift from “memory optional” to “memory canonical but separately packaged.” The provider-owned onboarding hook becomes even more valuable: it lets canonical memory feel first-class without making core a memory implementation package.
