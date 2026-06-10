# Balaur public project instructions

This repository is the public source package for Balaur, a local-first personal agent shipped as a Bun/Ink CLI named `balaur`.

Balaur follows a small-core, local-first design: a transparent runtime with capability pushed into composable TypeScript modules, Markdown skills, CLI tools, and client adapters. This file is injected into agent context, so keep it lean and high-signal — add a rule only when it changes a real decision.

## Working style

- Prefer direct, practical implementation steps.
- Keep solutions KISS, inspectable, and reversible.
- Use TypeScript/JavaScript for Balaur product runtime code.
- Use Bun as the default command surface: `bun install`, `bun run <script>`, and `bun <file>`. Do not use `npm` or `node` for routine Balaur work unless a concrete dependency forces it; if so, say why.
- If Bun is installed but not on `PATH`, prefer the explicit local path (`~/.bun/bin/bun`) over falling back to npm/node.
- Keep the private vault, generated context, journals, OAuth tokens, local model artifacts, and runtime credentials out of git.
- Prefer Balaur runtime modules, Markdown skills, package manifest settings, and documented hooks over wrapper scripts or framework patches.
- Keep host operating-system setup outside this repository; document only portable environment variables and extension-level configuration here.
- On Windows, install every Balaur host dependency through `winget` when a winget package exists; ask before using Chocolatey, Scoop, manual downloads, or ad-hoc installers.

## Product shape: Balaur CLI only

- Balaur ships as a standalone CLI named `balaur`, with a Bun/Ink interface and a Bun single-file build target.
- Use only `@earendil-works/pi-ai` and `@earendil-works/pi-agent-core` from the Pi ecosystem. Do not depend on `@earendil-works/pi-coding-agent`, Pi extensions, Pi themes, Pi TUI, Pi SDK sessions, or Pi package manifests.
- **No MCP.** Expose capability as Balaur runtime tools, CLI commands, or Markdown skills — not as MCP servers.
- **No sub-agent frameworks, no permission gates, no bespoke plan/todo engines** baked into Balaur. Assemble from primitives only when a concrete need exists.
- Keep context transparent: prefer durable state in on-disk files (Johnny Decimal vault entries, master conversation, compacted sub-conversations, skills, setup config) over hidden in-session state.

## Architecture patterns

- **Terminal avatar identity is native ANSI-only.** Balaur's daily terminal UI uses one portable renderer fed by canonical PNG sprite sheets. Keep only sextant and octant renderers; do not carry forward half-block output. Do not add terminal-specific image-protocol backends, runtime graphics dependencies, cache builders, or hand-maintained terminal art.
- **23×11 cells is the default avatar review target.** Design and judge avatars at 23 columns × 11 rows (`BALAUR_AVATAR_ROWS=11`, the default). Keep source art as 3×3, 9-frame PNG sheets with 256×256 frames; review generated ANSI instead of editing renderer output.
- **Focused runtime entry points.** CLI entrypoints live in `src/`. Keep entrypoints focused on orchestration; move reusable or testable logic into `lib/*.ts`.
- **Small, single-purpose modules.** Split features into modules such as `paths.ts`, `sqlite.ts`, `vault.ts`, runtime modules, or avatar/design helpers. Pure/format/parse helpers belong in `lib/` so they are unit-testable without Pi or I/O. Treat a module past ~500 lines as a smell to decompose, not extend.
- **Shared helpers live in `lib/`.** Reuse `lib/paths.ts`, `lib/sqlite.ts`, runtime helpers, and small focused modules instead of re-implementing path resolution, SQLite loading, or UI rendering per feature.
- **Runtime events:** keep `lib/runtime/events.ts` small and typed. Long-lived resources must have explicit cleanup through the runtime `close()` path.
- **Tools:** use `AgentTool` from `@earendil-works/pi-agent-core` with clear `name`, `label`, `description`, TypeBox `parameters`, and an `execute` that returns inspectable `content`/`details`. Keep tool output bounded and avoid leaking private paths or secrets.
- **Commands and UI:** implement Balaur slash commands in the runtime/Ink layer. Headless and piped-input paths must still be safe.
- **Persistent state:** survive restarts via on-disk vault/config/model files resolved lazily from `lib/paths.ts`, not module globals. Avoid module-level singletons except for trivial same-process coupling that is documented and not persisted.
- **OS-agnostic by construction.** Centralize platform/`env` branching and inject it so resolution is unit-testable per OS. Resolve Windows/macOS/Linux paths explicitly; gate host commands behind the right platform.

## Coding style

- **Erasable TypeScript only.** Do not use `enum`, `namespace`, constructor parameter properties, or other syntax that needs emit. Use `type`/`interface`, `as const`, and TypeBox/string literal unions instead.
- Prefer pure functions, early returns, and plain data over classes and inheritance. No premature abstraction or config "frameworks."
- Centralize path/config resolution in `lib/paths.ts` or the smallest relevant `lib/*` module. Resolve config lazily at call time so setup changes and reloads are honored; never freeze derived paths at import time.
- Keep secret-bearing files private where the code writes them; redact secrets before persisting vault entries; sanitize errors so they do not leak full local paths unnecessarily.
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

- Tests use Bun's native test runner (`*.test.ts` with `bun:test`) and run with `bun run test`. Cover pure helpers directly; for I/O use temp dirs + overridden env and fake Pi/exec seams.
- Make platform/native logic testable through injected seams instead of mutating `process.platform`.
- Source-level assertions are acceptable to lock in structural invariants (e.g. ESM-safe loading, skill frontmatter, UI rendering snapshots).
- Before declaring done, run the checks that match the change: `bun run typecheck` and `bun run test`. Run a skill validator when one exists for the changed skill format. Also run `git diff --check`. CRLF/LF warnings on Windows are expected and non-blocking.

## Known limitations & deferred work

- The active gateway smoke path is the Bun-native loopback REST API over `lib/runtime/gateway.ts` and `lib/runtime/events.ts`. Do not add heavy transport dependencies unless an adapter is explicitly enabled.
- `vault_search` uses a Johnny Decimal Markdown source plus a disposable `bun:sqlite` FTS5 accelerator; Markdown vault entries remain the source of truth.
- Vault auto-recall is not implemented yet. When added, keep secrets out of vault entries that may be sent to frontier/cloud providers.
- The vault uses `bun:sqlite` for the disposable FTS5 index.

## Safety

- Do not expose SSH/RDP/remote desktop services to the internet without an explicit threat model and VPN/tunnel plan.
- Never commit secrets, raw session transcripts, private vault entries, OAuth callback URLs, access tokens, refresh tokens, or local model credentials.

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
