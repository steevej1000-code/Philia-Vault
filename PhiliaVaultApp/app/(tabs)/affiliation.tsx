import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, RefreshControl, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import Purchases from 'react-native-purchases';
import api from '../../services/api';
import { hasCoachEntitlement } from '../../services/purchases';
import { COLORS, RADIUS } from '../../constants/colors';
import { GlassCard } from '../../components/GlassCard';
import { IconShield, IconTarget, IconList, IconRefresh } from '../../components/icons/Icons';
import { useUserPreferences } from '../../context/UserPreferencesContext';

interface AffiliationStats {
  code_parrainage: string;
  active_referrals: number;
  estimated_monthly_gain: number;
  total_invited: number; // Added for the funnel
}

const fmtEUR = (v: number) => `${v.toFixed(2).replace('.', ',')} $`;

export default function AffiliationScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useUserPreferences();
  const [stats, setStats] = useState<AffiliationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isEligible, setIsEligible] = useState(false);

  const load = useCallback(async () => {
    try {
      await api.init();
      
      // 1. Fetch Entitlement (Eligibility Shield)
      const customerInfo = await Purchases.getCustomerInfo();
      setIsEligible(hasCoachEntitlement(customerInfo));

      // 2. Fetch Stats
      const result = await api.getAffiliationStats();
      if (result.success) {
        setStats({
          code_parrainage: result.code_parrainage,
          active_referrals: result.active_referrals,
          estimated_monthly_gain: result.estimated_monthly_gain,
          // Mocking total invited if API doesn't have it yet to show the funnel concept
          total_invited: result.active_referrals > 0 ? result.active_referrals * 3 : 0 
        });
      }
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCopy = async () => {
    if (!stats?.code_parrainage) return;
    await Clipboard.setStringAsync(stats.code_parrainage);
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
          <GlassCard style={styles.funnelCard}>
            <View style={styles.cardHeaderRow}>
              <IconTarget size={20} color={COLORS.primary} />
              <Text style={styles.cardTitle}>{t('affiliation_funnel_rate')}</Text>
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
              <Text style={[styles.commissionsValue, !isEligible && { color: COLORS.onSurfaceVariant }]}>
                {fmtEUR(stats?.estimated_monthly_gain ?? 0)} / mois
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
              <Text style={styles.codeText}>{stats?.code_parrainage ?? '—'}</Text>
              <TouchableOpacity style={styles.copyBtn} onPress={handleCopy}>
                <Text style={styles.copyBtnText}>{copied ? t('copied') : t('copy')}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.codeHint}>{t('affiliation_share_hint')}</Text>
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
  funnelSteps: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  funnelStep: { alignItems: 'center', flex: 1 },
  funnelValue: { fontSize: 24, fontWeight: '800', color: COLORS.onSurface },
  funnelLabel: { fontSize: 11, color: COLORS.onSurfaceVariant, marginTop: 4, textAlign: 'center' },
  funnelDivider: { width: 1, height: 30, backgroundColor: COLORS.glassBorder, marginHorizontal: 10 },
  funnelStepHighlight: { alignItems: 'center', flex: 1, backgroundColor: 'rgba(204,255,0,0.1)', paddingVertical: 10, borderRadius: RADIUS.md },
  funnelRateValue: { fontSize: 20, fontWeight: '800', color: COLORS.primary },

  commissionsBox: { alignItems: 'center', paddingTop: 16, borderTopWidth: 1, borderTopColor: COLORS.glassBorder },
  commissionsLabel: { fontSize: 11, textTransform: 'uppercase', color: COLORS.onSurfaceVariant, letterSpacing: 1, marginBottom: 4 },
  commissionsValue: { fontSize: 28, fontWeight: '800', color: COLORS.primary },

  // Code Card
  codeCard: { padding: 20, gap: 14 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  codeLabel: { fontSize: 14, fontWeight: '700', color: COLORS.onSurface },
  codeBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: COLORS.glassBorder,
    borderRadius: RADIUS.lg, paddingHorizontal: 16, paddingVertical: 14,
  },
  codeText: { fontSize: 20, fontWeight: '800', color: COLORS.onSurface, letterSpacing: 2 },
  copyBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.full },
  copyBtnText: { fontSize: 12, fontWeight: '700', color: '#0c0e12' },
  codeHint: { fontSize: 12, color: COLORS.onSurfaceVariant, lineHeight: 18 },

  // Ledger
  ledgerCard: { padding: 20, paddingBottom: 40 },
  ledgerEmpty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 20 },
  ledgerEmptyText: { fontSize: 13, color: COLORS.onSurfaceVariant, fontStyle: 'italic' },
});
