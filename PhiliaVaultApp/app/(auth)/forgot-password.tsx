import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { COLORS, RADIUS } from '../../constants/colors';
import { PremiumButton } from '../../components/PremiumButton';
import api from '../../services/api';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim()) {
      setError('Veuillez entrer votre adresse email.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.init();
      await api.forgotPassword(email.trim().toLowerCase());
      setSent(true);
    } catch (e: any) {
      setError(e.message || 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <Text style={styles.title}>Mot de passe oublié</Text>
        <Text style={styles.subtitle}>
          Entrez votre adresse email. Si un compte existe, vous recevrez un code de réinitialisation.
        </Text>

        {sent ? (
          <>
            <Text style={styles.successText}>
              Si ce compte existe, un code à 6 chiffres a été envoyé à {email.trim()}.
            </Text>
            <PremiumButton
              title="Entrer le code"
              onPress={() => router.replace({ pathname: '/(auth)/reset-password', params: { email: email.trim().toLowerCase() } })}
            />
          </>
        ) : (
          <>
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

            {!!error && <Text style={styles.errorText}>{error}</Text>}

            <PremiumButton
              title="Envoyer le code"
              onPress={handleSubmit}
              loading={loading}
            />
          </>
        )}

        <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
          <Text style={styles.backLinkText}>Retour</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 20 },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.onSurface },
  subtitle: { fontSize: 14, color: COLORS.onSurfaceVariant, lineHeight: 20 },
  field: { gap: 6 },
  label: {
    fontSize: 11, fontWeight: '700', color: COLORS.onSurfaceVariant,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: COLORS.glassBorder,
    borderRadius: RADIUS.lg, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: COLORS.onSurface,
  },
  errorText: {
    fontSize: 13, color: COLORS.error, textAlign: 'center', fontWeight: '500',
    backgroundColor: 'rgba(239,68,68,0.1)', padding: 10, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
  },
  successText: { fontSize: 14, color: COLORS.primary, lineHeight: 20 },
  backLink: { marginTop: 8, alignSelf: 'center' },
  backLinkText: { fontSize: 14, fontWeight: '600', color: COLORS.outline },
});
