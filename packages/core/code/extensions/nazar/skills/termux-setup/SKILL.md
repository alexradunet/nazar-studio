---
name: termux-setup
description: Use when the user asks to install, configure, audit, repair, or verify Nazar on Android/Termux, including Pi installation, Nazar checkout/package setup, Syncthing vault/session sync, host-local AGENTS.md/current_host.md, or Pixel/S25 mobile host roles.
---

# Nazar Termux Setup

Use this skill to guide or audit a Nazar installation on Android/Termux. It is intentionally operational: configure only the local host, keep private state out of git, and prefer reversible edits.

## Core rules

- Treat Termux setup as host-local. Do not write host-specific facts into the synced vault unless the user explicitly asks for a durable memory note.
- Never store secrets, tokens, private keys, raw transcripts, Syncthing device IDs, or private network addresses in docs, memory, `AGENTS.md`, or `current_host.md`.
- Do not expose SSH, Syncthing, RDP, or remote desktop services to the internet. Recommend LAN or VPN/tunnel such as Tailscale/WireGuard.
- Prefer Nazar's setup command when interactive Pi is available: `/nazar setup all` or `/nazar setup sessions`.
- If working non-interactively, make the same reversible host-local changes by editing files under `~/.pi/agent/` and the user's shell profile.
- Ask before installing packages or changing shell startup files unless the user explicitly asked you to configure/repair the host.

## Fast path

If the user asks to configure this Termux device and gives permission to make changes:

1. Confirm the intended role:
   - Pixel 6a always-on Syncthing hub; or
   - S25 Ultra mobile client/backup peer; or
   - another Termux host role.
2. Ensure packages are present:

   ```sh
   pkg update
   pkg install nodejs git openssh rsync termux-api syncthing
   npm install -g --ignore-scripts @earendil-works/pi-coding-agent
   ```

3. Ensure the source checkout exists when packages are not published/installed:

   ```sh
   mkdir -p "$HOME/src"
   git clone https://github.com/alexradunet/nazar-studio.git "$HOME/src/nazar"
   cd "$HOME/src/nazar"
   npm install
   ```

4. In Pi, prefer running:

   ```txt
   /nazar setup all
   ```

   Select `termux` for the host profile. If only repairing sessions/context, run:

   ```txt
   /nazar setup sessions
   ```

5. If doing setup by file edits, make these equivalent local changes:

   - Create `$HOME/Nazar/05_Nazar/session`.
   - Set Pi `sessionDir` in `~/.pi/agent/settings.json` to `$HOME/Nazar/05_Nazar/session` without deleting other settings.
   - Add a managed block to `~/.bashrc` or the user's chosen shell profile:

     ```sh
     # >>> Nazar setup
     # Managed by /nazar setup sessions. Rerun setup to refresh these host-local paths.
     export NAZAR_HOME="$HOME/Nazar"
     export PI_CODING_AGENT_SESSION_DIR="$NAZAR_HOME/05_Nazar/session"
     alias nazar='cd "$HOME/src/nazar" && pi'
     # <<< Nazar setup
     ```

   - Create or update `~/.pi/agent/AGENTS.md` with a standard pointer to `~/.pi/agent/current_host.md`.
   - Create or update `~/.pi/agent/current_host.md` with this device's role, OS/runtime, vault path, session path, checkout path, and constraints.

## Audit workflow

When the user asks you to check whether they followed all steps, do this evidence-first audit.

### 1. Detect Termux and tools

Run:

```sh
printf 'HOME=%s\nPREFIX=%s\nTERMUX_VERSION=%s\nSHELL=%s\n' "$HOME" "$PREFIX" "$TERMUX_VERSION" "$SHELL"
command -v node npm git pi syncthing termux-wake-lock termux-setup-storage 2>/dev/null
node --version 2>/dev/null
npm --version 2>/dev/null
pi --version 2>/dev/null
```

Expected Termux signs include `$PREFIX` containing `com.termux` or `$TERMUX_VERSION` being set.

### 2. Check Nazar checkout/package resources

