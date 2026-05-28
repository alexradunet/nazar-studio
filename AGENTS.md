# Nazar public project instructions

This repository is the public source package for Nazar, a Pi-native local-first memory appliance built as an OS-agnostic TypeScript extension product.

Nazar follows the design philosophy of Pi (the minimal terminal coding agent by Mario Zechner): a small, transparent core with capability pushed into composable TypeScript extensions, skills, and CLI tools. We adopt the same restraint inside our own code. This file is injected into Pi's system prompt, so keep it lean and high-signal — add a rule only when it changes a real decision.

## Working style

- Prefer direct, practical implementation steps.
- Keep solutions KISS, inspectable, and reversible.
- Use TypeScript/JavaScript for Pi extension logic and product runtime code.
- Keep private memory, generated context, journals, rollups, OAuth tokens, WhatsApp auth state, and local model downloads out of git.
- Prefer Pi extension points, Agent Skills, and settings over wrapper scripts or Pi core patches.
- Keep host operating-system setup outside this repository; document only portable environment variables and extension-level configuration here.
- On Windows, install every Nazar host dependency through `winget` when a winget package exists; ask before using Chocolatey, Scoop, manual downloads, or ad-hoc installers.

## Product shape: Pi extension only

- Nazar always ships as a **Pi package of extensions** (`package.json` `pi.extensions` + `pi.skills`). Never build against Pi RPC mode or the Pi SDK/`pi-agent-core` runtime; never fork or patch Pi core.
- Stay within the documented extension surface only: `pi.registerTool`, `pi.registerCommand`, `pi.registerShortcut`, `pi.on(event)`, `pi.registerProvider`-style hooks, and `ctx.ui`. If Pi does not expose a seam for it, do not do it.
- **No MCP.** Pi deliberately omits MCP; mirror that. Expose capability as a CLI tool with a README (an Agent Skill) or as a registered tool, not an MCP server. The model pays the token cost only when it reads the skill (progressive disclosure).
- **No sub-agent frameworks, no permission gates, no bespoke plan/todo engines** baked into Nazar. These are Pi-core concerns; assemble from primitives if ever needed, and only when a concrete need exists.
- When adding behavior, first read the relevant Pi docs (`docs/extensions.md`, `docs/skills.md`, `docs/tui.md`) and the bundled examples, and follow the pattern Pi itself uses. Match Pi's conventions over inventing local ones.
- Keep context transparent: prefer durable state in version-controlled / on-disk files (memory pages, rollups, setup config) over hidden in-session state.

## Architecture patterns

- **Thin entry points.** Each `code/extensions/<name>.ts` is ~5–10 lines: import and call a `register<Name>Use(pi)` (or a default factory like `memory.ts`). No logic in entry files.
- **Small, single-purpose modules.** Split a feature into `paths.ts`, `<name>-use.ts`, `<name>-utils.ts`, `<name>-auth.ts`, etc. Pure/format/parse helpers live in `*-utils.ts` or `*-text.ts` so they are unit-testable without Pi or I/O. Treat a module past ~500 lines as a smell to decompose, not extend.
- **Shared helpers live in `code/extensions/shared.ts`.** Reuse `hasInteractiveUi`, `notify`, `showText`, `truncateToolOutput`, `truncateUtf8`, `toolError`, `errorMessage`, `trim`, the `xdg*` home resolvers, and `writePrivateFileSync`/`writePrivateJsonSync`. Do not re-implement these per extension.
- **Lifecycle events, used for their intent:** `before_agent_start` for cache-stable system-prompt injection; `session_compact` to refresh rollups; `session_shutdown` to release sockets/timers/widgets and reset native runtimes; `resources_discover` to contribute skills; `message_start`/`message_update`/`message_end` for streaming; `agent_end` for outbound replies. Always clean up in `session_shutdown`.
- **Tools:** `pi.registerTool` with `name`, `label`, `description`, `promptSnippet`, `promptGuidelines`, TypeBox `parameters`, and an `execute` that wraps its body in `try/catch` and rethrows via `toolError("<tool>", error)`. Use `StringEnum` (from `pi-ai`) for enum params (Google compatibility). Truncate tool output with `truncateToolOutput()` so it honors byte and line caps.
- **Commands and UI:** register `/commands` with `pi.registerCommand`. Branch on `ctx.hasUI` via `hasInteractiveUi(ctx)`; use `notify(ctx, text, level)` for notification-only output and `showText(ctx, widget, text, title, level)` when a widget should be set. Never call `ctx.ui.*` unguarded on the headless path.
- **Persistent state:** survive restarts via on-disk config (`writePrivateJsonSync`) or tool-result `details`/`pi.appendEntry()` — not module globals. A module-level singleton is acceptable only for trivial same-process coupling (see `remote-origin.ts`), documented as such.
- **Optional native dependencies** (`sherpa-onnx-node`, Baileys) load lazily: `createRequire(import.meta.url)` or `await import(...)`, never bare top-level `require`/`import`. A missing optional dep must never stop Pi from starting; surface a setup hint instead.
- **OS-agnostic by construction.** Centralize platform/`env` branching and inject it (e.g. `resolveSttInput({ platform, env })`) so resolution is unit-testable per OS. Resolve Windows/macOS/Linux (Pulse/ALSA) paths explicitly; gate `winget`/`ffmpeg`/`powershell` calls behind the right platform.

