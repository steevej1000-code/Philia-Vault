import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, ScrollView, Platform
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useFounderStatus } from '../hooks/useFounderStatus';
import { useUserPreferences } from '../context/UserPreferencesContext';
import { useAuthStore } from '../store/authStore';
import { COLORS, RADIUS } from '../constants/colors';
import {
  IconCoach, IconSearch, IconAssets, IconTarget, IconBolt, IconShield
} from '../components/icons/Icons';
import {
  getOfferings, purchasePackage, restorePurchases
} from '../services/revenueCatService';
import api from '../services/api';

// ─── Dynamic pricing ──────────────────────────────────────────────────────────
const PRICE_MONTHLY = process.env.EXPO_PUBLIC_PRICE_MONTHLY ?? '$9.99';
const TRIAL_DAYS    = 3;
// ─────────────────────────────────────────────────────────────────────────────

const FEATURES = [
  { Icon: IconSearch, key: 'paywall.benefit_ai'       },
  { Icon: IconAssets, key: 'paywall.benefit_cashflow'  },
  { Icon: IconTarget, key: 'paywall.benefit_park'      },
  { Icon: IconBolt,   key: 'paywall.benefit_instant'   },
] as const;

export default function PaywallScreen() {
  const router                                     = useRouter();
  const { t }                                      = useUserPreferences();
  const { setPremium }                         = useAuthStore();
  const { isFounder, loading: founderLoading } = useFounderStatus();
  const [loading, setLoading]                  = useState(false);

  /* ─── Payment handler ─────────────────────────────────────────────────────── */
  const handleSubscribe = async () => {
    setLoading(true);
    try {
      if (Platform.OS === 'web') {
        // Dynamic import keeps stripe.ts out of the native bundle entirely
        const { stripeCheckout } = await import('../services/stripe');
        await stripeCheckout();
        return; // browser redirects away — setLoading not needed
      }

      // Native path → RevenueCat (monthly package with trial configured in App Store / Play Console)
      const offerings = await getOfferings();
      if (!offerings) {
        Alert.alert(t('error'), 'No offerings available. Check your connection.');
        setLoading(false);
        return;
      }
      const pkg = (offerings as any).monthly;
      if (!pkg) {
        Alert.alert(t('error'), 'Plan not found.');
        setLoading(false);
        return;
      }
      const result = await purchasePackage(pkg);
      if (result.success) {
        await api.setPremiumStatus(1).catch(() => {});
        setPremium(true);
        router.replace('/(tabs)');
      } else if ((result as any).error) {
        Alert.alert(t('error'), (result as any).error);
      }
    } catch (e: any) {
      Alert.alert(t('error'), e.message ?? 'Purchase failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Restore Access', 'Contact support@philiavault.com to restore your access.');
      return;
    }
    setLoading(true);
    try {
      const result = await restorePurchases();
      if (result.success && (result.customerInfo as any)?.entitlements?.active['premium']) {
        await api.setPremiumStatus(1).catch(() => {});
        setPremium(true);
        router.replace('/(tabs)');
      } else {
        Alert.alert(t('paywall.restore_empty'), t('paywall.restore_empty_message'));
      }
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    } finally {
      setLoading(false);
    }
  };

  /* ─── Loading ─────────────────────────────────────────────────────────────── */
  if (founderLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ccff00" />
      </View>
    );
  }

  /* ─── Founder view ────────────────────────────────────────────────────────── */
  if (isFounder) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['rgba(204,255,0,0.10)', 'rgba(12,14,18,0)']}
          style={styles.founderHero}
        >
          <View style={styles.founderBadge}>
            <Text style={styles.founderBadgeText}>✦ FOUNDER MEMBER</Text>
          </View>
          <View style={styles.heroIcon}>
            <IconShield size={36} color="#ccff00" />
          </View>
          <Text style={styles.founderTitle}>{t('paywall.founder_title')}</Text>
          <Text style={styles.founderSub}>{t('paywall.founder_subtitle')}</Text>
          <View style={styles.founderPriceRow}>
            <Text style={styles.founderPrice}>{PRICE_MONTHLY}</Text>
            <Text style={styles.founderPricePeriod}> / {t('paywall.month')}</Text>
          </View>
          <Text style={styles.founderLocked}>🔒 {t('paywall.locked_for_life')}</Text>
        </LinearGradient>

        <View style={styles.founderFooter}>
          <TouchableOpacity
            style={styles.enterBtn}
            onPress={() => router.replace('/(tabs)')}
            activeOpacity={0.85}
          >
            <LinearGradient colors={['#ccff00', '#a3e635']} style={styles.enterGrad}>
              <Text style={styles.enterText}>{t('paywall.enter_app')}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  /* ─── Standard paywall ────────────────────────────────────────────────────── */
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <LinearGradient
        colors={['rgba(204,255,0,0.12)', 'rgba(12,14,18,0)']}
        style={styles.hero}
      >
        {/* Free trial badge */}
        <View style={styles.trialBadge}>
          <Text style={styles.trialBadgeText}>✦ {TRIAL_DAYS} JOURS GRATUITS</Text>
        </View>
        <View style={styles.heroIcon}>
          <IconCoach size={36} color="#ccff00" />
        </View>
        <Text style={styles.heroTitle}>{t('paywall.public_title')}</Text>
        <Text style={styles.heroSub}>{t('paywall.public_subtitle')}</Text>
      </LinearGradient>

      {/* Features */}
      <View style={styles.features}>
        {FEATURES.map(({ Icon, key }, i) => (
          <View key={i} style={styles.feat}>
            <View style={styles.featIcon}>
              <Icon size={18} color="#ccff00" />
            </View>
            <Text style={styles.featText}>{t(key)}</Text>
          </View>
        ))}
      </View>

      {/* Single plan card */}
      <View style={styles.planBox}>
        <View style={styles.planBoxLeft}>
          <Text style={styles.planBoxTitle}>Premium</Text>
          <Text style={styles.planBoxSub}>Puis {PRICE_MONTHLY}/mois · Annulez à tout moment</Text>
        </View>
        <View style={styles.planBoxRight}>
          <Text style={styles.planBoxFree}>{TRIAL_DAYS}j gratuits</Text>
          <Text style={styles.planBoxPrice}>{PRICE_MONTHLY}<Text style={styles.planBoxUnit}>/mo</Text></Text>
        </View>
      </View>

      {/* CTA */}
      <TouchableOpacity
        style={[styles.subBtn, loading && { opacity: 0.6 }]}
        onPress={handleSubscribe}
        disabled={loading}
        activeOpacity={0.85}
      >
        <LinearGradient colors={['#ccff00', '#a3e635']} style={styles.subGrad}>
          {loading
            ? <ActivityIndicator color="#0c0e12" />
            : (
              <View style={styles.subBtnInner}>
                <Text style={styles.subText}>Commencer — {TRIAL_DAYS} jours gratuits</Text>
                <Text style={styles.subTextSub}>Sans engagement · {PRICE_MONTHLY}/mois ensuite</Text>
              </View>
            )
          }
        </LinearGradient>
      </TouchableOpacity>

      <Text style={styles.legal}>{t('paywall.disclaimer')}</Text>

      <TouchableOpacity onPress={handleRestore} disabled={loading} style={styles.restoreBtn}>
        <Text style={styles.restoreText}>
          {Platform.OS === 'web' ? 'Restore / Contact Support' : t('paywall.restore_purchases')}
        </Text>
      </TouchableOpacity>

      {/* DEV bypass — preservé exactement comme avant */}
      {__DEV__ && (
        <TouchableOpacity
          onPress={() => {
            // @ts-ignore
            global.__bypassPaywall = true;
            router.replace('/(tabs)');
          }}
          style={styles.devBtn}
        >
          <Text style={styles.devText}>DEV: BYPASS PAYWALL</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

/* ─── Styles ──────────────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1, backgroundColor: COLORS.background,
    alignItems: 'center', justifyContent: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    paddingBottom: 60,
  },

  /* Hero */
  hero: {
    alignItems: 'center',
    paddingTop: 48, paddingBottom: 28, paddingHorizontal: 24,
  },
  heroIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(204,255,0,0.12)',
    borderWidth: 1, borderColor: 'rgba(204,255,0,0.25)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 28, fontWeight: '900', color: COLORS.onSurface,
    textAlign: 'center', letterSpacing: -0.5,
  },
  heroSub: {
    fontSize: 14, color: COLORS.onSurfaceVariant,
    textAlign: 'center', lineHeight: 22, marginTop: 8, maxWidth: 300,
  },

  /* Features */
  features: { paddingHorizontal: 20, gap: 10, marginBottom: 24 },
  feat: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: COLORS.surfaceContainer, padding: 14,
    borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.glassBorder,
  },
  featIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(204,255,0,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  featText: { fontSize: 14, fontWeight: '500', color: COLORS.onSurface, flex: 1 },

  /* Trial badge */
  trialBadge: {
    backgroundColor: 'rgba(204,255,0,0.12)',
    borderWidth: 1, borderColor: '#ccff00',
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 99, marginBottom: 20,
  },
  trialBadgeText: { fontSize: 11, fontWeight: '900', color: '#ccff00', letterSpacing: 1.5 },

  /* Single plan box */
  planBox: {
    marginHorizontal: 20, marginBottom: 20,
    backgroundColor: 'rgba(204,255,0,0.06)',
    borderWidth: 2, borderColor: '#ccff00',
    borderRadius: RADIUS.xl, padding: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  planBoxLeft: { flex: 1 },
  planBoxTitle: { fontSize: 16, fontWeight: '800', color: COLORS.onSurface },
  planBoxSub: { fontSize: 12, color: COLORS.onSurfaceVariant, marginTop: 3 },
  planBoxRight: { alignItems: 'flex-end' },
  planBoxFree: {
    fontSize: 11, fontWeight: '900', color: '#ccff00',
    backgroundColor: 'rgba(204,255,0,0.15)',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, marginBottom: 4,
  },
  planBoxPrice: { fontSize: 20, fontWeight: '900', color: COLORS.onSurface },
  planBoxUnit: { fontSize: 13, fontWeight: '500', color: COLORS.onSurfaceVariant },

  /* CTA */
  subBtn: {
    marginHorizontal: 20, borderRadius: RADIUS.full, overflow: 'hidden',
    shadowColor: '#ccff00', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 6,
  },
  subGrad: { paddingVertical: 18, alignItems: 'center', justifyContent: 'center', gap: 4 },
  subBtnInner: { alignItems: 'center', gap: 3 },
  subText: { fontSize: 16, fontWeight: '800', color: '#0c0e12' },
  subTextSub: { fontSize: 11, fontWeight: '600', color: 'rgba(12,14,18,0.6)' },

  /* Footer */
  legal: {
    fontSize: 11, color: COLORS.outline, textAlign: 'center',
    marginTop: 16, paddingHorizontal: 24, lineHeight: 16,
  },
  restoreBtn: { alignItems: 'center', marginTop: 12, padding: 8 },
  restoreText: { fontSize: 13, color: COLORS.onSurfaceVariant, textDecorationLine: 'underline' },
  devBtn: {
    marginTop: 28, marginHorizontal: 20, alignItems: 'center',
    padding: 12, borderWidth: 1, borderColor: '#ff4444', borderRadius: 8,
  },
  devText: { color: '#ff4444', fontWeight: 'bold', fontSize: 14 },

  /* Founder */
  founderHero: {
    flex: 1, alignItems: 'center',
    paddingTop: 60, paddingHorizontal: 24, paddingBottom: 32,
  },
  founderBadge: {
    backgroundColor: 'rgba(204,255,0,0.10)',
    borderWidth: 1, borderColor: '#ccff00',
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 99, marginBottom: 28,
  },
  founderBadgeText: { fontSize: 11, fontWeight: '900', color: '#ccff00', letterSpacing: 1.5 },
  founderTitle: {
    fontSize: 28, fontWeight: '900', color: COLORS.onSurface,
    textAlign: 'center', marginBottom: 8, marginTop: 16, letterSpacing: -0.5,
  },
  founderSub: {
    fontSize: 14, color: COLORS.onSurfaceVariant, textAlign: 'center',
    lineHeight: 22, maxWidth: 300, marginBottom: 32,
  },
  founderPriceRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 8 },
  founderPrice: { fontSize: 40, fontWeight: '900', color: '#ccff00' },
  founderPricePeriod: { fontSize: 16, color: COLORS.onSurfaceVariant, marginBottom: 6 },
  founderLocked: { fontSize: 13, color: COLORS.onSurfaceVariant },
  founderFooter: { padding: 24 },
  enterBtn: {
    borderRadius: RADIUS.full, overflow: 'hidden',
    shadowColor: '#ccff00', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 6,
  },
  enterGrad: { paddingVertical: 18, alignItems: 'center', justifyContent: 'center' },
  enterText: { fontSize: 16, fontWeight: '800', color: '#0c0e12' },
});
