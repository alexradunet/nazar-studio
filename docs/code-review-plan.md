# Nazar Studio — Code Review & Improvement Plan

> Review date: 2026-05-28
> Scope: full codebase review of `@nazar/nazar-pi` v0.1.0
> Principles: KISS · YAGNI · Suckless

---

## Summary of findings

The codebase is well-structured at the top level — thin extension entrypoints, solid privacy boundaries, good test coverage in memory rollups and secret redaction. However, several patterns violate KISS / YAGNI / Suckless:

- **6 copy-pasted utility functions** across extensions instead of a shared module
- **3 god-modules** over 900 lines each, mixing unrelated concerns
- **Hardcoded product-roadmap keywords** in regex heuristics that need constant maintenance
- **Inconsistent XDG path logic** with 5 separate implementations
- **A module-level config freeze** that can read stale config at import time
- **Obfuscated string-concatenation** in a legacy migration shim

This plan defines concrete, ordered work items to address each finding.

---

## Phase 1 — Extract shared utilities

Create `code/extensions/shared.ts` to eliminate cross-extension duplication.

### 1.1 — Extract `hasInteractiveUi()`

Currently copy-pasted into 6 files with identical logic (`ctx.hasUI !== false` / `ctx?.hasUI !== false`):

| File | Line |
|------|------|
| `nazar/setup-use.ts` | 27 |
| `voice/tts-use.ts` | 46 |
| `voice/voice-use.ts` | 48 |
| `memory/memory-use.ts` | 1094 |
| `spotify/spotify-use.ts` | 265 |
| `whatsapp/whatsapp-use.ts` | 110 |

Action: Single definition in `shared.ts`, import everywhere.

### 1.2 — Extract `showText()` and fix parameter order inconsistency

Three implementations with **different parameter orders** (latent bug risk):

| File | Signature |
|------|-----------|
| `memory/memory-use.ts:1098` | `showText(ctx, widget, text, title, level)` |
| `spotify/spotify-use.ts:269` | `showText(ctx, text, title, level)` — hardcoded widget |
| `nazar/setup-use.ts:31` | `show(ctx, title, text, level)` — **title/text swapped** |

Action: Define one `showText(ctx, widgetName, text, title, level)` in `shared.ts`. Update all call sites. Fix the swapped title/text in setup-use.ts.

### 1.3 — Extract XDG/Windows path helpers

Five separate implementations of `dataHome()` / `configHome()` / `stateHome()`:

| File | Functions |
|------|-----------|
| `nazar/setup-store.ts:41-67` | `getNazarDirs()` with full Windows AppData support |
| `memory/memory-use.ts:124` | `dataHome()` — Linux-only XDG |
| `spotify/spotify-use.ts:125-134` | `dataHome()`, `configHome()`, `stateHome()` — Linux-only XDG |
| `whatsapp/whatsapp-utils.ts:21-26` | `xdgConfigHome()`, `xdgStateHome()` — Linux-only XDG |

Action: Canonical `xdgDataHome()`, `xdgConfigHome()`, `xdgStateHome()` in `shared.ts` with Windows fallbacks (matching the setup-store pattern). All extension path helpers import from shared.

### 1.4 — Extract `trim()` helper

Duplicated in `memory-use.ts:921` and `voice-use.ts:43`, identical body: `(value ?? "").trim()`.

Action: Move to `shared.ts`.

### 1.5 — Consolidate `maskPhone()`

Two implementations with **different behavior**:
- `setup-use.ts:40` — returns `"configured"` for short numbers
- `whatsapp-utils.ts:68` — returns `"***XXXX"` for short numbers

Action: Keep the whatsapp-utils version (more informative), export from there, import in setup-use.ts. Remove the duplicate.

---

## Phase 2 — Split god-modules

### 2.1 — Split `memory-use.ts` (~1200 lines)

This single file handles: pinned memory CRUD, rollup generation (daily/weekly/monthly), QMD collection management, vault scaffolding, secret redaction, session JSONL parsing, topic extraction, journal entries, and the `/memory` command handler.

Split into:

| New module | Responsibility | Approximate lines |
|-----------|---------------|-------------------|
| `memory/rollups.ts` | Session parsing, `dailyMarkdown()`, `weeklyMarkdown()`, `monthlyMarkdown()`, `compactMemory()`, `isClosedDay()`, `isMemoryWorthy()`, `memoryBullet()`, `dedupeBullets()`, `debrandMemoryText()`, `topicMemory()` | ~300 |
| `memory/pinned.ts` | `readPinnedMemory()`, `addPinnedItem()`, `removePinnedItem()`, `addJournalEntry()`, pinned section constants and aliases | ~200 |
| `memory/vault.ts` | `ensureVaultStructure()`, vault directory constants, `VAULT_MEMORY_DIRS` | ~50 |
| `memory/qmd.ts` | `memoryCollectionSpecs()`, `qmd()` exec wrapper, `ensureQmdCollections()`, `memorySearch()`, scope types | ~200 |
| `memory/memory-use.ts` | Command handler, `registerMemoryUse()`, `memoryStatusText()`, wiring — imports from the above | ~400 |

