import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { formatDuration } from '@/hooks/useElapsed';
import type { RosterEntry } from '@/types';

/**
 * The roster a player is allowed to see (ROADMAP #88) — **names only**, no contact
 * details, no districts, no locations. It reads the `roster` projection, which is the only
 * roster a player can access; member docs stay GM-only because they carry email and
 * fcmToken.
 *
 * Two modes, matching the projection:
 *  - **during play** — the living. A dead player *leaves* the list rather than appearing
 *    struck through, so it never becomes a scoreboard of who is left to hunt. That's
 *    enforced server-side by deleting the row, not by this component hiding it.
 *  - **after the game** — everyone who played, ordered by who lasted longest. That ordering
 *    is the results standing, and it includes players who were promoted to GM mid-game
 *    (#91), whose frozen run would otherwise have been erased along with their role.
 */
export function PlayerRoster({
  roster,
  standings,
  selfId,
  winnerId,
}: {
  roster: RosterEntry[];
  /** Post-game/cleanup mode: show times and order by survival rather than by name. */
  standings?: boolean;
  /** Highlight the viewer's own row. */
  selfId?: string;
  /** #81: the last tribute standing, for the crown. */
  winnerId?: string | null;
}) {
  const rows = [...roster].sort((a, b) => {
    if (standings) {
      // Longest run first. A missing `playedMs` (the game never started, or a legacy row)
      // sorts last rather than to the top, which a plain numeric compare would do.
      const am = a.playedMs ?? -1;
      const bm = b.playedMs ?? -1;
      if (am !== bm) return bm - am;
    }
    return a.displayName.localeCompare(b.displayName);
  });

  if (rows.length === 0) {
    return (
      <Text style={styles.empty}>
        {standings ? 'No players to show.' : 'Nobody else is in the field yet.'}
      </Text>
    );
  }

  return (
    <View style={styles.list}>
      {rows.map((r, i) => {
        const isSelf = r.userId === selfId;
        const won = !!winnerId && r.userId === winnerId;
        return (
          <View key={r.userId} style={[styles.row, isSelf && styles.rowSelf]}>
            {standings && <Text style={styles.rank}>{i + 1}</Text>}
            <Text style={[styles.name, isSelf && styles.nameSelf]} numberOfLines={1}>
              {r.displayName}{isSelf ? ' (you)' : ''}
            </Text>
            {won && <Ionicons name="trophy" size={15} color={Colors.primary} />}
            {/* An open safety alert is the one piece of state worth showing a player about
                another player — #94 makes the field the rescue crew. */}
            {r.sos && <Ionicons name="alert-circle" size={15} color={Colors.danger} />}
            {standings && (
              <Text style={styles.time}>
                {r.playedMs != null ? formatDuration(r.playedMs) : '—'}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 6 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.surface, borderRadius: 8,
    paddingVertical: 10, paddingHorizontal: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  rowSelf: { borderColor: Colors.primary },
  rank: {
    color: Colors.textMuted, fontSize: 12, fontWeight: '800',
    minWidth: 18, fontVariant: ['tabular-nums'],
  },
  name: { flex: 1, color: Colors.text, fontSize: 14, fontWeight: '600' },
  nameSelf: { color: Colors.primary },
  time: { color: Colors.textSecondary, fontSize: 13, fontVariant: ['tabular-nums'] },
  empty: { color: Colors.textMuted, fontSize: 13 },
});
