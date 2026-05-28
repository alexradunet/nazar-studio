---
date: 2026-05-28T16:35:46.269Z
author: Alex Radu
commit: 5fb373e5
branch: main
repository: nazar
topic: "Core Review Remediation"
tags: [plan, core-review, extensions, tests]
status: ready
parent: "docs/code-review-plan.md"
last_updated: 2026-05-28T16:35:46.269Z
last_updated_by: Alex Radu
---

# Core Review Remediation Implementation Plan

## Overview

This plan turns the reviewed `docs/code-review-plan.md` into a KISS implementation pass that fixes verified correctness/hygiene issues, removes duplicated utility logic, adds missing test seams, and performs safe module extractions without destabilizing the extension package.

The goal is to improve maintainability while preserving current public command/tool behavior.

## Desired End State

- Shared cross-extension helpers live in `code/extensions/shared.ts`.
- Voice model paths are resolved lazily from current setup config instead of frozen at import time.
- TTS text normalization is testable as a pure module.
- Spotify auth/persistence is separated from playback command/API logic.
- WhatsApp QR overlay UI is separated from bridge/state logic.
- Memory rollups no longer inject hardcoded product-roadmap topic bullets.
- Vault scaffolding only creates directories used by the extension.
- Tests cover TTS text processing and Spotify auth helper behavior.
- Docs and package test command use the discovered `node --test` runner.

## What We're NOT Doing

- No behavior change to Pi commands, tool names, or package discovery resources.
- No deletion of existing user vault directories; scaffold changes only affect future creation.
- No full rewrite of memory rollup/pinned/QMD internals in this pass. The high-value safe extraction is vault scaffolding plus YAGNI removal; a deeper memory split can follow after this pass if desired.
- No WhatsApp continuous-listening/autoreply redesign.

---

## Phase 1: Correctness and Shared Foundation

### Overview

Fix the active fragility issues first and add a shared utility module so later extractions do not create more duplicated helpers.

### Changes Required

#### Shared extension helpers
**File**: `code/extensions/shared.ts`
**Changes**:
- Add `hasInteractiveUi()`.
- Add canonical `showText(ctx, widget, text, title, level)`.
- Add `trim()`.
- Add Windows-aware `xdgConfigHome()`, `xdgStateHome()`, and `xdgDataHome()`.
- Add private JSON/file write helper that creates parent dirs with `0700` and best-effort chmods files to `0600`.

#### Import shared helpers
**Files**:
- `code/extensions/nazar/setup-store.ts`
- `code/extensions/nazar/setup-use.ts`
- `code/extensions/memory/memory-use.ts`
- `code/extensions/spotify/spotify-use.ts`
- `code/extensions/voice/tts-use.ts`
- `code/extensions/voice/voice-use.ts`
- `code/extensions/whatsapp/whatsapp-use.ts`
- `code/extensions/whatsapp/whatsapp-utils.ts`

**Changes**:
- Replace duplicated `hasInteractiveUi`, `trim`, and path helper bodies.
- Import WhatsApp `maskPhone()` in setup instead of maintaining a divergent copy.
- Preserve existing command output and widget names.

#### Fix lazy voice model paths
**File**: `code/extensions/voice/sherpa-runtime.ts`
**Changes**:
- Remove import-time `SETUP_CONFIG`/`MODEL_ROOT` resolution.
- Resolve model root/model dirs from environment/setup config at call time.

#### Small hygiene fixes
**Files**:
- `code/extensions/nazar/setup-store.ts`
- `code/extensions/memory/paths.ts`
- `code/extensions/remote-origin.ts`
- `code/extensions/voice.ts`

**Changes**:
- Cache `getNazarDirs()` in `ensureSetupDirectories()`.
- Document `NAZAR_HOME` override semantics.
- Document the remote-origin coupling channel.
- Name the default voice extension export.

### Success Criteria

#### Automated Verification
- [ ] `npm test` passes.
- [ ] `node --test` passes.

#### Manual Verification
- [ ] Shared helper imports do not change existing command names, widget IDs, or user-facing command help.
- [ ] `sherpaModelStatus()` reflects setup config written after module import.

---

## Phase 2: Testable Text/Auth Seams

### Overview

Extract pure logic from large modules before broad refactors, then add focused tests.

### Changes Required

#### TTS text processing module
**File**: `code/extensions/voice-text.ts`
**Changes**:
- Move markdown normalization, path simplification, cleanup, long-text splitting, and stream chunk splitting out of `tts-use.ts`.
- Export pure functions for tests.

