import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, RADIUS } from '../constants/colors';
import { IconTrendUp, IconCoin, IconBag, IconBuilding, IconWallet, IconClose, IconProps } from './icons/Icons';

interface AssetRowProps {
  name: string;
  type: string;
  value: number;
  monthlyYield: number;
  currency?: string;
  onDelete?: () => void;
}

const TYPE_CONFIG: Record<string, { bg: string; color: string; Icon: React.ComponentType<IconProps> }> = {
  Stocks: { bg: 'rgba(204,255,0,0.12)', color: '#ccff00', Icon: IconTrendUp },
  Crypto: { bg: 'rgba(139,92,246,0.12)', color: '#8b5cf6', Icon: IconCoin },
  Commerce: { bg: 'rgba(34,197,94,0.12)', color: '#22c55e', Icon: IconBag },
  'Real Estate': { bg: 'rgba(6,182,212,0.12)', color: '#06b6d4', Icon: IconBuilding },
  default: { bg: 'rgba(204,255,0,0.12)', color: '#ccff00', Icon: IconWallet },
};

const formatCurrency = (value: number): string => {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value.toFixed(2)}`;
};

export const AssetRow: React.FC<AssetRowProps> = ({
  name, type, value, monthlyYield, onDelete
}) => {
  const config = TYPE_CONFIG[type] || TYPE_CONFIG.default;

  return (
    <View style={styles.row}>
      {/* Icon */}
      <View style={[styles.iconContainer, { backgroundColor: config.bg }]}>
        <config.Icon size={20} color={config.color} />
      </View>

      {/* Name + Type */}
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <Text style={[styles.type, { color: config.color }]}>{type}</Text>
      </View>

      {/* Monthly Yield */}
      <View style={styles.yieldContainer}>
        <Text style={styles.yieldLabel}>/ mois</Text>
        <Text style={[styles.yieldValue, { color: COLORS.primary }]}>
          +{formatCurrency(monthlyYield)}
        </Text>
      </View>

      {/* Total Value */}
      <View style={styles.valueContainer}>
        <Text style={styles.value}>{formatCurrency(value)}</Text>
      </View>

      {/* Delete */}
      {onDelete && (
        <TouchableOpacity onPress={onDelete} style={styles.deleteBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <IconClose size={12} color={COLORS.error} />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    gap: 12,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconText: {
    fontSize: 20,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  type: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  yieldContainer: {
    alignItems: 'flex-end',
    minWidth: 70,
  },
  yieldLabel: {
    fontSize: 10,
    color: COLORS.onSurfaceVariant,
    fontWeight: '500',
  },
  yieldValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  valueContainer: {
    alignItems: 'flex-end',
    minWidth: 75,
  },
  value: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  deleteBtn: {
    padding: 4,
  },
  deleteIcon: {
    fontSize: 12,
    color: COLORS.error,
    fontWeight: '700',
  },
});
