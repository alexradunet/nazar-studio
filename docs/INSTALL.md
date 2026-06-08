<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Install Nazar

Nazar is a **self-contained Pi package** (`pi-nazar-studio` on npm). Installing it makes Pi auto-load
Nazar's extensions, skills, theme, persona, and local model — nothing is hand-seeded into your Pi
config.

- `pi` opens the live session with Nazar loaded.
- Mozilla `llamafile` serves the local model on `127.0.0.1:8082` via the `local-llm` extension,
  which registers the `llamafile` provider in-process.
- The private vault lives at `$VAULT_PATH` (default `~/.local/share/nazar`).

There is intentionally **no core HTTP gateway / `nazar-agent` user service**. Future channels
should be Pi extensions attached to a long-lived terminal/tmux session.

## Requirements

- **Node 23.4+ (Node 24 LTS recommended).** Nazar's memory index uses the built-in `node:sqlite`
  (FTS5), which is flag-free from Node 23.4 and stable in Node 24.

## Quick start

```bash
# 1. Install Pi
npm install -g --ignore-scripts @earendil-works/pi-coding-agent

# 2. Install Nazar
pi install npm:pi-nazar-studio

# 3. Run
pi
```

Update or remove later:

```bash
pi update npm:pi-nazar-studio
pi remove npm:pi-nazar-studio
```

## What loads automatically

| Resource | Source | How it loads |
|---|---|---|
| Extensions | `extensions/` | `pi` manifest (memory, vault, personality, brand, local-llm) |
| Skills | `skills/` | `pi` manifest (`/skill:name`) |
| Theme | `themes/nazar.json` | `pi` manifest |
| Persona + rules | `SYSTEM.md`, `AGENTS.md` | injected at `before_agent_start` by `extensions/personality.ts` |
| Local provider/models | `models.json` | registered in-process by `extensions/local-llm.ts` |

## Configuration (all optional)

Nazar reads environment variables; sensible defaults apply when unset. See `.env.example` for the
full list. Common ones:

| Variable | Meaning |
|---|---|
| `VAULT_PATH` | private Markdown vault; default `~/.local/share/nazar` |
| `NAZAR_DATA_DIR` | runtimes/models/logs/index dir; default same as vault |
| `NAZAR_PERSONA` | set `0` to skip persona injection |
| `NAZAR_USER_NAME` | name shown on the user avatar panel |
| `NAZAR_UI_QUALITY` | avatar renderer quality: `low`, `medium` (default sextant), or `high` |
| `NAZAR_LLM_CTX` | local model context window (default 128000) |
| `NAZAR_LLM_REASONING_BUDGET` | LFM2.5 thinking budget before final answer (default 64) |
| `LLAMA_LOCAL_KEY` | local endpoint key (auto-generated at `<data dir>/run/local-llm.key`) |

## Local model

On first run the `local-llm` extension lazily downloads Mozilla `llamafile`, `whisperfile`, and the
supported GGUF model (`LiquidAI/LFM2.5-8B-A1B-GGUF`, file `LFM2.5-8B-A1B-Q4_K_M.gguf`) into the data dir, then serves `127.0.0.1:8082`. Check and manage it:

```bash
curl -s http://127.0.0.1:8082/health
```

```txt
/local-llm status
/local-llm start
/local-llm doctor
```

## Preferred terminal setup

Nazar Studio targets portable terminal standards. The preferred setup is:

- **Truecolor ANSI** (`COLORTERM=truecolor`, non-`dumb` `$TERM`).
- **Departure Mono** as the terminal font: https://departuremono.com/

The `/nazar-ui low|medium|high` command switches avatar quality live. The `/skill:doctor`
health check includes this terminal experience check; Nazar does not show it as a startup notice.

## Terminal font installer (optional, source checkout)

The vendored Cozette/Departure Mono fonts and their installer live in the repo (not the npm
tarball). From a `git clone` of this repo:

```bash
bash scripts/install-basm-terminal-fonts.sh
```

## Useful commands inside Pi

```txt
/reload          reload extensions, skills, prompts, theme
/model           switch model; frontier models are manual/opt-in
/login           sign in to a frontier provider, if wanted
/local-llm       manage the local llamafile + whisperfile runtime
/skill:doctor    run the doctor playbook
```

## Develop / self-maintain

From a `git clone` of this repo:

```bash
npm install
npm run typecheck
npm test
npm run smoke
pi -e .          # load the working tree into Pi for one run
```

Full guide: [`SELF_MAINTENANCE.md`](./SELF_MAINTENANCE.md).
