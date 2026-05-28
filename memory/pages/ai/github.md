# GitHub CLI and management skill

Created on 2026-05-27. Updated after removing bundled host operating-system configuration on 2026-05-27.

## Purpose

The standalone `github-manager` Agent Skill lets Pi manage GitHub profile and repository work through the GitHub CLI (`gh`) when it is available on `PATH`.

## Host dependency

- `gh` is an optional external tool.
- Install it through the package manager for the user's platform or from GitHub's official release instructions.
- The Nazar repository does not install or configure `gh` through host operating-system files.

## Pi skill

- Standalone project Agent Skill: `code/skills/github-manager/SKILL.md`.
- `.pi/settings.json` loads standalone skills from `../code/skills`.
- Use `/skill:github-manager` or ask Pi to manage GitHub profile/repositories.

## Public repositories

- `https://github.com/alexradunet/nazar` is the public sanitized Nazar repository, created on 2026-05-27 from a clean export tree.
- Do not add this public remote to the private working repository by default, to avoid accidentally pushing private history or memory.
- Public exports must exclude private/generated memory (`memory/journal/**`, `memory/rollups/**`, `memory/sources/**`, real personal pages, tokens, auth state, and local model downloads).

## Auth and safety

- Start GitHub work with `gh --version` and `gh auth status`.
- If login is needed, ask before running `gh auth login`.
- Request only the OAuth scopes needed for the task.
- Destructive repository actions such as delete, transfer, archive, visibility changes, and renames require explicit confirmation for the exact target.
- Do not store GitHub tokens, OAuth codes, or secret material in durable memory.
