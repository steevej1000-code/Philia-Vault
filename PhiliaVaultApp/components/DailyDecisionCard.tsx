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
import { useAuthStore } from '../store/authStore';
import { API_BASE } from '../constants/api';

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

const CATEGORY_COLORS: Record<string, string> = {
  cashflow: '#4ADE80',
  dette: '#F87171',
  investissement: '#60A5FA',
  mentalite: '#FBBF24',
};

const CATEGORY_LABELS: Record<string, string> = {
  cashflow: 'Cash Flow',
  dette: 'Dette',
  investissement: 'Investissement',
  mentalite: 'Mentalité',
};

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

export default function DailyDecisionCard() {
  const { user } = useAuthStore();
  const [dilemma, setDilemma] = useState<Dilemma | null>(null);
  const [streak, setStreak] = useState<Streak>({ current: 0, longest: 0, last_answered_date: null });
  const [loading, setLoading] = useState(true);
  const [flipped, setFlipped] = useState(false);
  const [choice, setChoice] = useState<'asset' | 'liability' | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [alreadyAnswered, setAlreadyAnswered] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(secondsUntilMidnight());

  // Flip animation
  const flipAnim = useRef(new Animated.Value(0)).current;
  const frontInterpolate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backInterpolate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });

  useEffect(() => {
    fetchDilemma();
  }, []);

  useEffect(() => {
    if (!alreadyAnswered) return;
    const interval = setInterval(() => setCountdown(secondsUntilMidnight()), 1000);
    return () => clearInterval(interval);
  }, [alreadyAnswered]);

  async function fetchDilemma() {
    if (!user?.email) return;
    try {
      const res = await fetch(`${API_BASE}/api/daily-decision`, {
        headers: { 'X-User-Email': user.email },
      });
      const data = await res.json();
      if (data.success) {
        setDilemma(data.dilemma);
        setStreak(data.streak);
        if (data.already_answered && data.choice) {
          setChoice(data.choice);
          setAlreadyAnswered(true);
          const key = data.choice === 'asset' ? 'choice_asset' : 'choice_liability';
          setFeedback(data.dilemma[key].feedback);
          // Start already flipped
          flipAnim.setValue(1);
          setFlipped(true);
        }
      }
    } catch (e) {
      console.error('DailyDecision fetch error:', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleChoice(selected: 'asset' | 'liability') {
    if (!dilemma || !user?.email || submitting || alreadyAnswered) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/daily-decision/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Email': user.email },
        body: JSON.stringify({ dilemma_id: dilemma.id, choice: selected }),
      });
      const data = await res.json();
      if (data.success) {
        setChoice(selected);
        setFeedback(data.feedback);
        setStreak(data.streak);
        setAlreadyAnswered(true);
        // Flip card
        Animated.spring(flipAnim, { toValue: 1, friction: 8, useNativeDriver: Platform.OS !== 'web' }).start(() => setFlipped(true));
      }
    } catch (e) {
      console.error('DailyDecision answer error:', e);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#4ADE80" />
      </View>
    );
  }

  if (!dilemma) return null;

  const catColor = CATEGORY_COLORS[dilemma.category] || '#4ADE80';
  const catLabel = CATEGORY_LABELS[dilemma.category] || dilemma.category;

  return (
    <View style={styles.wrapper}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <Text style={styles.sectionLabel}>DÉCISION DU JOUR</Text>
        {streak.current > 0 && (
          <View style={styles.streakBadge}>
            <Text style={styles.streakFire}>🔥</Text>
            <Text style={styles.streakText}>{streak.current}</Text>
          </View>
        )}
      </View>

      {/* Card */}
      <View style={styles.cardContainer}>
        {/* Front face */}
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

        {/* Back face (feedback) */}
        <Animated.View
          style={[
            styles.card,
            styles.cardBack,
            { transform: [{ rotateY: backInterpolate }], opacity: flipped ? 1 : 0 },
            { display: flipped ? 'flex' : 'none' },
          ]}
        >
          <Text style={styles.resultIcon}>{choice === 'asset' ? '✅' : '⚠️'}</Text>
          <Text style={styles.resultLabel}>
            {choice === 'asset' ? 'Bon réflexe !' : 'Passif choisi'}
          </Text>
          <Text style={styles.feedbackText}>{feedback}</Text>

          {alreadyAnswered && (
            <View style={styles.countdownRow}>
              <Text style={styles.countdownLabel}>Prochain dilemme dans</Text>
              <Text style={styles.countdownValue}>{formatCountdown(countdown)}</Text>
            </View>
          )}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 16,
  },
  loadingContainer: {
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionLabel: {
    color: '#9CA3AF',
    fontSize: 11,
    fontFamily: 'SpaceMono',
    letterSpacing: 1.5,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 4,
  },
  streakFire: {
    fontSize: 13,
  },
  streakText: {
    color: '#FBBF24',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'SpaceMono',
  },
  cardContainer: {
    position: 'relative',
    minHeight: 260,
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 18,
    backfaceVisibility: 'hidden',
  },
  cardFront: {},
  cardBack: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryTag: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 10,
  },
  categoryText: {
    fontSize: 9,
    fontFamily: 'SpaceMono',
    letterSpacing: 1,
  },
  dilemmaTitle: {
    color: '#F9FAFB',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  dilemmaScenario: {
    color: '#D1D5DB',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  choicesRow: {
    flexDirection: 'row',
    gap: 10,
  },
  choiceBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
    gap: 6,
  },
  liabilityBtn: {
    backgroundColor: '#7F1D1D22',
    borderColor: '#F8717155',
  },
  assetBtn: {
    backgroundColor: '#14532D22',
    borderColor: '#4ADE8055',
  },
  choiceBtnIcon: {
    fontSize: 20,
  },
  choiceBtnLabel: {
    color: '#E5E7EB',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 15,
  },
  resultIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  resultLabel: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  feedbackText: {
    color: '#9CA3AF',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  countdownRow: {
    alignItems: 'center',
    gap: 4,
  },
  countdownLabel: {
    color: '#6B7280',
    fontSize: 11,
    fontFamily: 'SpaceMono',
  },
  countdownValue: {
    color: '#4ADE80',
    fontSize: 13,
    fontFamily: 'SpaceMono',
    letterSpacing: 1,
  },
});
