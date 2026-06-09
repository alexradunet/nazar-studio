// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * gateways/lock.ts — the "master lock".
 *
 * Exactly one conversation may drive Pi. Per the design, Pi runs on its own
 * dedicated WhatsApp number and you message it from your personal number; only
 * that one pre-configured owner number is accepted, everyone else is ignored.
 * The lock is inherently per-session because the whole gateway only runs while
 * Pi is open (no daemon, no RPC).
 *
 * Identity comparison is format-agnostic: WhatsApp hands us JIDs in several
 * shapes (`<num>@s.whatsapp.net`, `<num>@c.us`, `<num>:<device>@s.whatsapp.net`)
 * while the owner is configured as a phone number (`+40712345678`). We reduce
 * both to bare digits before comparing. Group JIDs (`<id>@g.us`) reduce to the
 * group id's digits and therefore never match a phone-number owner — groups are
 * never authorised, which is what we want for a single-owner lock.
 */

/** Reduce any sender/owner identifier to bare comparable digits. */
export function normalizeId(id: string | undefined | null): string {
  if (!id) return "";
  const at = id.indexOf("@");
  const beforeHost = at >= 0 ? id.slice(0, at) : id;
  const colon = beforeHost.indexOf(":");
  const local = colon >= 0 ? beforeHost.slice(0, colon) : beforeHost;
  return local.replace(/\D/g, "");
}

export class MasterLock {
  private readonly owner: string;

  constructor(owner?: string | null) {
    this.owner = normalizeId(owner);
  }

  /** Normalised owner digits ("" when unconfigured). */
  get ownerId(): string {
    return this.owner;
  }

  isConfigured(): boolean {
    return this.owner.length > 0;
  }

  /** True only for the single configured owner. Unconfigured ⇒ nobody. */
  isAuthorized(senderId: string | undefined | null): boolean {
    if (!this.isConfigured()) return false;
    const sender = normalizeId(senderId);
    return sender.length > 0 && sender === this.owner;
  }
}