For source-checkout installs:

```sh
test -d "$HOME/src/nazar/.git" && echo "checkout: ok" || echo "checkout: missing"
test -f "$HOME/src/nazar/.pi/settings.json" && echo "local pi settings: ok" || echo "local pi settings: missing"
```

If the user installed packages instead, use:

```sh
pi list 2>/dev/null
```

Expected packages/resources:

- `@nazar/core`
- `@nazar/memory`
- core extension loaded
- memory extension loaded
- `termux-setup` skill available after reload/restart

### 3. Check Nazar vault and sessions

Run:

```sh
printf 'NAZAR_HOME=%s\nPI_CODING_AGENT_SESSION_DIR=%s\n' "$NAZAR_HOME" "$PI_CODING_AGENT_SESSION_DIR"
test -d "${NAZAR_HOME:-$HOME/Nazar}" && echo "vault: ok" || echo "vault: missing"
test -d "${PI_CODING_AGENT_SESSION_DIR:-${NAZAR_HOME:-$HOME/Nazar}/05_Nazar/session}" && echo "session dir: ok" || echo "session dir: missing"
```

Inside Pi, also ask the user to run or inspect output from:

```txt
/nazar status
/memory status
/session
```

Expected:

- profile is `termux`;
- vault points at `$HOME/Nazar` or the user's chosen vault;
- Pi raw sessions point at `05_Nazar/session` after restart;
- memory search roots point at the vault.

### 4. Check host-local context

Run:

```sh
test -f "$HOME/.pi/agent/AGENTS.md" && echo "AGENTS.md: ok" || echo "AGENTS.md: missing"
test -f "$HOME/.pi/agent/current_host.md" && echo "current_host.md: ok" || echo "current_host.md: missing"
grep -n "current_host.md\|Nazar host context" "$HOME/.pi/agent/AGENTS.md" 2>/dev/null || true
sed -n '1,120p' "$HOME/.pi/agent/current_host.md" 2>/dev/null
```

Expected:

- `AGENTS.md` tells assistants to use `current_host.md` for host-specific decisions.
- `current_host.md` describes this device only and is not inside `$NAZAR_HOME`.
- Pixel 6a hub notes mention always-on Syncthing hub, charger, and `termux-wake-lock`.
- S25 Ultra notes mention mobile client/backup peer constraints.

### 5. Check Syncthing readiness

Run:

```sh
command -v syncthing >/dev/null && echo "syncthing: installed" || echo "syncthing: missing"
```

Ask the user to verify in the Syncthing UI/app:

- folder path is the whole Nazar vault, e.g. `$HOME/Nazar`;
- file versioning is enabled, especially on the Pixel 6a hub;
- peers include the Pixel 6a hub and S25 Ultra client;
- sync is healthy before resuming a Pi session on another device.

Do not print or store Syncthing device IDs unless the user explicitly provides sanitized values.

## Repair checklist

If any audit item fails, repair the smallest missing part:

- Missing packages → ask before `pkg install` / `npm install -g`.
- Missing checkout → clone into `$HOME/src/nazar`.
- Missing vault/session dirs → create `$HOME/Nazar/05_Nazar/session`.
- Missing Pi session setting → update `~/.pi/agent/settings.json` preserving existing keys.
- Missing shell exports/alias → add or refresh the managed block in `~/.bashrc`/chosen profile.
- Missing host context → create `~/.pi/agent/AGENTS.md` and `~/.pi/agent/current_host.md`.
- Current host file inside the synced vault → move it back under `~/.pi/agent/current_host.md` and update `AGENTS.md`.

After repair, tell the user to restart Pi/shell or run:

```sh
source ~/.bashrc
```

Then re-run the audit.

## Final response format

End with:

- `Configured:` bullets for changes made.
- `Needs user action:` bullets for Android UI/Syncthing/battery steps the agent cannot complete.
- `Verification:` commands run and whether they passed.
- `Safety notes:` especially no same live Pi session on two devices at once; let Syncthing settle before resume.
