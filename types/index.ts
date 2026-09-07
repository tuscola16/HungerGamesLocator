/**
 * Platform-neutral Firestore timestamp shape. Both the React Native SDK's
 * `FsTimestamp` and the Firebase JS SDK's `Timestamp`
 * satisfy this structurally, so these types compile in both the mobile app and
 * the web GM dashboard (web/) without either importing the other's Firestore SDK.
 */
export interface FsTimestamp {
  toMillis(): number;
  toDate(): Date;
  seconds: number;
  nanoseconds: number;
}

export type UserRole = 'player' | 'gm';
export type GameStatus = 'active' | 'ended';

/**
 * The lifecycle phase of a game:
 * - `setup`   — GMs define boundary, checkpoints, and rules. Not yet open to players.
 * - `lobby`   — Open for players to join, name themselves, and read the tutorial. Not started.
 * - `play`    — Game is live; the play timer runs and players share location.
 * - `endgame` — GM-triggered "final showdown" (#41): a labeled stretch between `play` and
 *               `results` that rallies players to a convergence point. Live systems (tracking,
 *               boundary, SOS, geofence) keep running; only the ration loop turns off.
 * - `cleanup` — The victor has been declared but the game is NOT closed (#84). The recovery
 *               job — collecting every prop from every checkpoint and accounting for every
 *               person still in the woods — happens here, with the arena fully lit: mutual
 *               player↔player and player↔GM map visibility, and every checkpoint projected
 *               into `markers`. `status` stays `'active'`; runbook effects are suppressed so
 *               nobody trips the trap they were sent to retrieve.
 * - `results` — Game over; players can see how they did.
 *
 * **Forward-compat.** `'cleanup'` is unknown to every binary shipped before 2026-09-06.
 * Clients branch per phase, so an old client would land on no branch at all; both shells
 * therefore funnel unknown phases through `isWaitingOrUnknown`-style fallbacks, and the GM's
 * **Close Game** stays reachable so nobody is stranded mid-recovery.
 */
export type GamePhase = 'setup' | 'lobby' | 'play' | 'endgame' | 'cleanup' | 'results';

/** Play-area boundary, defined by the GM from a map view. */
export interface MapBoundary {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  /**
   * Ordered polygon vertices (≥ 3). When present, this takes precedence over the
   * min/max box for both rendering and framing — the box is kept as a legacy/
   * fallback bounding rectangle (creators should set it to the polygon's bbox).
   * Polygon authoring is web-only; viewing is supported on mobile + web.
   */
  polygon?: { latitude: number; longitude: number }[];
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  fcmToken?: string;
  createdAt: FsTimestamp;
}

export interface Game {
  id: string;
  name: string;
  playerCode: string;
  gmCode: string;
  creatorId: string;
  status: GameStatus;
  phase: GamePhase;
  /** Free-text rules the GM writes during setup; shown to players in the tutorial. */
  rules?: string;
  /** Rectangular play area, set by the GM during setup. */
  boundary?: MapBoundary;
  /** When the GM pressed Start (phase → play). */
  startedAt?: FsTimestamp | null;
  /** When the GM pressed End (phase → results). */
  endedAt?: FsTimestamp | null;
  /**
   * ROADMAP #84: when the GM declared the victor and opened recovery (phase → cleanup).
   * Absent on legacy games and on games closed straight from `play`, which is still a
   * supported path — `cleanup` is a stop the GM may make, not one they must.
   */
  cleanupStartedAt?: FsTimestamp | null;
  /**
   * The last tribute standing when the game ended (#81): the sole non-GM member still
   * `!out`. Stamped server-side on `status → ended` for BOTH the auto-end (winner
   * detection) and the manual GM End Game paths; absent when the game ended with zero or
   * more than one player alive (no single winner). `winnerName` is denormalized here
   * because players can't read other members' docs — the results screen reads it to tell
   * everyone (and the winner especially) who took the crown.
   */
  winnerId?: string | null;
  winnerName?: string | null;
  /**
   * GM-set event date (ROADMAP #36), distinct from the system `createdAt`. When present
   * it's used to sort/label "My Games"; absent → fall back to `createdAt`. Editable by the
   * GM in setup. An all-day date (stored as that day's local midnight).
   */
  gameDate?: FsTimestamp | null;
  /** GM-tunable parameters; absent on legacy games (resolve with BASE_GAME_CONFIG). */
  config?: Partial<GameConfig>;
  /**
   * Custom arena map overlay (ROADMAP #42): a GM-uploaded image georeferenced onto the
   * live map in place of generic tiles. Authored web-only (drag/scale 4 corners over the
   * Mapbox map); rendered on web as a true quad (Mapbox `image` source) and on mobile as
   * the axis-aligned bbox of the corners (a documented react-native-maps `Overlay` limit).
   * Absent on games without a custom overlay.
   */
  mapOverlay?: {
    /** Firebase Storage download URL of the arena image. */
    url: string;
    /** The 4 georeferencing corners, ordered TL, TR, BR, BL (quad placement). */
    corners: { latitude: number; longitude: number }[];
    /** Render opacity 0–1; defaults to ~0.7 when absent. */
    opacity?: number;
    updatedAt: FsTimestamp;
    updatedBy: string;
  };
  /**
   * Post-game media links (ROADMAP #45): a GM attaches a YouTube recap and/or a Google
   * Photos album after the game ends. Authored on the results screen; setting either link
   * pushes every member except the setter ("recap is up"). Results screens show outbound
   * Watch/View links. Absent until a GM adds media.
   */
  media?: {
    /** Validated host: youtube.com / youtu.be. */
    youtubeUrl?: string;
    /** Validated host: photos.google.com / photos.app.goo.gl. */
    photosAlbumUrl?: string;
    updatedAt: FsTimestamp;
    /** uid of the GM who set the media — excluded from the "recap is up" push. */
    updatedBy: string;
  };
  /**
   * This is a guided Test Event (created from the "This is a test" checkbox). It's a
   * real, auto-configured game whose GM is walked through verifying every feature in a
   * tight space. Set server-side by the createGame Cloud Function.
   */
  isTest?: boolean;
  /**
   * The GM's current position in the Test Runner walkthrough (a resumable cursor). Only
   * meaningful when `isTest`. Most step progress is derived live from Firestore; this just
   * survives an app restart. See app/(app)/gm/[gameId]/test.tsx.
   */
  testStepIndex?: number;
  /**
   * Night-before practice game (ROADMAP #43): a disposable, badged, re-runnable on-site
   * dress rehearsal. GM-write-only, set at `createGame`. Every screen shows a PRACTICE badge;
   * the integrity invariants that block destructive actions (#20/#22/#28) are relaxed so the
   * GM can tear down and re-run freely (`resetPracticeGame`); the whole game (doc + Storage
   * photos) auto-deletes when it ends. Absent on real games.
   */
  practice?: boolean;
  createdAt: FsTimestamp;
}

