<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Self-evolution — the software that grows with you

Balaur grows through the vault, not through hidden state or model retraining.

Growth is:

```txt
detect → suggest → review → approve/edit/reject → write to vault → index
```

No silent self-modification.

## Knowledge types

All durable knowledge lives in the Johnny Decimal vault as Markdown:

| Kind | Meaning |
|---|---|
| `user-note` | A note written or explicitly approved by the user. |
| `ai-note` | A Balaur-generated observation or draft awaiting review. |
| `memory` | A durable fact/preference/decision. Still a vault entry, not a separate system. |
| `skill` | A reusable procedure discoverable by `/skill:name`. |
| `summary` | A compacted sub-conversation or periodic review. |

## Inbox-first suggestions

Balaur may propose entries, but approval happens through a review surface, not a blocking terminal dialog.

Target flow:

```txt
conversation → suggested vault entry with status: inbox
user reviews on the vault page → approve/edit/reject
approved entries are indexed and available to vault_search
```

## Skills

Skills are Markdown vault entries with:

```yaml
kind: skill
```

They can also exist as built-in seed skills under `skills/`. The runtime discovers both and exposes them through `/skill:name`.

## Sub-conversation compaction

Balaur has one master life conversation: the main head. Focused sub-conversations act like branch sub-heads. When finished, a branch is compacted into a `summary` vault/master-conversation artifact and merged back into the main head.

## Safety

- Preserve the user's wording where possible.
- Do not store secrets unless the user explicitly asks and understands the risk.
- Prefer `status: inbox` for AI-generated drafts.
- Keep Markdown as source of truth; SQLite is only an index.
- Keep changes inspectable and reversible.
