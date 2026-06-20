export interface CurrencyInfo {
  code: string;
  symbol: string;
  name: string;
  flag: string;
  locale: string;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'USD', symbol: '$', name: 'US Dollar', flag: '🇺🇸', locale: 'en-US' },
  { code: 'EUR', symbol: '€', name: 'Euro', flag: '🇪🇺', locale: 'fr-FR' },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar', flag: '🇨🇦', locale: 'en-CA' },
  { code: 'GBP', symbol: '£', name: 'British Pound', flag: '🇬🇧', locale: 'en-GB' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', flag: '🇧🇷', locale: 'pt-BR' },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso', flag: '🇲🇽', locale: 'es-MX' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', flag: '🇦🇺', locale: 'en-AU' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc', flag: '🇨🇭', locale: 'de-CH' },
];

export const CURRENCY_MAP: Record<string, CurrencyInfo> = CURRENCIES.reduce((acc, c) => {
  acc[c.code] = c;
  return acc;
}, {} as Record<string, CurrencyInfo>);