### 2.2 — Extract Spotify OAuth module from `spotify-use.ts` (~900 lines)

| New module | Responsibility | Approximate lines |
|-----------|---------------|-------------------|
| `spotify/spotify-auth.ts` | PKCE helpers, `createAuthSession()`, `exchangeCode()`, `refreshToken()`, `spotifyLoginWithLocalCallback()`, local HTTP callback server, token load/save | ~300 |
| `spotify/spotify-use.ts` | API wrapper, command handler, tool registration, playback control — imports auth | ~600 |

### 2.3 — Extract WhatsApp QR overlay from `whatsapp-use.ts` (~1050 lines)

| New module | Responsibility | Approximate lines |
|-----------|---------------|-------------------|
| `whatsapp/qr-overlay.ts` | `showQrOverlay()`, `hideQrOverlay()`, serial tracking, TUI dimensions | ~100 |
| `whatsapp/whatsapp-use.ts` | Everything else — references qr-overlay for pairing flow | ~950 |

Also: consider collapsing the ~20 module-level mutable variables into a single `WhatsAppState` object. This makes state easier to reason about and reset:

```ts
const state: WhatsAppState = {
  socket: undefined,
  status: "disconnected",
  lastError: "",
  inboundQueue: [],
  turnSerial: 0,
  // ... etc
};
```

---

## Phase 3 — Remove YAGNI / simplify

### 3.1 — Simplify `topicMemory()` heuristics

`memory-use.ts:609-631` — hardcoded product-roadmap keywords (`"karpathy"`, `"xfce"`, `"gnome"`, `"kitty"`, `"chromium"`, `"os-agnostic"`, `"source of truth"`, `"zellij"`) embedded in code. These match specific past conversations and will need constant updating.

Options (pick one):
- **A) Remove entirely** — rollup quality is already good without injected topic bullets.
- **B) Move to a config file** — `code/extensions/memory/topic-rules.json` with keyword→bullet mappings, so additions don't require code changes.

Recommendation: **Option A** — remove. The existing `isMemoryWorthy()` + `memoryBullet()` pipeline already captures relevant decisions. Topic bullets add speculative summaries that duplicate what the rollup extraction already does.

### 3.2 — Simplify `isMemoryWorthy()` regex patterns

`memory-use.ts:65-68` — `USER_FEATURE_RE` contains niche terms like `"computer-use"`, `"desktop automation"`, `"vscodium"`, `"home appliance"`. These are product brainstorming terms, not durable feature categories.

Action: Trim to genuinely stable keywords: `memory`, `voice`, `tts`, `stt`, `wiki`, `qmd`, `pi extension`, `typescript`. Remove the rest — they're roadmap speculation baked into regex.

### 3.3 — Simplify or remove `debrandMemoryText()`

`memory-use.ts:574-590` — uses string concatenation to obfuscate the old brand name (`"naz" + "ar"`). This is anti-KISS. The function was added 2026-05-25 as a migration shim.

Action: Replace string concatenation with a plain literal and add a `// TODO: remove after 2026-08-01` expiry comment. The obfuscation serves no technical purpose.

### 3.4 — Trim speculative vault directories

`memory-use.ts:200-214` (inside `ensureVaultStructure()`) creates many directories that appear unused in the codebase:

```
ai-workbench/proposals
ai-workbench/drafts
ai-workbench/scratch
operator-log
templates
attachments
dashboards
maintenance
```

Action: Remove directories that no code reads from or writes to. Keep only what the extension actually uses: `pages/`, `pages/personal/`, `pages/ai/`, `rollups/`, `journal/`, `sources/`, and `05_Nazar/`.

### 3.5 — Simplify `remote-origin.ts`

20-line module that exists solely to share one mutable reference between WhatsApp and Spotify. It works but is an implicit coupling channel.

Action: No change needed now — it's minimal and functional. Document the coupling with a brief comment explaining why it exists and which extensions use it.

---

## Phase 4 — Fix bugs and fragility

### 4.1 — Fix module-level config freeze in `sherpa-runtime.ts`

`sherpa-runtime.ts:29` — `const SETUP_CONFIG = readNazarSetupConfig()` runs at import time. If voice is imported before setup completes, model paths are frozen to stale/empty values. The config is never re-read.

