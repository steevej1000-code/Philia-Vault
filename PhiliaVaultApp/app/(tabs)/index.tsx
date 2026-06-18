import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  TouchableOpacity, ActivityIndicator, Animated
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import api from '../../services/api';
import { COLORS, RADIUS } from '../../constants/colors';
import { useRouter, useFocusEffect } from 'expo-router';
import { IconAssets, IconLiabilities, IconScale, IconCoach, IconShield } from '../../components/icons/Icons';
import { OfflineBanner } from '../../components/OfflineBanner';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { getLastSync } from '../../services/offlineCache';
import { useUserPreferences } from '../../context/UserPreferencesContext';

interface DashboardData {
  total_assets: number;
  total_passive_income: number;
  total_liabilities: number;
  total_monthly_cost: number;
  iif_score: number;
  net_cashflow: number;
  timeline?: number;
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuthStore();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const { isOnline } = useNetworkStatus();
  const { t, formatAmount } = useUserPreferences();

  // --- Animation du cercle rouge cash flow négatif ---
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Boucle de clignotement ultra-doux et professionnel
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseAnim, {
            toValue: 1.08,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0.55,
            duration: 1200,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim, opacityAnim]);
  // --- Fin animation ---

  const load = useCallback(async () => {
    try {
      const online = await api.isOnline();
      const result = await api.getSummary();
      if (result.success) {
        setData(result);
      }
      setFromCache(!online);
    } catch (e) {
      console.error('Dashboard load error:', e);
    } finally {
      setLastSync(await getLastSync());
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Reload summary data every time this tab screen becomes focused/visible
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Auto re-sync as soon as connectivity comes back
  const wasOnline = React.useRef(isOnline);
  useEffect(() => {
    if (!wasOnline.current && isOnline) {
      api.syncAll().then(load);
    }
    wasOnline.current = isOnline;
  }, [isOnline, load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const formatLargeAmount = (v: number) => {
    return formatAmount(v);
  };

  const hour = new Date().getHours();
  const greeting = hour >= 18 || hour < 6
    ? t('greeting_evening')
    : hour >= 12
      ? t('greeting_afternoon')
      : t('greeting_morning');
  const firstName = user?.first_name || 'Steven';

  // Extract variables with exact fallback to match backend responses
  const totalAssets = data?.total_assets ?? 0;
  const totalPassiveIncome = data?.total_passive_income ?? 0;
  const totalMonthlyCost = data?.total_monthly_cost ?? 0;
  const iifScore = data?.iif_score ?? 0;
  const netCashflow = data?.net_cashflow ?? 0;

  // Cash flow négatif = true quand netCashflow < 0
  const isCashflowNegative = netCashflow < 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header Minimalist */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{greeting}, {firstName} 👋</Text>
          <Text style={styles.subGreeting}>{t('dashboard_subtitle')}</Text>
        </View>
        <TouchableOpacity style={styles.avatarBtn} onPress={() => router.push('/profile')}>
          <LinearGradient colors={['#ccff00', '#a3e635']} style={styles.avatar}>
            <Text style={styles.avatarText}>
              {firstName ? firstName[0].toUpperCase() : 'P'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ccff00" />}
      >
        {!isOnline && <OfflineBanner lastSync={lastSync} />}
        {isOnline && fromCache && <OfflineBanner compact />}
        {loading ? (
          <ActivityIndicator color="#ccff00" size="large" style={{ marginTop: 60 }} />
        ) : (
          <>
            {/* Hero Card avec cercle rouge animé si cash flow négatif */}
            <View style={styles.heroCard}>
              <Text style={styles.heroLabel}>{t('simulation_summary')}</Text>

              {/* Cercle rouge animé — visible uniquement si cash flow négatif */}
              {isCashflowNegative && (
                <Animated.View
                  style={[
                    styles.cashflowAlertCircle,
                    {
                      transform: [{ scale: pulseAnim }],
                      opacity: opacityAnim,
                    },
                  ]}
                >
                  <Text style={styles.cashflowAlertValue}>
                    {iifScore.toFixed(0)}
                  </Text>
                </Animated.View>
              )}

              {/* Si cash flow positif : cercle normal sans animation */}
              {!isCashflowNegative && (
                <View style={styles.cashflowPositiveCircle}>
                  <Text style={styles.cashflowPositiveValue}>
                    {iifScore.toFixed(0)}
                  </Text>
                </View>
              )}

              <Text style={styles.heroSubText}>{t('iif_full_name')}</Text>
              <Text style={styles.heroValue}>
                {iifScore.toFixed(0)}%
              </Text>
              <Text style={styles.heroHelperText}>
                {t('iif_goal')}
              </Text>

              {/* Internal metrics inside hero */}
              <View style={styles.heroMetrics}>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>{t('monthly_cost')}</Text>
                  <Text style={styles.metricVal}>
                    {formatLargeAmount(totalMonthlyCost)}
                  </Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>{t('timeline')}</Text>
                  <Text style={styles.metricVal}>
                    {data?.timeline !== undefined ? `${data.timeline} ${t('years_suffix')}` : `0 ${t('years_suffix')}`}
                  </Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>{t('portfolio')}</Text>
                  <Text style={styles.metricVal}>{formatLargeAmount(totalAssets)}</Text>
                </View>
              </View>
            </View>

            {/* AI Insights - Dribbble Style */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('ai_insights')}</Text>
            </View>

            <TouchableOpacity 
              style={styles.insightCard} 
              onPress={() => router.push('/coach')}
              activeOpacity={0.8}
            >
              <View style={styles.insightHeader}>
                <View style={styles.insightIconWrapper}>
                  <IconCoach size={18} color={COLORS.primary} />
                </View>
                <Text style={styles.insightTitle}>{t('recommended_optimization')}</Text>
              </View>
              <Text style={styles.insightBody}>
                {netCashflow > 0 
                  ? t('insight_positive_cashflow').replace('{amount}', formatLargeAmount(netCashflow))
                  : t('insight_no_cashflow')
                }
              </Text>
              <View style={styles.insightFooter}>
                <Text style={styles.insightLink}>{t('analyze_with_coach')}</Text>
                <Text style={styles.insightArrow}>→</Text>
              </View>
            </TouchableOpacity>

            {/* Sub Stats Row */}
            <View style={styles.subStatsContainer}>
              <View style={styles.statBox}>
                <Text style={styles.statBoxLabel}>{t('passive_income')} {t('per_month_suffix')}</Text>
                <Text style={[styles.statBoxVal, { color: '#ccff00' }]}>
                  {formatLargeAmount(totalPassiveIncome)}
                </Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statBoxLabel}>{t('monthly_cost')} {t('per_month_suffix')}</Text>
                <Text style={[styles.statBoxVal, { color: '#ff3b30' }]}>
                  -{formatLargeAmount(totalMonthlyCost)}
                </Text>
              </View>
            </View>

            {/* Quick Navigation grid */}
            <View style={styles.gridContainer}>
              {[
                { label: t('nav_assets'), Icon: IconAssets, route: '/assets' },
                { label: t('nav_liabilities'), Icon: IconLiabilities, route: '/liabilities' },
                { label: t('nav_simulator'), Icon: IconScale, route: '/simulator' },
                { label: t('nav_coach_ai'), Icon: IconCoach, route: '/coach' },
              ].map((item) => (
                <TouchableOpacity
                  key={item.route}
                  style={styles.gridBtn}
                  onPress={() => router.push(item.route as any)}
                >
                  <item.Icon size={22} color={COLORS.primary} />
                  <Text style={styles.gridLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Tagline */}
            <View style={styles.footerRow}>
              <IconShield size={14} color={COLORS.onSurfaceVariant} />
              <Text style={styles.footer}>
                {t('bank_grade_encryption')}
              </Text>
            </View>
          </>
        )}
      </ScrollView>
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
    paddingVertical: 20,
    backgroundColor: '#000000',
  },
  greeting: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  subGreeting: {
    fontSize: 12,
    color: '#8e8e93',
    marginTop: 2,
  },
  avatarBtn: {
    borderRadius: 22,
    overflow: 'hidden',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0c0e12',
  },
  scroll: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    gap: 20,
  },

  // Dribbble Hero Card
  heroCard: {
    backgroundColor: '#ccff00',
    borderRadius: 30,
    padding: 24,
    gap: 4,
    position: 'relative',
    overflow: 'visible',
  },
  heroLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000000',
    textTransform: 'uppercase',
    opacity: 0.6,
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  heroSubText: {
    fontSize: 14,
    color: '#000000',
    opacity: 0.8,
    fontWeight: '500',
    marginTop: 48,
  },
  heroValue: {
    fontSize: 42,
    fontWeight: '900',
    color: '#000000',
    letterSpacing: -1.5,
  },
  heroHelperText: {
    fontSize: 12,
    color: '#000000',
    opacity: 0.7,
    marginTop: 2,
    fontWeight: '600',
  },
  heroMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.06)',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginTop: 24,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 10,
    color: '#000000',
    opacity: 0.6,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  metricVal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#000000',
    marginTop: 2,
  },
  metricDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },

  // ────────────────────────────────────────────
  // Cercle rouge animé — cash flow NÉGATIF
  // ────────────────────────────────────────────
  cashflowAlertCircle: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: '#ff3b30',
    backgroundColor: '#ccff00',
    alignItems: 'center',
    justifyContent: 'center',
    // Ombre rouge douce pour renforcer l'alerte
    shadowColor: '#ff3b30',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 12,
    elevation: 10,
  },
  cashflowAlertValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#ff3b30',
    letterSpacing: -0.5,
  },

  // ────────────────────────────────────────────
  // Cercle normal — cash flow POSITIF (discret)
  // ────────────────────────────────────────────
  cashflowPositiveCircle: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: 'rgba(0,0,0,0.15)',
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cashflowPositiveValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#000000',
    letterSpacing: -0.5,
    opacity: 0.7,
  },

  // AI Insights
  sectionHeader: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.3,
  },
  insightCard: {
    backgroundColor: '#1c1c1e',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2c2c2e',
    gap: 12,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  insightIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightIcon: {
    fontSize: 18,
  },
  insightTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  insightBody: {
    fontSize: 13,
    color: '#aeaeaf',
    lineHeight: 20,
  },
  insightFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#2c2c2e',
    paddingTop: 12,
    marginTop: 4,
  },
  insightLink: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ccff00',
  },
  insightArrow: {
    fontSize: 16,
    color: '#ccff00',
    fontWeight: '700',
  },

  // Sub stats row
  subStatsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#1c1c1e',
    borderWidth: 1,
    borderColor: '#2c2c2e',
    borderRadius: 24,
    padding: 18,
    gap: 4,
  },
  statBoxLabel: {
    fontSize: 12,
    color: '#8e8e93',
    fontWeight: '600',
  },
  statBoxVal: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },

  // Quick Navigation grid
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  gridBtn: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: '#1c1c1e',
    borderRadius: 24,
    paddingVertical: 18,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  gridLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },

  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 20,
  },
  footer: {
    fontSize: 11,
    color: '#48484a',
    textAlign: 'center',
  },
});
