import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, Modal, TextInput, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform, ScrollView
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';
import { COLORS, RADIUS } from '../../constants/colors';
import { GlassCard } from '../../components/GlassCard';
import { PremiumButton } from '../../components/PremiumButton';
import { StatCard } from '../../components/StatCard';
import { IconBank, IconHouse, IconRefresh, IconCard, IconList, IconLiabilities, IconClose, IconProps } from '../../components/icons/Icons';

interface Liability {
  id: number;
  name: string;
  type: string;
  monthly_cost: number;
  total_debt: number;
}

const LIABILITY_TYPES = ['Loan', 'Mortgage', 'Subscription', 'Credit Card', 'Other'];

const TYPE_CONFIG: Record<string, { Icon: React.ComponentType<IconProps>; color: string }> = {
  Loan: { Icon: IconBank, color: COLORS.error },
  Mortgage: { Icon: IconHouse, color: '#f59e0b' },
  Subscription: { Icon: IconRefresh, color: COLORS.tertiary },
  'Credit Card': { Icon: IconCard, color: COLORS.rose },
  Other: { Icon: IconList, color: COLORS.onSurfaceVariant },
};

const fmtK = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`;

export default function LiabilitiesScreen() {
  const insets = useSafeAreaInsets();
  const [liabilities, setLiabilities] = useState<Liability[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

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
      Alert.alert('Erreur', 'Remplissez tous les champs.');
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
      Alert.alert('Erreur', e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: number, name: string) => {
    Alert.alert('Supprimer', `Supprimer "${name}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteLiability(id);
            load();
          } catch (e: any) {
            Alert.alert('Erreur', e.message);
          }
        }
      }
    ]);
  };

  const totalMonthly = liabilities.reduce((s, l) => s + (Number(l.monthly_cost) || 0), 0);
  const totalDebtSum = liabilities.reduce((s, l) => {
    // Ignore Subscription type from total remaining debt sum
    if (l.type === 'Subscription') {
      return s;
    }
    return s + (Number(l.total_debt) || 0);
  }, 0);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Passifs ✎</Text>
          <Text style={styles.subtitle}>Tracker de Dettes & Abonnements</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={handleOpenAdd}>
          <Text style={styles.addBtnText}>+ Ajouter</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} size="large" style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={liabilities}
          keyExtractor={(l) => String(l.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.primary} />}
          ListHeaderComponent={
            <View style={styles.statsSection}>
              <View style={styles.statsRow}>
                <StatCard
                  label="Charges / mois"
                  value={fmtK(totalMonthly)}
                  color={COLORS.rose}
                  style={{ flex: 1 }}
                />
                <View style={{ width: 12 }} />
                <StatCard
                  label="Dette Totale"
                  value={fmtK(totalDebtSum)}
                  color={COLORS.onSurface}
                  style={{ flex: 1 }}
                />
              </View>
              <Text style={styles.listHeader}>
                {liabilities.length} PASSIF{liabilities.length !== 1 ? 'S' : ''}
              </Text>
            </View>
          }
          ListEmptyComponent={
            <GlassCard style={styles.emptyCard}>
              <IconLiabilities size={32} color={COLORS.primary} />
              <Text style={styles.emptyTitle}>Aucun passif</Text>
              <Text style={styles.emptySubtitle}>
                Ajoutez vos dettes ou abonnements mensuels pour obtenir un calcul précis de votre cashflow.
              </Text>
              <PremiumButton
                title="+ Ajouter un Passif"
                onPress={handleOpenAdd}
                style={{ marginTop: 16 }}
              />
            </GlassCard>
          }
          renderItem={({ item }) => {
            const cfg = TYPE_CONFIG[item.type] || TYPE_CONFIG.Other;
            return (
              <GlassCard style={styles.liabCard}>
                <View style={[styles.liabIcon, { backgroundColor: `${cfg.color}15` }]}>
                  <cfg.Icon size={18} color={cfg.color} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.liabName}>{item.name}</Text>
                  <Text style={styles.liabMeta}>
                    {item.type} {item.total_debt > 0 && `· Dette: $${item.total_debt.toLocaleString()}`}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={styles.liabCost}>-${item.monthly_cost}/m</Text>
                    <TouchableOpacity onPress={() => handleDelete(item.id, item.name)}>
                      <Text style={styles.deleteLink}>Supprimer</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity onPress={() => handleOpenEdit(item)} style={styles.editBtnAction}>
                    <Text style={{ color: COLORS.primary, fontSize: 16 }}>✎</Text>
                  </TouchableOpacity>
                </View>
              </GlassCard>
            );
          }}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}

      {/* Add / Edit Liability Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView contentContainerStyle={styles.modalScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingLiabilityId ? 'Modifier le Passif' : 'Ajouter un Passif'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <IconClose size={20} color={COLORS.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            <View style={styles.form}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Nom</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="ex: Prêt Auto, Netflix..."
                  placeholderTextColor={COLORS.outline}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Type</Text>
                <View style={styles.typeGrid}>
                  {LIABILITY_TYPES.map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.typeBtn, type === t && styles.typeBtnActive]}
                      onPress={() => setType(t)}
                    >
                      <Text style={[styles.typeBtnText, type === t && styles.typeBtnTextActive]}>
                        {t}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Coût Mensuel ($)</Text>
                <TextInput
                  style={styles.input}
                  value={monthCost}
                  onChangeText={setMonthCost}
                  placeholder="15"
                  placeholderTextColor={COLORS.outline}
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Dette Totale Restante (Optionnel)</Text>
                <TextInput
                  style={styles.input}
                  value={totalDebt}
                  onChangeText={setTotalDebt}
                  placeholder="3000"
                  placeholderTextColor={COLORS.outline}
                  keyboardType="numeric"
                />
              </View>

              <PremiumButton
                title={editingLiabilityId ? 'Enregistrer les Modifications' : 'Ajouter le Passif'}
                onPress={handleSave}
                loading={saving}
                style={{ marginTop: 8 }}
              />

              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
                <Text style={styles.cancelBtnText}>Annuler</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.glassBorder,
    backgroundColor: 'rgba(12,14,18,0.8)',
  },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.onSurface },
  subtitle: { fontSize: 13, color: COLORS.onSurfaceVariant, marginTop: 2 },
  addBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: RADIUS.full,
  },
  addBtnText: { fontSize: 13, fontWeight: '700', color: '#0c0e12' },
  statsSection: { padding: 20, gap: 16 },
  statsRow: { flexDirection: 'row' },
  listHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.onSurfaceVariant,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  emptyCard: { margin: 20, alignItems: 'center', paddingVertical: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: COLORS.onSurface, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: COLORS.onSurfaceVariant, textAlign: 'center', lineHeight: 22 },

  liabCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 10,
  },
  liabIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  liabName: { fontSize: 16, fontWeight: '600', color: COLORS.onSurface },
  liabMeta: { fontSize: 12, color: COLORS.onSurfaceVariant },
  liabCost: { fontSize: 16, fontWeight: '700', color: COLORS.rose },
  deleteLink: { fontSize: 12, color: COLORS.outline, fontWeight: '500' },

  // Modal
  modalContainer: { flex: 1, backgroundColor: COLORS.surface },
  modalScroll: { padding: 24, paddingBottom: 60 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
    paddingTop: 8,
  },
  modalTitle: { fontSize: 22, fontWeight: '800', color: COLORS.onSurface },
  modalClose: { fontSize: 22, color: COLORS.onSurfaceVariant, fontWeight: '300' },
  form: { gap: 20 },
  formGroup: { gap: 6 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.onSurfaceVariant,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: COLORS.onSurface,
  },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  typeBtnActive: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(204,255,0,0.1)',
  },
  typeBtnText: { fontSize: 13, color: COLORS.onSurfaceVariant, fontWeight: '500' },
  typeBtnTextActive: { color: COLORS.primary, fontWeight: '700' },
  editBtnAction: {
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  cancelBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    color: COLORS.onSurfaceVariant,
    fontWeight: '600',
  },
});
