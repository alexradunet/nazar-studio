---
date: 2026-05-29T19:53:36+0300
author: Alex Radu
commit: 6238334a
branch: main
repository: nazar
topic: "Nazar Termux S25 primary host setup"
tags: [plan, termux, android, samsung-s25, obsidian, setup, primary-host, pi, runbook]
status: ready
parent: "user-directed Termux-first install on the Samsung S25 Ultra daily driver"
sibling: ".rpiv/artifacts/plans/2026-05-29_18-33-54_nazar-termux-always-on-server.md"
---

# Nazar on Termux: Samsung S25 Ultra Primary Host Setup Plan

## Overview

Install Pi and Nazar (`@nazar/core` + `@nazar/memory`) from scratch on a Samsung
S25 Ultra running Termux, and run that phone as the **interactive daily driver**
— development plus everyday Nazar access from one device, with a shared Obsidian
vault that both Nazar and the Obsidian Android app open as one folder.

This is the counterpart to the Pixel 6a runbook
(`2026-05-29_18-33-54_nazar-termux-always-on-server.md`, option A: a headless,
SSH-reachable always-on server). The S25 is the opposite role and the setup
diverges accordingly.

Three facts shape this plan and must be stated before any steps:

1. **"Termux-first" is a stance + docs + setup-default change, not a rewrite.**
   The Nazar extensions are OS-agnostic TypeScript on Node. To Node, Termux is
   just Linux — `packages/core/code/extensions/shared.ts` only special-cases
   `win32`; every other platform falls through to standard `$HOME`-based XDG
   paths, which already work on Termux. Nothing under `packages/*` must change to
   run well on the S25.
2. **`@nazar/core` / `@nazar/memory` are not published to npm** (verified). Install
   both packages from a local git clone as local paths — which is also how you
   *maintain* Nazar (`git pull` to update).
3. **The shared Obsidian vault must live on Android shared storage.** Termux's
   `$HOME` (`/data/data/com.termux/...`) is app-private, so the Obsidian app
   cannot see a vault placed there. After `termux-setup-storage`, point the vault
   at shared storage (e.g. `~/storage/shared/NazarVault` =
   `/storage/emulated/0/NazarVault`) and open that same path in Obsidian.

## How this differs from the Pixel 6a always-on server

| Concern | Pixel 6a (option A, always-on server) | S25 Ultra (this plan, daily driver) |
| --- | --- | --- |
| Role | Headless reachable host | Interactive daily driver |
| `sshd` / Termux:Boot / wake-lock | Required | **Not needed** |
| Auth | API key in `~/.bashrc` (no interactive OAuth at boot) | **Interactive `/login` OAuth** — no API key on disk |
| Obsidian vault | Optional | **Core** — shared-storage vault both apps open |
| `tmux` | Persistent session you attach to | Optional convenience |

## Desired End State

```bash
# On the S25, in Termux:
cd ~/nazar && pi -c
# inside pi:
/nazar status        # reports Nazar core + memory configured, vault resolved under NAZAR_HOME
/memory status       # reports memory paths and State dir
```

- Pi and both Nazar packages are installed and listed by `pi list`.
- Provider auth is via Pi's interactive `/login` OAuth flow; **no API key in
  `~/.bashrc`**.
- The vault lives on shared storage and is opened identically by Nazar and the
  Obsidian Android app — your notes at the root, Nazar's generated content under
  `05_Nazar/`.

## What We're NOT Doing

- No `sshd`, no Termux:Boot, no wake-lock — this phone is used in the foreground,
  not reached remotely. (Those belong to the Pixel 6a server runbook.)
- No API key persisted to disk; interactive OAuth is used instead.
- No publishing of `@nazar/*` to npm; install strictly from the local clone.
- No changes to the Nazar codebase. This artifact is a setup runbook; it adds no
  files under `packages/*` and modifies no source.
- No Pixel 6a sync-server work. That second-phone role (SSH-reachable sync server)
  is explicitly deferred; this plan covers the S25 only.

## How Nazar shares one folder with Obsidian (grounded in `paths.ts`)

When a vault is set (`NAZAR_HOME` or `/nazar setup memory`), Nazar treats the
**vault root as your human Obsidian vault** and tucks machine-generated content
under `05_Nazar/`:

