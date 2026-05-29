---
date: 2026-05-29T18:33:54+0300
author: Alex Radu
commit: 6238334a
branch: main
repository: nazar
topic: "Nazar Termux always-on server setup"
tags: [plan, termux, android, grapheneos, setup, server, pi, runbook]
status: ready
parent: "user-directed Termux always-on install guide (option A)"
---

# Nazar on Termux Always-On Server Setup Plan

## Overview

Install Pi and Nazar (`@nazar/core` + `@nazar/memory`) from scratch on a Google
Pixel 6a running GrapheneOS + Termux, and run the phone as an **always-reachable
host** you SSH into to drive Pi/Nazar interactively inside a persistent `tmux`
session.

Two reality checks shape this plan and must be stated before any steps:

1. **Pi + Nazar is not a background daemon.** Pi is an interactive LLM coding
   agent and Nazar is a set of Pi extensions — the README states *"There is no
   separate daemon, no service to install."* It only does work when prompted,
   and every turn costs LLM tokens. "Always-on server" therefore means **option
   A: an always-reachable host** (phone stays awake + on the network running
   `sshd`, with a persistent `tmux` session you attach to), not a resident
   service. Scheduled autonomous maintenance is a separate opt-in (see *What
   We're NOT Doing* and the optional appendix).
2. **`@nazar/core` / `@nazar/memory` are not published to npm** (verified). The
   README's `pi install npm:@nazar/...` will not work. Install both packages
   from your local git clone as local paths — which is also the cleanest way to
   *maintain* Nazar (`git pull` to update).

This is a setup runbook expressed as sequential phases. Each phase carries an
explicit verification step so the box can be brought up and confirmed
independently.

## Desired End State

```txt
# From a laptop on the same tailnet / LAN:
ssh -p 8022 <termux-user>@<phone-host>
tmux new -A -s nazar
cd ~/nazar && pi -c
# inside pi:
/nazar status        # reports Nazar core + memory configured, vault resolved
/memory status       # reports memory paths and State dir
# detach with Ctrl-b d; pi keeps running; phone survives reboot into a reachable state
```

- Phone boots into a **reachable** state automatically (wake lock + `sshd`) via
  Termux:Boot, without auto-launching Pi.
- Pi and both Nazar packages are installed and listed by `pi list`.
- Auth + vault configuration live in `~/.bashrc` (API key out of git).
- Remote access is via Tailscale, not public port-forwarding.
- Updating is `git pull` + `npm install` for Nazar and `pi update --self` for Pi.

## What We're NOT Doing

- No Pi/Nazar daemon or system service — none exists; we do not invent one.
- **No auto-launch of Pi at boot.** Booting into an idle agent would burn a wake
  lock with nothing to do. The box boots into a *reachable* state; Pi is started
  by hand inside `tmux` when needed.
- No publishing of `@nazar/*` to npm; install strictly from the local clone.
- No public-internet exposure of SSH/RDP (per Nazar's safety rule); reachability
  beyond the LAN is via Tailscale only.
- No scheduled autonomous maintenance in the base plan. Nightly headless upkeep
  (`cron` + `pi -p "..."`) is documented as an optional appendix (option B) and
  is not part of the always-reachable-host objective.
- No changes to the Nazar codebase. This artifact is a setup runbook; it adds no
  files under `packages/*` and modifies no source.

## Phase 1: Termux base packages

### Overview
Install the Termux app family and the OS packages Pi/Nazar and the always-on
workflow depend on. Termux, Termux:API, and Termux:Boot must come from
F-Droid/GitHub — **not** the Play Store (that build is deprecated and Boot/API
behave differently).

### Steps:

```bash
# Install from F-Droid or GitHub releases (NOT Play Store):
#   - Termux
#   - Termux:API
#   - Termux:Boot
# Then, inside Termux:
pkg update && pkg upgrade -y
pkg install nodejs git openssh tmux termux-api -y
termux-setup-storage   # optional: grants /storage access if the vault lives there
```

### Success Criteria:

#### Automated Verification:
- [ ] `node --version` and `npm --version` print versions.
- [ ] `git --version`, `ssh -V`, `tmux -V` all succeed.
- [ ] `command -v termux-wake-lock` resolves (Termux:API present).

#### Manual Verification:
- [ ] Termux, Termux:API, and Termux:Boot are all installed from F-Droid/GitHub,
      not the Play Store.

---

## Phase 2: Install Pi

### Overview
Install Pi globally via npm with `--ignore-scripts` (per Pi's own Termux guide —
some native deps like the clipboard module are simply skipped on Android ARM64,
which is fine), and confirm the binary runs.

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

## Phase 4: Auth + vault environment

### Overview
Boot/headless contexts cannot run Pi's interactive `/login` OAuth flow, so
configure provider auth via an API-key env var and point Nazar at a vault. Keep
the key out of git.

### Steps:

```bash
cat >> ~/.bashrc <<'EOF'
export ANTHROPIC_API_KEY="sk-ant-..."     # or your provider's key
export NAZAR_HOME="$HOME/NazarVault"
export PI_SKIP_VERSION_CHECK=1            # optional: fewer startup network calls
EOF
source ~/.bashrc
```

Then scaffold the vault once interactively:

```bash
pi
# inside pi:
/nazar setup memory
/nazar status
```

### Success Criteria:

#### Automated Verification:
- [ ] `echo "$NAZAR_HOME"` prints the vault path in a fresh shell.
- [ ] The provider key env var is set in a fresh shell (`printenv | grep -q API_KEY`).

#### Manual Verification:
- [ ] `/nazar status` reports memory configured and the vault resolved under
      `NAZAR_HOME`.
- [ ] `/memory status` reports memory paths and `State dir`.
- [ ] The API key is present only in `~/.bashrc` / environment, never committed.

---

## Phase 5: GrapheneOS always-on settings

### Overview
GrapheneOS aggressively kills background apps; this is the phase that actually
determines whether the box stays reachable. Configure battery exemptions and a
CPU wake lock, and keep the phone charged.

### Steps:

- **Battery:** Settings → Apps → **Termux** (and **Termux:Boot**, **Termux:API**)
  → Battery → **Unrestricted**. Turn **off** "Pause app activity if unused" for
  Termux.
- **Keep it plugged in.** An always-on phone server should stay on charge.
- **Wake lock** keeps the CPU from dozing; it is acquired by the boot script in
  Phase 6 (`termux-wake-lock`, released with `termux-wake-unlock`).

### Success Criteria:

#### Automated Verification:
- [ ] `termux-wake-lock` runs without error (and `termux-wake-unlock` releases it).

#### Manual Verification:
- [ ] Termux, Termux:Boot, and Termux:API are all set to **Unrestricted** battery
      and have "Pause app activity if unused" disabled.
- [ ] The phone remains reachable after the screen is off for an extended period.

---

## Phase 6: Autostart on reboot (reachable state only)

### Overview
Use Termux:Boot to bring the phone up into a reachable state on reboot: acquire
the wake lock and start `sshd`. Deliberately do **not** launch Pi here.

### Steps:

```bash
mkdir -p ~/.termux/boot
cat > ~/.termux/boot/00-nazar-server.sh <<'EOF'
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
sshd          # SSH server on port 8022
EOF
chmod +x ~/.termux/boot/00-nazar-server.sh
```

### Success Criteria:

#### Automated Verification:
- [ ] `~/.termux/boot/00-nazar-server.sh` exists and is executable (`test -x`).

#### Manual Verification:
- [ ] After a full reboot (and unlocking the phone once, as Termux:Boot
      requires), `sshd` is listening on 8022 and the wake lock is held — with no
      Pi process started.

---

## Phase 7: SSH keys + persistent tmux session

### Overview
Set up key-based SSH and the Pi-recommended `tmux` extended-keys configuration,
then define the daily attach-or-create workflow.

### Steps:

On the phone, add your laptop's public key and configure tmux:

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
# append your laptop pubkey to ~/.ssh/authorized_keys, then:
chmod 600 ~/.ssh/authorized_keys
sshd

cat >> ~/.tmux.conf <<'EOF'
set -g extended-keys on
set -g extended-keys-format csi-u
EOF
```

Daily workflow from the laptop:

```bash
ssh -p 8022 <termux-user>@<phone-host>   # `whoami` on the phone = the user
tmux new -A -s nazar                     # attach-or-create the persistent session
cd ~/nazar && pi -c                       # -c continues last session
# detach with Ctrl-b d; pi keeps running in the background
```

### Success Criteria:

#### Automated Verification:
- [ ] `~/.tmux.conf` contains `extended-keys on`.

#### Manual Verification:
- [ ] Key-based SSH from the laptop succeeds without a password prompt.
- [ ] `tmux new -A -s nazar` attaches to the same session across reconnects, and
      Pi keeps running after `Ctrl-b d` detach.

---

## Phase 8: Reach it beyond the LAN with Tailscale

### Overview
Per Nazar's safety rule, do not expose SSH to the public internet. Use Tailscale
so the phone is reachable from anywhere over the tailnet (also solves
CGNAT/changing-IP).

### Steps:

- Install the **Tailscale** Android app (F-Droid/APK) and run `tailscale up`.
- SSH to the phone's tailnet IP/hostname from any device on the tailnet.

### Success Criteria:

#### Automated Verification:
- [ ] `tailscale status` (or `tailscale ip`) reports the phone is connected to the
      tailnet.

#### Manual Verification:
- [ ] SSH to the phone's tailnet address succeeds from off-LAN.
- [ ] `sshd` is **not** reachable via public-internet port-forwarding.

---

## Phase 9: Maintaining / updating

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
- [ ] After `git pull` + `npm install`, `pi list` still shows both Nazar
      packages and they load without import errors.
- [ ] `pi --version` reflects the updated Pi after `pi update --self`.

---

## Testing Strategy

### End-to-end smoke test
1. Reboot the phone; confirm it comes up reachable (wake lock + `sshd`) without a
   Pi process (Phases 5–6).
2. SSH in over the tailnet, attach the `tmux` session, run `pi -c` (Phases 7–8).
3. In Pi, run `/nazar status` and `/memory status`; confirm Nazar core + memory
   are configured and the vault resolves under `NAZAR_HOME` (Phases 3–4).
4. Detach (`Ctrl-b d`), drop the SSH connection, reconnect, and confirm the Pi
   session is still alive (Phase 7).

### Update test
- Run the Phase 9 update commands and re-run the smoke test; confirm `pi list`
  still shows both packages and Pi reports the new version.

## Appendix (optional, option B): Scheduled headless maintenance

Not part of the always-reachable-host objective. If autonomous nightly upkeep is
later desired (e.g. memory rollups via the `memory-janitor` skill), add `cron`
and a print-mode job. This needs the API key in the cron environment and costs
tokens on each run.

```bash
pkg install cronie -y && crond
# crontab -e, then e.g. nightly memory tidy:
# 0 3 * * *  cd ~/nazar && pi -p "Run memory-janitor: refresh rollups and tidy the vault" >> ~/nazar-cron.log 2>&1
```

## References

- Pi Termux setup: `@earendil-works/pi-coding-agent/docs/termux.md`
- Pi tmux setup: `@earendil-works/pi-coding-agent/docs/tmux.md`
- Pi packages (install/manage local paths): `@earendil-works/pi-coding-agent/docs/packages.md`
- `README.md` (no daemon / local-first / OS-agnostic)
- `AGENTS.md` (safety: no public SSH exposure without VPN/tunnel; local-path package install)
- `packages/core/package.json`, `packages/memory/package.json` (`pi.extensions` / `pi.skills`; `@nazar/memory` → `@nazar/core/*` imports)
