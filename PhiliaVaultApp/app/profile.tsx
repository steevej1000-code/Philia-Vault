import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, Switch, RefreshControl, Platform, Modal
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import { useAuthStore } from '../store/authStore';
import { COLORS, RADIUS } from '../constants/colors';
import { LinearGradient } from 'expo-linear-gradient';
import { IconClose, IconStar } from '../components/icons/Icons';
import api from '../services/api';
import { storage } from '../services/storage';
import { OfflineBanner } from '../components/OfflineBanner';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { getLastSync } from '../services/offlineCache';
import { useUserPreferences } from '../context/UserPreferencesContext';
import * as WebBrowser from 'expo-web-browser';
import { PreferencesSelectorModal, SelectorType } from '../components/PreferencesSelectorModal';
import { LANGUAGES } from '../constants/translations';

const BIOMETRIC_LOCK_KEY = 'biometric_lock_enabled';

interface Transaction {
  id: number;
  amount: number;
  date: string;
  description: string;
  type: string;
}

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, logout, isPremium } = useAuthStore();
  const [loggingOut, setLoggingOut] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { isOnline } = useNetworkStatus();
  const { t, formatAmount, language, currency } = useUserPreferences();
  const [selectorType, setSelectorType] = useState<SelectorType | null>(null);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [savingBiometric, setSavingBiometric] = useState(false);
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelDone, setCancelDone] = useState(false);
  const [cancelAccessUntil, setCancelAccessUntil] = useState<string | null>(null);
  const [subCancelAtPeriodEnd, setSubCancelAtPeriodEnd] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  const VAPID_PUBLIC_KEY = 'BKAEvpLXxMC8Aj0v1THOUmtxQJx5s6W-2MvOoj0t35J0GqkFL6oV8nqa9q5_ZllG2rRrXL9oFYnOKNS_0TvY6fI';

  useEffect(() => {
    (async () => {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricSupported(hasHardware && isEnrolled);
      const stored = await storage.getItem(BIOMETRIC_LOCK_KEY);
      setBiometricEnabled(stored === 'true');
    })();
    // Check push notification support (web only)
    (async () => {
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
        setPushSupported(true);
        try {
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          setPushSubscribed(!!sub);
        } catch {}
      }
    })();
  }, []);

  const handleBiometricToggle = async (value: boolean) => {
    if (value) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Confirmez votre identité',
      });
      if (!result.success) return;
    }
    setSavingBiometric(true);
    setBiometricEnabled(value);
    await storage.setItem(BIOMETRIC_LOCK_KEY, value ? 'true' : 'false');
    setSavingBiometric(false);
  };


  const load = useCallback(async () => {
    const online = await api.isOnline();
    setFromCache(!online);

    try {
      await api.init();
      const result = await api.getTransactions();
      if (result?.success) setTransactions((result.transactions || []).slice(0, 5));
    } catch (e) {
      console.warn('Profile: impossible de charger les transactions', e);
    } finally {
      setLoadingTx(false);
    }

    if (online) {
      try {
        const result = await api.getSettings();
        if (result?.success && result.settings) {
          setNotificationsEnabled(result.settings.notifications_enabled !== false);
        }
      } catch (e) {
        console.warn('Profile: impossible de charger les paramètres', e);
      } finally {
        setLoadingSettings(false);
      }
    } else {
      setLoadingSettings(false);
    }

    setLastSync(await getLastSync());
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Auto re-sync as soon as connectivity comes back
  const wasOnline = React.useRef(isOnline);
  useEffect(() => {
    if (!wasOnline.current && isOnline) {
      api.syncAll().then(load);
    }
    wasOnline.current = isOnline;
  }, [isOnline, load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const handleNotificationsToggle = async (value: boolean) => {
    setNotificationsEnabled(value);
    setSavingSettings(true);
    try {
      await api.updateSettings({ notifications_enabled: value });

      // Push subscription management (web only)
      if (pushSupported && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        if (value && !pushSubscribed) {
          setSubscribing(true);
          try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: VAPID_PUBLIC_KEY,
            });
            await api.subscribePush(sub, 'web');
            setPushSubscribed(true);
          } catch (e: any) {
            console.warn('Push subscribe failed:', e);
            // Not critical — user can still use app
          } finally {
            setSubscribing(false);
          }
        } else if (!value && pushSubscribed) {
          try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            if (sub) {
              await api.unsubscribePush(sub.endpoint);
              await sub.unsubscribe();
            }
            setPushSubscribed(false);
          } catch (e: any) {
            console.warn('Push unsubscribe failed:', e);
          }
        }
      }
    } catch (e: any) {
      Alert.alert(t('error'), e.message || t('notifications_update_error'));
      setNotificationsEnabled(!value);
    } finally {
      setSavingSettings(false);
    }
  };

  const fmtAmount = (v: number) => {
    const sign = v >= 0 ? '+' : '';
    return `${sign}${formatAmount(v)}`;
  };

  const handleLogout = () => {
    const doLogout = async () => {
      setLoggingOut(true);
      try {
        await logout();
        router.replace('/(auth)/login');
      } catch (e: any) {
        Alert.alert(t('error'), e.message || t('logout_error'));
      } finally {
        setLoggingOut(false);
      }
    };

    if (Platform.OS === 'web') {
      // Alert.alert buttons may not fire on web — use window.confirm directly
      const confirmed = window.confirm(
        `${t('logout_confirm_title')}\n${t('logout_confirm_message')}`
      );
      if (confirmed) doLogout();
    } else {
      Alert.alert(
        t('logout_confirm_title'),
        t('logout_confirm_message'),
        [
          { text: t('cancel'), style: 'cancel' },
          { text: t('logout'), style: 'destructive', onPress: doLogout }
        ]
      );
    }
  };

  const handleConfirmCancellation = async () => {
    setCancelling(true);
    try {
      const result = await api.cancelSubscription();
      if (result?.success) {
        setCancelDone(true);
        setSubCancelAtPeriodEnd(true);
        if (result.access_until) setCancelAccessUntil(result.access_until);
        else if (result.cancel_at) setCancelAccessUntil(result.cancel_at);
      } else {
        Alert.alert(t('error'), result?.error || 'Cancellation failed.');
      }
    } catch (e: any) {
      Alert.alert(t('error'), e.message || 'Cancellation failed.');
    } finally {
      setCancelling(false);
    }
  };

  const handleReactivate = async () => {
    setReactivating(true);
    try {
      const result = await api.reactivateSubscription();
      if (result?.success) {
        setSubCancelAtPeriodEnd(false);
        setCancelAccessUntil(null);
      } else {
        Alert.alert(t('error'), result?.error || 'Reactivation failed.');
      }
    } catch (e: any) {
      Alert.alert(t('error'), e.message || 'Reactivation failed.');
    } finally {
      setReactivating(false);
    }
  };

  const closeCancelModal = () => {
    setCancelModalVisible(false);
    // Reset confirmation state after the modal has closed
    setTimeout(() => setCancelDone(false), 300);
  };

  const name = user ? `${user.first_name} ${user.last_name}` : t('default_user_name');
  const email = user?.email || 'test@philiavault.com';
  const avatarLetter = user?.first_name ? user.first_name[0].toUpperCase() : 'P';

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
          <IconClose size={14} color={COLORS.onSurfaceVariant} />
          <Text style={styles.backText}>{t('close')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('profile_title')}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        {!isOnline && <OfflineBanner lastSync={lastSync} />}
        {isOnline && fromCache && <OfflineBanner compact />}
        {/* User Card info */}
        <View style={styles.profileCard}>
          <LinearGradient colors={['#ccff00', '#a3e635']} style={styles.avatar}>
            <Text style={styles.avatarLetter}>{avatarLetter}</Text>
          </LinearGradient>
          <Text style={styles.userName}>{name}</Text>
          <Text style={styles.userEmail}>{email}</Text>
          
          {/* Premium Status Badge */}
          <View style={[styles.badge, isPremium ? styles.badgePremium : styles.badgeFree, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
            {isPremium && <IconStar size={12} color={COLORS.primary} />}
            <Text style={[styles.badgeText, isPremium ? styles.badgeTextPremium : styles.badgeTextFree]}>
              {isPremium ? t('premium_member') : t('free_account')}
            </Text>
          </View>
        </View>

        {/* Account Settings options */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('account_settings')}</Text>
          
          <View style={styles.optionsList}>
            <TouchableOpacity style={styles.optionRow} onPress={() => setSelectorType('currency')} disabled={loadingSettings || savingSettings}>
              <Text style={styles.optionLabel}>{t('currency')}</Text>
              {loadingSettings ? (
                <ActivityIndicator color={COLORS.primary} size="small" />
              ) : (
                <Text style={styles.optionValue}>{currency}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.optionRow} onPress={() => setSelectorType('language')}>
              <Text style={styles.optionLabel}>{t('language')}</Text>
              <Text style={styles.optionValue}>
                {LANGUAGES.find((l) => l.code === language)?.flag} {LANGUAGES.find((l) => l.code === language)?.label}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.optionRow} 
              onPress={() => router.push({ pathname: '/onboarding-salary', params: { editMode: 'true' } })}
            >
              <Text style={styles.optionLabel}>Mon revenu mensuel net</Text>
              <Text style={styles.optionValue}>
                {user?.monthly_income ? `${formatAmount(user.monthly_income)}` : '$0'} — Modifier ›
              </Text>
            </TouchableOpacity>
            <View style={styles.optionRow}>
              <Text style={styles.optionLabel}>{t('notifications')}</Text>
              {loadingSettings ? (
                <ActivityIndicator color={COLORS.primary} size="small" />
              ) : (
                <Switch
                  value={notificationsEnabled}
                  onValueChange={handleNotificationsToggle}
                  disabled={savingSettings}
                  trackColor={{ false: '#3a3a3c', true: '#ccff00' }}
                  thumbColor="#ffffff"
                />
              )}
            </View>
            <View style={styles.optionRow}>
              <Text style={styles.optionLabel}>{t('security')}</Text>
              <Text style={styles.optionValue}>{t('security_value')}</Text>
            </View>
            <TouchableOpacity style={styles.optionRow} onPress={() => router.push('/change-password')}>
              <Text style={styles.optionLabel}>{t('change_password')}</Text>
              <Text style={styles.optionValue}>›</Text>
            </TouchableOpacity>
            {biometricSupported && (
              <View style={styles.optionRow}>
                <Text style={styles.optionLabel}>{t('biometric_lock')}</Text>
                <Switch
                  value={biometricEnabled}
                  onValueChange={handleBiometricToggle}
                  disabled={savingBiometric}
                  trackColor={{ false: '#3a3a3c', true: '#ccff00' }}
                  thumbColor="#ffffff"
                />
              </View>
            )}
            <TouchableOpacity 
              style={styles.optionRow} 
              onPress={() => WebBrowser.openBrowserAsync('https://philiavault.com/terms.html')}
            >
              <Text style={styles.optionLabel}>Conditions d'Utilisation</Text>
              <Text style={styles.optionValue}>›</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.optionRow} 
              onPress={() => WebBrowser.openBrowserAsync('https://philiavault.com/privacy.html')}
            >
              <Text style={styles.optionLabel}>Confidentialité</Text>
              <Text style={styles.optionValue}>›</Text>
            </TouchableOpacity>
            <View style={[styles.optionRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.optionLabel}>{t('app_version')}</Text>
              <Text style={styles.optionValue}>1.0.0 (Expo)</Text>
            </View>
          </View>
        </View>

        {/* Recent Transactions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('recent_transactions')}</Text>

          {loadingTx ? (
            <ActivityIndicator color={COLORS.primary} size="small" style={{ marginTop: 12 }} />
          ) : transactions.length === 0 ? (
            <View style={styles.optionsList}>
              <View style={[styles.optionRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.optionValue}>{t('no_transactions')}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.optionsList}>
              {transactions.map((tx, i) => (
                <View
                  key={tx.id}
                  style={[styles.optionRow, i === transactions.length - 1 && { borderBottomWidth: 0 }]}
                >
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={styles.optionLabel}>{tx.description}</Text>
                    <Text style={[styles.optionValue, { marginTop: 2 }]}>{tx.date}</Text>
                  </View>
                  <Text style={[styles.optionValue, { color: tx.amount >= 0 ? '#ccff00' : '#ff3b30', fontWeight: '700' }]}>
                    {fmtAmount(tx.amount)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Logout Button */}
        <TouchableOpacity 
          style={styles.logoutBtn} 
          onPress={handleLogout}
          disabled={loggingOut}
          activeOpacity={0.8}
        >
          {loggingOut ? (
            <ActivityIndicator color="#ff3b30" size="small" />
          ) : (
            <Text style={styles.logoutText}>{t('logout')}</Text>
          )}
        </TouchableOpacity>

        {/* Cancel Subscription / Reactivate — premium members only */}
        {isPremium && !subCancelAtPeriodEnd && (
          <TouchableOpacity
            style={styles.cancelSubBtn}
            onPress={() => setCancelModalVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelSubText}>{t('cancel_sub_btn')}</Text>
          </TouchableOpacity>
        )}
        {isPremium && subCancelAtPeriodEnd && (
          <View style={styles.accessUntilRow}>
            <Text style={styles.accessUntilText}>
              {cancelAccessUntil
                ? t('cancel_sub_access_until').replace('{date}', cancelAccessUntil)
                : t('cancel_sub_access_until').replace('{date}', '...')}
            </Text>
            <TouchableOpacity
              style={styles.reactivateLink}
              onPress={handleReactivate}
              disabled={reactivating}
              activeOpacity={0.6}
            >
              {reactivating
                ? <ActivityIndicator color={COLORS.primary} size="small" />
                : <Text style={styles.reactivateLinkText}>{t('cancel_sub_reactivate')}</Text>
              }
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <PreferencesSelectorModal
        visible={selectorType !== null}
        type={selectorType}
        onClose={() => setSelectorType(null)}
      />

      {/* Cancel Subscription friction modal */}
      <Modal
        visible={cancelModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeCancelModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {cancelDone ? (
              <>
                <Text style={styles.modalTitle}>{t('cancel_sub_done_title')}</Text>
                <Text style={styles.modalBody}>
                  {cancelAccessUntil
                    ? t('cancel_sub_done_body').replace('{date}', cancelAccessUntil)
                    : t('cancel_sub_modal_body')}
                </Text>
                <TouchableOpacity
                  style={styles.modalKeepBtn}
                  onPress={closeCancelModal}
                  activeOpacity={0.85}
                >
                  <Text style={styles.modalKeepText}>{t('cancel_sub_done_close')}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>{t('cancel_sub_modal_title')}</Text>
                <Text style={styles.modalBody}>{t('cancel_sub_modal_body')}</Text>

                <TouchableOpacity
                  style={styles.modalKeepBtn}
                  onPress={closeCancelModal}
                  disabled={cancelling}
                  activeOpacity={0.85}
                >
                  <Text style={styles.modalKeepText}>{t('cancel_sub_keep')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalConfirmLink}
                  onPress={handleConfirmCancellation}
                  disabled={cancelling}
                  activeOpacity={0.6}
                >
                  {cancelling ? (
                    <ActivityIndicator color="#8e8e93" size="small" />
                  ) : (
                    <Text style={styles.modalConfirmText}>{t('cancel_sub_confirm')}</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#1c1c1e',
  },
  backBtn: {
    paddingVertical: 6,
  },
  backText: {
    color: '#8e8e93',
    fontSize: 15,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
  },
  scroll: {
    padding: 24,
    gap: 28,
  },
  profileCard: {
    backgroundColor: '#1c1c1e',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#2c2c2e',
    padding: 30,
    alignItems: 'center',
    gap: 8,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  avatarLetter: {
    fontSize: 36,
    fontWeight: '900',
    color: '#0c0e12',
  },
  userName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  userEmail: {
    fontSize: 14,
    color: '#8e8e93',
    fontWeight: '500',
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 99,
    marginTop: 10,
  },
  badgePremium: {
    backgroundColor: 'rgba(204,255,0,0.15)',
  },
  badgeFree: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  badgeTextPremium: {
    color: '#ccff00',
  },
  badgeTextFree: {
    color: '#8e8e93',
  },

  // Section options
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.3,
  },
  optionsList: {
    backgroundColor: '#1c1c1e',
    borderWidth: 1,
    borderColor: '#2c2c2e',
    borderRadius: 24,
    paddingHorizontal: 20,
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#2c2c2e',
  },
  optionLabel: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '600',
  },
  optionValue: {
    fontSize: 14,
    color: '#8e8e93',
    fontWeight: '500',
  },

  // Logout button
  logoutBtn: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,59,48,0.3)',
    backgroundColor: 'rgba(255,59,48,0.03)',
    borderRadius: 24,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ff3b30',
  },

  accessUntilRow: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  accessUntilText: {
    fontSize: 13,
    color: '#8e8e93',
    textAlign: 'center',
  },
  reactivateLink: {
    paddingVertical: 4,
    alignItems: 'center',
  },
  reactivateLinkText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
    textDecorationLine: 'underline',
  },

  // Cancel subscription — subtle dark-red outline
  cancelSubBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelSubText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8e8e93',
    textDecorationLine: 'underline',
  },

  // Friction modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#1c1c1e',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#2c2c2e',
    padding: 28,
    gap: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  modalBody: {
    fontSize: 14,
    lineHeight: 21,
    color: '#8e8e93',
    fontWeight: '500',
    textAlign: 'center',
  },
  modalKeepBtn: {
    backgroundColor: '#ccff00',
    borderRadius: 18,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    shadowColor: '#ccff00',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 18,
    elevation: 10,
  },
  modalKeepText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0c0e12',
    letterSpacing: -0.2,
  },
  modalConfirmLink: {
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8e8e93',
    textDecorationLine: 'underline',
  },
});
