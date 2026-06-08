# Nazar public project instructions

This repository is the public source package for Nazar, a Pi-native local-first memory appliance built as an OS-agnostic TypeScript extension product.

Nazar follows the design philosophy of Pi (the minimal terminal coding agent by Mario Zechner): a small, transparent core with capability pushed into composable TypeScript extensions, skills, themes, and CLI tools. We adopt the same restraint inside our own code. This file is injected into Pi's system prompt, so keep it lean and high-signal — add a rule only when it changes a real decision.

## Working style

- Prefer direct, practical implementation steps.
- Keep solutions KISS, inspectable, and reversible.
- Use TypeScript/JavaScript for Pi extension logic and product runtime code.
- Keep private memory, generated context, journals, OAuth tokens, local model artifacts, and runtime credentials out of git.
- Prefer Pi extension points, Agent Skills, package manifest settings, and documented hooks over wrapper scripts or Pi core patches.
- Keep host operating-system setup outside this repository; document only portable environment variables and extension-level configuration here.
- On Windows, install every Nazar host dependency through `winget` when a winget package exists; ask before using Chocolatey, Scoop, manual downloads, or ad-hoc installers.

## Product shape: Pi package only

- Nazar ships as one Pi package from this repository: `package.json` declares `pi.extensions` (`./extensions`), `pi.skills` (`./skills`), and `pi.themes` (`./themes`). Do not introduce a `packages/*` workspace unless the codebase actually needs that split.
- Never build against Pi RPC mode or the Pi SDK/`pi-agent-core` runtime; never fork or patch Pi core.
- Stay within the documented extension surface only: `pi.registerTool`, `pi.registerCommand`, `pi.registerShortcut`, `pi.on(event)`, provider-style hooks, and `ctx.ui`. If Pi does not expose a seam for it, do not do it.
- **No MCP.** Pi deliberately omits MCP; mirror that. Expose capability as a CLI tool with a README (an Agent Skill) or as a registered tool, not an MCP server. The model pays the token cost only when it reads the skill (progressive disclosure).
- **No sub-agent frameworks, no permission gates, no bespoke plan/todo engines** baked into Nazar. These are Pi-core concerns; assemble from primitives if ever needed, and only when a concrete need exists.
- When adding behavior, first read the relevant Pi docs (`docs/extensions.md`, `docs/skills.md`, `docs/tui.md`) and bundled examples, then follow the pattern Pi itself uses. Match Pi's conventions over inventing local ones.
- Keep context transparent: prefer durable state in version-controlled / on-disk files (memory pages, skills, setup config) over hidden in-session state.

## Architecture patterns

- **Terminal avatar identity is native ANSI-only.** Nazar's daily terminal UI uses one portable renderer fed by canonical PNG sprite sheets: `low` = half-block, `medium` = sextant, `high` = octant. Do not add terminal-specific image-protocol backends, runtime graphics dependencies, cache builders, or hand-maintained terminal art.
- **23×11 cells is the default avatar review target.** Design and judge role/tool avatars at 23 columns × 11 rows (`NAZAR_AVATAR_ROWS=11`, the default). Keep source art as 3×3, 9-frame PNG sheets with 256×256 frames; review generated ANSI with `npm run review:avatars` instead of editing renderer output.
- **Focused extension entry points.** Extension files live in `extensions/*.ts`. Keep them focused on Pi registration and orchestration; move reusable or testable logic into `lib/*.ts` and `lib/ui/*.ts`.
- **Small, single-purpose modules.** Split features into modules such as `paths.ts`, `provider.ts`, `sqlite.ts`, `memory.ts`, or UI render helpers. Pure/format/parse helpers belong in `lib/` so they are unit-testable without Pi or I/O. Treat a module past ~500 lines as a smell to decompose, not extend.
- **Shared helpers live in `lib/`.** Reuse `lib/paths.ts`, `lib/provider.ts`, `lib/sqlite.ts`, and `lib/ui/*` instead of re-implementing path resolution, provider probing, SQLite loading, or UI rendering per extension.
- **Lifecycle events, used for their intent:** `before_agent_start` for cache-stable system-prompt injection; `session_start` for startup checks/notifications; `session_shutdown` to release sockets/timers/widgets; `resources_discover` to contribute skills when needed; streaming events only for streaming behavior. Always clean up long-lived resources in `session_shutdown`.
- **Tools:** use `pi.registerTool` with clear `name`, `label`, `description`, TypeBox `parameters`, and an `execute` that returns inspectable `content`/`details`. Keep tool output bounded and avoid leaking private paths or secrets.
- **Commands and UI:** register `/commands` with `pi.registerCommand` only when a command is needed. Branch on `ctx.hasUI` before using `ctx.ui`; headless paths must still be safe.
- **Persistent state:** survive restarts via on-disk vault/config/model files resolved lazily from `lib/paths.ts`, not module globals. Avoid module-level singletons except for trivial same-process coupling that is documented and not persisted.
- **OS-agnostic by construction.** Centralize platform/`env` branching and inject it so resolution is unit-testable per OS. Resolve Windows/macOS/Linux paths explicitly; gate host commands behind the right platform.

