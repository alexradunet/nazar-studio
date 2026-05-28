# Comprehensive Review Remediation Plan

## Source

- Review input: `docs/comprehensive-review-plan.md`
- Baseline: `main` at merge commit `11dda2be`

## Analysis Summary

The comprehensive review includes a mix of already-completed work, valid critical fixes, and high-churn refactors. For this pass, implement the safe/high-value remediation only and defer broad structural rewrites that do not directly fix a verified bug.

Already implemented before this pass:
- Spotify OAuth state validation.
- Spotify auth split into `spotify-auth.ts`.
- Shared XDG/private-write helpers in `shared.ts` and most consumer migration.
- Memory debranding simplification and trimmed vault scaffold.
- Lazy voice model directory resolution.
- Portable `node --test` script.

Deferred deliberately:
- Full `memory-use.ts` module split: high churn, no current bug depends on it.
- WhatsApp state-object rewrite: high churn; fix stale `ctxRef` directly.
- Shared spawn utility extraction: useful later, but local ffmpeg timeout/cap is safer for this pass.
- OAuth callback origin check: lower value because callback state validation already protects the flow.

## Phase 1 — Critical Runtime Fixes

Files:
- `code/extensions/nazar/setup-use.ts`
- `code/extensions/whatsapp/whatsapp-use.ts`
- `code/extensions/voice/tts-use.ts`

Changes:
- Import `hasInteractiveUi` in setup UI code.
- Add timeout and stdout cap to WhatsApp ffmpeg audio conversion.
- Clear TTS debounce timer during shutdown.
- Null WhatsApp `ctxRef` during shutdown/reload cleanup.

Success criteria:
- Setup extension imports without ReferenceError.
- Corrupt/large audio cannot hang or grow stdout unbounded forever.
- TTS timers do not survive session shutdown.
- WhatsApp UI context is not reused after shutdown.

## Phase 2 — Tool Hardening

Files:
- `code/extensions/memory.ts`
- `code/extensions/spotify/spotify-use.ts`
- `code/extensions/voice/tts-use.ts`

Changes:
- Truncate `memory_search` output at 50KB with an explicit suffix.
- Wrap tool `execute()` methods in `try/catch` and rethrow `tool_name: message` errors.
- Add prompt guidelines to `tts_toggle`.

Success criteria:
- Tool failures are concise and attributable.
- Memory search cannot flood LLM context with unbounded output.
- TTS tool advertises when it should be used.

## Phase 3 — Security Hardening

Files:
- `code/extensions/spotify/spotify-auth.ts`

Changes:
- Sanitize JSON state read errors to mention only the basename of state files, not full local paths.

Success criteria:
- Corrupt Spotify config/token/session errors remain actionable without leaking user directories.

## Phase 4 — Focused Tests

Files:
- `code/tests/pi-memory.test.mjs`
- `code/tests/pi-spotify.test.mjs`
- `code/tests/pi-voice.test.mjs`

Changes:
- Add test for memory tool output truncation helper.
- Add test for sanitized corrupt Spotify token-file errors.
- Add small TTS edge-case tests.

Success criteria:
- `node --test` passes.
- `npm test` passes.
- `npm run pack:dry` passes.
- `git diff --check` reports no actionable whitespace errors.
