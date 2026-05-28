# Windows setup

Created on 2026-05-28. Updated after FFmpeg/STT and PowerShell TTS validation.

## Canonical dependency rule

- On Windows, install every Nazar host dependency through `winget` when a winget package exists.
- Ask before using Chocolatey, Scoop, manual ZIP downloads, or ad-hoc installers.
- Restart Pi and the terminal after installs that modify PATH.

## Common winget packages

```powershell
winget install --id Gyan.FFmpeg -e --source winget --accept-source-agreements --accept-package-agreements
winget install --id Git.Git -e --source winget --accept-source-agreements --accept-package-agreements
winget install --id GitHub.cli -e --source winget --accept-source-agreements --accept-package-agreements
winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-source-agreements --accept-package-agreements
```

## Voice input

Nazar voice input on Windows uses FFmpeg DirectShow when configured through environment variables. The current validated local microphone device is `Microphone Array (Realtek(R) Audio)`.

List audio devices:

```powershell
ffmpeg -hide_banner -list_devices true -f dshow -i dummy
```

Persist the recorder command and JSON argument array:

```powershell
[Environment]::SetEnvironmentVariable('PI_STT_COMMAND', 'ffmpeg', 'User')
[Environment]::SetEnvironmentVariable(
  'PI_STT_ARGS',
  '["-hide_banner","-loglevel","error","-f","dshow","-i","audio=Microphone Array (Realtek(R) Audio)","-ac","1","-ar","16000","-f","s16le","-"]',
  'User'
)
```

Replace the microphone name with the exact device printed by FFmpeg.

The local FFmpeg capture smoke test passed with:

```powershell
ffmpeg -hide_banner -loglevel error -f dshow -i "audio=Microphone Array (Realtek(R) Audio)" -t 1 -ac 1 -ar 16000 -f s16le NUL
```

## TTS playback

Windows TTS playback uses PowerShell `System.Media.SoundPlayer` by default. Nazar encodes the PowerShell command before spawning it so generated temp WAV paths with backslashes are parsed safely.

## Project skill

Use `/skill:windows-setup` for future Windows setup, dependency installation, PATH, FFmpeg, and voice-input troubleshooting.
