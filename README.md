# Nazar

> **Your personal guardian that grows with you.**
>
> ![alt text]([https://github.com/adam-p/markdown-here/raw/master/src/common/images/icon48.png](https://github.com/alexradunet/nazar-studio/blob/main/Screenshot_20260606_123152.png?raw=true) "Logo Title Text 1")




A sovereign, local-first AI companion that installs into Pi as a **single extension package**. It
runs on your own box, remembers what matters in a Markdown vault, grows a new skill — a new eye —
for every procedure you teach it, and serves its own local model. Your data stays yours.

→ **[nazar.studio](https://nazar.studio)** · [Design](design/README.md)

## Install

Nazar is a Pi package. Install Pi, then add Nazar:

```bash
# 1. Install Pi (the terminal coding harness)
npm install -g --ignore-scripts @earendil-works/pi-coding-agent

# 2. Install Nazar
pi install npm:pi-nazar-studio

# 3. Run Pi — Nazar's extensions, skills, theme, persona, and local model load automatically
pi
```

Requires **Node 23.4+ (Node 24 LTS recommended)**: Nazar's memory index uses the built-in
`node:sqlite` (FTS5), which is flag-free from Node 23.4 and stable in Node 24.

### Preferred terminal setup

Nazar Studio is designed for a modern terminal, not legacy ANSI fallbacks. The preferred setup is:

- **kitty >= 0.35.0** — lets Nazar lean into kitty protocol support as the canonical terminal path.
- **Truecolor ANSI** (`COLORTERM=truecolor`, non-`dumb` `$TERM`).
- **Departure Mono** as the terminal font: https://departuremono.com/

Kitty config example:

```conf
font_family      Departure Mono
bold_font        auto
italic_font      auto
bold_italic_font auto
font_size        13.0
disable_ligatures never
```

The `/skill:doctor` health check includes this terminal experience check; Nazar does not show it
as a startup notice.

Update or remove later:

```bash
pi update npm:pi-nazar-studio
pi remove npm:pi-nazar-studio
```

## What it gives you

- **Local/private model by default** — Mozilla `llamafile` (LiquidAI LFM2.5-8B-A1B Q4_K_M GGUF) on `127.0.0.1:8082`,
  registered as the only `llamafile` model in-process. Manage it with `/local-llm status|start|doctor`.
- **Manual opt-in frontier models** via `/login` + `/model`.
- **Markdown memory** backed by `node:sqlite` FTS5 — `memory_write`, `memory_search`, `memory_get`,
  `memory_duplicates`.
- **Life tracking** — `journal_add`, `diet_add`, `sport_add` into a Markdown vault you own.
- **Self-evolution** — turn a recurring procedure into a Pi-native skill with `skill_write`.
- **Persona + operating rules** injected automatically (the guardian eye voice).
- **Terminal avatar + design** — a compact ANSI UI and the Nazar theme.
- **Self-hosted speech** — local transcription via Mozilla `whisperfile`.

## Where your data lives

- **Vault** (`$VAULT_PATH`, default `~/.local/share/nazar`) — private Markdown: `memory/`,
  `journal/`, `diet/`, `sport/`, plus the disposable `node:sqlite` index under `.sqlite/`.
- **Runtimes & models** (`~/.local/share/nazar/`) — the local `llamafile`/`whisperfile` binaries
  and GGUF models, downloaded on first use.

Nothing is written into your global Pi config — the package registers its provider and injects its
persona at load.

## Package layout

```text
extensions/      memory · vault (journal/diet/sport) · personality · brand (avatar/design) · local-llm
lib/             memory engine (node:sqlite FTS5), paths, provider, terminal UI
skills/          Pi-native Markdown skills (doctor, open-websearch)
themes/          the Nazar theme
assets/          avatars + fonts
models.json      local llamafile provider/model catalog (registered in-process)
AGENTS.md SYSTEM.md   persona + operating rules (injected each turn by extensions/personality.ts)
```

## Develop

```bash
git clone https://github.com/alexradunet/pi-nazar-studio.git
cd nazar
npm install
npm test          # vitest: memory FTS5, terminal UI, skill gate
npm run typecheck # tsc --noEmit
npm run smoke     # Pi SDK import check
npm run reindex   # rebuild the vault memory FTS index
```

Try your local checkout in Pi without installing it (loads the package for one run):

```bash
pi -e .
```

Inside the terminal:

```txt
/reload          reload extensions/skills/theme/prompts
/model           switch model
/login           optional frontier login
/local-llm       manage the local llamafile + whisperfile runtime
/skill:doctor    run the doctor playbook
```

## Docs

- [Install](docs/INSTALL.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Self-maintenance](docs/SELF_MAINTENANCE.md)
- [Self-evolution](docs/SELF_EVOLUTION.md)
- [Design](design/README.md)

## Privacy stance

Personal data stays in the vault by default. The local model is the default. Frontier models are
manual and opt-in; private memory is auto-recalled only on local models. Set `NAZAR_PERSONA=0` to
skip persona injection on a given run.
