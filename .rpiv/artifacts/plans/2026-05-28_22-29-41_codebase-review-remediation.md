---
date: 2026-05-28T22:29:41+0300
author: Alex Radu
commit: e27792ac
branch: main
repository: nazar
topic: "Nazar Codebase Review Remediation"
tags: [plan, review-remediation, extensions, memory, voice]
status: complete
parent: "user-supplied codebase review"
last_updated: 2026-05-28T22:45:49+0300
last_updated_by: Alex Radu
last_updated_note: "Implemented planned review remediation and validated tests"
---

# Nazar Codebase Review Remediation Implementation Plan

## Overview

Implement the low-risk/high-value portion of the supplied codebase review while keeping behavior stable. This pass fixes tool truncation standards, removes write-only monthly rollup generation, memoizes memory directory scaffolding, documents the deterministic memory heuristic, standardizes Sherpa native loading, adds an audio resolver test seam with macOS FFmpeg setup support, consolidates notification-only boilerplate, and removes stale package hygiene.

## Desired End State

- Tool outputs use a shared Pi-native truncation adapter that honors byte and line caps when the Pi SDK is available, with a local fallback for repository tests.
- Memory prompt injection no longer performs full vault scaffolding twice per turn after the first successful ensure for the active path set.
- Monthly rollups stop being generated because no prompt/search/status consumer reads them; legacy files are left untouched.
- The regex memory-worthiness heuristic is explicitly documented as deterministic, offline, English/verb-prefix-bound behavior.
- Sherpa loads optional native code through `createRequire(import.meta.url)` under an ESM voice package scope.
- Audio resolution can be unit-tested per platform, and Nazar setup can configure macOS FFmpeg avfoundation STT instead of only prompting for a manual command.
- Notification-only command branches use the shared `notify()` helper.
- Stale `code/extensions/websearch/node_modules/**` ignore entry is removed.

## What We're NOT Doing

- No full `memory-use.ts` god-module split in this pass; that remains a larger pure-decomposition follow-up once behavior changes land.
- No LLM-based memory summarizer; deterministic extraction remains default by design.
- No QMD indexing of generated rollups; monthly rollups are dropped instead.
- No broad typing rewrite for retired messaging adapter/Sherpa dynamic surfaces beyond touched seams.

---

## Phase 1: Shared Truncation and Hygiene

### Overview
Use a shared adapter for tool-output truncation and remove the stale ignore rule.

### Changes Required

- `code/extensions/shared.ts` — add async `truncateToolOutput()` that dynamically uses Pi SDK `truncateHead`/defaults when available, otherwise applies a local line+byte fallback. Keep `truncateUtf8()` for synchronous memory-context truncation.
- `code/extensions/memory.ts` — replace local 50KB constant and sync byte-only truncation with `await truncateToolOutput()`.
- `code/extensions/retired-media-control/retired-media-control-use.ts` — replace local 50KB constant and sync byte-only truncation with `await truncateToolOutput()`.
- `.gitignore` — remove `code/extensions/websearch/node_modules/**`.
- Tests — update source-level remediation tests and add fallback line-cap coverage.

### Success Criteria

#### Automated Verification
- [ ] `node --test code/tests/pi-memory.test.mjs code/tests/pi-review-remediation.test.mjs` passes.
- [ ] Tool truncation tests prove byte cap and line cap behavior.

#### Manual Verification
- [ ] Memory/retired media control tool outputs still include an explicit truncation suffix when truncated.

---

## Phase 2: Memory Rollup and Hot Path Cleanup

### Overview
Reduce per-turn filesystem churn and remove invisible monthly generation.

### Changes Required

- `code/extensions/memory/memory-use.ts` — memoize `ensureDirs()` by the active path set after successful creation.
- `code/extensions/memory/memory-use.ts` — remove `writeMonthly()` and monthly generation from compaction paths; leave legacy monthly files untouched.
- `code/extensions/memory/memory-use.ts` — stop creating the monthly rollup directory on ensure; status may still count legacy files if present.
- `code/extensions/memory/memory-use.ts` — add a comment above `isMemoryWorthy()` documenting the deterministic offline heuristic and its English/verb-prefix limits.
- Tests — assert no monthly directory is created/generated and that repeated prompt digest calls preserve behavior.

### Success Criteria

#### Automated Verification
- [ ] Memory rollup tests pass.
- [ ] Compaction output no longer reports monthly generation.
- [ ] Existing daily/weekly prompt digest behavior remains intact.

