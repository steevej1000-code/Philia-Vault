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

interface Asset {
  id: number;
  name: string;
  type: string;
  value: number;
  monthly_yield: number;
  asset_category?: string;
  market_symbol?: string;
  market_type?: string;
  current_market_price?: number;
  quantity_held?: number;
  passive_yield_percent?: number;
  passive_income_manual?: number;
  last_price_update?: string;
}

const ASSET_TYPES = ['Stocks', 'Crypto', 'Commerce', 'Real Estate', 'Other'];
const MARKET_TYPES = ['crypto', 'stock', 'metal'];

const TYPE_ICONS: Record<string, React.ComponentType<IconProps>> = {
  Stocks: IconTrendUp,
  Crypto: IconCoin,
  Commerce: IconBag,
  'Real Estate': IconBuilding,
  Other: IconBriefcase,
};

const TYPE_LABEL_KEYS: Record<string, { label: string; subLabel: string }> = {
  Stocks: { label: 'asset_type_stocks', subLabel: 'asset_type_stocks_sub' },
  Crypto: { label: 'asset_type_crypto', subLabel: 'asset_type_crypto_sub' },
  Commerce: { label: 'asset_type_commerce', subLabel: 'asset_type_commerce_sub' },
  'Real Estate': { label: 'asset_type_real_estate', subLabel: 'asset_type_real_estate_sub' },
  Other: { label: 'asset_type_other', subLabel: 'asset_type_other_sub' },
};

const ASSET_TYPE_LABEL_KEYS: Record<string, string> = {
  Stocks: 'asset_type_stocks_short',
  Crypto: 'asset_type_crypto_short',
  Commerce: 'asset_type_commerce_short',
  'Real Estate': 'asset_type_real_estate_short',
  Other: 'asset_type_other_short',
};

const MARKET_TYPE_LABELS: Record<string, string> = {
  crypto: 'Crypto',
  stock: 'Action',
  metal: 'Métal précieux',
};

