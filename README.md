<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Nazar

> **Your personal wise companion that grows with you.**

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0--or--later-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A523.4-339933.svg)](./docs/INSTALL.md)
[![Pi package](https://img.shields.io/badge/pi-package-f2c14e.svg)](https://github.com/earendil-works)

Nazar is a sovereign, **local-first personal agent** that lives on your own box. It remembers
the facts of your life in durable Markdown memory, learns skills that act on them, and keeps
everything in open files you own. It ships as a single [Pi](https://github.com/earendil-works)
package — install it and its extensions, native skills, theme, persona, and local model load
themselves.

It is named for the *nazar* — the watchful blue eye of old Balkan fairy tales that wards off
the evil eye. Each new skill it learns is **one more eye** watching one more corner of your life.

> Your life is not a product. The record of your life — what you ate, where you walked, what
> you felt, who you love — should answer to you alone.

## What makes it different

Most personal AI is rented memory in someone else's cloud. Nazar is the opposite: a companion
whose source of truth is a **vault you own**.

- **Yours by construction** — journal, diet, sport, and durable facts live as plain Markdown
  in a vault you can read, `grep`, back up, and move. Your data never trains anyone's model.
- **Local model first** — the terminal defaults to a local model served by
  [`llamafile`](https://github.com/Mozilla-Ocho/llamafile). Personal context stays on the box
  unless you *deliberately* switch to a frontier model.
- **Two rails, one ethos** — **facts** ride a disposable SQLite FTS5 index over Markdown;
  **procedures** ride Pi's own native skill system. Each on the simplest rail that fits.
- **Grows by approval** — when a recurring need emerges, Nazar *suggests* a new skill; you
  approve; git records the change. No silent self-modification.
- **Terminal-first** — one live Pi session with a hand-built, old-school RPG terminal UI
  (the *Basm* pixel-art design language). No gateway service, no container stack, no cloud.

## Quick start

Requires **Node 23.4+** (Node 24 LTS recommended) — Nazar's memory index uses the built-in
`node:sqlite` FTS5, which is flag-free from 23.4.

```bash
# 1. Install Pi (the terminal agent runtime)
npm install -g --ignore-scripts @earendil-works/pi-coding-agent

# 2. Install Nazar as a Pi package
pi install npm:pi-nazar-studio

# 3. Run
pi
```

On first run the `local-llm` extension lazily downloads `llamafile` and the default GGUF model
and serves it on `127.0.0.1:8082`. Your private vault is created at `$VAULT_PATH`
(default `~/.local/share/nazar`). Full guide: **[docs/INSTALL.md](./docs/INSTALL.md)**.

## How it works

| Layer | What it is |
|---|---|
| **Extensions** (`extensions/`) | Pi registration + orchestration: brand/UI, terminal-font, persona, memory, vault, local-llm provider, channel gateway. |
| **Memory** (facts) | Plain Markdown under `vault/memory/`, indexed by a disposable FTS5 accelerator over title, body, tags, and `whenToUse`. Relevant notes are auto-recalled into each local turn. |
| **Skills** (procedures) | Pi-native skills under `skills/`, discovered and invoked with `/skill:name`. The agent can propose new ones for your approval. |
| **Local model** | Registered in-process from `models.json` by `extensions/local-llm.ts`; nothing is hand-seeded into your Pi config. |
| **Persona + rules** | `SYSTEM.md` (who Nazar is) and `AGENTS.md` (how the code is built), injected at `before_agent_start`. |

## Useful commands inside Pi

```txt
/reload                     reload extensions, skills, prompts, theme
/model                      switch model; frontier models are manual/opt-in
/local-llm                  manage the local llamafile + whisperfile runtime
/nazar-ui low|medium|high   switch terminal avatar rendering quality
/nazar-terminal-font        check/configure a terminal for high-fidelity avatars
/skill:doctor               run the health-check playbook
```

## Project layout

```
extensions/   Pi extensions — registration + orchestration only
lib/          Shared, unit-testable logic (memory, sqlite, paths, provider, ui/, gateways/)
skills/       Pi-native skills (doctor, open-websearch, terminal-font)
themes/       Generated Pi theme (nazar.json)
assets/       Avatar PNG masters + bundled fallback fonts
design/       The "Basm" design system: tokens, palette, avatar specs
docs/         Install, troubleshooting, persona, governance, security
scripts/      Dev tooling (token build, sprite generation, backup/restore)
models.json   Local provider + model registration
SYSTEM.md     Nazar's persona (injected into the system prompt)
AGENTS.md     Engineering conventions (injected into the system prompt)
```

## Documentation

- **[docs/INSTALL.md](./docs/INSTALL.md)** — install, local model, terminal setup, `.env` knobs.
- **[docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)** — runtime runbook.
- **[docs/PERSONA.md](./docs/PERSONA.md)** — Nazar's persona, philosophy, and oath.
- **[docs/SELF_EVOLUTION.md](./docs/SELF_EVOLUTION.md)** — how facts and skills grow.
- **[docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md)** — how to contribute (and the CLA).
- **[docs/SECURITY.md](./docs/SECURITY.md)** — how to report a vulnerability.
- **[docs/OPEN_CORE_BOUNDARY.md](./docs/OPEN_CORE_BOUNDARY.md)** — where the FOSS core ends.

## Develop

```bash
git clone https://github.com/alexradunet/nazar-studio.git
cd nazar-studio
npm install
npm run typecheck                 # tsc --noEmit
npm test                          # vitest
npm run build:tokens -- --check   # verify generated design tokens are in sync
pi -e .                           # load the working tree into Pi for one run
```

Engineering conventions live in **[AGENTS.md](./AGENTS.md)**. The design system is documented
in **[design/README.md](./design/README.md)**.

## License

[AGPL-3.0-or-later](./LICENSE). Your **vault** (personal data) is *not* in this repo — code
stays public, data stays yours. See **[NOTICE](./NOTICE)** for attributions.

Built in the open, in Brașov.
