# Nazar

> *The studio for your life.*

**Nazar** is an OS-agnostic [Pi.Dev](https://github.com/earendil-works/pi-coding-agent) extension suite for building a personal AI assistant that knows what you keep, remembers what matters, and helps you orchestrate your life. It runs on whatever operating system you want — Linux, Windows, macOS, immutable distros, hobby boards — and stores everything in a portable Obsidian vault you own.

Memory, voice, music, messaging, and your knowledge base — woven together as a single personal world.

---

## Overview

Nazar is a TypeScript Pi.Dev extension product packaged as `@nazar/nazar-pi`. It is intentionally:

- **OS-agnostic.** No NixOS, no Fedora, no Docker host assumptions. Install dependencies through the package manager of your platform. The extensions stay portable.
- **Local-first.** Your memory, transcripts, and state live on your machine in a portable Obsidian vault. Cloud integrations (Spotify, WhatsApp) are optional and explicit.
- **Pi-native.** Built on the Pi.Dev coding-agent extension API. The agent is a first-class part of your environment, not a chatbot bolted on the side.
- **Privacy-first.** Private memory, OAuth tokens, voice models, and runtime state stay out of git by default.

---

## What's in the suite

Five core extensions and two starter Agent Skills:

### Extensions

| Extension | Commands | What it does |
| --- | --- | --- |
| **`nazar`** | `/nazar-setup`, `/nazar-status` | Post-install setup and status across memory, voice, WhatsApp, and Spotify. |
| **`memory`** | `/memory`, `memory_status`, `memory_search` | Durable memory, generated rollups, searchable project knowledge. Ships with the integrated `memory-janitor` Agent Skill. |
| **`voice`** | `/tts`, `/voice`, `tts_toggle` | Text-to-speech and push-to-talk voice input. Local Sherpa-ONNX models, no cloud dependency. |
| **`spotify`** | `/spotify`, `spotify_control` | Spotify Web API control — play, queue, search, playlist management. |
| **`whatsapp`** | (bridge) | A minimal one-whitelisted-contact WhatsApp bridge via Baileys. |

### Skills

- **`github-manager`** — Agent Skill for managing GitHub repos and workflows.
- **`windows-setup`** — Windows-specific post-install helper for `winget`-installed dependencies.

---

## Quick start

### 1. Install Pi.Dev

Nazar runs as a set of extensions inside the [Pi.Dev coding agent](https://github.com/earendil-works/pi-coding-agent). Install Pi first per its docs.

### 2. Install Nazar

```sh
pi install @nazar/nazar-pi
```

This registers the five extensions in your Pi settings. WhatsApp and local voice use optional adapter dependencies; install them only on machines that need those features.

### 3. Point Nazar at your memory vault

Nazar uses an Obsidian-style vault as its long-term memory backend. Set `NAZAR_HOME` to your vault root:

```sh
export NAZAR_HOME="$HOME/NazarVault"
```

Then run setup inside the agent:

```
/nazar-setup memory
```

Nazar will scaffold a PARA-style vault structure if one doesn't exist:

```
NazarVault/
├── 00_Inbox/           # shared human/AI capture
├── 01_Projects/        # human-owned
├── 02_Areas/           # human-owned
├── 03_Resources/       # human-owned
├── 04_Archive/         # cold storage (excluded from search)
└── 05_Nazar/           # AI/system control plane
    ├── llm-wiki/
    │   └── wiki/       # Karpathy-style compiled wiki
    ├── runtime/        # generated state and rollups
    └── pinned-memory.md  # human-curated long-term facts (when using vault layout)
```

### 4. Verify

```
/nazar-status
```

You should see green checks for memory, voice, Spotify (if configured), and WhatsApp (if configured).

---

## Architecture

Nazar is opinionated about *where things live* but agnostic about *how the host machine is configured*.

**The Pi.Dev agent is the runtime.** Nazar registers commands and skills with the Pi extension API. There is no separate daemon, no service to install, no OS layer to provision.

**Your Obsidian vault is the database.** Personal memory (Projects, Areas, Resources) is yours and lives in your vault. The `05_Nazar/` directory is the AI/system control plane — generated runtime state, rollups, and the compiled "llm-wiki" knowledge layer.

**Extensions are TypeScript modules.** Each extension is a single `.ts` file plus an optional sub-directory for assets. Add or remove extensions by editing `.pi/settings.json`.

**Host setup is your problem.** Nazar does not ship installers, container images, or OS configuration. Install Node.js, QMD, audio helpers, GitHub CLI, etc. through your platform's package manager (`apt`, `dnf`, `brew`, `winget`, `nix-env`). Runtime assumptions belong in extension code, settings, or environment variables.

---

## Configuration

Common environment variables (set in your shell profile):

| Variable | Default | Purpose |
| --- | --- | --- |
| `NAZAR_HOME` | (none) | Root of the private Obsidian vault; memory paths derive from it |

If `NAZAR_HOME` and setup config are unset in a source checkout, Nazar may create a local `memory/` development fallback. That folder is ignored by git and is not part of the public package.

Extension-specific configuration (Spotify OAuth, WhatsApp pairing, voice model paths) is set through the respective `/spotify`, `/whatsapp`, `/voice` setup flows. No secrets are stored in git.

---

## Privacy and safety

Nazar is built around a strict public-private boundary:

- **In git:** code, tests, docs, templates, and public product documentation.
- **Out of git (always):** memory pages, generated rollups, raw transcripts, copied reports, OAuth tokens, WhatsApp auth state, local voice models, and personal Obsidian vaults.

Do not commit secrets. Do not commit raw session transcripts. Do not expose SSH/RDP services to the internet without an explicit VPN/tunnel plan.

---

## Status

Nazar is in **active development**. The five core extensions work end-to-end on Linux, Windows, and macOS. The Obsidian-backed memory layer is the current focus; roadmap items include richer multi-vault support, calendar/messaging integrations, and a managed-installer experience for non-developers.

---

## Background

Nazar is built by [Alex Radu](https://alexradu.net) as the studio I want to live and work in — a private, sovereign, AI-augmented personal environment that respects the data it learns from.

- Project home: [nazar.studio](https://nazar.studio) *(coming soon)*
- Source: [github.com/alexradunet/nazar-studio](https://github.com/alexradunet/nazar-studio)
- Author: [@alexradunet](https://github.com/alexradunet) · [alexradu.net](https://alexradu.net)

---

## Contributing

Issues, PRs, and ideas welcome. The codebase prefers KISS, inspectable, and reversible solutions. See `AGENTS.md` for working-style conventions used by both human and AI contributors.

---

## License

UNLICENSED. Public source for inspection and contribution; please ask before using in commercial products.
