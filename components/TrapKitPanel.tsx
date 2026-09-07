import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { Button } from '@/components/ui/Button';
import { armPlayerTrap } from '@/services/gameService';
import { friendlyError } from '@/services/errorUtils';
import type { RosterEntry } from '@/types';

/**
 * Arming a player trap kit (ROADMAP #97).
 *
 * A player finds a physical card in the field. It names a trap the GM pre-set; entering its
 * code here, while standing near the site they want it at, deploys it. The player chooses
 * only **where** (by standing there — the server resolves the site from their own last fix)
 * and **who is spared**.
 *
 * Everything else stays the GM's: the effect, the text, how many it can catch, whether
 * springing it reveals the site. No player-authored text ever reaches another player, which
 * is what keeps Rule 23 intact while players aim effects at each other.
 *
 * **Exclusions only — there is no include list.** You name who is safe; everyone else is
 * fair game. That is what makes warning your friends out of band actually mean something.
 *
 * The panel is deliberately quiet afterwards. It confirms the site and nothing more: not
 * whether it fires, not on whom. With a real trap you would have to be there to see it.
 */
export function TrapKitPanel({
  gameId,
  roster,
  selfId,
}: {
  gameId: string;
  /** #88's living-players projection — the only roster a player may read. */
  roster: RosterEntry[];
  selfId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [spared, setSpared] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // You are always spared by your own trap, so listing yourself would be noise.
  const others = roster.filter((r) => r.userId !== selfId);
  const toggle = (id: string) =>
    setSpared((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  async function arm() {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      Alert.alert('Enter the code', 'Type the code printed on the kit.');
      return;
    }
    setBusy(true);
    try {
      const { checkpointName } = await armPlayerTrap(gameId, trimmed, spared);
      setCode('');
      setSpared([]);
      setOpen(false);
      Alert.alert(
        'Trap set',
        `It's live at ${checkpointName}. You won't be told if it goes off, or who walked into it — keep the card.`
      );
    } catch (err) {
      Alert.alert('Could not set the trap', friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <TouchableOpacity style={styles.openBtn} onPress={() => setOpen(true)} activeOpacity={0.75}>
        <Ionicons name="alert-circle-outline" size={18} color={Colors.secondary} />
        <Text style={styles.openText}>I found a trap kit</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Set a trap</Text>
        <TouchableOpacity onPress={() => setOpen(false)} hitSlop={8}>
          <Ionicons name="close" size={20} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>
      <Text style={styles.hint}>
        Stand where you want it, then enter the code from the card. It arms immediately, and
        it stays armed — even after you're out.
      </Text>

      <TextInput
        value={code}
        onChangeText={(t) => setCode(t.toUpperCase())}
        placeholder="KIT CODE"
        placeholderTextColor={Colors.textMuted}
        autoCapitalize="characters"
        autoCorrect={false}
        style={styles.input}
      />

      <Text style={styles.sectionLabel}>Spare anyone?</Text>
      <Text style={styles.hint}>
        Anyone you tick walks past it safely and never knows it was there. Everyone else is
        fair game. You're always safe from your own.
      </Text>
      {others.length === 0 ? (
        <Text style={styles.hint}>Nobody else is in the field right now.</Text>
      ) : (
        others.map((r) => {
          const on = spared.includes(r.userId);
          return (
            <TouchableOpacity key={r.userId} style={styles.sparedRow} onPress={() => toggle(r.userId)}>
              <Ionicons
                name={on ? 'checkbox' : 'square-outline'}
                size={20}
                color={on ? Colors.success : Colors.textSecondary}
              />
              <Text style={styles.sparedName}>{r.displayName}</Text>
            </TouchableOpacity>
          );
        })
      )}

      <Button title="Set the trap" onPress={arm} loading={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  openBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  openText: { color: Colors.secondary, fontSize: 14, fontWeight: '700' },
  card: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, gap: 10,
    borderWidth: 1, borderColor: Colors.secondary,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: Colors.text, fontSize: 16, fontWeight: '800' },
  hint: { color: Colors.textMuted, fontSize: 12, lineHeight: 18 },
  sectionLabel: {
    color: Colors.textSecondary, fontSize: 11, fontWeight: '700',
    letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 4,
  },
  input: {
    backgroundColor: Colors.background, borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 12,
    fontSize: 20, fontWeight: '800', letterSpacing: 4, textAlign: 'center', color: Colors.text,
  },
  sparedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  sparedName: { color: Colors.text, fontSize: 14, fontWeight: '600' },
});
