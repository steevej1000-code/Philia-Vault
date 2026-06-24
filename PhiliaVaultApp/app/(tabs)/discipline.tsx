import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, Animated, ScrollView, Alert,
  KeyboardAvoidingView, Platform, Keyboard
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { useFocusEffect } from 'expo-router';
import api from '../../services/api';
import { COLORS, RADIUS, SHADOW } from '../../constants/colors';
import { useUserPreferences } from '../../context/UserPreferencesContext';

// Set up localized names for react-native-calendars
LocaleConfig.locales['en'] = {
  monthNames: ['January','February','March','April','May','June','July','August','September','October','November','December'],
  monthNamesShort: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
  dayNames: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
  dayNamesShort: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
  today: 'Today'
};
LocaleConfig.locales['fr'] = {
  monthNames: ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'],
  monthNamesShort: ['Janv.','Févr.','Mars','Avril','Mai','Juin','Juil.','Août','Sept.','Oct.','Nov.','Déc.'],
  dayNames: ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'],
  dayNamesShort: ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'],
  today: "Aujourd'hui"
};
LocaleConfig.locales['es'] = {
  monthNames: ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],
  monthNamesShort: ['Ene.','Feb.','Mar.','Abr.','May.','Jun.','Jul.','Ago.','Sep.','Oct.','Nov.','Dic.'],
  dayNames: ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'],
  dayNamesShort: ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'],
  today: 'Hoy'
};
LocaleConfig.locales['pt'] = {
  monthNames: ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'],
  monthNamesShort: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'],
  dayNames: ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'],
  dayNamesShort: ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'],
  today: 'Hoje'
};

interface DisciplineHistoryItem {
  date: string;
  status: 'success' | 'failed';
  amount_spent: number;
  freedom_days_earned: number;
}

