import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useState, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Montserrat_400Regular, Montserrat_600SemiBold, Montserrat_700Bold, Montserrat_800ExtraBold } from '@expo-google-fonts/montserrat';
import { PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans';
import * as LocalAuthentication from 'expo-local-authentication';
import { useAuthStore } from '../store/authStore';
import { View, ActivityIndicator, AppState, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS } from '../constants/colors';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { configurePurchases } from '../services/purchases';
import api from '../services/api';
import { storage } from '../services/storage';
import { UserPreferencesProvider } from '../context/UserPreferencesContext';

const BIOMETRIC_LOCK_KEY = 'biometric_lock_enabled';

function BiometricGate() {
  const { isAuthenticated } = useAuthStore();
  const [locked, setLocked] = useState(false);
  const [checked, setChecked] = useState(false);
  const appState = useRef(AppState.currentState);

  const tryUnlock = async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Déverrouillez Philia Vault',
    });
    if (result.success) setLocked(false);
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setChecked(true);
      return;
    }
    (async () => {
      const enabled = (await storage.getItem(BIOMETRIC_LOCK_KEY)) === 'true';
      if (enabled) {
        setLocked(true);
        await tryUnlock();
      }
      setChecked(true);
    })();
  }, [isAuthenticated]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active' && isAuthenticated) {
        const enabled = (await storage.getItem(BIOMETRIC_LOCK_KEY)) === 'true';
        if (enabled) setLocked(true);
      }
      appState.current = nextState;
    });
    return () => subscription.remove();
  }, [isAuthenticated]);

  if (!checked || !locked) return null;

  return (
    <View style={lockStyles.overlay}>
      <Text style={lockStyles.title}>Philia Vault verrouillé</Text>
      <TouchableOpacity style={lockStyles.unlockBtn} onPress={tryUnlock}>
        <Text style={lockStyles.unlockText}>Déverrouiller</Text>
      </TouchableOpacity>
    </View>
  );
}

const lockStyles = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: COLORS.background, zIndex: 999,
    alignItems: 'center', justifyContent: 'center', gap: 20,
  },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.onSurface },
  unlockBtn: {
    paddingHorizontal: 24, paddingVertical: 14, borderRadius: 999,
    backgroundColor: COLORS.primary,
  },
  unlockText: { fontSize: 15, fontWeight: '800', color: '#0c0e12' },
});

function AuthGuard() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const isNotificationsScreen = (segments as string[])[1] === 'notifications';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup && !isNotificationsScreen) {
      router.replace('/(auth)/notifications');
    }
  }, [isAuthenticated, isLoading, segments]);

  return null;
}

export default function RootLayout() {
  const { loadSession } = useAuthStore();

  const [fontsLoaded] = useFonts({
    'Montserrat-Regular': Montserrat_400Regular,
    'Montserrat-SemiBold': Montserrat_600SemiBold,
    'Montserrat-Bold': Montserrat_700Bold,
    'Montserrat-ExtraBold': Montserrat_800ExtraBold,
    'PlusJakartaSans-Regular': PlusJakartaSans_400Regular,
    'PlusJakartaSans-Medium': PlusJakartaSans_500Medium,
    'PlusJakartaSans-SemiBold': PlusJakartaSans_600SemiBold,
    'PlusJakartaSans-Bold': PlusJakartaSans_700Bold,
  });

  useEffect(() => {
    loadSession();
    // Initialize RevenueCat as early as possible. appUserID is set to an
    // anonymous RC-generated ID for now; it can be aliased to the user's
    // email/account ID later via Purchases.logIn() once auth completes.
    configurePurchases();
    // Warm the offline cache on startup if we're online, so cached data is
    // available immediately the next time the user opens the app offline.
    (async () => {
      await api.init();
      api.syncAll();
    })();
  }, []);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <UserPreferencesProvider>
        <StatusBar style="light" />
        <AuthGuard />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORS.background } }}>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
        <BiometricGate />
      </UserPreferencesProvider>
    </GestureHandlerRootView>
  );
}
