# Comprehensive Code Review & Improvement Plan for Nazar Studio

## Context

This plan results from a deep code review of the entire `@nazar/nazar-pi` codebase combined with analysis of the Pi SDK source code (`@earendil-works/pi-coding-agent` v0.76.0, `@earendil-works/pi-ai`, `@earendil-works/pi-tui`). The review found critical runtime bugs, Pi SDK best-practice violations, security concerns, and maintainability issues beyond what the existing `docs/code-review-plan.md` covers. This plan subsumes the existing 6-phase plan and adds 3 new phases for bugs, architecture hardening, and security.

---

## PHASE 0 — Critical Runtime Bugs (P0)

### 0.1 Missing import causes ReferenceError
- **File**: `code/extensions/nazar/setup-use.ts:13,82,87,92,336,359`
- **Bug**: `hasInteractiveUi` is used but never imported. Line 13 imports only `showText` from `../shared.ts`.
- **Fix**: Add `hasInteractiveUi` to the import on line 13.

### 0.2 ffmpeg spawn with no timeout (DoS/hang risk)
- **File**: `code/extensions/whatsapp/whatsapp-use.ts` — `convertAudioToPcm16()`
- **Bug**: `spawn("ffmpeg", ...)` has no timeout and stdout buffer is unbounded. Corrupt audio = process hangs forever.
- **Fix**: Add 30s `setTimeout` that kills child; cap stdout at `MAX_PCM_BYTES`.

### 0.3 Timer leak on mid-stream session shutdown
- **File**: `code/extensions/voice/tts-use.ts:36,262`
- **Bug**: `debounceTimer` set on `message_update`, only cleared on `message_end`. If session shuts down mid-stream, timer fires after context is invalid.
- **Fix**: Clear `debounceTimer` at the top of the `session_shutdown` handler.

### 0.4 Stale ctxRef after reload
- **File**: `code/extensions/whatsapp/whatsapp-use.ts:69,112`
- **Bug**: Module-level `ctxRef` becomes stale on session reload. try/catch mitigates crashes but UI silently fails.
- **Fix**: Explicitly null out `ctxRef` in `session_shutdown` handler.

**Commit**: `fix: resolve critical runtime bugs (missing import, timer leak, spawn timeout, stale ref)`

---

## PHASE 1 — Complete Shared Utility Migration (Safe Refactor)

`shared.ts` already exports: `hasInteractiveUi`, `showText`, `trim`, `xdgConfigHome`, `xdgDataHome`, `xdgStateHome`, `writePrivateFileSync`, `writePrivateJsonSync`, `chmodBestEffort`.

### 1.1 Verify all consumers import from shared.ts
- Grep for local definitions of `hasInteractiveUi`, `xdgConfigHome`, `xdgStateHome`, `xdgDataHome` outside `shared.ts` — remove any remaining duplicates.
- Known offenders: `whatsapp-utils.ts` (may still have local XDG), `memory/paths.ts` (may have local `dataHome`).

### 1.2 Remove redundant `chmodSync` calls
- Verify `setup-store.ts` and `spotify-auth.ts` use `writePrivateJsonSync`/`writePrivateFileSync` from shared (already done per code reading).

**Commit**: `refactor: complete shared utility migration`

---

## PHASE 2 — Architecture Hardening (Pi SDK Best Practices)

### 2.1 Add output truncation to memory_search tool
- **File**: `code/extensions/memory.ts:68-74`
- **Problem**: `searchMemoryText()` returns unbounded results. Pi docs: "Output must be truncated (50KB / 2000 lines) to prevent context overflow."
- **Fix**: Truncate at 50KB with `[Output truncated]` suffix.

### 2.2 Add error handling to all tool execute() methods
- **Files**: `code/extensions/memory.ts` (2 tools), `code/extensions/spotify/spotify-use.ts` (1 tool), `code/extensions/voice/tts-use.ts` (1 tool)
- **Problem**: Unhandled throws produce raw stack traces to the LLM.
- **Fix**: Wrap in try/catch, rethrow with `throw new Error(\`tool_name: ${msg}\`)`.

### 2.3 Add session_shutdown cleanup to voice/TTS
- **File**: `code/extensions/voice/tts-use.ts`
- **Problem**: No cleanup of event subscriptions or state on shutdown.
- **Fix**: Ensure `session_shutdown` resets `STATE`, clears timers, stops speech.

### 2.4 Add promptGuidelines to tools
- **Files**: `tts-use.ts`, `memory.ts`, `spotify/spotify-use.ts`
- **Problem**: Pi docs say `promptGuidelines` bullets must name the tool so the LLM knows when to invoke it.
- **Fix**: Add `promptGuidelines: ["Use memory_search when the user asks to recall..."]` etc.

**Commit**: `fix: add output truncation, error handling, and prompt guidelines to tools`

---

## PHASE 3 — Security Hardening

### 3.1 OAuth state validation (already implemented)
- Verified: `spotify-auth.ts` line 346-350 validates state parameter. No fix needed.

### 3.2 Sanitize file paths in error messages
- **File**: `code/extensions/spotify/spotify-auth.ts`
- **Fix**: Use `basename()` instead of full paths in error messages that flow to LLM context.

