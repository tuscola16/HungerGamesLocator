import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { projectMarker, type CheckpointDoc } from './markers';

/**
 * Entering the `cleanup` phase (ROADMAP #84) — the state between "victor declared" and
 * "game closed".
 *
 * `endGame()` used to collapse those two moments into one write, so the instant a winner
 * was called the map went cold and the recovery job — every prop off every checkpoint, and
 * every person accounted for in the dark — happened with no tooling at all. This function
 * owns everything the server does at that moment:
 *
 *  1. **Stamp the winner**, because the winner is announced at victory now, not at close.
 *  2. **Project every checkpoint into `markers`**, so people can navigate to what they're
 *     recovering. It reuses the existing reveal plumbing rather than adding a second
 *     collection, and the marker still carries name/icon/location only — never the runbook
 *     behavior, which stays GM-only even now.
 *  3. **Purge the ration photos.** They have proved what they were going to prove. This is
 *     the half of `cleanupRationPhotosOnGameEnd` that moves *earlier*; the location and
 *     arrival purge stays at the close, because finding people and drops is what this phase
 *     is for.
 *
 * **No push.** People who have already gone home are not being summoned back.
 */

/** Resolve a game's phase the same way the clients' `gamePhase()` helper does. */
function phaseOf(g: admin.firestore.DocumentData | undefined): string {
  if (!g) return 'setup';
  if (g.phase) return String(g.phase);
  return g.status === 'ended' ? 'results' : 'play';
}

export const onGameCleanupStart = functions.firestore
  .document('games/{gameId}')
  .onUpdate(async (change, context) => {
    const before = phaseOf(change.before.data());
    const after = phaseOf(change.after.data());
    if (after !== 'cleanup' || before === 'cleanup') return; // only the transition in

    const { gameId } = context.params;
    const db = admin.firestore();
    const gameRef = db.collection('games').doc(gameId);

    functions.logger.info(`[cleanup] game ${gameId} entered recovery (from ${before})`);

    // --- 1. Crown the victor -------------------------------------------------------
    // Winner detection (members.ts) stamps `winnerId` in its own transaction when a last
    // death auto-advances the game; a GM who opened recovery by hand has not. Fill it in
    // here, skipping if already set so the auto path is never overwritten. Wrapped so a
    // failure can't block the photo purge below.
    try {
      if ((change.after.data()?.winnerId ?? null) == null) {
        const members = await gameRef.collection('members').get();
        const living = members.docs
          .map((d) => ({ userId: d.id, ...(d.data() as { role?: string; out?: boolean; displayName?: string }) }))
          .filter((m) => m.role !== 'gm' && !m.out);
        if (living.length === 1) {
          await gameRef.update({
            winnerId: living[0].userId,
            winnerName: living[0].displayName ?? null,
          });
          // Deterministic id so a re-fired trigger UPDATES rather than re-creating —
          // onBroadcastCreate is onCreate, so the winner is pushed at most once.
          await gameRef.collection('broadcasts').doc(`winner_push_${living[0].userId}`).set({
            kind: 'winner',
            message: 'You survived them all — you win! 🏆',
            targetPlayerId: living[0].userId,
            pushed: false, // let onBroadcastCreate deliver it to the winner's device
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          functions.logger.info(`[cleanup] game ${gameId} crowned ${living[0].userId} at victory`);
        }
      }
    } catch (e) {
      functions.logger.error(`[cleanup] winner stamp failed for ${gameId} — recovery continues`, e);
    }

    // --- 2. Light the whole arena --------------------------------------------------
    // Every checkpoint becomes a player-readable marker with `audiencePlayerIds: null`, so
    // a site that was hidden all game becomes navigable exactly when recovery begins.
    try {
      const cps = await gameRef.collection('checkpoints').get();
      await Promise.allSettled(
        cps.docs.map((d) => projectMarker(db, gameId, d.id, d.data() as CheckpointDoc, null))
      );
      functions.logger.info(`[cleanup] game ${gameId} revealed ${cps.size} checkpoints for recovery`);
    } catch (e) {
      functions.logger.error(`[cleanup] marker projection failed for ${gameId}`, e);
    }

    // --- 3. The ration photos have done their job ----------------------------------
    // Moved here from the close transition: a meal photo proves a player ate during play,
    // and there is nothing left to verify once a victor has been declared. Locations and
    // arrivals deliberately do NOT move — cleanup needs them.
    await Promise.allSettled([
      admin.storage().bucket().deleteFiles({ prefix: `games/${gameId}/rations/`, force: true }),
    ]);
    functions.logger.info(`[cleanup] cleared ration photos for ${gameId} at victory`);
  });

/**
 * Clear the winner stamp whenever a decided game is reopened into `play` (#84) — a GM
 * stepping back out of recovery because a victory was called wrong, or a #21 revive
 * undoing the death that triggered it.
 *
 * This lives on the server so `winnerId`/`winnerName` can stay outside the GM's writable
 * key set in `firestore.rules`. The clients only move the phase; the crown comes off here.
 * The stale winner *broadcast* is deliberately left alone — the correcting broadcast the
 * revive posts covers it, and retracting a message people already read is worse than
 * letting it stand.
 */
export const onGameReopen = functions.firestore
  .document('games/{gameId}')
  .onUpdate(async (change, context) => {
    const before = phaseOf(change.before.data());
    const after = phaseOf(change.after.data());
    if (after !== 'play' || before === 'play') return;
    // Only a *decided* game has a crown to remove; setup/lobby → play is Start Game.
    if (before !== 'cleanup' && before !== 'results') return;
    if ((change.after.data()?.winnerId ?? null) == null) return;
    await admin.firestore().collection('games').doc(context.params.gameId).update({
      winnerId: null,
      winnerName: null,
    });
    functions.logger.info(
      `[cleanup] game ${context.params.gameId} reopened from ${before} — winner stamp cleared`
    );
  });
