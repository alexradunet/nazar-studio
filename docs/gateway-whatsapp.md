<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Talking to Nazar over WhatsApp

Drive your Pi session from your phone via WhatsApp. The gateway is a Pi
extension bound to the Pi session: it connects when you open Pi and disconnects
when you close it — there is **no background daemon and no RPC**. For always-on
use, run Pi inside `tmux` on a machine that stays awake.

**Everything is set up from inside Pi** with the **`/nazar-whatsapp`** command —
no env files or config editing required. It's built on a small transport-agnostic
**gateway abstraction** (`lib/gateways/`); WhatsApp is the first transport (via
[Baileys](https://github.com/WhiskeySockets/Baileys)), and Signal/Telegram/etc.
can be added later without touching the core.

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

## One-time install

On the machine that runs Pi, install the optional packages:

```bash
npm i baileys qrcode-terminal
```

They're declared as **optional peer dependencies** and are loaded only when the
gateway connects, so users who don't use WhatsApp never pull them in.

## Setup with `/nazar-whatsapp`

1. Start Pi (ideally in tmux):

   ```bash
   tmux new -s nazar
   pi
   ```

2. Run **`/nazar-whatsapp`** and use the menu:
   - **Set my number** — your personal number (the master lock). Required first.
   - **Auth: QR / pairing code** — choose how to link (QR is the default).
   - **Connect / link device** — starts the gateway. On first link:
     - **QR:** a scannable QR appears; on Nazar's phone open WhatsApp →
       **Linked Devices** → **Link a device** and scan it.
     - **Pairing code:** Pi shows a code; enter it under WhatsApp →
       **Linked Devices** → **Link with phone number**.

3. From your personal phone, message Nazar's number. Nazar replies in the same
   chat. Detach tmux (`Ctrl-b d`) to leave it running.

Settings persist to `whatsapp/config.json` under the nazar data dir, so next
time you open Pi it **auto-connects** (no QR) — toggle that off in the menu if
you prefer manual connects.

### Menu options

| Option | What it does |
| --- | --- |
| Connect / Reconnect | Start (or restart) the gateway; shows a QR/code on first link |
| Disconnect | Stop the gateway for this session |
| Set my number | The only number allowed to drive Pi (master lock) |
| Auth: QR ↔ pairing | Switch the linking method (pairing needs Nazar's number) |
| Mirror local turns | Also echo locally-typed turns to the chat (default off) |
| Tool pings | Send throttled per-tool activity pings (default off) |
| Auto-connect on startup | Reconnect automatically once linked (default on) |
| Log off | Delete the linked-device session (re-link required) |
| Status | Show the current connection state |

## Chat commands

Send these in the WhatsApp chat to control the live session:

| Command    | Effect                                  |
| ---------- | --------------------------------------- |
| `/abort`   | Abort the current agent turn            |
| `/compact` | Compact the Pi session context          |
| `/status`  | Reply with the gateway connection state |

## Optional env bootstrap

You can pre-seed settings with env vars (the `/nazar-whatsapp` menu overrides
them and is the recommended path):

| Variable | Purpose |
| --- | --- |
| `NAZAR_GATEWAY=whatsapp` | Select the transport |
| `NAZAR_WHATSAPP_OWNER` | Owner number (master lock) |
| `NAZAR_WHATSAPP_AUTH` | `qr` or `pairing` |
| `NAZAR_WHATSAPP_NUMBER` | Nazar's own number (pairing) |
| `NAZAR_WHATSAPP_SESSION_DIR` | Linked-device session dir (gitignored) |
| `NAZAR_WHATSAPP_AUTOCONNECT` | `0` to disable startup auto-connect |
| `NAZAR_GATEWAY_MIRROR_LOCAL` | `1` to echo local turns |
| `NAZAR_GATEWAY_TOOL_PINGS` | `1` to enable tool pings |

The config JSON holds preferences only; the linked-device session (the secret)
lives under the session dir and is gitignored.

## Manual end-to-end test checklist

The automated suite covers the gateway logic with a fake socket; this checklist
verifies the real WhatsApp link on your machine.

- [ ] `npm i baileys qrcode-terminal` succeeds.
- [ ] `/nazar-whatsapp` → **Set my number**, then **Connect** shows a QR (or code).
- [ ] Scanning links the device; status shows **WhatsApp: connected**.
- [ ] Restarting Pi auto-reconnects **without** a new QR (session persisted).
- [ ] A message from your number gets a reply in the same chat.
- [ ] A message from a **different** number is ignored.
- [ ] Typing indicator appears while Nazar works.
- [ ] A long answer arrives split across multiple messages; **bold** renders.
- [ ] `/abort` stops a running turn; `/status` reports the connection.
- [ ] Typing at the local terminal still works while WhatsApp is connected; a
      message sent mid-turn is answered after the current turn finishes.
- [ ] **Log off** in the menu deletes the session; next **Connect** re-links.
- [ ] Closing Pi disconnects cleanly (no lingering process).
