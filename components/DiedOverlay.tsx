import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/colors';

/**
 * The "You died" screen (ROADMAP #89).
 *
 * Before this, a dead player got the same chrome as a living one — the map, the tabs, the
 * stats — with a muted grey "You're out" card swapped in where the action bar had been.
 * Worse, the death toll is broadcast to *all* players (`targetPlayerId: null`), so
 * `AlertOverlay` popped "**Alex** has fallen — 3 tributes remain" in Alex's own face.
 *
 * This replaces that moment with something that reads like what it is. It is **full-screen
 * and blocks interaction until dismissed**, and it is the **same screen regardless of
 * cause** — self-reported, GM elimination and starvation all read identically, because from
 * inside the game they mean one thing.
 *
 * What it deliberately does not do:
 *  - It does **not** suppress other players' death notifications. A dead player keeps
 *    receiving those; only their *own* toll is withheld (by its deterministic
 *    `{userId}_death` id, #26), and this screen is what replaces it.
 *  - It does **not** carry stats, a summary or a "what now". Behind it sits nothing but the
 *    #99 spectator map.
 *
 * Shown **once per game per device**: the dismissal is persisted, so reopening the app
 * hours later doesn't re-announce a death the player has long since processed.
 */
export function DiedOverlay({ gameId, out }: { gameId: string; out: boolean }) {
  // `loadedFor` is the storage key the flag belongs to, so a game switch reads as "not
  // loaded yet" during render instead of needing an effect to null the state out. Until
  // they agree nothing renders, so the screen can never flash up on a player who dismissed
  // it in a previous session.
  const [state, setState] = useState<{ loadedFor: string | null; dismissed: boolean }>({
    loadedFor: null,
    dismissed: false,
  });
  const storageKey = `died_seen_${gameId}`;

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(storageKey)
      .then((v) => { if (!cancelled) setState({ loadedFor: storageKey, dismissed: v === '1' }); })
      // Fail *shown*, not hidden: a storage error should not swallow the one screen that
      // tells a player what just happened to them. The worst case is seeing it twice.
      .catch(() => { if (!cancelled) setState({ loadedFor: storageKey, dismissed: false }); });
    return () => { cancelled = true; };
  }, [storageKey]);

  const visible = out && state.loadedFor === storageKey && !state.dismissed;

  useEffect(() => {
    if (!visible) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }, [visible]);

  function dismiss() {
    setState({ loadedFor: storageKey, dismissed: true });
    AsyncStorage.setItem(storageKey, '1').catch(() => {});
  }

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      statusBarTranslucent
      // Blocks interaction until dismissed — including the Android back button, which
      // would otherwise be a way past it.
      onRequestClose={() => {}}
    >
      <View style={styles.root}>
        <Text style={styles.skull}>☠️</Text>
        <Text style={styles.title}>You died</Text>
        <Text style={styles.sub}>
          Your run is over. Wave your red bandana overhead as you leave the arena (Rule 2).
        </Text>
        <Text style={styles.note}>
          You can still raise a safety alert at any time — and you'll keep hearing what
          happens to everyone else.
        </Text>
        <TouchableOpacity style={styles.btn} onPress={dismiss} activeOpacity={0.85}>
          <Ionicons name="arrow-forward" size={18} color={Colors.background} />
          <Text style={styles.btnText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 14,
  },
  skull: { fontSize: 72 },
  title: {
    fontSize: 40,
    fontWeight: '900',
    color: Colors.danger,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  sub: { fontSize: 16, color: Colors.text, textAlign: 'center', lineHeight: 23 },
  note: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    marginTop: 18,
  },
  btnText: { color: Colors.background, fontSize: 16, fontWeight: '800' },
});
