import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Animated
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { COLORS, RADIUS } from '../../constants/colors';
import { GlassCard } from '../../components/GlassCard';
import api from '../../services/api';
import { IconTrendUp, IconClock, IconWallet, IconTarget } from '../../components/icons/Icons';
import { useUserPreferences } from '../../context/UserPreferencesContext';

const fmtCurrency = (v: number, symbol: string = '$') => {
  const prefix = v > 0 ? '+' : '';
  const sign = v < 0 ? '-' : '';
  const absVal = Math.abs(v);
  let valStr = '';
  if (absVal >= 1000000) {
    valStr = `${(absVal / 1000000).toFixed(2)}M`;
  } else if (absVal >= 1000) {
    valStr = `${(absVal / 1000).toFixed(1)}k`;
  } else {
    valStr = absVal.toFixed(0);
  }
  if (symbol === '€') {
    return `${prefix}${sign}${valStr} ${symbol}`;
  }
  return `${prefix}${sign}${symbol}${valStr}`;
};

export default function SimulatorScreen() {
  const insets = useSafeAreaInsets();
  const { t, currencySymbol } = useUserPreferences();

  const [capital, setCapital] = useState('45000');
  const [monthlyReturn, setMonthlyReturn] = useState('500');
  const [monthlyExpense, setMonthlyExpense] = useState('2000');
  const [investmentName, setInvestmentName] = useState(t('new_acquisition'));
  const [prefilled, setPrefilled] = useState(false);
  const [focusedInput, setFocusedInput] = useState<'name' | 'capital' | 'return' | 'expense' | null>(null);

  // Pre-fill the simulator with the user's real portfolio totals the first time
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

  // 1. Breathing Neon Animation (Zone Haute - Le Miroir)
  const breathingAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(breathingAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: false, // colors & shadow properties do not support native driver
        }),
        Animated.timing(breathingAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: false,
        }),
      ])
    ).start();
  }, []);

  const isPositive = netCashflow >= 0;
  const glowColor = isPositive ? '#C8FF00' : '#FF3B3B';
  const startColor = isPositive ? 'rgba(200, 255, 0, 0.15)' : 'rgba(255, 59, 59, 0.15)';

  const animatedBorderColor = breathingAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [startColor, glowColor],
  });

  const animatedShadowColor = breathingAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [startColor, glowColor],
  });

  const animatedShadowOpacity = breathingAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.15, 0.55],
  });

  const animatedShadowRadius = breathingAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [4, 12],
  });

  const animatedTextColor = breathingAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [isPositive ? '#a3e635' : '#ef4444', glowColor],
  });

  // 2. Results recalculation slide-up + fade-in (Zone Basse - L'Itinéraire)
  const resultsAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    resultsAnim.setValue(0);
    Animated.spring(resultsAnim, {
      toValue: 1,
      tension: 60,
      friction: 8,
      useNativeDriver: true,
    }).start();
  }, [roi, breakEvenMonths, netCashflow, yieldNum]);

  const animatedValueStyle = {
    opacity: resultsAnim,
    transform: [
      {
        translateY: resultsAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [10, 0],
        }),
      },
    ],
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{t('simulator_title')}</Text>
          <Text style={styles.subtitle}>{t('simulator_subtitle')}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Zone Haute: Le Miroir */}
        <Animated.View style={[
          styles.mirrorCard,
          {
            borderColor: animatedBorderColor,
            shadowColor: animatedShadowColor,
            shadowOpacity: animatedShadowOpacity,
            shadowRadius: animatedShadowRadius,
          }
        ]}>
          <Text style={styles.sectionTitle}>{investmentName || t('simulation_label')}</Text>
          <View style={styles.mirrorContainer}>
            <Animated.Text style={[styles.mirrorValue, { color: animatedTextColor }]}>
              {fmtCurrency(netCashflow, currencySymbol)}
            </Animated.Text>
            <Text style={styles.mirrorLabel}>{t('net_per_month')}</Text>
          </View>
        </Animated.View>

        {/* Zone Moyenne: Le Tableau de Bord du GPS (Les Paramètres) */}
        <GlassCard>
          <Text style={styles.sectionTitle}>{t('parameters')}</Text>
          <View style={styles.form}>
            <View>
              <Text style={styles.label}>{t('investment_name_label')}</Text>
              <TextInput
                style={[
                  styles.input,
                  focusedInput === 'name' && styles.inputFocusGreen
                ]}
                value={investmentName}
                onChangeText={setInvestmentName}
                onFocus={() => setFocusedInput('name')}
                onBlur={() => setFocusedInput(null)}
                placeholderTextColor={COLORS.outline}
              />
            </View>
            <View>
              <Text style={styles.label}>{t('invested_capital_label')}</Text>
              <TextInput
                style={[
                  styles.input,
                  focusedInput === 'capital' && styles.inputFocusGreen
                ]}
                value={capital}
                onChangeText={setCapital}
                keyboardType="numeric"
                onFocus={() => setFocusedInput('capital')}
                onBlur={() => setFocusedInput(null)}
                placeholderTextColor={COLORS.outline}
              />
            </View>
            <View>
              <Text style={styles.label}>{t('monthly_return_label')}</Text>
              <TextInput
                style={[
                  styles.input,
                  focusedInput === 'return' && styles.inputFocusGreen
                ]}
                value={monthlyReturn}
                onChangeText={setMonthlyReturn}
                keyboardType="numeric"
                onFocus={() => setFocusedInput('return')}
                onBlur={() => setFocusedInput(null)}
                placeholderTextColor={COLORS.outline}
              />
            </View>
            <View>
              <Text style={styles.label}>{t('monthly_expenses_label')}</Text>
              <TextInput
                style={[
                  styles.input,
                  focusedInput === 'expense' && styles.inputFocusRed
                ]}
                value={monthlyExpense}
                onChangeText={setMonthlyExpense}
                keyboardType="numeric"
                onFocus={() => setFocusedInput('expense')}
                onBlur={() => setFocusedInput(null)}
                placeholderTextColor={COLORS.outline}
              />
            </View>
          </View>
        </GlassCard>

        {/* Zone Basse: L'Itinéraire du GPS (Les Résultats) */}
        <GlassCard>
          <Text style={styles.sectionTitle}>{t('simulation_results')}</Text>
          <View style={styles.resultsGrid}>
            <View style={styles.resultCard}>
              <IconTrendUp size={24} color="#C8FF00" />
              <Animated.Text style={[styles.resultValue, animatedValueStyle, { color: '#C8FF00' }]} numberOfLines={1}>
                {roi.toFixed(1)}%
              </Animated.Text>
              <Text style={styles.resultLabel}>{t('annual_roi')}</Text>
            </View>
            
            <View style={styles.resultCard}>
              <IconClock size={24} color="#FFFFFF" opacity={0.8} />
              <Animated.Text style={[styles.resultValue, animatedValueStyle, { color: '#FFFFFF' }]} numberOfLines={1}>
                {isFinite(breakEvenMonths) ? `${breakEvenMonths}m` : '∞'}
              </Animated.Text>
              <Text style={styles.resultLabel}>{t('breakeven_point')}</Text>
            </View>
            
            <View style={styles.resultCard}>
              <IconWallet size={24} color={netCashflow >= 0 ? '#C8FF00' : '#FF3B3B'} />
              <Animated.Text style={[styles.resultValue, animatedValueStyle, { color: netCashflow >= 0 ? '#C8FF00' : '#FF3B3B' }]} numberOfLines={1}>
                {fmtCurrency(netCashflow, currencySymbol)}
              </Animated.Text>
              <Text style={styles.resultLabel}>{t('net_cashflow_result')}</Text>
            </View>
            
            <View style={styles.resultCard}>
              <IconTarget size={24} color="#C8FF00" />
              <Animated.Text style={[styles.resultValue, animatedValueStyle, { color: '#FFFFFF' }]} numberOfLines={1}>
                {fmtCurrency(yieldNum * 12, currencySymbol)}
              </Animated.Text>
              <Text style={styles.resultLabel}>{t('annual_income')}</Text>
            </View>
          </View>
        </GlassCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  header: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', backgroundColor: '#000000' },
  title: { fontSize: 22, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: '#8e8e93', marginTop: 2, fontWeight: '500' },
  scroll: { padding: 20, gap: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#8e8e93', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 },
  
  // Zone Haute
  mirrorCard: {
    backgroundColor: 'rgba(20, 24, 33, 0.7)',
    borderRadius: RADIUS.xxl,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    elevation: 8,
  },
  mirrorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  mirrorValue: {
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: -1.5,
  },
  mirrorLabel: {
    fontSize: 11,
    color: '#8e8e93',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 6,
  },

  // Zone Moyenne
  form: { gap: 16 },
  label: { fontSize: 11, fontWeight: '800', color: '#8e8e93', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  input: {
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: '#1A1A1A',
    borderRadius: RADIUS.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#FFFFFF',
  },
  inputFocusGreen: {
    borderColor: '#C8FF00',
    shadowColor: '#C8FF00',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 2,
  },
  inputFocusRed: {
    borderColor: '#FF3B3B',
    shadowColor: '#FF3B3B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 2,
  },

  // Zone Basse
  resultsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  resultCard: {
    width: '47%',
    borderRadius: RADIUS.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    backgroundColor: 'rgba(20, 24, 33, 0.7)',
    alignItems: 'center',
    gap: 8,
  },
  resultValue: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5, marginTop: 4 },
  resultLabel: { fontSize: 9, color: '#8e8e93', fontWeight: '700', textAlign: 'center', letterSpacing: 0.2, textTransform: 'uppercase', lineHeight: 12 },
});
