<!-- Loaded by Pi as global context (~/.pi/agent/AGENTS.md) and injected into the system prompt by extensions/personality.ts. Persona & voice live in SYSTEM.md and docs/PERSONA.md. -->
# Nazar public project instructions
This repository is the public source package for Nazar, a Pi-native local-first memory appliance built as an OS-agnostic TypeScript extension product.
Nazar follows the design philosophy of Pi (the minimal terminal coding agent by Mario Zechner): a small, transparent core with capability pushed into composable TypeScript extensions, skills, and CLI tools. We adopt the same restraint inside our own code. This file is injected into Pi's system prompt, so keep it lean and high-signal — add a rule only when it changes a real decision.
## Working style
- Prefer direct, practical implementation steps.
- Keep solutions KISS, inspectable, and reversible.
- Use TypeScript/JavaScript for Pi extension logic and product runtime code.
- Keep private memory, generated context, journals, rollups, OAuth tokens, and runtime credentials out of git.
- Prefer Pi extension points, Agent Skills, and settings over wrapper scripts or Pi core patches.
- Keep host operating-system setup outside this repository; document only portable environment variables and extension-level configuration here.
- On Windows, install every Nazar host dependency through `winget` when a winget package exists; ask before using Chocolatey, Scoop, manual downloads, or ad-hoc installers.
## Product shape: Pi extension only
- Nazar ships as **Pi packages of extensions** under `packages/*` (`package.json` `pi.extensions` + `pi.skills` where applicable). Never build against Pi RPC mode or the Pi SDK/`pi-agent-core` runtime; never fork or patch Pi core.
- Stay within the documented extension surface only: `pi.registerTool`, `pi.registerCommand`, `pi.registerShortcut`, `pi.on(event)`, `pi.registerProvider`-style hooks, and `ctx.ui`. If Pi does not expose a seam for it, do not do it.
- **No MCP.** Pi deliberately omits MCP; mirror that. Expose capability as a CLI tool with a README (an Agent Skill) or as a registered tool, not an MCP server. The model pays the token cost only when it reads the skill (progressive disclosure).
- **No sub-agent frameworks, no permission gates, no bespoke plan/todo engines** baked into Nazar. These are Pi-core concerns; assemble from primitives if ever needed, and only when a concrete need exists.
- When adding behavior, first read the relevant Pi docs (`docs/extensions.md`, `docs/skills.md`, `docs/tui.md`) and the bundled examples, and follow the pattern Pi itself uses. Match Pi's conventions over inventing local ones.
- Keep context transparent: prefer durable state in version-controlled / on-disk files (memory pages, rollups, setup config) over hidden in-session state.
## Architecture patterns
- **Thin entry points.** Each `packages/<pkg>/code/extensions/<name>.ts` is ~5–10 lines: import and call `register<Name>Use(pi)`/provider registration only. No logic in entry files.
- **Small, single-purpose modules.** Split a feature into `paths.ts`, `<name>-use.ts`, `<name>-utils.ts`, `<name>-auth.ts`, etc. Pure/format/parse helpers live in `*-utils.ts` or `*-text.ts` so they are unit-testable without Pi or I/O. Treat a module past ~500 lines as a smell to decompose, not extend.
- **Shared helpers live in `@nazar/core/shared` (`packages/core/code/extensions/shared.ts`).** Reuse `hasInteractiveUi`, `notify`, `showText`, `truncateToolOutput`, `truncateUtf8`, `toolError`, `errorMessage`, `trim`, the `xdg*` home resolvers, and `writePrivateFileSync`/`writePrivateJsonSync`. Do not re-implement these per extension.
- **Lifecycle events, used for their intent:** `before_agent_start` for cache-stable system-prompt injection; `session_compact` to refresh rollups; `session_shutdown` to release sockets/timers/widgets; `resources_discover` to contribute skills; `message_start`/`message_update`/`message_end` for streaming; `agent_end` for outbound replies. Always clean up in `session_shutdown`.
- **Tools:** `pi.registerTool` with `name`, `label`, `description`, `promptSnippet`, `promptGuidelines`, TypeBox `parameters`, and an `execute` that wraps its body in `try/catch` and rethrows via `toolError("<tool>", error)`. Use `StringEnum` (from `pi-ai`) for enum params (Google compatibility). Truncate tool output with `truncateToolOutput()` so it honors byte and line caps.
- **Commands and UI:** register `/commands` with `pi.registerCommand`. Branch on `ctx.hasUI` via `hasInteractiveUi(ctx)`; use `notify(ctx, text, level)` for notification-only output and `showText(ctx, widget, text, title, level)` when a widget should be set. Never call `ctx.ui.*` unguarded on the headless path.
- **Persistent state:** survive restarts via on-disk config (`writePrivateJsonSync`) or tool-result `details`/`pi.appendEntry()` — not module globals. Avoid module-level singletons except for trivial same-process coupling that is documented and not persisted.
- **OS-agnostic by construction.** Centralize platform/`env` branching and inject it so resolution is unit-testable per OS. Resolve Windows/macOS/Linux paths explicitly; gate host commands behind the right platform.
## Coding style
- **Erasable TypeScript only.** Tests run under `node --test` with type-stripping; do not use `enum`, `namespace`, constructor parameter properties, or other syntax that needs emit. Use `type`/`interface`, `as const`, and `StringEnum` instead.
- Prefer pure functions, early returns, and plain data over classes and inheritance. No premature abstraction or config "frameworks."
- Centralize configuration in `packages/memory/code/extensions/memory/paths.ts` and `@nazar/core/setup`. Resolve config lazily at call time (so `/nazar setup` + `/reload` is honored); never freeze derived paths at import time.
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
- Tests are `packages/*/code/tests/*.test.mjs` run workspace-wide with `npm test`. Cover pure helpers directly; for I/O use temp dirs + overridden `XDG_*`/`NAZAR_*` env, and a fake `pi.exec` for CLI-backed code.
- Make platform/native logic testable through injected seams (`resolve*ForTest({ platform, env })`) instead of mutating `process.platform`.
- Source-level assertions are acceptable to lock in structural invariants (e.g. truncation wiring, ESM-safe loading).
- Before declaring done, run: `npm test`, `npm run pack:dry`, and `git diff --check`. CRLF/LF warnings on Windows are expected and non-blocking.
## Safety
- Do not expose SSH/RDP/remote desktop services to the internet without an explicit threat model and VPN/tunnel plan.
- Never commit secrets, raw session transcripts, private journals, OAuth callback URLs, access tokens, refresh tokens, or personal memory pages.
## Behavioral guidelines to reduce common LLM coding mistakes, derived from Andrej Karpathy's observations on LLM coding pitfalls.
Tradeoff: These guidelines bias toward caution over speed. For trivial tasks, use judgment.

