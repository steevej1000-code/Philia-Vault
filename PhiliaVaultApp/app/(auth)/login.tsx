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

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const { login, register, loginWithGoogle } = useAuthStore();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

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

  const handleSubmit = async () => {
    if (!email.trim() || !password) {
      setError('Veuillez remplir tous les champs.');
      return;
    }
    if (mode === 'register' && (!firstName.trim() || !lastName.trim())) {
      setError('Veuillez entrer votre prénom et nom.');
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
      // AuthGuard in _layout.tsx handles navigation after isAuthenticated changes
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  };

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
});
