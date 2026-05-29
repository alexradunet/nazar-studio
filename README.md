# Nazar

> *The studio for your life.*

**Nazar** is an OS-agnostic [Pi.Dev](https://github.com/earendil-works/pi-coding-agent) extension suite for building a personal AI assistant that knows what you keep, remembers what matters, and helps you orchestrate your life. It runs on whatever operating system you want — Linux, Windows, macOS, immutable distros, hobby boards — and stores everything in a portable Obsidian vault you own.

Memory and your knowledge base — woven together as a single personal world.

---

## Overview

Nazar is a TypeScript Pi.Dev extension product currently shipped as two canonical Pi packages: `@nazar/core` and `@nazar/memory`. Memory is part of the default Nazar product experience, but it remains separately packaged so core stays a small setup shell and future capabilities can stay modular. It is intentionally:

- **OS-agnostic.** No NixOS, no Fedora, no Docker host assumptions. Install dependencies through the package manager of your platform. The extensions stay portable.
- **Local-first.** Your memory and generated state live on your machine in a portable Obsidian vault. Networked integrations are deferred until they are essential.
- **Pi-native.** Built on the Pi.Dev coding-agent extension API. The agent is a first-class part of your environment, not a chatbot bolted on the side.
- **Privacy-first.** Private memory, OAuth tokens, and runtime state stay out of git by default.

---

## What's in the suite

Two Pi packages, with one memory-maintenance Agent Skill:

### Extensions

| Extension | Commands | What it does |
| --- | --- | --- |
| **`@nazar/core`** | `/nazar setup`, `/nazar onboard`, `/nazar status`, `/nazar-setup`, `/nazar-status` | Post-install setup/status shell, synced Pi session setup, and shared helpers. |
| **`@nazar/memory`** | `/memory`, `memory_status`, `memory_search` | Durable memory, generated rollups, searchable project knowledge. Ships with the integrated `memory-janitor` Agent Skill. |

### Skills

- **`memory-janitor`** — Agent Skill bundled with `@nazar/memory` for memory-vault curation and durable knowledge hygiene.

---

## Quick start

### 1. Install Pi.Dev

Nazar runs as a set of extensions inside the [Pi.Dev coding agent](https://github.com/earendil-works/pi-coding-agent). Install Pi first per its docs. For Android, see the [Termux setup guide](docs/termux.md).

### 2. Install Nazar

```sh
pi install npm:@nazar/core
pi install npm:@nazar/memory
```

Install both canonical packages for the local-first memory appliance.

### 3. Point Nazar at your memory vault

Nazar uses an Obsidian-style vault as its long-term memory backend. Set `NAZAR_HOME` to your vault root:

```sh
export NAZAR_HOME="$HOME/NazarVault"
```

Then run setup inside the agent:

```
/nazar setup all
```

For memory-only setup, use `/nazar setup memory`. For synced Pi conversations, use `/nazar setup sessions`; this configures Pi's `sessionDir`, adds host-local shell exports for `NAZAR_HOME` and `PI_CODING_AGENT_SESSION_DIR`, and adds a `nazar` shortcut pointing at your checkout.

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
    ├── session/        # Pi JSONL conversations when /nazar setup sessions is enabled
    └── pinned-memory.md  # human-curated long-term facts (when using vault layout)
```

### 4. Verify

```
/nazar status
```

You should see setup status for the installed Nazar packages.

---

## Architecture

Nazar is opinionated about *where things live* but agnostic about *how the host machine is configured*.

**The Pi.Dev agent is the runtime.** Nazar registers commands and skills with the Pi extension API. There is no separate daemon, no service to install, no OS layer to provision.

**Your Obsidian vault is the database.** Personal memory (Projects, Areas, Resources) is yours and lives in your vault. The `05_Nazar/` directory is the AI/system control plane — generated runtime state, rollups, and the compiled "llm-wiki" knowledge layer.

**Packages are TypeScript modules.** Each package ships raw `.ts` Pi extensions plus optional skills/assets. Add or remove capabilities by installing or removing the corresponding Pi package.

**Host setup is your problem.** Nazar does not ship installers, container images, or OS configuration. Install Node.js and any optional tools you personally need through your platform's package manager (`apt`, `dnf`, `brew`, `winget`, `nix-env`). Runtime assumptions belong in extension code, settings, or environment variables.

---

## Configuration

Common environment variables (set in your shell profile):

| Variable | Default | Purpose |
| --- | --- | --- |
| `NAZAR_HOME` | (none) | Root of the private Obsidian vault; memory paths derive from it |

If `NAZAR_HOME` and setup config are unset in a source checkout, Nazar may create a local `memory/` development fallback. That folder is ignored by git and is not part of the public package.

Extension-specific configuration is set through the respective setup flows. No secrets are stored in git.

### Synced sessions

Run `/nazar setup sessions` on each host that should share Pi conversation history. It writes host-local Pi settings and a managed shell-profile block equivalent to:

```sh
export NAZAR_HOME="$HOME/Nazar"
export PI_CODING_AGENT_SESSION_DIR="$NAZAR_HOME/05_Nazar/session"
alias nazar='cd "$HOME/src/nazar" && pi'
```

The same setup also maintains host-local context files under `~/.pi/agent/`:

- `AGENTS.md` — standard Nazar host-context instructions loaded by Pi.
- `current_host.md` — the current machine's local environment, role, constraints, paths, and sync notes. This file is intentionally outside the synced vault and is not shared between devices.

Nazar core appends `current_host.md` to the system prompt when present, while `AGENTS.md` points assistants to the file for host-specific decisions.

Use Syncthing to sync the whole `NAZAR_HOME` vault between devices, not only the session folder, and enable file versioning. Avoid actively continuing the same live Pi session on two devices at once; let sync settle, then resume elsewhere.

---

## Privacy and safety

Nazar is built around a strict public-private boundary:

- **In git:** code, tests, docs, website files, templates, and public product documentation.
- **Out of git (always):** memory pages, generated rollups, copied reports, OAuth tokens, runtime credentials, and personal Obsidian vaults.

Do not commit secrets. Do not commit raw session transcripts. Do not expose SSH/RDP services to the internet without an explicit VPN/tunnel plan.

---

## Status

Nazar is in **active development**. The core and memory packages work end-to-end on Linux, Windows, and macOS. The Obsidian-backed memory layer is the current focus; roadmap items include richer multi-vault support and a managed-installer experience for non-developers.

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