/**
 * GM-tunable game parameters. All fields are stored optionally on `Game.config`;
 * resolve a complete config by spreading over `BASE_GAME_CONFIG` (the base game rules).
 */
export interface GameConfig {
  /** Total game length in minutes. Rule 5 → 210 (3.5h). */
  durationMinutes: number;

  // --- Ration / starvation loop (Rules 6–9) ---
  rationsEnabled: boolean;
  /** Length of each ration interval in minutes — the cadence of "eat or starve". Rule 6/7 → 30. */
  rationIntervalMinutes: number;
  /**
   * How long the eat-window stays *open* at the end of each interval, in minutes. The
   * capture panel is hidden until this window opens (so a player isn't pestered for a
   * card 5 minutes in) and the player is alerted when it opens. Clamped to ≤
   * `rationIntervalMinutes`; setting it ≥ the interval keeps the panel open all interval
   * (the legacy behavior). With a 30-min interval and a 10-min window the panel opens at
   * the 20-min mark and the deadline is the 30-min interval boundary.
   */
  rationWindowMinutes: number;
  /** What happens when a player misses a window. */
  starvationMode: 'auto' | 'gm-confirmed';
  /** Reject a ration photo whose card number was already used (Rule 6). */
  enforceUniqueRationCards: boolean;

  // --- Broadcast (Rule 24) ---
  /** Auto-push the living-player count every interval. */
  playerCountBroadcast: boolean;

  // --- Elimination (Rules 1, 16) ---
  /** Surface a winner when one living player remains. */
  winnerDetection: boolean;

  // --- Tracking (Rule 21) ---
  /** Coarser GPS cadence when the player is stationary. */
  batterySaver: boolean;

  /**
   * #82: hold a partial CPU wake lock while tracking (Android only). Default **on**
   * since 2026-09-06.
   *
   * A foreground service does not keep the CPU awake and `expo-location` holds no lock of
   * its own, so between callbacks the device suspends and the OS coalesces our updates —
   * measured 2026-09-05 as a 3 s request delivered at a 14–18 s median with ~90 s gaps,
   * and a locked phone's median accuracy at 38 m against 13 m for one kept awake.
   *
   * **Promoted from A/B variable to default by the Stonedam Day 2 run (2026-09-06).**
   * That game shipped with this off for everyone, and every one of the eleven surviving
   * location docs read `wakeLock: false`. The result: 22% of arrivals (44/198) were
   * recorded from outside the checkpoint radius, and `onLocationUpdate` was still
   * rejecting live fixes at 156 m, 792 m, 107 m and 124 m accuracy in the closing
   * minutes. Deep idle is the common cause of the bad fixes *and* of the step sensor
   * going quiet, so leaving it off costs both instruments at once.
   *
   * Still costs battery; a GM who needs a very long game can turn it off explicitly.
   */
  wakeLockEnabled?: boolean;

  /**
   * #82: reject fixes worse than this many metres from the **GM map display only**
   * (never from checkpoint evaluation, which keeps using `minFixAccuracyMeters`). The
   * last good position is held instead. Default 80 m; 0 disables.
   *
   * This gates the *bad* fix rather than the correction that follows it — the distinction
   * the field data forced. Of 13 large jumps on the 2026-09-05 walk, 11 had accuracy
   * *improving*: the dot leaps because GPS reacquires and snaps back to truth, so holding
   * the new fix would keep the player at the wrong place for longer. Dropping the 89–203 m
   * fixes at the source is what actually removes the jumping.
   */
  maxDisplayAccuracyMeters?: number;

  // --- Geofence quality (#50/#55) ---
  /**
   * GPS fix quality gate for checkpoint evaluation. Fixes whose reported accuracy (m) is
   * this value **or worse** are skipped for checkpoint eval — the map dot still updates.
   * Default 100 m. The comparison is `>=` because Android's fused provider emits coarse
   * network fixes at exactly 100.0 m, which a `>` test let through by one unit.
   *
   * NOTE: this gates the *claimed* accuracy, which a wifi-derived fix can understate —
   * field-measured 2026-08-15, a stationary Pixel 8 reported 22 m accuracy while being
   * ~64 m from its true position, so it sailed through a 100 m gate while being wrong.
   * Raising this further will not help that case; see `locationTrail`.
   *
   * This is the **ceiling**, not the whole gate: `accuracyRadiusFactor` narrows it per
   * checkpoint, so a 20 m checkpoint is judged far more strictly than this flat number.
   */
  minFixAccuracyMeters?: number;

  /**
   * Per-checkpoint accuracy gate (2026-09-06). A fix may only be evaluated against a
   * given checkpoint when its reported accuracy is better than
   * `radius × accuracyRadiusFactor`, subject to the `minFixAccuracyMeters` ceiling and
   * the `MIN_ACCURACY_FLOOR_M` floor in `functions/src/geofence.ts`. Default 2; 0
   * disables and falls back to the flat `minFixAccuracyMeters` gate alone.
   *
   * The flat 100 m gate was always acknowledged as a stopgap ("deliberately blunt: a fix
   * accurate to only 100 m can trigger a smaller checkpoint from outside it"). The
   * Stonedam Day 2 run priced that bluntness: with every checkpoint at a 20 m radius, a
   * 99 m fix cleared the gate and was then asked whether it was within 20 m of a point —
   * a question its own error bar cannot answer. The median arrival landed **17 m from
   * centre at a 20 m radius**, i.e. crossings were being confirmed by fixes sitting on
   * the rim, and 44 of 198 arrivals were recorded from outside the circle entirely.
   *
   * At the default a 20 m checkpoint demands 40 m accuracy — still generous enough for a
   * pocketed phone's good fixes, and strict enough that the trilaterated ones stop
   * voting.
   */
  accuracyRadiusFactor?: number;

