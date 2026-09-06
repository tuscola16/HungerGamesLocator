import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useGame } from '@/context/GameContext';
import { Colors } from '@/constants/colors';
import { PlayerActionSheet, DistrictEditorModal } from '@/components/PlayerActionSheet';
import { useNow } from '@/hooks/useNow';
import { stalenessLevel, stalenessColor, formatAgo, isLowBattery, formatBattery } from '@/services/locationStatus';
import type { GameMember } from '@/types';

export default function PlayersScreen() {
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
  const { members, playerLocations, phase, loadGame } = useGame();
  const router = useRouter();
  const now = useNow(10000);

  // #85: the per-player action sheet and the district editor both live in
  // <PlayerActionSheet> now, shared with the player detail screen (#85.2). This screen
  // owns only *which* member each is open for — the district editor because the inline
  // district chip opens it directly, without going through the sheet.
  const [districtEditor, setDistrictEditor] = useState<GameMember | null>(null);
  const [actionMenu, setActionMenu] = useState<GameMember | null>(null);

  // userId → last location fix (ms), for the stale-fix indicator. Outdoor GM is the
  // only tracker now, so a silent drop-off needs to be visible to the GM.
  const lastFixByUser = new Map<string, number>();
  // userId → last reported battery level (0–1), for the low-battery flag (#35).
  const batteryByUser = new Map<string, number>();
  for (const loc of playerLocations) {
    const ms = loc.updatedAt?.toMillis?.();
    if (ms) lastFixByUser.set(loc.userId, ms);
    if (typeof loc.battery === 'number') batteryByUser.set(loc.userId, loc.battery);
  }

  // Ensure the shared game subscription is active. We intentionally do NOT
  // clearGame() on unmount: the GM screen underneath stays mounted and relies on
  // the same singleton context, so clearing here would blank it out on return.
  useEffect(() => {
    if (gameId) loadGame(gameId, 'gm');
  }, [gameId]);

  function openDistrictEditor(member: GameMember) {
    setDistrictEditor(member);
  }

  function renderMember({ item }: { item: GameMember }) {
    const isGM = item.role === 'gm';
    const isOut = !!item.out;
    // SOS state (#5): live & escalating until a GM acks (sosAckAt). Ack stops the
    // escalation but keeps the SOS open; Clear stands it down.
    const sosAcked = !!item.sosAckAt;
    // Stale-fix indicator: only meaningful for a living player during active play
    // (out players intentionally stop reporting; GMs aren't tracked).
    const showFix = !isGM && !isOut && phase === 'play';
    const hasDistrict = item.district != null && String(item.district).trim() !== '';
    const fixMs = lastFixByUser.get(item.userId) ?? null;
    const level = showFix ? stalenessLevel(fixMs == null ? null : now - fixMs) : 'none';
    // Low-battery flag (#35): a living player about to go dark. Only while tracking (showFix).
    const batteryLevel = batteryByUser.get(item.userId);
    const lowBattery = showFix && isLowBattery(batteryLevel);
    return (
      <View style={[styles.row, item.sos ? (sosAcked ? styles.sosAckedRow : styles.sosRow) : null]}>
        <View style={[styles.avatar, isGM ? styles.gmAvatar : styles.playerAvatar, isOut ? styles.outAvatar : null]}>
          <Text style={styles.avatarText}>
            {item.displayName.charAt(0).toUpperCase()}
          </Text>
        </View>

        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, isOut ? styles.outName : null]}>{item.displayName}</Text>
            {!isGM && (
              <TouchableOpacity
                onPress={() => openDistrictEditor(item)}
                style={[styles.districtChip, hasDistrict ? styles.districtChipSet : null]}
              >
                <Text style={[styles.districtChipText, hasDistrict ? styles.districtChipTextSet : null]}>
                  {hasDistrict ? `District ${item.district}` : '+ District'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          {item.sos ? (
            <Text style={[styles.sosLabel, sosAcked && styles.sosAckedLabel]}>
              {sosAcked
                ? '🆘 Acknowledged · stand down when resolved'
                : '🆘 Needs assistance — open ⋯ to acknowledge'}
            </Text>
          ) : !isGM && !isOut && item.outOfBounds ? (
            <Text style={styles.oobLabel}>🚧 Outside the play area</Text>
          ) : showFix ? (
            <View style={styles.fixRow}>
              <View style={[styles.fixDot, { backgroundColor: stalenessColor(level) }]} />
              <Text style={[styles.fixText, level === 'stale' && styles.fixTextStale]}>
                {fixMs == null ? 'No signal yet' : `Last fix ${formatAgo(now - fixMs)}`}
              </Text>
              {lowBattery && (
                <View style={styles.battChip}>
                  <Ionicons name="battery-dead-outline" size={12} color={Colors.danger} />
                  <Text style={styles.battText}>
                    {batteryLevel != null ? formatBattery(batteryLevel) : 'Low'}
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <Text style={styles.email}>{item.email}</Text>
          )}
        </View>

        {isOut ? (
          <View style={[styles.badge, styles.deadBadge]}>
            <Text style={styles.badgeText}>DEAD</Text>
          </View>
        ) : (
          <View style={[styles.badge, isGM ? styles.gmBadge : styles.playerBadge]}>
            <Text style={styles.badgeText}>{isGM ? 'GM' : 'PLAYER'}</Text>
          </View>
        )}

        {/* #85: every action lives behind this. The row keeps only status — badge,
            SOS/stale/battery line — so nothing destructive is one stray tap away. */}
        <TouchableOpacity onPress={() => setActionMenu(item)} style={styles.iconBtn}>
          <Ionicons name="ellipsis-vertical" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>
    );
  }

  // Tributes sharing a district sit adjacent so the GM can see the pairing at a
  // glance; unassigned players ('~' sorts last). Numeric collation keeps "2" before "10".
  const districtKey = (m: GameMember) =>
    m.district != null && String(m.district).trim() !== '' ? String(m.district).trim() : '~';
  const gms = members.filter((m) => m.role === 'gm');
  const players = members
    .filter((m) => m.role === 'player')
    .sort((a, b) => {
      const ka = districtKey(a);
      const kb = districtKey(b);
      if (ka !== kb) return ka.localeCompare(kb, undefined, { numeric: true });
      return a.displayName.localeCompare(b.displayName);
    });
  const livingPlayers = players.filter((m) => !m.out).length;
  const districtCount = new Set(players.map(districtKey).filter((k) => k !== '~')).size;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Players</Text>
        <Text style={styles.count}>{players.length} player{players.length !== 1 ? 's' : ''}</Text>
      </View>

      <FlatList
        data={[...gms, ...players]}
        keyExtractor={(item) => item.userId}
        contentContainerStyle={styles.list}
        renderItem={renderMember}
        ListHeaderComponent={
          members.length > 0 ? (
            <View style={styles.legend}>
              <Text style={styles.legendText}>
                {players.length} player{players.length !== 1 ? 's' : ''} · {livingPlayers} alive{districtCount > 0 ? ` · ${districtCount} district${districtCount !== 1 ? 's' : ''}` : ''}
              </Text>
              <Text style={styles.legendGm}>
                Staff: {gms.length} GM{gms.length !== 1 ? 's' : ''}
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No members yet.{'\n'}Share the game code to invite players.</Text>
          </View>
        }
      />

      {/* #85: every per-player action, behind one ⋯ button. Shared verbatim with the
          player detail screen (#85.2) so the two can never drift apart. */}
      <PlayerActionSheet
        gameId={gameId!}
        members={members}
        phase={phase}
        target={actionMenu}
        onClose={() => setActionMenu(null)}
        onOpenDetail={(userId) => router.push(`/(app)/gm/${gameId}/player/${userId}`)}
        onEditDistrict={openDistrictEditor}
      />

      <DistrictEditorModal
        gameId={gameId!}
        member={districtEditor}
        onClose={() => setDistrictEditor(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  title: { flex: 1, fontSize: 20, fontWeight: '800', color: Colors.text },
  count: { fontSize: 14, color: Colors.textSecondary },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  legend: { paddingVertical: 8, paddingHorizontal: 4, gap: 2 },
  legendText: { fontSize: 13, color: Colors.textSecondary },
  // GM count is kept on its own line, separate from the player counts (GM-only roster).
  legendGm: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  sosRow: { borderColor: Colors.danger, backgroundColor: Colors.danger + '14' },
  sosAckedRow: { borderColor: Colors.warning, backgroundColor: Colors.warning + '12' },
  sosAckedLabel: { color: Colors.warning },
  outAvatar: { opacity: 0.5 },
  outName: { textDecorationLine: 'line-through', color: Colors.textSecondary },
  sosLabel: { fontSize: 12, color: Colors.danger, marginTop: 1, fontWeight: '600' },
  oobLabel: { fontSize: 12, color: Colors.warning, marginTop: 1, fontWeight: '600' },
  deadBadge: { backgroundColor: Colors.danger + '33' },
  fixRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' },
  fixDot: { width: 8, height: 8, borderRadius: 4 },
  fixText: { fontSize: 12, color: Colors.textSecondary },
  fixTextStale: { color: Colors.danger, fontWeight: '600' },
  // Low-battery flag (#35) — a player about to go dark.
  battChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: Colors.danger + '1A',
  },
  battText: { fontSize: 11, fontWeight: '700', color: Colors.danger },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gmAvatar: { backgroundColor: Colors.secondary + '33' },
  playerAvatar: { backgroundColor: Colors.primary + '33' },
  avatarText: { fontSize: 16, fontWeight: '800', color: Colors.text },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  name: { fontSize: 15, fontWeight: '700', color: Colors.text },
  districtChip: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  districtChipSet: {
    borderStyle: 'solid',
    borderColor: Colors.secondary,
    backgroundColor: Colors.secondary + '22',
  },
  districtChipText: { fontSize: 11, fontWeight: '700', color: Colors.textMuted },
  districtChipTextSet: { color: Colors.text },
  email: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  gmBadge: { backgroundColor: Colors.secondary + '33' },
  playerBadge: { backgroundColor: Colors.primary + '22' },
  badgeText: { fontSize: 10, fontWeight: '800', color: Colors.text, letterSpacing: 0.5 },
  iconBtn: { padding: 4 },
  empty: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 12,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
});
