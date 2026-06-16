import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView,
  TouchableOpacity, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { makeRedirectUri } from 'expo-auth-session';
import { IconShield } from '../../components/icons/Icons';
import { useAuthStore } from '../../store/authStore';
import { COLORS, RADIUS } from '../../constants/colors';
import { PremiumButton } from '../../components/PremiumButton';
import { GOOGLE_WEB_CLIENT_ID } from '../../constants/api';
import api from '../../services/api';
import { useUserPreferences } from '../../context/UserPreferencesContext';
import Svg, { Path, Circle, Line, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';

WebBrowser.maybeCompleteAuthSession();

function MirrorIllustration() {
  return (
    <Svg width={120} height={120} viewBox="0 0 120 120" style={{ alignSelf: 'center', marginVertical: 12 }}>
      <Defs>
        <SvgGradient id="mirrorGlow" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#c8ff00" stopOpacity="0.4" />
          <Stop offset="1" stopColor="#0c0e12" stopOpacity="0.1" />
        </SvgGradient>
      </Defs>
      <Path d="M 60 90 L 60 115" stroke="#8e8e93" strokeWidth="8" strokeLinecap="round" />
      <Line x1="50" y1="110" x2="70" y2="110" stroke="#8e8e93" strokeWidth="6" strokeLinecap="round" />
      <Circle cx="60" cy="55" r="35" fill="rgba(255,255,255,0.03)" stroke="#c8ff00" strokeWidth="4" />
      <Circle cx="60" cy="55" r="30" fill="url(#mirrorGlow)" stroke="rgba(200,255,0,0.2)" strokeWidth="1" />
      <Path d="M 45 45 L 75 65" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      <Path d="M 55 40 L 70 50" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
    </Svg>
  );
}

function GPSIllustration() {
  return (
    <Svg width={120} height={120} viewBox="0 0 120 120" style={{ alignSelf: 'center', marginVertical: 12 }}>
      <Defs>
        <SvgGradient id="pathGlow" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#c8ff00" />
          <Stop offset="1" stopColor="#06b6d4" />
        </SvgGradient>
      </Defs>
      <Line x1="10" y1="60" x2="110" y2="60" stroke="rgba(255,255,255,0.05)" strokeWidth="2" strokeDasharray="5 5" />
      <Line x1="60" y1="10" x2="60" y2="110" stroke="rgba(255,255,255,0.05)" strokeWidth="2" strokeDasharray="5 5" />
      <Path
        d="M 20 100 C 40 100, 40 40, 70 40 C 90 40, 100 70, 100 20"
        fill="none"
        stroke="rgba(255,255,255,0.1)"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <Path
        d="M 20 100 C 40 100, 40 40, 70 40 C 90 40, 100 70, 100 20"
        fill="none"
        stroke="url(#pathGlow)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="10 5"
      />
      <Circle cx="20" cy="100" r="6" fill="#06b6d4" stroke="#ffffff" strokeWidth="1.5" />
      <Path d="M 100 20 L 100 10" stroke="#c8ff00" strokeWidth="2" />
      <Path d="M 100 10 L 112 15 L 100 20 Z" fill="#c8ff00" />
    </Svg>
  );
}

export default function LoginScreen() {
  const { login, register, loginWithGoogle } = useAuthStore();
  const { t } = useUserPreferences();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingSlide, setOnboardingSlide] = useState(1);

  // Real Google OAuth via expo-auth-session
  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: GOOGLE_WEB_CLIENT_ID,
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_WEB_CLIENT_ID,
    androidClientId: GOOGLE_WEB_CLIENT_ID,
    redirectUri: makeRedirectUri({
      scheme: 'philiavault',
      preferLocalhost: false,
    }),
  });

  useEffect(() => {
    if (response?.type === 'success') {
      handleGoogleSuccess(response);
    } else if (response?.type === 'error') {
      setError('Connexion Google annulée ou échouée.');
      setGoogleLoading(false);
    } else if (response?.type === 'dismiss') {
      setGoogleLoading(false);
    }
  }, [response]);

  const handleGoogleSuccess = async (resp: any) => {
    setGoogleLoading(true);
    setError('');
    try {
      const { authentication } = resp;
      if (!authentication?.accessToken) {
        throw new Error('Token Google non reçu');
      }

      // Fetch user info from Google using accessToken
      const userInfoResponse = await fetch('https://www.googleapis.com/userinfo/v2/me', {
        headers: { Authorization: `Bearer ${authentication.accessToken}` },
      });
      const userInfo = await userInfoResponse.json();

      if (!userInfo.email) {
        throw new Error('Impossible de récupérer l\'email Google');
      }

      // Use id_token if available, otherwise create a synthetic token
      const idToken = authentication.idToken || authentication.accessToken;

      // Send to our Flask backend
      await loginWithGoogle(idToken);
    } catch (e: any) {
      setError(e.message || 'Erreur lors de la connexion Google.');
      setGoogleLoading(false);
    }
  };

  const handleGooglePress = async () => {
    setGoogleLoading(true);
    setError('');
    await promptAsync();
  };

  const handleDemoPress = async () => {
    setLoading(true);
    setError('');
    try {
      // Create a persistent demo email
      const demoEmail = 'test@philiavault.com';
      
      // Initialize API and use user email directly to set local state
      await api.init();
      api.setUserEmail(demoEmail);
      
      // Register or login the test account on the Flask backend automatically
      try {
        await register('Utilisateur', 'Premium', demoEmail, 'password123');
      } catch (e) {
        // If already registered, just log in
        await login(demoEmail, 'password123');
      }
      
      // Auto-unlock premium for a perfect preview
      await api.setPremiumStatus(1);
      const { setPremium } = useAuthStore.getState();
      setPremium(true);
      
      await useAuthStore.getState().refreshUser();
    } catch (e: any) {
      setError(e.message || 'Échec de la connexion démo.');
    } finally {
      setLoading(false);
    }
  };

  const [referralCode, setReferralCode] = useState('');

  const handleSubmit = async (bypassOnboarding = false) => {
    if (!email.trim() || !password) {
      setError('Veuillez remplir tous les champs.');
      return;
    }
    if (mode === 'register' && (!firstName.trim() || !lastName.trim())) {
      setError('Veuillez entrer votre prénom et nom.');
      return;
    }

    if (mode === 'register' && !bypassOnboarding && !showOnboarding) {
      setShowOnboarding(true);
      setOnboardingSlide(1);
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (mode === 'login') {
        await login(email.trim().toLowerCase(), password);
      } else {
        await register(firstName.trim(), lastName.trim(), email.trim().toLowerCase(), password, referralCode.trim());
      }
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue.');
      setShowOnboarding(false);
    } finally {
      setLoading(false);
    }
  };

  if (showOnboarding) {
    return (
      <View style={styles.container}>
        <View style={styles.glowTop} />
        <View style={styles.glowBottom} />
        <View style={styles.onboardingWrapper}>
          {onboardingSlide === 1 ? (
            <View style={styles.slide}>
              <Text style={styles.onboardingTitle}>{t('onboarding_title_step1')}</Text>
              <MirrorIllustration />
              <View style={styles.slideCard}>
                <Text style={styles.slideSubtitle}>{t('onboarding_subtitle_step1')}</Text>
                <Text style={styles.slideResult}>{t('onboarding_result_step1').replace('{years}', '35')}</Text>
              </View>
              <View style={styles.dotsRow}>
                <View style={[styles.dot, styles.dotActive]} />
                <View style={styles.dot} />
              </View>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => setOnboardingSlide(2)}
              >
                <Text style={styles.primaryBtnText}>{t('onboarding_btn_next')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.slide}>
              <Text style={styles.onboardingTitle}>{t('onboarding_title_step2')}</Text>
              <GPSIllustration />
              <View style={styles.slideCard}>
                <Text style={styles.slideMessage}>{t('onboarding_message_step2')}</Text>
              </View>
              <View style={styles.dotsRow}>
                <View style={styles.dot} />
                <View style={[styles.dot, styles.dotActive]} />
              </View>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => {
                  handleSubmit(true);
                }}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#0c0e12" size="small" />
                ) : (
                  <Text style={styles.primaryBtnText}>{t('onboarding_btn_start')}</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
          <TouchableOpacity
            style={styles.backLink}
            onPress={() => {
              if (onboardingSlide === 2) {
                setOnboardingSlide(1);
              } else {
                setShowOnboarding(false);
              }
            }}
          >
            <Text style={styles.backLinkText}>{t('cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Background glows */}
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Brand */}
        <View style={styles.brand}>
          <LinearGradient colors={['#ccff00', '#a3e635']} style={styles.logo}>
            <Text style={styles.logoText}>PV</Text>
          </LinearGradient>
          <Text style={styles.brandName}>Philia Vault</Text>
          <Text style={styles.tagline}>Votre coffre-fort financier sécurisé</Text>
        </View>

        {/* Login / Register Tab Switcher */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, mode === 'login' && styles.tabActive]}
            onPress={() => { setMode('login'); setError(''); }}
          >
            <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>Connexion</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, mode === 'register' && styles.tabActive]}
            onPress={() => { setMode('register'); setError(''); }}
          >
            <Text style={[styles.tabText, mode === 'register' && styles.tabTextActive]}>Inscription</Text>
          </TouchableOpacity>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {mode === 'register' && (
            <View style={styles.nameRow}>
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={styles.label}>Prénom</Text>
                <TextInput
                  style={styles.input}
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="Jean"
                  placeholderTextColor={COLORS.outline}
                  autoCapitalize="words"
                />
              </View>
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={styles.label}>Nom</Text>
                <TextInput
                  style={styles.input}
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Dupont"
                  placeholderTextColor={COLORS.outline}
                  autoCapitalize="words"
                />
              </View>
            </View>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="vous@exemple.com"
              placeholderTextColor={COLORS.outline}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Mot de passe</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={COLORS.outline}
              secureTextEntry
            />
          </View>

          {mode === 'register' && (
            <View style={styles.field}>
              <Text style={styles.label}>Code de parrainage (Optionnel)</Text>
              <TextInput
                style={styles.input}
                value={referralCode}
                onChangeText={setReferralCode}
                placeholder="ex: REF12345"
                placeholderTextColor={COLORS.outline}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </View>
          )}

          {!!error && <Text style={styles.errorText}>{error}</Text>}

          <PremiumButton
            title={mode === 'login' ? 'Se connecter' : "Créer mon compte"}
            onPress={handleSubmit}
            loading={loading}
          />

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>ou</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Real Google Sign-In Button */}
          <TouchableOpacity
            style={[styles.googleBtn, (googleLoading || !request) && styles.googleBtnDisabled]}
            onPress={handleGooglePress}
            disabled={googleLoading || !request}
            activeOpacity={0.8}
          >
            {googleLoading ? (
              <ActivityIndicator color={COLORS.onSurface} size="small" />
            ) : (
              <>
                <Text style={styles.googleIcon}>G</Text>
                <Text style={styles.googleText}>Continuer avec Google</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Quick Test Demo Button */}
          <TouchableOpacity
            style={styles.demoBtn}
            onPress={handleDemoPress}
            activeOpacity={0.8}
          >
            <Text style={styles.demoText}>Accès rapide (Démo & Test)</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.disclaimerRow}>
          <IconShield size={14} color={COLORS.outline} />
          <Text style={styles.disclaimer}>
            Cryptage AES-256 niveau bancaire{'\n'}
            Philia Vault ne vend jamais vos données.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 40,
  },
  glowTop: {
    position: 'absolute',
    top: -120,
    left: -60,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(204,255,0,0.07)',
  },
  glowBottom: {
    position: 'absolute',
    bottom: -100,
    right: -60,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(139,92,246,0.07)',
  },
  brand: {
    alignItems: 'center',
    marginBottom: 40,
    gap: 8,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ccff00',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  logoText: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0c0e12',
  },
  brandName: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.onSurface,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 14,
    color: COLORS.onSurfaceVariant,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADIUS.full,
    padding: 4,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  tab: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: RADIUS.full,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.onSurfaceVariant,
  },
  tabTextActive: {
    color: '#0c0e12',
    fontWeight: '800',
  },
  form: {
    gap: 16,
  },
  nameRow: {
    flexDirection: 'row',
    gap: 12,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.onSurfaceVariant,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: COLORS.onSurface,
  },
  errorText: {
    fontSize: 13,
    color: COLORS.error,
    textAlign: 'center',
    fontWeight: '500',
    backgroundColor: 'rgba(239,68,68,0.1)',
    padding: 10,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.glassBorder,
  },
  dividerText: {
    fontSize: 12,
    color: COLORS.outline,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 14,
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
    borderColor: COLORS.glassBorder,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  googleBtnDisabled: {
    opacity: 0.5,
  },
  googleIcon: {
    fontSize: 18,
    fontWeight: '900',
    color: '#4285F4',
  },
  googleText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  demoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 8,
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
    borderColor: 'rgba(204,255,0,0.3)',
    backgroundColor: 'rgba(204,255,0,0.03)',
  },
  demoText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  disclaimerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 8,
    marginTop: 32,
  },
  disclaimer: {
    fontSize: 11,
    color: COLORS.outline,
    textAlign: 'left',
    lineHeight: 18,
  },
  onboardingWrapper: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  slide: {
    alignItems: 'center',
    gap: 16,
    width: '100%',
  },
  onboardingTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 8,
  },
  slideCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: RADIUS.xl,
    padding: 24,
    width: '100%',
    gap: 12,
    alignItems: 'center',
  },
  slideSubtitle: {
    fontSize: 15,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 22,
  },
  slideResult: {
    fontSize: 16,
    fontWeight: '700',
    color: '#c8ff00',
    textAlign: 'center',
    lineHeight: 24,
    marginTop: 8,
  },
  slideMessage: {
    fontSize: 15,
    color: COLORS.onSurface,
    textAlign: 'center',
    lineHeight: 22,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  dotActive: {
    backgroundColor: '#c8ff00',
    width: 20,
  },
  primaryBtn: {
    backgroundColor: '#c8ff00',
    width: '100%',
    paddingVertical: 16,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    shadowColor: '#c8ff00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    marginTop: 16,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0c0e12',
  },
  backLink: {
    marginTop: 24,
    alignSelf: 'center',
  },
  backLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.outline,
  },
});
