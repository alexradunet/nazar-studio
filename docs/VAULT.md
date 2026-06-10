# Balaur Vault

The vault is Balaur's private source of truth for durable context and skills:

- user notes
- AI notes
- skills
- durable facts, preferences, and decisions
- compacted sub-conversation summaries
- pending inbox items

It is stored as Markdown, organized with Johnny Decimal codes, and indexed by a disposable SQLite FTS index.

## Default structure

```txt
~/.local/share/balaur/vault/
  00-09/
  10-19/
  20-29/
  30-39/
  40-49/
  50-59/
  60-69/
  70-79/
  80-89/
  90-99/
```

A file path looks like:

```txt
vault/40-49/40.12/balaur-vault-decision.md
```

## Frontmatter

```yaml
---
title: "Balaur vault decision"
jd: "40.12"
kind: memory # user-note | ai-note | skill | memory | summary
status: approved # inbox | approved | rejected
whenToUse: "When discussing Balaur architecture."
tags: [balaur, architecture]
created: 2026-06-10T00:00:00.000Z
updated: 2026-06-10T00:00:00.000Z
---
```

## Skill entries

A skill can live in the vault by setting:

```yaml
kind: skill
```

The runtime discovers those entries and exposes them through `/skill:name`.

## Runtime tools

Use the vault tools to inspect and update approved Markdown entries:

- `vault_search`
- `vault_write`
- `vault_get`
- `vault_duplicates`