```37:47:packages/memory/code/extensions/memory/paths.ts
  const NAZAR_DIR = VAULT_DIR ? join(VAULT_DIR, "05_Nazar") : join(PROJECT_ROOT, "memory");
  const LLM_WIKI_DIR = join(NAZAR_DIR, "llm-wiki");
  const LLM_WIKI_PAGES_DIR = join(LLM_WIKI_DIR, "wiki");

  const MEMORY_ROOT = VAULT_DIR ? join(NAZAR_DIR, "runtime") : join(PROJECT_ROOT, "memory");
  const PAGES_DIR = VAULT_DIR || join(MEMORY_ROOT, "pages");
  const AI_PAGES_DIR = VAULT_DIR ? LLM_WIKI_PAGES_DIR : join(PAGES_DIR, "ai");
  const PERSONAL_PAGES_DIR = VAULT_DIR || join(PAGES_DIR, "personal");
```

So Obsidian opens the folder, sees your notes at the root plus a `05_Nazar/`
runtime folder — one folder, both apps.

**Trade-off to flag:** Android shared storage has no POSIX permission bits, so
the `0600`/`0700` privacy on vault files is lost there — any app with storage
permission can read the memory pages in the vault. Secrets stay safe regardless:
the OAuth token / `setup.json` live in `~/.config/nazar` and `~/.local/...`
(Termux-private), not in the vault.

## Open input before Phase 4

The vault step branches on one fact: **do you already have an Obsidian vault on
the S25 that Nazar should adopt, or should Nazar create a fresh `NazarVault`?**
Phase 4 covers both; pick the matching `NAZAR_HOME`.

## Phase 1: Termux base packages

### Overview
Install Termux + Termux:API from F-Droid/GitHub (**not** the Play Store; that
build is deprecated). Termux:Boot is **not** needed on the daily driver.

### Steps:

```bash
# Install from F-Droid or GitHub releases (NOT Play Store):
#   - Termux
#   - Termux:API
# Then, inside Termux:
pkg update && pkg upgrade -y
pkg install nodejs git termux-api -y
termux-setup-storage                       # grants ~/storage/shared for the shared vault
```

### Success Criteria:

#### Automated Verification:
- [ ] `node --version` and `npm --version` print versions.
- [ ] `git --version` succeeds.
- [ ] `ls ~/storage/shared` resolves (storage access granted).

#### Manual Verification:
- [ ] Termux and Termux:API are installed from F-Droid/GitHub, not the Play Store.

---

## Phase 2: Install Pi

### Overview
Install Pi globally via npm with `--ignore-scripts` (per Pi's Termux guide — some
native deps like the clipboard module are skipped on Android ARM64, which is
fine), and confirm the binary runs.

