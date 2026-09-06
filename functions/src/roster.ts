import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

/**
 * The player-readable roster projection (ROADMAP #88).
 *
 * Players cannot read each other's member docs — those carry `email` and `fcmToken` — so a
 * roster can't come from a relaxed rule. It comes from a projection, the same shape as
 * `markers` for checkpoints and `Game.winnerName` for the winner (#81).
 *
 * Two modes over one collection:
 *  - **during play** — living players only. An elimination *removes* the row instead of
 *    flagging it, so a client can never leak or scoreboard what it was never sent. This
 *    set is also what the #99 spectator map filters `locations` against.
 *  - **after the game (and through `cleanup`, #84)** — everyone who ever played, stamped
 *    with `playedMs` so the standings sort client-side without member access.
 *
 * GMs are never listed in either mode.
 */

interface MemberLike {
  userId?: string;
  role?: 'player' | 'gm';
  displayName?: string;
  out?: boolean;
  outAt?: admin.firestore.Timestamp | null;
  sos?: boolean;
}

/** Phases in which the roster lists *everyone who played* rather than only the living. */
const FULL_ROSTER_PHASES = new Set(['cleanup', 'results']);

/** Resolve a game's phase exactly as the clients' `gamePhase()` helper does. */
function phaseOf(game: FirebaseFirestore.DocumentData | undefined): string {
  if (!game) return 'setup';
  if (game.phase) return String(game.phase);
  return game.status === 'ended' ? 'results' : 'play';
}

/**
 * How long this member's run lasted: start → their own `outAt`, else the game's `endedAt`.
 * Null when the game never started (nothing to measure) or when a survivor's game has no
 * end stamp yet.
 */
function playedMsFor(
  member: MemberLike,
  startedAt: admin.firestore.Timestamp | null | undefined,
  endedAt: admin.firestore.Timestamp | null | undefined
): { playedMs: number | null; endedAtStamp: admin.firestore.Timestamp | null } {
  if (!startedAt) return { playedMs: null, endedAtStamp: null };
  const end = member.out && member.outAt ? member.outAt : endedAt ?? null;
  if (!end) return { playedMs: null, endedAtStamp: null };
  // Clamp at zero: a clock skew or a backdated stamp must not produce a negative run that
  // sorts a player above the winner.
  return { playedMs: Math.max(0, end.toMillis() - startedAt.toMillis()), endedAtStamp: end };
}

/**
 * Re-project the whole roster for a game. Idempotent and cheap (a game is a dozen docs),
 * which is why every caller just runs it rather than trying to compute a delta — the
 * living/everyone switch flips the meaning of every row at once, so a delta would have to
 * re-read the roster anyway.
 */
export async function projectRoster(
  gameRef: FirebaseFirestore.DocumentReference
): Promise<void> {
  const db = admin.firestore();
  const [gameSnap, membersSnap, rosterSnap] = await Promise.all([
    gameRef.get(),
    gameRef.collection('members').get(),
    gameRef.collection('roster').get(),
  ]);

  const game = gameSnap.data();
  const phase = phaseOf(game);
  const listEveryone = FULL_ROSTER_PHASES.has(phase);
  const startedAt = (game?.startedAt ?? null) as admin.firestore.Timestamp | null;
  const endedAt = (game?.endedAt ?? null) as admin.firestore.Timestamp | null;

  const members = membersSnap.docs.map((d) => ({
    ...(d.data() as MemberLike),
    userId: (d.data() as MemberLike).userId ?? d.id,
  }));

  // GMs are never listed. Note this uses the member's *current* role, so a player promoted
  // to GM mid-game drops out of the standings — the residual case #91 keeps its number for.
  const players = members.filter((m) => m.role !== 'gm');
  const wanted = players.filter((m) => listEveryone || !m.out);

  const batch = db.batch();
  const keep = new Set<string>();

  for (const m of wanted) {
    const uid = m.userId!;
    keep.add(uid);
    const row: Record<string, unknown> = {
      userId: uid,
      displayName: m.displayName ?? 'Player',
      sos: m.sos === true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (listEveryone) {
      const { playedMs, endedAtStamp } = playedMsFor(m, startedAt, endedAt);
      row.out = m.out === true;
      if (playedMs != null) row.playedMs = playedMs;
      if (endedAtStamp) row.endedAt = endedAtStamp;
    }
    // A full `set` rather than a merge: the during-play rows must not keep a `playedMs` a
    // previous results-phase projection left behind (the #21 revive path reopens a finished
    // game straight back into `play`).
    batch.set(gameRef.collection('roster').doc(uid), row);
  }

  // Anything no longer wanted is DELETED, not flagged — during play that is exactly how an
  // elimination is expressed, and it is the reason a client can't scoreboard the dead.
  for (const doc of rosterSnap.docs) {
    if (!keep.has(doc.id)) batch.delete(doc.ref);
  }

  await batch.commit();
}

/**
 * Keep the roster in step with membership. Rides the same `onWrite` the death toll and SOS
 * fan-out already use, so there is no new trigger and no new fan-out — every membership
 * change, elimination, revive, rename, promotion and SOS already lands here.
 */
export const onMemberWriteProjectRoster = functions.firestore
  .document('games/{gameId}/members/{userId}')
  .onWrite(async (_change, context) => {
    const gameRef = admin.firestore().collection('games').doc(context.params.gameId);
    try {
      await projectRoster(gameRef);
    } catch (e) {
      functions.logger.error(`[roster] projection failed for ${context.params.gameId}`, e);
    }
  });

/**
 * Re-project on the phase transitions that change what the roster *means*: entering
 * `cleanup` or `results` switches it from "the living" to "everyone who played, with their
 * times", and the #21 revive (results → play) switches it back.
 */
export const onGamePhaseProjectRoster = functions.firestore
  .document('games/{gameId}')
  .onUpdate(async (change, context) => {
    const beforePhase = phaseOf(change.before.data());
    const afterPhase = phaseOf(change.after.data());
    if (beforePhase === afterPhase) return;
    // Only the transitions that cross the living/everyone boundary matter; the rest of the
    // phase steps (setup → lobby → play) leave the projection identical.
    if (FULL_ROSTER_PHASES.has(beforePhase) === FULL_ROSTER_PHASES.has(afterPhase)) return;
    const gameRef = admin.firestore().collection('games').doc(context.params.gameId);
    try {
      await projectRoster(gameRef);
    } catch (e) {
      functions.logger.error(`[roster] phase projection failed for ${context.params.gameId}`, e);
    }
  });
