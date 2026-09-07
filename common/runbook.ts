import type { RunbookEntry } from '../types';

/**
 * ROADMAP #96: is this entry **inert** — meant to be player-targeted, but with nobody
 * assigned yet, so it fires for nobody?
 *
 * Pure and shared (`@/common/runbook` on mobile, `@shared/common/runbook` on web) so both
 * GM surfaces and the Start preflight agree with `entryTargetsPlayer` in
 * `functions/src/geofence.ts`. That agreement is the whole point: this state used to be
 * unrepresentable, and the previous behaviour of an unassigned targeted entry was to fire
 * for *everyone* — the exact opposite of what a GM authoring it intended.
 *
 * `targeted` absent = legacy, where `playerIds` alone decided; such an entry is never inert.
 */
export function isInertEntry(e: Pick<RunbookEntry, 'targeted' | 'playerIds'>): boolean {
  return e.targeted === true && !(Array.isArray(e.playerIds) && e.playerIds.length > 0);
}
