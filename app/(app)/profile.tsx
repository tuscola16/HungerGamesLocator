import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, Modal, ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Colors } from '@/constants/colors';
import { deleteAccount } from '@/services/gameService';
import { stopLocationTracking } from '@/services/locationTask';
import { friendlyError } from '@/services/errorUtils';
import { Ionicons } from '@expo/vector-icons';
import { sanitizeMutedNotifications, type NotificationClass } from '@/types';

/**
 * #87: the notification classes a user may turn off, with the plain-English name for each.
 *
 * `'sos'` is absent by construction, not filtered out of a longer list — a safety alert is
 * not mutable, and the row for it below is a locked statement of that rather than a control.
 * `'boundary'` explicitly IS here: it fires often enough to be noise, and that judgement
 * belongs to the person whose phone is buzzing.
 */
const MUTABLE_CLASSES: { key: NotificationClass; label: string; hint: string }[] = [
  { key: 'arrival', label: 'Checkpoint arrivals', hint: 'A player reached a site and nothing fired. GMs only.' },
  { key: 'hazard', label: 'Hazards', hint: 'Somebody tripped a hazard.' },
  { key: 'boon', label: 'Boons', hint: 'Somebody found a boon.' },
  { key: 'boundary', label: 'Boundary alerts', hint: 'A player left or re-entered the play area.' },
  { key: 'gm-message', label: 'Announcements', hint: 'Broadcasts, gear drops and messages.' },
  { key: 'death', label: 'Death tolls', hint: '"A tribute has fallen", and the count remaining.' },
  { key: 'winner', label: 'Winner', hint: 'The game was won.' },
  { key: 'ration', label: 'Ration windows', hint: 'The eat-window opened.' },
  { key: 'runsheet', label: 'Run-sheet reminders', hint: 'Scheduled nudges you set for yourself. GMs only.' },
  { key: 'media', label: 'Post-game recap', hint: 'A GM posted the video or photo album.' },
];

