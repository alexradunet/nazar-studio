# WhatsApp integration

Canonical as of 2026-05-26. Updated after adding Nazar setup QR pairing on 2026-05-28.

## Scope

- WhatsApp support is a project-local Pi extension, not a separate gateway service for now.
- Extension entrypoint: `code/extensions/whatsapp.ts`.
- Implementation: `code/extensions/whatsapp/`.
- Runtime dependency: `@whiskeysockets/baileys` pinned in `code/extensions/whatsapp/package.json`.
- `.pi/settings.json` loads the extension for this repository.
- `/nazar-setup whatsapp` configures the whitelisted contact/autostart preference and can start WhatsApp QR pairing from setup.

## Behavior

- Personal 1:1 only.
- Exactly one whitelisted contact is configured outside the repo in `~/.config/pi/whatsapp.json`.
- Groups, broadcasts, status/newsletters, self messages, and non-whitelisted senders are ignored.
- Text messages are injected into the current active Pi session.
- Images are downloaded from WhatsApp and sent to Pi as image input.
- Audio/voice notes are converted with `ffmpeg` to 16 kHz mono PCM and transcribed through the existing sherpa STT runtime before being sent to Pi as plain text.
- Assistant replies are sent back to the WhatsApp chat.
- QR pairing is shown in a Pi TUI popup when available and also printed to the terminal for fallback scanning.

## Master process model

- There should be one WhatsApp master Pi process.
- The WhatsApp extension uses a cross-process master lock at `~/.local/state/pi/whatsapp/master.lock` so only one Pi instance owns the Baileys connection/auth state.
- Other Pi instances can run normal work, but WhatsApp messages go only to the master process's active Pi session.
- Switch the WhatsApp conversation by switching the active session in the master Pi with Pi built-ins such as `/resume`, `/new`, or `/tree`; do not add a custom `/whatsapp set_session` layer.
- Always-on process supervision is a local deployment choice. If needed, run `pi --continue --whatsapp-online` through the user's preferred platform supervisor; this repository does not ship host service definitions.

## Useful commands

Inside any Pi session:

```text
/whatsapp status
/whatsapp start
/whatsapp stop
/whatsapp autostart on
/whatsapp pair +<pi-whatsapp-account-phone>
/whatsapp allowed +<allowed-personal-phone>
/nazar-setup whatsapp
```

Optional host commands when using a manual terminal multiplexer:

```sh
zellij list-sessions
zellij attach pi-whatsapp
```
