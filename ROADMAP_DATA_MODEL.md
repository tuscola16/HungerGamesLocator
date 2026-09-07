# Roadmap — Data Model & Schema Spec

> ## ⚠️ 2026-09-06b: everything below except **#86** is now built
>
> This file was written as a *specification*. As of the Tier 12 build it is largely a
> **record**: #84, #87, #88, #90, #91, #96, #97, #99 and #100 are all implemented, and each
> section now opens with a note saying whether it shipped as written and what the build
> changed. The canonical schema is [types/index.ts](types/index.ts) — where the two disagree,
> the code is right and this file is stale.
>
> **None of it is deployed and none of it has run.** See the deploy-order warning at the top
> of [ROADMAP.md](ROADMAP.md), in particular that the `functions` deploy and the app build
> must go out together: winner detection now advances a game into `phase: 'cleanup'`, which
> no binary already in the field recognizes.
>
> New collections this batch added, for the `Collections` map and the rules: **`roster`**
> (#88, player-readable projection, server-write-only). New callables: **`armPlayerTrap`**
> (#97), **`undoDeleteGame`** (#90). New triggers: **`onMemberWriteProjectRoster`** /
> **`onGamePhaseProjectRoster`** (#88/#91), **`onGameCleanupStart`** / **`onGameReopen`**
> (#84), **`onUserPrefsWrite`** (#87), **`sweepDeletedGames`** (#90).

Implementation-ready detail for the [ROADMAP.md](ROADMAP.md) items, keyed by the
same item numbers. Everything here extends the existing types in
[types/index.ts](types/index.ts) and the `Collections` map in
[services/firebase.ts](services/firebase.ts); the built foundation (`GameConfig`, `Broadcast`,
`RationSubmission`, the #60 `RunbookEntry`/runbook model, `ScheduledEvent`, member elimination/`district`/
`sos`/`sosAckAt`/`outOfBounds`, `Game.gameDate`, the `markers`/reveal model) is already in those
files and is the baseline below.

New fields stay **optional** so legacy games keep working — the **one exception was the shipped #60
runbook overhaul**, which removed fields (and chose a fresh start over running its migration); its
canonical schema now lives in [types/index.ts](types/index.ts). Timestamps use the platform-neutral
`FsTimestamp` so types compile in both the mobile app and `web/`.

Only items with a real data-model/infra delta appear here; pure logic/UI/enforcement items are
listed under [No schema change](#no-schema-change-enforcement--logic-only). Everything through Tier 7
has **shipped and been removed** — its numbers are retired (full list in the [ROADMAP.md](ROADMAP.md)
Built & removed callout + git). Live data-model/infra deltas left behind by those batches:
`GameConfig.tripIntervalMinutes`/`minFixAccuracyMeters`/`geofenceConfirmFixes`/`reNotifyAwayCooldownMinutes`/
`autoEndThreshold`/`starvationMode`; the `Checkpoint.icon` field + the #60 runbook model (`RunbookEntry`
collection); the server-only `checkpointTrips`, `entryTrips` (GM-readable, #67/#73), `rationWindowPings`
(#72), and `starvationSweeps` (#11) latches; `Broadcast.pushed` (#69) + `Broadcast.dismissedBy` (#71);
`RevealedMarker.visibleFrom` (#48); `PlayerLocation.battery` (#35); the `cloneGame`/`submitRation`/
`fireRunbookEntry`/`rationPings`/`starvationSweep`/`transferGmOrEndGame` (#29) callables/functions;
and the shared `common/` helpers `pointInBoundary`, `validateGameConfig`, `startPreflight`
(#63/#64/#23); `RunbookEntry.playerIds` + `RunbookEntry.revealOnFire` (#80 — per-entry player
targeting and the entry-driven reveal into the existing `markers` projection; both optional, so
untargeted legacy entries still fire for everyone and reveal nothing); `Game.winnerId` +
`Game.winnerName` (#81 — the sole survivor, stamped on `status → ended` by winner detection in-txn
(auto path) and by the `cleanupRationPhotosOnGameEnd` chokepoint on the manual End Game path;
`winnerName` denormalized onto the game doc because players can't read other members; both optional,
absent when there's no single winner). Tier 7 (#20–28) added **no** new schema.

---

## 46. App Check enforcement

The per-UID throttle on `joinGameByCode` already shipped (`enforceJoinRateLimit` — an internal,
admin-SDK-only `rateLimits/{uid}` doc, not client-readable, rejecting > N tries / window with
`resource-exhausted`). Remaining: flip `ENFORCE_APP_CHECK → true` in `functions/src/games.ts` after
both platforms are registered and verified. No game-doc change.

## 57. Per-GM teams *(dropped 2026-09-06)*

```ts
export interface GameMember {
  // ...existing...
  /** GM (member userId) who owns this player's team; notifications/map filter by it. */
  teamGmId?: string;
}
```

GMs assign players to themselves; the geofence/arrival push routes only to the owning GM's tokens, and
GM map/roster views filter to `teamGmId === me`.

> **Not being built.** The GM team runs 1–2 phones plus a web dashboard over one shared view;
> partitioning players between GMs works against how they actually operate. Number retired, never
> reused. Kept here only so the idea isn't re-derived from scratch.

## 82. Location jitter — diagnostics & display stabilization

Shipped 2026-09-05. Additive and optional; legacy fixes without these fields read as "unknown".

**`PlayerLocation`** (`types/index.ts`) — written by all three upload paths in
`services/locationTask.ts`:

| Field | Type | Notes |
|---|---|---|
| `speed` | `number?` | Doppler ground speed m/s. **Correction (2026-09-05 field trail): absence is NOT the signal.** Android reports `0`, never null — zero missing values across 126 fixes. The value still correlates with bad fixes (every held candidate showed `speed 0`), so use the value, not its presence. |
| `mocked` | `boolean?` | Android mock-provider flag; separates a developer-options mock from a genuine bad fix. |
| `steps` | `number?` | Cumulative steps for the tracking session. Was recording-only; **read by the server since 2026-09-06** (§100 `stepCorroboration`) to corroborate a #49 pass-through. Still never a position source and never a veto over a real fix — the counter under-reports and never over-reports, so only its positive direction is trustworthy. |

> **Write semantics.** `updatePlayerLocation` uses `setDoc` **without** `{merge:true}`, so an omitted
> key is *deleted*, not preserved — the conditional-spread pattern does **not** carry a prior value
> forward (the older #35 `battery` comment claimed it did and was wrong). Readers must treat absent
> as *unknown*, never as *last known*.

**`locationTrail/{id}`** (server-written, `functions/src/geofence.ts`) gains `speed`, `mocked`,
`steps`, and `stepsSincePrev`. The last is `null` when either count is missing **or when the delta
would be negative** — a negative means the counter reset (rejoin / process recycle), not backwards
walking. Pair `stepsSincePrev` with the existing `metersSincePrev` to separate "they walked" from
"the fix moved but they didn't".

**No Firestore rules change.** The `locations/{userId}` write rule validates `userId` and the
lat/lng ranges but uses no `hasOnly()` key allowlist, so the new fields pass as-is.

**`StabilizedLocation`** (`common/locationStabilizer.ts`) is a *view* type, never persisted:
`PlayerLocation` plus `held` / `heldReason` / `ageMs` / `confidenceM` / `stale`. Both GM contexts
expose `playerLocations` as this type; because it's a superset, existing consumers are unaffected.

| Field | Type | Notes |
|---|---|---|
| `heldReason` | `'steps' \| 'speed' \| null` | Which gate held the fix; `null` when it was accepted. `held` is now exactly `heldReason !== null`. Diagnostic — recorded so the gate constants can be re-derived from a `locationTrail` capture. |

**`NSMotionUsageDescription`** (`app.json` → `ios.infoPlist`) is **required**, not optional polish.
`expo-sensors` is deliberately absent from `plugins` (its only iOS job is this key), so the key is
declared directly. Without it `Pedometer.requestPermissionsAsync()` reaches `RCTFatal` in
`EXMotionPermissionRequester.m` and **aborts the process** — an OS-level kill that `stepCounter.ts`'s
fail-soft `try/catch` cannot intercept. Verify with `npx expo config --type introspect --json`.
Android needs nothing: `expo-sensors` merges its own `ACTIVITY_RECOGNITION` declaration.

**Capture context on `PlayerLocation`** (added 2026-09-05c, all optional):

| Field | Type | Notes |
|---|---|---|
| `appState` | `string?` | `AppState` at fix time. The first walk could not distinguish "bad handset" from "phone left locked"; it was the latter, and only conversation revealed it. |
| `msSinceForeground` | `number?` | ms since last foregrounded (0 while active). **The load-bearing one** — screen state alone would not have explained the data, because the frequently-checked phone's background fixes were still good. Doze depth tracks how long a device sat untouched. |
| `batteryOptimized` | `boolean?` | Android battery-optimization state at fix time. Absent when unreadable — note the underlying check fails *open*. |
| `wakeLock` | `boolean?` | Was the partial CPU wake lock held? Identifies which A/B arm a fix belongs to. |

**Two new `GameConfig` knobs:**

| Field | Default | Notes |
|---|---|---|
| `wakeLockEnabled` | `false` | Hold a partial CPU wake lock while tracking (Android). **The one capture-layer variable under test** — changing anything else in the location request at the same time makes the result uninterpretable. Costs battery; that is the trade being quantified. Enable for a subset of players to get both arms from one walk. |
| `maxDisplayAccuracyMeters` | `80` | Reject fixes worse than this **from the GM map only** — never from checkpoint evaluation, which keeps using `minFixAccuracyMeters`. 0 disables. |

**`modules/outdoor-native`** — a local Expo module (autolinked; `android/` is CNG output so native
code cannot live there). Android implements `getStepCount()` over the cumulative
`TYPE_STEP_COUNTER` and `acquire/release/isWakeLockHeld`; iOS is a deliberate no-op (no
user-acquirable CPU lock, and CMPedometer's historical query already covers suspended time). New
manifest permissions: `WAKE_LOCK`, `ACTIVITY_RECOGNITION`.

**`HoldReason`** is now `'accuracy' | 'speed'`. The `'steps'` motion gate was deleted before
shipping — replayed against the trail it suppressed 556 m and 980 m of two players' genuine
movement, because Android batches step delivery and a locked phone's listener never fires.

**Server-side constants (`functions/src/geofence.ts`)**

| Constant | Value | Notes |
|---|---|---|
| `EXIT_HYSTERESIS_FACTOR` | 1.5 | #82: a player already inside stays inside until they clear 1.5× the radius. Stops boundary jitter reading as repeated exit/re-entry — the 2026-09-05 latch showed `lastEnterAt`/`lastExitAt` 1.1 s apart with three arrivals in six seconds. Only ever delays an exit. |

**Client-side constants (`services/locationTask.ts`)**

| Constant | Value | Notes |
|---|---|---|
| `NEAR_CHECKPOINT_M` | 150 | Proximity that triggers a satellite fix. Must stay far looser than the checkpoint radius because it runs on the *fused* position, which was 65–119 m wrong in the field. **A no-op in a small arena**: the third trail's furthest distance to any checkpoint was 123 m. |
| `GPS_FIX_MIN_INTERVAL_MS` | 20 s | The real battery bound, since proximity gating can't be selective in a small arena. Below the 17–23 s p90 cadence, so genuine fixes still get their satellite follow-up. |
| `GPS_FIX_TIMEOUT_MS` | 8 s | Falls back to the fused fix; the fused write has already landed regardless. |

> **Checkpoint radius stays 20 m.** Replaying the third trail shows 20 m catches all five
> crossings on GPS-quality fixes. An earlier recommendation to widen to 40–50 m was based on
> fused-provider error and is withdrawn — widening now only adds false triggers, which a
> hidden-trap game cannot surface to the player for dispute.

**`GameConfig.locationTrail`** (existing, #50) is the capture switch — no new config knob. Constants
(`MAX_PLAUSIBLE_SPEED_MS` 7, `MAX_HOLD_MS` 60 s, `STALE_AFTER_MS` 45 s, and for the motion gate
`MAX_STRIDE_M` 1.5, `STEP_GATE_SLACK_M` 25, `DOPPLER_MOVING_MS` 0.5) are module-level in
`locationStabilizer.ts`, deliberately not GM-tunable until field data justifies values.

---

## 84. `cleanup` phase + player-marked drop recovery

> **Shipped 2026-09-06b, as specified**, with two additions the build turned up:
> `Game.deletedAt`-style optionality was not needed, but **`gamePhase()` now clamps unknown
> phases to the game's `status`** (the forward-compat decision this section asked for), and
> **`winnerId`/`winnerName` are cleared server-side** by a new `onGameReopen` trigger rather
> than being added to the GM's writable key set for the reversal path.

The phase itself, plus the two projections that make a dark-arena recovery job possible: every
drop visible to every player, and every person visible on the map.

```ts
export type GamePhase = 'setup' | 'lobby' | 'play' | 'endgame' | 'cleanup' | 'results';
```

**`Game`** gains one optional stamp:

| Field | Type | Notes |
|---|---|---|
| `cleanupStartedAt` | `FsTimestamp?` | When the GM declared the victor and opened recovery. Absent on legacy games and on games closed straight from `play`. |

> **`status` stays `'active'` through `cleanup`, and `cleanupRationPhotosOnGameEnd` has to be
> split in two.** That one function purges *both* the ration photos *and* the locations/arrivals,
> on the `status → 'ended'` transition (`functions/src/cleanup.ts:23`) — but the two now belong at
> different moments: **ration photos are deleted at victory** (entering `cleanup`; they have proved
> what they were going to prove), while **locations and arrivals must survive until close**, since
> finding people and drops is exactly what cleanup is for. Only `joinGameByCode`'s active-only
> match still keys off `status`, and it is satisfied either way.
>
> **The #81 winner stamp moves to the victory transition as well**, because the winner is announced
> on entering cleanup. Both of its paths change shape: winner detection in `functions/src/members.ts`
> currently writes `status: 'ended'` in its transaction on the last death, and must instead write
> `phase: 'cleanup'` with `status` left `'active'`; the manual path stamps in `startCleanup()`
> rather than at close. `Game.winnerId`/`winnerName` themselves don't change.
>
> `endGame()` therefore becomes two calls: `startCleanup()` (phase, winner stamp, photo purge) and
> `closeGame()` (the existing `status`+`phase` write, plus the location/arrival purge).
> `gamePhase()`'s legacy fallback is untouched — no legacy game can resolve to `cleanup`.

> **Forward-compat, and it is not free.** `'cleanup'` is a phase value that **every binary already
> in the field will not recognize**. Mobile screens branch per phase (`phase === 'play'`, `=== 'results'`,
> …), so an old client lands on no branch. Decide the fallback deliberately before shipping the
> server side — either the client treats unknown phases as `results` (safe, degraded) or the GM's
> **Close Game** stays reachable so nobody is stranded. This is exactly the coupling #86 is
> chartered to investigate.

**`RevealedMarker`** (the existing player-readable `markers` projection, #48/#80) gains the
recovery fields:

| Field | Type | Notes |
|---|---|---|
| `clearedBy` | `string?` | Member `userId` who recovered the drop. Nullable — a mis-tap has to be reversible. |
| `clearedByName` | `string?` | Denormalized for the same reason as `Game.winnerName` (#81) and `Arrival.playerName`: players cannot read other member docs. |
| `clearedAt` | `FsTimestamp?` | Set with `clearedBy`; cleared together with it. |

At cleanup start the server projects **every** checkpoint into `markers` with `audiencePlayerIds`
unset (all players), reusing the reveal plumbing rather than adding a second collection — so a site
that was hidden all game becomes navigable exactly when recovery begins, and the marker still
carries name/icon/location only, never the runbook behavior.

**Settled 2026-09-06:** **anyone** may mark a drop cleared, not only whoever placed it. The phase
always ends **manually**, but the GM needs a visible **"every drop is cleared"** state — derivable
by counting markers with `clearedAt` against the total, so no extra field. **No push** goes out
when cleanup opens: people who have already gone home are not summoned back. The GM may step
**back to `play`** if a victory was called wrong, which is why `startCleanup()` is the one phase
helper that is *not* strictly monotonic (#27) — and why the winner stamp above must be clearable
on that reversal.

**Rules delta (`markers`).** Today: `allow write: if isGameGM(gameId)`. Recovery needs a member
carve-out, narrow on both keys and phase:

```
allow update: if isGameGM(gameId)
  || (isGameMember(gameId)
      && gamePhase(gameId) == 'cleanup'
      && request.resource.data.diff(resource.data).affectedKeys()
           .hasOnly(['clearedBy', 'clearedByName', 'clearedAt']));
```

`gamePhase(gameId)` already exists as a rules helper ([firestore.rules:27](firestore.rules:27)),
resolving the phase exactly as the clients do; this adds one `get()` on the game doc per marker
write, the same cost the member delete-lock (#20) already pays. Deliberately *not* GM-only: the
person standing at the site is the one who knows it's clear.

**Locations during cleanup.** `locations/{userId}` is currently `isGameGM(gameId) || uid == userId`
([firestore.rules:171](firestore.rules:171)). Locating players *and GMs* is half the point of the
phase, so extend the read to any member while `gamePhase(gameId) == 'cleanup'` — a rules change,
not a projection, because a location doc carries no contact data. Keep it strictly phase-gated:
mutual visibility during play would break the whole game.

**Geofence.** `functions/src/geofence.ts` must not deliver runbook effects while
`phase === 'cleanup'` — nobody should trip the trap they were sent to retrieve. It already reads
the game doc through the short-TTL cache (#16), so this is one condition, no new read. Arrivals may
still be written silently (they are already push-gated by #83).

## 87. GM notification mute

> **Shipped 2026-09-06b, as specified.** The denormalization onto member docs is done by a new
> `onUserPrefsWrite` trigger rather than by the join/create callables, which covers both
> directions at once: a preference changed today reaches games joined last week. Push sites
> resolve `PushRecipient`s and go through `sendClassPush`.

**Decided 2026-09-06:** the target is the **GM's** alert volume, preferences are **per user** (they
follow a GM into every game they run, not per game), **SOS is never mutable**, **boundary-exit
explicitly is**, and there is no game-level policy — a GM cannot mute on anyone else's behalf.
Muting has to work while the app is closed, so the filter is **server-side in the push path**.

The class union, from the existing call sites (`geofence.ts`, `broadcasts.ts`, `members.ts`,
`rationPings.ts`, `runbook.ts`, `runsheet.ts`, `media.ts`):

```ts
export type NotificationClass =
  | 'arrival' | 'hazard' | 'boon' | 'gm-message' | 'death' | 'winner'
  | 'ration' | 'sos' | 'boundary' | 'runsheet' | 'media';

export interface UserProfile {
  // ...existing...
  /** ROADMAP #87: classes this user never wants pushed, in any game. `'sos'` is
   *  rejected server-side — a safety alert is not mutable. */
  mutedNotifications?: NotificationClass[];
}
```

**Where it is read is the whole design problem.** The preference lives on `users/{uid}`, but the
push path resolves tokens from **member** docs and never touches user profiles. Copy it onto the
member doc the same way `fcmToken` already is — written at join and refreshed on change — so the
send path stays a member read and rides the existing short-TTL member cache (#16):

```ts
export interface GameMember {
  // ...existing...
  /** Denormalized copy of UserProfile.mutedNotifications, same pattern as fcmToken. */
  mutedNotifications?: NotificationClass[];
}
```

> **This partially reverses #83's optimization.** That item deliberately moved the push path to
> short-circuit *before* reading GM member docs. Filtering by preference needs them again — hence
> the cache, and hence keeping the trip-gate first: a crossing that fires nothing still costs no
> reads, and only a notification that was going to be sent pays for the preference check.

**Enforcement:** `'sos'` is stripped from the array on write (client and a rules `hasOnly`-style
guard), so a muted-SOS state cannot exist even if a client sends one. Everything else, including
`'boundary'`, is the user's call.

## 88. Player roster — living during play, standings afterwards

> **Shipped 2026-09-06b, and it moved ahead of #99** — that item depends on it. The roster row
> also carries `sos` (the one flag a rescue needs; #94 made the field the rescue crew) and,
> post-game, `ended` from #91's frozen `playerRun`.

Member docs carry `email` and `fcmToken`, so the roster cannot come from a relaxed rule on
`members` — it needs a projection, exactly as `markers` projects checkpoints and `Game.winnerName`
denormalizes the winner (#81).

```
games/{gameId}/roster/{userId}
  userId, displayName, playedMs?, endedAt?, updatedAt
```

Server-written (admin SDK) from the existing `onMemberWrite` trigger in `functions/src/members.ts`,
which already fires on every membership change — no new trigger, no new fan-out.

**Rules:** `allow read: if isGameMember(gameId); allow write: if false;`

**Two modes, one collection (decided 2026-09-06):**

- **During play — living players only.** Elimination *removes* the row rather than flagging it, so
  a client cannot leak or scoreboard what it never receives. Names only; no district, no contact
  details, no locations.
- **After the game — everyone who played, ordered by who lasted longest.** On the close transition
  the server re-projects **all** members who ever held the player role, stamping `playedMs`
  (start → their `outAt`, else the game's `endedAt`) so the client can sort without reading member
  docs. This *is* the results standing, which is why it absorbs most of #91.

**No GM roster in either mode** — GMs are never listed. During `cleanup` (#84) the roster follows
the same all-members re-projection as the results view, since recovery needs to know who is around.

## 90. Soft delete with a 20-minute undo

> **Shipped 2026-09-06b, as specified.** `DELETE_UNDO_WINDOW_MS` is exported from
> `types/index.ts` and mirrored in `functions/src/games.ts`.

**Decided 2026-09-06:** **any GM** of the game may delete it (not only the creator), there is **no
age requirement**, and it is a **soft delete with a 20-minute recovery window** — gone immediately
for everyone, undoable by a GM for 20 minutes, hard-deleted after that. The confirmation must state
that **other members lose their history too**.

```ts
export interface Game {
  // ...existing...
  /** ROADMAP #90: soft-delete stamp. Set = hidden from every member's list and
   *  eligible for the sweep once 20 minutes have passed. Cleared by an undo. */
  deletedAt?: FsTimestamp | null;
  /** Member uid who deleted it — shown in the undo affordance. */
  deletedBy?: string | null;
}
```

**Hiding** is client-side over `getMyGames()` plus a rules guard so a soft-deleted game reads as
gone; the documents survive untouched until the sweep, which is what makes undo trivial.

**The sweep** is a `pubsub.schedule('every 1 minutes')` function that hard-deletes games whose
`deletedAt` is older than 20 minutes, reusing `deleteGame`'s existing `recursiveDelete`
(`functions/src/games.ts:406`) — the same scheduled-sweep pattern as `rationPings` and
`starvationSweep`, so no new infrastructure. It must also delete the game's Storage objects, since
the ration-photo purge (which normally runs on the end transition) may not have covered a game
deleted from `results`.

**The existing phase guard is relaxed, not removed.** `deleteGame` currently refuses anything that
has started; it now accepts `results` as well. A game in `play` still cannot be deleted.

## 91. "Was a player" — durable run record *(built 2026-09-06b — the residual case only)*

> **Shipped 2026-09-06b.** `everPlayer` + `playerRun` land exactly as sketched below, written
> by the roster trigger *ahead of* the projection so it reads them in the same pass. One rule
> the sketch didn't state: **the frozen run wins over anything recomputed**, because a promoted
> member's doc no longer says `out` and recomputing would silently credit them the whole game.
> A #21 revive drops the record so it can be re-frozen correctly when the run ends for real.

> **Mostly absorbed — keep the number, expect not to build it.** #99 lets dead players spectate
> *as players*, so the promotion that erased someone's run stops happening; **#88** now projects a
> post-game roster ordered by survival time, which is the standing this item wanted. What is left
> is only the residual: a GM who genuinely promotes someone to help run the game still erases their
> run. The shape below is kept for that case alone.

Results are computed from *current* membership, so a player promoted to GM mid-game loses the run
they earned. The record has to survive the role change:

```ts
export interface GameMember {
  // ...existing...
  /** Set true the moment this member first holds the player role; never cleared,
   *  so a later promotion to GM (the "I died, now I'm helping" path) keeps the run. */
  everPlayer?: boolean;
  /** Frozen when they stop being a player (elimination, tap-out, or promotion). */
  playerRun?: {
    outAt?: FsTimestamp;
    /** Distinguishes eliminated from tapped-out from survived-to-the-end. */
    ended?: 'eliminated' | 'out' | 'survived' | 'promoted';
    durationMs?: number;
  };
}
```

Written server-side (`onMemberWrite` already sees every role and `out` transition, and already owns
the deterministic death toll). The results screen reads it through the **#88 `roster` projection**
— players still can't read member docs — so the two items ship together or #91 waits.

---

## 96. Targeted-but-unassigned runbook entries

> **Shipped 2026-09-06b, as specified.** The resolution order is in `entryTargetsPlayer`, and
> `common/runbook.ts` holds the single `isInertEntry` predicate the shells and the Start
> preflight share with it — the agreement is the point, since the previous behaviour of an
> unassigned targeted entry was to fire for *everyone*.

`playerIds` cannot express "targeted, players not chosen yet": absent, `null` **and `[]` all mean
*anyone*** — `functions/src/geofence.ts:108` returns true when the array is missing or empty, and
`EntryEditor.tsx:140` blocks the save precisely so that an unassigned targeted entry can't reach the
server and fire for the whole field. Add the missing state explicitly rather than redefining `[]`,
because a legacy entry may already carry an empty array and would change behavior under a redefinition:

```ts
export interface RunbookEntry {
  // ...existing...
  /**
   * ROADMAP #96: this entry is *meant* to be player-targeted. Authored during `setup`
   * before anyone has joined, so `playerIds` may legitimately be empty — and while it is,
   * the entry is INERT: crossing resolution skips it entirely instead of falling back to
   * "anyone". Absent = legacy behavior (`playerIds` alone decides).
   */
  targeted?: boolean;
}
```

**Resolution rule** (`canPlayerTrip`, `functions/src/geofence.ts:103`), in order:

1. `targeted === true` and `playerIds` empty/absent → **no one trips it**. (Today: everyone does.)
2. `playerIds` non-empty → only those uids, unchanged.
3. Otherwise → anyone, unchanged.

The same precedence applies to `fireRunbookEntry`'s default recipient set
(`functions/src/runbook.ts:94`): an inert entry has no default targets and the GM must pick.

**Client:** `EntryEditor` drops the empty-list guard and writes `targeted: true` instead, the
sidebar marks inert entries (the 🎯 badge already exists — give the unassigned case its own
"needs players" state), and **#98a** gets a filter for them so they can be found again at start
time.

**Settled 2026-09-06:** `startPreflight` (#23) **warns** about inert entries and never blocks —
some mechanics genuinely don't know the assignee until a player arrives somewhere, so starting with
unassigned entries is legitimate. Assigning targets **during play** already works and must keep
working. The existing per-player targeting is sufficient: no "any N players", no by-district.
`cloneGame` (#65) **strips targets and marks the copy inert.**

## 97. Player-armed traps

> **Shipped 2026-09-06b, as specified**, with one decision the section left open: the arming
> callable resolves the **site itself** from the caller's last fix rather than taking a
> `checkpointId`, so the arming UI is never handed a list of checkpoint coordinates. Disarming
> also **re-issues a fresh code** — clearing `armedBy`/`armedAt` alone would leave the spent
> card valid and the trap live at the player's chosen site. `endgame` counts as `play` for
> arming, so a kit found in the last twenty minutes isn't stranded.
>
> **The `checkpointId` loosening had six consequences**, as warned: both `GameMap`s, both
> runbook views, the run sheet and the checkpoints screen all assumed it was present.

The GM pre-sets traps; a player finds a **physical trap kit** (a card) that names one of them and
arms it where and when they choose. The player supplies only the *site* and the *exclusions* —
never the text, never the effect.

**`RunbookEntry`** gains the trap fields (all optional; an ordinary GM entry sets none):

| Field | Type | Notes |
|---|---|---|
| `trapKitCode` | `string?` | The code printed on the physical card, unique within the game. Arming is "enter this code". **Single-use** — once armed it can't be armed again. |
| `excludePlayerIds` | `string[] \| null` | Set by the *arming player*: who is spared. There is no include list for traps. |
| `maxVictims` | `number?` | GM-set: how many players one trap can catch. |
| `armedBy` / `armedByName` / `armedAt` | `string?` / `string?` / `FsTimestamp?` | Who deployed it and when. GM-auditable; never shown to players, including the armer. |

`checkpointId` **becomes optional while a kit is unarmed** — the one loosening of an existing
required field, so every path that resolves an entry must check it is present rather than assume
it. `targeted` (#96) carries the unarmed template's inert state, so an un-deployed kit cannot fire;
#96 lands first.

**Victim resolution is a co-arrival window, not `fixed-order`.** The rule is "up to `maxVictims`
players, all of whom arrive within **15 seconds** of the first" — same effect for everyone caught.
The existing `queueSlots` model cannot express it: those are per-*distinct-arriver* ordinals with
no clock. The nearest precedent is #5's same-district suppression
(`COARRIVAL_WINDOW_MS = 90_000`, `functions/src/geofence.ts:46`), which reads recent `arrivals` for
the same checkpoint inside a window — the same query, used to *include* rather than to withhold.

| Constant | Value | Notes |
|---|---|---|
| `TRAP_COARRIVAL_WINDOW_MS` | 15 s | From the *first* victim's arrival, not rolling. |
| `TRAP_ARM_RADIUS_M` | 100 | How close the arming player must be to the checkpoint. |

**`armPlayerTrap` callable** (`functions/src/runbook.ts`, same shape as `fireRunbookEntry`) — the
only write path, because `runbook` stays GM-write-only ([firestore.rules:127](firestore.rules:127)):
a player who could write those docs could read every trap in the game. In one transaction it
validates that the caller is an alive player in `play`; that `trapKitCode` matches an unarmed,
player-armable entry; that **the caller's last location fix is within 100 m of the checkpoint** —
not standing on it, because #82 measured why that can't be required; and that every uid in
`excludePlayerIds` is a real member. Then it stamps `checkpointId`, the exclusions and the
`armedBy`/`armedAt` fields, and clears `targeted`.

**Firing rules, all decided:**

- The **armer is never a victim** — implicitly excluded, regardless of the list.
- An **excluded player who crosses sees nothing at all**: no effect, no "you avoided something", no
  arrival ping that hints at it. They fall through as if the entry weren't there.
- The **armer is never notified** that it fired, or on whom. (With a real trap you'd have to watch
  it happen.)
- **Arming is immediate** — no GM approval.
- **Traps never expire and survive their owner's death.**
- **`revealOnFire` stays the GM's setting**, not the player's.
- **No per-player arming limit.** The bound is physical: the GM only puts out so many cards. Drop
  any `playerTrapsPerPlayer` idea — `trapKitCode` single-use is the whole quota mechanism.

**GM audit + disarm.** `armedBy`/`armedByName`/`armedAt` surface in the Runbook sidebar and in the
notification feed on arming; a GM can clear them to disarm, through the existing GM write path.
This is the first feature where one player's action changes what another player runs into, so it is
deliberately visible and reversible.

> **Kit codes are secrets on paper.** `trapKitCode` must not be guessable (same generator class as
> the game codes — no 0/O/1/I/L) and must not be enumerable by a client: the callable takes a code
> and returns success or failure, and never lists kits. A player holding one card must not be able
> to arm a trap they never found.

## 99. Dead-player spectator map

> **Shipped 2026-09-06b, as specified** — including the `outAt` server-clock prerequisite,
> which was indeed a prerequisite and not a follow-up. One thing the section left implicit is
> now explicit in the code: **an open SOS overrides the dead-player display filter** on every
> map. Without that exception the filter and #94's rescue path contradict each other — the
> crew is paged about someone the map refuses to draw.

No new collection and no new role — a read-rule widening plus two config knobs, which is why it
beats the "helper" role it replaces (#91). A dead player stays `role: 'player'`, `out: true`.

**`GameConfig`:**

| Field | Default | Notes |
|---|---|---|
| `spectatorMapEnabled` | `false` | GM opt-in. Off = today's behavior exactly. |
| `spectatorDelayMinutes` | `2` | Countdown from `outAt` before living players appear; `0` = immediate. |

Both freeze at Start with the rest of the interval config (#24) — otherwise a GM could shorten the
delay mid-game to help a particular player.

**What a spectator sees (decided 2026-09-06):** the **boundary**, **every checkpoint**, and the
**living players**. Not other dead players, not GMs. The checkpoints are there so a dead player can
be sent to deploy a drop.

> **The checkpoint half needs no rules change — and that is worth knowing.**
> `checkpoints/{checkpointId}` is **already `allow read: if isGameMember(gameId)`**
> ([firestore.rules:118](firestore.rules:118)); only the *client* withholds it from players, which
> subscribe to `markers` instead. Site secrecy is therefore client-side only today. The genuine
> secret — the behavior — lives in `runbook`, which is and stays GM-only, so this is defensible;
> but nobody should believe the marker projection is a security boundary.

**Rules delta — `locations/{userId}`** ([firestore.rules:171](firestore.rules:171)):

```
allow read: if isGameGM(gameId)
  || (isSignedIn() && request.auth.uid == userId)
  || isSpectator(gameId);

function isSpectator(gameId) {
  let m = get(memberPath(gameId)).data;
  let g = get(/databases/$(database)/documents/games/$(gameId)).data;
  let phase = g.get('phase', 'play');
  return g.get('config', {}).get('spectatorMapEnabled', false) == true
    && (phase == 'play' || phase == 'endgame' || phase == 'cleanup')
    && m.get('out', false) == true
    && m.get('outAt', null) != null
    && request.time > m.outAt + duration.value(
         g.get('config', {}).get('spectatorDelayMinutes', 2), 'm');
}
```

The phase clause implements "**persists through cleanup, cuts off after it**" — in `results` the
location data is being purged anyway. Two `get()`s per read, on documents the ruleset already
fetches elsewhere. Note the **listener lifecycle**: a subscription attached during the countdown is
denied outright, not queued, so the client must hold off and attach when the timer expires.

**The countdown runs from the *recorded* death** — `outAt` as written by `eliminatePlayer()`,
whenever the GM or the player actually marked it, not a reconstructed time of death. **Tapping out
grants the same access** as being killed; no separate path.

> **`outAt` becomes security-relevant, and today it is forgeable.** The member self-update rule
> ([firestore.rules:150](firestore.rules:150)) pins `role`, `userId`, `district` and `sosAckAt` and
> lets everything else through — so a player can write `out: true` with an `outAt` of their
> choosing. Harmless today (it only skews their own results timer); an instant bypass of the
> countdown the moment this ships. **Prerequisite:** on a self-write, require the server clock —
>
> ```
> && (request.resource.data.get('outAt', null) == resource.data.get('outAt', null)
>     || request.resource.data.outAt == request.time)
> ```
>
> — which is exactly what `eliminatePlayer()`'s `serverTimestamp()` already produces
> ([services/gameService.ts:282](services/gameService.ts:282)). GM writes are unaffected.

**Dead players keep uploading.** The `shouldTrack = … && !out` gate in the play screen is lifted, so
a dead player's `locations` doc stays live — needed by #94's rescue path and #84's cleanup. But they
are **filtered out of everyone else's map**, GM and spectator alike, to keep the display readable;
they still see themselves. That filter is client-side presentation over data the GM legitimately
has, not a permission.

**SOS is drawn distinctly.** Any member with `sos: true` renders in a different colour on every map
that shows them, so a response starts without hunting the roster. Pairs with #94's fan-out of the
alert to GMs *and* every dead player.

**Nothing else changes shape.** `PlayerLocation.displayName` is already denormalized onto every fix,
so a spectator labels the map without member access and this has **no dependency on #88**. `GameMap`
already takes `playerLocations` and is already shared by both screens (`components/GameMap.tsx:49`).
Route the spectator's feed through the #82 `locationStabilizer` the GM contexts use.

**Teardown is free — but memory isn't.** `revivePlayer()` writes `out: false, outAt: null`, so the
predicate goes false on the next delivery; no revoke path to get wrong. It cannot, however, unwind
what a spectator already *saw*: a revived player knows every checkpoint on the map. A GM operational
fact, not a bug.

**Scale.** At 12 players the read cost peaks around six spectators watching six living players —
negligible, and it was never the constraint.

---

## 100. Geofence quality — Stonedam Day 2 retune

> **2026-09-06b:** `config.locationTrail` now also spares `arrivals`, `checkpointTrips` and
> `entryTrips` from `cleanupOnGameEnd`. The trail was already excluded, but it is
> uninterpretable without them — which is how the Stonedam evidence was lost. One flag, one
> intent, and no new exposure: the trail holds every fix, of which the arrival positions are a
> strict subset. **The retention duty now covers all four.**

Shipped 2026-09-06. Additive and optional throughout; a legacy game doc with none of these keys
gets the new defaults, and a game that explicitly set one keeps its value. See
[ROADMAP.md](ROADMAP.md) §100 for the field data each default was derived from.

**`GameConfig`** (`types/index.ts`) — five new knobs, plus two defaults flipped:

| Field | Type | Default | Notes |
|---|---|---|---|
| `accuracyRadiusFactor` | `number?` | `2` | Per-checkpoint accuracy gate: a fix may only be judged against a checkpoint when its accuracy beats `radius × factor`, clamped to `[MIN_ACCURACY_FLOOR_M, minFixAccuracyMeters]`. `0` disables, leaving only the flat ceiling. |
| `passThroughMaxSegmentMeters` | `number?` | `150` | Longest #49 segment believed on geometry **alone**. `0` disables pass-through entirely. Not a hard ceiling — see `stepCorroboration`. |
| `stepCorroboration` | `boolean?` | `true` | Check a pass-through against the pedometer. Also raises the segment ceiling to `CORROBORATED_MAX_SEGMENT_METERS` for crossings the step count positively confirms. |
| `reArrivalCooldownMinutes` | `number?` | `5` | Minutes before the same player can record another arrival at the same checkpoint. `0` disables. |
| `trustOsGeofence` | `boolean?` | `true` | An OS geofence Enter event satisfies `geofenceConfirmFixes` and relaxes that checkpoint's accuracy gate to the flat ceiling. Never creates an arrival on its own. |
| `wakeLockEnabled` | `boolean?` | `true` *(was `false`)* | Promoted from A/B variable to default. |
| `locationTrail` | `boolean?` | `true` *(was unset)* | Promoted from opt-in. **Still excluded from end-of-game cleanup** — the retention liability is unchanged, so delete the subcollection once a run is analysed. |

**`CheckpointTrip`** (`types/index.ts`, server-written, never client-readable) — two new fields
backing the cooldown:

| Field | Type | Notes |
|---|---|---|
| `lastArrivalAt` | `FsTimestamp?` | Advances **only when an arrival doc is actually written** — deliberately not on every latched entry, so a suppressed burst can't keep pushing the window forward and starve a genuine later re-crossing. Distinct from `lastEnterAt`, which a rejected pass-through also stamps. |
| `lastArrivalSteps` | `number?` | Cumulative step count at that arrival. Lets positive step evidence (a full round trip past the exit ring and back) admit a re-arrival before the clock expires. `null` when the pedometer had nothing to say. |

**`Arrival`** (`types/index.ts`) — provenance, so a post-mortem stops being archaeology:

| Field | Type | Notes |
|---|---|---|
| `via` | `'fix' \| 'pass-through' \| 'os-geofence'` `?` | How the crossing was established. Absent on pre-2026-09-06 arrivals. |
| `fixDistanceM` | `number?` | Metres from the recorded fix to the checkpoint centre. `latitude`/`longitude` remain the **actual** fix and are never fabricated at the checkpoint, so a `pass-through` row is *expected* to exceed the radius — this pair is what separates that healthy case from receiver drift. |

**`locationTrail/{id}`** (server-written, `functions/src/geofence.ts`) gains `fixGapMs` (from the
server's own commit times, not the client clock) and `trustedStepsSincePrev` (the delta the crossing
logic was willing to act on — `null` while the gap is under `STEP_LOOKBACK_MS`). Together with the
existing `stepsSincePrev` these are what let `STEP_LENGTH_M` and `MIN_STEP_FRACTION` be re-derived
from a capture instead of staying conventions.

**No schema** — constants are module-level in `functions/src/geofence.ts`, deliberately not
GM-tunable until a trail justifies values: `CORROBORATED_MAX_SEGMENT_METERS` 400,
`STEP_LENGTH_M` 0.75, `MIN_STEP_FRACTION` 0.5, `STEP_LOOKBACK_MS` 45 s, `MIN_ACCURACY_FLOOR_M` 25 m.
`CHECKPOINT_MIN_GAP_M` (20 m) lives in `common/geo.ts` beside `findCloseCheckpoints()`, which is
pure and shared by both GM surfaces through the Start-Game preflight.

---

## No schema change — enforcement / logic only

These **outstanding** items are pure logic, rules, client architecture, or ops — no new fields or
collections. (Shipped no-schema items — 20–28, 48–56, 58's prerequisites, etc. — are retired; see the
[ROADMAP.md](ROADMAP.md) Built & removed callout and git history.)

- **47** Maps-key restriction — Cloud Console ops task.
- **85** ✅ *Built 2026-09-06 (roster) + 2026-09-06b (detail).* GM per-player overflow menu —
  mobile UI only; every action moved into the menu on both screens. Extracted to
  `components/PlayerActionSheet.tsx` so the two can't drift, with `<DistrictEditorModal>` as a
  parent-owned sibling (the roster's inline district chip opens the same editor).
- **86** Server-authoritative game logic — *a spike with a prototype*. Any outcome would be a large
  schema change, so nothing is specified here yet. **Answer the OTA question first**: half the
  motivation is shipping a messaging change without a build, and `updates.enabled` is off by choice
  since 2026-06-19. Re-enabling it may retire that half outright.
- **89** ✅ *Built 2026-09-06b.* "You died" screen — client only, and **one screen for every cause** (self-reported, GM
  elimination, starvation all read the same). It **blocks interaction until dismissed**, and behind
  it sits nothing but the #99 spectator map; the player still receives other players' death
  notifications. The toll broadcast keeps its `targetPlayerId: null` fan-out unchanged — everyone
  else's toll still names them — and the dying player suppresses only their own, by its
  deterministic `{userId}_death` id (#26). No new field.
- **92** ✅ *Built 2026-09-06 (join deep-link param + web QR) + 2026-09-06b (the GM-phone QR).*
  The native-module blocker was resolved by not having one: `common/qr.ts` computes the matrix
  in pure TypeScript and `<QrCode>` draws it as plain Views, verified module-for-module
  against the `qrcode` package over 227 payloads. Join by QR — a `code` route param on `/join` + an `outdoorgm://` deep-link handler; scanning
  turned out **not** to need the `expo-camera` scanner at all — the phone's own camera resolves the deep link. Adds a pure-JS QR *renderer*
  dependency for the GM side. No stored data and **no code rotation** — one code per game, unchanged.
  Displayed on the **GM phone and web dashboard only, never printed**, so the secret isn't left
  photographable. Scanning fills the code plus the scanner's own profile display name.
- **93** ✅ *Built 2026-09-06.* Profile display-name autofocus — deleted one prop (`app/(app)/profile.tsx:86`). Layout
  stays as it is; no reordering.
- **94** ✅ *Built 2026-09-06 (client) + 2026-09-06b (the rest) — **the function is still
  undeployed**.* Safety alert surviving death — client + functions, no new fields. Three parts: keep the
  control visible in **every** state (it is the requirement — the option must never disappear);
  **lift the `!out` tracking gate** so a dead player keeps uploading (shared with #99), which makes
  the alert self-locating and retires the unused `sosLocation`/`coords` path
  (`types/index.ts:555`, `services/gameService.ts:348`) — keep it as the no-fix fallback, since the
  alert must send regardless; and **widen the fan-out to GMs *and* every dead player** (never live
  ones), which is a recipient-list change in `functions/src/members.ts`. Paging stops at close.
- **95** ✅ *Built 2026-09-06.* New-drop iconography — presentation plus a per-device "seen" set (AsyncStorage, the pattern
  `AlertOverlay` uses for dismissed broadcasts). Settled: **until-seen, never time-decayed**, and
  "seen" means the **map was on screen**, not that the app was opened — so the seen-set is written
  by the map view, not by the screen mount. `RevealedMarker.revealedAt`/`visibleFrom` already carry
  the timing, so nothing is stored server-side; it must stay per-device anyway, since a shared field
  would mark a drop seen for everyone the first player looked at it. Discovery notifications already
  exist and are unchanged — this is purely the "visible since last look" styling. No GM-side view of
  who has seen what.
- **98a** ✅ *Built 2026-09-06; gained the #96 "needs players" axis 2026-09-06b. Still never
  opened in a browser.* Web runbook filtering — `web/src/screens/RunbookScreen.tsx` UI only; every axis
  (`checkpointId`, `effect.kind`, `trigger`, `playerIds`, `revealOnFire`) is already on the entry.
  Filters **do not persist** between sessions.
- **98b** ✅ *Built 2026-09-06.* Mobile runbook view — **no schema, but not small**: `app/(app)/gm/[gameId]/` has no
  runbook screen at all (checkpoints, run-sheet, players, rations, map). "The same on mobile" means
  building a read-and-filter view from scratch, justified by the 1–2 GMs working from phones.
