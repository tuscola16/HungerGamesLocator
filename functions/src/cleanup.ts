import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

/**
 * Clean up a game's transient, location-bearing data when it CLOSES — on the
 * `status → 'ended'` transition.
 *
 *   • **Location & arrival data** (#30) is a privacy/retention liability for a
 *     location-tracking app and would otherwise persist forever for every finished
 *     game. `locations/*` (each player's last GPS fix + name) and `arrivals/*`
 *     (checkpoint crossings with coordinates) are deleted here. Neither is shown on
 *     the results screens (which read member docs), so removing them is safe.
 *   • **Ration photos** are *no longer* deleted here — see below.
 *
 * Doing this on the end transition (instead of a scheduled job) needs no Cloud
 * Scheduler.
 *
 * > **#84 split this function in two.** It used to purge the ration photos *and* the
 * > locations/arrivals on the same transition, but those now belong at different moments.
 * > **Ration photos are deleted at victory** (entering `cleanup`, in `cleanupPhase.ts`) —
 * > they have proved what they were going to prove. **Locations and arrivals survive until
 * > close**, because finding people and drops in the dark is exactly what cleanup is for.
 * > The winner stamp moved to the victory transition for the same reason; what remains here
 * > is the fallback for a game closed **straight from `play`**, which is still a supported
 * > path and the one an old client takes.
 *
 * NOTE: the function keeps its original deployed name to avoid orphaning a deployed
 * trigger, even though it no longer purges ration photos at all.
 */
