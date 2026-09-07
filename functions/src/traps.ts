import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { sendClassPush } from './notifications';

/**
 * Player-armed traps (ROADMAP #97) — the arming half.
 *
 * The GM pre-sets traps; a player finds a physical **trap kit**, usually a card, that names
 * one of them, and arms it where and when they choose. The player supplies only the *site*
 * and the *exclusions* — never the text, never the effect. That is what keeps Rule 23
 * intact (no player-authored text ever reaches another player) while still letting players
 * aim effects at each other.
 *
 * **This callable is the only write path**, because `runbook` is and stays GM-write-only in
 * firestore.rules: a player who could write those docs could read every trap in the game.
 * It takes a code and returns success or failure, and it never lists kits — a player holding
 * one card must not be able to arm a trap they never found.
 */

/**
 * #97: how close the arming player must be to a checkpoint to deploy a kit there. Not
 * standing exactly on it — #82 measured why GPS in these woods can't support tighter.
 * Mirrors `TRAP_ARM_RADIUS_M` in types/index.ts (functions/ can't import the shared types).
 */
const TRAP_ARM_RADIUS_M = 100;

/** Haversine distance in metres. Mirrors `distanceMeters` in geofence.ts. */
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dPhi = ((lat2 - lat1) * Math.PI) / 180;
  const dLambda = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Arm a trap kit at the checkpoint the caller is standing nearest to.
 *
 * `{ gameId, code, excludePlayerIds? }` -> `{ armed: true, checkpointName }`.
 *
 * **The site is resolved server-side** from the caller's own last location fix rather than
 * being passed in: the player picks where by standing there, and this way the arming UI
 * never has to be handed a list of checkpoint coordinates to choose from.
 */