export default function AssetsScreen() {
  const insets = useSafeAreaInsets();
  const { t, formatAmount } = useUserPreferences();
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

  // New form states
  const [assetCategory, setAssetCategory] = useState<'manual' | 'market'>('manual');
  const [marketSymbol, setMarketSymbol] = useState('');
  const [marketType, setMarketType] = useState('crypto');
  const [quantityHeld, setQuantityHeld] = useState('');
  const [passiveYieldPercent, setPassiveYieldPercent] = useState('');
  const [passiveIncomeManual, setPassiveIncomeManual] = useState('');
  const [priceLoading, setPriceLoading] = useState(false);
  const [fetchedPrice, setFetchedPrice] = useState<number | null>(null);
  const [hasPassiveIncome, setHasPassiveIncome] = useState(false);

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

  const onRefresh = () => { setRefreshing(true); load(); };

  const resetForm = () => {
    setName('');
    setType('Stocks');
    setValue('');
    setYield('');
    setAssetCategory('manual');
    setMarketSymbol('');
    setMarketType('crypto');
    setQuantityHeld('');
    setPassiveYieldPercent('');
    setPassiveIncomeManual('');
    setPriceLoading(false);
    setFetchedPrice(null);
    setHasPassiveIncome(false);
  };

  const handleOpenAdd = () => {
    setEditingAssetId(null);
    resetForm();
    setShowModal(true);
  };

  const handleOpenEdit = (item: Asset) => {
    setEditingAssetId(item.id);
    setName(item.name);
    setType(item.type);
    setValue(String(item.value));
    setYield(String(item.monthly_yield));
    setAssetCategory((item.asset_category as 'manual' | 'market') || 'manual');
    setMarketSymbol(item.market_symbol || '');
    setMarketType(item.market_type || 'crypto');
    setQuantityHeld(item.quantity_held ? String(item.quantity_held) : '');
    setPassiveYieldPercent(item.passive_yield_percent ? String(item.passive_yield_percent) : '');
    setPassiveIncomeManual(item.passive_income_manual ? String(item.passive_income_manual) : '');
    setFetchedPrice(item.current_market_price || null);
    setHasPassiveIncome(
      (item.asset_category === 'market' && !!item.passive_yield_percent) ||
      (item.asset_category !== 'market' && !!item.passive_income_manual)
    );
    setShowModal(true);
  };

  const handleFetchPrice = async () => {
    if (!marketSymbol.trim()) {
      Alert.alert('Erreur', 'Entrez un symbole');
      return;
    }
    setPriceLoading(true);
    try {
      const result = await api.fetchPrice(marketSymbol.trim(), marketType);
      if (result.price) {
        setFetchedPrice(result.price);
      }
    } catch (e: any) {
      Alert.alert('Erreur', e.message || 'Impossible de récupérer le prix');
    } finally {
      setPriceLoading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert(t('error'), t('fill_all_fields'));
      return;
    }

    let assetValue = parseFloat(value) || 0;
    let assetYield = parseFloat(yield_) || 0;

    if (assetCategory === 'market') {
      if (!marketSymbol.trim() || !quantityHeld) {
        Alert.alert('Erreur', 'Remplissez le symbole et la quantité');
        return;
      }
      if (fetchedPrice) {
        assetValue = fetchedPrice * parseFloat(quantityHeld);
      }
      if (hasPassiveIncome && passiveYieldPercent) {
        const annualIncome = assetValue * (parseFloat(passiveYieldPercent) / 100);
        assetYield = annualIncome / 12;
      }
    } else {
      if (value.trim() === '' || yield_.trim() === '') {
        Alert.alert(t('error'), t('fill_all_fields'));
        return;
      }
      if (hasPassiveIncome && passiveIncomeManual) {
        assetYield = parseFloat(passiveIncomeManual);
      }
    }

    setSaving(true);
    try {
      const payload: any = {
        name,
        type,
        value: assetValue,
        monthly_yield: assetYield,
        asset_category: assetCategory,
      };

      if (assetCategory === 'market') {
        payload.market_symbol = marketSymbol.trim();
        payload.market_type = marketType;
        payload.quantity_held = parseFloat(quantityHeld);
        payload.current_market_price = fetchedPrice;
        payload.passive_yield_percent = hasPassiveIncome && passiveYieldPercent ? parseFloat(passiveYieldPercent) : null;
        payload.passive_income_manual = 0;
      } else {
        payload.market_symbol = null;
        payload.market_type = null;
        payload.quantity_held = null;
        payload.current_market_price = null;
        payload.passive_yield_percent = null;
        payload.passive_income_manual = hasPassiveIncome && passiveIncomeManual ? parseFloat(passiveIncomeManual) : 0;
      }

      if (editingAssetId !== null) {
        await api.updateAsset(editingAssetId, payload);
      } else {
        await api.addAsset(payload);
      }
      setShowModal(false);
      resetForm();
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

  const formatPriceAge = (lastUpdate?: string) => {
    if (!lastUpdate) return '';
    const mins = Math.floor((Date.now() - new Date(lastUpdate).getTime()) / 60000);
    if (mins < 60) return `mis à jour il y a ${mins} min`;
    const hrs = Math.floor(mins / 60);
    return `mis à jour il y a ${hrs}h`;
  };

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
          <View style={styles.grid}>
            {assets.map((item) => {
              const Icon = TYPE_ICONS[item.type] || TYPE_ICONS.Other;
              const labelKeys = TYPE_LABEL_KEYS[item.type] || TYPE_LABEL_KEYS.Other;
              const isMarket = item.asset_category === 'market';
              return (
                <View key={item.id} style={styles.gridCard}>
                  <View style={styles.cardHeader}>
                    <View style={styles.categoryIconWrapper}>
                      <Icon size={20} color={COLORS.primary} />
                    </View>
                    <View style={styles.categoryMeta}>
                      <Text style={styles.categoryLabel}>
                        {isMarket ? item.market_symbol : t(labelKeys.label)}
                      </Text>
                      <Text style={styles.categorySubLabel}>
                        {isMarket ? `${item.quantity_held} ${item.market_symbol}` : t(labelKeys.subLabel)}
                      </Text>
                      <Text style={styles.cardValue}>{formatAmount(item.value)}</Text>
                    </View>
                  </View>
                  <View style={styles.yieldContainer}>
                    <Text style={styles.yieldLabel}>
                      {isMarket && item.current_market_price
                        ? `$${item.current_market_price}/u`
                        : t('monthly_yield')}
                    </Text>
                    <Text style={styles.yieldValue}>
                      +{formatAmount(item.monthly_yield || 0)}
                      {isMarket && item.passive_yield_percent ? ` (${item.passive_yield_percent}%)` : ''}
                    </Text>
                    {isMarket && item.last_price_update && (
                      <Text style={{ fontSize: 8, color: '#4d6600', marginTop: 2 }}>
                        {formatPriceAge(item.last_price_update)}
                      </Text>
                    )}
                  </View>
                  <TrendLine />
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

          {assets.length > 0 && (
            <View style={styles.performanceContainer}>
              <Text style={styles.perfTitle}>{t('detailed_performance')}</Text>
              <View style={styles.tableRowHeader}>
                <Text style={[styles.colHeader, { flex: 1.5 }]}>{t('col_name')}</Text>
                <Text style={[styles.colHeader, { flex: 1.5 }]}>{t('col_category')}</Text>
                <Text style={[styles.colHeader, { flex: 1.2, textAlign: 'right' }]}>{t('col_current_value')}</Text>
                <Text style={[styles.colHeader, { flex: 1.2, textAlign: 'right' }]}>{t('col_monthly_cashflow')}</Text>
                <Text style={[styles.colHeader, { flex: 1.0, textAlign: 'center' }]}>{t('col_actions')}</Text>
              </View>
              {assets.map((item) => (
                <View key={item.id} style={styles.tableRow}>
                  <Text style={[styles.colText, { flex: 1.5, fontWeight: '700' }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.colText, { flex: 1.5, color: '#8e8e93' }]} numberOfLines={1}>
                    {item.asset_category === 'market' ? item.market_symbol : t(ASSET_TYPE_LABEL_KEYS[item.type] || ASSET_TYPE_LABEL_KEYS.Other)}
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

              {/* Toggle Type d'actif : Manuel / Marché live */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Type d'actif</Text>
                <View style={styles.toggleRow}>
                  <TouchableOpacity
                    style={[styles.toggleBtn, assetCategory === 'manual' && styles.toggleBtnActive]}
                    onPress={() => setAssetCategory('manual')}
                  >
                    <Text style={[styles.toggleBtnText, assetCategory === 'manual' && styles.toggleBtnTextActive]}>
                      Manuel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toggleBtn, assetCategory === 'market' && styles.toggleBtnActive]}
                    onPress={() => setAssetCategory('market')}
                  >
                    <Text style={[styles.toggleBtnText, assetCategory === 'market' && styles.toggleBtnTextActive]}>
                      Marché live
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {assetCategory === 'market' ? (
                <>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Symbole (ex: BTC, AAPL, XAU)</Text>
                    <TextInput
                      style={styles.input}
                      value={marketSymbol}
                      onChangeText={setMarketSymbol}
                      placeholder="BTC"
                      placeholderTextColor="#48484a"
                      autoCapitalize="characters"
                    />
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Type de marché</Text>
                    <View style={styles.toggleRow}>
                      {MARKET_TYPES.map((mt) => (
                        <TouchableOpacity
                          key={mt}
                          style={[styles.toggleBtn, marketType === mt && styles.toggleBtnActive]}
                          onPress={() => setMarketType(mt)}
                        >
                          <Text style={[styles.toggleBtnText, marketType === mt && styles.toggleBtnTextActive]}>
                            {MARKET_TYPE_LABELS[mt]}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Quantité détenue</Text>
                    <TextInput
                      style={styles.input}
                      value={quantityHeld}
                      onChangeText={setQuantityHeld}
                      placeholder="0.5"
                      placeholderTextColor="#48484a"
                      keyboardType="decimal-pad"
                    />
                  </View>

                  <TouchableOpacity style={styles.fetchPriceBtn} onPress={handleFetchPrice} disabled={priceLoading}>
                    {priceLoading ? (
                      <ActivityIndicator color="#0c0e12" size="small" />
                    ) : (
                      <Text style={styles.fetchPriceBtnText}>Vérifier le prix</Text>
                    )}
                  </TouchableOpacity>

                  {fetchedPrice !== null && (
                    <View style={styles.priceResult}>
                      <Text style={styles.priceLabel}>Prix actuel unitaire</Text>
                      <Text style={styles.priceValue}>${fetchedPrice.toFixed(2)}</Text>
                      {quantityHeld && (
                        <>
                          <Text style={styles.priceLabel}>Valeur totale calculée</Text>
                          <Text style={styles.priceValue}>
                            ${(fetchedPrice * parseFloat(quantityHeld || '0')).toFixed(2)}
                          </Text>
                        </>
                      )}
                    </View>
                  )}

                  {/* Revenu passif toggle */}
                  <View style={styles.formGroup}>
                    <TouchableOpacity
                      style={styles.passiveToggle}
                      onPress={() => setHasPassiveIncome(!hasPassiveIncome)}
                    >
                      <Text style={styles.passiveToggleText}>
                        {hasPassiveIncome ? '✓' : '○'} Cet actif génère un revenu passif
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {hasPassiveIncome && (
                    <View style={styles.formGroup}>
                      <Text style={styles.label}>Rendement annuel (%)</Text>
                      <TextInput
                        style={styles.input}
                        value={passiveYieldPercent}
                        onChangeText={setPassiveYieldPercent}
                        placeholder="4.5"
                        placeholderTextColor="#48484a"
                        keyboardType="decimal-pad"
                      />
                      {fetchedPrice && quantityHeld && passiveYieldPercent && (
                        <Text style={styles.calculatedNote}>
                          Revenu mensuel estimé : ${((fetchedPrice * parseFloat(quantityHeld)) * (parseFloat(passiveYieldPercent) / 100) / 12).toFixed(2)}/mois
                        </Text>
                      )}
                    </View>
                  )}
                </>
              ) : (
                <>
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

                  {/* Revenu passif toggle */}
                  <View style={styles.formGroup}>
                    <TouchableOpacity
                      style={styles.passiveToggle}
                      onPress={() => setHasPassiveIncome(!hasPassiveIncome)}
                    >
                      <Text style={styles.passiveToggleText}>
                        {hasPassiveIncome ? '✓' : '○'} Cet actif génère un revenu passif
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {hasPassiveIncome && (
                    <View style={styles.formGroup}>
                      <Text style={styles.label}>Montant mensuel fixe ($)</Text>
                      <TextInput
                        style={styles.input}
                        value={passiveIncomeManual}
                        onChangeText={setPassiveIncomeManual}
                        placeholder="50"
                        placeholderTextColor="#48484a"
                        keyboardType="decimal-pad"
                      />
                    </View>
                  )}

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
                </>
              )}

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
  scroll: { paddingBottom: 40 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 18, justifyContent: 'space-between' },
  gridCard: {
    width: '48%', backgroundColor: '#ccff00', borderRadius: 30, padding: 16,
    marginBottom: 14, position: 'relative', minHeight: 180,
  },
  cardHeader: { flexDirection: 'row', gap: 8 },
  categoryIconWrapper: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center',
  },
  categoryMeta: { flex: 1 },
  categoryLabel: { fontSize: 10, fontWeight: '900', color: '#3d4d00' },
  categorySubLabel: { fontSize: 9, fontWeight: '700', color: '#4d6600', marginTop: 1 },
  cardValue: { fontSize: 18, fontWeight: '900', color: '#000000', marginTop: 4, letterSpacing: -0.5 },
  yieldContainer: { marginTop: 12 },
  yieldLabel: { fontSize: 10, color: '#4d6600', fontWeight: '700' },
  yieldValue: { fontSize: 15, fontWeight: '900', color: '#000000', marginTop: 1 },
  trendContainer: { marginTop: 8, alignItems: 'center' },
  cardActionsContainer: { position: 'absolute', bottom: 12, right: 12, flexDirection: 'row', gap: 6 },
  editCardBtn: {
    width: 24, height: 24, borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.04)', alignItems: 'center', justifyContent: 'center',
  },
  deleteCardBtn: {
    width: 24, height: 24, borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.04)', alignItems: 'center', justifyContent: 'center',
  },
  performanceContainer: {
    backgroundColor: '#0c0e12', marginHorizontal: 18, marginTop: 12,
    borderRadius: 30, padding: 20, borderWidth: 1, borderColor: '#1c222d',
  },
  perfTitle: { fontSize: 20, fontWeight: '900', color: '#ffffff', letterSpacing: -0.5, marginBottom: 16 },
  tableRowHeader: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#1c222d',
    paddingBottom: 8, marginBottom: 10,
  },
  colHeader: { fontSize: 10, fontWeight: '700', color: '#8e8e93', textTransform: 'uppercase' },
  tableRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.02)',
  },
  colText: { fontSize: 12, color: '#ffffff' },
  tableAction: { alignItems: 'center', justifyContent: 'center' },
  emptyContainer: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
  emptySubText: { fontSize: 13, color: '#8e8e93' },
  modalContainer: { flex: 1, backgroundColor: '#000000' },
  modalScroll: { padding: 24, paddingBottom: 60 },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 32, paddingTop: 8,
  },
  modalTitle: { fontSize: 22, fontWeight: '900', color: '#ffffff' },
  form: { gap: 20 },
  formGroup: { gap: 6 },
  label: { fontSize: 11, fontWeight: '700', color: '#8e8e93', textTransform: 'uppercase', letterSpacing: 0.6 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: '#1c222d',
    borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 15, color: '#ffffff',
  },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99,
    borderWidth: 1, borderColor: '#1c222d', backgroundColor: 'rgba(255,255,255,0.02)',
  },
  typeBtnActive: { borderColor: '#ccff00', backgroundColor: 'rgba(204,255,0,0.1)' },
  typeBtnText: { fontSize: 13, color: '#8e8e93', fontWeight: '500' },
  typeBtnTextActive: { color: '#ccff00', fontWeight: '700' },
  toggleRow: { flexDirection: 'row', gap: 8 },
  toggleBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 99, borderWidth: 1,
    borderColor: '#1c222d', backgroundColor: 'rgba(255,255,255,0.02)',
    alignItems: 'center',
  },
  toggleBtnActive: { borderColor: '#ccff00', backgroundColor: 'rgba(204,255,0,0.1)' },
  toggleBtnText: { fontSize: 13, color: '#8e8e93', fontWeight: '600' },
  toggleBtnTextActive: { color: '#ccff00', fontWeight: '700' },
  fetchPriceBtn: {
    backgroundColor: '#ccff00', borderRadius: 99, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  fetchPriceBtnText: { fontSize: 14, fontWeight: '800', color: '#0c0e12' },
  priceResult: {
    backgroundColor: '#1a1a1a', borderRadius: 16, padding: 16, gap: 4,
  },
  priceLabel: { fontSize: 11, color: '#8e8e93', fontWeight: '600', textTransform: 'uppercase' },
  priceValue: { fontSize: 18, fontWeight: '900', color: '#ccff00' },
  passiveToggle: {
    paddingVertical: 12, paddingHorizontal: 16, borderRadius: 16,
    borderWidth: 1, borderColor: '#1c222d', backgroundColor: 'rgba(255,255,255,0.02)',
  },
  passiveToggleText: { fontSize: 14, color: '#ffffff', fontWeight: '600' },
  calculatedNote: { fontSize: 12, color: '#ccff00', fontWeight: '600', marginTop: 4 },
  submitBtn: {
    backgroundColor: '#ccff00', borderRadius: 99, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center', marginTop: 12,
  },
  submitBtnText: { fontSize: 15, fontWeight: '800', color: '#0c0e12' },
  cancelBtn: { paddingVertical: 14, alignItems: 'center' },
  cancelBtnText: { fontSize: 14, color: '#8e8e93', fontWeight: '600' },
});
