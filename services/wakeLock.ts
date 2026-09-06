import { Platform } from 'react-native';
import { acquireWakeLock, isWakeLockHeld, releaseWakeLock } from '@/modules/outdoor-native';

/**
 * Partial CPU wake lock for the duration of location tracking (ROADMAP #82).
 *
 * **Why this exists.** A foreground service keeps the *process* from being killed; it
 * does **not** keep the CPU awake — a widespread misconception, and one this codebase
 * was relying on. `expo-location` holds no wake lock of its own (verified: zero
 * `PowerManager` references in its Android source), so between location callbacks the
 * AP is free to suspend and the OS coalesces our updates.
 *
 * The 2026-09-05 field trail is the evidence: a 3s requested cadence was delivered at a
 * **14–18s median with ~90s maxima**, and a phone left locked for 16 minutes showed a
 * **38m median accuracy** against **13m** for one that was repeatedly woken by its owner
 * checking it. Same walk, same woods. The device settling into deep idle is the single
 * largest effect in the dataset, and it degrades the step sensor's delivery at the same
 * time — one root cause, two symptoms.
 *
 * **Default on since 2026-09-06** (`GameConfig.wakeLockEnabled`), promoted from the
 * isolated A/B variable it was in the previous build. Stonedam Day 2 ran three and a half
 * hours with it off for every player — all eleven surviving location docs read
 * `wakeLock: false` — and produced 44 arrivals out of 198 recorded from outside the
 * checkpoint radius, with fixes still being rejected at 156 m and 792 m accuracy in the
 * closing minutes. Deep idle degrades the GPS fix and the step sensor together, so this
 * is now load-bearing for the pedometer corroboration in `functions/src/geofence.ts` as
 * well as for accuracy.
 *
 * Still costs battery, and a GM running an unusually long game can turn it off.
 *
 * iOS is a deliberate no-op — there's no user-acquirable CPU wake lock, and the
 * `location` background mode already keeps the app scheduled.
 */

/**
 * Safety valve. The OS releases the lock after this even if we never do, so a bug here
 * can strand at most this much of a player's battery. Comfortably longer than any game
 * (`durationMinutes` defaults to 210) and re-armed on every tracking start.
 */
const WAKE_LOCK_TIMEOUT_MS = 6 * 60 * 60 * 1000; // 6h

/** Acquire the lock. Returns whether it's actually held afterwards (diagnostics). */
export function startWakeLock(): boolean {
  if (Platform.OS !== 'android') return false;
  acquireWakeLock(WAKE_LOCK_TIMEOUT_MS);
  return isWakeLockHeld();
}

/** Release the lock. Safe to call when nothing is held. */
export function stopWakeLock(): void {
  if (Platform.OS !== 'android') return;
  releaseWakeLock();
}

/** Is the lock currently held? Surfaced in the player-screen tracking diagnostics. */
export function wakeLockHeld(): boolean {
  if (Platform.OS !== 'android') return false;
  return isWakeLockHeld();
}
