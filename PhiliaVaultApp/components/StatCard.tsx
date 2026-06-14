import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { COLORS, RADIUS } from '../constants/colors';

interface StatCardProps {
  label: string;
  value: string;
  subValue?: string;
  color?: string;
  style?: ViewStyle;
  icon?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label, value, subValue, color = COLORS.primary, style
}) => {
  return (
    <View style={[styles.card, style]}>
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
      <Text style={[styles.value, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {subValue && (
        <Text style={styles.subValue} numberOfLines={1}>{subValue}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADIUS.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    flex: 1,
  },
  label: {
    fontSize: 11,
    color: COLORS.onSurfaceVariant,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  value: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: -0.5,
  },
  subValue: {
    fontSize: 12,
    color: COLORS.onSurfaceVariant,
    marginTop: 4,
    fontWeight: '500',
  },
});