  /**
   * Diagnostic breadcrumb trail (debugging only, opt-in, no UI to set it).
   *
   * The `locations/{playerId}` doc is overwritten by every fix, so a finished game leaves
   * a handful of arrival records and no track at all — three field tests in a row had to
   * be diagnosed by inference from four surviving points. When this is true,
   * `onLocationUpdate` appends every fix it receives to `games/{gameId}/locationTrail`,
   * **including fixes the accuracy gate rejects**, with the distance to each checkpoint
   * and the gate verdict.
   *
   * Deliberately excluded from the game-end cleanup that purges `locations`/`arrivals`,
   * because the whole point is reading it after the game is over. That makes it a
   * retention liability: delete the subcollection once you've analysed the run.
   *
   * **Default on since 2026-09-06.** It was opt-in and therefore off for Stonedam Day 2,
   * which is why that post-mortem could measure *where* arrivals landed but never *how
   * long a player went without a usable fix* — the single most important number for
   * tuning any of this. A trail that exists and is deleted beats one that was never
   * written; four field tests in a row have now been diagnosed by inference.
   */
  locationTrail?: boolean;
  /**
   * Consecutive in-radius location fixes required before recording a checkpoint arrival.
   * Debounces a lone jumpy fix. Default 2.
   */
  geofenceConfirmFixes?: number;
  /**
   * Longest prev→curr segment (m) that #49 pass-through detection will believe **on its
   * geometry alone**. Default 150; 0 disables pass-through detection entirely.
   *
   * Lowered from a hard-coded 400 m on 2026-09-06. At 400 m the test was manufacturing
   * crossings out of GPS noise: Payne was credited with The Old Dam from a fix **295 m**
   * from its centre, and with the snowmobile access point from **210 m** and **245 m**
   * out. A segment that long between two consecutive fixes is not a walk, it is the
   * receiver relocating — and the straight line drawn through it will sweep across half
   * the arena, clipping every 20 m circle in its path.
   *
   * This is a floor, not a ceiling. With `stepCorroboration` on, a longer segment is still
   * admitted up to `CORROBORATED_MAX_SEGMENT_METERS` (400 m) *when the pedometer confirms
   * the player walked it* — because a flat cap answers the wrong question. Replaying
   * Stonedam Day 2 against a flat 150 m showed it withdrawing two crossings that were each
   * a player's only arrival at that checkpoint, one of which (Gus, snowmobile access
   * point) delivered a real runbook hint. Whether that walk happened is a question for the
   * step counter, not for a length threshold.
   */
  passThroughMaxSegmentMeters?: number;
  /**
   * Require pedometer evidence before believing a #49 pass-through. Default **on**
   * (2026-09-06).
   *
   * A pass-through asserts the player walked a path between two fixes with no fix landing
   * in the circle. That assertion is checkable: walking `segLen` metres takes roughly
   * `segLen / STEP_LENGTH_M` steps, and the phone counts steps on a low-power
   * coprocessor that keeps running through Doze. If the counter says the player barely
   * moved while the coordinates say they covered 300 m, the coordinates are wrong.
   *
   * **This is a deliberate retry of an approach that was removed once.** The earlier
   * step gate (see `common/locationStabilizer.ts`) failed for a reason that has since
   * been fixed, and the distinction matters:
   *
   *  - It compared *adjacent* fixes 3–15 s apart, where Android's batched step delivery
   *    genuinely reads 0 mid-walk (~70% of fixes did). Here the comparison runs against
   *    the newest reading older than `STEP_LOOKBACK_MS`, which is long enough for a batch
   *    to have flushed.
   *  - It ran against the old `watchStepCount` listener, which does not fire while
   *    backgrounded at all — a phone locked for 16 minutes reported **2 steps**. That was
   *    replaced on 2026-09-05 by polling the hardware `TYPE_STEP_COUNTER` through the
   *    native shim, and Stonedam Day 2 shows the rewrite working: 9,715 / 8,921 / 8,045
   *    steps for a three-hour walk.
   *  - Most importantly it was used to **veto movement** — to suppress a GPS fix because
   *    steps looked low — which is unsound in the direction that matters, because the
   *    step count under-reports and never over-reports. It cost two players 556 m and
   *    980 m of genuine movement. Here the asymmetry is respected: steps may only veto an
   *    *inferred* crossing that no fix ever witnessed, never a real fix, and never a
   *    player's position on the map.
   *
   * Fails open in every unknown: no reading, a counter reset, a stale reading, or a
   * player whose phone has no pedometer all mean "don't judge", never "hold".
   */
  stepCorroboration?: boolean;
  /**
   * Minutes before the same player can record another non-revisit arrival at the same
   * checkpoint. Default 5; 0 disables.
   *
   * #82's exit hysteresis only guards a trip already latched `inside: true`. A #49
   * pass-through never sets that — it latches `inside: false` on purpose, so the player
   * is treated as already gone — which means every pass-through is exempt from both the
   * hysteresis and the `geofenceConfirmFixes` debounce, and the next fix starts a fresh
   * streak. Stonedam Day 2: **58 of 198 arrival docs (29%) landed within five minutes of
   * the previous one at the same checkpoint.** Payne recorded The Crossroads six times in
   * 2 m 41 s at 9 → 72 → 55 → 113 → 109 → 16 m; Emma recorded Stone Bench Beach twice
   * **2.4 seconds apart**.
   *
   * This is the backstop that catches what hysteresis structurally cannot.
   */
  reArrivalCooldownMinutes?: number;
  /**
   * Trust the OS geofence's own Enter event as confirmation of a crossing, instead of
   * only recording it. Default **on** (2026-09-06) — promotes #82 shadow mode.
   *
   * Android and iOS run geofencing in the platform's low-power location stack, which
   * keeps working in Doze when our own fixes have collapsed to a ~90 s cadence. Shadow
   * mode has been recording `geofenceEnter` beside our distance maths for two field
   * tests; promoting it means an OS-corroborated fix satisfies `geofenceConfirmFixes` on
   * its own and is judged against the flat `minFixAccuracyMeters` ceiling rather than the
   * tighter per-checkpoint gate.
   *
   * What it deliberately does **not** do is create an arrival by itself. The OS watches
   * an inflated circle (`radius × 1.5`, min `radius + 25`) so that its wake-up lands the
   * player inside the true radius; believing the event alone would move every checkpoint's
   * effective radius outward by 50%. The position still has to be in-radius — this only
   * removes the *debounce*, which is the part that costs latency.
   */
  trustOsGeofence?: boolean;
  /**
   * @deprecated #83 — inert. This throttled the GM's *bare arrival* push on a re-crossing,
   * and bare arrivals no longer push at all. Kept so legacy game docs still typecheck.
   */
  reNotifyAwayCooldownMinutes?: number;
  /**
   * #67: while a player stays inside a checkpoint, its runbook entries are re-evaluated
   * every this-many minutes, so an entry that becomes eligible later (a `timed` window
   * opening) still trips without the player leaving and re-entering. Each entry trips at
   * most once per player (tracked in `entryTrips`). Default 2.
   */
  tripIntervalMinutes?: number;

