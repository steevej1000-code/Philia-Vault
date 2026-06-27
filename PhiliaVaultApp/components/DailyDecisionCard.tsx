/**
 * DailyDecisionCard — offline-first
 *
 * • Les 121 dilemmes (FR/EN/ES/PT) sont bundlés dans l'app → zéro appel réseau requis
 * • Réponse + streak sauvés en AsyncStorage → persistants entre sessions, par compte
 * • Sync backend tentée en arrière-plan (optionnel, silencieuse si offline)
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../store/authStore';
import { useUserPreferences } from '../context/UserPreferencesContext';
import { API_BASE } from '../constants/api';

// ─── Bundled dilemmas (offline) ───────────────────────────────────────────────
import DILEMMAS_BUNDLE from '../data/dilemmas_bundle.json';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Dilemma {
  id: string;
  category: string;
  title: string;
  scenario: string;
  choice_liability: { label: string; feedback: string };
  choice_asset: { label: string; feedback: string };
}

interface Streak {
  current: number;
  longest: number;
  last_answered_date: string | null;
}

// ─── UI Labels (multilingue) ──────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  cashflow:      '#888888',
  dette:         '#888888',
  investissement:'#888888',
  mentalite:     '#888888',
};

const CATEGORY_LABELS: Record<string, Record<string, string>> = {
  cashflow:      { fr: 'Cash Flow',      en: 'Cash Flow',   es: 'Flujo de Caja', pt: 'Fluxo de Caixa' },
  dette:         { fr: 'Dette',          en: 'Debt',        es: 'Deuda',         pt: 'Dívida'         },
  investissement:{ fr: 'Investissement', en: 'Investment',  es: 'Inversión',     pt: 'Investimento'   },
  mentalite:     { fr: 'Mentalité',      en: 'Mindset',     es: 'Mentalidad',    pt: 'Mentalidade'    },
};

const UI_LABELS: Record<string, Record<string, string>> = {
  daily_decision:  { fr: 'DÉCISION DU JOUR', en: 'DAILY DECISION',  es: 'DECISIÓN DEL DÍA', pt: 'DECISÃO DO DIA'      },
  good_reflex:     { fr: 'Bon réflexe !',    en: 'Good reflex!',    es: '¡Buen reflejo!',   pt: 'Bom reflexo!'        },
  liability_chosen:{ fr: 'Passif choisi',    en: 'Liability chosen',es: 'Pasivo elegido',   pt: 'Passivo escolhido'   },
  next_dilemma:    { fr: 'Prochain dilemme dans', en: 'Next dilemma in', es: 'Próximo dilema en', pt: 'Próximo dilema em' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function secondsUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return Math.floor((midnight.getTime() - now.getTime()) / 1000);
}

function formatCountdown(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
}

function getDilemmaOfTheDay(dilemmas: Dilemma[]): Dilemma {
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  return dilemmas[dayIndex % dilemmas.length];
}

function getDilemmasForLang(lang: string): Dilemma[] {
  const l = (lang || 'fr').toLowerCase().slice(0, 2);
  const bundle = DILEMMAS_BUNDLE as Record<string, Dilemma[]>;
  return bundle[l] ?? bundle['fr'] ?? [];
}

const KEY_ANSWER = (email: string) => `dd_answer_${email}_${todayStr()}`;
const KEY_STREAK = (email: string) => `dd_streak_${email}`;

// ─── Component ────────────────────────────────────────────────────────────────

export default function DailyDecisionCard() {
  const { user } = useAuthStore();
  const { language } = useUserPreferences();

  const [dilemma, setDilemma]                 = useState<Dilemma | null>(null);
  const [streak, setStreak]                   = useState<Streak>({ current: 0, longest: 0, last_answered_date: null });
  const [loading, setLoading]                 = useState(true);
  const [flipped, setFlipped]                 = useState(false);
  const [choice, setChoice]                   = useState<'asset' | 'liability' | null>(null);
  const [feedback, setFeedback]               = useState<string | null>(null);
  const [alreadyAnswered, setAlreadyAnswered] = useState(false);
  const [submitting, setSubmitting]           = useState(false);
  const [countdown, setCountdown]             = useState(secondsUntilMidnight());

  const flipAnim         = useRef(new Animated.Value(0)).current;
  const frontInterpolate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backInterpolate  = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });

  useEffect(() => { loadFromLocal(); }, [user?.email, language]);

  useEffect(() => {
    if (!alreadyAnswered) return;
    const interval = setInterval(() => setCountdown(secondsUntilMidnight()), 1000);
    return () => clearInterval(interval);
  }, [alreadyAnswered]);

  async function loadFromLocal() {
    setLoading(true);
    // Reset state when language/user changes
    setFlipped(false);
    setChoice(null);
    setFeedback(null);
    setAlreadyAnswered(false);
    flipAnim.setValue(0);

    try {
      const dilemmas = getDilemmasForLang(language);
      const today    = getDilemmaOfTheDay(dilemmas);
      setDilemma(today);

      if (user?.email) {
        // Streak
        const streakRaw = await AsyncStorage.getItem(KEY_STREAK(user.email));
        const savedStreak: Streak = streakRaw
          ? JSON.parse(streakRaw)
          : { current: 0, longest: 0, last_answered_date: null };
        setStreak(savedStreak);

        // Réponse du jour
        const answerRaw = await AsyncStorage.getItem(KEY_ANSWER(user.email));
        if (answerRaw) {
          const { choice: savedChoice } = JSON.parse(answerRaw);
          const key = savedChoice === 'asset' ? 'choice_asset' : 'choice_liability';
          setChoice(savedChoice);
          setFeedback(today[key].feedback);
          setAlreadyAnswered(true);
          flipAnim.setValue(1);
          setFlipped(true);
        }
      }
    } catch (e) {
      console.error('DailyDecision local load error:', e);
    } finally {
      setLoading(false);
    }

    // Sync backend en arrière-plan (silencieuse)
    syncWithBackend();
  }

  async function syncWithBackend() {
    if (!user?.email) return;
    try {
      const res = await fetch(`${API_BASE}/api/daily-decision`, {
        headers: { 'X-User-Email': user.email, 'X-User-Lang': language },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && data.streak) {
        const serverStreak: Streak = {
          current: data.streak.current,
          longest: data.streak.longest,
          last_answered_date: data.streak.last_answered_date,
        };
        setStreak(prev =>
          serverStreak.longest >= prev.longest ? serverStreak : prev
        );
        if (user?.email) {
          await AsyncStorage.setItem(KEY_STREAK(user.email), JSON.stringify(serverStreak));
        }
      }
    } catch (_) {
      // silencieux — offline
    }
  }

  async function handleChoice(selected: 'asset' | 'liability') {
    if (!dilemma || submitting || alreadyAnswered) return;
    setSubmitting(true);

    try {
      const key = selected === 'asset' ? 'choice_asset' : 'choice_liability';
      setChoice(selected);
      setFeedback(dilemma[key].feedback);
      setAlreadyAnswered(true);

      // Mise à jour streak local
      const today     = todayStr();
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      const prevRaw   = user?.email ? await AsyncStorage.getItem(KEY_STREAK(user.email)) : null;
      const prev: Streak = prevRaw
        ? JSON.parse(prevRaw)
        : { current: 0, longest: 0, last_answered_date: null };

      const newCurrent = prev.last_answered_date === yesterday ? prev.current + 1 : 1;
      const newStreak: Streak = {
        current:            newCurrent,
        longest:            Math.max(prev.longest, newCurrent),
        last_answered_date: today,
      };
      setStreak(newStreak);

      if (user?.email) {
        await AsyncStorage.setItem(KEY_STREAK(user.email), JSON.stringify(newStreak));
        await AsyncStorage.setItem(KEY_ANSWER(user.email), JSON.stringify({ choice: selected, dilemma_id: dilemma.id }));
      }

      // Flip card
      Animated.spring(flipAnim, {
        toValue: 1,
        friction: 8,
        useNativeDriver: Platform.OS !== 'web',
      }).start(() => setFlipped(true));

      // Sync backend en arrière-plan
      syncAnswerToBackend(dilemma.id, selected);

    } catch (e) {
      console.error('DailyDecision choice error:', e);
    } finally {
      setSubmitting(false);
    }
  }

  async function syncAnswerToBackend(dilemmaId: string, selectedChoice: 'asset' | 'liability') {
    if (!user?.email) return;
    try {
      await fetch(`${API_BASE}/api/daily-decision/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Email': user.email },
        body: JSON.stringify({ dilemma_id: dilemmaId, choice: selectedChoice, lang: language }),
        signal: AbortSignal.timeout(5000),
      });
    } catch (_) {
      // silencieux — réponse déjà sauvegardée en local
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#4ADE80" />
      </View>
    );
  }

  if (!dilemma) return null;

  const lang2    = (language || 'fr').toLowerCase().slice(0, 2);
  const catColor = CATEGORY_COLORS[dilemma.category] || '#4ADE80';
  const catLabel = CATEGORY_LABELS[dilemma.category]?.[lang2] || dilemma.category;
  const ui       = (key: string) => UI_LABELS[key]?.[lang2] || UI_LABELS[key]?.['fr'] || key;

  return (
    <View style={styles.wrapper}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionLabel}>{ui('daily_decision')}</Text>
        {streak.current > 0 && (
          <View style={styles.streakBadge}>
            <Text style={styles.streakFire}>🔥</Text>
            <Text style={styles.streakText}>{streak.current}</Text>
          </View>
        )}
      </View>

      <View style={styles.cardContainer}>
        {/* Front */}
        <Animated.View
          style={[
            styles.card,
            styles.cardFront,
            { transform: [{ rotateY: frontInterpolate }], opacity: flipped ? 0 : 1 },
            { display: flipped ? 'none' : 'flex' },
          ]}
        >
          <View style={[styles.categoryTag, { backgroundColor: catColor + '22', borderColor: catColor + '55' }]}>
            <Text style={[styles.categoryText, { color: catColor }]}>{catLabel.toUpperCase()}</Text>
          </View>
          <Text style={styles.dilemmaTitle}>{dilemma.title}</Text>
          <Text style={styles.dilemmaScenario}>{dilemma.scenario}</Text>

          <View style={styles.choicesRow}>
            <TouchableOpacity
              style={[styles.choiceBtn, styles.liabilityBtn]}
              onPress={() => handleChoice('liability')}
              disabled={submitting}
            >
              <Text style={styles.choiceBtnIcon}>📉</Text>
              <Text style={styles.choiceBtnLabel} numberOfLines={3}>{dilemma.choice_liability.label}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.choiceBtn, styles.assetBtn]}
              onPress={() => handleChoice('asset')}
              disabled={submitting}
            >
              <Text style={styles.choiceBtnIcon}>📈</Text>
              <Text style={styles.choiceBtnLabel} numberOfLines={3}>{dilemma.choice_asset.label}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Back (feedback) */}
        <Animated.View
          style={[
            styles.card,
            styles.cardBack,
            { transform: [{ rotateY: backInterpolate }], opacity: flipped ? 1 : 0 },
            { display: flipped ? 'flex' : 'none' },
          ]}
        >
          <Text style={styles.resultIcon}>💡</Text>
          <Text style={styles.resultLabel}>Décision enregistrée</Text>
          <Text style={styles.feedbackText}>{feedback}</Text>

          {alreadyAnswered && (
            <View style={styles.countdownRow}>
              <Text style={styles.countdownLabel}>{ui('next_dilemma')}</Text>
              <Text style={styles.countdownValue}>{formatCountdown(countdown)}</Text>
            </View>
          )}
        </Animated.View>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper:          { marginBottom: 16 },
  loadingContainer: { height: 60, justifyContent: 'center', alignItems: 'center' },
  headerRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionLabel:     { color: '#9CA3AF', fontSize: 11, fontFamily: 'SpaceMono', letterSpacing: 1.5 },
  streakBadge:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1F2937', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, gap: 4 },
  streakFire:       { fontSize: 13 },
  streakText:       { color: '#FBBF24', fontSize: 13, fontWeight: '700', fontFamily: 'SpaceMono' },
  cardContainer:    { position: 'relative', minHeight: 260 },
  card:             { backgroundColor: '#111827', borderRadius: 16, borderWidth: 1, borderColor: '#1F2937', padding: 18, backfaceVisibility: 'hidden' },
  cardFront:        {},
  cardBack:         { alignItems: 'center', justifyContent: 'center' },
  categoryTag:      { alignSelf: 'flex-start', borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 10 },
  categoryText:     { fontSize: 9, fontFamily: 'SpaceMono', letterSpacing: 1 },
  dilemmaTitle:     { color: '#F9FAFB', fontSize: 15, fontWeight: '700', marginBottom: 8 },
  dilemmaScenario:  { color: '#D1D5DB', fontSize: 13, lineHeight: 19, marginBottom: 16 },
  choicesRow:       { flexDirection: 'row', gap: 10 },
  choiceBtn:        { flex: 1, borderRadius: 12, borderWidth: 1, padding: 12, alignItems: 'center', gap: 6 },
  liabilityBtn:     { backgroundColor: '#2C2C2E22', borderColor: '#88888855' },
  assetBtn:         { backgroundColor: '#2C2C2E22', borderColor: '#88888855' },
  choiceBtnIcon:    { fontSize: 20 },
  choiceBtnLabel:   { color: '#E5E7EB', fontSize: 11, textAlign: 'center', lineHeight: 15 },
  resultIcon:       { fontSize: 36, marginBottom: 8 },
  resultLabel:      { color: '#F9FAFB', fontSize: 16, fontWeight: '700', marginBottom: 12 },
  feedbackText:     { color: '#9CA3AF', fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  countdownRow:     { alignItems: 'center', gap: 4 },
  countdownLabel:   { color: '#6B7280', fontSize: 11, fontFamily: 'SpaceMono' },
  countdownValue:   { color: '#4ADE80', fontSize: 13, fontFamily: 'SpaceMono', letterSpacing: 1 },
});
