import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../constants/colors';
import { SimulatorContent } from '../../components/SimulatorContent';
import { useUserPreferences } from '../../context/UserPreferencesContext';

export default function SimulatorScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useUserPreferences();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{t('simulator_title')}</Text>
          <Text style={styles.subtitle}>{t('simulator_subtitle')}</Text>
        </View>
      </View>
      <SimulatorContent />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.glassBorder, backgroundColor: 'rgba(12,14,18,0.8)' },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.onSurface },
  subtitle: { fontSize: 13, color: COLORS.onSurfaceVariant, marginTop: 2 },
});