  // --- Auto-end (#56) ---
  /**
   * When to auto-end the game based on living-player count.
   * - `'one'`    — end when 1 living player remains and crown them winner (default).
   * - `'zero'`   — end only when 0 living players remain ("no winner").
   * - `'manual'` — never auto-end; maps from legacy `winnerDetection: false`.
   */
  autoEndThreshold?: 'one' | 'zero' | 'manual';

  // --- Dead-player spectator map (#99) ---
  /**
   * ROADMAP #99: once a player is out, give them a read-only view of the arena — the
   * boundary, every checkpoint, and the living players — so they can be sent to deploy a
   * drop, help with cleanup (#84), or answer a safety alert (#94). GM opt-in; `false` is
   * today's behavior exactly. **Frozen at Start** with the interval config (#24).
   */
  spectatorMapEnabled?: boolean;
  /**
   * ROADMAP #99: minutes after the player's *recorded* `outAt` before living players
   * appear. The delay exists because the moment right after a kill is the dangerous one —
   * the person who just died is standing next to whoever killed them and knows where their
   * allies are. `0` = immediate. **Frozen at Start** (#24), so a GM can't shorten it
   * mid-game to help one player. Default 2.
   */
  spectatorDelayMinutes?: number;
}

/** Seed defaults for a new game = the base game rules. */
export const BASE_GAME_CONFIG: GameConfig = {
  durationMinutes: 210,
  rationsEnabled: true,
  rationIntervalMinutes: 30,
  rationWindowMinutes: 10,
  starvationMode: 'gm-confirmed',
  enforceUniqueRationCards: true,
  playerCountBroadcast: true,
  winnerDetection: true,
  batterySaver: true,
  // #82: on by default since 2026-09-06. Stonedam Day 2 ran with this off for all eleven
  // players and spent the game fighting deep-idle fixes; the battery cost is the cheaper
  // side of that trade.
  wakeLockEnabled: true,
  maxDisplayAccuracyMeters: 80,
  // --- Geofence quality, all retuned from the Stonedam Day 2 post-mortem (2026-09-06) ---
  // A 20 m checkpoint now demands 40 m accuracy rather than the flat 100 m ceiling.
  accuracyRadiusFactor: 2,
  // 400 m segments were inventing crossings out of receiver drift.
  passThroughMaxSegmentMeters: 150,
  // Ask the pedometer whether the player actually walked an inferred crossing.
  stepCorroboration: true,
  // Catches the repeat arrivals that #82 hysteresis structurally cannot (29% of that
  // game's arrival docs).
  reArrivalCooldownMinutes: 5,
  // Promote #82 shadow mode: the OS geofence now confirms a crossing instead of only
  // being recorded beside it.
  trustOsGeofence: true,
  // On by default: a trail that gets deleted after analysis beats a fifth field test
  // diagnosed by inference.
  locationTrail: true,
  // #99: off by default — handing the dead a live map of the living changes the game, so
  // it stays the GM's deliberate choice. The 2-minute delay is the safe value when they
  // do turn it on.
  spectatorMapEnabled: false,
  spectatorDelayMinutes: 2,
};

/**
 * The four things a runbook entry can do when it fires for a player (ROADMAP #60):
 * - `hazard`    — a danger (beast attack, poison, …); themed push to the crossing player.
 * - `boon`      — a positive find; themed push to the crossing player.
 * - `notify`    — a plain message to the crossing player, or to all players.
 * - `gm-notify` — only the GM is alerted; the player sees nothing (the default ping).
 */
export type CheckpointKind = 'hazard' | 'boon' | 'gm-notify' | 'notify';

/**
 * Per-player/per-checkpoint crossing latch (ROADMAP #50/#55). Written only by Cloud
 * Functions (admin SDK); never readable by clients. Tracks inside/outside state and
 * consecutive-fix streak for arrival debouncing, plus the away timestamp for GM
 * re-notification and the last surfaced state for player re-notification.
 * Path: games/{gameId}/checkpointTrips/{playerId}_{checkpointId}.
 */
export interface CheckpointTrip {
  playerId: string;
  checkpointId: string;
  /** True while the player is confirmed inside the radius. */
  inside: boolean;
  /** Consecutive in-radius fixes since last non-inside write. Feeds #50 debounce. */
  insideStreak: number;
  /** Timestamp of the most recent confirmed entry. */
  lastEnterAt?: FsTimestamp | null;
  /** Timestamp of the most recent confirmed exit. */
  lastExitAt?: FsTimestamp | null;
  /**
   * The resolved runbook effect kind at the last time a player notification was sent
   * (#55). Used to re-notify only when the resolved effect changes.
   */
  lastNotifiedState?: string | null;
  /** #67: this player's 0-based arrival ordinal at the checkpoint, latched on first entry
   * so the periodic re-evaluation resolves fixed-order slots consistently. */
  arrivalOrdinal?: number | null;
  /** #67: last time the runbook entries were re-evaluated for this player while inside,
   * gating the `tripIntervalMinutes` cadence. */
  lastTripCheckAt?: FsTimestamp | null;
  /**
   * When this player last had an arrival doc written for this checkpoint — the clock the
   * `reArrivalCooldownMinutes` backstop runs on (2026-09-06).
   *
   * Distinct from `lastEnterAt`, which is also stamped by a pass-through that the
   * cooldown *rejected*. This one advances only when an arrival was actually recorded, so
   * a suppressed burst can't keep pushing the window forward and starve a genuine
   * re-crossing that arrives later.
   */
  lastArrivalAt?: FsTimestamp | null;
  /**
   * Cumulative step count at the moment of the last recorded arrival (2026-09-06), or
   * null when the pedometer had nothing to say.
   *
   * Lets a re-arrival be admitted *early* on positive evidence: a player whose counter
   * has advanced far enough to have left and returned has demonstrably moved, so the
   * cooldown need not hold them. Positive step evidence is the trustworthy direction —
   * see `GameConfig.stepCorroboration`.
   */
  lastArrivalSteps?: number | null;
}

