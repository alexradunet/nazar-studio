// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { renderAvatar } from "../../lib/avatar/avatar.ts";
import { modelsDir } from "../../lib/paths.ts";
import { createBalaurRuntime, type BalaurRuntime } from "../../lib/runtime/session-runner.ts";
import { TUI_THEME } from "../../lib/tui/theme.ts";
import { BalaurInkApp } from "./BalaurInkApp.tsx";
import { BalaurIdentity } from "./molecules/BalaurIdentity.tsx";

function startupErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.split(modelsDir()).join("<balaur-models>");
}

export function BalaurStartupApp({ onRuntime }: { onRuntime?: (runtime: BalaurRuntime) => void }) {
  const { exit } = useApp();
  const abortRef = useRef<AbortController | null>(null);
  const avatar = useMemo(() => renderAvatar("balaur", { rows: TUI_THEME.avatar.identityRows, mode: TUI_THEME.avatar.mode }), []);
  const [runtime, setRuntime] = useState<BalaurRuntime>();
  const [status, setStatus] = useState("Starting Balaur...");
  const [error, setError] = useState<string>();

  useInput((value, key) => {
    if (key.ctrl && (value === "c" || value === "d")) {
      abortRef.current?.abort();
      runtime?.close();
      exit();
    }
  });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    abortRef.current = controller;

    void createBalaurRuntime({
      startupSignal: controller.signal,
      onStartupStatus: (text) => {
        if (!cancelled) setStatus(text);
      },
    }).then((created) => {
      if (cancelled) {
        created.close();
        return;
      }
      onRuntime?.(created);
      setRuntime(created);
    }).catch((caught) => {
      if (!cancelled) setError(startupErrorMessage(caught));
    });

    return () => {
      cancelled = true;
      controller.abort();
      abortRef.current = null;
    };
  }, [onRuntime]);

  if (runtime) return <BalaurInkApp runtime={runtime} />;

  return (
    <Box flexDirection="column" paddingX={TUI_THEME.spacing.screenPaddingX} width="100%">
      <BalaurIdentity avatar={avatar} />
      <Text color={error ? TUI_THEME.color.tool : TUI_THEME.color.steel}>{error ? "Startup failed" : "Preparing local runtime"}</Text>
      <Text color={error ? TUI_THEME.color.tool : TUI_THEME.color.muted}>{error ?? status}</Text>
      {!error ? <Text color={TUI_THEME.color.muted} dimColor>Chat opens automatically when the local model is ready.</Text> : null}
      <Text color={TUI_THEME.color.muted} dimColor>Ctrl+C to quit</Text>
    </Box>
  );
}
