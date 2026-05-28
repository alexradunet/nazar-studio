---
name: github-manager
description: Use when the user asks Pi to manage GitHub profile settings, GitHub repositories, issues, pull requests, releases, or GitHub CLI authentication through the gh command-line tool.
---

# GitHub Manager

Use this skill for GitHub account/profile and repository work through the installed `gh` CLI.

## First checks

Always start by checking the local CLI and authentication state:

```sh
gh --version
gh auth status
```

If not authenticated, ask the user before starting login, then use:

```sh
gh auth login
# After login, optionally configure git credentials:
gh auth setup-git
```

For operations that need extra OAuth scopes, request only the scope needed for the task, for example:

```sh
gh auth refresh -h github.com -s repo
```

Only request sensitive scopes such as `delete_repo` after the user explicitly approves the exact destructive task.

## Operating rules

- Prefer `gh` over raw GitHub API calls when it supports the task cleanly.
- Use `gh api` for profile fields or endpoints not exposed by first-class `gh` subcommands.
- Prefer `--json` output plus `jq` when inspecting state for Pi.
- Show the intended change before applying risky actions.
- Never delete, transfer, archive, make public/private, rename, or overwrite repository settings without explicit confirmation for the exact target.
- Never print tokens, OAuth device codes, secret values, private keys, or credentials into durable memory or logs.
- Treat private repository names/content as private unless the user asks to share them.

## Common profile commands

Inspect the authenticated account:

```sh
gh api user --jq '{login, name, bio, company, blog, location, email, hireable, twitter_username}'
gh profile view
```

Update profile fields with `gh api user -X PATCH`; confirm desired values first:

```sh
gh api user -X PATCH \
  -f name='Display Name' \
  -f bio='Short bio' \
  -f company='Company' \
  -f blog='https://example.com' \
  -f location='City, Country'
```

## Common repository commands

Inspect repositories:

```sh
gh repo list --limit 100 --json nameWithOwner,visibility,isPrivate,description,updatedAt,url
gh repo view OWNER/REPO --json nameWithOwner,description,visibility,isPrivate,defaultBranchRef,homepageUrl,url
```

Create a repository:

```sh
gh repo create OWNER/REPO --private --description 'Description' --clone=false
# or from the current directory:
gh repo create OWNER/REPO --private --source=. --remote=origin --push
```

Clone or open:

```sh
gh repo clone OWNER/REPO
gh repo view OWNER/REPO --web
```

Edit safe metadata after confirming desired values:

```sh
gh repo edit OWNER/REPO --description 'Description' --homepage 'https://example.com'
gh repo edit OWNER/REPO --add-topic topic-one --add-topic topic-two
```

Risky repository changes require explicit confirmation:

```sh
gh repo edit OWNER/REPO --visibility private
gh repo archive OWNER/REPO
gh repo delete OWNER/REPO
```

## Issues, PRs, releases

```sh
gh issue list --repo OWNER/REPO
gh issue view NUMBER --repo OWNER/REPO
gh pr list --repo OWNER/REPO
gh pr view NUMBER --repo OWNER/REPO
gh release list --repo OWNER/REPO
```

When creating issues, PRs, or releases, draft the title/body first and ask for confirmation unless the user already provided exact content.
