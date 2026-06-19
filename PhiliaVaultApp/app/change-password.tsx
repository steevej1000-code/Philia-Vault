import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS, RADIUS } from '../constants/colors';
import { IconClose } from '../components/icons/Icons';
import { PremiumButton } from '../components/PremiumButton';
import { useAuthStore } from '../store/authStore';
import { useUserPreferences } from '../context/UserPreferencesContext';

export default function ChangePasswordScreen() {
  const router = useRouter();
  const { t } = useUserPreferences();
  const { changePassword } = useAuthStore();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Veuillez remplir tous les champs.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await changePassword(currentPassword, newPassword);
      Alert.alert('Succès', 'Votre mot de passe a été modifié.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <IconClose size={14} color={COLORS.onSurfaceVariant} />
          <Text style={styles.backText}>{t('close')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('change_password')}</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.field}>
          <Text style={styles.label}>Mot de passe actuel</Text>
          <TextInput
            style={styles.input}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            placeholder="••••••••"
            placeholderTextColor={COLORS.outline}
            secureTextEntry
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

        <View style={styles.field}>
          <Text style={styles.label}>Confirmer le nouveau mot de passe</Text>
          <TextInput
            style={styles.input}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="••••••••"
            placeholderTextColor={COLORS.outline}
            secureTextEntry
          />
        </View>

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        <PremiumButton
          title="Modifier le mot de passe"
          onPress={handleSubmit}
          loading={loading}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#1c1c1e',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  backText: { color: '#8e8e93', fontSize: 15, fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#ffffff' },
  content: { padding: 24, gap: 16 },
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
});
