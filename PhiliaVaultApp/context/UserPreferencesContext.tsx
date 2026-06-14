import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { storage } from '../services/storage';
import api from '../services/api';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { Language, translate } from '../constants/translations';
import { CURRENCY_MAP } from '../constants/currencies';

const LANGUAGE_KEY = '@philia_prefs:language';
const CURRENCY_KEY = '@philia_prefs:currency';

interface UserPreferences {
  language: Language;
  currency: string;
  currencySymbol: string;
  loading: boolean;
  setLanguage: (lang: Language) => Promise<void>;
  setCurrency: (currency: string) => Promise<void>;
  t: (key: string) => string;
  formatAmount: (value: number) => string;
}

const defaultPrefs: UserPreferences = {
  language: 'en',
  currency: 'USD',
  currencySymbol: '$',
  loading: true,
  setLanguage: async () => {},
  setCurrency: async () => {},
  t: (key: string) => key,
  formatAmount: (value: number) => `$${value}`,
};

const UserPreferencesContext = createContext<UserPreferences>(defaultPrefs);

export function UserPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');
  const [currency, setCurrencyState] = useState<string>('USD');
  const [loading, setLoading] = useState(true);
  const { isOnline } = useNetworkStatus();
  const wasOnline = useRef(isOnline);

  // Load from local storage first (offline-first), then try syncing from backend.
  useEffect(() => {
    (async () => {
      try {
        const [storedLang, storedCurrency] = await Promise.all([
          storage.getItem(LANGUAGE_KEY),
          storage.getItem(CURRENCY_KEY),
        ]);
        if (storedLang) setLanguageState(storedLang as Language);
        if (storedCurrency) setCurrencyState(storedCurrency);
      } catch (e) {
        console.warn('UserPreferences: failed to load local prefs', e);
      }

      try {
        const online = await api.isOnline();
        if (online) {
          const result = await api.getPreferences();
          if (result?.success && result.preferences) {
            const { language: remoteLang, currency: remoteCurrency } = result.preferences;
            if (remoteLang) {
              setLanguageState(remoteLang as Language);
              await storage.setItem(LANGUAGE_KEY, remoteLang);
            }
            if (remoteCurrency) {
              setCurrencyState(remoteCurrency);
              await storage.setItem(CURRENCY_KEY, remoteCurrency);
            }
          }
        }
      } catch (e) {
        console.warn('UserPreferences: failed to fetch remote prefs', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // When connectivity returns, push any locally-saved prefs to the backend.
  useEffect(() => {
    if (!wasOnline.current && isOnline) {
      (async () => {
        try {
          const symbol = CURRENCY_MAP[currency]?.symbol || '$';
          await api.updatePreferences({ language, currency, currency_symbol: symbol });
        } catch (e) {
          console.warn('UserPreferences: failed to sync prefs on reconnect', e);
        }
      })();
    }
    wasOnline.current = isOnline;
  }, [isOnline, language, currency]);

  const persist = useCallback(async (lang: Language, curr: string) => {
    await storage.setItem(LANGUAGE_KEY, lang);
    await storage.setItem(CURRENCY_KEY, curr);
    try {
      const online = await api.isOnline();
      if (online) {
        const symbol = CURRENCY_MAP[curr]?.symbol || '$';
        await api.updatePreferences({ language: lang, currency: curr, currency_symbol: symbol });
      }
    } catch (e) {
      console.warn('UserPreferences: failed to sync prefs', e);
    }
  }, []);

  const setLanguage = useCallback(async (lang: Language) => {
    setLanguageState(lang);
    await persist(lang, currency);
  }, [currency, persist]);

  const setCurrency = useCallback(async (curr: string) => {
    setCurrencyState(curr);
    await persist(language, curr);
  }, [language, persist]);

  const t = useCallback((key: string) => translate(language, key), [language]);

  const formatAmount = useCallback((value: number) => {
    const info = CURRENCY_MAP[currency] || CURRENCY_MAP.USD;
    const formatted = Math.abs(value).toLocaleString(info.locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
    const sign = value < 0 ? '-' : '';
    return `${sign}${info.symbol}${formatted}`;
  }, [currency]);

  const currencySymbol = (CURRENCY_MAP[currency] || CURRENCY_MAP.USD).symbol;

  return (
    <UserPreferencesContext.Provider
      value={{ language, currency, currencySymbol, loading, setLanguage, setCurrency, t, formatAmount }}
    >
      {children}
    </UserPreferencesContext.Provider>
  );
}

export function useUserPreferences(): UserPreferences {
  return useContext(UserPreferencesContext);
}

export default UserPreferencesContext;
