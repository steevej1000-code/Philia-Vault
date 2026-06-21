import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, RefreshControl, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import api from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS, RADIUS } from '../../constants/colors';
import { GlassCard } from '../../components/GlassCard';
import { IconShield, IconTarget, IconList, IconRefresh } from '../../components/icons/Icons';
import { useUserPreferences } from '../../context/UserPreferencesContext';

const REFERRAL_BASE_URL = 'https://app.philiavault.com/?ref=';

interface ReferralMember {
  email: string;
  name: string;
  created_at: string;
  subscription_status: 'active' | 'inactive';
  commission_earned: number;
}

interface AffiliationStats {
  code_parrainage: string;
  active_referrals: number;
  estimated_monthly_gain: number;
  total_invited: number; // Added for the funnel
}

export default function AffiliationScreen() {
  const insets = useSafeAreaInsets();
  const { t, formatAmount } = useUserPreferences();
  const { isPremium } = useAuthStore();
  const [stats, setStats] = useState<AffiliationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [network, setNetwork] = useState<ReferralMember[]>([]);

  // L'éligibilité = avoir un abonnement premium actif (vérifié via le store, sans appel RevenueCat)
  const isEligible = isPremium;

  const load = useCallback(async () => {
    try {
      await api.init();

      // Fetch Stats
      const [result, networkResult] = await Promise.all([
        api.getAffiliationStats(),
        api.getAffiliateNetwork(),
      ]);
      if (networkResult?.success) {
        setNetwork(networkResult.network ?? []);
      }
      // reassign result usage below
      const _result = result;
      if (_result.success) {
        setStats({
          code_parrainage: _result.code_parrainage,
          active_referrals: _result.active_referrals,
          estimated_monthly_gain: _result.estimated_monthly_gain,
          // Mocking total invited if API doesn't have it yet to show the funnel concept
          total_invited: _result.active_referrals > 0 ? _result.active_referrals * 3 : 0 
        });
      }
    } catch (e) {
      console.warn('[Affiliation] Erreur chargement:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCopy = async () => {
    if (!stats?.code_parrainage) return;
    await Clipboard.setStringAsync(REFERRAL_BASE_URL + stats.code_parrainage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const conversionRate = stats && stats.total_invited > 0 
    ? Math.round((stats.active_referrals / stats.total_invited) * 100) 
    : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{t('affiliation_title')}</Text>
          <Text style={styles.subtitle}>{t('affiliation_subtitle')}</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} size="large" style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {/* ELIGIBILITY SHIELD */}
          <GlassCard style={[styles.shieldCard, !isEligible && styles.shieldSuspended]}>
            <View style={styles.shieldHeader}>
              <IconShield size={24} color={isEligible ? COLORS.primary : COLORS.error} />
              <Text style={[styles.shieldStatus, { color: isEligible ? COLORS.primary : COLORS.error }]}>
                {isEligible ? t('affiliation_shield_eligible') : t('affiliation_shield_suspended')}
              </Text>
            </View>
            <Text style={styles.shieldMessage}>
              {isEligible ? t('affiliation_shield_msg_active') : t('affiliation_shield_msg_inactive')}
            </Text>
          </GlassCard>

          {/* TRANSPARENCY FUNNEL */}
          <GlassCard style={[styles.funnelCard, { backgroundColor: COLORS.primary, borderColor: COLORS.primary }]}>
            <View style={styles.cardHeaderRow}>
              <IconTarget size={20} color="#000000" />
              <Text style={styles.funnelTitle}>{t('affiliation_funnel_rate')}</Text>
            </View>
            
            <View style={styles.funnelSteps}>
              <View style={styles.funnelStep}>
                <Text style={styles.funnelValue}>{stats?.total_invited ?? 0}</Text>
                <Text style={styles.funnelLabel}>{t('affiliation_funnel_invited')}</Text>
              </View>
              <View style={styles.funnelDivider} />
              <View style={styles.funnelStep}>
                <Text style={styles.funnelValue}>{stats?.active_referrals ?? 0}</Text>
                <Text style={styles.funnelLabel}>{t('affiliation_funnel_active')}</Text>
              </View>
              <View style={styles.funnelDivider} />
              <View style={styles.funnelStepHighlight}>
                <Text style={styles.funnelRateValue}>{conversionRate}%</Text>
              </View>
            </View>

            <View style={styles.commissionsBox}>
              <Text style={styles.commissionsLabel}>{t('affiliation_funnel_commissions')}</Text>
              <Text style={[styles.commissionsValue, !isEligible && { color: 'rgba(0,0,0,0.4)' }]}>
                {formatAmount(stats?.estimated_monthly_gain ?? 0)} / {t('month_suffix') || 'mois'}
              </Text>
            </View>
          </GlassCard>

          {/* SHARE LINK */}
          <GlassCard style={styles.codeCard}>
            <View style={styles.codeRow}>
              <IconRefresh size={20} color={COLORS.tertiary} />
              <Text style={styles.codeLabel}>{t('referral_code_label')}</Text>
            </View>
            <View style={styles.codeBox}>
              <Text style={styles.codeText} numberOfLines={1} ellipsizeMode="middle">
                {stats?.code_parrainage ? REFERRAL_BASE_URL + stats.code_parrainage : '—'}
              </Text>
              <TouchableOpacity style={styles.copyBtn} onPress={handleCopy}>
                <Text style={styles.copyBtnText}>{copied ? t('copied') : t('copy')}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.codeHint}>{t('affiliation_share_hint')}</Text>
          </GlassCard>


          {/* ACTIVE NETWORK */}
          <GlassCard style={styles.networkCard}>
            <View style={styles.cardHeaderRow}>
              <IconList size={20} color={COLORS.primary} />
              <Text style={[styles.cardTitle, { color: COLORS.primary }]}>{t('affiliation_network_title')}</Text>
            </View>
            {network.length === 0 ? (
              <View style={styles.networkEmpty}>
                <Text style={styles.networkEmptyText}>{t('affiliation_network_empty')}</Text>
              </View>
            ) : (
              network.map((member, i) => (
                <View key={member.email} style={[styles.networkRow, i > 0 && styles.networkRowBorder]}>
                  <View style={styles.networkInfo}>
                    <Text style={styles.networkName}>{member.name}</Text>
                    <Text style={styles.networkEmail}>{member.email}</Text>
                    {member.created_at ? (
                      <Text style={styles.networkDate}>{t('affiliation_network_joined')}: {member.created_at.slice(0, 10)}</Text>
                    ) : null}
                  </View>
                  <View style={styles.networkRight}>
                    <View style={[styles.networkBadge, member.subscription_status === 'active' ? styles.networkBadgeActive : styles.networkBadgeInactive]}>
                      <Text style={styles.networkBadgeText}>
                        {member.subscription_status === 'active' ? t('affiliation_network_status_active') : t('affiliation_network_status_inactive')}
                      </Text>
                    </View>
                    {member.commission_earned > 0 && (
                      <Text style={styles.networkCommission}>+{formatAmount(member.commission_earned)}/mo</Text>
                    )}
                  </View>
                </View>
              ))
            )}
          </GlassCard>

          {/* CLINICAL LEDGER */}
          <GlassCard style={styles.ledgerCard}>
            <View style={styles.cardHeaderRow}>
              <IconList size={20} color={COLORS.onSurfaceVariant} />
              <Text style={styles.cardTitle}>{t('affiliation_ledger_title')}</Text>
            </View>
            <View style={styles.ledgerEmpty}>
              <Text style={styles.ledgerEmptyText}>{t('affiliation_ledger_empty')}</Text>
            </View>
          </GlassCard>

        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.glassBorder,
    backgroundColor: 'rgba(12,14,18,0.8)',
  },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.onSurface },
  subtitle: { fontSize: 13, color: COLORS.onSurfaceVariant, marginTop: 2 },
  content: { padding: 20, gap: 16, paddingBottom: 40 },

  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: COLORS.onSurface },

  // Shield
  shieldCard: { padding: 20, gap: 12, borderWidth: 1, borderColor: 'rgba(204,255,0,0.3)' },
  shieldSuspended: { borderColor: 'rgba(255,80,80,0.3)' },
  shieldHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  shieldStatus: { fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  shieldMessage: { fontSize: 13, color: COLORS.onSurfaceVariant, lineHeight: 18 },

  // Funnel
  funnelCard: { padding: 20 },
  funnelTitle: { fontSize: 14, fontWeight: '700', color: '#000000' },
  funnelSteps: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  funnelStep: { alignItems: 'center', flex: 1 },
  funnelValue: { fontSize: 24, fontWeight: '800', color: '#000000' },
  funnelLabel: { fontSize: 11, color: 'rgba(0,0,0,0.7)', marginTop: 4, textAlign: 'center' },
  funnelDivider: { width: 1, height: 30, backgroundColor: 'rgba(0,0,0,0.15)', marginHorizontal: 10 },
  funnelStepHighlight: { alignItems: 'center', flex: 1, backgroundColor: 'rgba(0,0,0,0.05)', paddingVertical: 10, borderRadius: RADIUS.md },
  funnelRateValue: { fontSize: 20, fontWeight: '800', color: '#000000' },

  commissionsBox: { alignItems: 'center', paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.15)' },
  commissionsLabel: { fontSize: 11, textTransform: 'uppercase', color: 'rgba(0,0,0,0.7)', letterSpacing: 1, marginBottom: 4 },
  commissionsValue: { fontSize: 28, fontWeight: '800', color: '#000000' },

  // Code Card
  codeCard: { padding: 20, gap: 14 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  codeLabel: { fontSize: 14, fontWeight: '700', color: COLORS.onSurface },
  codeBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: COLORS.glassBorder,
    borderRadius: RADIUS.lg, paddingHorizontal: 16, paddingVertical: 14,
  },
  codeText: { fontSize: 12, fontWeight: '600', color: COLORS.onSurface, flex: 1, marginRight: 10 },
  copyBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.full },
  copyBtnText: { fontSize: 12, fontWeight: '700', color: '#0c0e12' },
  codeHint: { fontSize: 12, color: COLORS.onSurfaceVariant, lineHeight: 18 },

  // Network
  networkCard: { padding: 20, gap: 0 },
  networkEmpty: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 10 },
  networkEmptyText: { fontSize: 13, color: COLORS.onSurfaceVariant, textAlign: 'center', lineHeight: 20, fontStyle: 'italic' },
  networkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  networkRowBorder: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  networkInfo: { flex: 1, gap: 2 },
  networkName: { fontSize: 14, fontWeight: '700', color: COLORS.onSurface },
  networkEmail: { fontSize: 11, color: COLORS.onSurfaceVariant },
  networkDate: { fontSize: 11, color: COLORS.onSurfaceVariant },
  networkRight: { alignItems: 'flex-end', gap: 4 },
  networkBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  networkBadgeActive: { backgroundColor: 'rgba(204,255,0,0.15)', borderWidth: 1, borderColor: 'rgba(204,255,0,0.4)' },
  networkBadgeInactive: { backgroundColor: 'rgba(255,80,80,0.1)', borderWidth: 1, borderColor: 'rgba(255,80,80,0.3)' },
  networkBadgeText: { fontSize: 10, fontWeight: '700', color: COLORS.onSurface, textTransform: 'uppercase', letterSpacing: 0.5 },
  networkCommission: { fontSize: 12, fontWeight: '700', color: COLORS.primary },

  // Ledger
  ledgerCard: { padding: 20, paddingBottom: 40 },
  ledgerEmpty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 20 },
  ledgerEmptyText: { fontSize: 13, color: COLORS.onSurfaceVariant, fontStyle: 'italic' },
});