/**
 * Per-player/per-runbook-entry trip latch (ROADMAP #67). Written only by Cloud Functions
 * (admin SDK); never client-readable. Its mere existence means the player has already
 * tripped that entry — each entry fires at most once per player, independent of other
 * entries on the same checkpoint. Path: games/{gameId}/entryTrips/{playerId}_{entryId}.
 */
export interface EntryTrip {
  /** Doc id (`${playerId}_${entryId}`); present when read client-side. */
  id?: string;
  playerId: string;
  entryId: string;
  checkpointId: string;
  trippedAt: FsTimestamp;
  // Denormalized snapshot of the fired effect (#73), so the GM feed renders one accurate row
  // per actual trip without re-joining the runbook. Written by the geofence on the crossing.
  playerName?: string;
  entryName?: string | null;
  checkpointName?: string;
  effectKind?: CheckpointKind;
  message?: string | null;
}

/** Who a `notify` effect reaches. Only meaningful for `kind: 'notify'`. */
export type NotifyAudience = 'crossing-player' | 'all-players';

/**
 * What a runbook entry delivers to a player when it fires (ROADMAP #60). A fixed-order
 * entry can carry a distinct effect per arrival slot; other triggers use the entry's
 * single `effect`.
 */
export interface RunbookEffect {
  kind: CheckpointKind;
  /** Body shown in the push/broadcast, e.g. "A beast attacks! Defend or flee." */
  message?: string;
  /**
   * For `kind: 'notify'` only: the crossing player (default) or all players.
   * `hazard`/`boon` always go to the crossing player; `gm-notify` to the GM only.
   */
  audience?: NotifyAudience;
}

/** The four ways a runbook entry becomes eligible to fire (ROADMAP #60). */
export type RunbookTriggerType = 'fixed-order' | 'always-on' | 'timed' | 'gm-prompted';

/**
 * A start/end bound for a `timed` runbook entry (ROADMAP #60). `game-start`/`game-end`
 * anchor to the game's lifecycle; `time` is an explicit minute offset after `startedAt`
 * (primary) or an absolute `fireAt` (reserved).
 */
export type TimedBound =
  | { kind: 'game-start' }
  | { kind: 'game-end' }
  | { kind: 'time'; atMinute?: number; fireAt?: FsTimestamp };

/**
 * One behavior attached to a checkpoint (ROADMAP #60). A checkpoint owns 0..N entries;
 * on a crossing a player receives exactly one — the highest-`priority` matching entry.
 * Stored at games/{gameId}/runbook/{entryId} (top-level, GM-only).
 */
export interface RunbookEntry {
  id: string;
  /** The checkpoint this entry is attached to. */
  checkpointId: string;
  /** GM-facing label, e.g. "Sponsor drop" or "Midnight hazard". */
  name: string;
  /** Higher wins on a crossing; also the primary sidebar sort key. */
  priority: number;
  trigger: RunbookTriggerType;
  /** The entry's effect; also the fixed-order default for positions past `queueSlots`. */
  effect: RunbookEffect;
  /**
   * `fixed-order` only: the Nth distinct arriver (0-based) gets `queueSlots[N]`; a `null`
   * slot fires nothing for that arriver; positions beyond the array fall back to `effect`
   * (or to nothing when `defaultNone` is set).
   */
  queueSlots?: (RunbookEffect | null)[];
  /**
   * `fixed-order` only: when true, the default position (arrivers past `queueSlots`, and
   * revisits) fires nothing instead of `effect` — the entry-level mirror of a `null` slot.
   * `effect` is still stored (it drives the entry's pin color) but is not delivered.
   */
  defaultNone?: boolean;
  /** `timed` only: window start (default `{ kind: 'game-start' }`). */
  startAt?: TimedBound;
  /** `timed` only: window end (default `{ kind: 'game-end' }`). */
  endAt?: TimedBound;
  /**
   * `gm-prompted` only: latched when the GM fires it, for the results view / idempotency.
   * Cleared/reset on re-arm. Not used by crossing resolution.
   */
  firedAt?: FsTimestamp | null;
  /**
   * Restrict this entry to specific players (ROADMAP #80). Absent/null/empty = anyone who
   * crosses can trip it. Set = only these member uids; another player crossing simply
   * falls through to the next eligible entry (or the bare GM arrival ping). On a
   * `gm-prompted` entry it is the default recipient set when the GM fires without
   * picking targets.
   */
  playerIds?: string[] | null;
  /**
   * Reveal the entry's checkpoint on the player map when this entry fires (ROADMAP #80),
   * so the player keeps seeing the site for the rest of the game. Absent/`'none'` = no
   * reveal. The marker carries only the checkpoint's name + location, never the effect.
   */
  revealOnFire?: RunbookRevealScope;
  createdAt: FsTimestamp;
}

/**
 * Who a fired runbook entry reveals its checkpoint to (ROADMAP #80). Orthogonal to the
 * checkpoint's own `visibility`/`reveal`: this is a reveal the *entry* performs when it
 * fires, and it merges into the same player-readable `markers` projection.
 * - `none`      — fire the effect, reveal nothing (the default).
 * - `triggerer` — only the player who tripped it (on a GM-prompted fire: the recipients).
 * - `targeted`  — every player in the entry's `playerIds` (falls back to the triggerer
 *                 when the entry isn't targeted).
 * - `all`       — every player in the game.
 */
export type RunbookRevealScope = 'none' | 'triggerer' | 'targeted' | 'all';

/**
 * Whether (and when) a checkpoint's marker is shown to players (ROADMAP #60, formerly #48).
 * ORTHOGONAL to the runbook: visibility = whether/when/to-whom the marker shows on the
 * player map; the runbook = what happens on crossing. A marker only ever carries the
 * checkpoint's name + location (never any secret effect body).
 * - `hidden`           — never shown to players (the default; invisible-to-players).
 * - `shown`            — shown to all players from Start Game (a named location whose
 *                        effect is still secret until crossed).
 * - `shown-on-trigger` — hidden until a `reveal` trigger fires (trap, timed drop, sponsor).
 */
export type CheckpointVisibility = 'hidden' | 'shown' | 'shown-on-trigger';

/** How a `shown-on-trigger` checkpoint becomes visible. */
export type RevealTrigger =
  | 'player' // revealed the moment a player enters (the trap they just sprang)
  | 'gm' // GM taps "Reveal now"
  | 'timed'; // revealed at `offsetMinutes` after startedAt (run-sheet reveal row)

