---
name: windows-setup
description: Use when the user wants to configure Nazar on Windows, install Windows host dependencies, troubleshoot PATH issues, or set Windows environment variables for Nazar.
---

# Windows Setup

Use this skill for Windows-specific Nazar setup and troubleshooting.

## Canonical rule

- On Windows, install every Nazar host dependency through `winget` when a winget package exists.
- Do not use Chocolatey, Scoop, manual ZIP installs, or ad-hoc downloads unless the user explicitly approves an exception after winget is unavailable or unsuitable.
- Prefer stable package IDs and exact winget commands that include `--id`, `-e`, `--source winget`, `--accept-source-agreements`, and `--accept-package-agreements`.

## First checks

```powershell
winget --version
where.exe node
where.exe git
where.exe gh
```

From Git Bash, use Windows executables explicitly when needed:

```sh
winget.exe --version
cmd.exe /c where node
powershell.exe -NoProfile -Command 'Get-Command node -ErrorAction SilentlyContinue'
```

If a tool was just installed, restart Pi and the terminal before assuming PATH is broken.

## Install common dependencies

Install GitHub CLI when GitHub management is needed:

```powershell
winget install --id GitHub.cli -e --source winget --accept-source-agreements --accept-package-agreements
```

Install Git when missing:

```powershell
winget install --id Git.Git -e --source winget --accept-source-agreements --accept-package-agreements
```

Install Node.js LTS when missing:

```powershell
winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-source-agreements --accept-package-agreements
```

## Configure Nazar paths

Set a portable vault root when you do not want the default `~/NazarVault` location:

```powershell
[Environment]::SetEnvironmentVariable('NAZAR_HOME', "$env:USERPROFILE\NazarVault", 'User')
```

Restart Pi after setting user environment variables. Existing processes do not inherit changes made by `SetEnvironmentVariable`.

## Verify Nazar

Inside interactive Pi:

```txt
/nazar status
/memory status
```

## Troubleshooting

- If a newly installed executable is not found, restart the terminal. Winget updates PATH for future processes.
- If Git Bash cannot find an executable but PowerShell can, start Pi from a new terminal or update Git Bash's inherited PATH.
- Keep `NAZAR_HOME`, `NAZAR_CONFIG_DIR`, `NAZAR_STATE_DIR`, and `NAZAR_DATA_DIR` as user-level environment variables when you want machine-wide consistency for your Windows user.
- Do not store secrets or private tokens in Windows user environment variables for Nazar unless the corresponding extension explicitly requires them and the user approves.
