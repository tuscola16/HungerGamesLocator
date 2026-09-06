import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, Alert, Modal, TextInput, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useGame } from '@/context/GameContext';
import { Colors } from '@/constants/colors';
import { updateMemberRole, removePlayer, eliminatePlayer, revivePlayer, clearSos, ackSos, setMemberDistrict } from '@/services/gameService';
import { friendlyError } from '@/services/errorUtils';
import { useNow } from '@/hooks/useNow';
import { stalenessLevel, stalenessColor, formatAgo, isLowBattery, formatBattery } from '@/services/locationStatus';
import type { GameMember } from '@/types';

/** #85: one labelled action in the per-player sheet — an icon *and* words, which is the
 *  whole point of moving off the icon strip. */
function MenuRow({
  icon, color, label, onPress, destructive,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={menuStyles.row}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[menuStyles.label, destructive ? menuStyles.destructive : null]}>{label}</Text>
    </TouchableOpacity>
  );
}

const menuStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  label: { fontSize: 15, color: Colors.text, fontWeight: '600', flex: 1 },
  destructive: { color: Colors.danger },
});

export default function PlayersScreen() {
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
  const { members, playerLocations, phase, loadGame } = useGame();
  const router = useRouter();
  const now = useNow(10000);

  // District editor — the GM assigns tribute pairings (ROADMAP #10). Players can't
  // set their own district (firestore.rules), so this lives only on the GM roster.
  const [districtEditor, setDistrictEditor] = useState<GameMember | null>(null);
  const [districtInput, setDistrictInput] = useState('');

  // #85: the per-player action sheet. One labelled list instead of a strip of unlabeled
  // icons, so "eliminate" and "remove" can't be mistaken for the routine actions they used
  // to sit beside.
  const [actionMenu, setActionMenu] = useState<GameMember | null>(null);
  // Held between closing the sheet and the dismissal actually completing — see runAction.
  const pendingAction = useRef<(() => void) | null>(null);

  /**
   * Run a row action and close the sheet. Handlers keep their own confirmations.
   *
   * iOS cannot present anything while a Modal is dismissing: an `Alert.alert` (every
   * destructive action here opens one) or a second Modal (the district editor) raised in
   * the same tick is silently dropped, so the sheet would just close and nothing would
   * happen. Defer to the Modal's `onDismiss`, which fires once it has really gone.
   * `onDismiss` is iOS-only, and Android has no such restriction, so Android keeps running
   * the action immediately rather than waiting for a callback that never comes.
   */
  function runAction(fn: () => void) {
    if (Platform.OS === 'ios') {
      pendingAction.current = fn;
      setActionMenu(null);
      return;
    }
    setActionMenu(null);
    fn();
  }

  /** iOS only: the sheet has finished dismissing, so it is safe to present again. */
  function runPendingAction() {
    const fn = pendingAction.current;
    pendingAction.current = null;
    fn?.();
  }

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
    setDistrictInput(member.district != null ? String(member.district) : '');
    setDistrictEditor(member);
  }

  async function saveDistrict() {
    if (!gameId || !districtEditor) return;
    const target = districtEditor;
    setDistrictEditor(null);
    try {
      await setMemberDistrict(gameId, target.userId, districtInput);
    } catch (err) {
      Alert.alert('Error', friendlyError(err));
    }
  }

  async function clearDistrict() {
    if (!gameId || !districtEditor) return;
    const target = districtEditor;
    setDistrictEditor(null);
    try {
      await setMemberDistrict(gameId, target.userId, null);
    } catch (err) {
      Alert.alert('Error', friendlyError(err));
    }
  }

  /** A game must always keep ≥ 1 GM (#50). True when this member is the only GM. */
  function isLastGM(member: GameMember): boolean {
    return member.role === 'gm' && members.filter((m) => m.role === 'gm').length <= 1;
  }

  function handleRoleToggle(member: GameMember) {
    const newRole = member.role === 'player' ? 'gm' : 'player';
    // Block demoting the last GM — a game with no GM is unwatched and unwinnable (#50).
    if (newRole === 'player' && isLastGM(member)) {
      Alert.alert('Can’t demote the last GM', 'Promote another player to GM first — every game needs at least one Game Master.');
      return;
    }
    const label = newRole === 'gm' ? 'Promote to GM' : 'Demote to Player';
    Alert.alert(
      label,
      `${member.displayName} will ${newRole === 'gm' ? 'gain GM access and see all player locations.' : 'lose GM access.'}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: label,
          onPress: async () => {
            if (!gameId) return;
            try {
              await updateMemberRole(gameId, member.userId, newRole);
            } catch (err) {
              Alert.alert('Error', friendlyError(err));
            }
          },
        },
      ]
    );
  }

  function handleRemove(member: GameMember) {
    // Block removing the last GM — it would orphan the game (#50).
    if (isLastGM(member)) {
      Alert.alert('Can’t remove the last GM', 'Promote another player to GM first — every game needs at least one Game Master.');
      return;
    }
    Alert.alert(
      `Remove ${member.displayName}?`,
      'They will be removed from the game and their location will no longer be tracked.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            if (!gameId) return;
            try {
              await removePlayer(gameId, member.userId);
            } catch (err) {
              Alert.alert('Error', friendlyError(err));
            }
          },
        },
      ]
    );
  }

  function handleEliminate(member: GameMember) {
    Alert.alert(
      `Eliminate ${member.displayName}?`,
      'Marks this player as dead. Everyone is notified and, if they are the last one standing, the survivor is declared the winner.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Eliminate',
          style: 'destructive',
          onPress: async () => {
            if (!gameId) return;
            try {
              await eliminatePlayer(gameId, member.userId, 'gm-other');
            } catch (err) {
              Alert.alert('Error', friendlyError(err));
            }
          },
        },
      ]
    );
  }

  function handleRevive(member: GameMember) {
    // Reverse an accidental kill (#21): clears out + reopens the game if that death ended it.
    Alert.alert(
      `Bring ${member.displayName} back?`,
      'Clears their elimination. If the game had already ended, it reopens.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revive',
          onPress: async () => {
            if (!gameId) return;
            try {
              await revivePlayer(gameId, member.userId);
            } catch (err) {
              Alert.alert('Error', friendlyError(err));
            }
          },
        },
      ]
    );
  }

  async function handleAckSos(member: GameMember) {
    if (!gameId) return;
    try {
      await ackSos(gameId, member.userId);
    } catch (err) {
      Alert.alert('Error', friendlyError(err));
    }
  }

  async function handleClearSos(member: GameMember) {
    if (!gameId) return;
    try {
      await clearSos(gameId, member.userId);
    } catch (err) {
      Alert.alert('Error', friendlyError(err));
    }
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
                : '🆘 Needs assistance — tap ✓ to acknowledge'}
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

      {/* #85: per-player actions. Built from the same conditionals the icon strip used,
          so what a GM can do is unchanged — only how they reach it. */}
      <Modal
        visible={actionMenu != null}
        transparent
        animationType="fade"
        onRequestClose={() => setActionMenu(null)}
        onDismiss={runPendingAction}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setActionMenu(null)}
        >
          <TouchableOpacity style={styles.modalCard} activeOpacity={1}>
            {actionMenu && (() => {
              // Resolve the *live* member each render: `actionMenu` only holds the identity
              // of the row that was tapped. Holding the object froze it, so a member doc
              // that changed while the sheet was open (the player tapping out, a co-GM
              // setting a district, an SOS arriving) left the sheet offering stale actions
              // and seeding the district editor from stale data. Falls back to the captured
              // object if the member has since been removed from the game.
              const m = members.find((x) => x.userId === actionMenu.userId) ?? actionMenu;
              const mIsGM = m.role === 'gm';
              const mIsOut = !!m.out;
              const mSosAcked = !!m.sosAckAt;
              return (
                <>
                  <Text style={styles.modalTitle}>{m.displayName}</Text>

                  {!mIsGM && (
                    <MenuRow
                      icon="chatbubble-ellipses-outline"
                      color={Colors.secondary}
                      label="Status & message"
                      onPress={() => runAction(() => router.push(`/(app)/gm/${gameId}/player/${m.userId}`))}
                    />
                  )}

                  {m.sos && !mSosAcked && (
                    <MenuRow
                      icon="checkmark-circle"
                      color={Colors.warning}
                      label="Acknowledge safety alert"
                      onPress={() => runAction(() => handleAckSos(m))}
                    />
                  )}

                  {m.sos && (
                    <MenuRow
                      icon={mSosAcked ? 'close-circle' : 'alert-circle'}
                      color={Colors.danger}
                      label="Stand down safety alert"
                      onPress={() => runAction(() => handleClearSos(m))}
                    />
                  )}

                  {!mIsGM && (
                    <MenuRow
                      icon="people-outline"
                      color={Colors.textSecondary}
                      label={m.district != null && String(m.district).trim() !== ''
                        ? `Change district (currently ${m.district})`
                        : 'Assign a district'}
                      onPress={() => runAction(() => openDistrictEditor(m))}
                    />
                  )}

                  <MenuRow
                    icon={mIsGM ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'}
                    color={Colors.textSecondary}
                    label={mIsGM ? 'Demote to player' : 'Promote to Game Master'}
                    onPress={() => runAction(() => handleRoleToggle(m))}
                  />

                  {/* Revive a dead player (#21): reverse an accidental kill. */}
                  {!mIsGM && mIsOut && (
                    <MenuRow
                      icon="heart-outline"
                      color={Colors.success}
                      label="Revive — undo this elimination"
                      onPress={() => runAction(() => handleRevive(m))}
                    />
                  )}

                  {/* Eliminate is only meaningful for a living player. */}
                  {!mIsGM && !mIsOut && (
                    <MenuRow
                      icon="skull-outline"
                      color={Colors.danger}
                      label="Eliminate from the game"
                      destructive
                      onPress={() => runAction(() => handleEliminate(m))}
                    />
                  )}

                  {/* Hard-remove is only available before the game starts (#20). Once in
                      play/results, member docs are delete-locked to preserve timing and
                      death history — the GM eliminates instead. */}
                  {(phase === 'setup' || phase === 'lobby') && (
                    <MenuRow
                      icon="person-remove-outline"
                      color={Colors.danger}
                      label="Remove from the game"
                      destructive
                      onPress={() => runAction(() => handleRemove(m))}
                    />
                  )}

                  <TouchableOpacity onPress={() => setActionMenu(null)} style={styles.menuCancel}>
                    <Text style={styles.modalBtnCancel}>Cancel</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={districtEditor != null}
        transparent
        animationType="fade"
        onRequestClose={() => setDistrictEditor(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>District for {districtEditor?.displayName}</Text>
            <Text style={styles.modalHint}>
              Tributes who share a district are paired — a trap is withheld if both arrive at a
              site together.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={districtInput}
              onChangeText={setDistrictInput}
              placeholder="e.g. 1"
              placeholderTextColor={Colors.textMuted}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={saveDistrict}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={clearDistrict} style={styles.modalBtn}>
                <Text style={styles.modalBtnClear}>Clear</Text>
              </TouchableOpacity>
              <View style={styles.modalActionsRight}>
                <TouchableOpacity onPress={() => setDistrictEditor(null)} style={styles.modalBtn}>
                  <Text style={styles.modalBtnCancel}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={saveDistrict} style={[styles.modalBtn, styles.modalBtnSave]}>
                  <Text style={styles.modalBtnSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: '#000000AA',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  modalHint: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  modalInput: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: Colors.text,
  },
  modalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  modalActionsRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  menuCancel: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  modalBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  modalBtnClear: { color: Colors.danger, fontWeight: '700', fontSize: 14 },
  modalBtnCancel: { color: Colors.textSecondary, fontWeight: '700', fontSize: 14 },
  modalBtnSave: { backgroundColor: Colors.primary },
  modalBtnSaveText: { color: Colors.background, fontWeight: '800', fontSize: 14 },
});
