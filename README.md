<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Balaur

> **A sovereign local-first personal agent, run through `balaur`.**

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0--or--later-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A523.4-339933.svg)](./package.json)

Balaur is a Bun/Ink personal agent with a Johnny Decimal Markdown vault, skills, and one continuous life conversation. It uses `@earendil-works/pi-ai` for model/provider access and `@earendil-works/pi-agent-core` for the agent loop. It does **not** use Pi coding-agent, Pi extensions, Pi TUI, or MCP.

The name comes from the Romanian fairy-tale balaur: a dragon with multiple heads. Balaur keeps one main head: the master life conversation. Focused work happens as temporary sub-heads, created with `/branch`, then compacted and merged back into the master head with `/merge`. That constraint is intentional: one conversation, one scope, many focused branches when needed.

Your life is not a product. The record of your life should live in files you own.

## Current shape

- **CLI:** `balaur` / `bun run balaur`
- **UI:** Ink/React terminal interface with Balaur branding
- **Agent engine:** `pi-ai` + `pi-agent-core`
- **Vault:** Johnny Decimal Markdown under the Balaur data directory
- **Conversation:** one master conversation head, plus compactable branch sub-heads
- **Skills:** Markdown skills, including skills stored as vault entries with `kind: skill`
- **No MCP**
- **REST API gateway:** loopback Bun endpoint for exercising the runtime gateway contract

## Quick start

```bash
bun install
bun run balaur
```

Optional local REST API gateway:

```bash
bun run api
# POST http://127.0.0.1:8787/api/messages
# GET  http://127.0.0.1:8787/api/events?clientId=local
# Missing local models download during startup before the gateway accepts chat.
```

Useful commands in the chat:

```txt
/help             show TUI commands and shortcuts
/clear            clear the visible chat
/model            show current model/provider
/branch <title>   start a focused sub-conversation
/merge            compact and merge the active sub-conversation into master
/branches         show current branch state
/skill:name       apply a Markdown skill
/exit             quit
```

Useful TUI shortcuts:

```txt
Ctrl+C / Ctrl+D   quit
Ctrl+L            clear visible chat
Ctrl+U            clear input
Ctrl+A / Ctrl+E   move to start/end of input
← / →             move input cursor
Backspace/Delete  edit at cursor
```

Model selection currently uses:

```bash
BALAUR_MODEL=anthropic/claude-sonnet-4-20250514 bun run balaur
```

API keys are read from standard provider environment variables supported by `pi-ai`, or `BALAUR_<PROVIDER>_API_KEY`.

## Project layout

```txt
src/          CLI entrypoints (`balaur`, reindex) and Ink TUI components
lib/runtime/  Balaur runtime: event bus, gateway bridge, agent wrapper, master/branch conversation, skills
lib/tui/      Pure TUI state helpers
lib/vault.ts  Johnny Decimal Markdown vault + disposable SQLite FTS index
skills/       Built-in Markdown seed skills
assets/        Avatar/source PNG sprite sheets
lib/avatar/    ANSI avatar renderer: sextant + octant only
lib/design/    Shared React/Ink design tokens
lib/gateways/  Legacy transport source; active gateway contract lives in lib/runtime/gateway.ts
docs/adr/      Architecture decisions
```

## Development

```bash
bun run typecheck
bun run test
bun run reindex
```

Bun single-file target:

```bash
bun run build:balaur:bun
```

## Migration status

The Pi extension product has been removed from the active package/runtime. Avatar rendering, shared design tokens, and a provider-agnostic runtime gateway contract have been migrated into Pi-free modules. The first active gateway surface is a Bun-native loopback REST API; WhatsApp/Signal-style gateways can attach to the same contract later.

Do not reintroduce Pi coding-agent dependencies. See [ADR 0002](./docs/adr/0002-balaur-cli-with-pi-core-libraries.md).

## License

[AGPL-3.0-or-later](./LICENSE). Your private vault and conversations are not part of this repository.

Built in the open, in Brașov.