/** Who can see a `shown-on-trigger` checkpoint once it's revealed. */
export type RevealAudience =
  | 'all' // every player
  | 'specific-players' // a named subset, usually 1 (sponsor drop)
  | 'triggerer'; // only the player who crossed (a trap)

/** For `visibility: 'shown-on-trigger'` — how/when/to-whom the marker becomes visible. */
export interface CheckpointReveal {
  trigger: RevealTrigger;
  audience: RevealAudience;
  /** `timed` trigger: minutes after the game's `startedAt`. */
  offsetMinutes?: number | null;
  /** `timed` trigger: an absolute fire time (reserved; offsetMinutes is primary). */
  revealAt?: FsTimestamp | null;
  /** `specific-players` audience: member ids allowed to see it once revealed. */
  recipientPlayerIds?: string[];
}

/**
 * A checkpoint after the runbook overhaul (ROADMAP #60): identity + geofence geometry +
 * visibility only. All behavior lives in `RunbookEntry` docs keyed by this checkpoint's id.
 */
export interface Checkpoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number; // meters
  order?: number;
  /** Icon key for map authoring. Rendered via Ionicons. */
  icon?: string;
  /** Who can see this checkpoint's marker. Absent → `hidden` (invisible to players). */
  visibility?: CheckpointVisibility;
  /** For `visibility: 'shown-on-trigger'`: how/when/to-whom it becomes visible. */
  reveal?: CheckpointReveal;
  /** Latched when the reveal fires (set by the run-sheet / geofence / GM "reveal now"). */
  revealedAt?: FsTimestamp | null;
  /** For `specific-players`/`triggerer` audiences: member ids it's been revealed to so far. */
  revealedTo?: string[];
  /**
   * Practice-game "drop test checkpoint here" marker (ROADMAP #43): a throwaway checkpoint
   * the GM dropped at their current GPS to exercise the real geofence/event/push path.
   * Badged in the UI; cleared with the practice game. Absent on normal checkpoints.
   */
  test?: boolean;
}

/**
 * A checkpoint marker projected into a player-readable surface (ROADMAP #48). The
 * `checkpoints` collection stays GM-only-readable (it holds every objective's coords +
 * secret payload); the server (and the trusted GM client) writes a marker here carrying
 * ONLY the label + location once a checkpoint is visible to a player.
 * Path: games/{gameId}/markers/{checkpointId}.
 */
export interface RevealedMarker {
  checkpointId: string;
  /** Marker label only — never the secret event payload (case C). */
  name: string;
  /**
   * The checkpoint's map icon key (`constants/checkpointIcons.ts`), projected alongside
   * the label so a player sees the *same* glyph the GM placed — a rally point, a water
   * cache and a medic station have to be tellable apart on the player map, not all one
   * green pin. Absent on markers revealed before this shipped → generic pin fallback.
   */
  icon?: string;
  latitude: number;
  longitude: number;
  /** Null/absent = visible to all players; set = only these uids may read/see it (A/D). */
  audiencePlayerIds?: string[] | null;
  revealedAt: FsTimestamp;
  /**
   * Client-side visibility gate (ROADMAP #48 defense-in-depth). The player map hides
   * this marker until `visibleFrom` is in the past. Absent/null → visible immediately.
   * Set for game-time reveals so stale markers from a prior run are suppressed until
   * their reveal time.
   */
  visibleFrom?: FsTimestamp | null;
  /**
   * ROADMAP #84 (cleanup phase): the member who marked this drop recovered.
   *
   * **Anyone may set it, not just whoever placed the prop** — the person standing at the
   * site is the one who knows it's clear. Nullable because a mis-tap in the dark has to be
   * reversible. The rules allow a member to touch these three keys and nothing else, and
   * only while the game is in `cleanup`.
   */
  clearedBy?: string | null;
  /**
   * Denormalized for the same reason as `Game.winnerName` (#81) and `Arrival.playerName`:
   * players cannot read other members' docs, so the name has to ride with the record.
   */
  clearedByName?: string | null;
  clearedAt?: FsTimestamp | null;
}

export interface GameMember {
  userId: string;
  role: UserRole;
  displayName: string;
  email: string;
  fcmToken?: string;
  /** Player marked themselves out of the game (phase: play). */
  out?: boolean;
  outAt?: FsTimestamp | null;
  /** Why this member is out. Pairs with `out`/`outAt`. */
  cause?: EliminationCause;
  /** Where they dropped pack/weapons on death (Rules 19, 20). */
  deathLocation?: { latitude: number; longitude: number } | null;
  /** Player raised a safety alert (Rules 22, 27, 28). */
  sos?: boolean;
  sosAt?: FsTimestamp | null;
  sosLocation?: { latitude: number; longitude: number } | null;
  /**
   * GM acknowledged this member's SOS (ROADMAP #5). The SOS stays the live, escalating
   * state — `sos === true && sosAckAt == null` — until a GM sets this; nothing auto-clears
   * it. GM-write-only (firestore.rules); raising a fresh SOS resets it to null. Blocks End
   * Game while any player has an open, unacked SOS (#6).
   */
  sosAckAt?: FsTimestamp | null;
  /**
   * Latched true while the player is outside `game.boundary` (ROADMAP #7). Set by the
   * geofence Cloud Function on exit (fires the GM alert once) and cleared on re-entry,
   * so a player straying outside the play area pings the GM exactly once per excursion.
   */
  outOfBounds?: boolean;
  /** This member hid the game from their own "My Games" list (finished games only). */
  archived?: boolean;
  /**
   * District / tribute pairing (ROADMAP #10). Two tributes share a district. Set by the
   * GM (players can't reassign their own — enforced in firestore.rules). Read by the
   * geofence function for the same-district trap-suppression rule (#5). Absent on
   * solo/legacy games.
   */
  district?: string | number;
  joinedAt: FsTimestamp;
}

/**
 * A member projected into a **player-readable** roster (ROADMAP #88).
 * Path: `games/{gameId}/roster/{userId}`. Server-written (admin SDK) from the existing
 * `onMemberWrite` trigger; `allow write: if false`.
 *
 * Members can't be read by players directly — `GameMember` carries `email` and `fcmToken` —
 * so, exactly like `markers` projects checkpoints and `Game.winnerName` denormalizes the
 * winner (#81), this projects the one thing players are allowed to know about each other.
 *
 * **Two modes, one collection:**
 * - **During play** — *living players only*. An elimination **removes** the row rather than
 *   flagging it, so a client can't leak or scoreboard what it never receives. This is also
 *   what the #99 spectator map filters `locations` against: the roster IS the set of people
 *   a spectator is allowed to see on the map.
 * - **After the game** (and during `cleanup`, #84) — *everyone who ever played*, carrying
 *   `playedMs` so the client can order the standings without reading member docs. That
 *   standing is most of what #91 wanted.
 *
 * **GMs are never listed, in either mode.**
 */
