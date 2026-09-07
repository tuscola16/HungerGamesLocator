import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Alert, TouchableOpacity, Linking, AppState, ScrollView, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/context/AuthContext';
import { Colors } from '@/constants/colors';
import { Button } from '@/components/ui/Button';
import { GameMap } from '@/components/GameMap';
import { BroadcastFeed } from '@/components/BroadcastFeed';
import { AlertOverlay } from '@/components/AlertOverlay';
import { LobbyPermissions } from '@/components/LobbyPermissions';
import { RationPanel } from '@/components/RationPanel';
import { PostGameMedia } from '@/components/PostGameMedia';
import { Tutorial } from '@/components/Tutorial';
import { BroadcastsProvider } from '@/context/BroadcastsContext';
import { DiedOverlay } from '@/components/DiedOverlay';
import { LocationStabilizer, type StabilizedLocation } from '@/common/locationStabilizer';
import * as Location from 'expo-location';
import * as Application from 'expo-application';
import {
  startLocationTracking,
  stopLocationTracking,
  getTrackingDiagnostics,
  startCheckpointGeofencing,
  stopCheckpointGeofencing,
  isCheckpointGeofencingArmed,
} from '@/services/locationTask';
import { requestBatteryOptimizationExemption } from '@/services/batteryOptimization';
import {
  eliminatePlayer, raiseSos, setDeathLocation, setDropCleared, gamePhase, gameConfig, ENDGAME_RALLY_ID,
} from '@/services/gameService';
import { friendlyError } from '@/services/errorUtils';
import { useElapsed, useRemaining, formatDuration } from '@/hooks/useElapsed';
import { useRationReminders } from '@/hooks/useRationReminders';
import { collection, doc, onSnapshot, query, where, Timestamp, type QuerySnapshot } from '@react-native-firebase/firestore';
import { db } from '@/services/firebase';
import { Collections } from '@/services/firebase';
import type {
  Checkpoint, Game, GameConfig, GamePhase, MapBoundary, PlayerLocation, RevealedMarker, RosterEntry,
} from '@/types';

type Ts = Timestamp | null;

/** #95: how long a newly revealed marker stays flagged once the map is on screen. */
const MARKER_SEEN_MS = 5000;