### Steps:

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
mkdir -p ~/.pi/agent
pi --version
```

### Success Criteria:

#### Automated Verification:
- [ ] `pi --version` prints a version.
- [ ] `~/.pi/agent` exists.

#### Manual Verification:
- [ ] `pi` launches into its TUI and can be quit cleanly.

---

## Phase 3: Clone Nazar and install both packages as local paths

### Overview
Clone the Nazar repo, run a root `npm install` to create the workspace symlink
(`node_modules/@nazar/core`) so `@nazar/memory`'s `@nazar/core/*` imports
resolve, then `pi install` both packages by absolute local path.

### Steps:

```bash
cd ~
git clone <your-nazar-repo-url> nazar
cd nazar
npm install                 # REQUIRED: links @nazar/core so @nazar/memory resolves it

pi install "$PWD/packages/core"
pi install "$PWD/packages/memory"
pi list                     # confirm both packages show up
```

Why the root `npm install` matters: `@nazar/memory` imports `@nazar/core/shared`,
`@nazar/core/setup`, and `@nazar/core/setup-registry`. The workspace install
creates the symlink those imports resolve through. Pi's peer deps (`pi-ai`,
`pi-tui`, `pi-coding-agent`, `typebox`) are provided by Pi at runtime, so they
are not installed here.

### Success Criteria:

#### Automated Verification:
- [ ] `pi list` includes both `@nazar/core` and `@nazar/memory`.
- [ ] `node_modules/@nazar/core` exists (workspace symlink present).

#### Manual Verification:
- [ ] `pi` starts with the Nazar extensions loaded and no import-resolution
      errors for `@nazar/core/*` in the startup output.

---

## Phase 4: Auth (interactive OAuth) + shared-storage vault

### Overview
Because this host is interactive, use Pi's `/login` OAuth flow — no API key on
disk. Point Nazar at a vault on shared storage so the Obsidian app can open it.

### Steps:

```bash
# Adopt an existing vault, OR create a fresh one — pick one path:
export NAZAR_HOME="$HOME/storage/shared/NazarVault"        # fresh vault
# export NAZAR_HOME="$HOME/storage/shared/<your-existing-vault>"   # adopt existing

# Persist only the vault location (NOT a key) for future shells:
echo 'export NAZAR_HOME="$HOME/storage/shared/NazarVault"' >> ~/.bashrc

pi
# inside pi:
/login                 # interactive OAuth — no API key in bashrc
/nazar setup memory    # point at the vault
/reload
/nazar status
/memory status
```

Then open `/storage/emulated/0/NazarVault` (the same path) as a vault in the
Obsidian Android app.

### Success Criteria:

#### Automated Verification:
- [ ] `echo "$NAZAR_HOME"` prints the shared-storage vault path in a fresh shell.
- [ ] No provider API key is present in `~/.bashrc` (`! grep -q API_KEY ~/.bashrc`).

#### Manual Verification:
- [ ] `/nazar status` reports memory configured and the vault resolved under
      `NAZAR_HOME`.
- [ ] `/memory status` reports memory paths and `State dir`.
- [ ] Obsidian opens the same folder and shows a `05_Nazar/` directory alongside
      your notes.

---

## Phase 5 (optional): tmux session persistence

### Overview
On the daily driver `tmux` is a convenience (survive Termux UI restarts), not a
requirement. Add Pi's recommended extended-keys config if you use it.

### Steps:

```bash
pkg install tmux -y
cat >> ~/.tmux.conf <<'EOF'
set -g extended-keys on
set -g extended-keys-format csi-u
EOF
# Then: tmux new -A -s nazar; cd ~/nazar && pi -c
```

### Success Criteria:

#### Manual Verification:
- [ ] `tmux new -A -s nazar` attaches to the same session across Termux restarts,
      and Pi keeps running after `Ctrl-b d` detach.

---

## Phase 6: Maintaining / updating

### Overview
Keep Nazar and Pi current. Local-path installs load in place, so updating Nazar
is a `git pull` plus a workspace `npm install`.

### Steps:

```bash
cd ~/nazar && git pull && npm install   # update Nazar
pi update --self                        # update Pi itself
```

### Success Criteria:

#### Manual Verification:
- [ ] After `git pull` + `npm install`, `pi list` still shows both Nazar packages
      and they load without import errors.
- [ ] `pi --version` reflects the updated Pi after `pi update --self`.

---

## Testing Strategy

### End-to-end smoke test
1. Launch `pi -c` in Termux on the S25 (Phases 2–3).
2. Confirm `/login` auth works and no API key is on disk (Phase 4).
3. Run `/nazar status` and `/memory status`; confirm Nazar core + memory are
   configured and the vault resolves under `NAZAR_HOME` (Phases 3–4).
4. In the Obsidian Android app, open the same shared-storage path; confirm your
   notes appear at the root and a `05_Nazar/` folder exists (Phase 4).

### Update test
- Run the Phase 6 update commands and re-run the smoke test; confirm `pi list`
  still shows both packages and Pi reports the new version.

## Deferred: Pixel 6a sync server

The second-phone role — a Pixel 6a running its own Nazar as an SSH-reachable sync
server for memory/data — is intentionally out of scope here. It is captured by
the always-on server runbook
(`2026-05-29_18-33-54_nazar-termux-always-on-server.md`). Sync mechanics between
the two phones (e.g. how the shared vault replicates) are a separate design
question to settle before standing up the second device.

## References

- Pi Termux setup: `@earendil-works/pi-coding-agent/docs/termux.md`
- Pi tmux setup: `@earendil-works/pi-coding-agent/docs/tmux.md`
- Pi packages (install/manage local paths): `@earendil-works/pi-coding-agent/docs/packages.md`
- `README.md` (no daemon / local-first / OS-agnostic)
- `AGENTS.md` (OS-agnostic by construction; local-path package install)
- `packages/memory/code/extensions/memory/paths.ts` (vault root + `05_Nazar/` layout)
- `packages/core/code/extensions/shared.ts` (only `win32` special-cased; Termux = Linux paths)
- `packages/core/code/extensions/nazar/setup-store.ts` (XDG config/state/data resolution)
- Sibling runbook: `.rpiv/artifacts/plans/2026-05-29_18-33-54_nazar-termux-always-on-server.md`
