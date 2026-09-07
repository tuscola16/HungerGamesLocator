import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { sendPushToTokens, sendClassPush } from './notifications';
import { sendArrivalSMS, TWILIO_SECRETS } from './sms';

interface MemberData {
  userId?: string;
  /** #87: push classes this member never wants. */
  mutedNotifications?: string[];
  role?: 'player' | 'gm';
  displayName?: string;
  fcmToken?: string;
  phone?: string;
  out?: boolean;
  sos?: boolean;
}

/** Seconds to wait before crowning a winner, so near-simultaneous deaths (Rule 17,
 * "if blows land simultaneously you are both dead") settle before we re-read the
 * roster. Without this, the first death to fire could crown a player who is dying
 * in the same instant. */
const WINNER_GRACE_MS = 3000;

/** Did a boolean flag flip from falsy → true between two member snapshots? */
function rose(before: MemberData | undefined, after: MemberData | undefined, key: 'out' | 'sos'): boolean {
  return !!after?.[key] && !before?.[key];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Server-authoritative reactions to a member doc changing:
 *  - A player became `out` → write a "death" broadcast and, after a short grace,
 *    re-check the roster in a transaction; if exactly one player is left and the
 *    game is still active, declare a winner + end the game (Rules 1, 2, 8, 16, 17).
 *  - A player raised `sos` → push + SMS the alert to all GMs (Rules 22, 27, 28).
 */
export const onMemberWrite = functions
  // Bind Twilio secrets so the SOS SMS path can read them from process.env (#25).
  .runWith({ secrets: TWILIO_SECRETS })
  .firestore.document('games/{gameId}/members/{userId}')
  .onWrite(async (change, context) => {
    const { gameId } = context.params;
    const before = change.before.exists ? (change.before.data() as MemberData) : undefined;
    const after = change.after.exists ? (change.after.data() as MemberData) : undefined;
    if (!after) return; // member removed — nothing to announce

    const gameRef = admin.firestore().collection('games').doc(gameId);

    if (rose(before, after, 'out') && after.role !== 'gm') {
      await handleDeath(gameRef, after);
    }

    if (rose(before, after, 'sos')) {
      await handleSos(gameRef, after);
    }
  });

async function handleDeath(
  gameRef: FirebaseFirestore.DocumentReference,
  player: MemberData
): Promise<void> {
  const db = admin.firestore();

  // Immediate death broadcast + push (informational; count may shift slightly if
  // another death lands during the grace window — that's fine for the toll text).
  const membersSnap = await gameRef.collection('members').get();
  const livingNonGm = membersSnap.docs
    .map((d) => d.data() as MemberData)
    .filter((m) => m.role !== 'gm' && !m.out);
  const livingCount = livingNonGm.length;

  // #26 Idempotency invariant: onWrite can be retried after a partial run, so the
  // death toll is written at a DETERMINISTIC id (`${userId}_death`) inside a
  // transaction that no-ops if it already exists. The push fires only on the first
  // (real) post, so a retry can't double-toll or double-push. Winner detection below
  // still runs on every invocation — it is independently idempotent (its own
  // transaction bails once `status === 'ended'`). (#21 revive deletes this doc so a
  // re-elimination after a revive can toll afresh.)
  const playerId = player.userId ?? 'unknown';
  const tollRef = gameRef.collection('broadcasts').doc(`${playerId}_death`);
  const name = player.displayName ?? 'A tribute';
  const posted = await db.runTransaction(async (t) => {
    const snap = await t.get(tollRef);
    if (snap.exists) return false; // a retry — toll already posted
    t.set(tollRef, {
      kind: 'death',
      message: `${name} has fallen — ${livingCount} ${livingCount === 1 ? 'tribute remains' : 'tributes remain'}.`,
      targetPlayerId: null,
      pushed: true, // #69: pushed below, so onBroadcastCreate skips it
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  });
  if (posted) {
    // #87: the toll is a mutable class — it fires on every death and some players would
    // rather find out in person.
    await sendClassPush(
      livingNonGm.map((m) => ({ fcmToken: m.fcmToken, mutedNotifications: m.mutedNotifications })),
      'death', '☠️ A tribute has fallen', `${livingCount} remaining`, 'broadcasts'
    );
  }

  // Winner detection only kicks in once the field could plausibly be at the threshold;
  // skip the expensive grace+transaction otherwise.
  const gameSnap = await gameRef.get();
  const cfg = (gameSnap.data()?.config ?? {}) as {
    winnerDetection?: boolean;
    autoEndThreshold?: string;
  };
  // Resolve threshold: explicit setting wins; legacy winnerDetection:false → 'manual'.
  const threshold = cfg.autoEndThreshold ?? (cfg.winnerDetection === false ? 'manual' : 'one');
  if (threshold === 'manual') return;
  if (threshold === 'one' && livingCount > 1) return;
  if (threshold === 'zero' && livingCount > 0) return;

  // Let simultaneous deaths settle, then decide atomically.
  await sleep(WINNER_GRACE_MS);

  const ended = await db.runTransaction(async (t) => {
    const gSnap = await t.get(gameRef);
    // #84: `status` alone no longer says "decided" — a game in `cleanup` has a victor but
    // is still active, and a second death landing after the auto-advance must not re-crown.
    // Both conditions, or the transaction becomes non-idempotent the moment cleanup exists.
    const g = gSnap.data();
    if (!gSnap.exists || g?.status === 'ended' || g?.phase === 'cleanup') return false;

    const mSnap = await t.get(gameRef.collection('members'));
    const living = mSnap.docs
      // Keep the doc id — it IS the userId, and we stamp it as the winner below (#81).
      .map((d) => ({ ...(d.data() as MemberData), userId: (d.data() as MemberData).userId ?? d.id }))
      .filter((m) => m.role !== 'gm' && !m.out);

    // Re-check the threshold with fresh data (another death may have landed).
    if (threshold === 'one' && living.length > 1) return false;
    if (threshold === 'zero' && living.length > 0) return false;

    const bRef = gameRef.collection('broadcasts').doc();
    if (threshold === 'one' && living.length === 1) {
      t.set(bRef, {
        kind: 'winner',
        message: `${living[0].displayName ?? 'The last tribute'} is the winner! 🏆`,
        targetPlayerId: null,
        pushed: true, // #69: winner stays in-app (preserve prior no-push behavior)
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      // Zero survivors (simultaneous final blows, Rule 17; or 'zero' threshold).
      t.set(bRef, {
        kind: 'winner',
        message: 'All tributes have fallen — there is no winner.',
        targetPlayerId: null,
        pushed: true, // #69: winner stays in-app (preserve prior no-push behavior)
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    // #81: stamp the sole survivor so the results screen can tell everyone (the winner
    // especially) who took the crown. Only the single-winner case; zero survivors leaves
    // it unset. `winnerName` is denormalized because players can't read other members.
    const winner = threshold === 'one' && living.length === 1 ? living[0] : null;
    // #84: the last death declares a **victor**, it does not close the game. Advance to
    // `cleanup` with `status` left `'active'`, so tracking, the boundary alert and SOS keep
    // running while everyone is still in the woods collecting props and walking out. The
    // GM closes it by hand when the recovery job is actually done — and `endedAt` is
    // stamped there, not here, so a player's results time reflects the game rather than
    // however long cleanup took.
    t.update(gameRef, {
      phase: 'cleanup',
      cleanupStartedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(winner ? { winnerId: winner.userId, winnerName: winner.displayName ?? null } : {}),
    });
    return true;
  });

  // #28 Audit trail: winner detection just auto-ended the game (a fleet-wide destructive
  // transition). The cleanup trigger logs the `status → ended` fact too; this records that
  // it was the *automatic* path, not a GM tap.
  if (ended) {
    functions.logger.info(`[audit] game ${gameRef.id} auto-ended by winner detection (threshold '${threshold}')`);
  }
}

/**
 * Fan a safety alert out to everyone who can respond to it (#94).
 *
 * **Recipients: every GM, plus every player already out of the game — never a living
 * player.** The dead are the standing rescue crew: they are off the board, already walking
 * out of the arena, and (with #99) hold a map showing the boundary and every checkpoint, so
 * they can reach someone faster than a GM at the far end of the woods. Living players are
 * excluded because reaching a casualty would mean walking to them, and a safety alert must
 * never become a hunting beacon.
 *
 * The alert reads identically whoever sent it, alive or dead — it means one thing.
 */
async function handleSos(
  gameRef: FirebaseFirestore.DocumentReference,
  player: MemberData
): Promise<void> {
  // One roster read instead of a filtered query: the `out` half can't be expressed as an
  // equality on a field that is absent on living members, and a game roster is a dozen docs.
  const membersSnap = await gameRef.collection('members').get();
  const members = membersSnap.docs.map((d) => ({
    ...(d.data() as MemberData),
    userId: (d.data() as MemberData).userId ?? d.id,
  }));

  const gms = members.filter((m) => m.role === 'gm');
  // Never echo the alert back to the sender — a dead player raising their own SOS should not
  // get their own push. Identified by uid, since the doc id IS the uid.
  const deadPlayers = members.filter(
    (m) => m.role !== 'gm' && m.out === true && m.userId !== player.userId
  );

  // #87: SOS is deliberately still `sendPushToTokens`, not `sendClassPush`. A safety alert
  // is not mutable, and routing it through the class filter at all would make that a matter
  // of one string being right rather than of the code having no way to drop it.
  const tokens = [...gms, ...deadPlayers].map((m) => m.fcmToken).filter((t): t is string => !!t);
  // SMS stays GM-only. It is the escalation channel of last resort (a muted or asleep phone,
  // Rule 25) and it costs real money per message; a dead player already has the push and is
  // holding the app. Widening it is a Twilio bill, not a safety improvement.
  const gmPhones = gms.map((m) => m.phone).filter((p): p is string => !!p);

  const name = player.displayName ?? 'A player';
  const body = `${name} needs assistance`;
  // Push + SMS in parallel: a muted/asleep phone (Rule 25) shouldn't swallow a
  // safety alert, and Outdoor GM is now the only safety channel (replaces Pingo).
  await Promise.allSettled([
    sendPushToTokens(tokens, '🆘 Safety alert', body, 'arrivals'),
    sendArrivalSMS(gmPhones, `SAFETY ALERT: ${body}`),
  ]);
}
