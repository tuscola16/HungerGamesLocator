/**
 * Shared Start-Game preflight (#23). Pure — no web/RN imports — so the web `LobbyView`
 * (`@shared/common/startPreflight`) and the mobile GM screen (`@/common/startPreflight`)
 * enforce the same go/no-go before a game leaves the lobby.
 *
 * `blockers` are hard preconditions: without them geofencing or play itself are
 * impossible, so the GM cannot start until each is resolved. `warnings` are
 * confirm-past advisories (some joined players unlocated; no GM push token; checkpoints
 * sited too close to tell apart).
 */

import { findCloseCheckpoints } from './geo';

export interface StartPreflightInput {
  /** A play boundary has been drawn (geofence/out-of-bounds need it). */
  hasBoundary: boolean;
  /** Number of checkpoints defined (arrivals/runbook need at least one). */
  checkpointCount: number;
  /**
   * The checkpoints themselves, when the caller has them — used for the too-close
   * advisory (2026-09-06). Optional so a caller that only knows the count still works.
   */
  checkpoints?: {
    id: string; name?: string; latitude: number; longitude: number; radius?: number;
  }[];
  /** Number of joined players (a game with no players can't be played). */
  playerCount: number;
  /** A GM can receive alerts: at least one GM member holds a push token, OR the GM is
   * watching a live surface (the web dashboard passes `true` — it shows arrivals in real
   * time, so no FCM token is needed). Missing → a *warning*, not a blocker: a foregrounded
   * GM still sees alerts, so push only affects the closed-app case. */
  gmHasToken: boolean;
  /** Joined players who haven't reported a location fix yet (soft warning only). */
  unlocatedPlayerCount?: number;
  /**
   * ROADMAP #96: runbook entries that are targeted but have nobody assigned yet, and so
   * fire for nobody. Optional; omitted by callers that don't have the runbook to hand.
   */
  inertEntries?: { name?: string }[];
}

export interface StartPreflightResult {
  blockers: string[];
  warnings: string[];
}

/** Resolve the three hard Start preconditions (boundary, checkpoints, players) +
 * the soft warnings (unlocated players; no GM push token). */
export function startGamePreflight(input: StartPreflightInput): StartPreflightResult {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!input.hasBoundary) {
    blockers.push('Draw the play boundary before starting — it defines the out-of-bounds edge.');
  }
  if (input.checkpointCount <= 0) {
    blockers.push('Add at least one checkpoint before starting — there are no objectives to reach.');
  }
  if (input.playerCount <= 0) {
    blockers.push('No players have joined yet — share the player code and wait for at least one.');
  }

  const unlocated = input.unlocatedPlayerCount ?? 0;
  if (unlocated > 0) {
    warnings.push(
      `${unlocated} ${unlocated === 1 ? 'player has' : 'players have'} joined but aren’t on the map yet — they may still be granting location permission.`
    );
  }
  if (!input.gmHasToken) {
    warnings.push('No Game Master is registered for push notifications — GMs will only see alerts while actively watching the app or dashboard.');
  }

  // #96: targeted entries nobody is assigned to. **Warn, never block** — settled
  // 2026-09-06: there are mechanics where the assignee genuinely isn't known until someone
  // arrives somewhere, so starting with unassigned entries is legitimate. Targets can be
  // assigned during play, which already works. This exists because an entry that silently
  // fires for nobody is otherwise indistinguishable from one that's broken.
  const inert = input.inertEntries ?? [];
  if (inert.length > 0) {
    const shown = inert.slice(0, 3).map((e) => e.name || '(unnamed)').join(', ');
    const rest = inert.length > 3 ? `, and ${inert.length - 3} more` : '';
    warnings.push(
      `${inert.length} runbook ${inert.length === 1 ? 'entry is' : 'entries are'} targeted with nobody assigned, so ${inert.length === 1 ? 'it fires' : 'they fire'} for nobody: ${shown}${rest}. ` +
      'That may be deliberate — you can assign players mid-game.'
    );
  }

  // Checkpoints too close to tell apart (2026-09-06). A warning rather than a blocker:
  // stacking two objectives on one landmark is a legitimate design, it just shouldn't
  // happen by accident. Named pairs, because "some checkpoints overlap" is not actionable
  // on a map with twenty-five of them.
  const close = findCloseCheckpoints(input.checkpoints ?? []);
  if (close.length > 0) {
    const shown = close.slice(0, 3)
      .map((p) => `${p.a.name} and ${p.b.name} (${p.metres} m apart${p.overlapping ? ', circles overlap' : ''})`)
      .join('; ');
    const rest = close.length > 3 ? `, and ${close.length - 3} more` : '';
    warnings.push(
      `Some checkpoints are close enough that GPS can't reliably tell them apart: ${shown}${rest}. ` +
      'Players stopping between them may trip both, repeatedly — move one, or shrink its radius, unless the overlap is deliberate.'
    );
  }

  return { blockers, warnings };
}
