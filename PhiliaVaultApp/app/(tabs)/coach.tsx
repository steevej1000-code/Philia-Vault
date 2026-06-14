import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, FlatList, ActivityIndicator,
  Alert, ScrollView, Keyboard
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import { purchasePlan, restorePurchases, hasCoachEntitlement } from '../../services/purchases';
import { useAuthStore } from '../../store/authStore';
import { COLORS, RADIUS } from '../../constants/colors';
import { IconCoach, IconSearch, IconAssets, IconTarget, IconBolt, IconProps } from '../../components/icons/Icons';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  loading?: boolean;
}

const QUICK_PROMPTS = ['Audit complet', 'Optimiser mon cashflow', 'Stratégie investissement', 'Analyser mon IIF'];

/* ─── Paywall ──────────────────────────────────────────────────────────────── */
function PaywallScreen({ onSubscribe, onRestore, loading }: { onSubscribe: (plan: 'monthly' | 'annual') => void; onRestore: () => void; loading: boolean }) {
  const [plan, setPlan] = useState<'monthly' | 'annual'>('annual');

  return (
    <ScrollView
      contentContainerStyle={pw.scroll}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <LinearGradient
        colors={['rgba(139,92,246,0.2)', 'rgba(12,14,18,0)']}
        style={pw.hero}
      >
        <View style={pw.heroIcon}>
          <IconCoach size={36} color={COLORS.primary} />
        </View>
        <Text style={pw.heroTitle}>Coach Financier IA</Text>
        <Text style={pw.heroSub}>Votre conseiller financier personnel alimenté par Gemini AI</Text>
      </LinearGradient>

      {/* Features */}
      <View style={pw.features}>
        {[
          { Icon: IconSearch, t: 'Audit mensuel complet de votre patrimoine' },
          { Icon: IconAssets, t: 'Analyse intelligente actifs / passifs' },
          { Icon: IconTarget, t: 'Stratégies de croissance personnalisées' },
          { Icon: IconBolt, t: 'Réponses instantanées, disponible 24h/24' },
        ].map((f, i) => (
          <View key={i} style={pw.feat}>
            <View style={pw.featIcon}><f.Icon size={18} color={COLORS.primary} /></View>
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
          <Text style={pw.planPeriod}>Mensuel</Text>
          <Text style={pw.planPrice}>$9.99</Text>
          <Text style={pw.planUnit}>/mois</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[pw.planCard, plan === 'annual' && pw.planActive]}
          onPress={() => setPlan('annual')}
          activeOpacity={0.8}
        >
          <View style={pw.badge}><Text style={pw.badgeText}>-33%</Text></View>
          {plan === 'annual' && <View style={pw.planCheck}><Text style={{ fontSize: 10, color: '#0c0e12', fontWeight: '900' }}>✓</Text></View>}
          <Text style={pw.planPeriod}>Annuel</Text>
          <Text style={pw.planPrice}>$79.99</Text>
          <Text style={pw.planUnit}>/an</Text>
          <Text style={pw.planSave}>= $6.67/mois</Text>
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
                S'abonner — {plan === 'monthly' ? '$9.99/mois' : '$79.99/an'}
              </Text>
          }
        </LinearGradient>
      </TouchableOpacity>

      <Text style={pw.legal}>Annulable à tout moment · Sans engagement</Text>

      <TouchableOpacity onPress={onRestore} disabled={loading} style={{ marginTop: 12 }}>
        <Text style={pw.restoreLink}>Restaurer mes achats</Text>
      </TouchableOpacity>
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
  featIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(139,92,246,0.15)', alignItems: 'center', justifyContent: 'center' },
  featText: { fontSize: 14, fontWeight: '500', color: COLORS.onSurface, flex: 1 },
  plans: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginBottom: 20 },
  planCard: { flex: 1, backgroundColor: COLORS.surfaceContainer, borderRadius: RADIUS.xl, padding: 16, borderWidth: 2, borderColor: COLORS.glassBorder, alignItems: 'center', gap: 2, minHeight: 110, justifyContent: 'center', position: 'relative' },
  planActive: { borderColor: COLORS.primary, backgroundColor: 'rgba(204,255,0,0.08)' },
  planCheck: { position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: 9, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -10, left: '50%', transform: [{ translateX: -20 }], backgroundColor: COLORS.primary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  badgeText: { fontSize: 10, fontWeight: '900', color: '#0c0e12' },
  planPeriod: { fontSize: 12, fontWeight: '600', color: COLORS.onSurfaceVariant },
  planPrice: { fontSize: 22, fontWeight: '900', color: COLORS.onSurface, marginTop: 4 },
  planUnit: { fontSize: 12, color: COLORS.onSurfaceVariant },
  planSave: { fontSize: 11, color: COLORS.primary, fontWeight: '700', marginTop: 2 },
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
  const [messages, setMessages] = useState<Message[]>([{
    id: '0',
    role: 'assistant',
    content: 'Bonjour ! 👋 Je suis votre Coach Financier IA Philia Vault.\n\nJe peux analyser votre patrimoine en temps réel et vous donner des conseils personnalisés.\n\nTapez **"audit"** pour démarrer une analyse complète.',
  }]);

  // Replace the static welcome message with a personalized one based on the
  // user's real portfolio data as soon as it's available.
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
          ? `Votre cashflow mensuel est positif (+${cashflow.toFixed(0)}$) — voyons comment l'optimiser.`
          : cashflow < 0
            ? `Votre cashflow mensuel est négatif (${cashflow.toFixed(0)}$) — analysons ça ensemble.`
            : `Votre cashflow mensuel est à l'équilibre.`;

        const greeting = `Bonjour ${firstName} ! 👋 Je suis votre Coach Financier IA Philia Vault.\n\nVotre score IIF actuel est de ${iif}%. ${cashflowLine}\n\nTapez **"audit"** pour démarrer une analyse complète.`;

        setMessages(prev =>
          prev.length === 1 && prev[0].id === '0'
            ? [{ ...prev[0], content: greeting }]
            : prev
        );
      } catch (e) {
        // Keep the static fallback welcome message if the summary can't be loaded.
        console.warn('Coach: impossible de personnaliser le message d\'accueil', e);
      }
    })();
  }, []);

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [history, setHistory] = useState<{ role: string; text: string }[]>([]);
  const listRef = useRef<FlatList>(null);

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
        content: "📡 Le Coach IA n'est pas disponible hors ligne. Reconnectez-vous à internet pour reprendre la conversation.",
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
      const result = await api.sendChatMessage(msgText, newHistory.slice(-10));
      // The Flask server returns "reply" field
      const reply = result.reply || result.response || result.message || 'Désolé, pas de réponse.';

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
        content: `❌ ${e.message || 'Erreur réseau. Vérifiez que le serveur est lancé.'}`,
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
      // RevenueCat handles the native App Store / Play Store purchase flow.
      const customerInfo = await purchasePlan(plan === 'annual' ? 'yearly' : 'monthly');
      if (!customerInfo) {
        // User cancelled the purchase sheet — nothing to do.
        return;
      }
      if (hasCoachEntitlement(customerInfo)) {
        // Sync premium status to the Flask backend (which RevenueCat
        // webhooks also update server-side via /api/webhooks/revenuecat).
        await api.setPremiumStatus(1).catch(() => {});
        setPremium(true);
        Alert.alert('🎉 Premium activé !', 'Bienvenue dans le Club Premium Philia Vault !');
      } else {
        Alert.alert('Info', 'Achat effectué mais l\'accès Premium n\'est pas encore actif. Réessayez dans quelques instants.');
      }
    } catch (e: any) {
      Alert.alert('Erreur', e.message || 'Achat impossible pour le moment.');
    } finally {
      setSubscribing(false);
    }
  };

  const handleRestore = async () => {
    setSubscribing(true);
    try {
      const customerInfo = await restorePurchases();
      if (hasCoachEntitlement(customerInfo)) {
        await api.setPremiumStatus(1).catch(() => {});
        setPremium(true);
        Alert.alert('✅ Restauré', 'Votre abonnement Premium a été restauré.');
      } else {
        Alert.alert('Info', 'Aucun abonnement actif trouvé pour ce compte.');
      }
    } catch (e: any) {
      Alert.alert('Erreur', e.message || 'Restauration impossible.');
    } finally {
      setSubscribing(false);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[chat.row, isUser && chat.rowUser]}>
        {!isUser && (
          <View style={chat.avatar}>
            <IconCoach size={14} color={COLORS.primary} />
          </View>
        )}
        <View style={[chat.bubble, isUser ? chat.bubbleUser : chat.bubbleAI]}>
          {item.loading ? (
            <View style={chat.typingRow}>
              <ActivityIndicator size="small" color={COLORS.tertiary} />
              <Text style={chat.typingText}>En train d'analyser...</Text>
            </View>
          ) : (
            <Text style={[chat.bubbleText, isUser && chat.bubbleTextUser]}>
              {item.content}
            </Text>
          )}
        </View>
      </View>
    );
  };

  if (!isOnline) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Coach IA</Text>
        </View>
        <View style={offline.wrap}>
          <View style={offline.iconCircle}>
            <IconCoach size={32} color={COLORS.onSurfaceVariant} />
          </View>
          <Text style={offline.title}>Coach IA indisponible hors ligne</Text>
          <Text style={offline.subtitle}>
            Le Coach Financier IA nécessite une connexion internet pour analyser votre patrimoine en temps réel.{'\n\n'}
            Reconnectez-vous pour continuer la conversation.
          </Text>
        </View>
      </View>
    );
  }

  if (!isPremium) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Coach IA</Text>
          <View style={styles.premiumBadge}>
            <Text style={styles.premiumBadgeText}>PREMIUM</Text>
          </View>
        </View>
        <PaywallScreen onSubscribe={handleSubscribe} onRestore={handleRestore} loading={subscribing} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <View style={styles.coachAvatar}>
            <IconCoach size={18} color={COLORS.primary} />
          </View>
          <View>
            <Text style={styles.title}>Coach Philia Vault</Text>
            <View style={styles.onlineBadge}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineText}>Gemini AI • En ligne</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Messages */}
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

      {/* Quick Prompts */}
      {messages.length <= 2 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={chat.quickRow}
          style={chat.quickContainer}
        >
          {QUICK_PROMPTS.map(q => (
            <TouchableOpacity
              key={q}
              style={chat.quickBtn}
              onPress={() => handleSend(q)}
              activeOpacity={0.7}
            >
              <Text style={chat.quickText}>{q}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Input Bar */}
      <View style={[chat.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TextInput
          style={chat.input}
          value={input}
          onChangeText={setInput}
          placeholder="Posez votre question financière..."
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
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.glassBorder,
    backgroundColor: 'rgba(12,14,18,0.95)',
  },
  headerInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  coachAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(139,92,246,0.2)',
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.35)',
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
  premiumBadgeText: { fontSize: 10, fontWeight: '800', color: COLORS.primary, letterSpacing: 0.8 },
});

const chat = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  rowUser: { flexDirection: 'row-reverse' },
  avatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, marginBottom: 2,
  },
  bubble: { maxWidth: '80%', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 12 },
  bubbleAI: {
    backgroundColor: 'rgba(26,32,44,0.95)',
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.15)',
    borderBottomLeftRadius: 4,
  },
  bubbleUser: {
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 4,
  },
  bubbleText: { fontSize: 14, lineHeight: 22, color: COLORS.onSurface },
  bubbleTextUser: { color: '#0c0e12', fontWeight: '600' },
  typingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typingText: { fontSize: 13, color: COLORS.onSurfaceVariant, fontStyle: 'italic' },
  quickContainer: { maxHeight: 48, marginBottom: 4 },
  quickRow: { paddingHorizontal: 16, gap: 8, paddingVertical: 4 },
  quickBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 99,
    backgroundColor: COLORS.surfaceContainerHigh,
    borderWidth: 1, borderColor: COLORS.glassBorder,
  },
  quickText: { fontSize: 13, fontWeight: '600', color: COLORS.primary },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.glassBorder,
    backgroundColor: 'rgba(12,14,18,0.98)',
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
    color: COLORS.onSurface,
    maxHeight: 100,
    minHeight: 46,
  },
  sendBtn: { flexShrink: 0, marginBottom: 0 },
  sendGrad: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#ccff00', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 8,
  },
  sendIcon: { fontSize: 20, fontWeight: '900', color: '#0c0e12' },
});
