import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, RADIUS } from '../../constants/colors';
import { GlassCard } from '../../components/GlassCard';
import api from '../../services/api';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop, Circle } from 'react-native-svg';
import { IconTrendUp, IconClock, IconWallet, IconTarget } from '../../components/icons/Icons';
import { useUserPreferences } from '../../context/UserPreferencesContext';

const fmtCurrency = (v: number) => {
  const prefix = v >= 0 ? '+' : '';
  if (Math.abs(v) >= 1000000) return `${prefix}$${(v / 1000000).toFixed(2)}M`;
  if (Math.abs(v) >= 1000) return `${prefix}$${(v / 1000).toFixed(1)}k`;
  return `${prefix}$${v.toFixed(0)}`;
};

function BalanceGauge({ netCashflow, netLabel }: { netCashflow: number; netLabel: string }) {
  const max = 5000;
  const clamped = Math.max(-max, Math.min(max, netCashflow));
  const pct = (clamped + max) / (2 * max); // 0 = full negative, 0.5 = break-even, 1 = full positive

  const r = 70;
  const circumference = Math.PI * r;
  const offset = circumference * (1 - pct);
  const color = netCashflow > 0 ? '#ccff00' : netCashflow === 0 ? '#f59e0b' : '#ef4444';

  return (
    <View style={gaugeStyles.wrapper}>
      <Svg width={160} height={90} viewBox="0 0 160 90">
        <Defs>
          <SvgGradient id="balGrad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#ef4444" />
            <Stop offset="0.5" stopColor="#f59e0b" />
            <Stop offset="1" stopColor="#ccff00" />
          </SvgGradient>
        </Defs>
        <Path
          d="M 10 80 A 70 70 0 0 1 150 80"
          fill="none"
          stroke={COLORS.surfaceContainerHighest}
          strokeWidth="14"
          strokeLinecap="round"
        />
        <Path
          d="M 10 80 A 70 70 0 0 1 150 80"
          fill="none"
          stroke="url(#balGrad)"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={`${offset}`}
        />
      </Svg>
      <View style={gaugeStyles.center}>
        <Text style={[gaugeStyles.value, { color }]}>{fmtCurrency(netCashflow)}</Text>
        <Text style={gaugeStyles.label}>{netLabel}</Text>
      </View>
    </View>
  );
}

