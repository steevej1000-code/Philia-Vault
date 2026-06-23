import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, Modal, TextInput, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform, ScrollView
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';
import { COLORS, RADIUS } from '../../constants/colors';
import Svg, { Path } from 'react-native-svg';
import { IconTrendUp, IconCoin, IconBag, IconBuilding, IconBriefcase, IconTrash, IconSeedling, IconClose, IconProps } from '../../components/icons/Icons';
import { useUserPreferences } from '../../context/UserPreferencesContext';
import { useRouter, useLocalSearchParams } from 'expo-router';

interface Asset {
  id: number;
  name: string;
  type: string;
  value: number;
  monthly_yield: number;
}

const ASSET_TYPES = ['Stocks', 'Crypto', 'Commerce', 'Real Estate', 'Revenue', 'Other'];

// Type translations for display matching user screenshot
const TYPE_ICONS: Record<string, React.ComponentType<IconProps>> = {
  Stocks: IconTrendUp,
  Crypto: IconCoin,
  Commerce: IconBag,
  'Real Estate': IconBuilding,
  Revenue: IconSeedling,
  Other: IconBriefcase,
};

const TYPE_LABEL_KEYS: Record<string, { label: string; subLabel: string }> = {
  Stocks: { label: 'asset_type_stocks', subLabel: 'asset_type_stocks_sub' },
  Crypto: { label: 'asset_type_crypto', subLabel: 'asset_type_crypto_sub' },
  Commerce: { label: 'asset_type_commerce', subLabel: 'asset_type_commerce_sub' },
  'Real Estate': { label: 'asset_type_real_estate', subLabel: 'asset_type_real_estate_sub' },
  Revenue: { label: 'asset_type_revenue', subLabel: 'asset_type_revenue_sub' },
  Other: { label: 'asset_type_other', subLabel: 'asset_type_other_sub' },
};

const ASSET_TYPE_LABEL_KEYS: Record<string, string> = {
  Stocks: 'asset_type_stocks_short',
  Crypto: 'asset_type_crypto_short',
  Commerce: 'asset_type_commerce_short',
  'Real Estate': 'asset_type_real_estate_short',
  Revenue: 'asset_type_revenue_short',
  Other: 'asset_type_other_short',
};