export interface RosterEntry {
  userId: string;
  displayName: string;
  /**
   * How long they lasted: start → their `outAt`, else the game's `endedAt`. Stamped only
   * in the post-game/cleanup re-projection; absent during play, where nobody's run is over
   * and a duration would be a live scoreboard.
   */
  playedMs?: number;
  /** Their `outAt`, or the game's `endedAt` for a survivor. Post-game only, like `playedMs`. */
  endedAt?: FsTimestamp | null;
  /**
   * Open safety alert (#94/#99). Not contact data and not a scoreboard — it is the one
   * flag a rescue needs, and #99 requires every map that draws a player to colour an
   * active SOS distinctly so a response starts without hunting for the row.
   */
  sos?: boolean;
  /**
   * Present only in the post-game/cleanup projection, where dead players are listed again.
   * During play the row's *absence* is what says "out", so this is never `true` then.
   */
  out?: boolean;
  updatedAt: FsTimestamp;
}

export type EliminationCause =
  | 'self' // honor-system self-report (Rule 16)
  | 'starvation' // Rule 8
  | 'bad-sport' // Rule 14
  | 'stole-drop' // Rule 32
  | 'comms' // Rule 23
  | 'cold-tapout' // Rule 28 (safe retreat, not combat)
  | 'gm-other';

export interface PlayerLocation {
  userId: string;
  displayName: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  heading?: number;
  /**
   * Device battery level 0–1, reported with each fix (ROADMAP #35). Drives the GM
   * roster's low-battery flag so a player about to go dark (Rule 21) can be checked on
   * before they vanish. Absent on legacy fixes / when the level is unavailable.
   */
  battery?: number;
  /**
   * Ground speed in m/s as reported by the OS (#82), or absent when unavailable.
   *
   * The single most useful signal for telling a real GNSS fix from a Wi-Fi/cell
   * fallback: speed is Doppler-derived, so a trilaterated network fix generally has
   * none and reports null. That makes it a better "is this fix real?" discriminator
   * than `accuracy`, which a network fix can understate badly — field-measured
   * 2026-08-15, a stationary Pixel 8 claimed 22 m while sitting ~64 m off.
   *
   * Recorded only; nothing gates on it yet. See `minFixAccuracyMeters`.
   */
  speed?: number;
  /**
   * Android only (#82): the OS flagged this fix as coming from a mock provider.
   * Recorded so a developer-options mock can be told apart from a genuine bad fix
   * when reading a `locationTrail` back after a game.
   */
  mocked?: boolean;
  /**
   * Cumulative steps counted since this player's tracking session started (#82), or
   * absent when the pedometer is unavailable or the permission was declined.
   *
   * Read on the server since 2026-09-06 by `GameConfig.stepCorroboration`, which uses it
   * to decide whether a #49 pass-through describes a walk the player actually took. It
   * remains a *corroborator*, never a position source and never a veto over a real fix:
   * the counter under-reports (batched delivery, a phone in deep idle) and never
   * over-reports, so only its positive direction is trustworthy.
   *
   * Counted on a low-power coprocessor that keeps running through Doze and app
   * suspension, so it survives exactly the conditions that degrade GPS. Cumulative and
   * monotonic within a tracking session; it resets to 0 when tracking restarts, which the
   * server treats as "unknown" rather than "walked backwards".
   */
  steps?: number;
  /**
   * #82 capture context — `AppState` at the moment of the fix ('active' | 'background' |
   * 'inactive' | 'unknown').
   *
   * Added because the 2026-09-05 walk was confounded by something the data couldn't see:
   * one player checked their phone repeatedly and the other never unlocked theirs, and
   * that — not the handset — explained a 13 m vs 38 m median-accuracy split. Never again
   * infer this from conversation.
   */
  appState?: string;
  /**
   * #82: ms since the app was last foregrounded (0 while active).
   *
   * The more important half of the pair. Screen state alone would NOT have explained the
   * field data — the frequently-checked phone's background fixes were still good, because
   * it never settled into deep idle. Doze depth tracks how long the device has been left
   * alone, so the duration is the signal, not the state.
   */
  msSinceForeground?: number;
  /** #82: was Android battery optimization active for us at fix time? Absent when unreadable. */
  batteryOptimized?: boolean;
  /** #82: was the partial CPU wake lock held at fix time? Identifies the A/B arm. */
  wakeLock?: boolean;
  /**
   * #82: which location source produced this fix — `'gps'` (satellite-only, via the
   * native shim) or `'fused'` (Google Play's fused provider, i.e. possibly a Wi-Fi/cell
   * trilateration).
   *
   * This is the signal that replaces the disproven `speed`-absence heuristic. Fused is a
   * *policy layer* and demonstrably serves coarse fixes to backgrounded apps: on
   * 2026-09-05 a player's backgrounded fixes never came within 65 m of a checkpoint she
   * walked through, while claiming 27–36 m accuracy.
   */
  provider?: string;
  /**
   * #82: `'near-checkpoint'` when the client spent battery on a satellite fix because the
   * player was within ~250 m of a checkpoint, `'normal'` otherwise. Recorded so the two
   * arms are separable within one walk instead of needing a second field test.
   */
  samplingMode?: string;
  /** #82: satellites used, when the OEM reports it. Low counts mean canopy starvation. */
  satellites?: number;
  /** #82: did we ask for a satellite fix for this upload? Distinguishes "didn't try"
   *  from "tried and timed out" when `provider` reads `'fused'` near a checkpoint. */
  gpsFixAttempted?: boolean;
  /**
   * #82: native build number (`versionCode`) that produced this fix.
   *
   * Exists because the 2026-09-05 A/B was wasted: one phone ran an older JS bundle and
   * nothing in the data said so. Both builds carry `versionName` "1.0.0", so the device's
   * own app-info screen couldn't distinguish them either.
   */
  buildVersion?: string;
  /**
   * #82: was the OS geofence armed at fix time?
   *
   * Asked of the OS (`hasStartedGeofencingAsync`) rather than read from module state,
   * which resets in a restarted headless task while the system still holds the regions —
   * and would therefore report "never armed" in exactly the locked-phone case where the
   * answer matters.
   */
  geofenceArmed?: boolean;
  /**
   * #82 **shadow mode**: the checkpoint id the OS geofence reported entering, when this
   * upload was triggered by a geofence wake.
   *
   * Recorded only — arrivals are still decided server-side from the position, exactly as
   * before. The point is to compare, on real data, what Android's own geofencing would
   * have caught against what the fused-fix path actually caught. If it wins, promote it
   * in a later build; if it produces phantom entries, we learned that for free.
   */
  geofenceEnter?: string;
  updatedAt: FsTimestamp;
}

