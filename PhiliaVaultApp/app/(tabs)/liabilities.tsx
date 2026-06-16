import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  RefreshControl, Modal, TextInput, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform, ScrollView
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';
import { COLORS, RADIUS } from '../../constants/colors';
import Svg, { Path } from 'react-native-svg';
import {
  IconBank, IconHouse, IconRefresh, IconCard, IconList,
  IconClose, IconTrash, IconLiabilities, IconProps
} from '../../components/icons/Icons';
import { useUserPreferences } from '../../context/UserPreferencesContext';

interface Liability {
  id: number;
  name: string;
  type: string;
  monthly_cost: number;
  total_debt: number;
}

const LIABILITY_TYPES = ['Loan', 'Mortgage', 'Subscription', 'Credit Card', 'Other'];

const LIABILITY_TYPE_LABEL_KEYS: Record<string, string> = {
  Loan: 'liability_type_loan',
  Mortgage: 'liability_type_mortgage',
  Subscription: 'liability_type_subscription',
  'Credit Card': 'liability_type_credit_card',
  Other: 'liability_type_other',
};

const TYPE_ICONS: Record<string, React.ComponentType<IconProps>> = {
  Loan: IconBank,
  Mortgage: IconHouse,
  Subscription: IconRefresh,
  'Credit Card': IconCard,
  Other: IconList,
};

const TYPE_DETAILS: Record<string, { labelKey: string; subLabel: string }> = {
  Loan: { labelKey: 'liability_type_loan', subLabel: '(LOAN)' },
  Mortgage: { labelKey: 'liability_type_mortgage', subLabel: '(MORTGAGE)' },
  Subscription: { labelKey: 'liability_type_subscription', subLabel: '(SUB)' },
  'Credit Card': { labelKey: 'liability_type_credit_card', subLabel: '(CARD)' },
  Other: { labelKey: 'liability_type_other', subLabel: '(OTHER)' },
};

