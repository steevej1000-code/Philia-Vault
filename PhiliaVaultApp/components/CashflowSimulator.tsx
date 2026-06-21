import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { useAuthStore } from '../store/authStore';
import { API_BASE } from '../constants/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SimState {
  balance: number;
  monthly_salary: number;
  monthly_expenses: number;
  cycle: number;
}

interface PortfolioItem {
  id: number;
  asset_id: string;
  asset_type: string;
  asset_name: string;
  purchase_price: number;
  monthly_income: number;
  depreciation_rate: number;
  purchased_at: string;
}

interface CatalogItem {
  id: string;
  name: string;
  cost: number;
  monthly_income: number;
  depreciation_rate?: number;
  risk_level: string;
  description: string;
}

interface Catalog {
  real_estate: CatalogItem[];
  stocks: CatalogItem[];
  crypto: CatalogItem[];
  business: CatalogItem[];
  luxury: CatalogItem[];
}

interface HistoryItem {
  id: number;
  action: string;
  asset_name: string | null;
  amount: number;
  cycle: number;
  created_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS = ['Marché', 'Portefeuille', 'Stats'] as const;
type Tab = typeof TABS[number];

const CATEGORIES = [
  { key: 'real_estate', label: 'Immobilier', icon: '🏠' },
  { key: 'stocks',      label: 'Bourse',     icon: '📈' },
  { key: 'crypto',      label: 'Crypto',     icon: '₿'  },
  { key: 'business',    label: 'Business',   icon: '🏢' },
  { key: 'luxury',      label: 'Luxe',       icon: '💎' },
] as const;

const RISK_COLORS: Record<string, string> = {
  low:    '#4ADE80',
  medium: '#FBBF24',
  high:   '#F87171',
};

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1000).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;
  return `$${n.toFixed(0)}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CashflowSimulator() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState<Tab>('Marché');
  const [category, setCategory] = useState<string>('real_estate');
  const [state, setState] = useState<SimState | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [passiveIncome, setPassiveIncome] = useState(0);
  const [monthlyCashflow, setMonthlyCashflow] = useState(0);
  const [ratRaceEscaped, setRatRaceEscaped] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [confirmType, setConfirmType] = useState<'buy' | 'sell' | null>(null);
  const [confirmPortfolioId, setConfirmPortfolioId] = useState<number | null>(null);
  const [lastMonthNet, setLastMonthNet] = useState<number | null>(null);

  const headers = { 'Content-Type': 'application/json', 'X-User-Email': user?.email || '' };

  const loadAll = useCallback(async () => {
    if (!user?.email) return;
    setLoading(true);
    try {
      const [stateRes, catalogRes] = await Promise.all([
        fetch(`${API_BASE}/api/simulator/state`, { headers }),
        fetch(`${API_BASE}/api/simulator/catalog`, { headers }),
      ]);
      const stateData = await stateRes.json();
      const catalogData = await catalogRes.json();
      if (stateData.success) {
        setState(stateData.state);
        setPortfolio(stateData.portfolio);
        setHistory(stateData.history);
        setPassiveIncome(stateData.passive_income);
        setMonthlyCashflow(stateData.monthly_cashflow);
        setRatRaceEscaped(stateData.rat_race_escaped);
      }
      if (catalogData.success) setCatalog(catalogData.catalog);
    } catch (e) {
      console.error('Simulator load error:', e);
    } finally {
      setLoading(false);
    }
  }, [user?.email]);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function handleBuy(item: CatalogItem, catKey: string) {
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/simulator/buy`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ asset_id: item.id, asset_type: catKey }),
      });
      const data = await res.json();
      if (data.success) {
        setState(data.state);
        setPortfolio(data.portfolio);
        setPassiveIncome(data.passive_income);
        setRatRaceEscaped(data.rat_race_escaped);
        setMonthlyCashflow(data.state.monthly_salary + data.passive_income - data.state.monthly_expenses);
      } else {
        Alert.alert('Solde insuffisant', data.error || 'Impossible d\'acheter cet actif');
      }
    } catch (e) {
      console.error('Buy error:', e);
    } finally {
      setActionLoading(false);
      setSelectedItem(null);
      setConfirmType(null);
    }
  }

  async function handleSell(portfolioId: number) {
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/simulator/sell`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ portfolio_id: portfolioId }),
      });
      const data = await res.json();
      if (data.success) {
        setState(data.state);
        setPortfolio(data.portfolio);
        setPassiveIncome(data.passive_income);
        setRatRaceEscaped(data.rat_race_escaped);
        setMonthlyCashflow(data.state.monthly_salary + data.passive_income - data.state.monthly_expenses);
      }
    } catch (e) {
      console.error('Sell error:', e);
    } finally {
      setActionLoading(false);
      setConfirmType(null);
      setConfirmPortfolioId(null);
    }
  }

  async function handleAdvance() {
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/simulator/advance`, { method: 'POST', headers });
      const data = await res.json();
      if (data.success) {
        setState(prev => prev ? { ...prev, balance: data.balance, cycle: data.cycle } : prev);
        setPortfolio(data.portfolio);
        setPassiveIncome(data.passive_income);
        setRatRaceEscaped(data.rat_race_escaped);
        setLastMonthNet(data.net_this_month);
        setMonthlyCashflow(data.net_this_month);
        await loadAll();
      }
    } catch (e) {
      console.error('Advance error:', e);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReset() {
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/simulator/reset`, { method: 'POST', headers });
      const data = await res.json();
      if (data.success) {
        setState(data.state);
        setPortfolio([]);
        setHistory([]);
        setPassiveIncome(0);
        setMonthlyCashflow(data.state.monthly_salary - data.state.monthly_expenses);
        setRatRaceEscaped(false);
        setLastMonthNet(null);
      }
    } catch (e) {
      console.error('Reset error:', e);
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator size="small" color="#4ADE80" />
      </View>
    );
  }

  const bal = state?.balance ?? 0;
  const expenses = state?.monthly_expenses ?? 3000;
  const salary = state?.monthly_salary ?? 5000;
  const cycle = state?.cycle ?? 0;
  const freedPct = Math.min(100, Math.round((passiveIncome / expenses) * 100));

  return (
    <View style={styles.wrapper}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.sectionLabel}>SIMULATEUR CASHFLOW</Text>
        <Text style={styles.cycleLabel}>Mois {cycle}</Text>
      </View>

      {/* Cashflow meter */}
      <View style={styles.meterCard}>
        <View style={styles.meterRow}>
          <View>
            <Text style={styles.meterLabel}>SOLDE</Text>
            <Text style={styles.meterValue}>{fmt(bal)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.meterLabel}>REVENU PASSIF</Text>
            <Text style={[styles.meterValue, { color: passiveIncome > 0 ? '#4ADE80' : '#6B7280' }]}>
              +{fmt(passiveIncome)}/mois
            </Text>
          </View>
        </View>
        {/* Freedom bar */}
        <View style={styles.freedomBar}>
          <View style={[styles.freedomFill, { width: `${freedPct}%` as any }]} />
        </View>
        <Text style={styles.freedomLabel}>
          {ratRaceEscaped ? '🎉 Rat race échappée !' : `Liberté financière : ${freedPct}% (${fmt(passiveIncome)} / ${fmt(expenses)})`}
        </Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        {TABS.map(t => (
          <TouchableOpacity key={t} style={[styles.tabBtn, tab === t && styles.tabBtnActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab: Marché */}
      {tab === 'Marché' && catalog && (
        <View>
          {/* Category picker */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
            {CATEGORIES.map(c => (
              <TouchableOpacity
                key={c.key}
                style={[styles.catChip, category === c.key && styles.catChipActive]}
                onPress={() => setCategory(c.key)}
              >
                <Text style={styles.catChipIcon}>{c.icon}</Text>
                <Text style={[styles.catChipLabel, category === c.key && styles.catChipLabelActive]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {/* Asset list */}
          {(catalog[category as keyof Catalog] || []).map(item => {
            const canAfford = bal >= item.cost;
            const isLuxury = category === 'luxury';
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.assetCard, !canAfford && styles.assetCardDisabled]}
                onPress={() => {
                  setSelectedItem(item);
                  setConfirmType('buy');
                }}
                disabled={!canAfford || actionLoading}
              >
                <View style={styles.assetCardLeft}>
                  <Text style={styles.assetName}>{item.name}</Text>
                  <Text style={styles.assetDesc} numberOfLines={1}>{item.description}</Text>
                  <View style={styles.assetTagsRow}>
                    <View style={[styles.riskBadge, { backgroundColor: RISK_COLORS[item.risk_level] + '22', borderColor: RISK_COLORS[item.risk_level] + '55' }]}>
                      <Text style={[styles.riskLabel, { color: RISK_COLORS[item.risk_level] }]}>{item.risk_level.toUpperCase()}</Text>
                    </View>
                    {isLuxury && (
                      <View style={styles.passifBadge}>
                        <Text style={styles.passifLabel}>PASSIF</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={styles.assetCardRight}>
                  <Text style={styles.assetCost}>{fmt(item.cost)}</Text>
                  {item.monthly_income > 0 ? (
                    <Text style={styles.assetIncome}>+{fmt(item.monthly_income)}/m</Text>
                  ) : (
                    <Text style={styles.assetDepreciation}>-{Math.round((item.depreciation_rate ?? 0) * 100)}%/an</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Tab: Portefeuille */}
      {tab === 'Portefeuille' && (
        <View>
          {portfolio.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>🏦</Text>
              <Text style={styles.emptyText}>Aucun actif — allez au Marché pour investir</Text>
            </View>
          ) : (
            portfolio.map(p => (
              <View key={p.id} style={styles.portfolioCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.assetName}>{p.asset_name}</Text>
                  <Text style={styles.assetDesc}>{p.asset_type.replace('_', ' ')} · Payé {fmt(p.purchase_price)}</Text>
                  {p.monthly_income > 0 && (
                    <Text style={styles.assetIncome}>+{fmt(p.monthly_income)}/mois</Text>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.sellBtn}
                  onPress={() => {
                    setConfirmPortfolioId(p.id);
                    setConfirmType('sell');
                  }}
                >
                  <Text style={styles.sellBtnLabel}>Vendre</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      )}

      {/* Tab: Stats */}
      {tab === 'Stats' && (
        <View>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Salaire</Text>
              <Text style={styles.statValue}>{fmt(salary)}/m</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Dépenses fixes</Text>
              <Text style={[styles.statValue, { color: '#F87171' }]}>{fmt(expenses)}/m</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Revenu passif</Text>
              <Text style={[styles.statValue, { color: '#4ADE80' }]}>{fmt(passiveIncome)}/m</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Cashflow net</Text>
              <Text style={[styles.statValue, { color: monthlyCashflow >= 0 ? '#4ADE80' : '#F87171' }]}>
                {monthlyCashflow >= 0 ? '+' : ''}{fmt(monthlyCashflow)}/m
              </Text>
            </View>
          </View>
          {/* History */}
          <Text style={[styles.sectionLabel, { marginBottom: 8 }]}>HISTORIQUE</Text>
          {history.length === 0 ? (
            <Text style={styles.emptyText}>Aucune transaction pour l'instant</Text>
          ) : (
            history.slice(0, 10).map(h => (
              <View key={h.id} style={styles.historyRow}>
                <Text style={styles.historyIcon}>
                  {h.action === 'buy' ? '🟢' : h.action === 'sell' ? '🔴' : '🔄'}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyLabel}>
                    {h.action === 'buy' ? `Achat : ${h.asset_name}` : h.action === 'sell' ? `Vente : ${h.asset_name}` : `Mois ${h.cycle} — net`}
                  </Text>
                </View>
                <Text style={[styles.historyAmount, { color: h.action === 'buy' ? '#F87171' : '#4ADE80' }]}>
                  {h.action === 'buy' ? '-' : '+'}{fmt(Math.abs(h.amount ?? 0))}
                </Text>
              </View>
            ))
          )}
        </View>
      )}

      {/* Action buttons */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.advanceBtn, actionLoading && styles.btnDisabled]}
          onPress={handleAdvance}
          disabled={actionLoading}
        >
          {actionLoading ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text style={styles.advanceBtnLabel}>⏩ Mois suivant</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.resetBtn} onPress={handleReset} disabled={actionLoading}>
          <Text style={styles.resetBtnLabel}>↺</Text>
        </TouchableOpacity>
      </View>

      {/* Buy confirm modal */}
      <Modal transparent visible={confirmType === 'buy' && selectedItem !== null} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{selectedItem?.name}</Text>
            <Text style={styles.modalDesc}>{selectedItem?.description}</Text>
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>Coût</Text>
              <Text style={styles.modalValue}>{fmt(selectedItem?.cost ?? 0)}</Text>
            </View>
            {(selectedItem?.monthly_income ?? 0) > 0 && (
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>Revenu mensuel</Text>
                <Text style={[styles.modalValue, { color: '#4ADE80' }]}>+{fmt(selectedItem?.monthly_income ?? 0)}/mois</Text>
              </View>
            )}
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>Votre solde</Text>
              <Text style={styles.modalValue}>{fmt(bal)}</Text>
            </View>
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>Après achat</Text>
              <Text style={[styles.modalValue, { color: bal - (selectedItem?.cost ?? 0) < 0 ? '#F87171' : '#E5E7EB' }]}>
                {fmt(bal - (selectedItem?.cost ?? 0))}
              </Text>
            </View>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => { setSelectedItem(null); setConfirmType(null); }}>
                <Text style={styles.modalCancelLabel}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, actionLoading && styles.btnDisabled]}
                onPress={() => selectedItem && handleBuy(selectedItem, category)}
                disabled={actionLoading}
              >
                <Text style={styles.modalConfirmLabel}>Acheter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Sell confirm modal */}
      <Modal transparent visible={confirmType === 'sell' && confirmPortfolioId !== null} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Vendre cet actif ?</Text>
            <Text style={styles.modalDesc}>Vous récupérerez le prix d'achat initial.</Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => { setConfirmType(null); setConfirmPortfolioId(null); }}>
                <Text style={styles.modalCancelLabel}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, { backgroundColor: '#F87171' }, actionLoading && styles.btnDisabled]}
                onPress={() => confirmPortfolioId !== null && handleSell(confirmPortfolioId)}
                disabled={actionLoading}
              >
                <Text style={styles.modalConfirmLabel}>Vendre</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: { marginBottom: 16 },
  loadingBox: { height: 80, justifyContent: 'center', alignItems: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionLabel: { color: '#9CA3AF', fontSize: 11, fontFamily: 'SpaceMono', letterSpacing: 1.5 },
  cycleLabel: { color: '#4ADE80', fontSize: 11, fontFamily: 'SpaceMono' },
  // Meter
  meterCard: { backgroundColor: '#111827', borderRadius: 14, borderWidth: 1, borderColor: '#1F2937', padding: 16, marginBottom: 12 },
  meterRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  meterLabel: { color: '#6B7280', fontSize: 10, fontFamily: 'SpaceMono', letterSpacing: 1, marginBottom: 4 },
  meterValue: { color: '#F9FAFB', fontSize: 20, fontWeight: '700' },
  freedomBar: { height: 6, backgroundColor: '#1F2937', borderRadius: 3, overflow: 'hidden', marginBottom: 6 },
  freedomFill: { height: '100%', backgroundColor: '#4ADE80', borderRadius: 3 },
  freedomLabel: { color: '#6B7280', fontSize: 11 },
  // Tabs
  tabsRow: { flexDirection: 'row', backgroundColor: '#111827', borderRadius: 10, borderWidth: 1, borderColor: '#1F2937', marginBottom: 12, padding: 4 },
  tabBtn: { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 7 },
  tabBtnActive: { backgroundColor: '#1F2937' },
  tabLabel: { color: '#6B7280', fontSize: 12, fontWeight: '600' },
  tabLabelActive: { color: '#F9FAFB' },
  // Category
  categoryScroll: { marginBottom: 10 },
  catChip: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, borderWidth: 1, borderColor: '#1F2937', paddingHorizontal: 12, paddingVertical: 6, marginRight: 8, backgroundColor: '#111827', gap: 5 },
  catChipActive: { borderColor: '#4ADE80', backgroundColor: '#4ADE8011' },
  catChipIcon: { fontSize: 13 },
  catChipLabel: { color: '#6B7280', fontSize: 12 },
  catChipLabelActive: { color: '#4ADE80' },
  // Asset cards
  assetCard: { backgroundColor: '#111827', borderRadius: 12, borderWidth: 1, borderColor: '#1F2937', padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center' },
  assetCardDisabled: { opacity: 0.45 },
  assetCardLeft: { flex: 1, marginRight: 12 },
  assetCardRight: { alignItems: 'flex-end' },
  assetName: { color: '#F9FAFB', fontSize: 14, fontWeight: '600', marginBottom: 2 },
  assetDesc: { color: '#6B7280', fontSize: 11, marginBottom: 6 },
  assetTagsRow: { flexDirection: 'row', gap: 6 },
  riskBadge: { borderRadius: 4, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  riskLabel: { fontSize: 9, fontFamily: 'SpaceMono', letterSpacing: 0.5 },
  passifBadge: { borderRadius: 4, borderWidth: 1, borderColor: '#F8717155', backgroundColor: '#7F1D1D22', paddingHorizontal: 6, paddingVertical: 2 },
  passifLabel: { fontSize: 9, color: '#F87171', fontFamily: 'SpaceMono' },
  assetCost: { color: '#F9FAFB', fontSize: 14, fontWeight: '700' },
  assetIncome: { color: '#4ADE80', fontSize: 11, fontWeight: '600' },
  assetDepreciation: { color: '#F87171', fontSize: 11 },
  // Portfolio
  portfolioCard: { backgroundColor: '#111827', borderRadius: 12, borderWidth: 1, borderColor: '#1F2937', padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center' },
  sellBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: '#F87171', backgroundColor: '#7F1D1D22' },
  sellBtnLabel: { color: '#F87171', fontSize: 12, fontWeight: '600' },
  // Empty
  emptyBox: { alignItems: 'center', paddingVertical: 32 },
  emptyIcon: { fontSize: 32, marginBottom: 8 },
  emptyText: { color: '#6B7280', fontSize: 13, textAlign: 'center' },
  // Stats
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  statCard: { backgroundColor: '#111827', borderRadius: 10, borderWidth: 1, borderColor: '#1F2937', padding: 12, flex: 1, minWidth: '45%' },
  statLabel: { color: '#6B7280', fontSize: 10, fontFamily: 'SpaceMono', marginBottom: 4 },
  statValue: { color: '#F9FAFB', fontSize: 15, fontWeight: '700' },
  // History
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1F2937', gap: 8 },
  historyIcon: { fontSize: 14 },
  historyLabel: { color: '#D1D5DB', fontSize: 12 },
  historyAmount: { fontSize: 12, fontWeight: '600' },
  // Action buttons
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  advanceBtn: { flex: 1, backgroundColor: '#4ADE80', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  advanceBtnLabel: { color: '#000', fontSize: 14, fontWeight: '700' },
  resetBtn: { width: 48, height: 48, borderRadius: 12, borderWidth: 1, borderColor: '#1F2937', backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center' },
  resetBtnLabel: { color: '#6B7280', fontSize: 18 },
  btnDisabled: { opacity: 0.5 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: '#00000099', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#111827', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, borderTopWidth: 1, borderTopColor: '#1F2937' },
  modalTitle: { color: '#F9FAFB', fontSize: 17, fontWeight: '700', marginBottom: 6 },
  modalDesc: { color: '#9CA3AF', fontSize: 13, marginBottom: 16, lineHeight: 18 },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  modalLabel: { color: '#6B7280', fontSize: 13 },
  modalValue: { color: '#E5E7EB', fontSize: 13, fontWeight: '600' },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalCancel: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: '#374151', paddingVertical: 13, alignItems: 'center' },
  modalCancelLabel: { color: '#9CA3AF', fontSize: 14 },
  modalConfirm: { flex: 1, borderRadius: 12, backgroundColor: '#4ADE80', paddingVertical: 13, alignItems: 'center' },
  modalConfirmLabel: { color: '#000', fontSize: 14, fontWeight: '700' },
});
