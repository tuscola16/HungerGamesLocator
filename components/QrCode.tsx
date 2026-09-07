import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { qrMatrix } from '@/common/qr';

/**
 * A QR code, drawn as plain `<View>`s (ROADMAP #92).
 *
 * **No native module.** Every React Native QR component is built on `react-native-svg`, and
 * adding a native dependency to this project's iOS pod configuration is exactly what the
 * CLAUDE.md gotchas warn against — the `useFrameworks: "static"` + `disableSPM: true` pair
 * holding that build together has already cost two rounds of debugging. A QR is a grid of
 * squares, and React Native can draw squares unaided, so the matrix is computed in pure
 * TypeScript (`common/qr.ts`) and rendered here.
 *
 * **Runs, not modules.** A 29×29 code is 841 cells; laying out 841 Views to show a join code
 * would be silly. Each row is instead collapsed into its runs of same-coloured modules —
 * typically eight or nine per row — so a version-3 code costs a few hundred Views rather
 * than a thousand, and the light runs are drawn as transparent gaps.
 *
 * The quiet zone is the white padding around the grid: scanners need it, and a code flush
 * against a dark card reads badly or not at all.
 */
export function QrCode({
  value,
  size = 200,
}: {
  /** The payload. For the join QR this is `outdoorgm://join?code=ABCDEF`. */
  value: string;
  /** Rendered edge length in points, quiet zone included. */
  size?: number;
}) {
  const matrix = useMemo(() => {
    try {
      return qrMatrix(value);
    } catch {
      // A payload the encoder can't represent must not take the screen down with it — the
      // GM can always read the code aloud, which is what they did before #92.
      return null;
    }
  }, [value]);

  if (!matrix) {
    return (
      <View style={[styles.fallback, { width: size, height: size }]}>
        <Text style={styles.fallbackText}>Can't draw a code for this.</Text>
      </View>
    );
  }

  const modules = matrix.length;
  const QUIET = 4; // modules of margin, the scanner-required minimum
  const cell = size / (modules + QUIET * 2);
  const pad = cell * QUIET;

  return (
    <View style={[styles.frame, { width: size, height: size, padding: pad }]}>
      {matrix.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', height: cell }}>
          {collapseRuns(row).map((run, i) => (
            <View
              key={i}
              style={{
                width: cell * run.length,
                height: cell,
                backgroundColor: run.dark ? '#000000' : 'transparent',
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

/** Collapse a row of modules into runs of the same colour. */
function collapseRuns(row: boolean[]): { dark: boolean; length: number }[] {
  const runs: { dark: boolean; length: number }[] = [];
  for (const dark of row) {
    const last = runs[runs.length - 1];
    if (last && last.dark === dark) last.length++;
    else runs.push({ dark, length: 1 });
  }
  return runs;
}

const styles = StyleSheet.create({
  // White, always — a QR on a dark background is a QR most scanners refuse.
  frame: { backgroundColor: '#FFFFFF', borderRadius: 6 },
  fallback: {
    backgroundColor: Colors.surface, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center', padding: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  fallbackText: { color: Colors.textMuted, fontSize: 12, textAlign: 'center' },
});
