/**
 * Temporary identity reset after peer-isSelf contamination (Jul 2026).
 * Only uploads at/after this instant can confirm a tamer identity.
 * Bump the date (or remove the gate) once the reconfirm window is over.
 */
export const METER_IDENTITY_RECONFIRM_AFTER_MS = Date.parse('2026-07-27T16:00:00.000Z')

export function parseCreatedAtMs(createdAt: string | null | undefined): number {
  if (!createdAt) return 0
  const t = Date.parse(createdAt)
  return Number.isFinite(t) ? t : 0
}

/** True when this upload is eligible to confirm the signed-in tamer identity. */
export function parseConfirmsMeterIdentity(createdAt: string | null | undefined): boolean {
  return parseCreatedAtMs(createdAt) >= METER_IDENTITY_RECONFIRM_AFTER_MS
}
