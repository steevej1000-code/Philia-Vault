import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, FlatList, ActivityIndicator,
  Alert, ScrollView, Keyboard, Animated
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
// @ts-ignore — global défini dans paywall.tsx pour le bypass dev
import { purchasePlan, restorePurchases, hasCoachEntitlement } from '../../services/purchases';
import { useAuthStore } from '../../store/authStore';
import { COLORS, RADIUS } from '../../constants/colors';
import {
  IconCoach, IconSearch, IconAssets, IconTarget, IconBolt,
  IconClose, IconProps
} from '../../components/icons/Icons';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useUserPreferences } from '../../context/UserPreferencesContext';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  loading?: boolean;
}

const QUICK_PROMPTS_DATA = [
  { key: 'coach_audit', Icon: IconSearch },
  { key: 'coach_optimize', Icon: IconAssets },
  { key: 'coach_strategy', Icon: IconTarget },
  { key: 'coach_analyze', Icon: IconBolt },
];

/* ─── Paywall ──────────────────────────────────────────────────────────────── */
function PaywallScreen({ onSubscribe, onRestore, onDevBypass, loading }: { onSubscribe: (plan: 'monthly' | 'annual') => void; onRestore: () => void; onDevBypass: () => void; loading: boolean }) {
  const [plan, setPlan] = useState<'monthly' | 'annual'>('annual');
  const { t } = useUserPreferences();

  return (
    <ScrollView
      contentContainerStyle={pw.scroll}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <LinearGradient
        colors={['rgba(204,255,0,0.12)', 'rgba(12,14,18,0)']}
        style={pw.hero}
      >
        <View style={pw.heroIcon}>
          <IconCoach size={36} color="#ccff00" />
        </View>
        <Text style={pw.heroTitle}>{t('coach_title')}</Text>
        <Text style={pw.heroSub}>{t('coach_subtitle')}</Text>
      </LinearGradient>

      {/* Features */}
      <View style={pw.features}>
        {[
          { Icon: IconSearch, t: t('coach_feature_audit') },
          { Icon: IconAssets, t: t('coach_feature_analysis') },
          { Icon: IconTarget, t: t('coach_feature_strategy') },
          { Icon: IconBolt, t: t('coach_feature_instant') },
        ].map((f, i) => (
          <View key={i} style={pw.feat}>
            <View style={pw.featIcon}><f.Icon size={18} color="#ccff00" /></View>
            <Text style={pw.featText}>{f.t}</Text>
          </View>
        ))}
      </View>

      {/* Plan cards */}
      <View style={pw.plans}>
        <TouchableOpacity
          style={[pw.planCard, plan === 'monthly' && pw.planActive]}
          onPress={() => setPlan('monthly')}
          activeOpacity={0.8}
        >
          {plan === 'monthly' && <View style={pw.planCheck}><Text style={{ fontSize: 10, color: '#0c0e12', fontWeight: '900' }}>✓</Text></View>}
          <Text style={pw.planPeriod}>{t('coach_plan_monthly')}</Text>
          <Text style={pw.planPrice}>$9.99</Text>
          <Text style={pw.planUnit}>{t('coach_plan_per_month')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[pw.planCard, plan === 'annual' && pw.planActive]}
          onPress={() => setPlan('annual')}
          activeOpacity={0.8}
        >
          <View style={pw.badge}><Text style={pw.badgeText}>{t('coach_plan_discount')}</Text></View>
          {plan === 'annual' && <View style={pw.planCheck}><Text style={{ fontSize: 10, color: '#0c0e12', fontWeight: '900' }}>✓</Text></View>}
          <Text style={pw.planPeriod}>{t('coach_plan_annual')}</Text>
          <Text style={pw.planPrice}>$79.99</Text>
          <Text style={pw.planUnit}>{t('coach_plan_per_year')}</Text>
          <Text style={pw.planSave}>{t('coach_plan_equivalent')}</Text>
        </TouchableOpacity>
      </View>

      {/* Subscribe */}
      <TouchableOpacity
        style={[pw.subBtn, loading && { opacity: 0.6 }]}
        onPress={() => onSubscribe(plan)}
        disabled={loading}
        activeOpacity={0.85}
      >
        <LinearGradient colors={['#ccff00', '#a3e635']} style={pw.subGrad}>
          {loading
            ? <ActivityIndicator color="#0c0e12" />
            : <Text style={pw.subText}>
                {t('coach_subscribe').replace('{price}', plan === 'monthly' ? `$9.99${t('coach_plan_per_month')}` : `$79.99${t('coach_plan_per_year')}`)}
              </Text>
          }
        </LinearGradient>
      </TouchableOpacity>

      <Text style={pw.legal}>{t('coach_legal')}</Text>

      <TouchableOpacity onPress={onRestore} disabled={loading} style={{ marginTop: 12 }}>
        <Text style={pw.restoreLink}>{t('coach_restore')}</Text>
      </TouchableOpacity>

      {__DEV__ && (
        <TouchableOpacity
          onPress={onDevBypass}
          style={{ marginTop: 20, marginHorizontal: 20, alignItems: 'center', padding: 12, borderWidth: 1, borderColor: '#ff4444', borderRadius: 8 }}
        >
          <Text style={{ color: '#ff4444', fontWeight: 'bold', fontSize: 14 }}>DEV: ACTIVER PREMIUM COACH</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const pw = StyleSheet.create({
  scroll: { paddingBottom: 40 },
  hero: { alignItems: 'center', paddingTop: 32, paddingBottom: 28, paddingHorizontal: 24 },
  heroIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(204,255,0,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  heroTitle: { fontSize: 24, fontWeight: '800', color: COLORS.onSurface, textAlign: 'center' },
  heroSub: { fontSize: 14, color: COLORS.onSurfaceVariant, textAlign: 'center', lineHeight: 22, marginTop: 8, maxWidth: 300 },
  features: { paddingHorizontal: 20, gap: 10, marginBottom: 24 },
  feat: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: COLORS.surfaceContainer, padding: 14, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.glassBorder },
  featIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(204,255,0,0.15)', alignItems: 'center', justifyContent: 'center' },
  featText: { fontSize: 14, fontWeight: '500', color: COLORS.onSurface, flex: 1 },
  plans: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginBottom: 20 },
  planCard: { flex: 1, backgroundColor: COLORS.surfaceContainer, borderRadius: RADIUS.xl, padding: 16, borderWidth: 2, borderColor: COLORS.glassBorder, alignItems: 'center', gap: 2, minHeight: 110, justifyContent: 'center', position: 'relative' },
  planActive: { borderColor: '#ccff00', backgroundColor: 'rgba(204,255,0,0.08)' },
  planCheck: { position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: 9, backgroundColor: '#ccff00', alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -10, left: '50%', transform: [{ translateX: -20 }], backgroundColor: '#ccff00', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  badgeText: { fontSize: 10, fontWeight: '900', color: '#0c0e12' },
  planPeriod: { fontSize: 12, fontWeight: '600', color: COLORS.onSurfaceVariant },
  planPrice: { fontSize: 22, fontWeight: '900', color: COLORS.onSurface, marginTop: 4 },
  planUnit: { fontSize: 12, color: COLORS.onSurfaceVariant },
  planSave: { fontSize: 11, color: '#ccff00', fontWeight: '700', marginTop: 2 },
  subBtn: { marginHorizontal: 20, borderRadius: RADIUS.full, overflow: 'hidden', shadowColor: '#ccff00', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 6 },
  subGrad: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  subText: { fontSize: 15, fontWeight: '800', color: '#0c0e12' },
  legal: { fontSize: 11, color: COLORS.outline, textAlign: 'center', marginTop: 16, paddingHorizontal: 20 },
  restoreLink: { fontSize: 13, color: COLORS.onSurfaceVariant, textAlign: 'center', textDecorationLine: 'underline' },
});

/* ─── Chat ─────────────────────────────────────────────────────────────────── */
export default function CoachScreen() {
  const insets = useSafeAreaInsets();
  const { isPremium, setPremium, user } = useAuthStore();
  const { isOnline } = useNetworkStatus();
  const { t, language } = useUserPreferences();
  
  const [messages, setMessages] = useState<Message[]>([{
    id: '0',
    role: 'assistant',
    content: t('coach_welcome_default'),
  }]);

  // Replace welcome message with personalized one based on real user data
  useEffect(() => {
    (async () => {
      try {
        await api.init();
        const result = await api.getSummary();
        if (!result?.success) return;

        const firstName = user?.first_name || 'Steven';
        const iif = Math.round(result.iif_score ?? 0);
        const cashflow = result.net_cashflow ?? 0;

        const cashflowLine = cashflow > 0
          ? t('coach_cashflow_positive').replace('{amount}', cashflow.toFixed(0))
          : cashflow < 0
            ? t('coach_cashflow_negative').replace('{amount}', cashflow.toFixed(0))
            : t('coach_cashflow_balanced');

        const greeting = t('coach_welcome_personalized')
          .replace('{name}', firstName)
          .replace('{iif}', String(iif))
          .replace('{cashflowLine}', cashflowLine);

        setMessages(prev =>
          prev.length === 1 && prev[0].id === '0'
            ? [{ ...prev[0], content: greeting }]
            : prev
        );
      } catch (e) {
        console.warn('Coach: failed to personalize welcome message', e);
      }
    })();
  }, []);

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [history, setHistory] = useState<{ role: string; text: string }[]>([]);
  
  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  // Card animations
  const cardAnims = useRef(QUICK_PROMPTS_DATA.map(() => new Animated.Value(0))).current;
  const borderGlow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Staggered entrance (slide up + fade in)
    Animated.stagger(90, cardAnims.map(anim =>
      Animated.timing(anim, { toValue: 1, duration: 450, useNativeDriver: false })
    )).start();

    // Breathing border glow: dim red-tinted → bright electric green
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(borderGlow, { toValue: 1, duration: 2200, useNativeDriver: false }),
        Animated.timing(borderGlow, { toValue: 0, duration: 2200, useNativeDriver: false }),
      ])
    );
    breathe.start();
    return () => breathe.stop();
  }, []);

  const scrollToBottom = () => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const handleSend = async (text?: string) => {
    const msgText = (text || input).trim();
    if (!msgText || sending) return;

    if (!isOnline) {
      const offlineMsg: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: t('coach_offline_reply'),
      };
      setMessages(prev => [...prev, { id: (Date.now() - 1).toString(), role: 'user', content: msgText }, offlineMsg]);
      setInput('');
      scrollToBottom();
      return;
    }

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: msgText };
    const loadingMsg: Message = { id: 'loading', role: 'assistant', content: '', loading: true };

    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setInput('');
    setSending(true);
    Keyboard.dismiss();
    scrollToBottom();

    const newHistory = [...history, { role: 'user', text: msgText }];

    try {
      const result = await api.sendChatMessage(msgText, history.slice(-10), language);
      const reply = result.reply || t('coach_no_reply');

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: reply,
      };

      setMessages(prev => prev.filter(m => m.id !== 'loading').concat(aiMsg));
      setHistory([...newHistory, { role: 'model', text: reply }]);
    } catch (e: any) {
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `❌ ${e.message || t('coach_network_error')}`,
      };
      setMessages(prev => prev.filter(m => m.id !== 'loading').concat(errMsg));
    } finally {
      setSending(false);
      scrollToBottom();
    }
  };

  const handleSubscribe = async (plan: 'monthly' | 'annual') => {
    setSubscribing(true);
    try {
      const customerInfo = await purchasePlan(plan === 'annual' ? 'yearly' : 'monthly');
      if (!customerInfo) return;

      if (hasCoachEntitlement(customerInfo)) {
        await api.setPremiumStatus(1).catch(() => {});
        setPremium(true);
        Alert.alert(t('coach_premium_activated_title'), t('coach_premium_activated_message'));
      } else {
        Alert.alert(t('coach_short_title'), t('coach_premium_pending'));
      }
    } catch (e: any) {
      Alert.alert(t('error'), e.message || t('coach_purchase_error'));
    } finally {
      setSubscribing(false);
    }
  };

  const handleDevBypass = async () => {
    await api.setPremiumStatus(1).catch(() => {});
    setPremium(true);
  };

  const handleRestore = async () => {
    setSubscribing(true);
    try {
      const customerInfo = await restorePurchases();
      if (hasCoachEntitlement(customerInfo)) {
        await api.setPremiumStatus(1).catch(() => {});
        setPremium(true);
        Alert.alert(t('coach_restore_success_title'), t('coach_restore_success_message'));
      } else {
        Alert.alert(t('coach_short_title'), t('coach_restore_none'));
      }
    } catch (e: any) {
      Alert.alert(t('error'), e.message || t('coach_restore_error'));
    } finally {
      setSubscribing(false);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[chat.row, isUser && chat.rowUser]}>
        {isUser ? (
          <LinearGradient
            colors={['#ccff00', '#a3e635']}
            style={[chat.bubble, chat.bubbleUser]}
          >
            <View style={chat.avatarInBubbleUser}>
              <Text style={chat.avatarInBubbleTextUser}>
                {user?.first_name?.charAt(0).toUpperCase() || 'S'}
              </Text>
            </View>
            <View style={{ flexShrink: 1 }}>
              <Text style={[chat.bubbleText, chat.bubbleTextUser]}>
                {item.content}
              </Text>
            </View>
          </LinearGradient>
        ) : (
          <View style={[chat.bubble, chat.bubbleAI]}>
            <View style={chat.avatarInBubbleAI}>
              <IconCoach size={11} color="#0c0e12" />
            </View>
            <View style={{ flexShrink: 1 }}>
              {item.loading ? (
                <View style={chat.typingRow}>
                  <ActivityIndicator size="small" color="#ccff00" />
                  <Text style={chat.typingText}>{t('coach_typing')}</Text>
                </View>
              ) : (
                <Text style={[chat.bubbleText, { color: '#ffffff' }]}>
                  {item.content}
                </Text>
              )}
            </View>
          </View>
        )}
      </View>
    );
  };

  if (!isOnline) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('coach_short_title')}</Text>
        </View>
        <View style={offline.wrap}>
          <View style={offline.iconCircle}>
            <IconCoach size={32} color={COLORS.onSurfaceVariant} />
          </View>
          <Text style={offline.title}>{t('coach_offline_unavailable')}</Text>
          <Text style={offline.subtitle}>
            {t('coach_offline_message')}
          </Text>
        </View>
      </View>
    );
  }

  if (!isPremium) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('coach_short_title')}</Text>
          <View style={styles.premiumBadge}>
            <Text style={styles.premiumBadgeText}>{t('coach_premium_badge')}</Text>
          </View>
        </View>
        <PaywallScreen onSubscribe={handleSubscribe} onRestore={handleRestore} onDevBypass={handleDevBypass} loading={subscribing} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      {/* Background glow neon mesh blob (Landing screen only) */}
      {messages.length <= 1 && (
        <View style={styles.glowContainer}>
          <LinearGradient
            colors={['rgba(204,255,0,0.12)', 'rgba(0,0,0,0)']}
            style={styles.glowBlob}
          />
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <View style={styles.coachAvatar}>
            <IconCoach size={18} color="#ccff00" />
          </View>
          <View>
            <Text style={styles.title}>{t('coach_header_name')}</Text>
            <View style={styles.onlineBadge}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineText}>{t('coach_online_status')}</Text>
            </View>
          </View>
        </View>
      </View>

      {messages.length <= 1 ? (
        <ScrollView contentContainerStyle={styles.landingContainer} showsVerticalScrollIndicator={false}>
          {/* Headline */}
          <Text style={styles.landingTitle} numberOfLines={2} adjustsFontSizeToFit>{t('coach_title')}</Text>
          
          {/* Personalized welcome introduction text */}
          <Text style={styles.landingSubtitle}>
            {messages[0]?.content || t('coach_welcome_default')}
          </Text>



          {/* 2x2 grid shortcut cards with animated green/red gradient */}
          <View style={styles.grid}>
            {QUICK_PROMPTS_DATA.map((item, index) => (
              <Animated.View
                key={item.key}
                style={[styles.quickPromptCard, {
                  opacity: cardAnims[index],
                  transform: [{ translateY: cardAnims[index].interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) }],
                  borderColor: borderGlow.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['rgba(160,0,20,0.22)', 'rgba(204,255,0,0.55)'],
                  }),
                }]}
              >
                {/* Green-dominant gradient, red fade at bottom-right corner */}
                <LinearGradient
                  colors={['rgba(204,255,0,0.13)', 'rgba(0,0,0,0)', 'rgba(160,0,20,0.09)']}
                  locations={[0, 0.5, 1]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[StyleSheet.absoluteFill, { borderRadius: 24 }]}
                />
                <TouchableOpacity
                  style={{ flex: 1, justifyContent: 'space-between' }}
                  onPress={() => handleSend(t(item.key))}
                  activeOpacity={0.8}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={styles.quickPromptIconWrapper}>
                      <item.Icon size={16} color="#ccff00" />
                    </View>
                    <Text style={styles.quickPromptArrow}>↗</Text>
                  </View>
                  <Text style={styles.quickPromptText} numberOfLines={2}>
                    {t(item.key)}
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            ))}
          </View>
        </ScrollView>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={renderMessage}
          contentContainerStyle={chat.list}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
          onContentSizeChange={scrollToBottom}
        />
      )}

      {/* Suggestion Chips above input (Visible during active chat only) */}
      {messages.length > 1 && (
        <View style={chat.suggestionScroll}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={chat.suggestionContainer}
          >
            {[t('coach_audit'), t('coach_optimize'), t('coach_strategy'), t('coach_analyze')].map((s, idx) => (
              <TouchableOpacity
                key={idx}
                style={chat.suggestionChip}
                onPress={() => handleSend(s)}
                activeOpacity={0.8}
              >
                <Text style={chat.suggestionText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Dribbble styled rounded input bar (No microphone icon) */}
      <View style={[chat.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TextInput
          ref={inputRef}
          style={chat.input}
          value={input}
          onChangeText={setInput}
          placeholder={t('coach_input_placeholder')}
          placeholderTextColor={COLORS.outline}
          multiline
          maxLength={1000}
          returnKeyType="send"
          onSubmitEditing={() => handleSend()}
          blurOnSubmit
        />
        
        <TouchableOpacity
          onPress={() => handleSend()}
          disabled={!input.trim() || sending}
          activeOpacity={0.8}
          style={[chat.sendBtn, (!input.trim() || sending) && { opacity: 0.4 }]}
        >
          <LinearGradient colors={['#ccff00', '#a3e635']} style={chat.sendGrad}>
            <Text style={chat.sendIcon}>↑</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const offline = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Montserrat-SemiBold',
    color: COLORS.onSurface,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans-Regular',
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 22,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
    backgroundColor: '#000000',
  },
  headerInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  coachAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(204,255,0,0.12)',
    borderWidth: 1, borderColor: 'rgba(204,255,0,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '800', color: COLORS.onSurface },
  onlineBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e' },
  onlineText: { fontSize: 11, color: '#22c55e', fontWeight: '600' },
  premiumBadge: {
    backgroundColor: 'rgba(204,255,0,0.12)',
    borderWidth: 1, borderColor: 'rgba(204,255,0,0.3)',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99,
  },
  premiumBadgeText: { fontSize: 10, fontWeight: '800', color: '#ccff00', letterSpacing: 0.8 },

  // Background blur glow blob
  glowContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: '100%',
    height: 400,
    overflow: 'hidden',
    zIndex: 0,
  },
  glowBlob: {
    position: 'absolute',
    top: -150,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
  },

  // Landing Welcome screen
  landingContainer: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 16,
  },
  landingTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -1,
    lineHeight: 38,
  },
  landingSubtitle: {
    fontSize: 14,
    color: '#8e8e93',
    lineHeight: 22,
    fontWeight: '500',
  },
  searchBarMock: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    marginTop: 8,
  },
  searchBarPlaceholder: {
    fontSize: 14,
    color: '#8e8e93',
  },

  // Grid cards
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 12,
  },
  quickPromptCard: {
    width: '48%',
    height: 114,
    borderWidth: 1,
    borderRadius: 24,
    padding: 14,
    overflow: 'hidden',
  },
  quickPromptIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 16, // Perfect circle icons for quick prompts
    backgroundColor: 'rgba(204,255,0,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickPromptText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
    lineHeight: 16,
  },
  quickPromptArrow: {
    fontSize: 14,
    color: '#ccff00',
    fontWeight: '900',
    alignSelf: 'flex-end',
  },
});

