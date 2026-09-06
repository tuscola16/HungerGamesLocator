# Outdoor GM — Enhancement Roadmap

Outstanding work only. **Built functionality lives in the [README](README.md#features)**;
implementation-ready schema/enforcement detail for the items below is in
[ROADMAP_DATA_MODEL.md](ROADMAP_DATA_MODEL.md) (keyed by the same item numbers); see
[COMPETITIVE_ANALYSIS.md](COMPETITIVE_ANALYSIS.md) for prioritization rationale.

**Current focus: a beautifully functional APK for a limited, trusted user base** — not a public
store launch. Items are grouped by tier, roughly in build order. Numbers are **stable and never
reused**; a shipped item moves to the **Built & removed** callout below (one-line summary; full
detail in git + the README) rather than being renumbered. The build-out **through Tier 7 plus all
field-test findings has shipped** (see the callout) — the outstanding work is the open half of
**#82** (location jitter, from the 2026-09-04 game), **#83** (mobile GM feed) and the **Tier 12**
post-game batch (**#84–#99**, requirements settled 2026-09-06 and sequenced cheap-first behind the
**#94** safety defect), plus the deferred public-launch gating (#46/#47). Tier 11 is closed —
**#57** per-GM teams is dropped.

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
- **Battery cost of continuous GPS — being measured in the 2026-09-06 game.** The walk was 19
  minutes; a real game is 3.5 hours with the receiver effectively always on in an arena this
  small. The rate limit should bound it, but nobody has watched a battery curve yet. **Record the
  result here afterwards** — it is the last open unknown in #82.
- **`satellites` is device-dependent.** Per's handset reports 0 alongside good 18 m fixes
  (the OEM doesn't populate the legacy extra); Shannon's reports 7–17 properly. Treat 0 as
  unknown, never as "no satellites".
- **Trail rows can duplicate** from Cloud Functions at-least-once delivery. Harmless for
  analysis, but de-duplicate on `(playerId, clientUpdatedAt)` before computing counts.
- **Fix cadence is unchanged at 17–23 s (p90).** The 1–2 s medians in the third trail are an
  artifact of paired fused+gps writes, not an improvement. Nothing in this batch touched the
  location request, and the wake lock showed no effect on cadence in the second trail.
- **`locationTrail` retention.** Three subcollections now, all excluded from end-of-game cleanup
  by design. **Keep capture on for the 2026-09-06 game** (it pairs with the battery measurement),
  then delete them.

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

**Outstanding under #83:**

- **Mobile GM feed still lists every arrival — and it is wanted.** `app/(app)/gm/[gameId]/index.tsx`
  renders `<AlertFeed arrivals={arrivals} />` unsplit, and its unseen-alert badge counts
  `arrivals.length`, so it increments for crossings that never pushed. Confirmed 2026-09-06 that
  the mobile GM view is in active use at events (1–2 GMs on phones alongside one on web), so
  mirror the web alerts/arrivals split rather than waiting for the mobile feed to get attention
  for some other reason. Fold it in with **#87** (the GM firehose) — same problem, same surface.
- **Not yet field-verified.** Confirming a bare crossing goes silent while a hazard still pushes
  needs a device inside a checkpoint radius; it has only been typechecked and reasoned through.

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
- **Mixed builds confound everything.** That game ran `buildVersion` 11, 15 and 16 simultaneously.
  Get everyone onto one build before drawing conclusions from the next capture.
- **Role changes mid-game orphan player data.** Will and Joe hold `role: 'gm'` with player arrivals
  and location docs, because they were promoted after crossing checkpoints. Harmless here, but it
  means member role is not a safe filter for post-game analysis.
- **The evidence deletes itself, and nearly did.** `cleanupOnGameEnd` recursively deletes
  `locations`, `arrivals`, `checkpointTrips` and `entryTrips` the moment `status → ended`. Stonedam
  ended at 18:25:31Z; every collection this analysis rests on was gone minutes later, and the only
  surviving copy is the snapshot pulled at ~17:55Z (now in `field-data/2026-09-06-stonedam-day-2/`,
  gitignored — real names and GPS tracks). Note the snapshot is therefore ~30 minutes short of the
  full game, so the 198-arrival figures are a lower bound.
  **`locationTrail` alone does not fix this**: it is excluded from cleanup, but the arrivals and
  trip latches you need to interpret a trail against are not, so the next post-mortem loses them the
  same way unless someone pulls within the window. Either exclude `arrivals`/`checkpointTrips` from
  cleanup while a game is flagged for analysis, or have the cleanup function archive them first.
  Decide before the next field test, because there is no recovering it afterwards.

---

## Tier 12 — 2026-09-06 post-game review

Sixteen items from two sources on the same day: **#84–#93** from the post-game review, **#94–#99**
from player/GM emails. **Requirements were settled the same day**, so the entries below are written
as decisions rather than options; the few genuinely open threads are called out as such.

Deliberately **not sequenced against an event** — there is a game the same evening and nothing here
lands by then. Two standing facts now shape the whole tier: **iOS is back in the loop**, so every
mobile item is two platforms, not one; and the GM team runs **1–2 GMs on mobile plus one on web
over a hotspot**, so the mobile GM surface is load-bearing and not a second-class view.

**Build order — cheap first, then critical:**

1. **#94** safety alert survives death — cheap *and* the only defect. Do it first.
2. **#93** (one prop), **#95** (new-drop styling), **#85** (GM action menus), **#98a** (web runbook
   filters) — small, independent, ride any build.
3. **#89 + #99** — the "You died" screen, the countdown and the spectator map are one flow.
4. **#84** cleanup phase, then **#88** living/post-game roster.
5. **#90** soft delete, **#98b** (a mobile runbook view — see the note, this one is not small).
6. **#96 → #97** player-armed traps: the largest item in the tier, and #96 gates it.
7. **#87** GM notification mute, **#86** the platform spike, **#91** whatever is left of it.

**84. `cleanup` phase — a state between "victor declared" and "game closed".** `endGame()`
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
> **Still outstanding:** the same treatment on the player *detail* screen (85.2).

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

**87. Mute the GM notification firehose.** *The target is the **GM's** alert volume, not players'.*
Preferences are **per user**, not per game — one setting that follows a GM across every game they
run. **SOS is never mutable. Boundary-exit explicitly is** (it fires often enough to be noise, and
that is the GM's call to make). No game-level policy: a GM cannot mute on anyone else's behalf.
Because muting must work when the app is closed, the filter is server-side in the push path — which
puts back a member-doc read that #83 deliberately removed, so it rides the existing member cache
(#16).

**88. The player roster — living during play, standings afterwards.** Players today can read only
their own member doc ([firestore.rules:134](firestore.rules:134)), because member docs carry emails
and FCM tokens. Give them a list — **names only**, no contact details, no locations — available in
**every phase**, showing:

- **during play: living players only** (a dead player leaves the list rather than being shown as
  dead, so it never becomes a scoreboard of who to hunt);
- **after the game: everyone who played, ordered by who lasted longest** — which is the results
  standing, and is most of what #91 was for.

No GM roster, in either mode. Needs a projection rather than a relaxed rule, since the sensitive
fields share the document.

**89. The "You died" screen.** When a player is out,
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

**90. Delete a finished game, with an undo.** `deleteGame` already does a real `recursiveDelete`
([functions/src/games.ts:406](functions/src/games.ts:406)) but refuses anything that has started; a
finished game can only be *archived*, which is a per-member flag hiding it from one person's list
while every document survives forever. **Any GM** of the game can delete it — not just the creator —
and there is **no age requirement**. It is a **soft delete with a 20-minute recovery window**: the
game disappears immediately for everyone, a GM can undo it within 20 minutes, and a sweep hard-
deletes it after that. The confirmation **must say that other members lose their history too**.

**91. Whatever is left of "was a player".** *Later tier, and now nearly empty.* #99 gives dead
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
> **Still outstanding: the QR on the GM *phone*.** Rendering one in React Native needs
> `react-native-svg`, which this project does not have — and adding a native module to the iOS pod
> configuration is exactly what the CLAUDE.md gotchas warn against. Needs its own decision.

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
> **Still outstanding:** deploy that function; lift the `!out` tracking gate on the client; widen
> the alert fan-out to every dead player.

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

**96. Author player-targeted entries before anyone has joined.** `EntryEditor` refuses to save a
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

**97. Player-armed traps.** *The largest item in the tier.* The GM pre-sets traps; a player finds a
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
  Builds clean; **not yet exercised in a browser** — the Runbook screen is behind the GM login.
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

**99. Dead players spectate the live map, two minutes after they die.** *Supersedes the "helper but
not quite GM" role.* A dead player keeps `role: 'player'` and gains a read-only view of the arena.
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
1. **Tier 12** (84–99) — requirements settled 2026-09-06; the tier carries its own cheap-first
   build order. **#94** leads (cheap *and* the only defect), then the small independent wins
   (#93, #95, #85, #98a), then **#89 + #99** as one flow, then **#84** → **#88**, then **#90** and
   the mobile runbook view (#98b), then **#96 → #97** (the largest), and finally **#87**, the
   **#86** spike and whatever is left of **#91**.
2. **Tier 11 is closed** — everything shipped and **#57 is dropped**.
3. **Deferred** (46–47) waits for a real public-store launch; confirmed 2026-09-06 that no public
   launch is planned, so both stay parked.