#### Spotify auth module
**File**: `code/extensions/spotify/spotify-auth.ts`
**Changes**:
- Move PKCE, config/token persistence, auth session, refresh-token, and local callback helpers out of `spotify-use.ts`.
- Export testable PKCE/config/token helpers without requiring network calls.

#### Tests
**Files**:
- `code/tests/pi-voice.test.mjs`
- `code/tests/pi-spotify.test.mjs`

**Changes**:
- Add TTS normalization and splitting tests.
- Expand Spotify tests to cover PKCE challenge output, config round-trip, token response conversion, and refresh skew behavior.

### Success Criteria

#### Automated Verification
- [ ] Voice tests validate markdown stripping, link text, code block removal, empty input, long sentence fallback, and stream chunk boundaries.
- [ ] Spotify tests validate auth helpers using temp XDG dirs and no network.
- [ ] Existing memory/WhatsApp/Spotify URL tests still pass.

#### Manual Verification
- [ ] TTS runtime behavior remains wired through `/tts` exactly as before.
- [ ] `/spotify auth-url`, `/spotify finish`, `/spotify login`, and playback commands remain registered.

---

## Phase 3: Safe Module Extractions and YAGNI Removal

### Overview

Address the maintainability findings with low-risk extractions and remove brittle hardcoded memory heuristics.

### Changes Required

#### WhatsApp QR overlay extraction
**Files**:
- `code/extensions/whatsapp/qr-overlay.ts`
- `code/extensions/whatsapp/whatsapp-use.ts`

**Changes**:
- Move `showQrOverlay()`/`closeQrOverlay()` and overlay serial/handle state into `qr-overlay.ts`.
- Keep pairing flow behavior unchanged.

#### Memory vault scaffold extraction and cleanup
**Files**:
- `code/extensions/memory/vault.ts`
- `code/extensions/memory/memory-use.ts`

**Changes**:
- Move vault scaffold constants and `ensureVaultScaffold()` into `vault.ts`.
- Stop creating unused speculative directories.
- Keep used directories: vault PARA dirs, `05_Nazar`, `llm-wiki/raw`, `llm-wiki/wiki`, runtime dirs managed by `memory-use.ts`.

#### Memory heuristic cleanup
**File**: `code/extensions/memory/memory-use.ts`
**Changes**:
- Remove `topicMemory()` injected bullets.
- Trim `USER_FEATURE_RE` to stable Nazar/Pi feature categories.
- Replace brand obfuscating string concat with plain literal and dated TODO.

### Success Criteria

#### Automated Verification
- [ ] Memory rollup tests continue passing after topic-bullet removal.
- [ ] WhatsApp tests continue passing after QR extraction.

#### Manual Verification
- [ ] New vault scaffolds do not create speculative workbench/dashboard/template directories.
- [ ] Generated rollups still include extracted user/assistant bullets and secret redaction.

---

## Phase 4: Docs, Test Runner, and Validation

### Overview

Make validation discoverable and remove stale machine-specific documentation.

### Changes Required

#### Documentation updates
**Files**:
- `.pi/README.md`
- `code/extensions/README.md`
- `code/tests/README.md`

**Changes**:
- Replace hardcoded `/home/nazar/nazar` with “repository root”.
- Document `node --test` as the standalone test command.

#### Package script
**File**: `package.json`
**Changes**:
- Replace individual test chain with `node --test`.

### Success Criteria

#### Automated Verification
- [ ] `npm test` uses `node --test` and passes.
- [ ] `npm run pack:dry` passes.

#### Manual Verification
- [ ] Final diff contains no secrets or private runtime state.
- [ ] Existing unrelated working-tree changes are preserved.

---

## Testing Strategy

### Automated

```sh
node --test
npm test
npm run pack:dry
```

### Manual Smoke Checks

```sh
pi --no-session --offline -p "/nazar-status"
pi --no-session --offline -p "/memory status"
pi --no-session --offline -p "/tts status"
pi --no-session --offline -p "/voice help"
pi --no-session --offline -p "/spotify help"
pi --no-session --offline -p "/whatsapp help"
```

## Migration Notes

No user data migration. New scaffold behavior only affects directories created in future runs. Existing vault directories remain untouched.

## Developer Context

- `docs/code-review-plan.md` was independently reviewed against the live codebase.
- `node --test` works in this repository on Windows/Git Bash and discovers all current tests.
- `node --test code/tests` fails because Node treats the directory argument as a module; do not use that form.

## References

- Review plan: `docs/code-review-plan.md`
- Current extension docs: `code/extensions/README.md`
- Current test docs: `code/tests/README.md`