#### Manual Verification
- [ ] Existing monthly files, if any, are not deleted by the change.

---

## Phase 3: Voice Native Loading, Audio Resolver Seam, and macOS STT Setup

### Overview
Standardize optional native loading and make OS-specific audio resolution testable without changing Linux/Windows defaults.

### Changes Required

- `code/extensions/voice/package.json` — switch package scope to ESM so `.ts` voice modules import correctly.
- `code/extensions/voice/sherpa-runtime.ts` — use `createRequire(import.meta.url)` for `sherpa-onnx-node`.
- `code/extensions/voice/sherpa-runtime.ts` — add exported test-only resolver helpers with injectable platform/env/XRDP flags.
- `code/extensions/nazar/setup-use.ts` — add macOS FFmpeg avfoundation STT setup path.
- Tests — add import smoke, source assertion for `createRequire`, and resolver cases for custom, Windows unavailable, macOS STT/TTS, Linux pulse/ALSA.

### Success Criteria

#### Automated Verification
- [ ] `node -e "import('./code/extensions/voice/sherpa-runtime.ts').then(() => console.log('ok'))"` succeeds.
- [ ] Voice tests cover platform audio resolution without mutating `process.platform`.

#### Manual Verification
- [ ] macOS setup stores an FFmpeg command/args when FFmpeg and an audio device are available.

---

## Phase 4: Notification Helper Consolidation and Final Validation

### Overview
Collapse repeated notification-only UI/headless branches where it does not alter widget behavior, then validate the full package.

### Changes Required

- `code/extensions/shared.ts` — add `notify(ctx, text, level)` helper.
- `code/extensions/voice/voice-use.ts` — use `notify()` for notification-only branches; keep `showText()`/widget branches unchanged.
- `code/extensions/voice/tts-use.ts` — use `notify()` for notification-only branches; keep widget branches unchanged.
- `code/extensions/retired-messaging-bridge/retired-messaging-bridge-use.ts` — use `notify()` for notification-only branches; keep widget branches unchanged.

### Success Criteria

#### Automated Verification
- [ ] `npm test` passes.
- [ ] `npm run pack:dry` passes.
- [ ] `git diff --check` passes.

#### Manual Verification
- [ ] Headless commands still print text to stdout.
- [ ] Interactive notification levels remain info/warning/error as before.

## Testing Strategy

```sh
node --test code/tests/pi-memory.test.mjs code/tests/pi-review-remediation.test.mjs code/tests/pi-voice.test.mjs
node -e "import('./code/extensions/voice/sherpa-runtime.ts').then(() => console.log('ok'))"
npm test
npm run pack:dry
git diff --check
```

## Implementation Result

Implemented in the working tree on 2026-05-28.

- Shared tool-output truncation now routes through `truncateToolOutput()` with dynamic Pi SDK support and repository-local fallback.
- Monthly rollup generation was removed; legacy monthly files are left untouched and only counted in status.
- `ensureDirs()` is path-key memoized with cheap existence self-healing.
- Sherpa native loading uses `createRequire(import.meta.url)` and the voice package scope is ESM.
- Audio resolver test seams and macOS FFmpeg avfoundation setup were added.
- Notification-only branches in voice/TTS/retired messaging bridge use `notify()`.
- Stale websearch node_modules ignore entry was removed.

Validation completed:

```sh
npm test
node -e "import('./code/extensions/voice/sherpa-runtime.ts').then(() => console.log('ok'))"
npm run pack:dry
git diff --check
```

All passed. `git diff --check` emitted LF/CRLF normalization warnings only.

## Developer Context

- Subagent analysis found full `memory-use.ts` decomposition valid but high-churn; this pass records it as deferred rather than mixing it with behavior changes.
- Subagent review recommended dropping monthly generation over prompt-injecting/search-indexing generated rollups to avoid expanding context/search surface.
- The Pi SDK is a peer dependency and is not installed in this repo's local `node_modules`; `truncateToolOutput()` therefore uses dynamic loading with fallback so local tests remain self-contained.
- A stale async subagent attention notification for run `8b526076` was checked; `subagent status` reported no such async run.

## References

- User-supplied review in session.
- `.rpiv/artifacts/plans/2026-05-28_19-35-46_core-review-remediation.md`
- `.rpiv/artifacts/plans/2026-05-28_20-30-52_comprehensive-review-remediation.md`
