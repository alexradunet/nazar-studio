import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";

import { hasInteractiveUi } from "@nazar/core/shared";

let qrOverlayClose: (() => void) | undefined;
let qrOverlayHandle: { hide?: () => void } | undefined;
let qrOverlaySerial = 0;

export function closeQrOverlay(): void {
  const close = qrOverlayClose;
  const handle = qrOverlayHandle;
  qrOverlaySerial += 1;
  qrOverlayClose = undefined;
  qrOverlayHandle = undefined;
  try {
    close?.();
  } catch {
    // Best-effort UI cleanup.
  }
  try {
    handle?.hide?.();
  } catch {
    // Best-effort UI cleanup.
  }
}

export function showQrOverlay(ctx: ExtensionContext | undefined, lines: string[]): void {
  if (!hasInteractiveUi(ctx)) return;
  if (!ctx) return;
  closeQrOverlay();

  const qrWidth = Math.max(...lines.map((line) => visibleWidth(line)), 0);
  const requestedWidth = Math.min(Math.max(qrWidth + 8, 72), 120);

  const overlaySerial = ++qrOverlaySerial;
  void ctx.ui.custom<void>((tui, theme, _keybindings, done) => {
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      if (qrOverlaySerial === overlaySerial) {
        qrOverlayClose = undefined;
        qrOverlayHandle = undefined;
      }
      done();
    };
    qrOverlayClose = close;

    const component: Component = {
      render(width: number): string[] {
        const title = theme.fg("accent", theme.bold("WhatsApp pairing QR"));
        const help = theme.fg("dim", "Esc/Enter closes • terminal fallback also printed");
        const availableRows = Math.max(1, Math.floor(tui.terminal.rows));
        if (width < qrWidth + 2) {
          return [
            truncateToWidth(title, width),
            "",
            truncateToWidth(theme.fg("warning", `Terminal too narrow for QR: needs ${qrWidth + 2} columns, has ${width}.`), width),
            truncateToWidth("Enlarge the terminal or use /whatsapp pair +<pi-whatsapp-account-phone>.", width),
            "",
            truncateToWidth(help, width),
          ];
        }
        if (availableRows < lines.length) {
          return [
            truncateToWidth(title, width),
            "",
            truncateToWidth(theme.fg("warning", `Terminal too short for QR: needs ${lines.length} rows, has ${availableRows}.`), width),
            truncateToWidth("Enlarge the terminal or use /whatsapp pair +<pi-whatsapp-account-phone>.", width),
            truncateToWidth("The full QR was also printed to the terminal as fallback.", width),
            "",
            truncateToWidth(help, width),
          ];
        }

        const centeredQr = lines.map((line) => `${" ".repeat(Math.max(0, Math.floor((width - visibleWidth(line)) / 2)))}${line}`);
        if (availableRows < lines.length + 5) return centeredQr;

        return [
          truncateToWidth(title, width),
          truncateToWidth("Scan with WhatsApp → Linked devices → Link a device.", width),
          "",
          ...centeredQr,
          "",
          truncateToWidth(help, width),
        ];
      },
      handleInput(data: string): void {
        if (matchesKey(data, "escape") || matchesKey(data, "enter") || matchesKey(data, "ctrl+c")) close();
      },
      invalidate(): void {},
    };
    return component;
  }, {
    overlay: true,
    overlayOptions: { anchor: "center", width: requestedWidth, maxHeight: "100%", margin: 0 },
    onHandle: (handle) => {
      if (qrOverlaySerial === overlaySerial) qrOverlayHandle = handle;
    },
  }).finally(() => {
    if (qrOverlaySerial === overlaySerial) {
      qrOverlayClose = undefined;
      qrOverlayHandle = undefined;
    }
  });
}