export default function ProfileScreen() {
  const router = useRouter();
  const { user, profile, updateProfile } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  // Optimistic: the toggle should feel instant, and the write is a single small field.
  const [muted, setMuted] = useState<NotificationClass[]>(profile?.mutedNotifications ?? []);

  /**
   * #87: toggle one class. `sanitizeMutedNotifications` is belt-and-braces here — `'sos'`
   * can't reach this list from `MUTABLE_CLASSES` — but it is the same guard the server
   * applies, and having both makes "SOS is never mutable" true by construction rather than
   * by everyone remembering.
   */
  function toggleMute(key: NotificationClass) {
    const next = sanitizeMutedNotifications(
      muted.includes(key) ? muted.filter((k) => k !== key) : [...muted, key]
    );
    setMuted(next);
    // Fire-and-forget with a rollback: this is a preference, not a safety control, and
    // blocking the row on a round trip in a dead zone would be worse than a rare revert.
    updateProfile({ mutedNotifications: next }).catch((err) => {
      setMuted(muted);
      Alert.alert('Could not save', friendlyError(err));
    });
  }

  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');

  async function handleSave() {
    if (!displayName.trim()) {
      Alert.alert('Enter your name');
      return;
    }
    setLoading(true);
    try {
      await updateProfile({ displayName: displayName.trim() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      Alert.alert('Error', friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  function handleDeleteAccount() {
    setDeletePassword('');
    setDeleteError('');
    setShowDeleteModal(true);
  }

  async function confirmDelete() {
    if (!deletePassword) {
      setDeleteError('Enter your password to confirm.');
      return;
    }
    setDeleting(true);
    setDeleteError('');
    try {
      await stopLocationTracking();
      await deleteAccount(user!.uid, deletePassword);
      // AuthContext listener handles redirect to /(auth)/login
    } catch (err) {
      setDeleteError(friendlyError(err));
      setDeleting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      {/* #87: the notification list pushed this past a phone screen, so it scrolls. */}
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Profile</Text>

        <View style={styles.emailRow}>
          <Text style={styles.emailLabel}>EMAIL</Text>
          <Text style={styles.emailValue}>{user?.email ?? '—'}</Text>
        </View>

        <Input
          label="Display Name"
          value={displayName}
          onChangeText={(t) => { setDisplayName(t); setSaved(false); }}
          placeholder="e.g. Ranger"
          maxLength={32}
        />
        <Text style={styles.hint}>
          This name is shown to Game Masters and other players when you join a game.
        </Text>

        <Button
          title={saved ? '✓ Saved' : 'Save Name'}
          onPress={handleSave}
          loading={loading}
          disabled={saved}
        />

        <View style={styles.divider} />

        {/* #87: mute the notification firehose. Per user, not per game — this follows you
            into every game you run, and nobody can mute on your behalf. */}
        <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
        <Text style={styles.hint}>
          Turn off the kinds of alert you don't want. This applies to every game you're in.
          Safety alerts can't be turned off.
        </Text>
        {MUTABLE_CLASSES.map((c) => {
          const on = !muted.includes(c.key);
          return (
            <TouchableOpacity
              key={c.key}
              style={styles.muteRow}
              onPress={() => toggleMute(c.key)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={on ? 'notifications' : 'notifications-off-outline'}
                size={20}
                color={on ? Colors.primary : Colors.textMuted}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.muteLabel, !on && styles.muteLabelOff]}>{c.label}</Text>
                <Text style={styles.muteHint}>{c.hint}</Text>
              </View>
              <Ionicons
                name={on ? 'checkbox' : 'square-outline'}
                size={20}
                color={on ? Colors.success : Colors.textMuted}
              />
            </TouchableOpacity>
          );
        })}
        <View style={styles.muteRow}>
          <Ionicons name="alert-circle" size={20} color={Colors.danger} />
          <View style={{ flex: 1 }}>
            <Text style={styles.muteLabel}>Safety alerts</Text>
            <Text style={styles.muteHint}>Always on. Somebody asking for help is not noise.</Text>
          </View>
          <Ionicons name="lock-closed" size={16} color={Colors.textMuted} />
        </View>

        <View style={styles.divider} />

        <View style={styles.dangerZone}>
          <Text style={styles.dangerLabel}>DANGER ZONE</Text>
          <Button
            title="Delete My Account"
            onPress={handleDeleteAccount}
            variant="danger"
            loading={deleting}
          />
          <Text style={styles.dangerHint}>
            Permanently deletes your account and all associated data. You will be removed from every game.
          </Text>
        </View>
      </ScrollView>

      {/* Delete confirmation — requires password to re-authenticate */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="slide"
        onRequestClose={() => !deleting && setShowDeleteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Delete Account</Text>
            <Text style={styles.modalSub}>
              This permanently deletes your account and removes you from all games. It cannot be undone.
              Enter your password to confirm.
            </Text>
            <Input
              label="Password"
              value={deletePassword}
              onChangeText={(t) => { setDeletePassword(t); setDeleteError(''); }}
              placeholder="Your password"
              secureTextEntry
              autoFocus
            />
            {deleteError ? <Text style={styles.modalError}>{deleteError}</Text> : null}
            <View style={styles.modalActions}>
              <Button
                title="Cancel"
                onPress={() => setShowDeleteModal(false)}
                variant="ghost"
                disabled={deleting}
                fullWidth={false}
                style={{ flex: 1 }}
              />
              <Button
                title="Delete"
                onPress={confirmDelete}
                variant="danger"
                loading={deleting}
                fullWidth={false}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  back: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 },
  backText: { color: Colors.primary, fontSize: 16 },
  container: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40, gap: 16 },
  title: { fontSize: 28, fontWeight: '800', color: Colors.text, marginBottom: 8 },
  emailRow: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emailLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  emailValue: { fontSize: 16, fontWeight: '600', color: Colors.text },
  hint: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18, marginTop: -8 },
  // #87: notification preferences.
  sectionLabel: {
    fontSize: 11, color: Colors.textSecondary, fontWeight: '700',
    letterSpacing: 1.5, marginBottom: -4,
  },
  muteRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  muteLabel: { color: Colors.text, fontSize: 14, fontWeight: '600' },
  muteLabelOff: { color: Colors.textMuted },
  muteHint: { color: Colors.textMuted, fontSize: 12, marginTop: 1, lineHeight: 16 },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 8,
  },
  dangerZone: { gap: 10 },
  dangerLabel: {
    fontSize: 11,
    color: Colors.danger,
    fontWeight: '700',
    letterSpacing: 1,
  },
  dangerHint: {
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    gap: 12,
  },
  modalTitle: { fontSize: 22, fontWeight: '800', color: Colors.text },
  modalSub: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  modalError: { color: Colors.danger, fontSize: 13 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
});
