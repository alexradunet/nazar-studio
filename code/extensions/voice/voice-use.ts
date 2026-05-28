import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { hasInteractiveUi, notify, trim } from "../shared.ts";
import {
  type RecordingProcess,
  recordingByteLength,
  resetSherpaRuntime,
  sampleSherpaMicrophone,
  sherpaModelStatus,
  startSherpaRecording,
  stopSherpaRecording,
  transcribeSherpaRecording,
} from "./sherpa-runtime.ts";

type VoiceAction = "paste" | "submit";

type RecordingSession = {
  action: VoiceAction;
  child: RecordingProcess;
  ctx: ExtensionContext;
  baseEditorText: string;
  stderr: string[];
  stopped: boolean;
  cancelled: boolean;
};

const SHORTCUT_PUSH_TO_TALK = "alt+v";

let recordingSession: RecordingSession | undefined;

const HELP_TEXT = `Pi push-to-talk voice commands
- /voice — toggle push-to-talk: start recording, press again to transcribe and submit
- /voice paste — toggle push-to-talk and paste transcript into the editor instead of submitting
- /voice stop — stop recording, transcribe, and submit/paste according to the active mode
- /voice cancel — cancel active recording and discard audio
- /voice status — show local STT/TTS service status and recording state
- /voice mic-test — record 5 seconds and report raw microphone level diagnostics
- /voice help — show this help

TUI shortcut
- Alt+V — push-to-talk toggle: press once to record, press again to send

This path records until you stop it. There is no silence threshold or continuous auto-listening loop.`;

function setVoiceStatus(ctx: ExtensionContext, text: string | undefined): void {
  ctx.ui.setStatus("voice", text);
}

function formatMicSample(sample: Awaited<ReturnType<typeof sampleSherpaMicrophone>>): string {
  return [
    `Input: ${sample.input}`,
    `Captured bytes: ${sample.bytes}`,
    `Samples: ${sample.samples}`,
    `Peak: ${sample.peak}`,
    `RMS: ${sample.rms.toFixed(1)}`,
  ].join("\n");
}

function noAudioHint(): string {
  return [
    "No audio was captured from the selected microphone source.",
    "Check that your host microphone is enabled and that the configured recorder is writing raw 16 kHz mono PCM to Pi.",
    "If you are using a remote desktop source such as xrdp-source, make sure the client is redirecting microphone audio.",
  ].join(" ");
}

function deliverTranscript(pi: ExtensionAPI, ctx: ExtensionContext, action: VoiceAction, transcript: string): void {
  if (action === "submit") {
    pi.sendUserMessage(transcript);
    ctx.ui.setEditorText("");
    if (hasInteractiveUi(ctx)) ctx.ui.notify("Voice message submitted", "info");
    return;
  }

  ctx.ui.pasteToEditor(transcript);
  if (hasInteractiveUi(ctx)) ctx.ui.notify("Voice transcript pasted into Pi editor", "info");
}

function stopRecording(ctx: ExtensionContext, cancel = false): string {
  if (!recordingSession) return cancel ? "No recording active." : "No recording active. Press Alt+V or /voice to start.";

  recordingSession.stopped = true;
  recordingSession.cancelled = cancel;
  setVoiceStatus(ctx, cancel ? "Voice: cancelled" : "Voice: transcribing…");

  try {
    if (cancel) recordingSession.child.kill("SIGTERM");
    else stopSherpaRecording(recordingSession.child);
  } catch {
    // Child may already be closed.
  }

  return cancel ? "Voice recording cancelled." : "Stopped recording; transcribing.";
}

function startRecording(pi: ExtensionAPI, ctx: ExtensionContext, action: VoiceAction): string {
  if (recordingSession) return stopRecording(ctx);
  if (!hasInteractiveUi(ctx)) return "Voice recording requires Pi interactive mode.";

  let child: RecordingProcess;
  try {
    child = startSherpaRecording();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setVoiceStatus(ctx, undefined);
    if (hasInteractiveUi(ctx)) ctx.ui.notify(`Voice failed: ${message}`, "error");
    return `Voice failed: ${message}`;
  }

  const session: RecordingSession = {
    action,
    child,
    ctx,
    baseEditorText: ctx.ui.getEditorText(),
    stderr: [],
    stopped: false,
    cancelled: false,
  };
  recordingSession = session;

  child.stderr.on("data", (chunk) => session.stderr.push(String(chunk)));

  child.on("error", (error) => {
    if (recordingSession === session) recordingSession = undefined;
    setVoiceStatus(ctx, undefined);
    if (hasInteractiveUi(ctx)) ctx.ui.notify(`Voice failed: ${error.message}`, "error");
  });

  child.on("close", (code, signal) => {
    if (recordingSession === session) recordingSession = undefined;
    setVoiceStatus(session.ctx, undefined);

    if (session.cancelled) {
      session.ctx.ui.setEditorText(session.baseEditorText);
      return;
    }

    const stderr = trim(session.stderr.join(""));
    if (code !== 0 && !session.stopped) {
      const detail = stderr || `exit=${code} signal=${signal ?? "none"}`;
      if (hasInteractiveUi(session.ctx)) session.ctx.ui.notify(`Voice failed: ${detail}`, "error");
      return;
    }

    const bytes = recordingByteLength(session.child);
    if (bytes < 16000 * 2 * 0.25) {
      const message = `${noAudioHint()} Captured ${bytes} byte(s).`;
      notify(session.ctx, message, "warning");
      return;
    }

    void transcribeSherpaRecording(session.child)
      .then((transcript) => {
        const text = trim(transcript);
        if (!text) {
          const message = `No transcript returned. Raw audio was captured (${bytes} bytes), but sherpa did not detect speech.`;
          notify(session.ctx, message, "warning");
          return;
        }
        deliverTranscript(pi, session.ctx, session.action, text);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        notify(session.ctx, `Voice transcription failed: ${message}`, "error");
      });
  });

  setVoiceStatus(ctx, action === "submit" ? "Voice: recording… Alt+V to send" : "Voice paste: recording… Alt+V to paste");
  if (hasInteractiveUi(ctx)) ctx.ui.notify("Recording. Press Alt+V or /voice stop to send.", "info");
  return "Recording. Press Alt+V or /voice stop to send.";
}

