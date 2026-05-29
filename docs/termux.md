# Termux setup for Nazar

This guide configures an Android phone as a Nazar host using Termux. It covers the S25 Ultra client and the Pixel 6a always-on Syncthing hub pattern.

## Status

Nazar is ready for Termux from a source checkout. Use the npm install commands once `@nazar/core` and `@nazar/memory` are published to the registry you use; until then, clone the repo and run Pi from the checkout with the project `.pi/settings.json`.

## 1. Install Termux apps

Install from F-Droid or GitHub, not the deprecated Google Play build:

- Termux
- Termux:API
- Syncthing or Syncthing-Fork, if you prefer the Android app over the Termux package

Then grant storage access if you want Nazar to read/write shared Android storage:

```sh
termux-setup-storage
```

## 2. Install host packages

```sh
pkg update && pkg upgrade
pkg install nodejs git openssh rsync termux-api syncthing
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```

Optional but recommended for an always-on Pixel 6a hub:

```sh
termux-wake-lock
```

Also disable Android battery optimization for Termux, Termux:API, and Syncthing/Syncthing-Fork.

## 3. Clone Nazar

```sh
mkdir -p "$HOME/src"
git clone https://github.com/alexradunet/nazar-studio.git "$HOME/src/nazar"
cd "$HOME/src/nazar"
npm install
```

## 4. Start Pi with Nazar loaded

From the checkout:

```sh
cd "$HOME/src/nazar"
pi
```

The repo-local `.pi/settings.json` loads the local Nazar core and memory extensions during development.

Once packages are published, the package-style setup is:

```sh
pi install npm:@nazar/core
pi install npm:@nazar/memory
pi
```

## 5. Run Nazar setup

Inside Pi:

```txt
/nazar setup all
```

Choose `termux` as the host profile when prompted.

The setup writes host-local configuration equivalent to:

```sh
export NAZAR_HOME="$HOME/Nazar"
export PI_CODING_AGENT_SESSION_DIR="$NAZAR_HOME/05_Nazar/session"
alias nazar='cd "$HOME/src/nazar" && pi'
```

It also configures Pi's `sessionDir` in `~/.pi/agent/settings.json`, creates the synced session directory, and writes host-local context files:

```txt
~/.pi/agent/AGENTS.md
~/.pi/agent/current_host.md
```

`AGENTS.md` is standard context loaded by Pi. It points to `current_host.md`, which describes this exact device. `current_host.md` stays local-only and must not be synced between devices.

After setup, restart the shell or run the command shown by setup, usually:

```sh
source ~/.bashrc
```

Then start Nazar with:

```sh
nazar
```

## 6. Configure current_host.md

Edit:

```sh
nano ~/.pi/agent/current_host.md
```

For the Pixel 6a hub, add local notes like:

```md
- Role: Pixel 6a always-on Nazar Syncthing hub and backup Termux instance.
- Constraints: Keep on charger; use termux-wake-lock; avoid heavy builds unless plugged in.
```

For the S25 Ultra client, add local notes like:

```md
- Role: S25 Ultra mobile Nazar client and backup peer.
- Constraints: Prefer quick edits, capture, review, and memory lookup while mobile.
```

Do not put secrets, tokens, private keys, raw transcripts, Syncthing device IDs, or private network addresses in this file unless explicitly sanitized.

## 7. Configure Syncthing

Sync the whole Nazar vault, not only the session folder:

```txt
$HOME/Nazar
```

This includes:

```txt
00_Inbox/
01_Projects/
02_Areas/
03_Resources/
04_Archive/
05_Nazar/runtime/
05_Nazar/session/
05_Nazar/pinned-memory.md
```

Recommended topology:

- Pixel 6a: always-on hub
- S25 Ultra: mobile client and backup peer
- Windows/server/laptop: additional peers

Enable Syncthing file versioning for the vault on at least the hub. Do not expose Syncthing or SSH directly to the internet; use LAN or a VPN/tunnel such as Tailscale/WireGuard.

Run Syncthing from Termux if you are not using the Android app:

```sh
syncthing
```

## 8. Verify

Inside Pi:

```txt
/nazar status
/memory status
/session
```

Expected signs:

- Nazar profile is `termux`.
- Memory vault points at `$HOME/Nazar`.
- Pi raw sessions point at `$HOME/Nazar/05_Nazar/session` after restart.
- `~/.pi/agent/current_host.md` is shown in Nazar host context.

## Operating rule

Do not actively continue the same live Pi session on two devices at once. Let Syncthing settle first, then resume the session from another host.