export interface Arrival {
  id: string;
  playerId: string;
  playerName: string;
  checkpointId: string;
  checkpointName: string;
  timestamp: FsTimestamp;
  /** The player's actual reported position at the moment of the crossing — never
   *  fabricated to sit at the checkpoint, so `fixDistanceM` can be non-zero. */
  latitude: number;
  longitude: number;
  /**
   * How the crossing was established (2026-09-06). Absent on arrivals written before that.
   * - `'fix'`          — a reported position landed inside the radius (the healthy case).
   * - `'pass-through'` — #49 inferred it from the path between two fixes, neither of which
   *                      was inside. `fixDistanceM` is expected to exceed the radius here.
   * - `'os-geofence'`  — an in-radius fix confirmed early by the platform's own geofence
   *                      Enter event instead of by the `geofenceConfirmFixes` streak.
   */
  via?: 'fix' | 'pass-through' | 'os-geofence';
  /**
   * Metres from the recorded fix to the checkpoint centre. Written alongside `via` so a
   * post-mortem can separate "stood in the circle" from "a line was drawn through it" —
   * the distinction the Stonedam Day 2 analysis had to reconstruct by hand, and the reason
   * "44 arrivals outside the radius" took so long to interpret.
   */
  fixDistanceM?: number;
}

/** GM→player one-way message. There is no player↔player channel (Rule 23). */
export type BroadcastKind =
  | 'gm-message' // free-text GM announcement
  | 'player-count' // auto "N tributes remain" (Rule 24)
  | 'death' // "[X] has fallen" (Rules 2, 8)
  | 'checkpoint-event' // emitted by a CheckpointEvent
  | 'winner'; // Rule 1

/**
 * Sentinel `targetPlayerId` for a GM↔GM (co-GM) message (ROADMAP #40). It is neither
 * `null` (the players' "global" query) nor any real player uid (their "mine" query), so
 * a player's broadcast listeners never fetch it — keeping co-GM chatter off their feed
 * without a separate collection. Paired with `audience: 'gm-only'` for clarity + a
 * defense-in-depth rule.
 */
export const GM_BROADCAST_TARGET = '__gm__';

export interface Broadcast {
  id: string;
  kind: BroadcastKind;
  message: string;
  /** Omitted = all players. Set = targeted to one player (Rule 32 drops), or the
   * `GM_BROADCAST_TARGET` sentinel for a co-GM message (#40). */
  targetPlayerId?: string;
  /** For `kind: 'checkpoint-event'` — the checkpoint kind, so the feed can theme it. */
  eventKind?: CheckpointKind;
  /** `'gm-only'` = a co-GM message, readable only by GMs (#40); absent = player-visible. */
  audience?: 'gm-only';
  /** Display name of the GM who sent a co-GM message (#40), so the feed can attribute it. */
  senderName?: string;
  /**
   * #69: set by the server when the writing function already pushed FCM for this broadcast,
   * so the `onBroadcastCreate` trigger doesn't double-push. Client-written broadcasts omit it
   * and the trigger delivers the push.
   */
  pushed?: boolean;
  /**
   * #71: uids of players who dismissed this broadcast from their in-app list. A player
   * appends only their own uid (firestore.rules enforces `dismissedBy`-only, self-only
   * edits); the feed hides a broadcast once the current player's uid is present. Cross-device
   * because it lives on the shared doc. Absent on legacy/never-dismissed broadcasts.
   */
  dismissedBy?: string[];
  createdAt: FsTimestamp;
}

export type RationStatus = 'pending' | 'valid' | 'rejected';

/** A player's ration-card photo for one eat window (Rules 6–9). */
export interface RationSubmission {
  id: string; // `${playerId}_${intervalIndex}` — deterministic, idempotent submit
  playerId: string;
  playerName: string;
  intervalIndex: number;
  photoUrl: string; // Firebase Storage download URL
  /** Card number the player typed/OCR'd; for the uniqueness check (Rule 6). */
  cardNumber?: string;
  status: RationStatus;
  submittedAt: FsTimestamp;
  reviewedAt?: FsTimestamp | null;
}

export interface ActiveGame {
  gameId: string;
  role: UserRole;
  displayName: string;
}

/** Run-sheet action types (ROADMAP #11) — the in-app replacement for the paper schedule.
 * Checkpoint open/close windows moved to `timed` runbook entries (#60); the run sheet keeps
 * the timed broadcasts, the GM reminders, and the timed marker reveal. */
export type ScheduledActionType =
  | 'broadcast' // write a Broadcast (free text, or templated player-count)
  | 'reveal-checkpoint' // make a checkpoint marker visible to players (#60 timed reveal)
  | 'gear-drop' // announce a drop location (a broadcast to all)
  | 'gm-reminder'; // GM-only nudge ("send Aaron to The Dock")

/** A GM-authored timed action on the run-sheet. A scheduled Cloud Function sweeps for
 * due, unfired actions and executes them, stamping `firedAt` (idempotent). */
export interface ScheduledEvent {
  id: string;
  type: ScheduledActionType;
  /** Minutes after the game's `startedAt` to fire. Primary scheduling model. */
  offsetMinutes?: number | null;
  /** Absolute fire time (alternative to offsetMinutes; reserved for future authoring). */
  fireAt?: FsTimestamp | null;
  /** Target checkpoint for `open-site`/`close-site`. */
  checkpointId?: string;
  /** Message body for `broadcast`/`gear-drop`/`gm-reminder`. */
  message?: string;
  /** Templated payloads, e.g. 'player-count' fills in the living tribute count. */
  template?: 'player-count' | null;
  /** Set when executed → idempotent; the sweep skips fired rows. */
  firedAt?: FsTimestamp | null;
  createdAt: FsTimestamp;
}
