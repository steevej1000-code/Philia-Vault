import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { COLORS, RADIUS } from '../../constants/colors';
import { PremiumButton } from '../../components/PremiumButton';
import api from '../../services/api';

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !code.trim() || !newPassword) {
      setError('Veuillez remplir tous les champs.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.init();
      const data = await api.resetPassword(email.trim().toLowerCase(), code.trim(), newPassword);
      if (!data.success) throw new Error(data.error || 'Échec de la réinitialisation.');
      setSuccess(true);
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
        <Text style={styles.title}>Réinitialiser le mot de passe</Text>

        {success ? (
          <>
            <Text style={styles.successText}>
              Votre mot de passe a été réinitialisé avec succès.
            </Text>
            <PremiumButton
              title="Se connecter"
              onPress={() => router.replace('/(auth)/login')}
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

            <View style={styles.field}>
              <Text style={styles.label}>Code reçu par email</Text>
              <TextInput
                style={styles.input}
                value={code}
                onChangeText={setCode}
                placeholder="123456"
                placeholderTextColor={COLORS.outline}
                keyboardType="number-pad"
                maxLength={6}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Nouveau mot de passe</Text>
              <TextInput
                style={styles.input}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="••••••••"
                placeholderTextColor={COLORS.outline}
                secureTextEntry
              />
            </View>

            {!!error && <Text style={styles.errorText}>{error}</Text>}

            <PremiumButton
              title="Réinitialiser"
              onPress={handleSubmit}
              loading={loading}
            />
          </>
        )}

        <TouchableOpacity style={styles.backLink} onPress={() => router.replace('/(auth)/login')}>
          <Text style={styles.backLinkText}>Retour à la connexion</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 16 },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.onSurface, marginBottom: 8 },
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