export const cleanupRationPhotosOnGameEnd = functions.firestore
  .document('games/{gameId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    // endGame() stamps status:'ended'. Act only on the transition into it, so the
    // many other game-doc updates (config edits, phase steps) are no-ops.
    if (after?.status !== 'ended' || before?.status === 'ended') return;

    const { gameId } = context.params;
    const db = admin.firestore();
    const gameRef = db.collection('games').doc(gameId);

    // #43: a practice game is disposable — when it ends, delete the whole thing (doc + all
    // subcollections) and its Storage photos, so a season of throwaway rehearsals doesn't
    // accumulate. This supersedes the targeted cleanup below.
    if (after?.practice === true) {
      functions.logger.info(`[cleanupOnGameEnd] practice game ${gameId} ended — deleting it entirely`);
      await Promise.allSettled([
        admin.storage().bucket().deleteFiles({ prefix: `games/${gameId}/`, force: true }),
        db.recursiveDelete(gameRef),
      ]);
      return;
    }

    // #28 Audit trail: log every game-end (a fleet-wide destructive transition) at the
    // single chokepoint they all flow through — GM-initiated End Game *and* winner-detection
    // auto-end both land here on `status → ended`. (The Firestore trigger carries no auth
    // context, so we log the transition fact, not the actor.)
    functions.logger.info(`[audit] game ${gameId} ended — destructive transition (phase ${before?.phase ?? '?'} → results)`, {
      gameId,
      name: after?.name ?? null,
      endedAt: after?.endedAt ?? null,
    });

    // #81: crown the last tribute standing AND notify them. `winnerId` is stamped by winner
    // detection (members.ts) in its transaction on the auto (last-death) path, and by
    // `onGameCleanupStart` (#84) when a GM opens recovery; on a game closed straight from
    // play we compute it here. Either way, send the winner a TARGETED push so they learn
    // they won even on an OLDER app build that has no "YOU WON" results screen yet — the existing
    // onBroadcastCreate delivers it to just their device, and BroadcastsContext only surfaces a
    // targeted broadcast to its recipient, so it never leaks to the other players. All wrapped so
    // nothing here can block the privacy cleanup below (the #30 purge is the load-bearing part).
    try {
      let winnerId = (after?.winnerId as string | null | undefined) ?? null;
      let winnerName = (after?.winnerName as string | null | undefined) ?? null;
      if (winnerId == null) {
        const members = await gameRef.collection('members').get();
        const living = members.docs
          .map((d) => ({ userId: d.id, ...(d.data() as { role?: string; out?: boolean; displayName?: string }) }))
          .filter((m) => m.role !== 'gm' && !m.out);
        if (living.length === 1) {
          winnerId = living[0].userId;
          winnerName = living[0].displayName ?? null;
          await gameRef.update({ winnerId, winnerName });
          functions.logger.info(`[cleanupOnGameEnd] game ${gameId} manually ended with one survivor — crowned ${winnerId}`);
        }
      }
      if (winnerId) {
        // Deterministic id so a re-fired trigger UPDATES (never re-creates) this doc —
        // onBroadcastCreate is onCreate, so the winner is pushed at most once.
        await gameRef.collection('broadcasts').doc(`winner_push_${winnerId}`).set({
          kind: 'winner',
          message: 'You survived them all — you win! 🏆',
          targetPlayerId: winnerId,
          pushed: false, // let onBroadcastCreate deliver the push to the winner's device
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    } catch (e) {
      functions.logger.error(`[cleanupOnGameEnd] winner notify failed for ${gameId} — cleanup continues`, e);
    }

    /**
     * ROADMAP #100: **keep the evidence when the game was being captured.**
     *
     * Stonedam Day 2 ended at 18:25:31Z and every collection its post-mortem rested on was
     * gone minutes later; the only surviving copy was a snapshot someone happened to pull
     * half an hour before the end, which is why that analysis is a lower bound rather than
     * the whole game. `locationTrail` was already excluded from this purge — but a trail is
     * uninterpretable without the arrivals and trip latches to read it against, so excluding
     * it alone fixed nothing.
     *
     * The trigger is `config.locationTrail`, not a second flag, because it is the same
     * intent: *this game is being recorded*. And it costs nothing in privacy — the trail
     * holds **every** fix, of which the arrival positions are a strict subset, so a game
     * that kept the trail has already accepted everything keeping the arrivals would expose.
     *
     * The standing instruction is unchanged and now covers all four subcollections: delete
     * them once the run has been analysed.
     */
    const capturing = (after?.config as { locationTrail?: boolean } | undefined)?.locationTrail === true;
    if (capturing) {
      functions.logger.info(
        `[cleanupOnGameEnd] game ${gameId} kept arrivals/checkpointTrips/entryTrips for analysis ` +
        '(config.locationTrail is on) — delete them once the run is read'
      );
    }

    // All best-effort and independent — run in parallel. `force` on deleteFiles keeps
    // going past any individual error; absent photos/subcollections are fine.
    await Promise.allSettled([
      // #84: ration photos are normally purged at *victory* (entering cleanup). This run is
      // still here because a game may be closed straight from `play` and never pass through
      // that transition — the delete is idempotent, so a game that did pass through it just
      // finds nothing left.
      admin.storage().bucket().deleteFiles({ prefix: `games/${gameId}/rations/`, force: true }),
      // #42 arena overlay — a GM-uploaded image of up to 15 MB per game. Nothing renders it
      // after the game ends, and no other path deletes it, so without this every finished
      // game leaves its overlay in Storage permanently.
      admin.storage().bucket().deleteFiles({ prefix: `games/${gameId}/overlay/`, force: true }),
      // `locations` goes ALWAYS. It is the live-position liability #30 exists for, and it
      // is the one thing `locationTrail` does not make redundant only because the trail
      // supersedes it entirely — an analysed game reads the trail, never this.
      db.recursiveDelete(gameRef.collection('locations')),
      // #100: these three survive a captured game — see the note above.
      ...(capturing ? [] : [
        db.recursiveDelete(gameRef.collection('arrivals')),
        // Per-player crossing/entry latches (#50/#55/#67) — transient, tied to play.
        db.recursiveDelete(gameRef.collection('checkpointTrips')),
        db.recursiveDelete(gameRef.collection('entryTrips')),
      ]),
      // Per-window ration-open push latches (#72) — transient, tied to play.
      db.recursiveDelete(gameRef.collection('rationWindowPings')),
      // Per-interval auto-starvation sweep latches (#11) — transient, tied to play.
      db.recursiveDelete(gameRef.collection('starvationSweeps')),
    ]);

    functions.logger.info(
      `[cleanupOnGameEnd] cleared ration photos + location/arrival data for ended game ${gameId}`
    );
  });
