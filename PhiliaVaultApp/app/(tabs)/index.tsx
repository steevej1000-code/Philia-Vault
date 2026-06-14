import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  TouchableOpacity, ActivityIndicator
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
    return `$${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const hour = new Date().getHours();
  const greeting = hour >= 18 || hour < 6 ? 'Bonsoir' : 'Bonjour';
  const firstName = user?.first_name || 'Steven';

  // Extract variables with exact fallback to match backend responses
  const totalAssets = data?.total_assets ?? 0;
  const totalPassiveIncome = data?.total_passive_income ?? 0;
  const totalMonthlyCost = data?.total_monthly_cost ?? 0;
  const iifScore = data?.iif_score ?? 0;
  const netCashflow = data?.net_cashflow ?? 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header Minimalist */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{greeting}, {firstName} 👋</Text>
          <Text style={styles.subGreeting}>Votre liberté financière en direct</Text>
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
            {/* Dribbble Style Hero Recommendation Card */}
            <View style={styles.heroCard}>
              <Text style={styles.heroLabel}>Simulation Summary</Text>
              
              <Text style={styles.heroSubText}>Indice d'Indépendance Financière</Text>
              <Text style={styles.heroValue}>
                {iifScore.toFixed(0)}%
              </Text>
              <Text style={styles.heroHelperText}>
                Objectif de liberté totale : 100%
              </Text>

              {/* Internal metrics inside hero */}
              <View style={styles.heroMetrics}>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Monthly Cost</Text>
                  <Text style={styles.metricVal}>
                    {formatLargeAmount(totalMonthlyCost)}
                  </Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Timeline</Text>
                  <Text style={styles.metricVal}>
                    {data?.timeline !== undefined ? `${data.timeline} years` : '0 years'}
                  </Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Portefeuille</Text>
                  <Text style={styles.metricVal}>{formatLargeAmount(totalAssets)}</Text>
                </View>
              </View>
            </View>

            {/* AI Insights - Dribbble Style */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>AI Insights</Text>
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
                <Text style={styles.insightTitle}>Optimisation Recommandée</Text>
              </View>
              <Text style={styles.insightBody}>
                {netCashflow > 0 
                  ? `Votre cashflow mensuel de ${formatLargeAmount(netCashflow)} peut être réinvesti dans des actifs pour accélérer votre indépendance de 1.4 ans.`
                  : "Ajoutez des actifs à rendement mensuel ou réduisez vos passifs pour générer des flux et commencer à recevoir des recommandations."
                }
              </Text>
              <View style={styles.insightFooter}>
                <Text style={styles.insightLink}>Analyser avec le Coach</Text>
                <Text style={styles.insightArrow}>→</Text>
              </View>
            </TouchableOpacity>

            {/* Sub Stats Row */}
            <View style={styles.subStatsContainer}>
              <View style={styles.statBox}>
                <Text style={styles.statBoxLabel}>Revenus Passifs /m</Text>
                <Text style={[styles.statBoxVal, { color: '#ccff00' }]}>
                  {formatLargeAmount(totalPassiveIncome)}
                </Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statBoxLabel}>Dépenses Fixes /m</Text>
                <Text style={[styles.statBoxVal, { color: '#ff3b30' }]}>
                  -{formatLargeAmount(totalMonthlyCost)}
                </Text>
              </View>
            </View>

            {/* Quick Navigation grid */}
            <View style={styles.gridContainer}>
              {[
                { label: 'Actifs', Icon: IconAssets, route: '/assets' },
                { label: 'Passifs', Icon: IconLiabilities, route: '/liabilities' },
                { label: 'Simulateur', Icon: IconScale, route: '/simulator' },
                { label: 'Coach IA', Icon: IconCoach, route: '/coach' },
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
                Cryptage AES-256 de niveau bancaire
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
    overflow: 'hidden',
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
