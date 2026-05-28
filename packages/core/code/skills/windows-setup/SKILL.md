---
name: windows-setup
description: Use when the user wants to configure Nazar on Windows, install Windows host dependencies, configure voice/STT recording with FFmpeg, troubleshoot PATH or microphone devices, or set Windows environment variables for Nazar.
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
where.exe ffmpeg
where.exe gh
```

From Git Bash, use Windows executables explicitly when needed:

```sh
winget.exe --version
cmd.exe /c where ffmpeg
powershell.exe -NoProfile -Command 'Get-Command ffmpeg -ErrorAction SilentlyContinue'
```

If a tool was just installed, restart Pi and the terminal before assuming PATH is broken.

## Install common dependencies

Install FFmpeg for voice recording/transcoding:

```powershell
winget install --id Gyan.FFmpeg -e --source winget --accept-source-agreements --accept-package-agreements
```

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

## Configure voice input with FFmpeg DirectShow

List Windows DirectShow devices:

```powershell
ffmpeg -hide_banner -list_devices true -f dshow -i dummy
```

Pick the exact audio device name, then persist Nazar STT variables. Use JSON args so spaces and parentheses in device names are safe:

```powershell
[Environment]::SetEnvironmentVariable('PI_STT_COMMAND', 'ffmpeg', 'User')
[Environment]::SetEnvironmentVariable(
  'PI_STT_ARGS',
  '["-hide_banner","-loglevel","error","-f","dshow","-i","audio=Microphone Array (Realtek(R) Audio)","-ac","1","-ar","16000","-f","s16le","-"]',
  'User'
)
```

Replace `Microphone Array (Realtek(R) Audio)` with the exact device name printed by FFmpeg.

Restart Pi after setting user environment variables. Existing processes do not inherit changes made by `SetEnvironmentVariable`.

## Verify Nazar voice

```powershell
pi --no-session --offline -p "/voice status"
pi --no-session --offline -p "/voice mic-test"
```

Inside interactive Pi:

```txt
/voice status
/voice mic-test
```

Expected status should show a custom STT recorder and `ready (ffmpeg)`.

## Troubleshooting

- If `ffmpeg` is not found immediately after winget install, restart the terminal. Winget updates PATH for future processes.
- If Git Bash cannot find `ffmpeg` but PowerShell can, start Pi from a new terminal or update Git Bash's inherited PATH.
- If FFmpeg device listing shows no audio devices, check Windows microphone privacy settings and desktop-app microphone access.
- If `/voice mic-test` captures zero bytes, verify the selected DirectShow device name exactly matches FFmpeg output.
- If device names contain quotes or non-ASCII characters, keep `PI_STT_ARGS` as a JSON array rather than shell-style quoted text.
- Do not store secrets or private tokens in Windows user environment variables for Nazar unless the corresponding extension explicitly requires them and the user approves.
