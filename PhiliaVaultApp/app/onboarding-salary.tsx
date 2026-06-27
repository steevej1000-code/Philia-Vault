import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Dimensions, ScrollView
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';
import { COLORS } from '../constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconClose } from '../components/icons/Icons';

const { width } = Dimensions.get('window');

export default function OnboardingSalaryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const editMode = params.editMode === 'true';
  const insets = useSafeAreaInsets();
  
  const { user, refreshUser } = useAuthStore();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1: Salary
  const [salary, setSalary] = useState('');

  // Step 2: Liabilities
  const [liab1Name, setLiab1Name] = useState('');
  const [liab1Cost, setLiab1Cost] = useState('');
  const [liab2Name, setLiab2Name] = useState('');
  const [liab2Cost, setLiab2Cost] = useState('');
  const [liab3Name, setLiab3Name] = useState('');
  const [liab3Cost, setLiab3Cost] = useState('');

  // Pre-fill salary if editMode and user has it set
  useEffect(() => {
    if (user?.monthly_income) {
      setSalary(user.monthly_income.toString());
    }
  }, [user]);

  const handleStep1Next = async () => {
    const salaryVal = parseFloat(salary);
    if (isNaN(salaryVal) || salaryVal <= 0) {
      Alert.alert('Erreur', 'Veuillez saisir un montant supérieur à 0.');
      return;
    }

    if (editMode) {
      setLoading(true);
      try {
        await api.init();
        await api.setIncome(salaryVal);
        await refreshUser();
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/(tabs)');
        }
      } catch (err: any) {
        Alert.alert('Erreur', err.message || 'Impossible de sauvegarder le revenu.');
      } finally {
        setLoading(false);
      }
    } else {
      setStep(2);
    }
  };

  const handleFinish = async () => {
    setLoading(true);
    try {
      await api.init();
      // Save Step 1: Salary
      const salaryVal = parseFloat(salary);
      await api.setIncome(salaryVal);

      // Save Step 2: Liabilities (only if they have costs)
      const saveLiab = async (name: string, costStr: string, defaultName: string, type: string) => {
        const cost = parseFloat(costStr);
        if (!isNaN(cost) && cost > 0) {
          const finalName = name.trim() || defaultName;
          await api.addLiability({
            name: finalName,
            type: type,
            total_debt: type === 'Subscription' ? 0 : cost * 12, // Subscriptions don't have a debt balance, other loans assume 1 year default for simplicity
            monthly_cost: cost
          });
        }
      };

      await saveLiab(liab1Name, liab1Cost, 'Loyer', 'Subscription');
      await saveLiab(liab2Name, liab2Cost, 'Crédit auto', 'Loan');
      await saveLiab(liab3Name, liab3Cost, 'Abonnements', 'Subscription');

      await refreshUser();
      
      // Navigate to tabs
      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert('Erreur', err.message || "Une erreur est survenue lors de l'enregistrement.");
    } finally {
      setLoading(false);
    }
  };

  const isSalaryValid = parseFloat(salary) > 0;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <StatusBar style="light" />
      
      {/* Header with back button if editing */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) }]}>
        {editMode ? (
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <IconClose size={20} color="#FFFFFF" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
        
        {/* Centered logo text */}
        <Text style={styles.logoText}>PHILIA VAULT</Text>
        <View style={{ width: 40 }} />
      </View>

      {step === 1 ? (
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.content}>
            <Text style={styles.title}>Quel est ton revenu mensuel net ?</Text>
            <Text style={styles.subtitle}>Après impôts. La base de ton diagnostic financier.</Text>

            <View style={styles.inputContainer}>
              <Text style={styles.currencySymbol}>$</Text>
              <TextInput
                style={styles.salaryInput}
                value={salary}
                onChangeText={setSalary}
                placeholder="0"
                placeholderTextColor="#333333"
                keyboardType="numeric"
                inputMode="decimal"
                maxLength={10}
                autoFocus
              />
            </View>

            <TouchableOpacity
              style={[styles.nextButton, !isSalaryValid && styles.buttonDisabled]}
              onPress={handleStep1Next}
              disabled={!isSalaryValid || loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#000000" size="small" />
              ) : (
                <Text style={styles.nextButtonText}>
                  {editMode ? 'Sauvegarder →' : 'Suivant →'}
                </Text>
              )}
            </TouchableOpacity>

            <Text style={styles.privacyNote}>
              Ce chiffre reste dans ton coffre-fort. Jamais partagé.
            </Text>
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.content}>
            <Text style={styles.title}>Identifie tes boulets financiers.</Text>
            <Text style={styles.subtitle}>Entre tes 3 plus grosses dépenses fixes mensuelles.</Text>

            <View style={styles.liabilitiesList}>
              {/* Liability 1 */}
              <View style={styles.liabilityRow}>
                <TextInput
                  style={styles.liabNameInput}
                  value={liab1Name}
                  onChangeText={setLiab1Name}
                  placeholder="Ex: Loyer"
                  placeholderTextColor="#666666"
                />
                <Text style={styles.liabSeparator}>—</Text>
                <View style={styles.liabCostContainer}>
                  <Text style={[styles.liabCurrency, liab1Cost !== '' && { color: '#FF4444' }]}>$</Text>
                  <TextInput
                    style={[styles.liabCostInput, liab1Cost !== '' && { color: '#FF4444' }]}
                    value={liab1Cost}
                    onChangeText={setLiab1Cost}
                    placeholder="0"
                    placeholderTextColor="#666666"
                    keyboardType="numeric"
                    inputMode="decimal"
                  />
                </View>
              </View>

              {/* Liability 2 */}
              <View style={styles.liabilityRow}>
                <TextInput
                  style={styles.liabNameInput}
                  value={liab2Name}
                  onChangeText={setLiab2Name}
                  placeholder="Ex: Crédit auto"
                  placeholderTextColor="#666666"
                />
                <Text style={styles.liabSeparator}>—</Text>
                <View style={styles.liabCostContainer}>
                  <Text style={[styles.liabCurrency, liab2Cost !== '' && { color: '#FF4444' }]}>$</Text>
                  <TextInput
                    style={[styles.liabCostInput, liab2Cost !== '' && { color: '#FF4444' }]}
                    value={liab2Cost}
                    onChangeText={setLiab2Cost}
                    placeholder="0"
                    placeholderTextColor="#666666"
                    keyboardType="numeric"
                    inputMode="decimal"
                  />
                </View>
              </View>

              {/* Liability 3 */}
              <View style={styles.liabilityRow}>
                <TextInput
                  style={styles.liabNameInput}
                  value={liab3Name}
                  onChangeText={setLiab3Name}
                  placeholder="Ex: Abonnements"
                  placeholderTextColor="#666666"
                />
                <Text style={styles.liabSeparator}>—</Text>
                <View style={styles.liabCostContainer}>
                  <Text style={[styles.liabCurrency, liab3Cost !== '' && { color: '#FF4444' }]}>$</Text>
                  <TextInput
                    style={[styles.liabCostInput, liab3Cost !== '' && { color: '#FF4444' }]}
                    value={liab3Cost}
                    onChangeText={setLiab3Cost}
                    placeholder="0"
                    placeholderTextColor="#666666"
                    keyboardType="numeric"
                    inputMode="decimal"
                  />
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={styles.nextButton}
              onPress={handleFinish}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#000000" size="small" />
              ) : (
                <Text style={styles.nextButtonText}>Calculer mon Cashflow →</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 15,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 18,
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 30,
    paddingBottom: 40,
    alignItems: 'center',
  },
  title: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 26,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 34,
  },
  subtitle: {
    fontFamily: 'PlusJakartaSans-Regular',
    fontSize: 15,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 22,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 50,
  },
  currencySymbol: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 48,
    color: '#CCFF00',
    marginRight: 10,
  },
  salaryInput: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 48,
    color: '#CCFF00',
    minWidth: 100,
    textAlign: 'left',
    padding: 0,
  },
  nextButton: {
    width: '100%',
    backgroundColor: '#CCFF00',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: '#CCFF00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  buttonDisabled: {
    backgroundColor: '#1E3A1E',
    shadowOpacity: 0,
    elevation: 0,
  },
  nextButtonText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 16,
    color: '#000000',
  },
  privacyNote: {
    fontFamily: 'PlusJakartaSans-Regular',
    fontSize: 12,
    color: '#444444',
    textAlign: 'center',
    marginTop: 20,
  },
  
  // Step 2 Liabilities styles
  liabilitiesList: {
    width: '100%',
    gap: 16,
    marginBottom: 40,
  },
  liabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  liabNameInput: {
    flex: 1,
    fontFamily: 'PlusJakartaSans-Medium',
    fontSize: 16,
    color: '#FFFFFF',
    padding: 0,
  },
  liabSeparator: {
    fontFamily: 'PlusJakartaSans-Medium',
    fontSize: 16,
    color: '#444444',
    marginHorizontal: 12,
  },
  liabCostContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 100,
    justifyContent: 'flex-end',
  },
  liabCurrency: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 16,
    color: '#8E8E93',
    marginRight: 4,
  },
  liabCostInput: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'right',
    padding: 0,
    minWidth: 40,
  },
});
