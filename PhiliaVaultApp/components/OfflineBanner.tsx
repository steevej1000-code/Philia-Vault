import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, RADIUS } from '../constants/colors';
import { formatLastSync } from '../services/offlineCache';

interface OfflineBannerProps {
  lastSync?: string | null;
  /** When true, shows a subtler "cached data" pill instead of the full offline bar */
  compact?: boolean;
}

/**
 * Banner shown when the app is operating in offline mode, using cached data.
 * Styled with the app's existing dark/warning palette (no new colors added).
 */
export function OfflineBanner({ lastSync, compact }: OfflineBannerProps) {
  if (compact) {
    return (
      <View style={styles.pill}>
        <View style={styles.dot} />
        <Text style={styles.pillText}>Données en cache</Text>
      </View>
    );
  }

  return (
    <View style={styles.banner}>
      <View style={styles.dot} />
      <Text style={styles.text}>
        Mode hors ligne · Dernière synchro : {formatLastSync(lastSync ?? null)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.errorContainer,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    borderRadius: RADIUS.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  text: {
    color: COLORS.onSurface,
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-SemiBold',
    flexShrink: 1,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: COLORS.surfaceContainerHigh,
    borderRadius: RADIUS.full,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  pillText: {
    color: COLORS.onSurfaceVariant,
    fontSize: 11,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.warning,
  },
});

export default OfflineBanner;