export default function AssetsScreen() {
  const insets = useSafeAreaInsets();
  const { t, formatAmount } = useUserPreferences();
  const params = useLocalSearchParams();
  const router = useRouter();

  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [type, setType] = useState('Stocks');
  const [value, setValue] = useState('');
  const [yield_, setYield] = useState('');

  // Editing state
  const [editingAssetId, setEditingAssetId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.getAssets();
      if (result.success) setAssets(result.assets || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (params.openAdd === 'true') {
      router.setParams({ openAdd: undefined });
      handleOpenAdd();
    }
  }, [params.openAdd]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const handleOpenAdd = () => {
    setEditingAssetId(null);
    setName('');
    setType('Revenue'); // Default to Revenue if opened via shortcut, otherwise standard
    setValue('0');
    setYield('');
    setShowModal(true);
  };

  const handleOpenEdit = (item: Asset) => {
    setEditingAssetId(item.id);
    setName(item.name);
    setType(item.type);
    setValue(String(item.value));
    setYield(String(item.monthly_yield));
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!name.trim() || value.trim() === '' || yield_.trim() === '') {
      Alert.alert(t('error'), t('fill_all_fields'));
      return;
    }
    setSaving(true);
    try {
      if (editingAssetId !== null) {
        await api.updateAsset(editingAssetId, {
          name,
          type,
          value: parseFloat(value),
          monthly_yield: parseFloat(yield_),
        });
      } else {
        await api.addAsset({
          name,
          type,
          value: parseFloat(value),
          monthly_yield: parseFloat(yield_),
        });
      }
      setShowModal(false);
      setName(''); setValue(''); setYield(''); setType('Stocks');
      setEditingAssetId(null);
      load();
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: number, name: string) => {
    Alert.alert(
      t('delete_title'),
      t('delete_asset_confirm').replace('{name}', name),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete_title'), style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteAsset(id);
              load();
            } catch (e: any) {
              Alert.alert(t('error'), e.message);
            }
          }
        }
      ]
    );
  };

  // Render a tiny vector trend line like the screenshot
  const TrendLine = () => (
    <View style={styles.trendContainer}>
      <Svg width="120" height="36" viewBox="0 0 120 36">
        <Path
          d="M 10 25 C 25 25, 30 10, 45 15 C 60 20, 65 30, 80 12 C 95 -2, 100 22, 115 15"
          fill="none"
          stroke="#4d6600"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Title Header */}
      <View style={styles.header}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>{t('assets_title')}</Text>
          <Text style={styles.subtitle}>{t('assets_subtitle')}</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={handleOpenAdd}>
          <Text style={styles.addBtnText}>{t('add_button')}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color="#ccff00" size="large" style={{ marginTop: 60 }} />
      ) : (
        <ScrollView 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ccff00" />}
        >
          {/* Neon Grid of Assets */}
          <View style={styles.grid}>
            {assets.map((item) => {
              const Icon = TYPE_ICONS[item.type] || TYPE_ICONS.Other;
              const labelKeys = TYPE_LABEL_KEYS[item.type] || TYPE_LABEL_KEYS.Other;
              return (
                <View key={item.id} style={styles.gridCard}>
                  {/* Top line with Icon and category info */}
                  <View style={styles.cardHeader}>
                    <View style={styles.categoryIconWrapper}>
                      <Icon size={20} color={COLORS.primary} />
                    </View>
                    <View style={styles.categoryMeta}>
                      <Text style={styles.categoryLabel}>{t(labelKeys.label)}</Text>
                      <Text style={styles.categorySubLabel}>{t(labelKeys.subLabel)}</Text>
                      <Text style={styles.cardValue}>{formatAmount(item.value)}</Text>
                    </View>
                  </View>

                  {/* Middle part: Yield info */}
                  <View style={styles.yieldContainer}>
                    <Text style={styles.yieldLabel}>{t('monthly_yield')}</Text>
                    <Text style={styles.yieldValue}>+{formatAmount(item.monthly_yield)}</Text>
                  </View>

                  {/* SVG Wave graphic */}
                  <TrendLine />

                  {/* Edit Pencil icon and Delete button bottom-right */}
                  <View style={styles.cardActionsContainer}>
                    <TouchableOpacity onPress={() => handleOpenEdit(item)} style={styles.editCardBtn}>
                      <Text style={{ fontSize: 13 }}>✎</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(item.id, item.name)} style={styles.deleteCardBtn}>
                      <IconTrash size={15} color={COLORS.error} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Performance Détaillée section */}
          {assets.length > 0 && (
            <View style={styles.performanceContainer}>
              <Text style={styles.perfTitle}>{t('detailed_performance')}</Text>

              {/* Table headers */}
              <View style={styles.tableRowHeader}>
                <Text style={[styles.colHeader, { flex: 1.5 }]}>{t('col_name')}</Text>
                <Text style={[styles.colHeader, { flex: 1.5 }]}>{t('col_category')}</Text>
                <Text style={[styles.colHeader, { flex: 1.2, textAlign: 'right' }]}>{t('col_current_value')}</Text>
                <Text style={[styles.colHeader, { flex: 1.2, textAlign: 'right' }]}>{t('col_monthly_cashflow')}</Text>
                <Text style={[styles.colHeader, { flex: 1.0, textAlign: 'center' }]}>{t('col_actions')}</Text>
              </View>

              {/* Table items */}
              {assets.map((item) => (
                <View key={item.id} style={styles.tableRow}>
                  <Text style={[styles.colText, { flex: 1.5, fontWeight: '700' }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.colText, { flex: 1.5, color: '#8e8e93' }]} numberOfLines={1}>
                    {t(ASSET_TYPE_LABEL_KEYS[item.type] || ASSET_TYPE_LABEL_KEYS.Other)}
                  </Text>
                  <Text style={[styles.colText, { flex: 1.2, textAlign: 'right', fontWeight: '600' }]}>
                    {formatAmount(item.value)}
                  </Text>
                  <Text style={[styles.colText, { flex: 1.2, textAlign: 'right', color: '#ccff00', fontWeight: '700' }]}>
                    +{formatAmount(item.monthly_yield)}
                  </Text>
                  <View style={{ flex: 1.0, flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
                    <TouchableOpacity onPress={() => handleOpenEdit(item)} style={styles.tableAction}>
                      <Text style={{ color: '#ccff00', fontSize: 15 }}>✎</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(item.id, item.name)} style={styles.tableAction}>
                      <IconTrash size={15} color={COLORS.error} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {assets.length === 0 && (
            <View style={styles.emptyContainer}>
              <IconSeedling size={32} color={COLORS.primary} />
              <Text style={styles.emptyText}>{t('assets_empty_title')}</Text>
              <Text style={styles.emptySubText}>{t('assets_empty_subtitle')}</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Add / Edit Asset Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView contentContainerStyle={styles.modalScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingAssetId ? t('edit_asset_title') : t('add_asset_title')}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <IconClose size={20} color={COLORS.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            <View style={styles.form}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>{t('asset_name_label')}</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder={t('asset_name_placeholder')}
                  placeholderTextColor="#48484a"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>{t('category_label')}</Text>
                <View style={styles.typeGrid}>
                  {ASSET_TYPES.map((assetType) => (
                    <TouchableOpacity
                      key={assetType}
                      style={[styles.typeBtn, type === assetType && styles.typeBtnActive]}
                      onPress={() => setType(assetType)}
                    >
                      <Text style={[styles.typeBtnText, type === assetType && styles.typeBtnTextActive]}>
                        {t(ASSET_TYPE_LABEL_KEYS[assetType] || ASSET_TYPE_LABEL_KEYS.Other)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>{t('current_value_label')}</Text>
                <TextInput
                  style={styles.input}
                  value={value}
                  onChangeText={setValue}
                  placeholder="1000"
                  placeholderTextColor="#48484a"
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>{t('monthly_yield_label')}</Text>
                <TextInput
                  style={styles.input}
                  value={yield_}
                  onChangeText={setYield}
                  placeholder="50"
                  placeholderTextColor="#48484a"
                  keyboardType="numeric"
                />
              </View>

              <TouchableOpacity style={styles.submitBtn} onPress={handleSave} disabled={saving}>
                {saving ? (
                  <ActivityIndicator color="#0c0e12" size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>{editingAssetId ? t('save_changes') : t('add_asset')}</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
                <Text style={styles.cancelBtnText}>{t('cancel')}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    backgroundColor: '#000000',
  },
  title: { fontSize: 24, fontWeight: '900', color: '#ffffff', letterSpacing: -0.8 },
  subtitle: { fontSize: 13, color: '#8e8e93', marginTop: 4, fontWeight: '500' },
  addBtn: {
    backgroundColor: '#ccff00',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ccff00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  addBtnText: { fontSize: 13, fontWeight: '700', color: '#0c0e12' },
  
  scroll: {
    paddingBottom: 40,
  },

  // Grid of Assets Matching Screenshot
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 18,
    justifyContent: 'space-between',
  },
  gridCard: {
    width: '48%',
    backgroundColor: '#ccff00',
    borderRadius: 30,
    padding: 16,
    marginBottom: 14,
    position: 'relative',
    minHeight: 180,
  },
  cardHeader: {
    flexDirection: 'row',
    gap: 8,
  },
  categoryIconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryEmoji: { fontSize: 20 },
  categoryMeta: {
    flex: 1,
  },
  categoryLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#3d4d00',
  },
  categorySubLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#4d6600',
    marginTop: 1,
  },
  cardValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#000000',
    marginTop: 4,
    letterSpacing: -0.5,
  },
  yieldContainer: {
    marginTop: 12,
  },
  yieldLabel: {
    fontSize: 10,
    color: '#4d6600',
    fontWeight: '700',
  },
  yieldValue: {
    fontSize: 15,
    fontWeight: '900',
    color: '#000000',
    marginTop: 1,
  },
  trendContainer: {
    marginTop: 8,
    alignItems: 'center',
  },
  deleteCardBtn: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteCardIcon: { fontSize: 12, color: '#3d4d00' },

  // Performance Détaillée Table style
  performanceContainer: {
    backgroundColor: '#0c0e12',
    marginHorizontal: 18,
    marginTop: 12,
    borderRadius: 30,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1c222d',
  },
  perfTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -0.5,
    marginBottom: 16,
  },
  tableRowHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#1c222d',
    paddingBottom: 8,
    marginBottom: 10,
  },
  colHeader: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8e8e93',
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.02)',
  },
  colText: {
    fontSize: 12,
    color: '#ffffff',
  },
  tableAction: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableActionText: {
    fontSize: 13,
    color: '#ff3b30',
  },

  // Empty View
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  emptyEmoji: { fontSize: 48 },
  emptyText: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
  emptySubText: { fontSize: 13, color: '#8e8e93' },

  // Modal styling (Add Asset)
  modalContainer: { flex: 1, backgroundColor: '#000000' },
  modalScroll: { padding: 24, paddingBottom: 60 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
    paddingTop: 8,
  },
  modalTitle: { fontSize: 22, fontWeight: '900', color: '#ffffff' },
  modalClose: { fontSize: 22, color: '#8e8e93', fontWeight: '500' },
  form: { gap: 20 },
  formGroup: { gap: 6 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8e8e93',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: '#1c222d',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#ffffff',
  },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: '#1c222d',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  typeBtnActive: {
    borderColor: '#ccff00',
    backgroundColor: 'rgba(204,255,0,0.1)',
  },
  typeBtnText: { fontSize: 13, color: '#8e8e93', fontWeight: '500' },
  typeBtnTextActive: { color: '#ccff00', fontWeight: '700' },
  submitBtn: {
    backgroundColor: '#ccff00',
    borderRadius: 99,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  submitBtnText: { fontSize: 15, fontWeight: '800', color: '#0c0e12' },
  cancelBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    color: '#8e8e93',
    fontWeight: '600',
  },
  cardActionsContainer: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    gap: 6,
  },
  editCardBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
