import ExpoModulesCore

/**
 * iOS half of the #82 native shims — deliberately inert.
 *
 * Neither capability is needed here. iOS has no user-acquirable CPU wake lock; the
 * `location` background mode already keeps the app scheduled. And step counting on iOS
 * goes through expo-sensors' `Pedometer.getStepCountAsync(start, end)`, which queries
 * CMPedometer's 7-day historic cache and therefore already returns counts accrued while
 * the app was suspended — the exact problem the Android shim exists to solve.
 *
 * This target exists so the module links cleanly on iOS builds. `getStepCount` resolves
 * `nil`, which every caller already treats as "unknown, don't judge".
 */
public class OutdoorNativeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("OutdoorNative")

    AsyncFunction("getStepCount") { () -> Int? in
      return nil
    }

    // NOTE: `getGpsFix` is deliberately NOT defined on iOS.
    //
    // iOS has no equivalent of Android's provider split — CoreLocation gives you one
    // fused stream with no way to demand satellites only — so the function would be a
    // permanent stub. Defining one meant returning a dictionary, and a `[String: Any]`
    // return is not a shape the Expo Swift bridge is documented to convert; risking an
    // iOS compile failure for a function that can only ever return nil is a bad trade,
    // especially when it can't be verified without burning an iOS build.
    //
    // Calling a function the native module doesn't define throws, which
    // `getNativeGpsFix` already catches and turns into `null` — exactly the "no satellite
    // fix available" path, which then falls back to the expo-location fix. That is the
    // correct iOS behaviour, reached through the error path by design rather than by
    // accident. See modules/outdoor-native/index.ts.

    Function("acquireWakeLock") { (_: Double) -> Bool in
      return false
    }

    Function("releaseWakeLock") { () -> Bool in
      return true
    }

    Function("isWakeLockHeld") { () -> Bool in
      return false
    }
  }
}