export default function DisciplineScreen() {
  const insets = useSafeAreaInsets();
  const { t, language, formatAmount } = useUserPreferences();

  // Selected date defaults to today
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [currentVisibleMonth, setCurrentVisibleMonth] = useState(new Date().toISOString().split('T')[0]);
  const [amountSpent, setAmountSpent] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [history, setHistory] = useState<DisciplineHistoryItem[]>([]);
  const [streak, setStreak] = useState(0);
  const [totalFreedomDays, setTotalFreedomDays] = useState(0.0);
  const [dailyBudget, setDailyBudget] = useState(0.0);
  const [logStatusMessage, setLogStatusMessage] = useState<string | null>(null);
  const [isSuccessLog, setIsSuccessLog] = useState(true);
  const [inputFocused, setInputFocused] = useState(false);

  // Animations
  const flashAnim = useRef(new Animated.Value(0)).current;
  const floatTextAnim = useRef(new Animated.Value(0)).current;
  const floatTextOpacity = useRef(new Animated.Value(0)).current;

  // Set default calendar locale based on user preference
  useEffect(() => {
    if (language && LocaleConfig.locales[language]) {
      LocaleConfig.defaultLocale = language;
    } else {
      LocaleConfig.defaultLocale = ''; // Safely fall back to internal default
    }
  }, [language]);

  // Load history data for visible month range
  const loadHistoryData = useCallback(async (baseDateStr: string) => {
    try {
      setLoadingHistory(true);
      const d = new Date(baseDateStr);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      
      const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
      const endStr = `${year}-${String(month).padStart(2, '0')}-31`; // Backend handles safe dates

      const result = await api.getDisciplineHistory(startStr, endStr);
      if (result.success) {
        setHistory(result.history || []);
        setStreak(result.streak || 0);
        setTotalFreedomDays(result.total_freedom_days || 0.0);
      }
    } catch (e) {
      console.error('Failed to load discipline history:', e);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  // Load cashflow / daily budget
  const loadBudgetDetails = useCallback(async () => {
    try {
      const summary = await api.getSummary();
      if (summary.success) {
        const avail = summary.available_cashflow || 0.0;
        setDailyBudget(avail / 30.0);
      }
    } catch (e) {
      console.error('Failed to load user summary budget:', e);
    }
  }, []);

  // Fetch all on focus
  useFocusEffect(
    useCallback(() => {
      loadHistoryData(currentVisibleMonth);
      loadBudgetDetails();
    }, [loadHistoryData, loadBudgetDetails, currentVisibleMonth])
  );

  // Trigger neon green screen flash animation
  const triggerSuccessFlash = (earnedDays: number) => {
    // Reset values
    flashAnim.setValue(0);
    floatTextAnim.setValue(50);
    floatTextOpacity.setValue(0);

    // Sequence
    Animated.parallel([
      // Overlay Flash
      Animated.sequence([
        Animated.timing(flashAnim, {
          toValue: 0.75,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(flashAnim, {
          toValue: 0,
          duration: 650,
          useNativeDriver: true,
        }),
      ]),
      // Floating Text overlay
      Animated.sequence([
        Animated.parallel([
          Animated.timing(floatTextOpacity, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(floatTextAnim, {
            toValue: -80,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(floatTextOpacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  };

  const handleValidate = async () => {
    if (!amountSpent.trim()) {
      Alert.alert(t('error'), t('discipline_spent_placeholder'));
      return;
    }

    const spent = parseFloat(amountSpent.replace(',', '.'));
    if (isNaN(spent) || spent < 0) {
      Alert.alert(t('error'), t('discipline_spent_placeholder'));
      return;
    }

    Keyboard.dismiss();
    setLoading(true);
    setLogStatusMessage(null);

    try {
      const result = await api.logDiscipline(spent, selectedDate);
      if (result.success) {
        const isSuccess = result.status === 'success';
        setIsSuccessLog(isSuccess);
        
        if (isSuccess) {
          setLogStatusMessage(t('discipline_success_msg').replace('{days}', result.freedom_days_earned.toFixed(2)));
          triggerSuccessFlash(result.freedom_days_earned);
        } else {
          setLogStatusMessage(t('discipline_failed_msg'));
        }

        // Refresh statistics and calendar
        setStreak(result.streak);
        setTotalFreedomDays(result.total_freedom_days);
        setAmountSpent('');
        
        // Refresh visible month history
        loadHistoryData(currentVisibleMonth);
      }
    } catch (e: any) {
      Alert.alert(t('error'), e.message || 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  // Build calendar markedDates dynamically
  const getMarkedDates = () => {
    const marked: Record<string, any> = {};

    // Populated from backend discipline logs
    history.forEach((item) => {
      const isSuccess = item.status === 'success';
      marked[item.date] = {
        customStyles: {
          container: {
            backgroundColor: isSuccess ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            borderWidth: 1,
            borderColor: isSuccess ? '#22c55e' : '#ef4444',
            borderRadius: RADIUS.md,
          },
          text: {
            color: isSuccess ? '#22c55e' : '#ef4444',
            fontWeight: 'bold',
          }
        }
      };
    });

    // Merge or highlight the selected date
    const selectedExisting = marked[selectedDate];
    marked[selectedDate] = {
      customStyles: {
        container: {
          backgroundColor: selectedExisting?.customStyles?.container?.backgroundColor || 'rgba(255, 255, 255, 0.05)',
          borderWidth: 2,
          borderColor: COLORS.primary,
          borderRadius: RADIUS.md,
          shadowColor: COLORS.primary,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.6,
          shadowRadius: 6,
        },
        text: {
          color: selectedExisting?.customStyles?.text?.color || '#f8fafc',
          fontWeight: 'bold',
        }
      }
    };

    return marked;
  };

  const handleMonthChange = (monthObj: any) => {
    setCurrentVisibleMonth(monthObj.dateString);
    loadHistoryData(monthObj.dateString);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Title Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{t('discipline_title')}</Text>
          <Text style={styles.subtitle}>{t('discipline_subtitle')}</Text>
        </View>

        {/* Position 1: Calendar Dashboard */}
        <View style={styles.calendarContainer}>
          {loadingHistory && (
            <View style={styles.calendarLoader}>
              <ActivityIndicator color={COLORS.primary} size="small" />
            </View>
          )}
          <Calendar
            current={currentVisibleMonth}
            onMonthChange={handleMonthChange}
            onDayPress={(day) => setSelectedDate(day.dateString)}
            markedDates={getMarkedDates()}
            markingType={'custom'}
            theme={{
              backgroundColor: '#000000',
              calendarBackground: '#0c0e12',
              textSectionTitleColor: COLORS.onSurfaceVariant,
              selectedDayBackgroundColor: COLORS.primary,
              selectedDayTextColor: '#000000',
              todayTextColor: COLORS.primary,
              dayTextColor: COLORS.onSurface,
              textDisabledColor: '#334155',
              dotColor: COLORS.primary,
              selectedDotColor: '#000000',
              arrowColor: COLORS.primary,
              disabledArrowColor: '#334155',
              monthTextColor: COLORS.onSurface,
              indicatorColor: COLORS.primary,
              textDayFontFamily: 'PlusJakartaSans-Regular',
              textMonthFontFamily: 'Montserrat-Bold',
              textDayHeaderFontFamily: 'PlusJakartaSans-SemiBold',
              textDayFontSize: 13,
              textMonthFontSize: 16,
              textDayHeaderFontSize: 11,
            }}
            style={styles.calendar}
          />
        </View>

        {/* Position 2: Action du Jour Widget */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>
            {selectedDate === new Date().toISOString().split('T')[0]
              ? t('greeting_today') || 'Today'
              : selectedDate}
          </Text>
          
          <View style={styles.budgetIndicator}>
            <Text style={styles.budgetText}>
              Daily Budget Limit: <Text style={styles.budgetAmount}>{formatAmount(dailyBudget)}</Text>
            </Text>
          </View>

          <View style={[styles.inputWrapper, inputFocused && styles.inputFocused]}>
            <TextInput
              style={styles.input}
              placeholder={t('discipline_spent_placeholder')}
              placeholderTextColor={COLORS.onSurfaceVariant}
              keyboardType="numeric"
              value={amountSpent}
              onChangeText={setAmountSpent}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
            />
          </View>

          {logStatusMessage && (
            <View style={[
              styles.statusBanner,
              isSuccessLog ? styles.successBanner : styles.failedBanner
            ]}>
              <Text style={[
                styles.statusText,
                isSuccessLog ? styles.successText : styles.failedText
              ]}>
                {logStatusMessage}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.validateBtn}
            onPress={handleValidate}
            activeOpacity={0.8}
            disabled={loading}
          >
            <LinearGradient
              colors={['#ccff00', '#a3e635']}
              style={styles.validateBtnGrad}
            >
              {loading ? (
                <ActivityIndicator color="#0c0e12" />
              ) : (
                <Text style={styles.validateText}>{t('discipline_validate_btn')}</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Position 3: Discipline Statistics */}
        <View style={styles.statsContainer}>
          {/* Active Streak Card */}
          <View style={styles.statCard}>
            <Text style={styles.streakEmoji}>🔥</Text>
            <Text style={styles.statLabel}>Streak</Text>
            <Text style={styles.statValue}>{streak} days</Text>
          </View>

          {/* Life Freedom Accumulated */}
          <View style={[styles.statCard, styles.freedomCard]}>
            <Text style={styles.freedomLabel}>{t('discipline_freedom_earned').split(':')[0]}</Text>
            <Text style={styles.freedomValue}>{totalFreedomDays.toFixed(2)}</Text>
            <Text style={styles.freedomDaysLabel}>DAYS OF FREEDOM</Text>
          </View>
        </View>
      </ScrollView>

      {/* High-Performance Green Flash Overlay */}
      <Animated.View
        style={[
          styles.flashOverlay,
          {
            opacity: flashAnim,
          }
        ]}
        pointerEvents="none"
      />

      {/* Floating text display during success validation */}
      <Animated.View
        style={[
          styles.floatContainer,
          {
            opacity: floatTextOpacity,
            transform: [{ translateY: floatTextAnim }]
          }
        ]}
        pointerEvents="none"
      >
        <Text style={styles.floatText}>LIBERTÉ</Text>
        <Text style={styles.floatSubtitle}>SUCCESS REDEEMED</Text>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  header: {
    marginTop: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  title: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 24,
    color: COLORS.onSurface,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: 'PlusJakartaSans-Regular',
    fontSize: 14,
    color: COLORS.onSurfaceVariant,
    marginTop: 4,
  },
  calendarContainer: {
    backgroundColor: '#0c0e12',
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    overflow: 'hidden',
    marginBottom: 16,
    position: 'relative',
  },
  calendarLoader: {
    position: 'absolute',
    top: 8,
    right: 12,
    zIndex: 10,
  },
  calendar: {
    borderRadius: RADIUS.lg,
    paddingVertical: 8,
  },
  card: {
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    fontFamily: 'Montserrat-SemiBold',
    fontSize: 16,
    color: COLORS.onSurface,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  budgetIndicator: {
    marginBottom: 12,
  },
  budgetText: {
    fontFamily: 'PlusJakartaSans-Regular',
    fontSize: 13,
    color: COLORS.onSurfaceVariant,
  },
  budgetAmount: {
    fontFamily: 'PlusJakartaSans-SemiBold',
    color: COLORS.primary,
  },
  inputWrapper: {
    backgroundColor: '#05070a',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    marginBottom: 12,
    paddingHorizontal: 12,
  },
  inputFocused: {
    borderColor: COLORS.primary,
  },
  input: {
    height: 48,
    color: COLORS.onSurface,
    fontFamily: 'PlusJakartaSans-Regular',
    fontSize: 15,
  },
  statusBanner: {
    borderRadius: RADIUS.md,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  successBanner: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderColor: '#22c55e',
  },
  failedBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: '#ef4444',
  },
  statusText: {
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontSize: 13,
    textAlign: 'center',
  },
  successText: {
    color: '#22c55e',
  },
  failedText: {
    color: '#ef4444',
  },
  validateBtn: {
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    ...SHADOW.glow(COLORS.primary),
  },
  validateBtnGrad: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  validateText: {
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontSize: 15,
    color: '#0c0e12',
    fontWeight: '800',
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  freedomCard: {
    flex: 1.3,
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(204,255,0,0.02)',
  },
  streakEmoji: {
    fontSize: 28,
    marginBottom: 4,
  },
  statLabel: {
    fontFamily: 'PlusJakartaSans-Regular',
    fontSize: 12,
    color: COLORS.onSurfaceVariant,
  },
  statValue: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 18,
    color: COLORS.onSurface,
    marginTop: 2,
  },
  freedomLabel: {
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontSize: 11,
    color: COLORS.onSurfaceVariant,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  freedomValue: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 32,
    color: COLORS.primary,
    marginVertical: 4,
    textShadowColor: 'rgba(204, 255, 0, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  freedomDaysLabel: {
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontSize: 9,
    color: COLORS.primary,
    letterSpacing: 1,
  },
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#22c55e',
    zIndex: 9999,
  },
  floatContainer: {
    position: 'absolute',
    alignSelf: 'center',
    top: '55%',
    alignItems: 'center',
    zIndex: 10000,
  },
  floatText: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 48,
    color: COLORS.primary,
    textShadowColor: 'rgba(204, 255, 0, 0.6)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 15,
    letterSpacing: 2,
  },
  floatSubtitle: {
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontSize: 12,
    color: COLORS.onSurface,
    letterSpacing: 3,
    marginTop: 4,
  },
});