const gaugeStyles = StyleSheet.create({
  wrapper: { alignItems: 'center', height: 110 },
  center: { position: 'absolute', bottom: 8, alignItems: 'center' },
  value: { fontSize: 28, fontWeight: '900', letterSpacing: -1 },
  label: { fontSize: 11, color: COLORS.onSurfaceVariant, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
});

export default function SimulatorScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useUserPreferences();

  const [capital, setCapital] = useState('45000');
  const [monthlyReturn, setMonthlyReturn] = useState('500');
  const [monthlyExpense, setMonthlyExpense] = useState('2000');
  const [investmentName, setInvestmentName] = useState(t('new_acquisition'));
  const [prefilled, setPrefilled] = useState(false);

  // Pre-fill the simulator with the user's real portfolio totals the first
  // time this screen is opened, so "La Balance" reflects actual data instead
  // of always showing the same hardcoded placeholder values.
  useFocusEffect(
    useCallback(() => {
      if (prefilled) return;
      let cancelled = false;
      (async () => {
        try {
          await api.init();
          const result = await api.getSummary();
          if (cancelled || !result?.success) return;
          if (result.total_assets) setCapital(String(result.total_assets));
          if (result.total_passive_income) setMonthlyReturn(String(result.total_passive_income));
          if (result.total_monthly_cost) setMonthlyExpense(String(result.total_monthly_cost));
        } catch (e) {
          console.warn(t('portfolio_load_error'), e);
        } finally {
          if (!cancelled) setPrefilled(true);
        }
      })();
      return () => { cancelled = true; };
    }, [prefilled])
  );

  const capNum = parseFloat(capital) || 0;
  const yieldNum = parseFloat(monthlyReturn) || 0;
  const expenseNum = parseFloat(monthlyExpense) || 0;
  const netCashflow = yieldNum - expenseNum;
  const roi = capNum > 0 ? ((yieldNum * 12) / capNum) * 100 : 0;
  const breakEvenMonths = yieldNum > 0 ? Math.ceil(capNum / yieldNum) : Infinity;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{t('simulator_title')}</Text>
          <Text style={styles.subtitle}>{t('simulator_subtitle')}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Gauge */}
        <GlassCard style={styles.gaugeCard}>
          <Text style={styles.sectionTitle}>{investmentName || t('simulation_label')}</Text>
          <BalanceGauge netCashflow={netCashflow} netLabel={t('net_per_month')} />
          <View style={styles.gaugeRow}>
            <View style={styles.gaugeLabel}>
              <View style={[styles.dot, { backgroundColor: COLORS.error }]} />
              <Text style={styles.gaugeLabelText}>{t('expenses_label')}</Text>
            </View>
            <View style={styles.gaugeLabel}>
              <View style={[styles.dot, { backgroundColor: COLORS.primary }]} />
              <Text style={styles.gaugeLabelText}>{t('income_label')}</Text>
            </View>
          </View>
        </GlassCard>

        {/* Inputs */}
        <GlassCard>
          <Text style={styles.sectionTitle}>{t('parameters')}</Text>
          <View style={styles.form}>
            <View>
              <Text style={styles.label}>{t('investment_name_label')}</Text>
              <TextInput
                style={styles.input}
                value={investmentName}
                onChangeText={setInvestmentName}
                placeholderTextColor={COLORS.outline}
              />
            </View>
            <View>
              <Text style={styles.label}>{t('invested_capital_label')}</Text>
              <TextInput
                style={styles.input}
                value={capital}
                onChangeText={setCapital}
                keyboardType="numeric"
                placeholderTextColor={COLORS.outline}
              />
            </View>
            <View>
              <Text style={styles.label}>{t('monthly_return_label')}</Text>
              <TextInput
                style={[styles.input, { borderColor: 'rgba(204,255,0,0.3)' }]}
                value={monthlyReturn}
                onChangeText={setMonthlyReturn}
                keyboardType="numeric"
                placeholderTextColor={COLORS.outline}
              />
            </View>
            <View>
              <Text style={styles.label}>{t('monthly_expenses_label')}</Text>
              <TextInput
                style={[styles.input, { borderColor: 'rgba(239,68,68,0.3)' }]}
                value={monthlyExpense}
                onChangeText={setMonthlyExpense}
                keyboardType="numeric"
                placeholderTextColor={COLORS.outline}
              />
            </View>
          </View>
        </GlassCard>

        {/* Results */}
        <GlassCard>
          <Text style={styles.sectionTitle}>{t('simulation_results')}</Text>
          <View style={styles.resultsGrid}>
            <View style={[styles.resultCard, { backgroundColor: 'rgba(204,255,0,0.08)', borderColor: 'rgba(204,255,0,0.2)' }]}>
              <IconTrendUp size={26} color={COLORS.primary} />
              <Text style={styles.resultValue} numberOfLines={1}>{roi.toFixed(1)}%</Text>
              <Text style={styles.resultLabel}>{t('annual_roi')}</Text>
            </View>
            <View style={[styles.resultCard, { backgroundColor: 'rgba(6,182,212,0.08)', borderColor: 'rgba(6,182,212,0.2)' }]}>
              <IconClock size={26} color="#06b6d4" />
              <Text style={styles.resultValue} numberOfLines={1}>
                {isFinite(breakEvenMonths) ? `${breakEvenMonths}m` : '∞'}
              </Text>
              <Text style={styles.resultLabel}>{t('breakeven_point')}</Text>
            </View>
            <View style={[styles.resultCard, { backgroundColor: netCashflow >= 0 ? 'rgba(204,255,0,0.08)' : 'rgba(239,68,68,0.08)', borderColor: netCashflow >= 0 ? 'rgba(204,255,0,0.2)' : 'rgba(239,68,68,0.2)' }]}>
              <IconWallet size={26} color={netCashflow >= 0 ? COLORS.primary : COLORS.error} />
              <Text style={[styles.resultValue, { color: netCashflow >= 0 ? COLORS.primary : COLORS.error }]} numberOfLines={1}>
                {fmtCurrency(netCashflow)}
              </Text>
              <Text style={styles.resultLabel}>{t('net_cashflow_result')}</Text>
            </View>
            <View style={[styles.resultCard, { backgroundColor: 'rgba(139,92,246,0.08)', borderColor: 'rgba(139,92,246,0.2)' }]}>
              <IconTarget size={26} color={COLORS.tertiary} />
              <Text style={[styles.resultValue, { color: COLORS.tertiary }]} numberOfLines={1}>
                {fmtCurrency(yieldNum * 12)}
              </Text>
              <Text style={styles.resultLabel}>{t('annual_income')}</Text>
            </View>
          </View>
        </GlassCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.glassBorder, backgroundColor: 'rgba(12,14,18,0.8)' },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.onSurface },
  subtitle: { fontSize: 13, color: COLORS.onSurfaceVariant, marginTop: 2 },
  scroll: { padding: 20, gap: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: COLORS.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 16 },
  gaugeCard: { alignItems: 'center', paddingVertical: 24 },
  gaugeRow: { flexDirection: 'row', gap: 24, marginTop: 12 },
  gaugeLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  gaugeLabelText: { fontSize: 12, color: COLORS.onSurfaceVariant, fontWeight: '500' },
  form: { gap: 16 },
  label: { fontSize: 11, fontWeight: '700', color: COLORS.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  input: { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: COLORS.glassBorder, borderRadius: RADIUS.lg, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: COLORS.onSurface },
  resultsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  resultCard: { width: '47%', borderRadius: RADIUS.xl, padding: 16, borderWidth: 1, alignItems: 'center', gap: 4 },
  resultEmoji: { fontSize: 28, marginBottom: 4 },
  resultValue: { fontSize: 20, fontWeight: '800', color: COLORS.onSurface, letterSpacing: -0.5 },
  resultLabel: { fontSize: 11, color: COLORS.onSurfaceVariant, fontWeight: '600', textAlign: 'center' },
});
