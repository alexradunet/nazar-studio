// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * gateways/lock.ts — the "master lock".
 *
 * Exactly one conversation may drive Balaur. A gateway runs under its own chat
 * identity, and only the configured owner id is accepted; everyone else is ignored.
 * The lock is inherently per-session because the whole gateway only runs while
 * Pi is open (no daemon, no RPC).
 *
 * Identity comparison is format-agnostic: adapters may hand us JID-like values
 * (`<id>@host`, `<id>:<device>@host`) while config usually stores a bare owner id.
 * We reduce both to bare digits before comparing. Group-style ids reduce to the
 * group id's digits and therefore never match a phone-number owner.
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
  private readonly aliases: Set<string>;

  constructor(owner?: string | null, aliases: readonly string[] = []) {
    this.owner = normalizeId(owner);
    this.aliases = new Set(aliases.map(normalizeId).filter(Boolean));
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
    return sender.length > 0 && (sender === this.owner || this.aliases.has(sender));
  }
}
