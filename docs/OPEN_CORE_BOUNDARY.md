<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Open-Core Boundary

Balaur is **open-core**. In plain language, here is what is free and open vs. what is
commercial — so contributors, users, and grant reviewers know exactly where the line
is.

## Core — AGPL-3.0, free forever (this repo)
Everything needed to **self-host and run Balaur yourself**:
- the `balaur` CLI runtime
- the Ink terminal interface
- the Johnny Decimal Markdown vault and its data model
- built-in and vault-backed Markdown skills
- master conversation plus compacted sub-conversations
- gateway/channel bridges when implemented against the Balaur runtime event bus
- backup / restore, terminal-first deployment, and docs

**Any feature funded by a public grant (e.g. NGI Zero) lands here, in the AGPL core.**

## Commercial — separate, optional (not in this repo)
A convenience layer for people who don't want to self-host:
- managed / hosted Balaur (multi-tenant operations, provisioning, billing)
- enterprise add-ons (SLA, support, advanced administration)
- a commercial license for organisations that want to host or embed Balaur without
  AGPL obligations (contact hello@alexradu.net)

## Principle
The core must remain **fully usable on its own**. The commercial layer adds convenience
and operations — it never withholds the ability to self-host. If you cannot run Balaur
end-to-end from this repo alone, that is a bug.