export default function LiabilitiesScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useUserPreferences();
  const [liabilities, setLiabilities] = useState<Liability[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [type, setType] = useState('Subscription');
  const [monthCost, setMonthCost] = useState('');
  const [totalDebt, setTotalDebt] = useState('');

  // Editing state
  const [editingLiabilityId, setEditingLiabilityId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.getLiabilities();
      if (result.success) setLiabilities(result.liabilities || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  const onRefresh = () => { setRefreshing(true); load(); };

  const handleOpenAdd = () => {
    setEditingLiabilityId(null);
    setName('');
    setType('Subscription');
    setMonthCost('');
    setTotalDebt('');
    setShowModal(true);
  };

  const handleOpenEdit = (item: Liability) => {
    setEditingLiabilityId(item.id);
    setName(item.name);
    setType(item.type);
    setMonthCost(String(item.monthly_cost));
    setTotalDebt(String(item.total_debt || ''));
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!name.trim() || monthCost.trim() === '') {
      Alert.alert(t('error'), t('fill_all_fields_short'));
      return;
    }
    setSaving(true);
    try {
      if (editingLiabilityId !== null) {
        await api.updateLiability(editingLiabilityId, {
          name,
          type,
          monthly_cost: parseFloat(monthCost),
          total_debt: parseFloat(totalDebt || '0'),
        });
      } else {
        await api.addLiability({
          name,
          type,
          monthly_cost: parseFloat(monthCost),
          total_debt: parseFloat(totalDebt || '0'),
        });
      }
      setShowModal(false);
      setName(''); setMonthCost(''); setTotalDebt(''); setType('Subscription');
      setEditingLiabilityId(null);
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
      t('delete_liability_confirm').replace('{name}', name),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete_title'), style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteLiability(id);
              load();
            } catch (e: any) {
              Alert.alert(t('error'), e.message);
            }
          }
        }
      ]
    );
  };

  const formatEuro = (v: any) => {
    const num = Number(v);
    if (isNaN(num)) return '0,00 €';
    return `${num.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  };

  // Render a tiny vector trend line in red stroke on the card background
  const TrendLine = () => (
    <View style={styles.trendContainer}>
      <Svg width="120" height="36" viewBox="0 0 120 36">
        <Path
          d="M 10 25 C 25 25, 30 10, 45 15 C 60 20, 65 30, 80 12 C 95 -2, 100 22, 115 15"
          fill="none"
          stroke="#800000" // Dark red stroke matching the visual balance of the green assets trendline
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
          <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>{t('liabilities_title')}</Text>
          <Text style={styles.subtitle}>{t('liabilities_subtitle')}</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={handleOpenAdd}>
          <Text style={styles.addBtnText}>{t('add_button')}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color="#FF3B30" size="large" style={{ marginTop: 60 }} />
      ) : (
        <ScrollView 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF3B30" />}
        >
          {/* Pure Red Grid of Liabilities */}
          <View style={styles.grid}>
            {liabilities.map((item) => {
              const Icon = TYPE_ICONS[item.type] || TYPE_ICONS.Other;
              const details = TYPE_DETAILS[item.type] || TYPE_DETAILS.Other;
              return (
                <View key={item.id} style={styles.gridCard}>
                  {/* Top line with Icon and category info */}
                  <View style={styles.cardHeader}>
                    <View style={styles.categoryIconWrapper}>
                      <Icon size={20} color="#FFFFFF" />
                    </View>
                    <View style={styles.categoryMeta}>
                      <Text style={styles.categoryLabel}>{t(details.labelKey).toUpperCase()}</Text>
                      <Text style={styles.categorySubLabel}>{details.subLabel}</Text>
                      <Text style={styles.cardValue}>{formatEuro(item.total_debt)}</Text>
                    </View>
                  </View>

                  {/* Middle part: Yield info (monthly cost for liability) */}
                  <View style={styles.yieldContainer}>
                    <Text style={styles.yieldLabel}>{t('monthly_cost_label').replace(' ($)', '')}</Text>
                    <Text style={styles.yieldValue}>-{formatEuro(item.monthly_cost)}</Text>
                  </View>

                  {/* SVG Wave graphic */}
                  <TrendLine />

                  {/* Edit Pencil icon and Delete button bottom-right */}
                  <View style={styles.cardActionsContainer}>
                    <TouchableOpacity onPress={() => handleOpenEdit(item)} style={styles.editCardBtn}>
                      <Text style={{ fontSize: 13, color: '#FFFFFF' }}>✎</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(item.id, item.name)} style={styles.deleteCardBtn}>
                      <IconTrash size={15} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Performance Détaillée section */}
          {liabilities.length > 0 && (
            <View style={styles.performanceContainer}>
              <Text style={styles.perfTitle}>{t('detailed_performance')}</Text>

              {/* Table headers */}
              <View style={styles.tableRowHeader}>
                <Text style={[styles.colHeader, { flex: 1.5 }]}>{t('col_name')}</Text>
                <Text style={[styles.colHeader, { flex: 1.5 }]}>{t('col_category')}</Text>
                <Text style={[styles.colHeader, { flex: 1.2, textAlign: 'right' }]}>{t('total_debt')}</Text>
                <Text style={[styles.colHeader, { flex: 1.2, textAlign: 'right' }]}>{t('monthly_charges')}</Text>
                <Text style={[styles.colHeader, { flex: 1.0, textAlign: 'center' }]}>{t('col_actions')}</Text>
              </View>

              {/* Table items */}
              {liabilities.map((item) => (
                <View key={item.id} style={styles.tableRow}>
                  <Text style={[styles.colText, { flex: 1.5, fontWeight: '700' }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.colText, { flex: 1.5, color: '#8e8e93' }]} numberOfLines={1}>
                    {t(LIABILITY_TYPE_LABEL_KEYS[item.type] || LIABILITY_TYPE_LABEL_KEYS.Other)}
                  </Text>
                  <Text style={[styles.colText, { flex: 1.2, textAlign: 'right', fontWeight: '600' }]}>
                    {formatEuro(item.total_debt).split(',')[0]} €
                  </Text>
                  <Text style={[styles.colText, { flex: 1.2, textAlign: 'right', color: '#ff3b30', fontWeight: '700' }]}>
                    -{formatEuro(item.monthly_cost).split(',')[0]} €
                  </Text>
                  <View style={{ flex: 1.0, flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
                    <TouchableOpacity onPress={() => handleOpenEdit(item)} style={styles.tableAction}>
                      <Text style={{ color: '#ff3b30', fontSize: 15 }}>✎</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(item.id, item.name)} style={styles.tableAction}>
                      <IconTrash size={15} color={COLORS.error} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {liabilities.length === 0 && (
            <View style={styles.emptyContainer}>
              <IconLiabilities size={32} color="#FF3B30" />
              <Text style={styles.emptyText}>{t('liabilities_empty_title')}</Text>
              <Text style={styles.emptySubText}>{t('liabilities_empty_subtitle')}</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Add / Edit Liability Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView contentContainerStyle={styles.modalScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingLiabilityId ? t('edit_liability_title') : t('add_liability_title')}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <IconClose size={20} color={COLORS.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            <View style={styles.form}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>{t('name_label')}</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder={t('liability_name_placeholder')}
                  placeholderTextColor="#48484a"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>{t('type_label')}</Text>
                <View style={styles.typeGrid}>
                  {LIABILITY_TYPES.map((liabType) => (
                    <TouchableOpacity
                      key={liabType}
                      style={[styles.typeBtn, type === liabType && styles.typeBtnActive]}
                      onPress={() => setType(liabType)}
                    >
                      <Text style={[styles.typeBtnText, type === liabType && styles.typeBtnTextActive]}>
                        {t(LIABILITY_TYPE_LABEL_KEYS[liabType] || LIABILITY_TYPE_LABEL_KEYS.Other)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>{t('monthly_cost_label')}</Text>
                <TextInput
                  style={styles.input}
                  value={monthCost}
                  onChangeText={setMonthCost}
                  placeholder="15"
                  placeholderTextColor="#48484a"
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>{t('total_debt_optional_label')}</Text>
                <TextInput
                  style={styles.input}
                  value={totalDebt}
                  onChangeText={setTotalDebt}
                  placeholder="3000"
                  placeholderTextColor="#48484a"
                  keyboardType="numeric"
                />
              </View>

              <TouchableOpacity style={styles.submitBtn} onPress={handleSave} disabled={saving}>
                {saving ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>{editingLiabilityId ? t('save_changes') : t('add_liability')}</Text>
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
    backgroundColor: '#FF3B30',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  addBtnText: { fontSize: 13, fontWeight: '700', color: '#ffffff' },
  
  scroll: {
    paddingBottom: 40,
  },

  // Grid of Liabilities
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 18,
    justifyContent: 'space-between',
  },
  gridCard: {
    width: '48%',
    backgroundColor: '#FF3B30',
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
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryMeta: {
    flex: 1,
  },
  categoryLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#ffffff',
  },
  categorySubLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
    marginTop: 1,
  },
  cardValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#ffffff',
    marginTop: 4,
    letterSpacing: -0.5,
  },
  yieldContainer: {
    marginTop: 12,
  },
  yieldLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '700',
  },
  yieldValue: {
    fontSize: 15,
    fontWeight: '900',
    color: '#ffffff',
    marginTop: 1,
  },
  trendContainer: {
    marginTop: 8,
    alignItems: 'center',
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
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteCardBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

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

  // Empty View
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  emptyText: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
  emptySubText: { fontSize: 13, color: '#8e8e93' },

  // Modal styling (Add Liability)
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
    borderColor: '#FF3B30',
    backgroundColor: 'rgba(255,59,48,0.1)',
  },
  typeBtnText: { fontSize: 13, color: '#8e8e93', fontWeight: '500' },
  typeBtnTextActive: { color: '#FF3B30', fontWeight: '700' },
  submitBtn: {
    backgroundColor: '#FF3B30',
    borderRadius: 99,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  submitBtnText: { fontSize: 15, fontWeight: '800', color: '#ffffff' },
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
});
