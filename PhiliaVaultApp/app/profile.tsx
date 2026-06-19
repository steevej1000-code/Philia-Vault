import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, Switch, RefreshControl
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../store/authStore';
import { COLORS, RADIUS } from '../constants/colors';
import { LinearGradient } from 'expo-linear-gradient';
import { IconClose, IconStar } from '../components/icons/Icons';
import api from '../services/api';
import { OfflineBanner } from '../components/OfflineBanner';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { getLastSync } from '../services/offlineCache';
import { useUserPreferences } from '../context/UserPreferencesContext';
import * as WebBrowser from 'expo-web-browser';
import { PreferencesSelectorModal, SelectorType } from '../components/PreferencesSelectorModal';
import { LANGUAGES } from '../constants/translations';

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
    Alert.alert(
      t('logout_confirm_title'),
      t('logout_confirm_message'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('logout'),
          style: 'destructive',
          onPress: async () => {
            setLoggingOut(true);
            try {
              await logout();
              router.replace('/(auth)/login');
            } catch (e: any) {
              Alert.alert(t('error'), e.message || t('logout_error'));
            } finally {
              setLoggingOut(false);
            }
          }
        }
      ]
    );
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
      </ScrollView>

      <PreferencesSelectorModal
        visible={selectorType !== null}
        type={selectorType}
        onClose={() => setSelectorType(null)}
      />
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
});
