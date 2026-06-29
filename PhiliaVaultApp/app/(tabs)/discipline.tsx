import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, Animated, ScrollView, Alert,
  KeyboardAvoidingView, Platform, Keyboard, Modal
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
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [pulseState, setPulseState] = useState(true);
  const [categoryId, setCategoryId] = useState<number>(1);
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);

  // Daily Budget set up states
  const [showBudgetSetup, setShowBudgetSetup] = useState(false);
  const [newBudgetVal, setNewBudgetVal] = useState('');
  const [budgetInputFocused, setBudgetInputFocused] = useState(false);
  const [loadingBudget, setLoadingBudget] = useState(false);

  // Financial Goals states
  const [goals, setGoals] = useState<any[]>([]);
  const [loadingGoals, setLoadingGoals] = useState(false);
  
  // Create Goal modal states
  const [showCreateGoalModal, setShowCreateGoalModal] = useState(false);
  const [goalName, setGoalName] = useState('');
  const [targetAmountInput, setTargetAmountInput] = useState('');
  const [targetCategory, setTargetCategory] = useState('savings');
  const [targetYear, setTargetYear] = useState(new Date().getFullYear());
  const [targetMonth, setTargetMonth] = useState(new Date().getMonth() + 1);
  const [creatingGoal, setCreatingGoal] = useState(false);
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  const [showYearDropdown, setShowYearDropdown] = useState(false);
  const [showGoalCatDropdown, setShowGoalCatDropdown] = useState(false);

  // My Target states
  const [targetSummary, setTargetSummary] = useState<any>(null);
  const [targetStreak, setTargetStreak] = useState<{ streak_count: number; label: string }>({ streak_count: 0, label: t('discipline.target_streak_none') });
  const [loadingTarget, setLoadingTarget] = useState(false);
  const [targetShowSetup, setTargetShowSetup] = useState(false);
  const [targetSavingsInput, setTargetSavingsInput] = useState('');
  const [targetBudgetInput, setTargetBudgetInput] = useState('');
  const [savingTargetGoal, setSavingTargetGoal] = useState(false);
  const [targetEpargne, setTargetEpargne] = useState('');
  const [targetDepense, setTargetDepense] = useState('');
  const [targetEntryLoading, setTargetEntryLoading] = useState(false);
  const [targetEntryMsg, setTargetEntryMsg] = useState<string | null>(null);
  const [targetEntrySuccess, setTargetEntrySuccess] = useState(false);

  // Contribute modal states
  const [showContributeModal, setShowContributeModal] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<any>(null);
  const [contribAmount, setContribAmount] = useState('');
  const [contribNote, setContribNote] = useState('');
  const [contributing, setContributing] = useState(false);

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

  // Pulse effect for today's outline
  useEffect(() => {
    const interval = setInterval(() => {
      setPulseState((p) => !p);
    }, 800);
    return () => clearInterval(interval);
  }, []);

  const getDaysLabel = () => {
    if (language === 'fr') return streak > 1 ? 'JOURS' : 'JOUR';
    if (language === 'es') return streak > 1 ? 'DÍAS' : 'DÍA';
    if (language === 'pt') return streak > 1 ? 'DIAS' : 'DIA';
    return streak > 1 ? 'DAYS' : 'DAY';
  };

  const getFreedomLabel = () => {
    if (language === 'fr') return 'LIBERTÉ GAGNÉE';
    if (language === 'es') return 'LIBERTAD GANADA';
    if (language === 'pt') return 'LIBERDADE GANHA';
    return 'FREEDOM EARNED';
  };

  const getFreedomDaysLabel = () => {
    if (language === 'fr') return 'JOURS DE LIBERTÉ';
    if (language === 'es') return 'DÍAS DE LIBERTAD';
    if (language === 'pt') return 'DIAS DE LIBERDADE';
    return 'DAYS OF FREEDOM';
  };

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
        if (result.daily_budget !== undefined) {
          setDailyBudget(result.daily_budget);
        }
      }
    } catch (e) {
      console.error('Failed to load discipline history:', e);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const loadGoalsData = useCallback(async () => {
    try {
      setLoadingGoals(true);
      const result = await api.getGoals();
      if (result.success) {
        setGoals(result.goals || []);
      }
    } catch (e) {
      console.error('Failed to load goals:', e);
    } finally {
      setLoadingGoals(false);
    }
  }, []);

  const loadTargetData = useCallback(async () => {
    try {
      setLoadingTarget(true);
      const [summaryRes, streakRes] = await Promise.all([
        api.getTargetSummary(),
        api.getTargetStreak(),
      ]);
      if (summaryRes.success) {
        setTargetSummary(summaryRes);
      }
      if (streakRes.success) {
        setTargetStreak({ streak_count: streakRes.streak_count, label: streakRes.label });
      }
    } catch (e) {
      console.error('Failed to load target data:', e);
    } finally {
      setLoadingTarget(false);
    }
  }, []);

  // Fetch all on focus
  useFocusEffect(
    useCallback(() => {
      loadHistoryData(currentVisibleMonth);
      loadGoalsData();
      loadTargetData();
    }, [loadHistoryData, loadGoalsData, loadTargetData, currentVisibleMonth])
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
      const result = await api.logDiscipline(spent, selectedDate, categoryId);
      if (result.success) {
        const isSuccess = result.status === 'success';
        setIsSuccessLog(isSuccess);
        
        const msg = t('discipline_confirmation_msg').replace('{budget}', result.daily_budget.toFixed(2));
        setLogStatusMessage(msg);

        if (isSuccess) {
          triggerSuccessFlash(result.freedom_days_earned);
        }

        // Refresh statistics and calendar
        setStreak(result.streak);
        setTotalFreedomDays(result.total_freedom_days);
        setDailyBudget(result.daily_budget);
        setAmountSpent('');
        setCategoryId(1);
        
        // Refresh visible month history
        loadHistoryData(currentVisibleMonth);
        loadGoalsData();
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
    const todayStr = new Date().toISOString().split('T')[0];

    // Populated from backend discipline logs
    history.forEach((item) => {
      const isSuccess = item.status === 'success';
      marked[item.date] = {
        customStyles: {
          container: {
            backgroundColor: isSuccess ? '#CCFF00' : '#FF4444',
            borderRadius: 20,
            justifyContent: 'center',
            alignItems: 'center',
          },
          text: {
            color: isSuccess ? '#000000' : '#FFFFFF',
            fontWeight: 'bold',
          }
        }
      };
    });

    // Today gets a pulsating outline circle (glowing green border)
    const todayBorderColor = pulseState ? '#CCFF00' : 'rgba(204, 255, 0, 0.35)';
    const todayShadowRadius = pulseState ? 8 : 2;
    const todayShadowOpacity = pulseState ? 0.9 : 0.4;

    if (!marked[todayStr]) {
      marked[todayStr] = {
        customStyles: {
          container: {
            borderWidth: 2,
            borderColor: todayBorderColor,
            borderRadius: 20,
            backgroundColor: 'transparent',
            shadowColor: '#CCFF00',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: todayShadowOpacity,
            shadowRadius: todayShadowRadius,
            elevation: 3,
          },
          text: {
            color: '#CCFF00',
            fontWeight: 'bold',
          }
        }
      };
    } else {
      // If today already has a state (success or fail), we keep the background and text color but add the border outline
      marked[todayStr].customStyles.container = {
        ...marked[todayStr].customStyles.container,
        borderWidth: 2,
        borderColor: todayBorderColor,
        borderRadius: 20,
        shadowColor: '#CCFF00',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: todayShadowOpacity,
        shadowRadius: todayShadowRadius,
        elevation: 3,
      };
    }

    // Merge or highlight the selected date
    const selectedExisting = marked[selectedDate];
    marked[selectedDate] = {
      customStyles: {
        container: {
          backgroundColor: selectedExisting?.customStyles?.container?.backgroundColor || 'rgba(255, 255, 255, 0.05)',
          borderWidth: 2,
          borderColor: COLORS.primary,
          borderRadius: 20,
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

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('discipline.greeting_morning');
    if (hour < 18) return t('discipline.greeting_afternoon');
    return t('discipline.greeting_evening');
  };

  const handleSaveBudget = async () => {
    if (!newBudgetVal.trim()) {
      Alert.alert(t('error'), t('discipline.set_budget_prompt'));
      return;
    }
    const val = parseFloat(newBudgetVal.replace(',', '.'));
    if (isNaN(val) || val <= 0) {
      Alert.alert(t('error'), t('discipline.set_budget_prompt'));
      return;
    }
    setLoadingBudget(true);
    try {
      const result = await api.setDailyBudget(val);
      if (result.success) {
        setDailyBudget(result.daily_budget);
        setShowBudgetSetup(false);
        setNewBudgetVal('');
        loadHistoryData(currentVisibleMonth);
      }
    } catch (e: any) {
      Alert.alert(t('error'), e.message || 'An error occurred.');
    } finally {
      setLoadingBudget(false);
    }
  };

  const handleCreateGoal = async () => {
    if (!goalName.trim()) {
      Alert.alert(t('error'), t('discipline.goal_name_placeholder'));
      return;
    }
    const target = parseFloat(targetAmountInput.replace(',', '.'));
    if (isNaN(target) || target <= 0) {
      Alert.alert(t('error'), t('discipline.target_amount'));
      return;
    }
    setCreatingGoal(true);
    try {
      const targetDateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-15`;
      const result = await api.createGoal(goalName, target, targetDateStr, targetCategory);
      if (result.success) {
        setShowCreateGoalModal(false);
        setGoalName('');
        setTargetAmountInput('');
        setTargetCategory('savings');
        const futureDate = new Date();
        futureDate.setMonth(futureDate.getMonth() + 6);
        setTargetYear(futureDate.getFullYear());
        setTargetMonth(futureDate.getMonth() + 1);
        
        loadGoalsData();
      }
    } catch (e: any) {
      Alert.alert(t('error'), e.message || 'An error occurred.');
    } finally {
      setCreatingGoal(false);
    }
  };

  const handleContribute = async () => {
    const amount = parseFloat(contribAmount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) {
      Alert.alert(t('error'), t('discipline.target_amount'));
      return;
    }
    setContributing(true);
    try {
      const result = await api.contributeToGoal(selectedGoal.id, amount, contribNote);
      if (result.success) {
        setShowContributeModal(false);
        setContribAmount('');
        setContribNote('');
        setSelectedGoal(null);
        
        loadGoalsData();
        loadHistoryData(currentVisibleMonth);
      }
    } catch (e: any) {
      Alert.alert(t('error'), e.message || 'An error occurred.');
    } finally {
      setContributing(false);
    }
  };

  const handleAbandonGoal = (goalId: number) => {
    Alert.alert(
      t('discipline.goal_abandon_title'),
      t('discipline.abandon_goal_confirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('discipline.confirm_abandon'),
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await api.abandonGoal(goalId);
              if (result.success) {
                loadGoalsData();
              }
            } catch (e: any) {
              Alert.alert(t('error'), e.message || 'An error occurred.');
            }
          }
        }
      ]
    );
  };

  const handleSaveTargetGoal = async () => {
    const savings = parseFloat(targetSavingsInput.replace(',', '.'));
    const budget = parseFloat(targetBudgetInput.replace(',', '.'));
    if (isNaN(savings) || isNaN(budget) || savings < 0 || budget < 0) {
      Alert.alert(t('error'), t('discipline.target_error_save'));
      return;
    }
    setSavingTargetGoal(true);
    try {
      const result = await api.setTargetGoal(savings, budget);
      if (result.success) {
        setTargetShowSetup(false);
        setTargetSavingsInput('');
        setTargetBudgetInput('');
        loadTargetData();
      }
    } catch (e: any) {
      Alert.alert(t('error'), e.message || 'An error occurred.');
    } finally {
      setSavingTargetGoal(false);
    }
  };

  const handleTargetDailyEntry = async () => {
    const epargne = parseFloat(targetEpargne.replace(',', '.'));
    const depense = parseFloat(targetDepense.replace(',', '.'));
    if (isNaN(epargne)) {
      Alert.alert(t('error'), t('discipline.target_error_savings'));
      return;
    }
    if (isNaN(depense)) {
      Alert.alert(t('error'), t('discipline.target_error_expense'));
      return;
    }
    setTargetEntryLoading(true);
    setTargetEntryMsg(null);
    try {
      const result = await api.logTargetDailyEntry(epargne, depense);
      if (result.success) {
        const isSuccess = result.status === 'success';
        setTargetEntrySuccess(isSuccess);
        setTargetEntryMsg(isSuccess
          ? t('discipline.target_entry_success').replace('{points}', result.points_earned?.toString() || '0')
          : t('discipline.target_entry_failure'));
        setTargetEpargne('');
        setTargetDepense('');
        loadTargetData();
      }
    } catch (e: any) {
      setTargetEntrySuccess(false);
      setTargetEntryMsg(e.message || t('discipline.target_error_save_entry'));
    } finally {
      setTargetEntryLoading(false);
      setTimeout(() => setTargetEntryMsg(null), 4000);
    }
  };

  const getGoalStatus = (goal: any) => {
    if (goal.progress_pct >= 100) return { label: t('discipline.status_achieved') || '🏆 Atteint !', color: '#CCFF00' };
    if (goal.days_remaining < 0) return { label: t('discipline.status_expired') || '❌ Expiré', color: '#FF4444' };
    
    const monthsRemaining = goal.days_remaining / 30;
    const amountRemaining = goal.target_amount - goal.saved_amount;
    
    const parseSqlTimestamp = (ts: string) => {
      if (!ts) return new Date();
      return new Date(ts.replace(' ', 'T'));
    };

    const createdTime = parseSqlTimestamp(goal.created_at).getTime();
    const nowTime = new Date().getTime();
    const timeDiffMonths = (nowTime - createdTime) / (30 * 24 * 60 * 60 * 1000);
    const currentMonthlyRate = goal.saved_amount / Math.max(1, timeDiffMonths);
    
    if (currentMonthlyRate * monthsRemaining >= amountRemaining) {
      return { label: t('discipline.status_on_track') || '✅ En bonne voie', color: '#CCFF00' };
    }
    return { label: t('discipline.status_delayed') || '⚠️ En retard', color: '#FFA500' };
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'savings': return '🏦';
      case 'debt': return '💳';
      case 'investment': return '📈';
      case 'project': return '✈️';
      default: return '🎯';
    }
  };

  const getTranslatedStreakLabel = (label: string) => {
    const labelMap: Record<string, string> = {
      'Aucune': 'discipline.target_streak_none',
      'Ninguna': 'discipline.target_streak_none',
      'Nenhuma': 'discipline.target_streak_none',
      'None': 'discipline.target_streak_none',
      'Étincelle': 'discipline.target_streak_spark',
      'Chispa': 'discipline.target_streak_spark',
      'Faísca': 'discipline.target_streak_spark',
      'Spark': 'discipline.target_streak_spark',
      'Flamme': 'discipline.target_streak_flame',
      'Llama': 'discipline.target_streak_flame',
      'Chama': 'discipline.target_streak_flame',
      'Flame': 'discipline.target_streak_flame',
      'Brasier': 'discipline.target_streak_blaze',
      'Brasa': 'discipline.target_streak_blaze',
      'Blaze': 'discipline.target_streak_blaze',
      'Phare': 'discipline.target_streak_beacon',
      'Faro': 'discipline.target_streak_beacon',
      'Farol': 'discipline.target_streak_beacon',
      'Beacon': 'discipline.target_streak_beacon',
      'Légende Philia': 'discipline.target_streak_legend',
      'Leyenda Philia': 'discipline.target_streak_legend',
      'Lenda Philia': 'discipline.target_streak_legend',
      'Legend Philia': 'discipline.target_streak_legend',
    };
    const key = labelMap[label] || 'discipline.target_streak_none';
    return t(key);
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'savings': return t('discipline_category_necessary') || 'Épargne';
      case 'debt': return t('tab_liabilities') || 'Dette';
      case 'investment': return t('discipline_category_investment') || 'Investissement';
      case 'project': return t('discipline.target_category_project');
      default: return category;
    }
  };

  const calculateLiveNeeded = () => {
    const target = parseFloat(targetAmountInput.replace(',', '.'));
    if (isNaN(target) || target <= 0) return null;
    
    const targetDateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-15`;
    const targetDateObj = new Date(targetDateStr);
    const today = new Date();
    
    const diffMs = targetDateObj.getTime() - today.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const diffMonths = Math.max(1, diffDays / 30);
    
    const neededPerMonth = target / diffMonths;
    return {
      needed: neededPerMonth,
      months: Math.ceil(diffMonths),
      dateStr: targetDateObj.toLocaleDateString(language || 'fr', { month: 'short', year: 'numeric' })
    };
  };

  const liveSummary = calculateLiveNeeded();

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
        <View style={[
          styles.calendarContainer,
          categoryId === 2 && styles.calendarContainerHemorrhage
        ]}>
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
              calendarBackground: '#000000',
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
              ? getGreeting()
              : selectedDate}
          </Text>
          
          {(dailyBudget === 0 && !showBudgetSetup) ? (
            <View style={styles.budgetSetupContainer}>
              <Text style={styles.budgetSetupLabel}>{t('discipline.set_budget_prompt')}</Text>
              <TouchableOpacity
                style={[styles.setupBtn, { width: '100%', marginTop: 12 }]}
                onPress={() => setShowBudgetSetup(true)}
              >
                <LinearGradient
                  colors={['#CCFF00', '#CCFF00']}
                  style={styles.validateBtnGrad}
                >
                  <Text style={styles.validateText}>{t('discipline.set_daily_budget')}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ) : showBudgetSetup ? (
            <View style={styles.budgetSetupContainer}>
              <Text style={styles.budgetSetupLabel}>{t('discipline.set_budget_prompt')}</Text>
              <View style={[styles.inputWrapper, focusedInput === 'budget' && styles.inputFocused]}>
                <TextInput
                  style={styles.input}
                  placeholder={t('discipline.budget_placeholder')}
                  placeholderTextColor={COLORS.onSurfaceVariant}
                  keyboardType="numeric"
                  value={newBudgetVal}
                  onChangeText={setNewBudgetVal}
                  onFocus={() => setFocusedInput('budget')}
                  onBlur={() => setFocusedInput(null)}
                />
              </View>
              <View style={{ flexDirection: 'row', marginTop: 12, gap: 10 }}>
                {dailyBudget > 0 && (
                  <TouchableOpacity
                    style={[styles.cancelBtn, { flex: 1 }]}
                    onPress={() => setShowBudgetSetup(false)}
                  >
                    <Text style={styles.cancelBtnText}>{t('cancel')}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.setupBtn, { flex: 1 }]}
                  onPress={handleSaveBudget}
                  disabled={loadingBudget}
                >
                  <LinearGradient
                    colors={['#CCFF00', '#CCFF00']}
                    style={styles.validateBtnGrad}
                  >
                    {loadingBudget ? (
                      <ActivityIndicator color="#0c0e12" size="small" />
                    ) : (
                      <Text style={styles.validateText}>{t('save')}</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View>
              <View style={styles.budgetIndicator}>
                <Text style={styles.budgetText}>
                  {t('daily_budget_limit_label')} <Text style={styles.budgetAmount}>{formatAmount(dailyBudget)}</Text>
                </Text>
                <TouchableOpacity onPress={() => {
                  setNewBudgetVal(dailyBudget.toString());
                  setShowBudgetSetup(true);
                }} style={styles.editBudgetIcon}>
                  <Text style={{ fontSize: 16 }}>⚙️</Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.inputWrapper, focusedInput === 'spent' && styles.inputFocused]}>
                <TextInput
                  style={styles.input}
                  placeholder={t('discipline_spent_placeholder')}
                  placeholderTextColor={COLORS.onSurfaceVariant}
                  keyboardType="numeric"
                  value={amountSpent}
                  onChangeText={setAmountSpent}
                  onFocus={() => setFocusedInput('spent')}
                  onBlur={() => setFocusedInput(null)}
                />
              </View>

              {/* Sélection de catégorie obligatoire */}
              <View style={styles.pickerContainer}>
                <Text style={styles.pickerLabel}>{t('discipline_category_label')}</Text>
                <TouchableOpacity
                  style={styles.pickerSelector}
                  onPress={() => setDropdownOpen(!dropdownOpen)}
                  activeOpacity={0.8}
                >
                  <View style={styles.pickerSelectorLeft}>
                    <View style={[styles.colorDot, { backgroundColor: categoryId === 1 ? '#22c55e' : categoryId === 2 ? '#ef4444' : '#3b82f6' }]} />
                    <Text style={styles.pickerSelectorText}>
                      {categoryId === 1 ? t('discipline_category_necessary') : categoryId === 2 ? t('discipline_category_hemorrhage') : t('discipline_category_investment')}
                    </Text>
                  </View>
                  <Text style={styles.pickerArrow}>{dropdownOpen ? '▲' : '▼'}</Text>
                </TouchableOpacity>

                {dropdownOpen && (
                  <View style={styles.dropdownList}>
                    {[
                      { id: 1, label: t('discipline_category_necessary'), color: '#22c55e' },
                      { id: 2, label: t('discipline_category_hemorrhage'), color: '#ef4444' },
                      { id: 3, label: t('discipline_category_investment'), color: '#3b82f6' }
                    ].map((cat) => (
                      <TouchableOpacity
                        key={cat.id}
                        style={[
                          styles.dropdownItem,
                          categoryId === cat.id && styles.dropdownItemActive
                        ]}
                        onPress={() => {
                          setCategoryId(cat.id);
                          setDropdownOpen(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.colorDot, { backgroundColor: cat.color }]} />
                        <Text style={[
                          styles.dropdownItemText,
                          categoryId === cat.id && styles.dropdownItemTextActive
                        ]}>
                          {cat.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
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
                  colors={['#CCFF00', '#CCFF00']}
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
          )}
        </View>

        {/* Position 3: Discipline Statistics */}
        <View style={styles.statsContainer}>
          {/* Active Streak Card */}
          <View style={[styles.statCard, styles.streakCard]}>
            <Text style={styles.streakEmoji}>🔥</Text>
            <Text style={styles.streakValue}>{streak}</Text>
            <Text style={styles.streakDaysLabel}>{getDaysLabel()}</Text>
          </View>

          {/* Life Freedom Accumulated */}
          <View style={[styles.statCard, styles.freedomCard]}>
            <Text style={styles.freedomLabel}>{getFreedomLabel()}</Text>
            <Text style={styles.freedomValue}>{totalFreedomDays.toFixed(2)}</Text>
            <Text style={styles.freedomDaysLabel}>{getFreedomDaysLabel()}</Text>
          </View>
        </View>

        {/* Position 4: Financial Goals Section */}
        <View style={styles.goalsContainer}>
          <View style={styles.goalsHeaderRow}>
            <Text style={styles.sectionTitle}>{t('discipline.goals_title')}</Text>
            <TouchableOpacity
              style={styles.newGoalBtn}
              onPress={() => setShowCreateGoalModal(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.newGoalBtnText}>{t('discipline.new_goal')}</Text>
            </TouchableOpacity>
          </View>
          
          {loadingGoals && goals.length === 0 ? (
            <ActivityIndicator color={COLORS.primary} size="small" style={{ marginVertical: 20 }} />
          ) : goals.length === 0 ? (
            <View style={styles.emptyGoalsCard}>
              <Text style={styles.emptyGoalsText}>{t('discipline.no_goals')}</Text>
            </View>
          ) : (
            goals.map((goal) => {
              const statusInfo = getGoalStatus(goal);
              return (
                <View key={goal.id} style={styles.goalCard}>
                  <View style={styles.goalsHeaderRow}>
                    <Text style={styles.goalName}>
                      {getCategoryIcon(goal.category)} {goal.name}
                    </Text>
                    <View style={[styles.goalStatusBadge, { borderColor: statusInfo.color }]}>
                      <Text style={[styles.goalStatusText, { color: statusInfo.color }]}>
                        {statusInfo.label}
                      </Text>
                    </View>
                  </View>
                  
                  {/* Progress bar */}
                  <View style={{ marginVertical: 12 }}>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressBar, { width: `${Math.min(100, goal.progress_pct)}%` }]} />
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                      <Text style={styles.goalTarget}>
                        {formatAmount(goal.saved_amount)} / {formatAmount(goal.target_amount)}
                      </Text>
                      <Text style={styles.progressPct}>{goal.progress_pct}%</Text>
                    </View>
                  </View>
                  
                  {/* Details */}
                  <View style={styles.goalDetailsRow}>
                    <View style={styles.goalDetail}>
                      <Text style={styles.goalDetailLabel}>{t('discipline.target_date')}</Text>
                      <Text style={styles.goalDetailValue}>
                        {goal.days_remaining >= 0
                          ? t('discipline.days_remaining').replace('{days}', goal.days_remaining.toString())
                          : t('discipline.status_expired')}
                      </Text>
                    </View>
                    <View style={styles.goalDetail}>
                      <Text style={styles.goalDetailLabel}>{t('discipline.to_save')}</Text>
                      <Text style={styles.goalDetailValue}>
                        {formatAmount(goal.monthly_needed)}{t('discipline.per_month')}
                      </Text>
                    </View>
                  </View>
                  
                  {/* Actions */}
                  <View style={styles.goalActionsRow}>
                    <TouchableOpacity
                      style={styles.abandonBtn}
                      onPress={() => handleAbandonGoal(goal.id)}
                    >
                      <Text style={styles.abandonBtnText}>🗑️</Text>
                    </TouchableOpacity>
                    
                    {goal.progress_pct < 100 && (
                      <TouchableOpacity
                        style={styles.contributeBtn}
                        onPress={() => {
                          setSelectedGoal(goal);
                          setShowContributeModal(true);
                        }}
                      >
                        <LinearGradient
                          colors={['#CCFF00', '#CCFF00']}
                          style={styles.contributeBtnGrad}
                        >
                          <Text style={styles.contributeText}>
                            {t('discipline.contribute')}
                          </Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Position 5: My Target Section */}
        <View style={styles.targetContainer}>
          <View style={styles.targetHeaderRow}>
            <Text style={styles.sectionTitle}>{t('discipline.my_target_title')}</Text>
            {!targetShowSetup && (
              <TouchableOpacity
                style={styles.newGoalBtn}
                onPress={() => setTargetShowSetup(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.newGoalBtnText}>{t('discipline.define_goals')}</Text>
              </TouchableOpacity>
            )}
          </View>

          {loadingTarget ? (
            <ActivityIndicator color={COLORS.primary} size="small" style={{ marginVertical: 20 }} />
          ) : targetShowSetup ? (
            <View style={styles.card}>
              <Text style={styles.cardHeader}>{t('discipline.define_goals')}</Text>
              <Text style={styles.formLabel}>{t('discipline.monthly_savings_label')}</Text>
              <View style={[styles.inputWrapper, focusedInput === 'targetSavings' && styles.inputFocused]}>
                <TextInput
                  style={styles.input}
                  placeholder={t('discipline.target_savings_placeholder')}
                  placeholderTextColor={COLORS.onSurfaceVariant}
                  keyboardType="numeric"
                  value={targetSavingsInput}
                  onChangeText={setTargetSavingsInput}
                  onFocus={() => setFocusedInput('targetSavings')}
                  onBlur={() => setFocusedInput(null)}
                />
              </View>
              <Text style={styles.formLabel}>{t('discipline.monthly_budget_label')}</Text>
              <View style={[styles.inputWrapper, focusedInput === 'targetBudget' && styles.inputFocused]}>
                <TextInput
                  style={styles.input}
                  placeholder={t('discipline.budget_placeholder')}
                  placeholderTextColor={COLORS.onSurfaceVariant}
                  keyboardType="numeric"
                  value={targetBudgetInput}
                  onChangeText={setTargetBudgetInput}
                  onFocus={() => setFocusedInput('targetBudget')}
                  onBlur={() => setFocusedInput(null)}
                />
              </View>
              <View style={{ flexDirection: 'row', marginTop: 12, gap: 10 }}>
                {targetSummary && targetSummary.budget_mensuel > 0 && (
                  <TouchableOpacity
                    style={[styles.cancelBtn, { flex: 1 }]}
                    onPress={() => setTargetShowSetup(false)}
                  >
                    <Text style={styles.cancelBtnText}>{t('cancel')}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.setupBtn, { flex: 1 }]}
                  onPress={handleSaveTargetGoal}
                  disabled={savingTargetGoal}
                >
                  <LinearGradient
                    colors={['#CCFF00', '#CCFF00']}
                    style={styles.validateBtnGrad}
                  >
                    {savingTargetGoal ? (
                      <ActivityIndicator color="#0c0e12" size="small" />
                    ) : (
                      <Text style={styles.validateText}>{t('save')}</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          ) : targetSummary && (targetSummary.budget_mensuel > 0 || targetSummary.objectif_epargne > 0) ? (
            <View>
              {/* Row 1: Budget & Savings Goal */}
              <View style={styles.targetRow}>
                <View style={[styles.targetCard, { flex: 1 }]}>
                  <Text style={styles.targetCardLabel}>{t('discipline.target_budget_label')}</Text>
                  <Text style={styles.targetCardValue} numberOfLines={1} adjustsFontSizeToFit>
                    {formatAmount(targetSummary.budget_mensuel)}
                  </Text>
                  <Text style={styles.targetCardSub}>{t('discipline.target_per_month')}</Text>
                </View>
                <View style={[styles.targetCard, { flex: 1 }]}>
                  <Text style={styles.targetCardLabel}>{t('discipline.target_savings_goal_label')}</Text>
                  <Text style={styles.targetCardValue} numberOfLines={1} adjustsFontSizeToFit>
                    {formatAmount(targetSummary.objectif_epargne)}
                  </Text>
                  <Text style={styles.targetCardSub}>{t('discipline.target_per_month')}</Text>
                </View>
              </View>

              {/* Row 2: Freedom Days & Progression */}
              <View style={styles.targetRow}>
                <View style={[styles.targetCard, styles.targetCardGreen, { flex: 1 }]}>
                  <Text style={styles.targetCardLabelGreen}>{t('discipline.target_freedom_days_label')}</Text>
                  <Text style={styles.targetCardValueGreen}>
                    {targetSummary.jours_liberte.toFixed(1)}
                  </Text>
                  <Text style={styles.targetCardSubGreen}>{t('discipline.target_freedom_suffix')}</Text>
                </View>
                <View style={[styles.targetCard, { flex: 1 }]}>
                  <Text style={styles.targetCardLabel}>{t('discipline.target_progress_label')}</Text>
                  <Text style={styles.targetCardValueProgression}>
                    {targetSummary.progression}%
                  </Text>
                  <View style={styles.targetProgressTrack}>
                    <View style={[styles.targetProgressBar, { width: `${Math.min(100, targetSummary.progression)}%` }]} />
                  </View>
                  <Text style={styles.targetCardSub}>
                    {formatAmount(targetSummary.total_epargne_mois)} / {formatAmount(targetSummary.objectif_epargne)}
                  </Text>
                </View>
              </View>

              {/* Row 3: Streak */}
              <View style={styles.targetRow}>
                <View style={[styles.targetCard, styles.targetStreakCard, { flex: 1 }]}>
                  <Text style={styles.streakEmoji}>🔥</Text>
                  <Text style={styles.targetStreakValue}>{targetStreak.streak_count}</Text>
                  <Text style={styles.targetStreakLabel}>{getTranslatedStreakLabel(targetStreak.label)}</Text>
                </View>

                {/* Daily Entry Form */}
                <View style={[styles.targetCard, { flex: 1.5 }]}>
                  <Text style={styles.targetCardLabel}>{t('discipline.target_daily_entry_label')}</Text>
                  <TextInput
                    style={[styles.targetMiniInput, focusedInput === 'targetEpargne' && styles.inputFocused]}
                    placeholder={t('discipline.target_savings_placeholder')}
                    placeholderTextColor={COLORS.onSurfaceVariant}
                    keyboardType="numeric"
                    value={targetEpargne}
                    onChangeText={setTargetEpargne}
                    onFocus={() => setFocusedInput('targetEpargne')}
                    onBlur={() => setFocusedInput(null)}
                  />
                  <TextInput
                    style={[styles.targetMiniInput, focusedInput === 'targetDepense' && styles.inputFocused]}
                    placeholder={t('discipline.target_expense_placeholder')}
                    placeholderTextColor={COLORS.onSurfaceVariant}
                    keyboardType="numeric"
                    value={targetDepense}
                    onChangeText={setTargetDepense}
                    onFocus={() => setFocusedInput('targetDepense')}
                    onBlur={() => setFocusedInput(null)}
                  />
                  <TouchableOpacity
                    style={styles.targetEntryBtn}
                    onPress={handleTargetDailyEntry}
                    disabled={targetEntryLoading}
                    activeOpacity={0.8}
                  >
                    {targetEntryLoading ? (
                      <ActivityIndicator color="#000000" size="small" />
                    ) : (
                      <Text style={styles.targetEntryBtnText}>{t('discipline.target_validate_btn')}</Text>
                    )}
                  </TouchableOpacity>
                  {targetEntryMsg && (
                    <Text style={[styles.targetEntryMsg, { color: targetEntrySuccess ? '#22c55e' : '#ef4444' }]}>
                      {targetEntryMsg}
                    </Text>
                  )}
                </View>
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* CREATE GOAL MODAL */}
      <Modal
        visible={showCreateGoalModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCreateGoalModal(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalContainer}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{t('discipline.new_goal')}</Text>
              
              <Text style={styles.formLabel}>{t('discipline.goal_name_placeholder').split('(')[0]}</Text>
              <View style={[styles.inputWrapper, focusedInput === 'goalName' && styles.inputFocused]}>
                <TextInput
                  style={styles.input}
                  placeholder={t('discipline.goal_name_placeholder')}
                  placeholderTextColor={COLORS.onSurfaceVariant}
                  value={goalName}
                  onChangeText={setGoalName}
                  onFocus={() => setFocusedInput('goalName')}
                  onBlur={() => setFocusedInput(null)}
                />
              </View>

              <Text style={styles.formLabel}>{t('discipline.target_amount')}</Text>
              <View style={[styles.inputWrapper, focusedInput === 'goalAmount' && styles.inputFocused]}>
                <TextInput
                  style={styles.input}
                  placeholder={t('discipline.goal_amount_placeholder')}
                  placeholderTextColor={COLORS.onSurfaceVariant}
                  keyboardType="numeric"
                  value={targetAmountInput}
                  onChangeText={setTargetAmountInput}
                  onFocus={() => setFocusedInput('goalAmount')}
                  onBlur={() => setFocusedInput(null)}
                />
              </View>

              {/* Target date selectors */}
              <Text style={styles.formLabel}>{t('discipline.target_date')}</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12, zIndex: 120 }}>
                <View style={{ flex: 1 }}>
                  <TouchableOpacity
                    style={styles.pickerSelector}
                    onPress={() => setShowMonthDropdown(!showMonthDropdown)}
                  >
                    <Text style={styles.pickerSelectorText}>
                      {LocaleConfig.locales[language || 'fr']?.monthNames[targetMonth - 1] || targetMonth}
                    </Text>
                    <Text style={styles.pickerArrow}>▼</Text>
                  </TouchableOpacity>
                  {showMonthDropdown && (
                    <ScrollView style={[styles.dropdownList, { maxHeight: 150 }]} nestedScrollEnabled={true}>
                      {(LocaleConfig.locales[language || 'fr']?.monthNames || [
                        'January','February','March','April','May','June','July','August','September','October','November','December'
                      ]).map((m: string, idx: number) => (
                        <TouchableOpacity
                          key={idx}
                          style={styles.dropdownItem}
                          onPress={() => {
                            setTargetMonth(idx + 1);
                            setShowMonthDropdown(false);
                          }}
                        >
                          <Text style={styles.dropdownItemText}>{m}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                </View>
                
                <View style={{ flex: 1 }}>
                  <TouchableOpacity
                    style={styles.pickerSelector}
                    onPress={() => setShowYearDropdown(!showYearDropdown)}
                  >
                    <Text style={styles.pickerSelectorText}>{targetYear}</Text>
                    <Text style={styles.pickerArrow}>▼</Text>
                  </TouchableOpacity>
                  {showYearDropdown && (
                    <View style={styles.dropdownList}>
                      {[2026, 2027, 2028, 2029, 2030, 2031, 2032].map((y) => (
                        <TouchableOpacity
                          key={y}
                          style={styles.dropdownItem}
                          onPress={() => {
                            setTargetYear(y);
                            setShowYearDropdown(false);
                          }}
                        >
                          <Text style={styles.dropdownItemText}>{y}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              </View>

              {/* Goal Category selector */}
              <View style={[styles.pickerContainer, { zIndex: 110 }]}>
                <Text style={styles.formLabel}>{t('discipline.category')}</Text>
                <TouchableOpacity
                  style={styles.pickerSelector}
                  onPress={() => setShowGoalCatDropdown(!showGoalCatDropdown)}
                >
                  <Text style={styles.pickerSelectorText}>
                    {getCategoryIcon(targetCategory)} {getCategoryLabel(targetCategory)}
                  </Text>
                  <Text style={styles.pickerArrow}>▼</Text>
                </TouchableOpacity>
                {showGoalCatDropdown && (
                  <View style={styles.dropdownList}>
                    {[
                      { id: 'savings', label: t('discipline_category_necessary') || 'Épargne', icon: '🏦' },
                      { id: 'debt', label: t('tab_liabilities') || 'Dette', icon: '💳' },
                      { id: 'investment', label: t('discipline_category_investment') || 'Investissement', icon: '📈' },
                      { id: 'project', label: 'Projet personnel', icon: '✈️' }
                    ].map((cat) => (
                      <TouchableOpacity
                        key={cat.id}
                        style={styles.dropdownItem}
                        onPress={() => {
                          setTargetCategory(cat.id);
                          setShowGoalCatDropdown(false);
                        }}
                      >
                        <Text style={styles.dropdownItemText}>{cat.icon} {cat.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Live auto-summary description */}
              {liveSummary && (
                <View style={styles.summaryBox}>
                  <Text style={styles.summaryText}>
                    {t('discipline.auto_summary')
                      ? t('discipline.auto_summary')
                          .replace('{target}', formatAmount(parseFloat(targetAmountInput)))
                          .replace('{date}', liveSummary.dateStr)
                          .replace('{months}', liveSummary.months.toString())
                          .replace('{needed}', formatAmount(liveSummary.needed))
                      : `Pour atteindre ${formatAmount(parseFloat(targetAmountInput))} d'ici ${liveSummary.dateStr} (${liveSummary.months} mois), tu dois épargner ${formatAmount(liveSummary.needed)}/mois.`}
                  </Text>
                </View>
              )}

              {/* Modal Buttons */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { flex: 1 }]}
                  onPress={() => setShowCreateGoalModal(false)}
                >
                  <Text style={styles.cancelBtnText}>{t('cancel')}</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.setupBtn, { flex: 1 }]}
                  onPress={handleCreateGoal}
                  disabled={creatingGoal}
                >
                  <LinearGradient
                    colors={['#CCFF00', '#CCFF00']}
                    style={styles.validateBtnGrad}
                  >
                    {creatingGoal ? (
                      <ActivityIndicator color="#0c0e12" size="small" />
                    ) : (
                      <Text style={styles.validateText}>{t('save')}</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* CONTRIBUTE MODAL */}
      <Modal
        visible={showContributeModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowContributeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalContainer}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                {t('discipline.contribute') || '+ Contribuer'} - {selectedGoal?.name}
              </Text>
              
               <Text style={styles.formLabel}>{t('discipline.target_amount').replace('cible', 'contribution')}</Text>
              <View style={[styles.inputWrapper, focusedInput === 'contribAmount' && styles.inputFocused]}>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: 100"
                  placeholderTextColor={COLORS.onSurfaceVariant}
                  keyboardType="numeric"
                  value={contribAmount}
                  onChangeText={setContribAmount}
                  onFocus={() => setFocusedInput('contribAmount')}
                  onBlur={() => setFocusedInput(null)}
                />
              </View>

              <Text style={styles.formLabel}>Note (Optionnelle)</Text>
              <View style={[styles.inputWrapper, focusedInput === 'contribNote' && styles.inputFocused]}>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: Économie bonus"
                  placeholderTextColor={COLORS.onSurfaceVariant}
                  value={contribNote}
                  onChangeText={setContribNote}
                  onFocus={() => setFocusedInput('contribNote')}
                  onBlur={() => setFocusedInput(null)}
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { flex: 1 }]}
                  onPress={() => setShowContributeModal(false)}
                >
                  <Text style={styles.cancelBtnText}>{t('cancel')}</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.setupBtn, { flex: 1 }]}
                  onPress={handleContribute}
                  disabled={contributing}
                >
                  <LinearGradient
                    colors={['#CCFF00', '#CCFF00']}
                    style={styles.validateBtnGrad}
                  >
                    {contributing ? (
                      <ActivityIndicator color="#0c0e12" size="small" />
                    ) : (
                      <Text style={styles.validateText}>{t('discipline_validate_btn')}</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

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
    backgroundColor: '#000000',
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
    backgroundColor: '#1A1A1A',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    marginBottom: 12,
    paddingHorizontal: 12,
  },
  inputFocused: {
    borderColor: '#CCFF00',
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
    shadowColor: '#CCFF00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  validateBtnGrad: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  validateText: {
    color: '#000000',
    fontSize: 15,
    fontFamily: 'PlusJakartaSans-Bold',
    fontWeight: '800',
    letterSpacing: 0.3,
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
  streakCard: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1.5,
    borderColor: '#CCFF00',
    shadowColor: '#CCFF00',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 12,
    elevation: 6,
  },
  freedomCard: {
    flex: 1.3,
    backgroundColor: '#CCFF00',
    borderColor: '#CCFF00',
    borderWidth: 1,
    shadowColor: '#CCFF00',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 5,
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
  streakValue: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 38,
    color: '#CCFF00',
    marginTop: 2,
    textShadowColor: 'rgba(204, 255, 0, 0.65)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
    fontWeight: '900',
  },
  streakDaysLabel: {
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontSize: 10,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  freedomLabel: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 11,
    color: '#000000',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '800',
  },
  freedomValue: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 38,
    color: '#000000',
    marginVertical: 4,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  freedomDaysLabel: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 9,
    color: '#000000',
    letterSpacing: 1,
    fontWeight: '800',
  },
  flashOverlay: {
    ...StyleSheet.absoluteFill,
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
  calendarContainerHemorrhage: {
    borderWidth: 2,
    borderColor: '#ff0000',
  },
  pickerContainer: {
    marginBottom: 16,
    position: 'relative',
    zIndex: 100,
  },
  pickerLabel: {
    fontFamily: 'PlusJakartaSans-Regular',
    fontSize: 11,
    color: COLORS.onSurfaceVariant,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pickerSelector: {
    height: 48,
    backgroundColor: '#05070a',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  pickerSelectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  pickerSelectorText: {
    fontFamily: 'PlusJakartaSans-Regular',
    fontSize: 14,
    color: COLORS.onSurface,
  },
  pickerArrow: {
    fontSize: 12,
    color: COLORS.onSurfaceVariant,
  },
  dropdownList: {
    backgroundColor: '#0c0e12',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    marginTop: 4,
    paddingVertical: 4,
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  dropdownItem: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  dropdownItemActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  dropdownItemText: {
    fontFamily: 'PlusJakartaSans-Regular',
    fontSize: 14,
    color: COLORS.onSurfaceVariant,
  },
  dropdownItemTextActive: {
    color: COLORS.onSurface,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },

  // New styles for Financial Goals
  goalsContainer: {
    marginTop: 10,
  },
  goalsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 16,
    color: COLORS.onSurface,
    letterSpacing: -0.2,
  },
  newGoalBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(204,255,0,0.05)',
  },
  newGoalBtnText: {
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontSize: 12,
    color: COLORS.primary,
  },
  emptyGoalsCard: {
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    padding: 24,
    alignItems: 'center',
  },
  emptyGoalsText: {
    fontFamily: 'PlusJakartaSans-Regular',
    fontSize: 14,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
  },
  goalCard: {
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    padding: 16,
    marginBottom: 12,
  },
  goalName: {
    fontFamily: 'Montserrat-SemiBold',
    fontSize: 15,
    color: COLORS.onSurface,
  },
  goalStatusBadge: {
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  goalStatusText: {
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontSize: 10,
    fontWeight: 'bold',
  },
  progressTrack: {
    height: 8,
    backgroundColor: '#05070a',
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.full,
  },
  goalTarget: {
    fontFamily: 'PlusJakartaSans-Regular',
    fontSize: 12,
    color: COLORS.onSurfaceVariant,
  },
  progressPct: {
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontSize: 12,
    color: COLORS.onSurface,
  },
  goalDetailsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    paddingVertical: 10,
    marginBottom: 12,
  },
  goalDetail: {
    flex: 1,
  },
  goalDetailLabel: {
    fontFamily: 'PlusJakartaSans-Regular',
    fontSize: 10,
    color: COLORS.onSurfaceVariant,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  goalDetailValue: {
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontSize: 13,
    color: COLORS.onSurface,
    marginTop: 2,
  },
  goalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  contributeBtn: {
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    flex: 1,
    marginLeft: 16,
    shadowColor: '#CCFF00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  contributeBtnGrad: {
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contributeText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 13,
    color: '#000000',
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  abandonBtn: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  abandonBtnText: {
    fontSize: 14,
  },
  cancelBtn: {
    height: 48,
    backgroundColor: COLORS.surfaceContainerHigh,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  cancelBtnText: {
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontSize: 15,
    color: COLORS.onSurface,
  },
  setupBtn: {
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },

  // Modals Styling
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    width: '100%',
  },
  modalContent: {
    backgroundColor: COLORS.surfaceContainer,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 44 : 24,
  },
  modalTitle: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 18,
    color: COLORS.onSurface,
    marginBottom: 20,
    textAlign: 'center',
  },
  formLabel: {
    fontFamily: 'PlusJakartaSans-Regular',
    fontSize: 12,
    color: COLORS.onSurfaceVariant,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryBox: {
    backgroundColor: 'rgba(204,255,0,0.06)',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(204,255,0,0.15)',
    padding: 12,
    marginBottom: 16,
  },
  summaryText: {
    fontFamily: 'PlusJakartaSans-Medium',
    fontSize: 13,
    color: COLORS.primary,
    lineHeight: 18,
  },

  // My Target Styles
  targetContainer: {
    marginTop: 10,
  },
  targetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  targetRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  targetCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetCardLabel: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 9,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  targetCardValue: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 22,
    color: '#f8fafc',
    fontWeight: '900',
  },
  targetCardSub: {
    fontFamily: 'PlusJakartaSans-Regular',
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 2,
  },
  targetCardGreen: {
    backgroundColor: '#CCFF00',
    borderColor: '#CCFF00',
    shadowColor: '#CCFF00',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 4,
  },
  targetCardLabelGreen: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 9,
    color: '#000000',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  targetCardValueGreen: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 26,
    color: '#000000',
    fontWeight: '900',
  },
  targetCardSubGreen: {
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontSize: 10,
    color: '#000000',
    marginTop: 2,
  },
  targetCardValueProgression: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 22,
    color: '#CCFF00',
    fontWeight: '900',
  },
  targetProgressTrack: {
    height: 6,
    backgroundColor: '#0c0e12',
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    width: '100%',
    marginTop: 4,
    marginBottom: 2,
  },
  targetProgressBar: {
    height: '100%',
    backgroundColor: '#CCFF00',
    borderRadius: RADIUS.full,
  },
  targetStreakCard: {
    borderWidth: 1.5,
    borderColor: '#CCFF00',
    shadowColor: '#CCFF00',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  targetStreakValue: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 24,
    color: '#CCFF00',
    fontWeight: '900',
    textShadowColor: 'rgba(204, 255, 0, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  targetStreakLabel: {
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontSize: 10,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  targetMiniInput: {
    height: 36,
    backgroundColor: '#0c0e12',
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    color: '#f8fafc',
    fontFamily: 'PlusJakartaSans-Regular',
    fontSize: 13,
    paddingHorizontal: 10,
    marginBottom: 6,
    width: '100%',
  },
  targetEntryBtn: {
    height: 34,
    backgroundColor: '#CCFF00',
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: 2,
  },
  targetEntryBtnText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 13,
    color: '#000000',
    fontWeight: '800',
  },
  targetEntryMsg: {
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
  },
  budgetSetupContainer: {
    padding: 20,
    alignItems: 'center' as const,
  },
  budgetSetupLabel: {
    fontFamily: 'PlusJakartaSans-Medium',
    fontSize: 14,
    color: '#888888',
    textAlign: 'center' as const,
    marginBottom: 12,
  },
  editBudgetIcon: {
    marginLeft: 8,
    padding: 4,
  },
});
