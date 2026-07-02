import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Modal, Pressable, Animated, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { COLORS, RADIUS } from '../constants/colors';
import { useUserPreferences } from '../context/UserPreferencesContext';
import { LANGUAGES, Language } from '../constants/translations';
import { CURRENCIES } from '../constants/currencies';

export type SelectorType = 'language' | 'currency';

interface Option {
  code: string;
  flag: string;
  label: string;
}

interface PreferencesSelectorModalProps {
  visible: boolean;
  type: SelectorType | null;
  onClose: () => void;
}

/**
 * Modal bottom-sheet for picking the app language or currency. Shows a flag
 * emoji + label for each option and a checkmark on the currently selected
 * one. Saving shows a small toast confirmation.
 */
export function PreferencesSelectorModal({ visible, type, onClose }: PreferencesSelectorModalProps) {
  const { language, currency, setLanguage, setCurrency, t } = useUserPreferences();
  const [toastVisible, setToastVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const toastOpacity = React.useRef(new Animated.Value(0)).current;

  const showToast = () => {
    setToastVisible(true);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1200),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setToastVisible(false));
  };

  useEffect(() => {
    if (!visible) { setToastVisible(false); setSearchQuery(''); }
  }, [visible]);

  if (!type) return null;

  const allOptions: Option[] = type === 'language'
    ? LANGUAGES.map((l) => ({ code: l.code, flag: l.flag, label: l.label }))
    : CURRENCIES.map((c) => ({ code: c.code, flag: c.flag, label: `${c.name} (${c.symbol})` }));

  const selected = type === 'language' ? language : currency;

  // Filter by search query for currencies
  const options = type === 'language' ? allOptions : searchQuery.trim()
    ? allOptions.filter(o =>
        o.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.code.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allOptions;

  const handleSelect = async (code: string) => {
    if (type === 'language') {
      await setLanguage(code as Language);
    } else {
      await setCurrency(code);
    }
    showToast();
    setTimeout(onClose, 350);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.sheet}
        keyboardVerticalOffset={Platform.OS === 'ios' ? -40 : 0}
      >
        <View style={styles.handle} />
        <Text style={styles.title}>{type === 'language' ? t('language') : t('currency')}</Text>

        {/* Search bar — only for currencies (languages are few) */}
        {type === 'currency' && (
          <View style={styles.searchContainer}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Rechercher une devise..."
              placeholderTextColor="#8e8e93"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn}>
                <Text style={styles.clearText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <ScrollView style={styles.optionsList} showsVerticalScrollIndicator={false}>
          {options.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Aucune devise trouvée</Text>
            </View>
          ) : (
            options.map((opt, i) => {
              const isSelected = opt.code === selected;
              const isLast = i === options.length - 1;
              return (
                <TouchableOpacity
                  key={opt.code}
                  style={[styles.optionRow, isLast && { borderBottomWidth: 0 }]}
                  onPress={() => handleSelect(opt.code)}
                  activeOpacity={0.7}
                >
                  <View style={styles.optionLeft}>
                    <Text style={styles.flag}>{opt.flag}</Text>
                    <Text style={styles.optionLabel} numberOfLines={1}>{opt.label}</Text>
                  </View>
                  {isSelected && <Text style={styles.check}>✓</Text>}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>

        <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.8}>
          <Text style={styles.cancelText}>{t('cancel')}</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>

      {toastVisible && (
        <Animated.View style={[styles.toast, { opacity: toastOpacity }]}>
          <Text style={styles.toastText}>✓ {t('preferences_saved')}</Text>
        </Animated.View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: RADIUS.xxl,
    borderTopRightRadius: RADIUS.xxl,
    borderWidth: 1,
    borderColor: '#2c2c2e',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    maxHeight: '75%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3a3a3c',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2c2c2e',
    paddingHorizontal: 12,
    marginBottom: 10,
    height: 42,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
    paddingVertical: 0,
  },
  clearBtn: {
    padding: 6,
  },
  clearText: {
    color: '#8e8e93',
    fontSize: 14,
    fontWeight: '700',
  },
  optionsList: {
    backgroundColor: '#0c0e12',
    borderWidth: 1,
    borderColor: '#2c2c2e',
    borderRadius: 20,
    paddingHorizontal: 16,
  },
  emptyState: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#8e8e93',
    fontSize: 13,
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#2c2c2e',
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    paddingRight: 12,
  },
  flag: {
    fontSize: 22,
  },
  optionLabel: {
    fontSize: 15,
    color: '#ffffff',
    fontWeight: '600',
    flex: 1,
  },
  check: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '900',
  },
  cancelBtn: {
    marginTop: 16,
    borderRadius: 20,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  cancelText: {
    color: '#8e8e93',
    fontSize: 15,
    fontWeight: '700',
  },
  toast: {
    position: 'absolute',
    bottom: 100,
    left: 40,
    right: 40,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.full,
    paddingVertical: 12,
    alignItems: 'center',
  },
  toastText: {
    color: '#0c0e12',
    fontSize: 14,
    fontWeight: '800',
  },
});

export default PreferencesSelectorModal;