async function voiceStatus(_pi: ExtensionAPI): Promise<string> {
  const recording = recordingSession ? recordingSession.action : "idle";
  return `${sherpaModelStatus()}\nMode: push-to-talk\nRecording: ${recording}\nSilence thresholds: disabled for push-to-talk`;
}

export function registerVoiceUse(pi: ExtensionAPI) {
  pi.registerShortcut(SHORTCUT_PUSH_TO_TALK, {
    description: "Pi push-to-talk voice: press once to record, press again to send",
    handler: async (ctx) => {
      const text = recordingSession ? stopRecording(ctx) : startRecording(pi, ctx, "submit");
      if (hasInteractiveUi(ctx)) ctx.ui.notify(text, "info");
    },
  });

  pi.registerCommand("voice", {
    description: "Push-to-talk Pi voice input: /voice|paste|stop|cancel|status|mic-test",
    handler: async (args, ctx) => {
      const command = args.trim().toLowerCase();

      if (command === "help") {
        if (!hasInteractiveUi(ctx)) console.log(HELP_TEXT);
        else {
          ctx.ui.setWidget("voice", HELP_TEXT.split("\n"));
          ctx.ui.notify("Pi voice help updated", "info");
        }
        return;
      }

      if (command === "status") {
        const text = await voiceStatus(pi);
        if (!hasInteractiveUi(ctx)) console.log(text);
        else {
          ctx.ui.setWidget("voice", text.split("\n"));
          ctx.ui.notify("Pi voice status updated", "info");
        }
        return;
      }

      if (command === "mic-test" || command === "test-mic" || command === "mic") {
        if (recordingSession) {
          const text = "Stop or cancel the active voice recording before running /voice mic-test.";
          notify(ctx, text, "warning");
          return;
        }
        setVoiceStatus(ctx, "Voice: microphone test… speak now");
        if (hasInteractiveUi(ctx)) ctx.ui.notify("Recording microphone test for 5 seconds. Speak now.", "info");
        try {
          const sample = await sampleSherpaMicrophone(5000);
          const text = `${formatMicSample(sample)}\n${sample.bytes === 0 || sample.peak === 0 ? noAudioHint() : "Microphone audio is reaching Pi."}`;
          if (!hasInteractiveUi(ctx)) console.log(text);
          else {
            ctx.ui.setWidget("voice", text.split("\n"));
            ctx.ui.notify(sample.bytes === 0 || sample.peak === 0 ? "Microphone test captured no audio" : "Microphone test captured audio", sample.bytes === 0 || sample.peak === 0 ? "warning" : "info");
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          notify(ctx, `Microphone test failed: ${message}`, "error");
        } finally {
          setVoiceStatus(ctx, undefined);
        }
        return;
      }

      if (command === "cancel" || command === "off") {
        const text = stopRecording(ctx, true);
        notify(ctx, text, "info");
        return;
      }

      if (command === "stop" || command === "send") {
        const text = stopRecording(ctx);
        notify(ctx, text, "info");
        return;
      }

      if (command === "paste") {
        const text = recordingSession ? stopRecording(ctx) : startRecording(pi, ctx, "paste");
        if (!hasInteractiveUi(ctx)) console.log(text);
        return;
      }

      if (command === "" || command === "start" || command === "ptt" || command === "push" || command === "once") {
        const text = recordingSession ? stopRecording(ctx) : startRecording(pi, ctx, "submit");
        if (!hasInteractiveUi(ctx)) console.log(text);
        return;
      }

      const text = `Unknown /voice command: ${command}\n\n${HELP_TEXT}`;
      if (!hasInteractiveUi(ctx)) console.log(text);
      else {
        ctx.ui.setWidget("voice", text.split("\n"));
        ctx.ui.notify("Unknown voice command", "warning");
      }
    },
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (recordingSession) {
      try {
        recordingSession.child.kill("SIGTERM");
      } catch {
        // ignore shutdown cleanup errors
      }
      recordingSession = undefined;
    }
    resetSherpaRuntime();
    ctx.ui.setStatus("voice", undefined);
    ctx.ui.setWidget("voice", undefined);
  });
}