## Coding style

- **Erasable TypeScript only.** Do not use `enum`, `namespace`, constructor parameter properties, or other syntax that needs emit. Use `type`/`interface`, `as const`, and TypeBox/string literal unions instead.
- Prefer pure functions, early returns, and plain data over classes and inheritance. No premature abstraction or config "frameworks."
- Centralize path/config resolution in `lib/paths.ts` or the smallest relevant `lib/*` module. Resolve config lazily at call time so setup changes and reloads are honored; never freeze derived paths at import time.
- Keep secret-bearing files private where the code writes them; redact secrets before persisting memory; sanitize errors so they do not leak full local paths unnecessarily.
- Comments explain non-obvious intent, trade-offs, or constraints — never narrate what the code already says.
- Prefer `winget`-installable, portable host dependencies; document env-var overrides rather than hardcoding machine paths.

## KISS / YAGNI / SUCKLESS rules

- **YAGNI:** do not generate write-only outputs, unused config knobs, or speculative directories/abstractions. If no code path reads it, do not write it.
- **KISS:** the simplest correct option wins. Memoize on the hot path, but keep self-healing (cheap `existsSync` re-checks) so behavior stays obvious and recoverable.
- **SUCKLESS:** collapse duplicated boilerplate into one shared helper; delete dead code rather than commenting it out; keep each module doing one thing. One source of truth per concern.
- **Pareto first:** start with the smallest 20% implementation likely to deliver 80% of the user value. Prove that thin slice end-to-end before adding power-user paths, abstractions, automation, or polish.
- Deterministic, offline, free behavior is the default. Add LLM/network/nondeterministic paths only as opt-in, and document the trade-off in a comment.
- When in doubt, defer. Record deferred refactors below instead of growing scope mid-change.

## Testing & validation

- Tests use Vitest (`*.test.ts`) and run with `npm test`. Cover pure helpers directly; for I/O use temp dirs + overridden env and fake Pi/exec seams.
- Make platform/native logic testable through injected seams instead of mutating `process.platform`.
- Source-level assertions are acceptable to lock in structural invariants (e.g. ESM-safe loading, skill frontmatter, UI rendering snapshots).
- Before declaring done, run the checks that match the change: `npm run typecheck`, `npm test`, `npm run skill-check` when skills changed, and `npm run smoke` for package/runtime wiring. Also run `git diff --check`. CRLF/LF warnings on Windows are expected and non-blocking.

## Known limitations & deferred work

- `extensions/local-llm.ts` is the largest extension module; if it grows further, split provider detection/runtime setup into behavior-free `lib/*` helpers instead of mixing refactors with fixes.
- `extensions/memory.ts` currently combines memory tools and `skill_write`; keep future changes surgical, or split only as a behavior-free refactor.
- `memory_search` uses the dependency-free local Markdown source plus a disposable `node:sqlite` FTS5 accelerator; Markdown pages remain the source of truth.
- The memory recall path auto-injects saved memory only for local/private models. Do not change that default without an explicit privacy review.
- Node's built-in `node:sqlite` is required for the FTS5 index; maintain the Node 23.4+ minimum and prefer Node 24 LTS in docs.

## Safety

- Do not expose SSH/RDP/remote desktop services to the internet without an explicit threat model and VPN/tunnel plan.
- Never commit secrets, raw session transcripts, private journals, OAuth callback URLs, access tokens, refresh tokens, local model credentials, or personal memory pages.

## Behavioral guidelines to reduce common LLM coding mistakes, derived from Andrej Karpathy's observations on LLM coding pitfalls

Tradeoff: these guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think before coding

Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity first

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical changes

Touch only what you must. Clean up only your own mess.

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that your changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the user's request.

### 4. Goal-driven execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

- "Add validation" → write tests for invalid inputs, then make them pass.
- "Fix the bug" → write a test that reproduces it, then make it pass.
- "Refactor X" → ensure tests pass before and after.

For multi-step tasks, state a brief plan:

1. Step → verify: check.
2. Step → verify: check.
3. Step → verify: check.

Strong success criteria let you loop independently. Weak criteria ("make it work") require clarification.
