# Outdoor GM — Enhancement Roadmap

Outstanding work only. **Built functionality lives in the [README](README.md#features)**;
implementation-ready schema/enforcement detail for the items below is in
[ROADMAP_DATA_MODEL.md](ROADMAP_DATA_MODEL.md) (keyed by the same item numbers); see
[COMPETITIVE_ANALYSIS.md](COMPETITIVE_ANALYSIS.md) for prioritization rationale.

**Current focus: a beautifully functional APK for a limited, trusted user base** — not a public
store launch. Items are grouped by tier, roughly in build order. Numbers are **stable and never
reused**; a shipped item moves to the **Built & removed** callout below (one-line summary; full
detail in git + the README) rather than being renumbered.

> ## ⚠️ Where this stands (2026-09-06, end of the Tier 12 build)
>
> **The whole of Tier 12 is written — #84–#99, minus #86 — along with the outstanding halves
> of #83, #92, #94 and #100.** Everything typechecks across all three surfaces (mobile,
> `functions/`, `web/`) and the Firestore rules validate. **Nothing is deployed and nothing
> has been run on a device or in a browser.** Treat every "Built" note below as *written and
> reviewed*, never as *seen working*.
>
> Three things must happen together, in this order, before a game is run on this:
>
> 1. **`firebase deploy --only firestore`** — the rules gained the #99 spectator predicate,
>    the `outAt` server-clock pin, the #88 `roster` collection, the #84 cleanup carve-outs
>    and the #90 soft-delete read guard. Several clients depend on them.
> 2. **`firebase deploy --only functions`** — six new functions (roster ×2, cleanup-phase ×2,
>    traps, prefs, delete-sweep, undo-delete) plus changes to the geofence, members and
>    cleanup triggers. This also finally deploys the #94 dead-player geofence guard, which
>    has been written and undeployed since 2026-09-06.
> 3. **A new build, rolled out to everyone.** ⚠️ **This is not optional and not
>    independent.** Winner detection now advances a game to `phase: 'cleanup'`, a value no
>    binary in the field recognizes. `gamePhase()` clamps unknown phases from here on, but
>    that fix cannot reach a build that already shipped: an installed APK will land on no
>    phase branch at all. **Deploying the functions before the build is out strands every
>    existing install the moment a game ends.**
>
> What is left after that is field work, not code — see the outstanding bullets under #82,
> #83 and #100, and the un-run browser check on #98a.

