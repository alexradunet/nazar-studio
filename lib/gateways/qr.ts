// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * gateways/qr.ts — render an auth QR payload as scannable ASCII via the optional
 * qrcode-terminal package. Returns a string (no direct stdout writes) so the
 * caller can surface it inside Pi's UI (e.g. ctx.ui.notify) without corrupting
 * the TUI. Degrades to the raw payload + a hint when the package is absent.
 */
export async function renderQrAscii(qr: string): Promise<string> {
  try {
    // Non-literal specifier so tsc skips resolving this optional peer dep.
    const pkg: string = "qrcode-terminal";
    const mod: any = await import(pkg);
    const generate = (mod.default ?? mod).generate as (
      text: string,
      opts: { small?: boolean },
      cb: (ascii: string) => void,
    ) => void;
    return await new Promise<string>((resolve) => {
      generate(qr, { small: true }, (ascii: string) => resolve(ascii));
    });
  } catch {
    return `(install 'qrcode-terminal' to render a scannable QR code)\n${qr}`;
  }
}
