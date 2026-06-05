<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Nazar docs

Everything beyond the top-level [README](../README.md) lives here — technical guides plus the
project's community and legal documents.

## Run it
- [INSTALL.md](./INSTALL.md) — install, local llamafile model, terminal setup, and
  the `.env` knobs.
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) — runtime runbook for terminal config, model health,
  reloads, and stale service cleanup.

## Grow it
- [PERSONA.md](./PERSONA.md) — Nazar’s persona, philosophy, and oath.
- [SELF_EVOLUTION.md](./SELF_EVOLUTION.md) — how Nazar grows: facts in FTS5 memory, procedures
  as Pi-native skills (`skills/`), the suggest→approve loop, and the code-skill escalation.
- [SELF_MAINTENANCE.md](./SELF_MAINTENANCE.md) — how Nazar edits, tests, commits, pushes, and
  reloads *itself* (host-native terminal, behind your approval).

## Govern it
- [CONTRIBUTING.md](./CONTRIBUTING.md) — how to contribute (and the CLA requirement).
- [CLA.md](./CLA.md) — the Contributor License Agreement.
- [GOVERNANCE.md](./GOVERNANCE.md) — how decisions get made.
- [SECURITY.md](./SECURITY.md) — how to report a vulnerability.
- [OPEN_CORE_BOUNDARY.md](./OPEN_CORE_BOUNDARY.md) — exactly where the FOSS core ends and the
  optional commercial tier begins.

Your **vault** (personal data) is *not* in this repo — it lives at `$VAULT_PATH`
(default `~/.local/share/nazar`). Code stays public; data stays yours.