## Coding style

- **Erasable TypeScript only.** Tests run under `node --test` with type-stripping; do not use `enum`, `namespace`, constructor parameter properties, or other syntax that needs emit. Use `type`/`interface`, `as const`, and `StringEnum` instead.
- Prefer pure functions, early returns, and plain data over classes and inheritance. No premature abstraction or config "frameworks."
- Centralize configuration in `memory/paths.ts` and `nazar/setup-store.ts`. Resolve config lazily at call time (so `/nazar setup` + `/reload` is honored); never freeze derived paths at import time.
- Keep secret-bearing files private: write with `writePrivateFileSync` (`0600` files, `0700` dirs), redact secrets before persisting memory, and sanitize error messages to basenames (never leak full local paths).
- Comments explain non-obvious intent, trade-offs, or constraints — never narrate what the code already says.
- Prefer `winget`-installable, portable host dependencies; document env-var overrides rather than hardcoding machine paths.

## KISS / YAGNI / SUCKLESS rules

- **YAGNI:** do not generate write-only outputs, unused config knobs, or speculative directories/abstractions. If no code path reads it, do not write it (e.g. monthly rollups were removed for exactly this reason).
- **KISS:** the simplest correct option wins. Memoize on the hot path, but keep self-healing (cheap `existsSync` re-checks) so behavior stays obvious and recoverable.
- **SUCKLESS:** collapse duplicated boilerplate into one shared helper; delete dead code rather than commenting it out; keep each module doing one thing. One source of truth per concern.
- Deterministic, offline, free behavior is the default (e.g. the regex memory heuristic). Add LLM/network/nondeterministic paths only as opt-in, and document the trade-off in a comment.
- When in doubt, defer. Record deferred refactors below instead of growing scope mid-change.

## Testing & validation

- Tests are `code/tests/*.test.mjs` run with `node --test`. Cover pure helpers directly; for I/O use temp dirs + overridden `XDG_*`/`NAZAR_*` env, and a fake `pi.exec` for CLI-backed code.
- Make platform/native logic testable through injected seams (`resolve*ForTest({ platform, env })`) instead of mutating `process.platform`.
- Source-level assertions are acceptable to lock in structural invariants (e.g. truncation wiring, ESM-safe loading).
- Before declaring done, run: `npm test`, `npm run pack:dry`, and `git diff --check`. CRLF/LF warnings on Windows are expected and non-blocking.

## Known limitations & deferred work

- `memory/memory-use.ts` and `whatsapp/whatsapp-use.ts` are oversized; a pure decomposition into `rollups.ts`/`pinned.ts`/`journal.ts`/`sessions.ts`/`qmd.ts` (and a WhatsApp state split) is deferred — do it as a behavior-free refactor, not mixed with fixes.
- The memory-worthiness heuristic is English/verb-prefix-bound by design (deterministic + offline). An opt-in LLM summarizer is a possible future hook, not a default.
- Generated rollups are not QMD-indexed; monthly rollups are no longer generated (legacy files are left untouched).
- `truncateToolOutput()` uses the Pi SDK truncation helpers when present and a local byte+line fallback otherwise, because the SDK is a peer dependency not installed in this repo.
- Native-dependency surfaces (`sherpa-onnx-node`, Baileys) keep narrow local `any` boundaries; tighten only the fields actually touched.
- `remote-origin.ts` is an accepted same-process singleton for WhatsApp→Spotify attribution; revisit only if it must cross processes.
- Legacy `debrandMemoryText()` migration shim is scheduled for removal after 2026-08-01.

## Safety

- Do not expose SSH/RDP/remote desktop services to the internet without an explicit threat model and VPN/tunnel plan.
- Never commit secrets, raw session transcripts, private journals, OAuth callback URLs, access tokens, refresh tokens, or personal memory pages.