Meanwhile, `envValue()` at line 57 calls `readNazarSetupConfig()` on every invocation, making STT command dynamically resolved but model paths static. This is inconsistent.

Action: Make `MODEL_ROOT`, `TTS_MODEL_DIR`, `ASR_MODEL_DIR` lazy — resolve on first use rather than import time.

### 4.2 — Fix double `chmodSync` pattern

Both `setup-store.ts:133-137` and `spotify-use.ts:180-183` do:

```ts
writeFileSync(path, data, { mode: 0o600 });
chmodSync(path, 0o600);
```

The `chmodSync` is redundant (the mode is already set by `writeFileSync`). On Windows it's a no-op.

Action: Remove the redundant `chmodSync` calls.

### 4.3 — Fix `ensureSetupDirectories()` double-call

`setup-store.ts:141-146` calls `getNazarDirs()` inside a loop body, recreating the object on each iteration.

Action: Cache the result before the loop.

### 4.4 — Document `configuredUnlessEnvVault` behavior

`paths.ts:55` — when `NAZAR_HOME` env is set, setup config custom paths are silently ignored. This is intentional but surprising.

Action: Add a comment explaining the override semantics.

### 4.5 — Name the voice extension export

`voice.ts:6` — `export default function (pi: ExtensionAPI)` is anonymous, unlike all other extensions (`nazarExtension`, `spotifyExtension`, `whatsappExtension`).

Action: Name it `voiceExtension` for consistent stack traces.

---

## Phase 5 — Add missing tests

### 5.1 — Add TTS text normalization tests

The TTS pipeline has non-trivial text processing (`normalizeMarkdownForTts`, `cleanForTts`, `splitLongText`, `splitSpeakableChunks`) with zero test coverage.

Action: Create `code/tests/pi-voice.test.mjs` covering:
- Markdown stripping (headers, links, code blocks, bold/italic)
- Long text splitting at sentence boundaries
- Edge cases: empty input, single word, very long sentences
- Speakable chunk boundaries

### 5.2 — Add Spotify OAuth unit tests

`pi-spotify.test.mjs` is only 23 lines testing URL parsing. The PKCE flow, token refresh, and config persistence are untested.

Action: Add tests for:
- PKCE code verifier/challenge generation
- Token refresh logic (skew handling, error paths)
- Config load/save round-trip
- Callback URL parsing edge cases

### 5.3 — Add WhatsApp message filtering tests

The existing 61-line test covers basic filtering but not:
- Audio/image message extraction
- JID normalization edge cases for LID-based identifiers
- Inbound queue overflow behavior

Action: Expand `pi-whatsapp.test.mjs` with these cases.

---

## Phase 6 — Documentation fixes

### 6.1 — Fix `.pi/README.md` hardcoded path

Line 26 says `"restart Pi from /home/nazar/nazar"` — this is a machine-specific path.

Action: Change to `"restart Pi from the repository root"`.

### 6.2 — Add standalone test command to extension README

`code/extensions/README.md` validation section only references Pi-dependent commands. Add:

```sh
node --test code/tests/*.test.mjs
```

### 6.3 — Add `npm test` glob for discoverability

Currently `package.json` test script runs files individually. Consider using the `--test` flag with a glob:

```json
"test": "node --test code/tests/*.test.mjs"
```

---

## Dependency graph

```
Phase 1 (shared utils) → no dependencies
Phase 2 (split modules) → depends on Phase 1 (shared imports)
Phase 3 (YAGNI removal) → depends on Phase 2 (files will be smaller)
Phase 4 (bug fixes)     → independent, can run in parallel with 2-3
Phase 5 (tests)         → depends on Phase 2 (test the new module boundaries)
Phase 6 (docs)          → independent
```

Phases 1, 4, and 6 can be done in parallel.
Phases 2 and 3 are sequential (2 first, then 3).
Phase 5 follows after 2 to test the new structure.

---

## What NOT to change

These patterns are good — leave them alone:

- **Thin extension entrypoints** — clean separation of registration from logic
- **Secret redaction pipeline** — thorough, well-tested, correct
- **PKCE OAuth for Spotify** — no client secret, correct implementation
- **XDG + Windows AppData in setup-store.ts** — this is the canonical implementation to keep
- **Privacy boundary** — `.gitignore`, `.npmignore`, and code all correctly exclude private state
- **Memory-janitor Agent Skill** — well-written, SKILL.md-only, no code bloat
- **Landing page** — clean semantic HTML, no framework
- **Test infrastructure** — `node:test` with zero deps is correct and KISS
