// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * gateways/whatsapp/socket.ts — the Baileys binding.
 *
 * Baileys is an OPTIONAL peer dependency, dynamically imported here so the rest
 * of nazar (and users who never enable WhatsApp) don't load it. We type only the
 * slice of the socket we actually use (WASocketLike), which lets the gateway
 * typecheck and unit-test against a fake socket without Baileys installed. The
 * default factory does the real dynamic import + multi-file-auth session.
 */

export interface WAMessageKeyLike {
  remoteJid?: string | null;
  fromMe?: boolean | null;
  id?: string | null;
  participant?: string | null;
}

export interface WAMessageLike {
  key: WAMessageKeyLike;
  message?: Record<string, any> | null;
  pushName?: string | null;
  messageTimestamp?: number | { toNumber?: () => number; low?: number } | null;
}

/** The subset of Baileys' WASocket that the gateway depends on. */
export interface WASocketLike {
  ev: { on(event: string, listener: (arg: any) => void): void };
  sendMessage(jid: string, content: { text: string }): Promise<{ key?: WAMessageKeyLike } | undefined>;
  sendPresenceUpdate(presence: string, jid?: string): Promise<void>;
  readMessages(keys: WAMessageKeyLike[]): Promise<void>;
  requestPairingCode?(phoneNumber: string): Promise<string>;
  end?(error?: Error | undefined): void;
  logout?(message?: string): Promise<void>;
}

export interface CreateSocketResult {
  socket: WASocketLike;
  saveCreds: () => Promise<void>;
  /** Whether the persisted session is already linked (skip QR/pairing). */
  registered: boolean;
}

export interface CreateSocketOptions {
  sessionDir: string;
}

export type SocketFactory = (opts: CreateSocketOptions) => Promise<CreateSocketResult>;

/** A pino-shaped no-op logger so Baileys stays silent inside the TUI. */
function silentLogger(): any {
  const noop = () => {};
  const logger: any = { level: "silent", trace: noop, debug: noop, info: noop, warn: noop, error: noop, fatal: noop };
  logger.child = () => logger;
  return logger;
}

/** Default factory: dynamically import Baileys and open a multi-file-auth socket. */
export const createBaileysSocket: SocketFactory = async ({ sessionDir }) => {
  let mod: any;
  try {
    // Non-literal specifier: keeps tsc from resolving this optional peer dep at
    // build time (it may not be installed), while Node resolves it at runtime.
    const pkg: string = "baileys";
    mod = await import(pkg);
  } catch (err) {
    throw new Error(
      `WhatsApp gateway requires the optional 'baileys' package. Install it (e.g. \`npm i baileys\`) and restart Pi. Original error: ${String(err)}`,
    );
  }
  // Baileys is CommonJS; tolerate default/named interop shapes across bundlers.
  const makeWASocket = mod.default?.default ?? mod.default ?? mod.makeWASocket;
  const useMultiFileAuthState = mod.useMultiFileAuthState ?? mod.default?.useMultiFileAuthState;
  const Browsers = mod.Browsers ?? mod.default?.Browsers;
  if (typeof makeWASocket !== "function" || typeof useMultiFileAuthState !== "function") {
    throw new Error("Unexpected 'baileys' module shape; check the installed Baileys version.");
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const socket: WASocketLike = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: Browsers?.appropriate ? Browsers.appropriate("Nazar") : ["Nazar", "Chrome", "121.0.0"],
    markOnlineOnConnect: false,
    syncFullHistory: false,
    logger: silentLogger(),
  });

  return { socket, saveCreds, registered: Boolean(state?.creds?.registered) };
};