export default function PlayerGameScreen() {
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
  const { user } = useAuth();
  const router = useRouter();

  const [gameName, setGameName] = useState('');
  const [phase, setPhase] = useState<GamePhase>('setup');
  const [rules, setRules] = useState<string>('');
  const [boundary, setBoundary] = useState<MapBoundary | null>(null);
  const [mapOverlay, setMapOverlay] = useState<Game['mapOverlay'] | null>(null);
  const [media, setMedia] = useState<Game['media'] | null>(null);
  const [practice, setPractice] = useState(false);
  // Revealed checkpoint markers (#48) this player is allowed to see — the only
  // checkpoint data a player ever gets (the `checkpoints` collection stays GM-only).
  const [markers, setMarkers] = useState<RevealedMarker[]>([]);
  const [startedAt, setStartedAt] = useState<Ts>(null);
  const [endedAt, setEndedAt] = useState<Ts>(null);
  // #81: the last tribute standing, stamped on the game doc when it ends. Drives the
  // "YOU WON" results banner (players can't read other members, so the name rides here).
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [winnerName, setWinnerName] = useState<string | null>(null);
  const [durationMinutes, setDurationMinutes] = useState(gameConfig(null).durationMinutes);
  const [batterySaver, setBatterySaver] = useState(gameConfig(null).batterySaver);
  // #82: the A/B arm for the wake-lock experiment, read from the game config.
  const [wakeLock, setWakeLock] = useState(gameConfig(null).wakeLockEnabled === true);
  const [config, setConfig] = useState<GameConfig>(gameConfig(null));

  // Empty until the member doc loads, so location tracking starts with the real
  // name rather than the "Player" placeholder. The tracking effect gates on it.
  const [displayName, setDisplayName] = useState('');
  const [out, setOut] = useState(false);
  const [outAt, setOutAt] = useState<Ts>(null);

  const [tracking, setTracking] = useState(false);
  const [error, setError] = useState('');
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  // Play screen has two views — a full-screen Map and a Stats view — because the
  // map was unusably small when crammed in with everything else (#20).
  const [playTab, setPlayTab] = useState<'map' | 'stats'>('map');
  // Hide the pinned action bar while the keyboard is up, so the "I've been killed" /
  // SOS buttons don't float over the ration-card input (they're back the moment the
  // keyboard closes; the buttons also live at the end of the scrollable Stats view).
  const [keyboardUp, setKeyboardUp] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardUp(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardUp(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Tracking diagnostics — polled from the location service so a player (e.g. one
  // stuck on "Starting tracking…") can tap the status card to see exactly where
  // startup stalled: permission states, which source engaged, last upload, last error.
  const [diag, setDiag] = useState(getTrackingDiagnostics());
  const [showDiag, setShowDiag] = useState(false);
  // The "…s ago" rows need a clock, but reading Date.now() during render is impure — it
  // makes the output depend on when React happens to re-render. Sample it on the same tick
  // as the diagnostics instead, so both move together and render stays a pure function.
  const [diagNow, setDiagNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      setDiag(getTrackingDiagnostics());
      setDiagNow(Date.now());
    }, 2000);
    return () => clearInterval(id);
  }, []);

  // Tracks whether we've ever observed our own membership doc, so we only treat a
  // *disappearing* doc (GM removed us) as a removal — not a not-yet-loaded one.
  const sawMemberRef = useRef(false);

  // Schedule eat-window open notifications unconditionally while playing — not gated on the
  // Stats tab so the player is alerted even while they stay on the Map (#52).
  useRationReminders({
    gameId: gameId ?? undefined,
    startedAt,
    config,
    active: phase === 'play' && !out,
  });

  // Elapsed play time: ticks during play, freezes at outAt (if out) or endedAt.
  const frozenEnd = out ? outAt : phase === 'results' ? endedAt : null;
  const elapsed = useElapsed(startedAt, frozenEnd);
  const remaining = useRemaining(startedAt, durationMinutes, frozenEnd);

  // Subscribe to the game doc (phase, timing, rules) and own member doc.
  useEffect(() => {
    if (!gameId || !user) return;
    const unsubGame = onSnapshot(doc(db, Collections.GAMES, gameId), 
        (snap) => {
          const d = snap.data();
          if (!d) return;
          setGameName(d.name ?? '');
          setPhase(gamePhase(d as any));
          setRules(d.rules ?? '');
          setBoundary(d.boundary ?? null);
          setMapOverlay(d.mapOverlay ?? null);
          setMedia(d.media ?? null);
          setPractice(!!d.practice);
          setStartedAt(d.startedAt ?? null);
          setEndedAt(d.endedAt ?? null);
          setWinnerId(d.winnerId ?? null);
          setWinnerName(d.winnerName ?? null);
          setDurationMinutes(gameConfig(d as any).durationMinutes);
          setBatterySaver(gameConfig(d as any).batterySaver);
          setWakeLock(gameConfig(d as any).wakeLockEnabled === true);
          setConfig(gameConfig(d as any));
        },
        (err: Error) => console.error('[PlayerGame] game listener error', err)
      );

    const unsubMember = onSnapshot(doc(db, Collections.GAMES, gameId, Collections.MEMBERS, user.uid), 
        (snap) => {
          // The membership doc vanishing means the GM removed us from the game.
          // Stop sharing location immediately and leave — without this, the
          // background task keeps uploading our position even after removal.
          //
          // BUT only trust a *server*-confirmed disappearance. On a poor connection
          // (the norm in the field) RNFirebase can deliver a cache-sourced snapshot
          // that momentarily reports our own member doc as absent before the server
          // reconciles. Treating that as a removal bounced a flaky-signal player back
          // to "My Games" every few seconds even though she was never actually removed.
          // `metadata.fromCache` is false only once the server has spoken.
          if (!snap.exists()) {
            if (sawMemberRef.current && !snap.metadata.fromCache) {
              stopLocationTracking().catch(() => {});
              Alert.alert('Removed from game', 'The Game Master has removed you from this game.');
              router.replace('/(app)/games');
            }
            return;
          }
          sawMemberRef.current = true;
          const d = snap.data();
          if (!d) return;
          setDisplayName(d.displayName ?? 'Player');
          setOut(!!d.out);
          setOutAt(d.outAt ?? null);
        },
        (err: Error) => console.error('[PlayerGame] member listener error', err)
      );

    return () => { unsubGame(); unsubMember(); };
  }, [gameId, user]);

  // Subscribe to revealed checkpoint markers (#48) — global ones (audiencePlayerIds
  // null) plus ones aimed at this player (array-contains uid). Firestore can't OR those
  // in one query, so we run two listeners and merge (same shape as the broadcast feed).
  // Client-side: markers with a future `visibleFrom` are filtered out on each render
  // (defense-in-depth against stale pre-written markers).
  useEffect(() => {
    if (!gameId || !user) return;
    const col = collection(db, Collections.GAMES, gameId, Collections.MARKERS);
    const merged = new Map<string, RevealedMarker>();
    const emit = () => {
      const nowMs = Date.now();
      setMarkers(
        [...merged.values()].filter(
          (m) => !m.visibleFrom || m.visibleFrom.toMillis() <= nowMs
        )
      );
    };
    const handle = (snap: QuerySnapshot) => {
      snap.docChanges().forEach((c) => {
        if (c.type === 'removed') merged.delete(c.doc.id);
        else merged.set(c.doc.id, { ...c.doc.data() } as RevealedMarker);
      });
      emit();
    };
    const unsubGlobal = col
      .where('audiencePlayerIds', '==', null)
      .onSnapshot(handle, (err: Error) => console.error('[PlayerGame] global markers error', err));
    const unsubMine = col
      .where('audiencePlayerIds', 'array-contains', user.uid)
      .onSnapshot(handle, (err: Error) => console.error('[PlayerGame] my markers error', err));
    return () => { unsubGlobal(); unsubMine(); };
  }, [gameId, user]);

  // ---------------------------------------------------------------------------------
  // #99: the dead-player spectator map.
  //
  // A dead player keeps `role: 'player'` and gains a read-only view of the arena: the
  // boundary, every checkpoint, and the LIVING players. Not other dead players, not GMs.
  // The checkpoints are there so a dead player can be sent to deploy a drop, and the
  // living players are what makes them useful to a GM at the far end of the woods.
  //
  // The two-minute delay exists because the moment right after a kill is the dangerous
  // one: the person who just died is standing next to whoever killed them and knows where
  // their allies are. It runs from the *recorded* death (`outAt` as written by
  // eliminatePlayer), never from a reconstructed time — and it is enforced in
  // firestore.rules, not here. This timer only decides when to *attach* the listener,
  // because a subscription opened during the countdown is denied outright rather than
  // queued, which would leave a permanently dead listener behind.
  // ---------------------------------------------------------------------------------
  // #84: `cleanup` grants EVERY member mutual map visibility, dead or alive, straight from
  // the rules — no spectator countdown, no GM opt-in. The recovery job is finding people
  // and props in the dark, so the arena is simply lit. That means the live-locations
  // listener attaches in cleanup for everyone, and the countdown/opt-in gate below applies
  // only to the #99 spectator case during play.
  const cleanupOpen = phase === 'cleanup';
  const spectatorPhase = phase === 'play' || phase === 'endgame' || phase === 'cleanup';
  const spectatorOffered = config.spectatorMapEnabled === true && out && spectatorPhase;
  const spectatorReadyAt = useMemo(() => {
    if (!spectatorOffered || !outAt) return null;
    const delayMin = config.spectatorDelayMinutes ?? 2;
    return outAt.toMillis() + delayMin * 60_000;
  }, [spectatorOffered, outAt, config.spectatorDelayMinutes]);
  // Derived, not stateful: `diagNow` already ticks every 2 s for the diagnostics card, and
  // 2 s granularity is ample for a 2-minute countdown. This keeps the gate a pure function
  // of (outAt, config, now) rather than a timer that can be left armed across a revive.
  const spectatorLive =
    cleanupOpen || (spectatorReadyAt != null && diagNow >= spectatorReadyAt);

  // The roster projection (#88) — the ONLY roster a player may read, and during play it
  // holds exactly the living players. It is therefore both the filter ("which of these
  // location docs am I allowed to see?") and the SOS source, without ever touching a
  // member doc.
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  useEffect(() => {
    if (!gameId) return;
    return onSnapshot(
      collection(db, Collections.GAMES, gameId, Collections.ROSTER),
      (snap: QuerySnapshot) => setRoster(snap.docs.map((d) => ({ ...d.data() } as RosterEntry))),
      (err: Error) => console.error('[PlayerGame] roster listener error', err)
    );
  }, [gameId]);

  const [spectatorLocations, setSpectatorLocations] = useState<StabilizedLocation[]>([]);
  const [spectatorCheckpoints, setSpectatorCheckpoints] = useState<Checkpoint[]>([]);
  // #82: route the spectator's feed through the same jump suppression the GM contexts use,
  // so a dead player isn't watching the teleporting map the GMs stopped seeing in September.
  // Stabilizing happens in the snapshot callback, never during render — the stabilizer is
  // stateful (it remembers each player's last drawn position), so calling it from a
  // useMemo would corrupt its history on any double-render.
  const spectatorStabilizer = useRef(new LocationStabilizer());
  useEffect(() => {
    const max = config.maxDisplayAccuracyMeters;
    if (typeof max === 'number') spectatorStabilizer.current.setMaxAccuracy(max);
  }, [config.maxDisplayAccuracyMeters]);

  useEffect(() => {
    // Nothing to clear on the inactive branch: `visibleSpectatorLocations` renders empty
    // whenever the map isn't live, so leftover state is never read.
    if (!gameId || !spectatorLive) return;
    const stabilizer = spectatorStabilizer.current;
    const unsubLoc = onSnapshot(
      collection(db, Collections.GAMES, gameId, Collections.LOCATIONS),
      (snap: QuerySnapshot) =>
        setSpectatorLocations(
          stabilizer.stabilize(snap.docs.map((d) => ({ ...d.data() } as PlayerLocation)))
        ),
      (err: Error) => console.error('[PlayerGame] spectator locations error', err)
    );
    // Checkpoints are already member-readable (the OS geofence registration needs them on
    // the device), so this adds no permission — only the rendering the client used to
    // withhold.
    const unsubCp = onSnapshot(
      collection(db, Collections.GAMES, gameId, Collections.CHECKPOINTS),
      (snap: QuerySnapshot) =>
        setSpectatorCheckpoints(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Checkpoint))),
      (err: Error) => console.error('[PlayerGame] spectator checkpoints error', err)
    );
    return () => { unsubLoc(); unsubCp(); stabilizer.reset(); };
  }, [gameId, spectatorLive]);

  /**
   * Who a spectator may see: the people the roster lists, minus themselves.
   *
   * During play the roster is living-players-only, so this filter *is* the "no other dead
   * players, no GMs" rule — expressed as an allowlist rather than a denylist, so a
   * location doc for someone the roster doesn't mention can never leak onto the map.
   * During `cleanup` (#84) the roster lists everyone who played, which is exactly the
   * "everyone sees everyone" the recovery job needs, with no second code path.
   *
   * The rules deliberately hand a spectator the *whole* locations collection (see
   * firestore.rules) — filtering it is presentation, not a security boundary.
   */
  const visibleSpectatorLocations = useMemo(() => {
    if (!spectatorLive) return [];
    const mine = (l: { userId: string }) => l.userId === user?.uid;
    // #84: in cleanup, "everyone sees everyone" includes the GMs — who are the people most
    // worth finding when you're the last one in the woods with a bag of props. The roster
    // never lists GMs, so the allowlist is dropped here rather than widened.
    if (cleanupOpen) return spectatorLocations.filter((l) => !mine(l));
    const allowed = new Set(roster.map((r) => r.userId));
    return spectatorLocations.filter((l) => !mine(l) && allowed.has(l.userId));
  }, [spectatorLive, cleanupOpen, spectatorLocations, roster, user?.uid]);

  /** #99: an open safety alert draws distinctly on every map that shows the player. */
  const sosUserIds = useMemo(
    () => new Set(roster.filter((r) => r.sos).map((r) => r.userId)),
    [roster]
  );

  // #89: withhold this player's OWN death toll. The broadcast still fans out to everyone
  // else named; <DiedOverlay> is what this player gets instead. Memoized so the overlay's
  // effect doesn't re-run on every render.
  const suppressBroadcastIds = useMemo(
    () => (user ? [`${user.uid}_death`] : []),
    [user]
  );

  // #41: the end-game rally point rides the same `markers` plumbing as every other
  // revealed site, so on the map it was just one more pin in a field of pins — players
  // couldn't find where to converge. Split it out so it draws as the distinct flame
  // badge the GM sees (works for games whose rally marker predates marker icons).
  const rallyPoint = useMemo(() => {
    const m = markers.find((x) => x.checkpointId === ENDGAME_RALLY_ID);
    return m ? { latitude: m.latitude, longitude: m.longitude } : null;
  }, [markers]);
  const siteMarkers = useMemo(
    () => markers.filter((m) => m.checkpointId !== ENDGAME_RALLY_ID),
    [markers]
  );

  // #95: a site that has appeared since the player last had the map on screen draws as
  // "new". Per device (AsyncStorage), never time-decayed, and fail-soft in both
  // directions — while the state is still loading, or if storage throws, nothing is marked
  // new, which is exactly the pre-#95 behavior.
  //
  // `since` is the anti-backlog guard: on this device's first open of the game we stamp the
  // clock, and a marker revealed before that is never "new" — otherwise every
  // always-shown checkpoint would light up at once on the screen the player is using to
  // orient themselves, which is noise, not signal.
  const [seenMarkers, setSeenMarkers] = useState<{ seen: Set<string>; since: number } | null>(null);
  const seenMarkersKey = gameId ? `seen_markers_${gameId}` : null;

  useEffect(() => {
    if (!seenMarkersKey) return;
    let cancelled = false;
    AsyncStorage.getItem(seenMarkersKey)
      .then((raw) => {
        if (cancelled) return;
        if (!raw) {
          // First open on this device: everything already revealed counts as seen.
          // Persist immediately so `since` is stable across launches.
          const fresh = { seen: new Set<string>(), since: Date.now() };
          setSeenMarkers(fresh);
          AsyncStorage.setItem(seenMarkersKey, JSON.stringify({ seen: [], since: fresh.since }))
            .catch(() => {});
          return;
        }
        try {
          const parsed = JSON.parse(raw) as { seen?: string[]; since?: number };
          setSeenMarkers({ seen: new Set(parsed.seen ?? []), since: parsed.since ?? Date.now() });
        } catch {
          setSeenMarkers({ seen: new Set(), since: Date.now() });
        }
      })
      .catch(() => { if (!cancelled) setSeenMarkers({ seen: new Set(), since: Date.now() }); });
    return () => { cancelled = true; };
  }, [seenMarkersKey]);

  const newMarkerIds = useMemo(() => {
    if (!seenMarkers) return new Set<string>();
    return new Set(
      siteMarkers
        .filter((m) => {
          if (seenMarkers.seen.has(m.checkpointId)) return false;
          // No timestamp (legacy marker) → treat as not new, matching pre-#95 behavior.
          const revealedMs = m.revealedAt?.toMillis?.();
          return revealedMs != null && revealedMs > seenMarkers.since;
        })
        .map((m) => m.checkpointId)
    );
  }, [siteMarkers, seenMarkers]);

  // "Seen" means the map was actually displayed — not that the app was opened — so the
  // set only advances while the map tab is up, and only after a beat, so a marker that
  // lands while the player is watching still gets a moment of being visibly new.
  useEffect(() => {
    if (playTab !== 'map' || !seenMarkersKey || !seenMarkers || newMarkerIds.size === 0) return;
    const t = setTimeout(() => {
      const next = new Set(seenMarkers.seen);
      newMarkerIds.forEach((id) => next.add(id));
      setSeenMarkers({ seen: next, since: seenMarkers.since });
      AsyncStorage.setItem(
        seenMarkersKey,
        JSON.stringify({ seen: [...next], since: seenMarkers.since })
      ).catch(() => {});
    }, MARKER_SEEN_MS);
    return () => clearTimeout(t);
  }, [playTab, seenMarkersKey, seenMarkers, newMarkerIds]);

  // Show the intro tutorial once per game, while waiting in the lobby.
  useEffect(() => {
    if (!gameId || phase !== 'lobby') return;
    const key = `tutorial_seen_${gameId}`;
    AsyncStorage.getItem(key).then((seen) => {
      if (!seen) setShowTutorial(true);
    });
  }, [gameId, phase]);

  function dismissTutorial() {
    setShowTutorial(false);
    if (gameId) AsyncStorage.setItem(`tutorial_seen_${gameId}`, '1').catch(() => {});
  }

  // Whether we should be sharing location: in the lobby *and* during play (#16). A single
  // stable boolean so the lifecycle effect below doesn't churn on unrelated re-renders.
  // Lobby fixes don't trigger checkpoints — the geofence fires only in `play`.
  // #41: tracking continues through the end-game showdown — players are still on the map.
  //
  // #94/#99: the `&& !out` gate is GONE. A dead player keeps uploading, because that is
  // exactly who needs finding: their safety alert is then backed by a live position instead
  // of a stale one (#94), and cleanup has to locate people still in the woods (#84). Two
  // things make it safe to keep the fixes flowing: the geofence function returns early on
  // `member.out`, so a dead player can never trip a checkpoint or a runbook effect; and both
  // GM maps filter dead players out of the display, so the screen stays readable. Tracking
  // still stops at `results` — the game is over and nobody is paging anyone.
  // #84: it also runs through `cleanup`, which is the phase whose whole job is finding people.
  const shouldTrack =
    !!gameId && (phase === 'lobby' || phase === 'play' || phase === 'endgame' || phase === 'cleanup');

  // Latest tracking params, held in refs so the start/stop lifecycle effect can read them
  // without listing displayName/batterySaver as deps (#35) — a late-arriving displayName or
  // a battery-saver toggle re-asserts params (effect below) instead of tearing down and
  // restarting the background service, which left a window with no active tracker.
  const trackName = displayName || user?.email || 'Player';
  const trackParamsRef = useRef({ trackName, batterySaver, wakeLock });
  trackParamsRef.current = { trackName, batterySaver, wakeLock };
  const shouldTrackRef = useRef(shouldTrack);
  shouldTrackRef.current = shouldTrack;

  // Start/stop lifecycle — keyed only on gameId + shouldTrack (both stable), so it runs
  // exactly when tracking should begin or end, not on every param change.
  useEffect(() => {
    if (!shouldTrack || !gameId) {
      setTracking(false);
      stopLocationTracking().catch(() => {});
      return;
    }
    let active = true;
    startLocationTracking(gameId, trackParamsRef.current.trackName, {
      batterySaver: trackParamsRef.current.batterySaver,
      wakeLock: trackParamsRef.current.wakeLock,
    })
      .then(() => { if (active) setTracking(true); })
      .catch((err: unknown) => {
        if (!active) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.startsWith('PERMISSION_DENIED:')) {
          setPermissionDenied(true);
          setError(msg.replace('PERMISSION_DENIED:', ''));
        } else {
          setError(msg || 'Could not start location tracking.');
        }
      });
    return () => { active = false; stopLocationTracking().catch(console.error); };
  }, [gameId, shouldTrack]);

  // OS geofences for this game's checkpoints. Purely a latency device: the OS wakes the app
  // on region entry even in Doze, and the task forces a location upload so the SERVER can
  // detect the arrival on a fresh fix instead of waiting out a ~90s throttled gap. Arrival
  // detection itself is unchanged and stays server-side.
  //
  // Registered only while tracking, and torn down on leave/elimination so a finished game
  // doesn't keep waking the device.
  useEffect(() => {
    if (!shouldTrack || !gameId) {
      stopCheckpointGeofencing().catch(() => {});
      return;
    }
    let active = true;
    let regions: { id: string; latitude: number; longitude: number; radius: number }[] = [];

    const unsub = onSnapshot(
      collection(db, Collections.GAMES, gameId, Collections.CHECKPOINTS),
      (snap: QuerySnapshot) => {
        if (!active) return;
        regions = snap.docs
          .map((d) => {
            const c = d.data() as { latitude?: number; longitude?: number; radius?: number };
            return { id: d.id, latitude: c.latitude!, longitude: c.longitude!, radius: c.radius ?? 30 };
          })
          .filter((r) => typeof r.latitude === 'number' && typeof r.longitude === 'number');
        // The region set changed — re-register unconditionally, replacing whatever is armed.
        startCheckpointGeofencing(regions).catch(() => {});
      },
      (err: Error) => console.error('[PlayerGame] checkpoint geofence listener error', err)
    );

    // Registration used to be one-shot, and its most common failure is transient: on a fresh
    // install this effect runs before the player has finished granting "Always" location, so
    // the single attempt fails and nothing ever retries. Nothing else re-runs it either —
    // `shouldTrack` is already true during the lobby, so the lobby->play transition doesn't
    // change this effect's deps, and the checkpoint snapshot won't fire again on its own.
    //
    // Field-observed 2026-08-15: geofencing sat unarmed through an entire test walk and only
    // came up when the player happened to reopen the app, which remounted this effect. Poll
    // until it takes, asking the OS each time so we also recover if the system drops them.
    const retry = async () => {
      if (!active || regions.length === 0) return;
      if (await isCheckpointGeofencingArmed()) return;
      await startCheckpointGeofencing(regions).catch(() => false);
    };
    const retryId = setInterval(retry, 15000);

    return () => {
      active = false;
      clearInterval(retryId);
      unsub();
      stopCheckpointGeofencing().catch(() => {});
    };
  }, [gameId, shouldTrack]);

  // Propagate param changes (displayName arriving, battery-saver toggle) to a running
  // tracker WITHOUT a stop/start — startLocationTracking refreshes the stored name/cadence
  // and is a no-op restart if the background service is already running. Skips the initial
  // render so it doesn't double-start alongside the lifecycle effect on mount.
  const paramsPrimed = useRef(false);
  useEffect(() => {
    if (!paramsPrimed.current) { paramsPrimed.current = true; return; }
    if (!shouldTrack || !gameId) return;
    startLocationTracking(gameId, trackName, { batterySaver, wakeLock })
      .then(() => setTracking(true))
      .catch(() => {});
    // shouldTrack/gameId read live; we only want to react to param changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackName, batterySaver, wakeLock]);

  // Re-assert tracking every time the app returns to the foreground. Two reasons:
  // (1) if the player granted "Always" in Settings since we started, this upgrades
  // them from the foreground-only watcher to the always-on background service; and
  // (2) it restarts a background service the OS may have killed — so a player who
  // locks their phone keeps reporting and never silently drops off the GM's map.
  useEffect(() => {
    if (!gameId) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !shouldTrackRef.current) return;
      startLocationTracking(gameId, trackParamsRef.current.trackName, {
        batterySaver: trackParamsRef.current.batterySaver,
      wakeLock: trackParamsRef.current.wakeLock,
      })
        .then(() => setTracking(true))
        .catch(() => {});
    });
    return () => sub.remove();
  }, [gameId]);

  // Foreground alerts surface via <AlertOverlay> (driven by the broadcasts feed),
  // which pops over the app instead of the easily-missed list. FCM heads-up
  // notifications cover the backgrounded/locked case.

  function handleLeave() {
    Alert.alert('Leave Game?', 'Your location will stop being tracked.', [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            await stopLocationTracking();
          } catch (err) {
            console.error('stopLocationTracking failed', err);
          } finally {
            router.replace('/(app)/games');
          }
        },
      },
    ]);
  }

  function handleMarkOut() {
    Alert.alert(
      'Mark yourself out?',
      'Honor system (Rule 16): if you were struck, remove yourself. You will stop sharing your location and your time will be locked in. You cannot rejoin this round.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: "I've been killed",
          style: 'destructive',
          onPress: async () => {
            if (!gameId || !user) return;
            try {
              await eliminatePlayer(gameId, user.uid, 'self');
              // Drop a pin where the player fell so the GM can recover their pack
              // and weapons (Rules 19, 20). Best-effort — never block elimination.
              try {
                const pos = await Location.getLastKnownPositionAsync();
                if (pos) {
                  await setDeathLocation(gameId, user.uid, {
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                  });
                }
              } catch {
                /* location unavailable — skip the pin */
              }
              // #94/#99: tracking deliberately CONTINUES after death — no stop here. The
              // dead are the rescue case (a live fix behind their safety alert) and the
              // cleanup crew (#84). The geofence ignores them, so nothing can be tripped.
            } catch (err) {
              Alert.alert('Error', friendlyError(err));
            }
          },
        },
      ]
    );
  }

  /** #84: tick a drop off the recovery list, or untick a mis-tap. Anyone may do either. */
  function toggleDropCleared(m: RevealedMarker) {
    if (!gameId || !user) return;
    setDropCleared(
      gameId,
      m.checkpointId,
      m.clearedAt ? null : { userId: user.uid, displayName: displayName || 'A player' }
    ).catch((err: unknown) => Alert.alert('Error', friendlyError(err)));
  }

  function handleSos() {
    Alert.alert(
      'Send safety alert?',
      // #94: the fan-out is GMs *and* everyone already out of the game — the dead are the
      // standing rescue crew, and saying so is the reassuring part, not a leak (#99 tells
      // players about the spectator role in the tutorial before they ever die).
      'This notifies your Game Masters — and anyone already out of the game, who can come to you — that you need assistance (Rule 22). Use it if you feel unsafe, are injured, or are too cold to continue.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send alert',
          style: 'destructive',
          onPress: () => {
            if (!gameId || !user) return;
            // Fire-and-persist (#4): Firestore offline persistence durably queues the
            // write and delivers it on reconnect, so confirm immediately rather than
            // blocking on the network — a safety alert must feel instant in a dead zone.
            raiseSos(gameId, user.uid).catch((err: Error) => console.error('[SOS] raiseSos failed', err));
            // #94: the same promise alive or dead — the `!out` tracking gate is lifted, so a
            // dead player's position is live too, and the alert is backed by a real fix.
            Alert.alert(
              'Alert sent',
              "The Game Master has been notified and can see your location. If you're offline, it sends the moment you reconnect."
            );
          },
        },
      ]
    );
  }

  /**
   * The safety alert (Rule 22). Deliberately rendered in **every** state a member can be
   * in, alive or out (#94) — a player who has been killed is exactly who is most likely to
   * be alone, cold and walking out of the arena, and the control must not disappear on them.
   */
  function renderSosButton() {
    return (
      <TouchableOpacity style={styles.sosBtn} onPress={handleSos}>
        <Ionicons name="alert-circle-outline" size={18} color={Colors.danger} />
        <Text style={styles.sosText}>Safety alert — I need help</Text>
      </TouchableOpacity>
    );
  }

  // --- Render per phase ---

  /**
   * Recovery (#84): the phase between "someone won" and "the game is closed".
   *
   * The arena is fully lit — every checkpoint is a marker, everyone's position is visible
   * to everyone — because the job is collecting every prop off every site and accounting
   * for every person still in the woods, usually in the dark. Players are *expected* to
   * help if they're still around and never pushed about it; anyone who has gone home was
   * deliberately not notified that this started.
   *
   * **Anyone may mark a drop cleared, not just whoever placed it** — the person standing at
   * the site is the one who knows. A mis-tap in the dark undoes with another tap.
   */
  function renderCleanup() {
    const drops = siteMarkers;
    const cleared = drops.filter((m) => m.clearedAt).length;
    const done = drops.length > 0 && cleared === drops.length;
    return (
      <>
        <View style={styles.cleanupBanner}>
          <Ionicons
            name={done ? 'checkmark-circle' : 'basket-outline'}
            size={18}
            color={done ? Colors.success : Colors.primary}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.cleanupTitle}>
              {winnerName ? `${winnerName} won — recovery` : 'Recovery'}
            </Text>
            <Text style={styles.cleanupSub}>
              {done
                ? 'Every drop is collected. Wait for your GM to close the game.'
                : `${cleared} of ${drops.length} drop${drops.length === 1 ? '' : 's'} collected. Grab anything near you and tick it off.`}
            </Text>
          </View>
        </View>

        <View style={styles.tabBar}>
          <TouchableOpacity style={[styles.tab, playTab === 'map' && styles.activeTab]} onPress={() => setPlayTab('map')}>
            <Ionicons name="map" size={18} color={playTab === 'map' ? Colors.primary : Colors.textSecondary} />
            <Text style={[styles.tabText, playTab === 'map' && styles.activeTabText]}>Map</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, playTab === 'stats' && styles.activeTab]} onPress={() => setPlayTab('stats')}>
            <Ionicons name="list" size={18} color={playTab === 'stats' ? Colors.primary : Colors.textSecondary} />
            <Text style={[styles.tabText, playTab === 'stats' && styles.activeTabText]}>Drops</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.playContent}>
          {playTab === 'map' ? (
            <View style={styles.mapFull}>
              <GameMap
                checkpoints={spectatorCheckpoints}
                playerLocations={visibleSpectatorLocations}
                sosUserIds={sosUserIds}
                markers={siteMarkers}
                rallyPoint={rallyPoint}
                boundary={boundary}
                mapOverlay={mapOverlay}
                showsUserLocation
              />
            </View>
          ) : (
            <ScrollView style={styles.statsBody} contentContainerStyle={styles.statsContent}>
              {drops.length === 0 ? (
                <Text style={styles.locatingText}>No drops to recover.</Text>
              ) : (
                drops.map((m) => {
                  const isCleared = !!m.clearedAt;
                  return (
                    <TouchableOpacity
                      key={m.checkpointId}
                      style={[styles.dropRow, isCleared && styles.dropRowDone]}
                      onPress={() => toggleDropCleared(m)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={isCleared ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={isCleared ? Colors.success : Colors.textSecondary}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.dropName, isCleared && styles.dropNameDone]}>{m.name}</Text>
                        {isCleared && (
                          <Text style={styles.dropBy}>
                            Collected by {m.clearedByName ?? 'someone'}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          )}
        </View>

        {/* #94: the safety alert runs through cleanup — this is exactly when someone is
            alone in the dark at the far end of the arena. */}
        <View style={styles.outBtnWrap}>{renderSosButton()}</View>
      </>
    );
  }

  /**
   * What a dead player sees during play / endgame / cleanup (#89 + #99).
   *
   * Behind the "You died" screen sits **nothing but the spectator map** — no tabs, no
   * stats, no ration panel, no tracking diagnostics. Those all belong to a run that is
   * over. The two things that stay are the safety alert (#94: a dead player is exactly
   * who ends up alone and cold walking out of an arena in the dark) and the message feed,
   * because the GM still needs to be able to reach them and they still get every other
   * player's death.
   *
   * When the GM hasn't enabled the spectator map, or the countdown is still running, the
   * same layout shows a card in place of the map rather than a different screen.
   */
  function renderDead() {
    const countdownMs = spectatorReadyAt == null ? null : spectatorReadyAt - diagNow;
    return (
      <>
        <View style={styles.playContent}>
          {spectatorLive && boundary ? (
            <View style={styles.mapFull}>
              <GameMap
                // Every checkpoint, so a dead player can be sent to deploy or recover a
                // drop. The runbook behind each site stays GM-only — this is the same
                // name/icon/location a marker carries.
                checkpoints={spectatorCheckpoints}
                playerLocations={visibleSpectatorLocations}
                sosUserIds={sosUserIds}
                markers={siteMarkers}
                rallyPoint={rallyPoint}
                boundary={boundary}
                mapOverlay={mapOverlay}
                showsUserLocation
              />
              <View style={styles.spectatorPill}>
                <Ionicons name="eye-outline" size={14} color={Colors.textSecondary} />
                <Text style={styles.spectatorPillText}>Spectating</Text>
              </View>
            </View>
          ) : (
            <View style={[styles.map, styles.mapPlaceholder]}>
              <Ionicons name="eye-off-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.locatingText}>
                {!spectatorOffered
                  ? 'Your Game Master has not opened the arena map to players who are out.'
                  : countdownMs != null && countdownMs > 0
                    ? `The arena map opens in ${formatDuration(countdownMs)}.`
                    : 'Opening the arena map…'}
              </Text>
              {spectatorOffered && countdownMs != null && countdownMs > 0 && (
                <Text style={styles.spectatorWaitSub}>
                  There's a short delay after every death, so nobody can use it to see where
                  the person who just killed them went.
                </Text>
              )}
            </View>
          )}
        </View>

        <View style={[styles.statusCard, styles.outCard]}>
          <View style={[styles.statusDot, styles.inactiveDot]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.statusTitle}>You're out</Text>
            <Text style={styles.statusSub}>
              Wave your red bandana overhead as you exit the arena (Rule 2).
            </Text>
          </View>
        </View>
        {/* #94: still reachable after death — no keyboard guard needed here, since a
            dead player has no ration panel for the bar to float over. */}
        <View style={styles.outBtnWrap}>{renderSosButton()}</View>
      </>
    );
  }

  function renderWaiting() {
    return (
      <ScrollView
        style={styles.waitScroll}
        contentContainerStyle={styles.waitContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.waitIcon}>
          <Ionicons name="hourglass-outline" size={48} color={Colors.primary} />
        </View>
        <Text style={styles.waitTitle}>You're in, {displayName || 'Player'}!</Text>
        <Text style={styles.waitSub}>
          Waiting for your Game Master to start the game. Keep this screen open.
        </Text>
        {phase === 'lobby' && (
          <View style={styles.locReadyRow}>
            <View style={[styles.statusDot, tracking ? styles.activeDot : styles.inactiveDot]} />
            <Text style={styles.locReadyText}>
              {tracking ? "Location ready — you're on your GM's map" : 'Getting your location ready…'}
            </Text>
          </View>
        )}
        <TouchableOpacity style={styles.howToBtn} onPress={() => setShowTutorial(true)}>
          <Ionicons name="help-circle-outline" size={18} color={Colors.primary} />
          <Text style={styles.howToText}>How to play</Text>
        </TouchableOpacity>
        {/* #94: the safety alert is reachable before the game starts too — people are
            already in the arena in the lobby, and the GMs are on the other end of it. */}
        <View style={styles.waitSosWrap}>{renderSosButton()}</View>
        {/* Ask for every permission now, in the lobby, instead of mid-game. */}
        {phase === 'lobby' && <LobbyPermissions rationsEnabled={config.rationsEnabled} />}
        {gameId ? (
          <View style={styles.waitFeed}>
            <BroadcastFeed gameId={gameId} max={10} scroll={false} />
          </View>
        ) : null}
      </ScrollView>
    );
  }

  function renderPlay() {
    // Tracking is "active" but only via the foreground watcher → the player drops
    // off the GM's map when their screen locks. Worth a loud, fixable warning.
    const fgOnly = tracking && diag.path === 'foreground-watch';
    // Background service is running, but Android battery optimization (Doze) will still
    // freeze its location once the screen locks — the player silently goes stale. Only
    // worth flagging on the background path (it's moot if we're foreground-only anyway).
    const batteryThrottled = tracking && diag.path === 'background-service' && diag.batteryOptimized === true;
    return (
      <>
        {/* Tab bar: a full-screen Map view vs. a Stats view (#20). */}
        <View style={styles.tabBar}>
          <TouchableOpacity style={[styles.tab, playTab === 'map' && styles.activeTab]} onPress={() => setPlayTab('map')}>
            <Ionicons name="map" size={18} color={playTab === 'map' ? Colors.primary : Colors.textSecondary} />
            <Text style={[styles.tabText, playTab === 'map' && styles.activeTabText]}>Map</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, playTab === 'stats' && styles.activeTab]} onPress={() => setPlayTab('stats')}>
            <Ionicons name="stats-chart" size={18} color={playTab === 'stats' ? Colors.primary : Colors.textSecondary} />
            <Text style={[styles.tabText, playTab === 'stats' && styles.activeTabText]}>Stats</Text>
          </TouchableOpacity>
        </View>

        {/* #41: final-showdown banner — converge on the GM's rally marker (shown on the map). */}
        {phase === 'endgame' && (
          <View style={styles.showdownBanner}>
            <Ionicons name="flame" size={20} color={Colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.showdownTitle}>Final showdown</Text>
              <Text style={styles.showdownSub}>Converge on the rally point marked on your map.</Text>
            </View>
          </View>
        )}

        {/* Foreground-only warning + tracking error stay pinned above both tabs —
            they're safety-relevant and shouldn't hide behind the Stats tab. */}
        {!out && fgOnly && (
          <View style={styles.warnBanner}>
            <Ionicons name="warning" size={20} color={Colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={styles.warnTitle}>You'll vanish from the map when your screen locks</Text>
              <Text style={styles.warnSub}>
                Location is only shared while this app is open. Set location to “Allow all the
                time” so your Game Master can always see you.
              </Text>
            </View>
            <TouchableOpacity onPress={() => Linking.openSettings()} style={styles.warnBtn}>
              <Text style={styles.warnBtnText}>Fix</Text>
            </TouchableOpacity>
          </View>
        )}
        {!out && !fgOnly && batteryThrottled && (
          <View style={styles.warnBanner}>
            <Ionicons name="battery-charging" size={20} color={Colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={styles.warnTitle}>You may drop off the map when your screen locks</Text>
              <Text style={styles.warnSub}>
                Battery optimization can stop sharing your location in the background. Allow Outdoor
                GM to run unrestricted so your Game Master always sees you.
              </Text>
            </View>
            <TouchableOpacity onPress={() => requestBatteryOptimizationExemption()} style={styles.warnBtn}>
              <Text style={styles.warnBtnText}>Fix</Text>
            </TouchableOpacity>
          </View>
        )}
        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
            {permissionDenied && (
              <TouchableOpacity onPress={() => Linking.openSettings()} style={styles.settingsBtn}>
                <Text style={styles.settingsBtnText}>Open Settings</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        <View style={styles.playContent}>
          {playTab === 'map' ? (
            <View style={styles.mapFull}>
              {boundary ? (
                // Players see the play area, their own blue dot, and any checkpoint
                // markers revealed to them (#48) — never other players or hidden sites.
                <GameMap
                  checkpoints={[]}
                  playerLocations={[]}
                  markers={siteMarkers}
                  newMarkerIds={newMarkerIds}
                  rallyPoint={rallyPoint}
                  boundary={boundary}
                  mapOverlay={mapOverlay}
                  showsUserLocation
                />
              ) : (
                <View style={[styles.map, styles.mapPlaceholder]}>
                  <Ionicons name="map-outline" size={40} color={Colors.textMuted} />
                  <Text style={styles.locatingText}>Your Game Master hasn't set a play area.</Text>
                </View>
              )}
              {/* Always-visible clock pill so the player keeps the timer on the map. */}
              <View style={styles.mapTimePill}>
                <Ionicons name="time-outline" size={15} color={remaining === 0 ? Colors.danger : Colors.text} />
                <Text style={[styles.mapTimeText, remaining === 0 && styles.timerValueDanger]}>
                  {remaining != null ? formatDuration(remaining) : '—'}
                </Text>
              </View>
            </View>
          ) : (
            <ScrollView
              style={styles.statsBody}
              contentContainerStyle={styles.statsContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.timerCard}>
                <Text style={styles.timerLabel}>TIME LEFT</Text>
                <Text style={[styles.timerValue, remaining === 0 && styles.timerValueDanger]}>
                  {remaining != null ? formatDuration(remaining) : '—'}
                </Text>
                <Text style={styles.timerSub}>
                  You've played {elapsed != null ? formatDuration(elapsed) : '0:00'}
                </Text>
              </View>

              {/* #41: the ration loop turns off in the end-game showdown. */}
              {phase === 'play' && config.rationsEnabled && !out && user && (
                <RationPanel
                  gameId={gameId!}
                  player={{ userId: user.uid, displayName: displayName || 'Player' }}
                  startedAt={startedAt}
                  config={config}
                />
              )}

              {!out && (
                <>
                  <TouchableOpacity style={styles.statusCard} activeOpacity={0.7} onPress={() => setShowDiag((v) => !v)}>
                    <View style={[styles.statusDot, !tracking ? styles.inactiveDot : fgOnly ? styles.warnDot : styles.activeDot]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.statusTitle}>
                        {!tracking ? 'Starting tracking…' : fgOnly ? 'Sharing only while app is open' : 'Location Sharing Active'}
                      </Text>
                      <Text style={styles.statusSub}>
                        {!tracking
                          ? 'Requesting location permission…'
                          : fgOnly
                            ? 'Your Game Master loses you when your screen locks. Tap Fix above.'
                            : 'Your Game Master can see you — even when your screen is locked.'}
                      </Text>
                    </View>
                    <Ionicons name={showDiag ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                  {showDiag && (
                    <View style={styles.diagCard}>
                      <Text style={styles.diagRow}>Foreground permission: <Text style={styles.diagVal}>{diag.foreground}</Text></Text>
                      <Text style={styles.diagRow}>Background permission: <Text style={styles.diagVal}>{diag.background}</Text></Text>
                      <Text style={styles.diagRow}>Source: <Text style={styles.diagVal}>{diag.path}</Text></Text>
                      <Text style={styles.diagRow}>Battery optimization: <Text style={styles.diagVal}>
                        {diag.batteryOptimized == null ? 'unknown' : diag.batteryOptimized ? 'on (will throttle when locked)' : 'off'}
                      </Text></Text>
                      <Text style={styles.diagRow}>
                        Last upload: <Text style={styles.diagVal}>
                          {diag.lastUploadAt ? `${Math.round((diagNow - diag.lastUploadAt) / 1000)}s ago` : 'never'}
                        </Text>
                      </Text>
                      {/* Collected since the OS-geofencing change but never rendered, which
                          made "did the wake-up trigger even arm?" unanswerable in the field. */}
                      <Text style={styles.diagRow}>
                        OS geofences: <Text style={styles.diagVal}>
                          {diag.geofencedRegions > 0
                            ? `${diag.geofencedRegions} armed`
                            : `none armed${diag.geofenceError ? ` — ${diag.geofenceError}` : ''}`}
                        </Text>
                      </Text>
                      <Text style={styles.diagRow}>
                        Last geofence wake: <Text style={styles.diagVal}>
                          {diag.lastGeofenceWakeAt
                            ? `${Math.round((diagNow - diag.lastGeofenceWakeAt) / 1000)}s ago`
                            : 'never'}
                        </Text>
                      </Text>
                      {/* #82: the two rows that would have saved the 2026-09-05 A/B.
                          Both builds ship versionName "1.0.0", so Android's own app-info
                          screen cannot tell them apart — this is the only place a tester
                          can confirm which build (and which experiment arm) is running. */}
                      <Text style={styles.diagRow}>Build: <Text style={styles.diagVal}>
                        {Application.nativeBuildVersion ?? 'unknown'}
                      </Text></Text>
                      <Text style={styles.diagRow}>Wake lock: <Text style={styles.diagVal}>
                        {diag.wakeLock ? 'held' : 'not held'}
                      </Text></Text>
                      <Text style={styles.diagRow}>Last error: <Text style={styles.diagVal}>{diag.lastError ?? 'none'}</Text></Text>
                    </View>
                  )}
                </>
              )}

              <Text style={styles.feedHeading}>Messages</Text>
              <BroadcastFeed gameId={gameId!} scroll={false} />
            </ScrollView>
          )}
        </View>

        {/* Pinned action bar — reachable from either tab, sitting below the (now
            scrollable) content so it never overlaps it. Hidden only while the keyboard
            is up so it can't float over the ration-card input; it returns the moment
            the keyboard closes (e.g. as soon as the camera launch dismisses it). */}
        {!keyboardUp ? (
          <View style={styles.outBtnWrap}>
            <Button title="I've been killed" onPress={handleMarkOut} variant="danger" />
            {renderSosButton()}
          </View>
        ) : null}
      </>
    );
  }

  function renderResults() {
    // #81: the sole survivor is crowned. `winnerId` is stamped server-side on game end,
    // for both the auto (last-death) and manual (GM End Game) paths.
    const iWon = !!winnerId && winnerId === user?.uid;
    return (
      <View style={styles.centerBody}>
        <View style={styles.waitIcon}>
          <Ionicons name={iWon ? 'trophy' : 'flag'} size={44} color={Colors.primary} />
        </View>
        <Text style={styles.resultLabel}>{iWon ? 'YOU WON!' : out ? 'YOU TAPPED OUT' : 'GAME OVER'}</Text>
        <Text style={styles.resultTime}>{elapsed != null ? formatDuration(elapsed) : '—'}</Text>
        {iWon ? (
          <Text style={styles.waitSub}>Last tribute standing. You survived them all, {displayName || 'champion'}. 🏆</Text>
        ) : winnerName ? (
          <Text style={styles.waitSub}>{winnerName} was the last one standing. You played {elapsed != null ? formatDuration(elapsed) : '—'}.</Text>
        ) : (
          <Text style={styles.waitSub}>That's how long you played, {displayName || 'Player'}. Nice work!</Text>
        )}
        {(media?.youtubeUrl || media?.photosAlbumUrl) && (
          <View style={{ alignSelf: 'stretch', marginTop: 16 }}>
            <PostGameMedia media={media} />
          </View>
        )}
        <View style={{ height: 24 }} />
        <Button title="Back to My Games" onPress={() => router.replace('/(app)/games')} />
      </View>
    );
  }

  const isWaiting = phase === 'setup' || phase === 'lobby';

  return (
    <BroadcastsProvider gameId={gameId ?? ''}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <View style={styles.titleRow}>
              <Text style={styles.gameName} numberOfLines={1}>{gameName || 'Game'}</Text>
              {practice && <Text style={styles.practiceTag}>PRACTICE</Text>}
            </View>
            <Text style={styles.role}>Player · {displayName || 'Player'}</Text>
          </View>
          {phase !== 'results' && (
            <TouchableOpacity onPress={handleLeave} style={styles.leaveBtn}>
              <Ionicons name="exit-outline" size={20} color={Colors.danger} />
              <Text style={styles.leaveText}>Leave</Text>
            </TouchableOpacity>
          )}
        </View>

        {isWaiting && renderWaiting()}
        {/* #84: recovery is its own screen, and it is the SAME screen alive or dead —
            everyone left in the arena has the same job, so there is nothing to branch on. */}
        {phase === 'cleanup' && renderCleanup()}
        {/* #89: a dead player gets their own screen, not the living one with the action
            bar swapped out. */}
        {(phase === 'play' || phase === 'endgame') && (out ? renderDead() : renderPlay())}
        {phase === 'results' && renderResults()}

        {gameId && phase !== 'results' && (
          <AlertOverlay gameId={gameId} suppressIds={suppressBroadcastIds} />
        )}
        {/* #89: full-screen and blocking, shown once per game per device. Rendered last so
            it sits over everything, including the alert overlay. */}
        {gameId && <DiedOverlay gameId={gameId} out={out} />}
        <Tutorial visible={showTutorial} onDone={dismissTutorial} rules={rules} spectatorMap={config.spectatorMapEnabled === true} />
      </SafeAreaView>
    </BroadcastsProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gameName: { fontSize: 20, fontWeight: '800', color: Colors.text, flexShrink: 1 },
  practiceTag: {
    fontSize: 9, fontWeight: '800', color: Colors.secondary, letterSpacing: 1,
    borderWidth: 1, borderColor: Colors.secondary, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1,
  },
  role: { fontSize: 13, color: Colors.primary, marginTop: 2 },
  leaveBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  leaveText: { color: Colors.danger, fontSize: 14, fontWeight: '600' },

  // Waiting / results
  centerBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  waitScroll: { flex: 1 },
  waitContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 24, gap: 12 },
  waitIcon: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border, marginBottom: 8,
  },
  waitTitle: { fontSize: 22, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  waitSub: { fontSize: 15, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  waitFeed: { alignSelf: 'stretch', marginTop: 16 },
  locReadyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  locReadyText: { color: Colors.textSecondary, fontSize: 13 },
  howToBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, padding: 8 },
  howToText: { color: Colors.primary, fontSize: 15, fontWeight: '600' },
  resultLabel: { color: Colors.textSecondary, fontWeight: '800', letterSpacing: 2, fontSize: 12, marginTop: 8 },
  resultTime: { color: Colors.text, fontSize: 52, fontWeight: '800', fontVariant: ['tabular-nums'] },

  // Play timer
  timerCard: {
    marginHorizontal: 16, marginTop: 4, alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: 12, paddingVertical: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  timerLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '700', letterSpacing: 1.5 },
  timerValue: { fontSize: 34, fontWeight: '800', color: Colors.text, fontVariant: ['tabular-nums'] },
  timerValueDanger: { color: Colors.danger },
  timerSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  // Map / Stats tabs (#20)
  tabBar: {
    flexDirection: 'row', marginHorizontal: 16, marginTop: 4, marginBottom: 8,
    backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
  },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  activeTab: { backgroundColor: Colors.surfaceElevated },
  tabText: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary },
  activeTabText: { color: Colors.primary },
  playContent: { flex: 1 },
  statsBody: { flex: 1 },
  statsContent: { paddingBottom: 12 },
  feedHeading: { fontSize: 11, color: Colors.textSecondary, fontWeight: '700', letterSpacing: 1.5, marginHorizontal: 16, marginBottom: 6 },

  mapFull: { flex: 1, marginHorizontal: 16, marginBottom: 8, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  mapTimePill: {
    position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.surface + 'E6', borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  mapTimeText: { fontSize: 16, fontWeight: '800', color: Colors.text, fontVariant: ['tabular-nums'] },
  map: { flex: 1 },
  mapPlaceholder: { backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', gap: 8 },
  locatingText: { color: Colors.textMuted, fontSize: 14, textAlign: 'center', paddingHorizontal: 16 },
  // #99: the spectator badge — a quiet reminder that this map is a view, not a position
  // anyone else can see you at.
  spectatorPill: {
    position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.surface + 'E6', borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  spectatorPillText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  spectatorWaitSub: {
    color: Colors.textMuted, fontSize: 12, textAlign: 'center', paddingHorizontal: 32, lineHeight: 18,
  },
  // #84: recovery — a calmer register than play. The game is decided; this is the walk-out.
  cleanupBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginBottom: 10, paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 10, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  cleanupTitle: { color: Colors.text, fontSize: 14, fontWeight: '800' },
  cleanupSub: { color: Colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 2 },
  dropRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface, borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  dropRowDone: { borderColor: Colors.success, opacity: 0.75 },
  dropName: { color: Colors.text, fontSize: 15, fontWeight: '700' },
  dropNameDone: { textDecorationLine: 'line-through', color: Colors.textSecondary },
  dropBy: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },

  statusCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginBottom: 12,
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: Colors.border,
  },
  outCard: { borderColor: Colors.danger, marginTop: 4 },
  statusDot: { width: 14, height: 14, borderRadius: 7 },
  activeDot: { backgroundColor: Colors.success },
  inactiveDot: { backgroundColor: Colors.textMuted },
  warnDot: { backgroundColor: Colors.warning },
  warnBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: Colors.warning + '22', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.warning,
  },
  showdownBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: Colors.primary + '22', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.primary,
  },
  showdownTitle: { fontSize: 14, fontWeight: '800', color: Colors.text },
  showdownSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 3, lineHeight: 17 },
  warnTitle: { fontSize: 14, fontWeight: '800', color: Colors.text },
  warnSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 3, lineHeight: 17 },
  warnBtn: {
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8,
    backgroundColor: Colors.warning,
  },
  warnBtnText: { color: Colors.black, fontSize: 14, fontWeight: '800' },
  statusTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  statusSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  diagCard: {
    marginHorizontal: 16, marginTop: -4, marginBottom: 12,
    backgroundColor: Colors.surface, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.border, gap: 4,
  },
  diagRow: { fontSize: 12, color: Colors.textSecondary, fontVariant: ['tabular-nums'] },
  diagVal: { color: Colors.text, fontWeight: '600' },
  errorBanner: {
    marginHorizontal: 16, marginBottom: 12, backgroundColor: Colors.danger + '22',
    borderRadius: 8, padding: 12, borderWidth: 1, borderColor: Colors.danger,
  },
  errorText: { color: Colors.danger, fontSize: 13, marginBottom: 8 },
  settingsBtn: {
    alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8,
    borderWidth: 1, borderColor: Colors.danger,
  },
  settingsBtnText: { color: Colors.danger, fontSize: 13, fontWeight: '600' },
  waitSosWrap: { alignSelf: 'stretch', marginTop: 4 },
  outBtnWrap: {
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, gap: 10,
    backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  sosBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: Colors.danger,
    backgroundColor: Colors.background,
  },
  sosText: { color: Colors.danger, fontSize: 14, fontWeight: '600' },
});
