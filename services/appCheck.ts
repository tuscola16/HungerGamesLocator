import { getApp } from '@react-native-firebase/app';
import { initializeAppCheck, ReactNativeFirebaseAppCheckProvider } from '@react-native-firebase/app-check';

// App Check attests that requests come from a genuine build of this app, not a
// script wielding the (publicly shipped) Firebase config. Tokens start flowing
// as soon as this runs; *enforcement* is a separate step you turn on in the
// Firebase console (App Check → APIs → Firestore/Functions) once you've
// confirmed real builds get tokens. Until then this is non-fatal: if a provider
// can't attest, requests still succeed (because enforcement is off), so wiring
// it up early can't lock anyone out.
//
// Dev builds use the `debug` provider, which prints a debug token to the native
// log on first launch — register that token in the console (App Check → Manage
// debug tokens) so the emulator/dev client can attest.
//
// --- Why the provider isn't just `__DEV__` (fixed 2026-09-06) ---
//
// `__DEV__` is false in a `preview` EAS build, so a sideloaded APK was selecting
// `playIntegrity`. Play Integrity can only return a verdict for an app the Play Store
// actually installed; an APK handed round by link — which is how every field test has
// been distributed — gets no verdict, and the provider hands Firebase an unusable token
// rather than none at all. Stonedam Day 2 logged the result on every single ration
// submission:
//
//   Failed to validate AppCheck token … Decoding App Check token failed. Make sure you
//   passed the entire string JWT which represents the Firebase App Check token.
//   {"verifications":{"auth":"VALID","app":"INVALID"}}
//
// Harmless today only because enforcement is off. The moment anyone turns enforcement on
// in the console it becomes a total outage for sideloaded builds — every callable, for
// every player, mid-game. Attestation is also *supposed* to be the thing standing between
// the publicly-shipped Firebase config and a scripted `submitRation`, and it has never
// once worked in the field, so the protection was illusory as well.
//
// The channel decides now: `production` (Play/App Store, real attestation available)
// attests for real; anything else uses `debug`, whose token is registered once per test
// device under App Check → Manage debug tokens. Override with
// EXPO_PUBLIC_APP_CHECK_PROVIDER=attest|debug|off when testing a specific arm.
type AppCheckMode = 'attest' | 'debug' | 'off';

function resolveMode(): AppCheckMode {
  const override = process.env.EXPO_PUBLIC_APP_CHECK_PROVIDER;
  if (override === 'attest' || override === 'debug' || override === 'off') return override;
  if (__DEV__) return 'debug';
  // `EXPO_PUBLIC_EAS_CHANNEL` is set by EAS from the build profile's `channel`. Absent in
  // a local release build, which is treated as non-production — the conservative reading,
  // since a token that can't be minted is worse than one that isn't attested.
  return process.env.EXPO_PUBLIC_EAS_CHANNEL === 'production' ? 'attest' : 'debug';
}

let initialized = false;

export async function initAppCheck(): Promise<void> {
  if (initialized) return;
  initialized = true;
  const mode = resolveMode();
  // Explicitly off: don't initialize at all, so nothing mints a token the backend will
  // reject. Distinct from failing to attest — no token reads as "unattested", while a
  // malformed one reads as "invalid", and only the latter fills the logs with errors.
  if (mode === 'off') {
    console.warn('[AppCheck] disabled by EXPO_PUBLIC_APP_CHECK_PROVIDER=off');
    return;
  }
  try {
    const provider = new ReactNativeFirebaseAppCheckProvider();
    provider.configure({
      android: {
        provider: mode === 'attest' ? 'playIntegrity' : 'debug',
      },
      apple: {
        provider: mode === 'attest' ? 'appAttestWithDeviceCheckFallback' : 'debug',
      },
    });
    initializeAppCheck(getApp(), {
      provider,
      isTokenAutoRefreshEnabled: true,
    });
  } catch (err) {
    // Never let App Check setup crash app startup. Worst case (until enforcement
    // is enabled) requests proceed without an attestation token.
    console.warn('[AppCheck] initialization failed', err);
  }
}
