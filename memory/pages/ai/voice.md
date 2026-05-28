# Local voice and TTS

Updated after Nazar setup integration on 2026-05-28.

## Current stack

- Pi extension entrypoint: `code/extensions/voice.ts`.
- TTS module: `code/extensions/voice/tts-use.ts`.
- Voice input module: `code/extensions/voice/voice-use.ts`.
- Current engine: `sherpa-onnx-node` loaded directly by the Pi extension.
- Model root resolution: `PI_VOICE_MODEL_DIR` first, then Nazar setup config, then repo-local `memory/state/voice-models/`. Large downloads are ignored by git.
- Assistant speech/TTS: English-only local Sherpa ONNX Kokoro model `kokoro-en-v0_19` by default.
- Primary Pi TUI dictation path: push-to-talk recording plus English-only sherpa ONNX Whisper model `sherpa-onnx-whisper-medium.en` by default.
- Voice is an optional integration. Audio capture/playback helpers are host-dependent and should be installed/configured by the user's platform, not by this repository.
- On Windows and macOS, Nazar does not bundle a default microphone recorder. Configure `PI_STT_COMMAND` and `PI_STT_ARGS` with a helper that writes raw signed 16-bit little-endian mono PCM at 16 kHz to stdout.
- Canonical Windows install rule: install FFmpeg and other Nazar host dependencies through `winget` when a winget package exists. FFmpeg package ID: `Gyan.FFmpeg`.
- TTS playback can use `PI_TTS_COMMAND` and `PI_TTS_ARGS` for a custom WAV player. On Windows, the default playback target is PowerShell `System.Media.SoundPlayer` through an encoded PowerShell command so temporary WAV paths are quoted safely.
- Automatic TTS speech is scoped to the main interactive conversation only. Subagent/headless child runtimes do not speak assistant messages.
- STT selection: `PI_STT_MODEL_NAME` defaults to `sherpa-onnx-whisper-medium.en`; recognition language is fixed to English in code. Set `PI_STT_MODEL_NAME=sherpa-onnx-whisper-tiny.en` only when a faster/lighter English fallback is more important than quality.
- TTS selection: `PI_TTS_MODEL_NAME` defaults to `kokoro-en-v0_19`; `PI_TTS_SPEAKER_ID` defaults to `0`.
- TTS WAV output includes a short leading silence preroll before each chunk so audio stream startup does not clip the first spoken word. Default: `PI_TTS_PREROLL_MS=220`; set it to `0` to disable or a larger value if clipping persists.
- The Pi extension uses direct sherpa transcription for push-to-talk, which records until stopped and avoids silence/VAD thresholds.

## Pi commands

```txt
/tts on
/tts off
/tts stop
/tts status
/tts test

/voice          # push-to-talk toggle: start recording, run again to send
/voice paste    # push-to-talk toggle that pastes transcript into the editor
/voice stop     # stop active recording and transcribe
/voice cancel   # cancel active recording and discard audio
/voice status
/voice mic-test # record 5 seconds and report raw input bytes/peak/RMS
```

Shortcut: `Alt+V` is push-to-talk: press once to record, press again to transcribe and send.

The active voice path is intentionally simple push-to-talk. It records until stopped and does not use silence thresholds or a continuous auto-listening loop.

## Host commands

```sh
pi --no-session --offline -p "/tts status"
pi --no-session --offline -p "/tts test"
pi --no-session --offline -p "/voice status"
```

## Validation

- `/tts status` and `/voice status` should report the active English TTS model, STT model/language, speaker ID, model root, audio target details, and main-conversation-only TTS scope.
- On Windows, `speakWithSherpa("Hello Alex. Windows text to speech is working.")` completed through PowerShell `System.Media.SoundPlayer` after switching to encoded commands.
- FFmpeg DirectShow microphone capture smoke-tested successfully with `Microphone Array (Realtek(R) Audio)`.
- `/tts test` should play on hosts with a configured playback helper.
- `/voice mic-test` should report raw input bytes/peak/RMS on hosts with a configured recording helper.
- Legacy `nazar-voice`, Wyoming Piper, Wyoming faster-whisper, and whisper.cpp Vulkan are not part of the active code path.
