import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, RADIUS } from '../constants/colors';

interface PremiumButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  style?: ViewStyle;
  variant?: 'primary' | 'ghost';
}

export const PremiumButton: React.FC<PremiumButtonProps> = ({
  title, onPress, loading, style, variant = 'primary'
}) => {
  if (variant === 'ghost') {
    return (
      <TouchableOpacity onPress={onPress} style={[styles.ghost, style]} activeOpacity={0.7}>
        <Text style={styles.ghostText}>{title}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={[styles.wrapper, style]}>
      <LinearGradient
        colors={['#ccff00', '#a3e635']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.onPrimary} />
        ) : (
          <Text style={styles.text}>{title}</Text>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: RADIUS.full,
    shadowColor: '#ccff00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  gradient: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  text: {
    color: '#0c0e12',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  ghost: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  ghostText: {
    color: COLORS.onSurface,
    fontSize: 15,
    fontWeight: '600',
  },
});