1. **Think Before Coding** — don't assume, don't hide confusion, surface tradeoffs.
   Before implementing:
   - State your assumptions explicitly. If uncertain, ask.
   - If multiple interpretations exist, present them — don't pick silently.
   - If a simpler approach exists, say so. Push back when warranted.
   - If something is unclear, stop. Name what's confusing. Ask.
2. **Simplicity First** — minimum code that solves the problem, nothing speculative.
   - No features beyond what was asked.
   - No abstractions for single-use code.
   - No "flexibility" or "configurability" that wasn't requested.
   - No error handling for impossible scenarios.
   - If you write 200 lines and it could be 50, rewrite it.
   - Ask: "Would a senior engineer say this is overcomplicated?" If yes, simplify.
3. **Surgical Changes** — touch only what you must; clean up only your own mess.
   - Don't "improve" adjacent code, comments, or formatting.
   - Don't refactor things that aren't broken.
   - Match existing style, even if you'd do it differently.
   - If you notice unrelated dead code, mention it — don't delete it.
   - Remove imports/variables/functions that YOUR changes made unused; don't remove pre-existing dead code unless asked.
   - The test: every changed line should trace directly to the user's request.
4. **Goal-Driven Execution** — define success criteria, loop until verified.
   - "Add validation" → "Write tests for invalid inputs, then make them pass."
   - "Fix the bug" → "Write a test that reproduces it, then make it pass."
   - "Refactor X" → "Ensure tests pass before and after."
   - For multi-step tasks, state a brief plan: each step with its verification check.
   - Strong success criteria let you loop independently; weak criteria ("make it work") require constant clarification.
