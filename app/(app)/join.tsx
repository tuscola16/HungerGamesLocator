import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Colors } from '@/constants/colors';
import { joinGameByCode } from '@/services/gameService';
import { getFcmToken } from '@/services/notificationService';
import { friendlyError } from '@/services/errorUtils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PENDING_JOIN_CODE_KEY } from '@/constants/storageKeys';

/** A route param can arrive as `string[]` when a key repeats in the URL, so normalise
 *  once rather than trusting the declared type (#92). */
function normalizeCode(v: string | string[] | undefined): string {
  const first = Array.isArray(v) ? v[0] : v;
  return String(first ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

export default function JoinScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();
  // #92: `outdoorgm://join?code=ABCDEF` (from a GM's QR) lands here with the code already
  // filled in. Normalised the same way typed input is, so a lowercase link still works.
  const rawParams = useLocalSearchParams<{ code?: string | string[] }>();
  const linkedCode = normalizeCode(rawParams.code);
  // A code stashed by the auth redirect (scanned while signed out) — see the effect below.
  const [stashedCode, setStashedCode] = useState('');
  // Same shape as `nameTouched`: the field shows the linked code until the player edits
  // it, so a late-arriving link (cold start via the QR) still fills an untouched field
  // without any setState-in-effect.
  const [typedCode, setTypedCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const linkCode = linkedCode || stashedCode;
  const code = codeTouched ? typedCode : linkCode;
  const fromLink = !codeTouched && !!linkCode;
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  // Whether the player has edited the name field. Until they do, we keep it synced to the
  // profile default so a late-arriving profile (#37) still pre-fills it.
  const [nameTouched, setNameTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Profile loads asynchronously, so it may arrive after this screen mounts (#37). Seed
  // the name from it as long as the player hasn't started typing their own.
  useEffect(() => {
    if (!nameTouched && profile?.displayName) setDisplayName(profile.displayName);
  }, [profile?.displayName, nameTouched]);

  // #92: pick up a code stashed by the auth redirect (scanned while signed out). Consumed
  // once — it is a one-shot hand-off, not a preference, so it must not survive to the next
  // join attempt.
  useEffect(() => {
    if (linkedCode) return;
    let cancelled = false;
    AsyncStorage.getItem(PENDING_JOIN_CODE_KEY)
      .then((stashed) => {
        if (cancelled || !stashed) return;
        AsyncStorage.removeItem(PENDING_JOIN_CODE_KEY).catch(() => {});
        setStashedCode(normalizeCode(stashed));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [linkedCode]);

  // Show a "from your profile" hint while the field is still the untouched profile default.
  const showProfileHint =
    !nameTouched && !!profile?.displayName && displayName === profile.displayName;

  async function handleJoin() {
    setError('');
    if (code.trim().length < 6) {
      setError('Enter the 6-character game code');
      return;
    }
    if (!displayName.trim()) {
      setError('Enter your name');
      return;
    }
    if (!user) return;

    setLoading(true);
    try {
      const fcmToken = await getFcmToken();
      // joinGameByCode returns the resolved game + role, so we can drop the player
      // straight into the game (#38) instead of bouncing back to My Games.
      const { gameId, role } = await joinGameByCode(code.trim(), displayName.trim(), fcmToken ?? undefined);
      if (role === 'gm') {
        router.replace(`/(app)/gm/${gameId}`);
      } else {
        router.replace({ pathname: '/(app)/player/game', params: { gameId } });
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <View style={styles.container}>
        <Text style={styles.title}>Join a Game</Text>
        <Text style={styles.subtitle}>
          {fromLink
            ? 'Code filled in from your Game Master’s link — check your name and join.'
            : 'Get the game code from your Game Master and enter it below.'}
        </Text>

        <View style={styles.form}>
          <Input
            label="Game Code"
            value={code}
            onChangeText={(t) => { setTypedCode(t.toUpperCase()); setCodeTouched(true); setError(''); }}
            placeholder="ABCDEF"
            maxLength={6}
            autoCapitalize="characters"
            autoFocus={!fromLink}
          />
          <Input
            label="Your Name (shown to the GM)"
            value={displayName}
            onChangeText={(t) => { setDisplayName(t); setNameTouched(true); setError(''); }}
            placeholder="e.g. Katniss"
            maxLength={32}
          />
          {showProfileHint ? (
            <Text style={styles.hint}>From your profile — edit it for this game if you like.</Text>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button title="Join Game" onPress={handleJoin} loading={loading} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  back: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 },
  backText: { color: Colors.primary, fontSize: 16 },
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 24 },
  title: { fontSize: 28, fontWeight: '800', color: Colors.text, marginBottom: 8 },
  subtitle: { fontSize: 15, color: Colors.textSecondary, marginBottom: 32, lineHeight: 22 },
  form: { gap: 16 },
  error: { color: Colors.danger, fontSize: 14, textAlign: 'center' },
  hint: { color: Colors.textMuted, fontSize: 12, marginTop: -8 },
});