### 3.3 Add origin check on OAuth callback server (optional hardening)
- **File**: `code/extensions/spotify/spotify-auth.ts` — `waitForCallback()`
- **Fix**: Reject requests where `Origin` header is set and doesn't match localhost. Low priority since state parameter already prevents CSRF.

**Commit**: `security: sanitize paths in LLM-facing errors, harden OAuth callback`

---

## PHASE 4 — Split God Modules

### 4.1 Split `memory-use.ts` (1126 lines → 5 modules)

| New file | Responsibility |
|----------|---------------|
| `memory/rollups.ts` | Session parsing, daily/weekly/monthly markdown generation, date helpers |
| `memory/pinned.ts` | Pinned memory CRUD, section constants, template |
| `memory/qmd.ts` | QMD exec wrapper, collection specs, search, index management |
| `memory/secrets.ts` | Secret redaction patterns and `redactSecrets()` |
| `memory/memory-use.ts` | Command handler, tool registration, status text (imports above) |

### 4.2 Consolidate WhatsApp state into typed object
- **File**: `code/extensions/whatsapp/whatsapp-use.ts:69-96`
- **Fix**: Replace 20+ module-level `let` variables with single `const state: WhatsAppState = {...}`.

### 4.3 Verify spotify-auth.ts already extracted
- Already exists as separate file. Spotify split is done.

**Commits**: One per module split (3 total)

---

## PHASE 5 — Remove YAGNI / Simplify

### 5.1 Simplify `debrandMemoryText()`
- Replace obfuscated `"naz" + "ar"` concatenation with plain literal + expiry TODO.

### 5.2 Trim speculative vault directories
- Remove `ensureVaultScaffold()` dirs that no code reads/writes (ai-workbench/*, operator-log, templates, attachments, dashboards, maintenance).

### 5.3 Make sherpa-runtime.ts config lazy
- **File**: `code/extensions/voice/sherpa-runtime.ts:44-46`
- **Bug**: `modelRoot()` calls `readNazarSetupConfig()` on every invocation. The model path constants at lines 29-37 read env vars at import time.
- **Fix**: Make `ttsModelDir()` and `asrModelDir()` the canonical lazy resolvers (they already call `modelRoot()`). The env-var constants are fine since env is stable at process level.

**Commit**: `chore: simplify memory branding, remove speculative dirs, lazy config`

---

## PHASE 6 — Extract Spawn Utility

### 6.1 Create `code/extensions/spawn-utils.ts`

```ts
export function spawnCollect(command: string, args: string[], options?: {
  stdin?: Buffer;
  timeout?: number;
  maxOutput?: number;
  signal?: AbortSignal;
}): Promise<{ stdout: Buffer; stderr: string; code: number }>;
```

### 6.2 Replace inline spawn patterns
- `whatsapp-use.ts` — `convertAudioToPcm16()`
- `sherpa-runtime.ts` — `playWav()`, recording spawn

**Commit**: `refactor: extract shared spawn-collect utility with timeout and limits`

---

## PHASE 7 — Expand Test Coverage

### 7.1 New test cases for Phase 0 fixes
- Timer leak: verify debounceTimer cleared on shutdown
- Output truncation: verify memory_search truncates at 50KB
- spawn-utils: verify timeout kill + max-output cap

### 7.2 Expand existing tests
- `pi-spotify.test.mjs`: Add shouldRefreshToken boundary, corrupt token file
- `pi-whatsapp.test.mjs`: Add LID-based JID edge cases, inbound queue overflow with audio messages
- `pi-voice.test.mjs`: Single-word input, empty array edge cases

**Commits**: 2 (new tests, expanded tests)

---

## PHASE 8 — Documentation

### 8.1 Fix `.pi/README.md` hardcoded path
### 8.2 Update `package.json` test script to explicit glob
### 8.3 Archive `docs/code-review-plan.md` findings as completed

**Commit**: `docs: fix paths, update test script, mark review items done`

---

## Sequencing & Dependencies

```
Phase 0 (bugs)      → DO FIRST, no deps
Phase 1 (shared)    → after Phase 0
Phase 2 (arch)      → parallel with Phase 1
Phase 3 (security)  → independent
Phase 4 (splits)    → after Phase 1 (shared imports stable)
Phase 5 (YAGNI)     → after Phase 4 (smaller files)
Phase 6 (spawn)     → after Phase 0.2 (ffmpeg fix)
Phase 7 (tests)     → after Phases 4+6 (test new boundaries)
Phase 8 (docs)      → anytime
```

**Safe first PR**: Phases 0 + 1 + 2 + 3 (all bug fixes and hardening, no structural change)
**Second PR**: Phases 4 + 5 + 6 (refactoring, module splits)
**Third PR**: Phases 7 + 8 (tests and docs)

---

## Verification

After each phase:
1. `node --test code/tests/*.test.mjs` — full test suite passes
2. `node -e "import('./code/extensions/nazar.ts')"` (and each extension) — verify imports resolve
3. Manual: `/nazar-status`, `/memory`, `/spotify`, `/whatsapp status`, `/tts status` all respond

---

## NPM Install Fix

The auth error is from a global `.npmrc` with a stale token. Fix with:
```bash
npm install --registry https://registry.npmjs.org
```
Or create a project-level `.npmrc`:
```
registry=https://registry.npmjs.org
```
