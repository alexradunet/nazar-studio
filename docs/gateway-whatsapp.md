<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Talking to Nazar over WhatsApp

Drive your Pi session from your phone via WhatsApp. The gateway is a Pi
extension bound to the Pi session: it connects when you open Pi and disconnects
when you close it — there is **no background daemon and no RPC**. For always-on
use, run Pi inside `tmux` on a machine that stays awake.

It's built on a small transport-agnostic **gateway abstraction** (`lib/gateways/`).
WhatsApp is the first transport (via [Baileys](https://github.com/WhiskeySockets/Baileys));
Signal/Telegram/etc. can be added later without touching the core.

## How it works

- Give Nazar its **own** WhatsApp number (a second number/SIM). Baileys links to
  it as a "linked device" — you scan one QR (or enter a pairing code) the first
  time; the session is then persisted so you never re-link.
- You message Nazar's number **from your personal phone**. A **master lock**
  means only your one configured number is accepted — every other sender is
  ignored.
- Your message is injected into Pi as a normal prompt (`deliverAs: "followUp"`),
  so Pi's own one-turn-at-a-time loop serialises it with anything you type at the
  local terminal — **dual control, turns queued**.
- The chat shows a **typing indicator while Nazar works**, then the **answer**
  (Markdown converted to WhatsApp formatting and split into readable messages),
  and a short **"✓ done"** only when a turn produced no text reply.

## Prerequisites

- A dedicated WhatsApp account for Nazar (its own phone number).
- The optional packages, installed on the machine that runs Pi:

  ```bash
  npm i baileys qrcode-terminal
  ```

  They are declared as **optional peer dependencies** and are loaded only when
  the gateway connects, so users who don't use WhatsApp never pull them in.

## Setup

1. Set the environment before launching Pi:

   ```bash
   export NAZAR_GATEWAY=whatsapp
   export NAZAR_WHATSAPP_OWNER="<your personal number>"   # e.g. +40712345678
   ```

2. Start Pi (ideally in tmux):

   ```bash
   tmux new -s nazar
   pi
   ```

3. Link the device **once**:
   - **QR (default):** a scannable QR appears in Pi. On Nazar's phone, open
     WhatsApp → **Linked Devices** → **Link a device**, and scan it.
   - **Pairing code (alternative):** set `NAZAR_WHATSAPP_AUTH=pairing` and
     `NAZAR_WHATSAPP_NUMBER="<Nazar's own number>"`. Pi prints a code; enter it in
     WhatsApp → **Linked Devices** → **Link with phone number**.

4. From your personal phone, message Nazar's number. Nazar replies in the same
   chat. Detach tmux (`Ctrl-b d`) to leave it running.

## Chat commands

Send these in the WhatsApp chat to control the live session:

| Command    | Effect                                  |
| ---------- | --------------------------------------- |
| `/abort`   | Abort the current agent turn            |
| `/compact` | Compact the Pi session context          |
| `/status`  | Reply with the gateway connection state |

## Configuration

| Variable                      | Default          | Purpose                                                        |
| ----------------------------- | ---------------- | ------------------------------------------------------------- |
| `NAZAR_GATEWAY`               | _(off)_          | Select the transport: `whatsapp` (or `fake` for a wiring smoke). |
| `NAZAR_WHATSAPP_OWNER`        | _(required)_     | The only number allowed to drive Pi (the master lock).        |
| `NAZAR_WHATSAPP_AUTH`         | `qr`             | `qr` or `pairing`.                                            |
| `NAZAR_WHATSAPP_NUMBER`       | _(none)_         | Nazar's own number — required for `pairing`.                  |
| `NAZAR_WHATSAPP_SESSION_DIR`  | `<dataDir>/whatsapp-auth` | Where the linked-device session is stored (gitignored). |
| `NAZAR_GATEWAY_MIRROR_LOCAL`  | `0`              | `1` to also echo locally-typed turns to the chat.            |
| `NAZAR_GATEWAY_TOOL_PINGS`    | `0`              | `1` to send throttled per-tool activity pings.               |

The session directory holds WhatsApp credentials — treat it as a secret. It is
gitignored by default and lives outside the repo.

## Manual end-to-end test checklist

The automated suite covers the gateway logic with a fake socket; this checklist
verifies the real WhatsApp link on your machine.

- [ ] `npm i baileys qrcode-terminal` succeeds.
- [ ] With `NAZAR_GATEWAY=whatsapp` + `NAZAR_WHATSAPP_OWNER` set, Pi shows a QR
      (or pairing code) on first run.
- [ ] Scanning links the device; the footer/status shows **WhatsApp: connected**.
- [ ] Restarting Pi reconnects **without** a new QR (session persisted).
- [ ] A message from your number gets a reply in the same chat.
- [ ] A message from a **different** number is ignored.
- [ ] Typing indicator appears while Nazar works.
- [ ] A long answer arrives split across multiple messages; **bold** renders.
- [ ] `/abort` stops a running turn; `/status` reports the connection.
- [ ] Typing at the local terminal still works while WhatsApp is connected; a
      message sent mid-turn is answered after the current turn finishes.
- [ ] Closing Pi disconnects cleanly (no lingering process).
