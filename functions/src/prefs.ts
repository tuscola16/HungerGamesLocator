import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

/**
 * Fan a user's notification-mute preferences out onto their member docs (ROADMAP #87).
 *
 * The preference is **per user**, not per game — one setting that follows a GM into every
 * game they run, and no game-level policy, so a GM can never mute on anyone else's behalf.
 * It therefore lives on `users/{uid}`.
 *
 * But the push path resolves tokens from **member** docs and never touches user profiles.
 * Rather than teach every send site to join across two collections, the value is copied onto
 * each membership — exactly the pattern `fcmToken` already follows — so the send path stays
 * a member read and rides the existing short-TTL member cache (#16).
 *
 * Doing the copy here rather than in `joinGameByCode`/`createGame` covers both directions at
 * once: a preference changed today reaches games joined last week, and a game joined tomorrow
 * picks up the current preference from the profile write that follows a join.
 *
 * **`'sos'` is stripped on the way through.** A safety alert is not mutable, and this is the
 * server-side half of that guarantee: even if a client wrote it, a muted-SOS state never
 * reaches a member doc. (`sendClassPush` refuses to filter `'sos'` regardless, so the two are
 * belt and braces.)
 */
export const onUserPrefsWrite = functions.firestore
  .document('users/{userId}')
  .onWrite(async (change, context) => {
    const { userId } = context.params;
    const before = change.before.exists ? change.before.data() : undefined;
    const after = change.after.exists ? change.after.data() : undefined;
    if (!after) return; // profile deleted — the member docs go with the account (#34)

    const next = sanitize(after.mutedNotifications);
    const prev = sanitize(before?.mutedNotifications);
    // Only fan out on an actual change. This trigger fires on every profile write —
    // display-name edits, FCM-token refreshes — and a collection-group query per keystroke
    // would be absurd.
    if (same(prev, next)) return;

    const db = admin.firestore();
    const memberships = await db.collectionGroup('members').where('userId', '==', userId).get();
    if (memberships.empty) return;

    const batch = db.batch();
    for (const d of memberships.docs) {
      batch.update(d.ref, { mutedNotifications: next });
    }
    await batch.commit();
    functions.logger.info(
      `[prefs] fanned ${next.length} muted class(es) to ${memberships.size} membership(s) for ${userId}`
    );
  });

/** Coerce to a clean string array and drop the classes that may never be muted. */
function sanitize(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.map((x) => String(x)))].filter((c) => c !== 'sos').sort();
}

function same(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