The build-out **through Tier 7 plus all field-test findings has shipped** (see the callout).
The remaining open work is: the field measurements under **#82** and **#100**, first-run
verification of the Tier 12 batch, the two Day 1 findings (**#101**, **#102**), the **Tier 13**
planning & authoring batch (**#103**–**#116**, none of it started), and the deferred
public-launch gating (#46/#47). Tier 11 is closed — **#57** per-GM teams is dropped;
**#86** (server-authoritative game logic) is a research spike that was deliberately not
taken up in this batch.

> **Built & removed** (retired numbers, never reused — one-line summaries; full detail in git
> history + the [README](README.md#features)):
> - **1–10** — Tier 1–3 deploy/safety/correctness: Twilio secrets, run-sheet index, SOS→SMS, offline
>   write queue, persistent SOS + GM ack, End-Game unaccounted block, boundary-exit alert, GM-excluded
>   winner detection, shared-device push dedup, transactional arrival dedup.
> - **13–15, 17–19, 30–34, 36–40** — ration review/submit UX; location/arrival purge on end;
>   parallelized `getMyGames`; shared broadcast sub; single tracking controller; login-loading reset;
>   coordinate-range rule validation; SMS rebrand; index trims; Tier 9 UX (list sort + `gameDate`,
>   join prefill, navigate-after-join); Tier 10 (web polygon authoring, per-player checkpoints,
>   GM↔GM messaging).
> - **48–56** — **2026-06-07 checkpoint/field-test batch**: authoring redesign (place vs. behavior
>   editor, `Checkpoint.icon`); early-reveal markers + `visibleFrom`; server pass-through detection;
>   GPS fix-quality gate + N-fix debounce; web polygon commit-on-teardown; `useRationReminders`;
>   `checkpointTrips` re-notify/cooldown latch; `autoEndThreshold`.
> - **59** — player no longer bounced to "My Games" on a cache-sourced `exists:false` (gated on a
>   server-confirmed snapshot).
> - **60** — **checkpoint & runbook overhaul**: checkpoint = identity + visibility; all behavior in a
>   top-level GM-only `runbook` of priority-ranked entries (`fixed-order`/`always-on`/`timed`/
>   `gm-prompted`; `hazard`/`boon`/`notify`/`gm-notify`). Geofence delivers the highest-priority match;
>   `fireRunbookEntry` callable; web Runbook editor. Schema lives in `types/index.ts`.
> - **65–70, 73, 76** — `cloneGame` + Clone UI; ration "not eaten" gated on `isOpen`; per-entry
>   `entryTrips` latch (one entry per `tripIntervalMinutes`); closed-phone GM-broadcast push
>   (`Broadcast.pushed`); `AlertOverlay` re-pop; GM `NotificationFeed` from `entryTrips`.
> - **63, 64, 68, 72, 74** — shared `common/` helpers (`pointInBoundary`, `validateGameConfig`);
>   numeric config validation + ordering; out-of-boundary placement guard; `submitRation` callable +
>   unique-card enforcement (`rations` `create` now locked to `if false`); `rationPings` + idempotent
>   latch; gm-notify fire warning.
> - **62, 75, 71, 11, 61** — `/demo` refresh for the runbook model; capped Play-view feed + "See all"
>   modal; `Broadcast.dismissedBy` player dismiss; `starvationSweep` auto-elimination (opt-in
>   `starvationMode:'auto'`, idempotent latch, purged on end); web "Scheduled announcements" pane.
> - **20–28** — **Tier 7 integrity invariants** (no new schema): late-join lock; member delete-lock in
>   `play` + `deleteAccount` scrub-and-eliminate; deterministic `broadcasts/{userId}_death` toll;
>   shared `startPreflight`; interval-config freeze (client + rules); `revivePlayer` (+ `results→play`
>   reopen); guarded monotonic phase helpers; dangling-reveal warning; End-Game confirm + audit log.
> - **Mobile client halves** of #20–25, #63/#64/#66/#70/#71/#74, #11, and mobile Clone ship in the
>   **2026-06-17 APK** — the server/web/rules sides of all of these are already deployed.
> - **12, 16, 29, 35, 58** — **"harden for the first real event" batch**: auto per-interval
>   "N remain" broadcast (seeded at Start when `playerCountBroadcast` is on); geofence game-doc +
>   member-doc short-TTL caches (cuts per-write reads); sole-GM `deleteAccount` rescue
>   (`transferGmOrEndGame` promotes the longest-tenured player or ends the game); low-battery beacon
>   (`PlayerLocation.battery`, GM roster/map flag); single-game test checklist (`TESTING_CHECKLIST.md`).
> - **41–45** — **Tier 11 P3 polish batch**: `endgame` phase (GM-placed convergence rally in
>   `markers`, rations auto-off, geofence/tracking stay live, broadcast + banners); custom arena
>   `mapOverlay` (web upload + 4-corner georeference, web true-quad raster render, mobile bbox
>   `Overlay`, `storage.rules` overlay path); night-before practice game (`Game.practice`/
>   `Checkpoint.test`, `createGame` flag, PRACTICE badges, relaxed #20/#22/#28 guards + rules
>   carve-out, drop-test-checkpoint, `resetPracticeGame`, auto-delete on end, GM readiness view);
>   voucher-site run-sheet preset (scaffolds open/close/announce rows); post-game `media` (GM
>   attaches host-validated YouTube + Google Photos links on results, `onGameMediaWrite` pushes
>   all-but-setter, results screens link out). Schema in `types/index.ts`; `common/mediaLinks.ts`.
> - **81** — **last-tribute winner on results**: the sole survivor is stamped on the game doc
>   (`winnerId`/`winnerName`, denormalized because players can't read other members) on the
>   `status → ended` transition — winner detection (`members.ts`) stamps it in its transaction on the
>   auto (last-death) path, and the game-end chokepoint (`cleanupRationPhotosOnGameEnd`) fills it in for
>   the manual GM **End Game** path when exactly one player is left. The mobile player results screen
>   reads it: "YOU WON 🏆" for the winner, who-won for everyone else. Functions pending deploy; the
>   results UI rides the next APK.
> - **80** — **per-entry player targeting + reveal-on-fire**: a runbook entry can name the players
>   who may trip it (`RunbookEntry.playerIds`; anyone else crossing falls through to the next entry,
>   and a `gm-prompted` entry defaults its recipients to that list), and can reveal its checkpoint on
>   the player map when it fires (`revealOnFire: 'triggerer'|'targeted'|'all'` → the existing
>   `markers` projection, so the site stays visible for the rest of the game). Geofence +
>   `fireRunbookEntry` honor both; authored in the web Runbook editor, read-only on mobile.
> - **77, 78, 79** — **2026-06-18 field fixes**: #77 closed-phone tracking traced to Android battery
>   optimization/Doze (reproduced on a stock Pixel 8) — added a battery-optimization exemption flow
>   (`services/batteryOptimization.ts`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, lobby "Background
>   activity — Unrestricted" row, play-screen warn banner, `batteryOptimized` diagnostic); #78 ration
>   panel un-stuck after submit (Firestore `rations` read allowed when `resource == null`, so the
>   player's pre-create listener isn't denied); #79 joining a `setup`-phase game now says "not open
>   yet" vs "already started". Rules + functions deployed; the mobile battery flow rides the 2026-06-18 APK.

---

## Field-test findings

**82. Location jitter — players "all over the map" when the phone locks.** Reported after the
2026-09-04 game: with a phone pocketed and screen-locked, players teleport around the GM map.

*Cause.* Android's fused provider falls back to Wi-Fi/cell trilateration once the screen locks —
field-measured ~52 m accuracy while walking, and one stationary Pixel 8 reporting 22 m accuracy
while sitting ~64 m off. Every such fix moves the dot, because the client writes each fix
unconditionally and `minFixAccuracyMeters` gates only *checkpoint evaluation*, not the write.

> **Built (2026-09-05), recording + display only — the upload path and geofence are untouched:**
> - **Diagnostic capture.** `PlayerLocation.speed` / `.mocked` / `.steps` ride every fix through all
>   three upload paths; `locationTrail` also records `stepsSincePrev` to pair against
>   `metersSincePrev`. `speed` is the network-fallback tell (Doppler-derived, so a trilaterated fix
>   usually reports none) and is a better "is this fix real?" discriminator than `accuracy`.
> - **Step counting** (`services/stepCounter.ts`, `expo-sensors`). **Recording only — nothing reads
>   it for any decision.** Hardware step counter, not the accelerometer: both platforms count on a
>   low-power coprocessor that survives Doze and app suspension for <1%/day, whereas sampling accel
>   ourselves needs the CPU awake, which is exactly what we lack when pocketed. Fail-soft
>   throughout; started fire-and-forget *after* the location grant so the optional
>   `ACTIVITY_RECOGNITION` prompt never precedes the critical one, and re-armed inside the
>   background task because that task can run in a fresh JS context after a process recycle.
> - **Display-side jump suppression** (`common/locationStabilizer.ts`, wired into both GM contexts).
>   Holds a fix only when it is **both** implausibly fast (>7 m/s) **and** lower-quality than what's
>   displayed, hard-capped at 60 s. Deliberately in the read path, not the write path: suppressing
>   writes would change `change.before` for #49 pass-through detection (altering **checkpoint
>   firing**) and would blind `locationTrail`. `StabilizedLocation` extends `PlayerLocation`, so
>   existing consumers are unaffected.

**Outstanding under #82:**

- ~~**Render the confidence data.**~~ **Dropped (2026-09-06.)** `confidenceM` / `stale` / `held`
  reach both maps and nothing draws them — and after the GPS_PROVIDER fix the map is good enough
  that accuracy circles and stale dimming are not worth the time. The fields stay (they cost
  nothing and the data is still useful when reading a trail back); the UI is off the roadmap.
- **Tune the gate from real data.** The 7 m/s and 60 s constants are guesses — loose on purpose,
  since a teleport detector that never false-fires beats a smoother we can't calibrate. Re-derive
  them from a `locationTrail` capture (walk a known route pocketed + locked, with a control
  recording in Strava on the same handset, plus a stationary segment where all movement is error).
- **Clock-skew in staleness — parked with the UI above.** `ageMs` subtracts a Firestore *server*
  timestamp from the GM device's `Date.now()`, so a skewed GM clock marks everyone permanently
  stale or never stale. Harmless while nothing renders staleness, which is now the plan; fix it
  only if that UI is ever revived.
- **Capture-layer suspects, if the trail shows gaps rather than scatter.** A foreground service does
  *not* keep the CPU awake; `expo-location` has a known issue where updates batch to minutes after
  5–10 min of sleep; `foregroundServiceType="location"` on Android 14+; and OEM battery allowlists
  (which Strava benefits from and we never will) — which is what the #77 exemption flow compensates
  for. **Verifying that #77 grant on every player's phone is worth more than any of this code.**
> **Built (2026-09-05b) — the motion gate, plus the iOS crash that blocked it:**
> - **`NSMotionUsageDescription` was missing from `app.json`.** `expo-sensors` is not in `plugins`
>   and the key was never declared, so `Pedometer.requestPermissionsAsync()` hit
>   `EXMotionPermissionRequester.m:28` → `RCTFatal` → **process abort**. A native abort, so the
>   fail-soft `try/catch` in `stepCounter.ts` could not catch it. It fires from
>   `startLocationTracking()` *and* from the background task's re-arm, i.e. **every iPhone would
>   have crashed on entering play, and again on each background process recycle**. Android was
>   unaffected — `expo-sensors` ships its own manifest declaring `ACTIVITY_RECOGNITION`, which is
>   why the APK never showed it. The step counter therefore has **never** run on iOS; no shipped
>   build has collected an iPhone step.
> - **Motion gate** (`contradictsSteps` in `common/locationStabilizer.ts`). Holds a fix when the
>   displacement exceeds what the player's own steps could produce
>   (`Δsteps × MAX_STRIDE_M 1.5 + STEP_GATE_SLACK_M 25`). A *bound*, never a dead-reckoned
>   position — it refuses coordinates, it never invents them — and it sits in the read path beside
>   the speed gate, so arrivals stay server-authoritative and no player can trip a site they
>   didn't reach. Fails open on every unknown: no pedometer, declined permission, pre-#82 client,
>   or a negative delta (a counter reset, not backwards walking). A fix carrying Doppler `speed`
>   is exempt, so a vehicle ride doesn't freeze anyone.
> - **Why it earns its place:** the speed gate cannot catch the reported failure. Its quality
>   clause requires the incoming fix to look *worse*, and the field-observed Pixel 8 sat 64 m off
>   while claiming 22 m accuracy. A pedometer reading zero doesn't care what the fix claims.
> - **`StabilizedLocation.heldReason`** (`'steps' | 'speed' | null`) records which gate fired, so
>   the constants can be re-derived from a capture rather than argued about.

> **Built (2026-09-05c) — the first field trail, and what it overturned.** `locationTrail`
> captured 126 fixes over 17 minutes with two players. The results **retired the motion gate before
> it ever shipped** and redirected the whole item:
> - **The confound was screen state, not the handset.** One tester checked their phone repeatedly;
>   the other never unlocked theirs. Median accuracy **12.9 m vs 38.4 m**, on the same walk in the
>   same woods. Doze depth tracks how long a device sits untouched — the checked phone's background
>   fixes were still good because it never settled. This was invisible in the data and only surfaced
>   in conversation, which is why `appState` / `msSinceForeground` are now recorded per fix.
> - **The motion gate would have been actively harmful.** Replayed against the trail it holds
>   **556 m** of one player's real movement and **980 m** of the other's (69% of their total).
>   Android batches step delivery, so `stepsSincePrev` reads 0 on ~70% of fixes mid-walk; on the
>   locked phone the listener never fired at all. Its fail-open guard checks for *missing* steps and
>   cannot distinguish "sensor reporting a stale 0" from "stood still". **Deleted, not tuned.**
> - **The jump is the correction.** Of 13 fixes implying >7 m/s, **11 arrived with accuracy
>   improving** (one was 133 m away with accuracy going 102 m → 6 m). The dot leaps because GPS
>   reacquires and snaps back to truth, so holding the incoming fix keeps the player *wrong* for
>   longer. The speed gate fired on only 2 of the 13 — it is a backstop, not the mechanism.
> - **The step counter was never broken — it was unread.** The hardware counted correctly
>   throughout; the locked phone's backlogs flushed as **367 / 211 / 319 / 147** steps on each wake.
>   `watchStepCount` simply doesn't deliver in the background. Rewritten to **poll** the cumulative
>   counter (native `TYPE_STEP_COUNTER` shim on Android, CMPedometer's historical query on iOS).
> - **`speed` absence is not the network-fallback tell.** Android reports `0`, never null — zero
>   missing values across 126 fixes. The value is still useful; the earlier schema note was wrong.
> - **Cadence is unchanged and still the binding constraint.** A 3 s request delivered at a
>   **14–18 s median** with ~90 s maxima. At walking pace that is a sample every 20–25 m — you
>   cannot reconstruct a path you never sampled.

> **Built (2026-09-05d) — the six changes under test in the next build:**
> - **Accuracy gate replaces the motion gate** (`tooInaccurate`, `GameConfig.maxDisplayAccuracyMeters`,
>   default 80 m). Rejects the *bad* fix rather than the correction after it — the move the data
>   supports. Chosen from the trail: p90s were 89 m and 116 m, so 80 m keeps ordinary pocketed fixes
>   and drops the 89–203 m outliers that caused the visible teleporting.
> - **Partial CPU wake lock** (`modules/outdoor-native`, `GameConfig.wakeLockEnabled`, default off).
>   A foreground service does **not** keep the CPU awake and `expo-location` holds no lock (verified:
>   zero `PowerManager` references in its Android source). **The one capture-layer variable** — leave
>   the rest of the location request alone while measuring it. Config-gated so both A/B arms come out
>   of a single walk.
> - **Step counter polls instead of listening**, per the finding above.
> - **Capture context per fix**: `appState`, `msSinceForeground`, `batteryOptimized`, `wakeLock`.
>   These exist so the next walk is never again confounded by something only a conversation revealed.
> - **Motion gate deleted**; `heldReason` is now `'accuracy' | 'speed'`.

> **RESOLVED (2026-09-05e) — the third trail. Both players tripped the checkpoint with
> phones closed.** 300 fixes, two players, both confirmed on build 15, backgrounded for
> 158/164 and 132/136 of their fixes. Five arrivals, and **all 60 in-radius fixes were
> taken while backgrounded**. The diagnosis held and the fix worked:
>
> | provider | Shannon median / p90 | Per median / p90 |
> |---|---|---|
> | `gps` | 10.2 m / **32.2 m** | 16.8 m / **26.5 m** |
> | `fused` | 16.6 m / **100 m** | 29.8 m / **147.3 m** |
>
> Medians improve ~40%, but the **tail** is the result: p90 100 m → 32 m and 147 m → 27 m.
> The bad tail that caused the missed crossing is simply absent on GPS_PROVIDER. It is
> visible fix-by-fix at the crossings — same phone, same second, two providers:
> `fused acc 357 m` against `gps acc 18 m` (19 m from the checkpoint, INSIDE);
> `fused acc 291 m` against `gps acc 19 m` (15 m, INSIDE, 16 satellites).

> **Two negative results, both worth keeping:**
> - **The OS geofence never fired.** `geofenceArmed: true` on 300/300 fixes and **zero**
>   `geofenceEnter` rows across five crossings and two players. Shadow mode earned its
>   keep: **do not build geofence-as-trigger** — armed the whole time, contributed nothing.
> - **Adaptive sampling cannot be adaptive in this arena.** `samplingMode` read
>   `'near-checkpoint'` on 100% of fixes, because the furthest any player got from a
>   checkpoint all walk was **123 m**. Any threshold above ~125 m selects everything here.

> **Built (2026-09-05f) — post-trail fixes:**
> - **Exit hysteresis** (`EXIT_HYSTERESIS_FACTOR` 1.5 in `functions/src/geofence.ts`). A
>   player already inside stays inside until they clear 1.5× the radius. Fixes the
>   duplicate arrivals: the 2026-09-05 latch showed `lastEnterAt` and `lastExitAt`
>   **1.1 s apart** with three arrival docs in six seconds. Only ever delays an exit, so a
>   real departure is still recorded.
> - **GPS request rate limit** (`GPS_FIX_MIN_INTERVAL_MS` 20 s). With proximity gating
>   unable to be selective in a small arena, this is the lever that actually bounds
>   battery — and it stops a burst of queued writes firing a satellite request each.
> - **`NEAR_CHECKPOINT_M` 250 → 150.** A better default for a larger arena; **a no-op for
>   this one**, and documented as such so nobody mistakes it for the battery fix.

**Outstanding under #82 (continued):**

- **Checkpoint radius stays at 20 m — decided from data, do not widen.** The replay says a
  20 m radius catches all five crossings on GPS-quality fixes. The earlier "widen to
  40–50 m" suggestion was based on fused-provider error and is **withdrawn**: widening now
  would only add false triggers, which in a hidden-trap game punish a player who was never
  there and cannot dispute it.
- **Battery cost of continuous GPS — ANSWERED (2026-09-06, Stonedam Day 2). Not a problem.**
  Continuous GPS ran for ~3 h with 10 players in an arena small enough that the receiver was
  effectively always on, and **exactly one player finished low**. The `GPS_FIX_MIN_INTERVAL_MS`
  rate limit appears to bound the cost as intended, and the #35 low-battery beacon did its job:
  the one case surfaced on the GM roster rather than being discovered when the player dropped
  off the map.

  **What this is and is not.** It is a fleet-level pass/fail on the question that actually
  blocked a full event — *does continuous GPS flatten the field over a real game?* — and the
  answer is no. It is **not** a battery curve: nobody isolated handset, starting charge, screen
  time, or which A/B arm (`wakeLockEnabled`) that one player was on, so the cost per hour is
  still unquantified. Don't cite this as "battery is measured"; cite it as "battery was not a
  problem at Stonedam Day 2". `PlayerLocation.battery` rides every fix (#35), so if a curve is
  ever wanted, a captured game yields it with no extra instrumentation.
- **`satellites` is device-dependent.** Per's handset reports 0 alongside good 18 m fixes
  (the OEM doesn't populate the legacy extra); Shannon's reports 7–17 properly. Treat 0 as
  unknown, never as "no satellites".
- **Trail rows can duplicate** from Cloud Functions at-least-once delivery. Harmless for
  analysis, but de-duplicate on `(playerId, clientUpdatedAt)` before computing counts.
- **Fix cadence is unchanged at 17–23 s (p90).** The 1–2 s medians in the third trail are an
  artifact of paired fused+gps writes, not an improvement. Nothing in this batch touched the
  location request, and the wake lock showed no effect on cadence in the second trail.
- **`locationTrail` retention — now four collections, not three.** As of the Tier 12 build,
  `config.locationTrail` also spares `arrivals`, `checkpointTrips` and `entryTrips` from the
  end-of-game purge (see #100), because a trail is uninterpretable without them. The
  instruction is unchanged and now covers all four: **delete them once the run has been
  read.** No new privacy exposure — the trail already holds every fix, of which the arrival
  positions are a strict subset.

**83. GM push fired on every checkpoint crossing.** Reported 2026-09-05: the GM's phone buzzed for
plain "reached <checkpoint>" arrivals, burying the pushes that actually needed a response.

> **Built (2026-09-05):**
> - **Push is trip-gated.** A confirmed crossing still writes its `arrivals` doc, but only enters
>   the push/SMS path when a runbook entry actually fires (`hazard` / `boon` / `notify` /
>   `gm-notify`) — or when a district co-arrival withholds a trap (#5), which stays notified because
>   it's an exception, not routine traffic. A crossing that fires nothing is recorded and silent, and
>   the function now short-circuits before reading GM member docs, so it costs fewer reads too.
> - **The web feed splits alerts from history.** The compact Play-view sidebar drops `arrival` rows,
>   so it mirrors exactly what reached the GM's phone; every crossing stays in the "See all" modal
>   under its **Arrivals** filter, and the button carries the arrival count so the GM has a cue that
>   crossings are happening at all.
> - **Retired `reNotifyAwayCooldownMinutes` (#55).** It existed only to throttle the *bare arrival*
>   push on a re-crossing; with bare arrivals silent it had no effect left. The gate and its config
>   read are gone; the field is kept `@deprecated` in `types/index.ts` so legacy game docs still
>   typecheck.

> **Built (2026-09-06b) — the mobile half, folded in with #87 as planned:**
> - `AlertFeed` now defaults to **`entryTrips`** — the authoritative log of what actually
>   fired — with plain "reached <checkpoint>" crossings one tap away behind the arrival
>   count, mirroring the web sidebar / "See all" split. Mobile `GameContext` gained an
>   `entryTrips` subscription to feed it.
> - **The unseen badge and the haptic counted `arrivals.length`**, so they fired for
>   crossings that pushed nothing — the same noise #83 removed from the push path, kept
>   alive on the GM's own screen. Both now count fired entries.

**Outstanding under #83:**

- **Still not field-verified**, and this is now the item's only open thread. Confirming a
  bare crossing goes silent while a hazard still pushes needs a device inside a checkpoint
  radius; it has been typechecked and reasoned through, never seen.

---

**100. Geofence quality — Stonedam Day 2 (2026-09-06).** The first run with enough arrivals to
measure the crossing logic statistically: 198 arrivals, 98 `checkpointTrips`, 10 players, 25
checkpoints all at a 20 m radius, over 3 h of play. Pulled live from Firestore near the end of the
game; `locationTrail` was **off**, so gap lengths are still unmeasured.

*What the data said.*

- **22% of arrivals (44/198) were recorded from outside the checkpoint radius**, nine of them
  >100 m out, worst 295 m (Payne / The Old Dam), then 245 m and 210 m (snowmobile access point)
  and 198 m (Stone Bench Beach). Cause: #49 pass-through with `MAX_SEGMENT_METERS = 400`. A 400 m
  line drawn between two consecutive fixes sweeps a corridor across most of an arena this size and
  clips a 20 m circle almost by construction.
- **The median arrival landed 17 m from centre at a 20 m radius** — crossings were being confirmed
  by fixes sitting on the rim, not in the circle. The flat 100 m `minFixAccuracyMeters` gate let a
  99 m fix vote on a 20 m question.
- **29% of arrival docs (58/198) were repeats within five minutes** of the previous one at the same
  checkpoint. Payne recorded The Crossroads **six times in 2 m 41 s** at 9 → 72 → 55 → 113 → 109 →
  16 m; Emma recorded Stone Bench Beach twice **2.4 s apart**. #82's exit hysteresis cannot reach
  this: it only guards a trip already latched `inside: true`, and a pass-through deliberately
  latches `inside: false`, so it is exempt from both the hysteresis *and* the `geofenceConfirmFixes`
  streak, and the next fix starts a fresh crossing.
- **Two checkpoint pairs overlapped**: Bathrooms ↔ The Docks and South Beach Start Third Arrival ↔
  Stone Bench Beach, both **32 m apart with 20 m radii**. Emma sat between the first pair and
  generated **15 arrival docs in 13 minutes**. Nothing in the editor warned about it.
- **`batterySaver: true` was the whole game's accuracy story.** It selected
  `Location.Accuracy.Balanced` — explicitly the ~100 m tier, which lets the fused provider serve
  Wi-Fi/cell trilateration instead of waking the receiver. `provider: 'fused'` throughout, and
  `onLocationUpdate` was still rejecting live fixes at 156 m / 792 m / 107 m / 124 m in the closing
  minutes. `wakeLockEnabled` was unset, so all eleven surviving location docs read `wakeLock: false`.
- **App Check has never worked in the field.** Every `submitRation` call logged *"Decoding App Check
  token failed"* with `{"app":"INVALID"}`. `__DEV__` is false in a `preview` EAS build, so
  sideloaded APKs were selecting `playIntegrity`, which cannot return a verdict for an app the Play
  Store didn't install. Harmless only because enforcement is off — turning it on would have been a
  total mid-game outage for every player.

> **Built (2026-09-06) — the crossing logic, the capture layer, and the accelerometer retry:**
> - **Per-checkpoint accuracy gate.** `GameConfig.accuracyRadiusFactor` (default 2) requires a fix's
>   accuracy to be better than `radius × factor`, clamped between `MIN_ACCURACY_FLOOR_M` (25 m, so a
>   small checkpoint can't demand the impossible and fall silent) and the flat
>   `minFixAccuracyMeters` ceiling. A too-coarse fix `continue`s **without touching the trip** — an
>   unreadable fix is not evidence of leaving, so it must not reset a streak or trip the exit path.
> - **Tiered pass-through cap.** `passThroughMaxSegmentMeters` (default 150) is what the geometry is
>   believed on *alone*; between that and `CORROBORATED_MAX_SEGMENT_METERS` (400) a crossing is
>   admitted **only on positive step evidence**. A flat cap was tried first and rejected on the
>   replay: it withdrew two crossings that were each a player's only arrival at that checkpoint, one
>   of which (Gus, snowmobile access point, 245 m) delivered a real runbook hint. Whether that walk
>   happened is a question for the pedometer, not a length threshold.
> - **Step corroboration — the accelerometer retry** (`GameConfig.stepCorroboration`, default on).
>   A pass-through asserts the player *walked* `segLen` metres; the hardware counter runs on a
>   coprocessor through Doze, so it can be asked. Three things separate this from the motion gate
>   deleted on 2026-09-05: it compares readings at least **`STEP_LOOKBACK_MS` (45 s)** apart rather
>   than adjacent fixes 3–15 s apart (where Android's batching genuinely reads 0 mid-walk — the bug
>   that cost 556 m and 980 m of real movement); it runs against the **polled hardware counter**,
>   not the `watchStepCount` listener that reported 2 steps for a phone locked 16 minutes; and it
>   may only veto an **inferred** crossing no fix witnessed, never a real fix or a player's map
>   position. That last one is the load-bearing distinction — the counter under-reports and never
>   over-reports, so only its positive direction is trustworthy. `common/locationStabilizer.ts`
>   keeps its ban on reading `steps`, and now says why the ban is narrower than it looks.
> - **Re-arrival cooldown.** `reArrivalCooldownMinutes` (default 5) is the backstop hysteresis
>   structurally can't be. A normal entry inside the window still latches presence (the player
>   really is inside; #67 re-eval and the exit path need it) and only withholds the duplicate
>   arrival doc; a pass-through latches nothing. `CheckpointTrip.lastArrivalAt` advances **only when
>   an arrival is actually written**, so a suppressed burst can't keep pushing the window forward.
>   `lastArrivalSteps` lets positive step evidence admit a genuine round trip early.
> - **OS geofence promoted out of shadow mode** (`trustOsGeofence`, default on). An OS Enter event
>   for a checkpoint now satisfies `geofenceConfirmFixes` on its own and relaxes that checkpoint's
>   accuracy gate to the flat ceiling — it is a second independent witness from the platform's
>   low-power stack, which keeps working when our own cadence has collapsed. It deliberately does
>   **not** create an arrival by itself: the OS watches an inflated circle (`radius × 1.5`, min
>   `+25 m`), so believing the event alone would move every checkpoint's effective radius outward.
>   The position still has to be in-radius; only the debounce is skipped.
> - **Arrival provenance.** `Arrival.via` (`'fix'` | `'pass-through'` | `'os-geofence'`) and
>   `.fixDistanceM`. `latitude`/`longitude` stay the *actual* fix, never fabricated at the
>   checkpoint — these two fields are what separate "stood in the circle" from "a line was drawn
>   through it", which this post-mortem had to reconstruct by hand.
> - **Capture layer.** `wakeLockEnabled` and `locationTrail` both default **on**; `batterySaver`
>   moved `Balanced → High` (still GNSS, ~10 m tier) and 15 s → 20 s, so the saving comes from
>   asking less often rather than from accepting fixes too coarse to answer the question.
> - **Too-close checkpoints.** `findCloseCheckpoints()` in `common/geo.ts` (shared by both GM
>   surfaces) flags pairs whose rims come within `CHECKPOINT_MIN_GAP_M` (20 m), surfaced as a named
>   Start-Game preflight **warning**, not a blocker — stacking two objectives on one landmark is a
>   legitimate design, it just shouldn't happen by accident.
> - **App Check provider by channel.** `production` attests for real; anything else uses `debug`
>   (register the device token under App Check → Manage debug tokens). Override with
>   `EXPO_PUBLIC_APP_CHECK_PROVIDER=attest|debug|off`.

**Outstanding under #100:**

- **None of it is field-verified.** Typechecked and replayed against the Stonedam arrivals, not run
  on a device. Replaying the tiered cap + cooldown over that game's 198 arrivals gives 143 arrivals
  with **zero** player/checkpoint pairs losing their only crossing when steps confirm the long
  walks, and 139 with two such losses when steps deny them — which is the intended behaviour in
  both directions, but the pedometer's actual verdict on those two is unknown.
- **`STEP_LENGTH_M` (0.75) and `MIN_STEP_FRACTION` (0.5) are conventions, not measurements.**
  Re-derive from the next `locationTrail` capture, which now records `fixGapMs` and
  `trustedStepsSincePrev` alongside `stepsSincePrev` for exactly this.
- **Fix-gap length is still unmeasured.** The original question — how long does a player actually go
  without a usable fix — needs a trail, and Stonedam ran without one. It is on by default now.

> **No capture exists yet for either of the two bullets above.** All of this work — the trail
> defaulting on, `fixGapMs` / `trustedStepsSincePrev`, and the retention fix that stops the
> arrivals and trip latches being purged — landed **after** the 2026-09-06 game, in a session that
> ran once it was over. So the step-length and fix-gap questions are not waiting on someone reading
> data that already exists: **the next captured game is the first one that can answer them.** Do
> not go looking in `field-data/2026-09-06-stonedam-day-2/` for it; that snapshot predates all of
> it and had `locationTrail` off.
- **Mixed builds confound everything.** That game ran `buildVersion` 11, 15 and 16 simultaneously.
  Get everyone onto one build before drawing conclusions from the next capture.
- **Role changes mid-game orphan player data — addressed, though not for this reason.** Will
  and Joe hold `role: 'gm'` with player arrivals and location docs, because they were
  promoted after crossing checkpoints, which made member role an unsafe filter for
  post-game analysis. **#91's `everPlayer` / `playerRun` now record that history durably**,
  so a promoted member is still identifiable as a player and their run is frozen at the
  promotion rather than lost. Members from before that change still need the caveat.
- ~~**The evidence deletes itself.**~~ **Built (2026-09-06b).** `cleanupOnGameEnd` deleted
  `arrivals`, `checkpointTrips` and `entryTrips` the moment `status → ended`; Stonedam ended
  at 18:25:31Z and every collection this analysis rests on was gone minutes later, leaving
  only a snapshot pulled at ~17:55Z (in `field-data/2026-09-06-stonedam-day-2/`, gitignored
  — real names and GPS tracks), which is why the 198-arrival figures are a lower bound.
  All three are now **spared whenever `config.locationTrail` is on**. One flag, one intent —
  *this game is being recorded* — rather than a second switch nobody would remember to set,
  and no new privacy exposure, since the trail already holds every fix of which the arrival
  positions are a strict subset. `locations` is still purged unconditionally; the trail
  supersedes it. **The retention duty transfers with it: delete all four once the run has
  been read.**

**101. Global announcements fire on a crossing, not on the clock.** Found 2026-09-08 in the
Stonedam **Day 1** record (`games/6kX2agUKJeLkQeu78Zoh`, 2026-09-05 13:12:29Z → 14:39:54Z) — a
different game from #100's Day 2, and one whose `broadcasts` are still intact.

The five voucher stations and both gear drops were authored as `timed` runbook entries with
`effect.audience: 'all-players'`. A runbook entry fires on a **crossing**; the window only gates
whether that crossing counts. So every player who walked into the site while the window was open
re-broadcast the same announcement to the entire field — and nobody walking in meant no
announcement at all:

- *"The Voucher Station at The Cliff Wall…"* — 14:29:03, 14:31:14, 14:34:03. Three identical pushes.
- *"The First Gear Drop can be found at The Cairn"* — `startAt` minute 60 (= 14:12:29), actually sent
  **14:32:21, 14:32:27, 14:34:43**. Twenty minutes late, then three times, two of them six seconds
  apart (two players arriving together).
- *"The Voucher Station at The Isolated Beach…"* — 13:54:39 and 13:59:12.

Eight pushes where three were meant. The cost is in the record too: at **14:16:16** the GM
hand-typed a `gm-message` — *"Drop one at rhe cairn is still unclaimed"* — because the announcement
naming that drop had not fired and would not for another sixteen minutes.
`config.tripIntervalMinutes: 2` is what let the repeats through, but the cooldown is not the bug.

**Two fixes, and the second is the real one.**

1. **An `all-players` effect needs a fire-once latch**, independent of the per-player trip
   cooldown. `entryTrips` is keyed per player per entry — correct for a hazard aimed at the
   crosser, wrong for a broadcast aimed at everyone. One game-scoped latch per entry.
2. **The right tool already existed and was one click further away.** `scheduledEvents` fires on
   the clock, exactly once — `auto_playercount_*` did precisely that in this same game — and **#44
   already ships a voucher-site preset that scaffolds open/close/announce rows.** Day 1's
   `scheduledEvents` holds nothing but the six auto player-count rows: the preset went unused
   because authoring an announcement onto a checkpoint in the Runbook editor looks right and is
   closer to hand. Time-based announcements belong in the run sheet, and the Runbook editor should
   say so when a `timed` + `all-players` entry is being written.

Until (1) lands, **#103's importer must refuse `timed` + `all-players`** rather than reproduce this
five times straight from a spreadsheet.

**102. Dead players get promoted to GM, and that hands them the whole console.** Extends #100's
"role changes mid-game orphan player data" bullet, which recorded the *symptom* on Day 2 (Will and
Joe holding `role: 'gm'` alongside player arrivals) and fixed the data-durability half with #91's
`everPlayer` / `playerRun`. Day 1 shows it is not incidental: **nine of the twelve tributes** carry
`role: 'gm'`, and every one of those member docs was written minutes *after* that player died —
Kurt out 14:06:25 / doc 14:21:53, James out 14:08:45 / doc 14:12:03, Big DAWG out 14:00:23 / doc
14:11:57, and six more on the same pattern.

So it is a deliberate, repeated workaround: promote the dead so they can watch the map. **#99 is
the feature they were reaching for**, and it is written but undeployed — this is the field evidence
that it belongs *in* the first deploy rather than behind it. Two residuals #99 does not close:

- **Promotion grants far more than sight.** Elimination, `fireRunbookEntry`, undelayed live
  positions, and the entire runbook — the secrets a spectator must never see. A GM who wants to be
  generous has exactly one control and it is much too coarse.
- **The roster silently changes meaning.** A promoted player reads as a GM, so the "who is actually
  playing" glance a GM takes during play stops being true. #88's roster needs a distinct
  **spectator** state, and the #85 action menu should offer "let them spectate" so role promotion
  stops being the nearest available thing.

---

## Tier 12 — 2026-09-06 post-game review

Sixteen items from two sources on the same day: **#84–#93** from the post-game review, **#94–#99**
from player/GM emails. **Requirements were settled the same day**, so the entries below are written
as decisions rather than options; the few genuinely open threads are called out as such.

Deliberately **not sequenced against an event** — there is a game the same evening and nothing here
lands by then. Two standing facts now shape the whole tier: **iOS is back in the loop**, so every
mobile item is two platforms, not one; and the GM team runs **1–2 GMs on mobile plus one on web
over a hotspot**, so the mobile GM surface is load-bearing and not a second-class view.

> ## ✅ Tier 12 is built (2026-09-06b) — every item except **#86**
>
> Written in the planned order, with one deviation: **#88 had to move ahead of #99.** The
> spectator map needs to know which location docs belong to living players and who has an
> open SOS, and a spectator may read neither `members` nor (reliably) anything stamped on
> the location doc — that write is a full replace, so a server-stamped flag there is wiped
> by the next fix. The #88 roster projection answers both, so it landed first.
>
> **#86 was deliberately left.** It is a research spike whose own entry says to answer the
> OTA question before prototyping anything, and it is the one item in the tier that would
> produce an architecture rather than a feature.
>
> Nothing here has been deployed or run — see the standing warning at the top of this file,
> especially the point about deploying the functions and the build together.

**Build order — cheap first, then critical (all done except #86):**

1. ✅ **#94** safety alert survives death — cheap *and* the only defect. Done first.
2. ✅ **#93** (one prop), **#95** (new-drop styling), **#85** (GM action menus), **#98a** (web
   runbook filters).
3. ✅ **#88 → #89 + #99** — the roster, then the "You died" screen, the countdown and the
   spectator map as one flow (see the note above on why #88 moved up).
4. ✅ **#84** cleanup phase.
5. ✅ **#90** soft delete, **#98b** (the mobile runbook view).
6. ✅ **#96 → #97** player-armed traps: the largest item in the tier, and #96 gated it.
7. ✅ **#87** GM notification mute (with #83's mobile half), ✅ **#91**. ⬜ **#86** the platform
   spike — not started.

**84. `cleanup` phase — a state between "victor declared" and "game closed".**
> **Built (2026-09-06b).** `endGame()` split into `startCleanup()` + `closeGame()`; `endGame`
> stays an alias and Close Game is still reachable straight from `play`, so a GM who doesn't
> want a recovery phase never passes through one. `status` stays `'active'` through cleanup,
> which is what keeps tracking, the boundary alert and SOS running. Winner detection now
> advances to `cleanup` rather than ending the game, with `phase === 'cleanup'` added to its
> idempotency guard since `status` alone no longer means "decided".
>
> The server split followed: `onGameCleanupStart` stamps the winner, projects **every**
> checkpoint into `markers`, and purges the **ration photos at victory**; the location and
> arrival purge stays at close. Rules let any member read any `locations` doc while the phase
> lasts, and carve `clearedBy`/`clearedByName`/`clearedAt` open to any member so **anyone**
> can tick a drop off. The marker set is therefore the drop list and `clearedAt` is the tally,
> with no extra field — both GM surfaces show "N of M collected" and a "safe to close" state.
> `reopenPlay()` handles a victory called wrong; `onGameReopen` clears the crown server-side
> so `winnerId` stays outside the GM's writable key set. **No push** when it opens.
>
> The geofence's phase gate deliberately does **not** list `cleanup` and must not — nobody
> should trip the trap they were sent to retrieve.
>
> **Forward-compat, the decision the schema asked for:** `gamePhase()` now clamps any unknown
> phase to the game's `status`, so a future phase value degrades instead of landing on no
> branch. That does not retro-fix shipped binaries — see the warning at the top of this file.
 `endGame()`
([services/gameService.ts:561](services/gameService.ts:561)) collapses two moments into one write:
it sets `phase: 'results'` **and** `status: 'ended'`, so the instant a winner is declared, tracking
stops, the map goes cold, and the recovery job — collecting every prop from every checkpoint, and
accounting for every player and GM still in the woods — happens with no tooling at all. Insert a
phase between them.

- **New `GamePhase` value `'cleanup'`**, entered from `play`/`endgame`, exited to `results`.
  Guarded + monotonic like the other transitions (retired #27). The GM can step **back** to `play`
  if a victory was called wrong — wanted, but not critical-path.
- **The winner is announced at victory**, on entering cleanup — not held to close.
- **Everyone sees everyone.** Mutual player↔player and player↔GM map visibility for the whole
  phase, and every checkpoint projected into the player-readable `markers` collection so people can
  navigate to the drops they are recovering.
- **Anyone marks a drop cleared**, not just whoever placed it — the person standing at the site is
  the one who knows. The GM gets a running count and a clear **"every drop is cleared"** state, but
  the phase only ever ends manually.
- **Players are expected to help** if they are still around; nobody is pushed about it. People who
  have already gone home get **no** "cleanup started" notification.
- **Ration photos are deleted at victory**, not at close — so the photo purge moves *earlier*, onto
  the cleanup transition, while the location/arrival purge stays at close where cleanup still needs
  it. Those two live in the same function today and have to be split (see the schema).
- **Move the unaccounted-player check to the *close* transition** (retired #6/#28): cleanup is
  exactly when you find out someone never came back.

**85. Move per-player GM actions into a ⋯ menu.**
> **Built (2026-09-06), the roster list:** the icon strip is replaced by a single ⋯ button
> opening a labelled action sheet (status & message, ack/stand-down SOS, district, promote/demote,
> revive, eliminate, remove). Handlers are untouched, so every existing confirmation still guards
> the destructive ones; the row now carries status only.
>
> **Platform gotcha worth keeping:** iOS cannot present anything while a Modal is dismissing, so
> closing the sheet and raising the action's `Alert` (or the district editor's Modal) in the same
> tick silently drops it — the sheet closes and nothing happens. The action is therefore deferred to
> the Modal's `onDismiss`, which is **iOS-only**; Android has no such restriction and runs it
> immediately, because it would otherwise wait for a callback that never fires.
>
> **The district chip stays inline** (confirmed 2026-09-06) — it is the sole inline *display* of a
> district and is already labelled text, not one of the unlabeled icons this item was about; it is
> offered in the sheet as well.
>
> **Built (2026-09-06b) — 85.2, the detail screen.** Rather than paste the sheet into a
> second screen and let the two drift, it is extracted to `components/PlayerActionSheet.tsx`:
> one set of handlers, one set of guards, one set of confirmations, and one copy of the iOS
> Modal-dismissal deferral. `<DistrictEditorModal>` is a **sibling the parent owns**, so the
> roster's inline district chip and the sheet's row open the same editor without raising a
> Modal from a Modal. The detail screen now keeps status only — the bottom Eliminate row is
> gone, and so are the two bare `Acknowledge` / `Clear` words in the SOS banner, one of
> which silently closed a live safety alert with no label and no confirmation.
>
> **#85 is complete.**

Each roster row in
`app/(app)/gm/[gameId]/players.tsx` carries up to six inline icon buttons — ack SOS, clear SOS,
eliminate, revive, role toggle, remove — plus a district editor and a tap-through to the player
detail screen. On a phone that is a row of unlabeled ~24 px targets with the destructive ones
sitting next to the routine ones. **Everything goes into the overflow menu — nothing stays inline**
— with labelled rows so destructive entries are named. **Applies to the player detail screen too**,
not just the list. Mobile only; the web roster keeps its inline buttons.

**86. [Research] Move game logic out of the app shells.** *A real spike with a prototype, not a
paper exercise.* Two drivers, and both were named: the cost of authoring every rule twice
([services/gameService.ts](services/gameService.ts) at 987 lines against
[web/src/services/gameService.ts](web/src/services/gameService.ts) at 771, with `common/` holding
only five genuinely shared modules), **and** having to ship an app update — and chase everyone onto
it — for what was only ever a messaging change.

> **Evaluate re-enabling OTA updates first.** The second driver is the sharper one and it may not
> need an architecture at all: `updates.enabled` was turned **off** deliberately (2026-06-19) after
> the install-over crash loop, and turning it back on addresses "I just wanted a quick messaging
> update" far more cheaply than server-driven UI. If OTA covers it, this item shrinks to the
> code-duplication half. Answer that question before prototyping anything.

The remaining question is whether the server can deliver a **generic, event-shaped state** — a
phase, things to show, actions the caller may take, typed notifications — that the shells render
without knowing what a hazard, a ration window or a district *is*. Weigh against what stays
client-side regardless (location capture, permissions, camera, background tasks, maps) and against
its real cost: the schema becomes an API contract with old binaries in the field.

**87. Mute the GM notification firehose.**
> **Built (2026-09-06b).** Per-user `UserProfile.mutedNotifications`, denormalized onto member
> docs by `onUserPrefsWrite` (the `fcmToken` pattern) so the send path stays a member read on
> the #16 cache. Every push site now resolves *recipients* rather than bare tokens and goes
> through `sendClassPush`, classed by effect kind where there is one. **SOS is unmutable four
> ways**: absent from the UI list, stripped client-side, stripped server-side, and refused by
> the filter — and the SOS path deliberately doesn't go through the class filter at all.
> Boundary-exit explicitly *is* mutable.

*The target is the **GM's** alert volume, not players'.*
Preferences are **per user**, not per game — one setting that follows a GM across every game they
run. **SOS is never mutable. Boundary-exit explicitly is** (it fires often enough to be noise, and
that is the GM's call to make). No game-level policy: a GM cannot mute on anyone else's behalf.
Because muting must work when the app is closed, the filter is server-side in the push path — which
puts back a member-doc read that #83 deliberately removed, so it rides the existing member cache
(#16).

**88. The player roster — living during play, standings afterwards.**
> **Built (2026-09-06b), and it moved to the front of the tier** — #99's spectator map needs
> it (see the Tier 12 note). `games/{gameId}/roster/{userId}`, server-written off the same
> `onMemberWrite` the death toll uses plus a phase trigger. During play it lists the **living
> only** and an elimination **deletes** the row, so a client can't scoreboard what it was
> never sent; from `cleanup`/`results` it re-projects everyone who played with `playedMs`.
> `<PlayerRoster>` renders it in the lobby, on the play screen's Stats tab, and as the
> results standing. GMs are never listed.

Players today can read only
their own member doc ([firestore.rules:134](firestore.rules:134)), because member docs carry emails
and FCM tokens. Give them a list — **names only**, no contact details, no locations — available in
**every phase**, showing:

- **during play: living players only** (a dead player leaves the list rather than being shown as
  dead, so it never becomes a scoreboard of who to hunt);
- **after the game: everyone who played, ordered by who lasted longest** — which is the results
  standing, and is most of what #91 was for.

No GM roster, in either mode. Needs a projection rather than a relaxed rule, since the sensitive
fields share the document.

**89. The "You died" screen.**
> **Built (2026-09-06b).** `<DiedOverlay>` — full-screen, blocking, once per game per device,
> the same screen for every cause. `AlertOverlay` gained `suppressIds` so the player's own
> `{userId}_death` toll is withheld (every *other* player's death still reaches them, and the
> toll still fans out to everyone else named). Behind it, a dead player's screen loses the
> tabs, stats, ration panel and diagnostics and keeps the safety alert and the message feed.

When a player is out,
`app/(app)/player/game.tsx:710` swaps the action bar for a muted grey "You're out" card — the map,
tabs and chrome are otherwise identical to being alive. Worse, the death toll is written to **all**
players (`targetPlayerId: null`, [functions/src/members.ts:79](functions/src/members.ts:79)), so
`AlertOverlay` pops the toll — "*Alex has fallen — 3 tributes remain*" — in Alex's own face. (The
*push* already excludes them: `livingTokens` filters on `!out`. So this is the in-app overlay only,
and the deterministic `{userId}_death` id makes suppressing your own a one-liner.)

- A **full-screen "You died"** that **blocks interaction until dismissed**, replacing the generic
  toll for that player. **Same screen regardless of cause** — self-reported, GM elimination or
  starvation all read the same.
- **Everyone else's toll still names them**, unchanged.
- Behind it: **nothing but the spectator map** (#99). No stats, no extra chrome. They **do** keep
  receiving the death notifications for other players.

**90. Delete a finished game, with an undo.**
> **Built (2026-09-06b).** A game that never started is still hard-deleted; a **finished** one
> is soft-deleted with `deletedAt`/`deletedBy`, hidden from every list by both a client
> filter and a rules guard, undoable by **any GM** for 20 minutes via `undoDeleteGame`, and
> hard-deleted by `sweepDeletedGames` (every minute) — which also clears the game's Storage
> objects, since a game deleted from `results` is past the ration-photo purge and nothing
> else would ever remove the #42 overlay. A game in play still can't be deleted at all. The
> confirmation says out loud that every player loses their record of it.

`deleteGame` already does a real `recursiveDelete`
([functions/src/games.ts:406](functions/src/games.ts:406)) but refuses anything that has started; a
finished game can only be *archived*, which is a per-member flag hiding it from one person's list
while every document survives forever. **Any GM** of the game can delete it — not just the creator —
and there is **no age requirement**. It is a **soft delete with a 20-minute recovery window**: the
game disappears immediately for everyone, a GM can undo it within 20 minutes, and a sweep hard-
deletes it after that. The confirmation **must say that other members lose their history too**.

**91. Whatever is left of "was a player".**
> **Built (2026-09-06b), the residual case only** — which is all that was left. `GameMember`
> gained `everPlayer` (set the first time they hold the player role, never cleared) and
> `playerRun` (frozen when they stop being one: eliminated, tapped out, or **promoted**).
> Written server-side ahead of the roster projection so it reads them in the same pass, and
> the frozen run **wins over anything recomputed** — a promoted member's doc no longer says
> `out`, so recomputing would silently credit them the whole game. A #21 revive drops the
> record so it can be re-frozen correctly later.

*Later tier, and now nearly empty.* #99 gives dead
players the spectator map **as players**, so the promotion that used to erase someone's run stops
happening; #88 provides the post-game standing ordered by survival time. What remains is only the
residual case — a GM who genuinely promotes someone to help run the game still erases their run.
Keep a durable record of it if and when that matters.

**92. Join by QR code.**
> **Built (2026-09-06), and simpler than planned:** `/join` now reads a `?code=` param
> (`app/(app)/join.tsx` — prefilled, normalised, never auto-submitted, and it no longer steals
> focus when it arrives from a link), and the **web dashboard renders the player code as a QR**
> encoding `outdoorgm://join?code=…` — in the lobby panel and the Codes modal, on screen only.
>
> **The signed-out case is handled**, which is the common one: a scanned link lands inside the
> `(app)` group, whose layout bounces an unauthenticated user to login and drops the query string.
> `app/(app)/_layout.tsx` now stashes the code (`constants/storageKeys.ts`) before redirecting, and
> the Join screen consumes it once. **Accepted as-is (2026-09-06):** a signed-in player scanning the
> QR lands straight on a prefilled Join screen; a signed-out one signs in, arrives at My Games, and
> finds the code already filled when they tap Join. Routing them straight through would mean
> changing post-login navigation, which is not worth it for the second case. The QR renders only for a well-formed 6-character code, so the
> lobby's `…` placeholder can never be encoded into something a scanner reads as real.
>
> **No in-app scanner is needed.** The phone camera resolves the deep link itself, so the
> `expo-camera` scanning UI this item assumed can be skipped entirely.
>
> **Built (2026-09-06b) — the QR on the GM phone, and the decision it needed.** Adding
> `react-native-svg` was rejected for exactly the reason flagged: the iOS pod configuration is
> held together by a `useFrameworks: "static"` + `disableSPM: true` pair that has already cost
> two rounds of debugging, and `qrcode` itself reaches for `canvas`/`Buffer`. So `common/qr.ts`
> computes the matrix in **pure TypeScript** (byte mode, level M, versions 1–10) and
> `<QrCode>` draws it as plain `<View>`s, collapsing each row into runs so a version-3 code
> costs a few hundred views rather than 841. **No new dependency at all**, native or otherwise.
>
> **It is verified rather than eyeballed.** Compared module-for-module against the `qrcode`
> package already in `web/`, across 227 payloads spanning every supported version plus random
> inputs: all exact, and 224 also pick the same mask unaided. That harness caught two real
> bugs — format bits placed least-significant-first, and copy 2's bit 7 landing on the
> always-dark module — each of which yields a matrix that looks entirely plausible and scans
> as nothing.
>
> Shown in the **lobby** (where the code actually gets used) and the Codes modal, screen-only,
> and only for a well-formed six-character code. `isJoinCode`/`joinDeepLink` moved to
> `common/joinCode.ts` so the phone and the dashboard can't drift; both had their own copy of
> that regex.
>
> **#92 is complete.**

The GM reads a 6-character code aloud and every player types it
(`app/(app)/join.tsx:38`). Show a QR on **the GM's phone and the web dashboard** — not printed, so
the code isn't left lying around photographable — encoding an `outdoorgm://join?code=…` deep link.
Scanning fills in **the code, and the display name from the scanner's profile if they have one
set**. **One code per game**, unchanged — no rotation. Scanning is cheap (`expo-camera` is already
a dependency for ration capture, so no new native module and no new permission); the QR *renderer*
for the GM side is a new pure-JS dependency.

**93. Stop autofocusing the display-name field on Profile.**
> **Built (2026-09-06):** the `autoFocus` prop is gone from the display-name input; the
> delete-account modal keeps its own, which is correct. Rides the next mobile build.

`autoFocus` on the name input
(`app/(app)/profile.tsx:86`) throws the keyboard up the moment Profile opens, covering the options
below it. **Remove the autofocus and leave the layout alone** — no reordering.

---

### Emailed field feedback (same day)

**94. The safety alert must survive death.** ***Do this first.***
> **Built (2026-09-06), the client half only:** the safety-alert button is extracted into one
> `renderSosButton()` and rendered in the `out` branch of the play screen *and* on the lobby/waiting
> screen, so it no longer disappears when a player is killed. The confirmation copy now says
> "**last known** location" for an out player, because tracking still stops at death.
>
> **Also built (2026-09-06), not deployed:** the geofence now skips eliminated players
> (`if (member.out) return;` in `functions/src/geofence.ts`), plus `out` on the cached member
> projection. The guard sits with the GPS-quality gate, **after** the `locationTrail` write and the
> boundary-exit alert rather than at the member lookup — so once dead players keep uploading, their
> breadcrumbs still land and a dead player leaving the arena still raises the boundary alert, which
> is a safety signal. Only checkpoint/runbook resolution is suppressed. This was already a latent hole — the offline write queue
> (#4) can flush a fix captured *before* a death — and it is the hard prerequisite for letting dead
> players keep uploading. The 15 s member cache means a crossing in the seconds right after an
> elimination can still slip through, the same window the boundary latch already accepts.
>
> **Built (2026-09-06b) — the rest of it.** The `!out` tracking gate is **lifted**: a dead
> player keeps uploading, so their alert is backed by a live fix instead of a stale one, which
> was the whole point. `handleMarkOut` no longer stops tracking either. The fan-out **widens
> to GMs *and* every player already out**, never a living one — the dead are off the board,
> already walking out, and (with #99) holding a map of the arena, whereas a living player
> reaching a casualty would mean walking to them and a safety alert must never double as a
> hunting beacon. The sender is excluded by uid; SMS stays GM-only. The confirmation copy
> dropped its "last known location" branch, which existed only because tracking used to stop.
>
> **Still outstanding: deploying the function.** The geofence `member.out` guard has now been
> written and undeployed since 2026-09-06, and the client change *depends* on it — see the
> deploy order at the top of this file.

When a player is marked out,
`app/(app)/player/game.tsx:710` swaps the whole action bar — the "I've been killed" button **and
the safety-alert button together** — for a static card. The requirement is simply that **the option
never goes away**: a dead player is exactly who is alone, cold and walking out of an arena in the
dark, and they must still be able to call for help. It shows in **every state** — out, eliminated,
endgame, cleanup, results.

- **A dead player keeps uploading their location** (the tracking-stops-on-death rule is lifted; see
  #99), so an SOS is backed by a live position rather than a stale one. If a fix can't be had, the
  alert **still goes out**, flagged as having no fix — a safety alert is never blocked on GPS.
- **It reaches GMs *and* every dead player — never living players.** Together with #99's map this
  makes the dead the standing rescue crew: they have the boundary, every checkpoint and the alert.
- **The alert itself doesn't change by who sent it** — dead or alive, it means the same thing:
  this person needs help.
- **The control stops at the end of the game** (settled 2026-09-06). It shows in the lobby and
  through play, endgame and cleanup — including after a player has died, which is the point — but
  **not in `results`**. Paging stops at close anyway, so a button that summoned nobody would be
  worse than no button; once the game is over people go back to phoning the GM. This is what the
  code already does: `renderSosButton()` is wired into `renderWaiting()` and both branches of
  `renderPlay()`, and deliberately not into `renderResults()`.

**95. Show new map drops as new.**
> **Built (2026-09-06):** `RevealedMarkerPin` takes an `isNew` flag — primary-coloured ring plus a
> badge dot (inside a padded wrapper — **Android clips children that fall outside their parent's
> bounds**, so a badge hung off the pin's corner never renders) — driven by a per-game "seen" set
> in AsyncStorage on the player screen. Until-seen, and "seen" advances only while the map tab is
> actually up, after a 5 s dwell so a marker that lands
> under the player's eyes still reads as new. The record also stamps a `since` time on this
> device's first open of the game, and anything revealed before it is never "new" — otherwise every
> always-shown checkpoint would light up at once on the screen a player uses to get their bearings.
> Fail-soft: while the state is loading, or if storage
> throws, nothing is flagged, which is exactly the pre-#95 behaviour. The pin's key carries `isNew`
> so Android repaints it once `tracksViewChanges` has settled. Rides the next mobile build.

Discovering a drop already notifies ("you discovered X") when a
player trips a checkpoint or hazard — that part works. The gap is purely visual: **a checkpoint
that has become visible since the player last had the map on screen should look different from one
they've already seen**. Newness is **until-seen**, never time-decayed, and "seen" means **the map
was actually on screen**, not merely that the app was opened. A dot, a highlight, a star — whatever
reads best; those were suggestions, not a taxonomy. No GM-side visibility into who has seen what.

**96. Author player-targeted entries before anyone has joined.**
> **Built (2026-09-06b).** `RunbookEntry.targeted` adds the state `playerIds` couldn't express.
> Set with an empty list, the entry is **inert**: crossing resolution skips it rather than
> falling back to "anyone", and `fireRunbookEntry` gives it no default recipients and refuses
> until the GM picks. A new flag rather than redefining `[]`, since entries in the field
> already carry empty arrays. `common/runbook.ts` holds the one `isInertEntry` predicate both
> shells and the preflight share. Start **warns and never blocks**; the web runbook gained a
> "Needs players" filter and both GM surfaces badge inert entries distinctly from targeted
> ones. `cloneGame` strips targets and marks the copy inert.

`EntryEditor` refuses to save a
"Specific players" entry with an empty list
([web/src/components/EntryEditor.tsx:140](web/src/components/EntryEditor.tsx:140)) and shows "No
players have joined yet" during `setup`, so targeted authoring is pushed into the minutes before
the start. The refusal is not arbitrary — the server reads an empty `playerIds` as **"anyone"**
([functions/src/geofence.ts:108](functions/src/geofence.ts:108)) — so fix the semantics, not the
dialog: a targeted-but-unassigned entry must be **inert**, authorable and skipped by crossing
resolution until it is filled in.

- **Warn at Start, never block.** There are mechanics where the assignee genuinely isn't known
  until someone arrives somewhere, so an unassigned entry is a legitimate state to start a game in.
- **Assigning during play already works and must keep working.**
- **The existing per-player targeting is sufficient** — no "any N players", no by-district.
- **Cloning a game strips targets back to inert.**

**97. Player-armed traps.**
> **Built (2026-09-06b).** `armPlayerTrap` is the only write path (`runbook` stays
> GM-write-only — a player who could write those docs could read every trap in the game); it
> takes a code, never lists kits, and resolves the **site server-side** from the caller's own
> last fix, so the arming UI is never handed checkpoint coordinates. Single-use is enforced in
> a transaction and *is* the quota mechanism. Exclusions only, the armer always spared, an
> excluded player falls through as if the entry weren't there, and the armer is never told it
> fired. Victims are a **co-arrival window** (`maxVictims` within 15 s of the first) read off
> `entryTrips`, which `fixed-order` slots cannot express. `checkpointId` became optional —
> six call sites that assumed it now guard for it. GM audit + disarm re-issues a fresh code,
> since clearing the stamps alone would leave the spent card valid.

*The largest item in the tier.* The GM pre-sets traps; a player finds a
physical **trap kit** — usually a card — that corresponds to one of them, and arms it when they
choose. The player picks *where* and *who is spared*; everything else is the GM's.

- **A kit is a specific pre-set trap.** The card identifies which one, so arming is: enter the
  kit's code, stand near the site, choose exclusions. Each kit is **single-use**, and the number in
  play is bounded by how many cards the GM physically puts out — **no in-app per-player limit**.
- **Arming requires being within 100 m of the checkpoint**, not standing exactly on it: GPS in
  these woods can't support tighter, and #82 measured exactly why. Server-checked against the
  player's own last fix.
- **Exclusions only — there is no include list.** The player names who is *spared*; everyone else
  is fair game. That is what makes warning your friends out of band mean something in the app.
- **An excluded player who crosses sees nothing at all.** No "you avoided something" — the whole
  point is that they never know.
- **It never fires on the player who armed it.**
- **Arming is immediate.** No GM approval step.
- **The armer is never told it fired, or on whom.** With a real trap you'd have to see it happen;
  the game mechanic matches.
- **Victims: the GM sets how many the trap can catch, and they must arrive within 15 seconds of the
  first.** Same effect for everyone caught — no weaker second slot. This is a *co-arrival* window,
  which is not what the existing `fixed-order` slots model (those are per-distinct-arriver with no
  clock), so it needs its own resolution path — though #5's 90-second same-district suppression is
  the shape of precedent.
- **Traps never expire, and survive their owner's death.**
- **The GM decides whether springing it reveals the checkpoint** (the existing `revealOnFire`).
- **The GM writes the text; the arming player never does** — so no player-authored text ever
  reaches another player, and Rule 23 stays intact while players aim effects at each other.
- **The GM must be able to see and undo what players armed**: who, where, against whom.

**98. Runbook filtering — and a mobile runbook view.** Two halves of unequal size.

- **98a (small, web). Built 2026-09-06** — a `FilterBar` in the sidebar filters by checkpoint
  (select), effect kind and trigger (toggle chips from the existing `KIND_ORDER`/`TRIGGER_ORDER`),
  with an "N of M shown" line and Clear. All filtering happens inside the existing grouping
  `useMemo`, so the groups, counts and empty states follow for free; not persisted, per 98.1.
  Builds clean; **still not exercised in a browser** as of 2026-09-06b, and now carrying the
  #96 "Needs players" filter as well. The dev server serves the screen fine (no console
  errors), but reaching the Runbook needs a GM login and signing in is done by hand.
  *Original note:* `RunbookScreen` lists every entry in two flat groups sorted by priority
  ([web/src/screens/RunbookScreen.tsx:61](web/src/screens/RunbookScreen.tsx:61)), which stops
  scaling at a dozen checkpoints with two or three entries each. Filter **by checkpoint** and **by
  kind** — effect (`hazard`/`boon`/`notify`/`gm-notify`) and trigger
  (`fixed-order`/`always-on`/`timed`/`gm-prompted`) — plus targeted-only, reveals-on-fire, and
  (after #96) "needs players". **Filters do not persist between sessions.**
- **98b (mobile). Built 2026-09-06** — new read-only screen `app/(app)/gm/[gameId]/runbook.tsx`,
  reached from a book icon in the GM header. Entries sorted highest-priority-first (the order a
  crossing resolves in), each showing effect kind, checkpoint, trigger, timed window, targeting and
  reveal, with horizontally scrolling filter chips for site / kind / trigger. Purely additive: it
  reads `runbookEntries` + `checkpoints` straight off `GameContext` — which already exposed both —
  and writes nothing, so no existing screen is touched. Authoring stays on web.
  *Original note:* The mobile GM had **no runbook screen at all** — `app/(app)/gm/
  [gameId]/` has checkpoints, run-sheet, players, rations and the map, and nothing else. So "the
  same on mobile" means **building a runbook view**, read-and-filter, from scratch. Justified by
  the 1–2 GMs working from phones in the field, but it is its own piece of work and shouldn't be
  mistaken for adding a filter bar.

**99. Dead players spectate the live map, two minutes after they die.**
> **Built (2026-09-06b).** `spectatorMapEnabled` (default off) + `spectatorDelayMinutes`
> (default 2), both frozen at Start. **The gate is in the rules**, not the client —
> `isSpectator()` requires the caller to be out, past the countdown, in a live phase, in a
> game with it enabled; the client timer only decides when to *attach*, since a listener
> opened during the countdown is denied rather than queued.
>
> That made `outAt` security-relevant for the first time: a self-write must now leave it
> untouched or match the server clock, which `eliminatePlayer()`'s `serverTimestamp()`
> already produces. Without it a player could backdate their own death and skip the delay.
>
> **The dead-player map filter went in everywhere** — both GM maps and the spectator map hide
> the dead, with two exceptions: an **open SOS** (drawn distinctly on every map, which is the
> case #94's lifted tracking gate exists for) and **`cleanup`**, where everyone sees everyone.
> Players are told about all of it in the tutorial before they can die, and only when the GM
> has actually enabled it.

*Supersedes the "helper but not quite GM" role.* A dead player keeps `role: 'player'` and gains a read-only view of the arena.
The two minutes exist because the moment right after a kill is the dangerous one — the person who
just died is standing next to the person who killed them and knows where their allies are. With 12
players the read cost of this is negligible; it was never the constraint.

- **They see the boundary, every checkpoint, and the living players** — the checkpoints so a dead
  player can be sent to deploy a drop. They do **not** see other dead players, and they do **not**
  see GMs.
- **The countdown runs from the *recorded* death**, i.e. whenever the GM or the player actually
  marked it — not from a reconstructed time of death.
- **Tapping out grants the same access as being killed.** Nobody trades a chance at winning for a
  map.
- **Players are told this up front**, in the rules/tutorial, before they ever die.
- **No GM early release**, and the map **persists through cleanup and cuts off after it**.
- **Dead players keep uploading their location** — needed for #94's rescue path and #84's cleanup —
  **but are not drawn on anyone else's map**, GM or spectator, to keep the screen readable. They
  see themselves.
- **Anyone with an active SOS is drawn in a distinct colour** on every map that shows them, so a
  response can start without hunting for the row.
- **The gate is server-enforced, and it makes `outAt` load-bearing for the first time.** A client
  timer is worth nothing. Today a player can write their own `out`/`outAt` freely — the member
  self-update rule ([firestore.rules:150](firestore.rules:150)) pins only `role`, `userId`,
  `district` and `sosAckAt` — so backdating `outAt` would hand them the map instantly. Pinning it
  to the server clock is a prerequisite, not a follow-up.
- **Revive already unwinds access** (`out: false, outAt: null`,
  [services/gameService.ts:305](services/gameService.ts:305)) — but note it **cannot unwind what
  they already saw**. A revived spectator knows every checkpoint on the map. That is a GM
  operational fact, not a bug to fix.

## Tier 13 — 2026-09-08 planning & authoring

Fourteen items from two sources read together: the **event planning workbook** ("Hunger Games
Materials 2026", 14 tabs) and the **Stonedam Day 1 game record** in Firestore. The workbook is the
spec for what the app does not do — every column of numbers in it is a data model that lives in a
spreadsheet, and every rule written to compensate for the app is a feature request. The game record
says which of those actually cost something on the day.

**The through-line: the app runs the game well and plans it badly.** Tier 12 aimed at the live
surface and hit it. What is still on paper is everything that happens *before* Start and *after*
Close — authoring 33 runbook entries by hand the night before, reconciling numbered cards against a
sheet during play, and having no record afterwards of how far the plan actually got.

Three facts from the record shape the tier:

- **`game.rules` is the empty string.** All 38 rules — seven sections, briefed twice, closed with
  *"PLEASE RE-READ THE ENTIRE RULE SET"* — stayed in the workbook. The app has a rules field and it
  went unused.
- **The ration card numbers in Firestore match the workbook exactly** (Aaron 33, Payne 35, Tappan
  24, Kurt 23, Chris 27, Joe 31 then his second card 32, James 26 then 25). Twenty submissions,
  every one marked `valid` — a GM approving photos by eye against a spreadsheet. The mapping is
  deterministic, which is what makes #105 an import rather than a new authoring burden.
- **The game ran 87 minutes of a planned 210.** No deaths for 46 minutes, then eleven in 41.
  Voucher sites 3–5, the second gear drop and the entire end-game never happened. The workbook's
  pacing model (1–2 deaths per 30-minute window, evenly spread) was wrong in a specific, learnable
  way — and the app holds the only measurement of it.

**Build order — the importer first, because most of the rest is authored through it:**

1. **#103** CSV export → import. Export is the cheaper half and validates the encoding; import is
   web-only (`runbook` is already GM-writable in the rules), so no functions, no rules, no build.
2. **#107** presets + bulk authoring and **#116** bulk districts — the same authoring problem at a
   smaller scale, and #107 reuses #103's validation.
3. **#105 → #106** the card registry, then redemption. #105 gates #106.
4. **#104** player obligations — the largest item, and the only genuinely new game mechanic.
5. **#111** rulebook, **#114** stealth notifications, **#113** toll cadence — cheap and independent.
6. **#112** after-action report and **#115** kill attribution — both want a captured game first.
7. **#108** sponsor distribution, **#109** crew role, **#110** placement verification — the
   remaining paper.

**103. Import a runbook (and checkpoints) from CSV.** The night before Day 1, 33 runbook entries
were hand-authored between 19:46 and 20:13, and one more (`trap 5`, carrying an eight-player target
list) at **14:02 during live play**. Twelve of the 33 are near-identical "Found: *place*" entries.
That is the workbook's Traps and Drop Plan tabs being retyped into a web form.

**Feasible, cheap, and web-only.** `firestore.rules` has
`match /runbook/{entryId} { allow read, write: if isGameGM(gameId) }`, so the GM's browser writes
these docs directly — no callable, no rules change, no new build. The work is entirely serialization
and validation. Full column contract, encoding and idempotency rules in
[ROADMAP_DATA_MODEL.md](ROADMAP_DATA_MODEL.md#103-csv-export--import-for-checkpoints-and-runbook);
the decisions that belong here:

- **Export ships first.** Same field mapping in reverse, cheaper, and it hands back Day 1's 33
  entries as next year's starting CSV — which is also how the encoding gets validated before
  anything is trusted to write.
- **One row per queue slot**, merged on a `key` column. `queueSlots` is a sparse
  `(RunbookEffect | null)[]`, and the alternative is an inline mini-syntax in a single cell, which
  means writing a parser for text full of punctuation. The row-per-slot shape also lands directly
  on the workbook's Traps tab, whose "Give to person number" column *is* the slot ordinal.
- **The CSV is 1-based**, `queueSlots` is 0-based; subtract on import. The sheet is already written
  the way a GM thinks and the import should not make them renumber.
- **Deterministic doc ids from `key`.** `addRunbookEntry` uses `addDoc`, so a second import — and
  there will be one, because the sheet gets edited — duplicates all 33 entries and leaves the
  geofence choosing by priority among twins. This is the part that must not be got wrong.
- **Strict name resolution, with a dry-run diff before any write.** Fail the whole import on a
  missing or ambiguous checkpoint name. Day 1's 35 names are unique, but `red 4` / `red 8` /
  `yellow 5` / `blue 3` are close enough that the realistic failure is a typo silently attaching a
  trap to the wrong site.
- **Never import `trapKitCode`.** It is documented as a secret on paper, generated from the
  no-`0/O/1/I/L` alphabet and never enumerable by a client. A GM typing codes into a shared sheet
  will pick weak ones and the sheet becomes the leak. Import the entries, let the app generate the
  codes, then *export* them for printing.
- **Refuse `timed` + `audience: 'all-players'` until #101 lands**, or the importer reproduces that
  defect five times from one paste.
- **Player targeting rides on #96.** `playerIds` are uids that do not exist during `setup`; the CSV
  carries `targeted: true` and the entry stays inert until people are assigned. The CSV expresses
  intent, never identity.

Checkpoints get the same treatment in the other direction: their coordinates come from the map, not
a sheet, so the loop is **place pins on the web map → export checkpoints CSV → fill in behaviour
columns in Sheets → import runbook CSV → dry-run diff → `startGamePreflight`**. The checkpoint
export is what makes the workbook's location column trustworthy rather than hand-copied.

**104. Player obligations — orders with a deadline the app actually tracks.** Four hazards in Day 1
issued a real-world deadline the app has no concept of:

> *"Go to the bathrooms within 10 minutes or die."*
> *"Go get them at the docks from your sponsor within 10 minutes or you are dead."*
> *"Make your way to the top of stonedam within the next 10 minutes or be eliminated."* (the mass version)
> *"You will have to eat two rations during this time interval or die from dehydration."*

Today a GM has to remember that a named player was told at 13:49 to reach a named place by 13:59,
and then check. The server already runs every crossing against every checkpoint and already knows
each player's position; this is mostly wiring, not new machinery.

**Two kinds, one model.** An obligation is a row on a player with a deadline and a satisfaction
condition: *reach checkpoint Y* (satisfied by a crossing) and *submit N rations this window*
(satisfied by the ration loop, and a direct modifier on the #11 starvation sweep). Both are created
by a runbook effect firing, both surface as a live countdown on the player's screen and a column on
the GM roster, and both resolve to satisfied or expired. **Expiry does not auto-eliminate** — it
raises the case to the GM, the way `starvationMode: 'gm-confirmed'` already does, which is the
setting Day 1 actually ran. Schema in
[ROADMAP_DATA_MODEL.md](ROADMAP_DATA_MODEL.md#104-player-obligations).

Every one of those four hazards also ends *"can be cancelled by a medkit"* — the app is currently
advertising a mechanic it does not implement. #106 is the other half of this item.

**105. The numbered-item registry.** Four tabs of the workbook carry the same four columns —
`ration number`, `voucher number`, `medkit number`, `trapkit number` — across starting gear, midgame
gear, prepositioned drops and stores; and Drop Plan rows 33–46 then do supply arithmetic by hand
(*"maximum theoretically needed 72 / estimated need 44 / total available 53"*).

The app has exactly one card field — an optional number on a ration submission — and
`enforceUniqueRationCards` catches a *repeat*. Nothing checks that a number is real, that it was
ever put in the field, or that it belongs to the player holding it. The registry is a collection of
numbered items with a kind, an optional assigned holder, an optional placement, and a consumed
stamp.

**The primitive already exists**: `RunbookEntry.trapKitCode` is a numbered physical card redeemed by
code, single-use, never enumerable by a client. #105 generalizes it to the other three kinds, and
the live supply forecast the Drop Plan tab was estimating falls out of it for free.

**106. The redemption loop — medkits, vouchers, and the end of the WhatsApp channel.** Rules 37–38
and the morning-of sheet route two mechanics entirely outside the app: *"send Shannon a photo of the
trap card via whatsapp or text, wait for confirmation…"* and *"send a photo of the medkit and rip up
the medkit, or we will trigger the trap consequences."*

**#97 already closed the arming half** — `armPlayerTrap` takes the code, resolves the site from the
player's own last fix, and honours an exclusion list, which is exactly what rule 37 asks for. What
is left is *consumption*: photograph a numbered card, have a GM approve it, and have that approval
do something. It is the ration pipeline — live camera capture, Storage upload, GM valid/reject —
generalized from one item kind to four, and the thing it does is cancel an obligation from #104.

This removes the last out-of-app channel, and with it a single human who was simultaneously running
medical, traps and medkits.

**107. Entry presets and bulk authoring.** Twelve of Day 1's 33 entries are the same entry twelve
times: `fixed-order`, `defaultNone: true`, `revealOnFire: 'triggerer'`, priority 2, one flavour line
each. The hand-authoring shows in the result — some fall back to `effect.kind: 'gm-notify'`, some to
`'notify'`, and one to `'notify'` with **no message at all**, which is a silent no-op nobody
intended.

A **cache-site preset** applied across a multi-select of checkpoints collapses the hour and removes
the inconsistency at the same time. Reuses #103's validation, and the `trap 5` entry authored at
14:02 *during play* is the case a preset most obviously serves.

**108. Sponsor gear distribution, in bulk.** The workbook's starting and midgame tabs are 12 players
× specific gear, and rule 34 requires drops *"clearly marked with the name of the person intended to
receive it."* The app can already do the delivery — `revealOnFire: 'targeted'` plus a targeted push
is exactly the shape — but a GM would hand-author roughly 24 entries the night before. So instead
Day 1 shipped four entries reading *"An anonymous sponsor has gifted you a weapon. **Message the GM
to arrange delivery.**"* and a human handoff.

Tellingly, the workbook's own "Sponsor Distributor" and "Where" columns are **blank**: that step did
not happen on the day. Paste the per-player gear table, generate the targeted entries and the
pushes. This falls out of #103 plus #107 more than it is its own build.

**109. A crew role, and check-off on the run sheet.** The workbook has a whole tab — "Gus-only
Cadence" — that is nothing but the run sheet filtered to one person, and the main cadence tab splits
rows between two names in a "Responsible Party" column.

The crew *were* in the app on Day 1 — as GMs. That is the gap: "helper" and "game master" are one
role, so running a voucher site requires the full console (see #102 for the other cost of that).

**This is not the role #99 superseded.** #99 dropped *“helper but not quite GM”* for the
**dead-player** case — someone eliminated mid-game who can now be sent to deploy a drop — and that
case stays closed: a dead player keeps `role: 'player'` and gains a read-only arena view. #109 is
the **never-playing** crew, who exist from `setup` onward, were on the island before anyone joined,
and need the run sheet rather than the map. The two do not overlap and the spectator view does not
serve this one.

Two parts: a **limited crew role** with the run sheet and neither map nor runbook, and **check-off
on run-sheet rows** so a GM can see "Voucher Site 3 live ✅ 11:29 by Aaron". Today the run sheet
fires automatically and nobody confirms the physical action happened.

**110. Placement verification for the pre-set.** Two P0 rows in the workbook's to-do tab were still
unchecked at game time: **"prep drops"** and **"Re-check all sponsorship drops."** The Drop Plan tab
names 15 physical sites with contents manifests, pre-set by three people the day before.

A placement mode — walk to each checkpoint, tap "placed", record the **actual** GPS at placement
along with the contents — replaces that checklist and quietly serves #100: a surveyed coordinate
beats one guessed on a map, and some geofence error starts there rather than in the fix.

**111. A structured rulebook, and an acknowledgement.** 38 numbered rules across seven sections
(GENERAL / FOOD / COMBAT / COMMUNICATION / SAFETY / SPONSORSHIP / ARENA), delivered at an evening
briefing, repeated in a morning-of tab, and closed with *"PLEASE RE-READ THE ENTIRE RULE SET before
we play tomorrow."* **`game.rules` in the Day 1 record is `""`.** The app stores free text and shows
it once in the tutorial; nothing is reachable mid-game.

Sectioned, numbered and searchable during play, plus a **read-and-acknowledged flag visible in the
#88 roster**, turns a recurring briefing problem into a screen. `cloneGame` (#65) already carries a
game forward, which is what makes "update the rules with lessons learned" — an actual row in the
workbook's to-do tab — a diff rather than a retype.

Worth recording while writing them: several rules exist *only* because the app cannot enforce
something (rule 29's "keep all other apps closed" is #77/#82; rule 21's duplicate death report is
#115). Those are the backlog in disguise.

**112. The after-action report.** Day 1 planned 210 minutes and ran 87. No deaths for the first 46
minutes, then eleven in 41. Four of six ration windows never happened; voucher sites 3, 4 and 5
never opened; the second drop and the whole end-game never ran. Two of six auto player-count
broadcasts fired.

A report written at Close — deaths per window, arrivals per site, ration compliance, which runbook
entries never fired, planned versus actual on every run-sheet row — is the calibration the Drop Plan
tab was guessing at, and the difference between planning next year from data and planning it from
memory.

**Retention is already solved**: #100's 2026-09-06b fix spares `arrivals`, `checkpointTrips` and
`entryTrips` whenever `config.locationTrail` is on. This item is the *rollup and the view*, not the
retention — though a small summary doc written before the purge would survive a game that ran with
the trail off, which is exactly what Day 1 was.

**113. Make the death toll follow the deaths, not the clock.** `playerCountBroadcast` seeds six
30-minute rows at Start. In Day 1 two fired (30 and 60 min) across an 87-minute game, and the one at
30 minutes said *"12 tributes remain"* — true, and stale within the hour. At **14:15:28** the GM
hand-typed *"4 tributes remain."* as a `gm-message`, 76 seconds after the automatic one had said 5.

A fixed cadence does not fit a death curve that is flat and then vertical. Options are a
death-triggered toll, a floor/ceiling on interval, or simply letting the existing per-death
broadcast carry the count — which it already does (*"Aaron has fallen — 11 tributes remain."*),
making the scheduled one largely redundant once deaths start. Cheap, and rule 26 promises players
an update every 30 minutes, so the promise needs to match whatever is chosen.

**114. Stealth notifications.** Rule 27, in full: *"DO NOT KEEP YOUR PHONE ON SILENT. You may miss
out on important updates. Importantly, though, loud phone notifications may also give away your
position to nearby tributes."*

The app forces players to choose between missing information and being found, and the rules then
try to arbitrate it. A vibrate-only critical channel plus a quiet channel for the "N remain" chatter
resolves it in the app instead — an Android notification channel split and the iOS equivalent, with
a per-player toggle. This is a stealth-game mechanic, not a settings screen.

**115. Kill attribution and the death manifest.** Rule 21 says tap "I've been killed" in the app;
the morning-of sheet *also* says message the GMs before you move. The duplication exists because the
GM needs two things the button does not capture — **who** and **what was left there**: *"leave your
bag where you died… that is how we know where your stuff is in case no one else picks it up."*

A "who killed you?" picker on the #89 death screen feeds kill counts into #88's standings, and the
death pin (built, GM map) already knows the location — adding the loot manifest to it serves rule
21's stated purpose and gives cleanup crews a retrieval list. Wants #105 for the manifest to be
anything better than free text.

**116. Bulk and random district assignment.** **Not one member doc in Day 1 carries a `district`.**
The workbook assigned all 12 with `RAND()`, the Traps tab's "DO NOT give trap if both tributes from
the same district show up together" depends on it, and the #5 same-district suppression is fully
built — so the rule never ran, in a game that was designed around it.

The feature is not missing; it is unusable at 9pm the night before, because it is 12 individual
edits through a per-player modal. Randomly assign N per district across the roster, or paste a
name→district column. Small, and it unblocks a mechanic that already exists.

---

## Tier 11 — P3 polish *(closed)*

> **Built (2026-06-17):** #41 end-game phase, #42 arena overlay, #43 practice game, #44 voucher
> preset, and #45 post-game media all shipped — see the Built & removed callout.
>
> **#57 per-GM teams is dropped** (2026-09-06). Each GM owning a filtered subset of players was
> recorded after the 2026-06-07 field test and is no longer wanted: the GM team runs 1–2 phones
> plus a web dashboard over a shared view, and partitioning it would work against how they
> actually operate. Number retired, never reused.

Nothing outstanding in this tier.

---

## Deferred — public launch / app-store gating

Only matter when going **wide** (public store listing / large distribution); they do **not** block
the functional APK.

**46. App Check enforcement.** The per-UID `joinGameByCode` throttle (`enforceJoinRateLimit`) is
already in place; the remaining gap is App Check: `functions/src/games.ts` has
`ENFORCE_APP_CHECK = false`. Before a public launch, register App Check on both platforms, verify
real builds get tokens, then flip the flag.

**47. Restrict the Google Maps API keys.** `app.json` ships Maps keys in the binary — lock each to
its bundle ID / SHA-1 and the Maps SDK in Cloud Console before wide release. Console/ops task, no code.

---

## Suggested order

0. *(historic — kept for the checklist reference.)* **Verify the 2026-06-18 APK** on a clean install:
   confirm the **#77** battery-optimization fix (grant "Background activity — Unrestricted" in the
   lobby, then lock the phone untouched ~3 min and confirm the player stays live on the GM map and
   checkpoints fire), **#78** (submit a ration → panel flips to "waiting for GM"), and **#79** (join a
   `setup`-phase game → "not open yet" message). Also smoke-test the mobile halves from the prior APK
   (#20–25 integrity UI, #63/#64/#66/#70/#71/#74, #11, mobile Clone). Use
   [TESTING_CHECKLIST.md](TESTING_CHECKLIST.md) (#58) for a full single-game surface pass.
1. ✅ **Tier 12** (84–99, minus #86) is **written** as of 2026-09-06b, along with the
   outstanding halves of #83, #92, #94 and #100. None of it has run.
2. **Ship it, in this order — the three steps are not independent.** See the warning at the
   top of this file for why: `firestore` rules → `functions` → **a new build rolled out to
   everyone**. Deploying the functions ahead of the build strands every existing install the
   moment a game ends, because winner detection now advances a game into a phase no shipped
   binary recognizes.
3. **Then a first run, because nothing here has been seen working.**
   [TESTING_CHECKLIST.md](TESTING_CHECKLIST.md) (#58) covers the single-game surface pass; the
   Tier 12 additions that most want eyes on a device are: a death (→ #89's screen, #99's
   countdown, #88's roster losing the row), a `cleanup` transition (→ everyone visible, every
   checkpoint a marker, a drop ticked off by a *player*), a bare crossing going silent while
   a hazard pushes (#83, still never verified), arming a trap kit (#97), and the join QR on a
   GM phone scanning from another phone (#92).
4. **The field measurements are the only remaining *questions*** — everything else is
   verification of something already written. Under **#100**, the fix-gap length plus
   re-deriving `STEP_LENGTH_M` / `MIN_STEP_FRACTION` from a real trail. **#82’s battery
   question is closed** — Stonedam Day 2 ran ~3 h of continuous GPS and finished with one
   player low, so it no longer blocks a full event; the per-hour *curve* is still
   unquantified, but nothing is waiting on it. Both remaining ones come out of a
   single captured game for free: `locationTrail` defaults on, and as of 2026-09-06b it keeps
   the arrivals and trip latches you need to read it against. **Get everyone onto one build
   first** — Stonedam ran three simultaneously and that confounds everything.
5. **Tier 13 (#103–#116) is the next build, and none of it has started.** It comes out of the
   event planning workbook read against the Day 1 game record, and its own entry carries the
   build order — **#103 the CSV importer first**, because #107, #108 and #116 are all authored
   through it and it is a web-only change (no functions, no rules, no build). **#101 is a
   defect and should go with the Tier 12 deploy, not wait for Tier 13**; **#102 is an argument
   for shipping #99 in that same deploy rather than behind it.**
6. **#86** — the one Tier 12 item not built. Its own entry says to answer the OTA question
   before prototyping: `updates.enabled` was turned off deliberately after the 2026-06-19
   install-over crash loop, and re-enabling it may retire half the motivation outright.
7. **Tier 11 is closed** — everything shipped and **#57 is dropped**.
8. **Deferred** (46–47) waits for a real public-store launch; confirmed 2026-09-06 that no
   public launch is planned, so both stay parked.