const chat = StyleSheet.create({
  list: { paddingVertical: 16, gap: 12 },
  row: { flexDirection: 'row', justifyContent: 'flex-start', width: '100%', paddingHorizontal: 16, marginBottom: 8 },
  rowUser: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '85%', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12 },
  bubbleAI: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderBottomLeftRadius: 4,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bubbleUser: {
    borderBottomRightRadius: 4,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bubbleText: { fontSize: 14, lineHeight: 22, color: '#ffffff' },
  bubbleTextUser: { color: '#0c0e12', fontWeight: '700' },
  typingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typingText: { fontSize: 13, color: COLORS.onSurfaceVariant, fontStyle: 'italic' },
  
  avatarInBubbleUser: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#0c0e12',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  avatarInBubbleTextUser: {
    fontSize: 11,
    fontWeight: '900',
    color: '#ffffff',
  },
  avatarInBubbleAI: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ccff00',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },

  // Suggestion Chips
  suggestionScroll: {
    paddingVertical: 6,
    maxHeight: 44,
    backgroundColor: 'transparent',
  },
  suggestionContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  suggestionChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  suggestionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ccff00',
  },

  // Input Bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#000000',
    backgroundColor: '#000000',
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
    color: COLORS.onSurface,
    maxHeight: 100,
    minHeight: 44,
  },
  sendBtn: { flexShrink: 0 },
  sendGrad: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#ccff00', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 8,
  },
  sendIcon: { fontSize: 20, fontWeight: '900', color: '#0c0e12' },
});
