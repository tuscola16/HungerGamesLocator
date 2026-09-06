import { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Modal, TextInput, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import {
  updateMemberRole, removePlayer, eliminatePlayer, revivePlayer, clearSos, ackSos, setMemberDistrict,
} from '@/services/gameService';
import { friendlyError } from '@/services/errorUtils';
import type { GameMember, GamePhase } from '@/types';

/**
 * The GM's per-player action sheet (ROADMAP #85).
 *
 * Every per-player action a GM can take lives here and **nothing stays inline** — the
 * roster row and the detail screen keep status only, so a destructive action is never one
 * stray tap away from a routine one. Each row is an icon *and* a label, which was the point
 * of moving off the strip of unlabeled ~24 px icons.
 *
 * Extracted from the roster (#85.1) so the player **detail** screen (#85.2) gets the same
 * menu rather than a second, drifting copy of it: one set of handlers, one set of guards
 * (last-GM, phase-gated remove), one set of confirmations.
 *
 * The district editor is a **sibling** export the parent owns, not a child of the sheet:
 * the roster's inline district chip opens it directly (the chip stays inline — it is the
 * sole inline *display* of a district, and it is already labelled text rather than one of
 * the unlabeled icons this item was about), so both entry points have to reach the same
 * editor. Routing it through the parent also keeps the sheet from raising a Modal out of a
 * Modal, which is precisely the iOS timing hazard `runAction` below exists to handle.
 */

/** One labelled action in the sheet. */
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
    <TouchableOpacity onPress={onPress} style={styles.menuRow}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.menuLabel, destructive ? styles.menuDestructive : null]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function PlayerActionSheet({
  gameId, members, phase, target, onClose, onOpenDetail, onEditDistrict,
}: {
  gameId: string;
  /** The live roster — the sheet re-resolves its member from this on every render. */
  members: GameMember[];
  phase: GamePhase;
  /** The member whose sheet is open, or null when closed. */
  target: GameMember | null;
  onClose: () => void;
  /**
   * Navigate to the player detail screen. Omitted **by the detail screen itself**, which
   * hides the row rather than offering a link to where you already are.
   */
  onOpenDetail?: (userId: string) => void;
  /** Open the parent-owned <DistrictEditorModal> for this member (ROADMAP #10). */
  onEditDistrict: (member: GameMember) => void;
}) {
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
      onClose();
      return;
    }
    onClose();
    fn();
  }

  /** iOS only: the sheet has finished dismissing, so it is safe to present again. */
  function runPendingAction() {
    const fn = pendingAction.current;
    pendingAction.current = null;
    fn?.();
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
    try {
      await ackSos(gameId, member.userId);
    } catch (err) {
      Alert.alert('Error', friendlyError(err));
    }
  }

  async function handleClearSos(member: GameMember) {
    try {
      await clearSos(gameId, member.userId);
    } catch (err) {
      Alert.alert('Error', friendlyError(err));
    }
  }

  return (
    <>
      <Modal
        visible={target != null}
        transparent
        animationType="fade"
        onRequestClose={onClose}
        onDismiss={runPendingAction}
      >
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose}>
          <TouchableOpacity style={styles.modalCard} activeOpacity={1}>
            {target && (() => {
              // Resolve the *live* member each render: `target` only holds the identity of
              // the row that was tapped. Holding the object froze it, so a member doc that
              // changed while the sheet was open (the player tapping out, a co-GM setting a
              // district, an SOS arriving) left the sheet offering stale actions and seeding
              // the district editor from stale data. Falls back to the captured object if
              // the member has since been removed from the game.
              const m = members.find((x) => x.userId === target.userId) ?? target;
              const mIsGM = m.role === 'gm';
              const mIsOut = !!m.out;
              const mSosAcked = !!m.sosAckAt;
              return (
                <>
                  <Text style={styles.modalTitle}>{m.displayName}</Text>

                  {!mIsGM && onOpenDetail && (
                    <MenuRow
                      icon="chatbubble-ellipses-outline"
                      color={Colors.secondary}
                      label="Status & message"
                      onPress={() => runAction(() => onOpenDetail(m.userId))}
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
                      onPress={() => runAction(() => onEditDistrict(m))}
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

                  <TouchableOpacity onPress={onClose} style={styles.menuCancel}>
                    <Text style={styles.modalBtnCancel}>Cancel</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

/**
 * The district editor (ROADMAP #10). Owned by the parent screen so the roster's inline
 * district chip and the action sheet's "Assign a district" row open the same one.
 */
export function DistrictEditorModal({
  gameId, member, onClose,
}: {
  gameId: string;
  /** The member being edited, or null when closed. */
  member: GameMember | null;
  onClose: () => void;
}) {
  const [input, setInput] = useState('');
  // Seed the field from the member each time the editor opens, and re-seed if the doc
  // changes underneath (a co-GM assigning a district while this is up). Derived during
  // render rather than in an effect so the first paint already shows the current value.
  const seededFor = useRef<string | null>(null);
  const seedKey = member ? `${member.userId}:${member.district ?? ''}` : null;
  if (seedKey !== seededFor.current) {
    seededFor.current = seedKey;
    if (member) setInput(member.district != null ? String(member.district) : '');
  }

  async function save() {
    if (!member) return;
    const target = member;
    onClose();
    try {
      await setMemberDistrict(gameId, target.userId, input);
    } catch (err) {
      Alert.alert('Error', friendlyError(err));
    }
  }

  async function clear() {
    if (!member) return;
    const target = member;
    onClose();
    try {
      await setMemberDistrict(gameId, target.userId, null);
    } catch (err) {
      Alert.alert('Error', friendlyError(err));
    }
  }

  return (
    <Modal
      visible={member != null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>District for {member?.displayName}</Text>
          <Text style={styles.modalHint}>
            Tributes sharing a district are paired. Leave blank to unassign.
          </Text>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="e.g. 12"
            placeholderTextColor={Colors.textMuted}
            style={styles.modalInput}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={save}
          />
          <View style={styles.modalActions}>
            <TouchableOpacity onPress={clear} style={styles.modalBtn}>
              <Text style={styles.modalBtnClear}>Clear</Text>
            </TouchableOpacity>
            <View style={styles.modalActionsRight}>
              <TouchableOpacity onPress={onClose} style={styles.modalBtn}>
                <Text style={styles.modalBtnCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={save} style={[styles.modalBtn, styles.modalBtnSave]}>
                <Text style={styles.modalBtnSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  menuRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  menuLabel: { fontSize: 15, color: Colors.text, fontWeight: '600', flex: 1 },
  menuDestructive: { color: Colors.danger },
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