export const armPlayerTrap = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const uid = context.auth.uid;
  const gameId = String(data?.gameId ?? '').trim();
  // Normalized the same way the join codes are: uppercase, no whitespace. A card read in
  // the dark and typed with cold hands should not fail on case.
  const code = String(data?.code ?? '').trim().toUpperCase().replace(/\s+/g, '');
  const excludeRaw: string[] = Array.isArray(data?.excludePlayerIds)
    ? data.excludePlayerIds.map((x: unknown) => String(x))
    : [];

  if (!gameId || !code) {
    throw new functions.https.HttpsError('invalid-argument', 'A game and a kit code are required.');
  }

  const db = admin.firestore();
  const gameRef = db.collection('games').doc(gameId);

  const [gameSnap, memberSnap, locSnap] = await Promise.all([
    gameRef.get(),
    gameRef.collection('members').doc(uid).get(),
    gameRef.collection('locations').doc(uid).get(),
  ]);

  if (!gameSnap.exists) throw new functions.https.HttpsError('not-found', 'That game no longer exists.');
  const game = gameSnap.data() ?? {};
  const phase = game.phase ?? (game.status === 'ended' ? 'results' : 'play');
  // `endgame` counts as play: it is a labelled stretch of the same live game, checkpoints
  // still fire there, and refusing would strand a kit found in the last twenty minutes.
  if (phase !== 'play' && phase !== 'endgame') {
    throw new functions.https.HttpsError('failed-precondition', 'The game is not running.');
  }

  const member = memberSnap.exists ? memberSnap.data() ?? {} : null;
  if (!member) throw new functions.https.HttpsError('permission-denied', 'You are not in this game.');
  if (member.role === 'gm') {
    throw new functions.https.HttpsError('failed-precondition', 'Trap kits are armed by players, not GMs.');
  }
  if (member.out === true) {
    throw new functions.https.HttpsError('failed-precondition', 'You are out of the game.');
  }

  // The proximity check runs against the player's OWN last fix — the same data the geofence
  // already trusts, and the reason a phone left in the car park cannot arm a trap.
  const loc = locSnap.exists ? locSnap.data() ?? {} : null;
  if (!loc || typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'We do not have your location yet — wait for your map to find you and try again.'
    );
  }

  // Resolve the kit. Deliberately a lookup by code, never a listing: a wrong code is
  // indistinguishable from a code for a trap somebody else already armed.
  const kits = await gameRef.collection('runbook').where('trapKitCode', '==', code).limit(1).get();
  if (kits.empty) {
    throw new functions.https.HttpsError('not-found', 'That kit code is not valid for this game.');
  }
  const kitRef = kits.docs[0].ref;

  // Nearest checkpoint within the arming radius. Read outside the transaction — checkpoints
  // do not move during play, and keeping the txn to the kit doc keeps the single-use race
  // window narrow.
  const cps = await gameRef.collection('checkpoints').get();
  let best: { id: string; name: string; metres: number } | null = null;
  for (const d of cps.docs) {
    const c = d.data();
    if (typeof c.latitude !== 'number' || typeof c.longitude !== 'number') continue;
    const metres = distanceMeters(loc.latitude, loc.longitude, c.latitude, c.longitude);
    if (metres <= TRAP_ARM_RADIUS_M && (!best || metres < best.metres)) {
      best = { id: d.id, name: (c.name as string) ?? 'a site', metres: Math.round(metres) };
    }
  }
  if (!best) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'You are not close enough to a site to set this. Get within about 100 m of one and try again.'
    );
  }
  const site = best;

  // Exclusions must name real members. The armer is excluded by the geofence regardless of
  // this list, so silently dropping their own uid is not a rejection.
  const memberIds = new Set((await gameRef.collection('members').get()).docs.map((d) => d.id));
  const requested = new Set(excludeRaw);
  requested.delete(uid);
  const excludePlayerIds = [...requested].filter((id) => memberIds.has(id));
  if (excludePlayerIds.length !== requested.size) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'One of the players you picked is not in this game.'
    );
  }

  const armedName = (member.displayName as string) ?? 'A player';

  // Single-use is enforced here: the transaction re-reads the kit and refuses if it has
  // already been armed, so two players racing the same card cannot both deploy it. That
  // single-use property IS the quota mechanism — the number of traps in play is bounded by
  // how many cards the GM physically put out, not by any per-player limit.
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(kitRef);
    if (!fresh.exists) {
      throw new functions.https.HttpsError('not-found', 'That kit no longer exists.');
    }
    if (fresh.data()?.armedAt) {
      throw new functions.https.HttpsError('failed-precondition', 'That kit has already been used.');
    }
    tx.update(kitRef, {
      checkpointId: site.id,
      excludePlayerIds,
      armedBy: uid,
      armedByName: armedName,
      armedAt: admin.firestore.FieldValue.serverTimestamp(),
      // #96: the kit sat inert while undeployed, so it could never fire before being placed.
      // Arming is what makes it live — for anyone except the armer and the people they spared.
      targeted: false,
      playerIds: null,
    });
  });

  // **The GM sees it; nobody else does.** This is the first feature where one player's
  // action changes what another player runs into, so it is deliberately visible and
  // reversible — a GM disarms by clearing `armedBy`/`armedAt` through the normal GM write
  // path. The armer is never told if or when it fires, or on whom: with a real trap you
  // would have to watch it happen, and the mechanic matches.
  await Promise.allSettled([
    gameRef.collection('broadcasts').add({
      kind: 'gm-message',
      audience: 'gm-only',
      message: `Trap armed: ${armedName} set one at ${site.name}${
        excludePlayerIds.length ? ` (sparing ${excludePlayerIds.length})` : ''
      }.`,
      targetPlayerId: '__gm__',
      pushed: true, // pushed directly below, so onBroadcastCreate skips it
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }),
    (async () => {
      const gms = await gameRef.collection('members').where('role', '==', 'gm').get();
      const recipients = gms.docs
        .map((d) => d.data())
        .filter((m) => !!m.fcmToken)
        .map((m) => ({
          fcmToken: m.fcmToken as string,
          mutedNotifications: (m.mutedNotifications as string[] | undefined) ?? null,
        }));
      // #87: classed as a GM message — a GM running a game without trap kits never sees one
      // of these anyway, and one who does can mute the class with the rest of the chatter.
      await sendClassPush(recipients, 'gm-message', 'Trap armed', `${armedName} set a trap at ${site.name}`, 'arrivals');
    })(),
  ]);

  functions.logger.info(`[traps] ${uid} armed a kit at ${site.id} in game ${gameId}`, {
    gameId, armedBy: uid, checkpointId: site.id, spared: excludePlayerIds.length,
  });

  // Deliberately returns the site NAME and nothing else — not the effect, not who else is
  // exposed, not whether anyone has tripped it.
  return { armed: true, checkpointName: site.name };
});
