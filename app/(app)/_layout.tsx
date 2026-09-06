import { useEffect } from 'react';
import { Stack, useRouter, usePathname, useGlobalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/context/AuthContext';
import { Colors } from '@/constants/colors';
import { getFcmToken, requestNotificationPermissions } from '@/services/notificationService';
import { PENDING_JOIN_CODE_KEY } from '@/constants/storageKeys';

export default function AppLayout() {
  const { user, loading, updateProfile } = useAuth();
  const router = useRouter();
  // #92: read the *global* URL, so a deep link into a child route is visible here.
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ code?: string | string[] }>();

  useEffect(() => {
    if (!loading && !user) {
      // #92: this redirect throws away the query string, which is exactly how a scanned
      // join QR loses its code — the common case, since a new player is signed out. Stash
      // it so the Join screen can still pre-fill once they're authenticated.
      if (pathname === '/join') {
        const raw = Array.isArray(params.code) ? params.code[0] : params.code;
        const code = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
        if (code) AsyncStorage.setItem(PENDING_JOIN_CODE_KEY, code).catch(() => {});
      }
      router.replace('/(auth)/login');
    }
  }, [user, loading, pathname, params.code]);

  // Request notification permissions and save FCM token once authenticated
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const granted = await requestNotificationPermissions();
        if (granted) {
          const token = await getFcmToken();
          if (token) await updateProfile({ fcmToken: token });
        }
      } catch (err) {
        console.warn('FCM token setup failed (non-fatal):', err);
      }
    })();
  }, [user]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
        animation: 'slide_from_right',
      }}
    />
  );
}
