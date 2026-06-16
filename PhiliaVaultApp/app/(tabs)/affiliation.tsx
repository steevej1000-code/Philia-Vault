import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, RefreshControl, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import api from '../../services/api';
import { COLORS, RADIUS } from '../../constants/colors';
import { GlassCard } from '../../components/GlassCard';
import { IconGift, IconTrendUp, IconAssets } from '../../components/icons/Icons';
import { useUserPreferences } from '../../context/UserPreferencesContext';

interface AffiliationStats {
  code_parrainage: string;
  active_referrals: number;
  estimated_monthly_gain: number;
}

const fmtEUR = (v: number) => `${v.toFixed(2).replace('.', ',')} €`;

export default function AffiliationScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useUserPreferences();
  const [stats, setStats] = useState<AffiliationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const handlePingPress = () => {
    Alert.alert(
      t('affiliation_ping_title'),
      t('affiliation_ping_message'),
      [
        {
          text: t('affiliation_ping_btn_cancel'),
          style: 'cancel',
        },
        {
          text: t('affiliation_ping_btn_confirm'),
          onPress: () => {
            Alert.alert(t('success') || 'Succès', t('affiliation_ping_success'));
          },
        },
      ]
    );
  };

  const load = useCallback(async () => {
    try {
      await api.init();
      const result = await api.getAffiliationStats();
      if (result.success) {
        setStats({
          code_parrainage: result.code_parrainage,
          active_referrals: result.active_referrals,
          estimated_monthly_gain: result.estimated_monthly_gain,
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
          <View style={styles.introCard}>
            <Text style={styles.introText}>{t('affiliation_intro')}</Text>
          </View>

          <GlassCard style={styles.gainCard}>
            <View style={styles.gainIcon}>
              <IconTrendUp size={22} color={COLORS.primary} />
            </View>
            <Text style={styles.gainLabel}>{t('estimated_monthly_gain')}</Text>
            <Text style={styles.gainValue}>
              {fmtEUR(stats?.estimated_monthly_gain ?? 0)} {t('per_month')}
            </Text>
          </GlassCard>

          <GlassCard style={styles.codeCard}>
            <View style={styles.codeRow}>
              <IconGift size={20} color={COLORS.tertiary} />
              <Text style={styles.codeLabel}>{t('referral_code_label')}</Text>
            </View>
            <View style={styles.codeBox}>
              <Text style={styles.codeText}>{stats?.code_parrainage ?? '—'}</Text>
              <TouchableOpacity style={styles.copyBtn} onPress={handleCopy}>
                <Text style={styles.copyBtnText}>{copied ? t('copied') : t('copy')}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.codeHint}>
              {t('referral_hint')}
            </Text>
          </GlassCard>

          <GlassCard style={styles.statCard}>
            <View style={styles.statIcon}>
              <IconAssets size={20} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.statLabel}>{t('active_referrals')}</Text>
              <Text style={styles.statSubtitle}>{t('active_referrals_subtitle')}</Text>
            </View>
            <Text style={styles.statValue}>{stats?.active_referrals ?? 0}</Text>
          </GlassCard>

          <TouchableOpacity
            style={styles.pingBtn}
            onPress={handlePingPress}
            activeOpacity={0.8}
          >
            <Text style={styles.pingBtnText}>⚡ {t('affiliation_ping_title')}</Text>
          </TouchableOpacity>
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

  gainCard: { alignItems: 'center', paddingVertical: 28, gap: 8 },
  gainIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(204,255,0,0.12)',
    marginBottom: 4,
  },
  gainLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.onSurfaceVariant,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  gainValue: { fontSize: 30, fontWeight: '800', color: COLORS.primary },

  codeCard: { padding: 20, gap: 14 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  codeLabel: { fontSize: 14, fontWeight: '700', color: COLORS.onSurface },
  codeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  codeText: { fontSize: 20, fontWeight: '800', color: COLORS.onSurface, letterSpacing: 2 },
  copyBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
  },
  copyBtnText: { fontSize: 12, fontWeight: '700', color: '#0c0e12' },
  codeHint: { fontSize: 12, color: COLORS.onSurfaceVariant, lineHeight: 18 },

  statCard: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  statIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(204,255,0,0.1)',
  },
  statLabel: { fontSize: 15, fontWeight: '700', color: COLORS.onSurface },
  statSubtitle: { fontSize: 12, color: COLORS.onSurfaceVariant, marginTop: 2 },
  statValue: { fontSize: 24, fontWeight: '800', color: COLORS.primary },

  introCard: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: RADIUS.lg,
    padding: 16,
    marginBottom: 4,
  },
  introText: {
    fontSize: 13,
    color: COLORS.onSurfaceVariant,
    lineHeight: 20,
    textAlign: 'center',
  },
  pingBtn: {
    backgroundColor: 'rgba(200,255,0,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(200,255,0,0.3)',
    borderRadius: RADIUS.full,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  pingBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#c8ff00',
  },
});
