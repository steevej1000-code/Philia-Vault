export interface CurrencyInfo {
  code: string;
  symbol: string;
  flag: string;
  locale: string;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'USD', symbol: '$', flag: '🇺🇸', locale: 'en-US' },
  { code: 'EUR', symbol: '€', flag: '🇪🇺', locale: 'fr-FR' },
  { code: 'CAD', symbol: 'CA$', flag: '🇨🇦', locale: 'en-CA' },
  { code: 'GBP', symbol: '£', flag: '🇬🇧', locale: 'en-GB' },
  { code: 'BRL', symbol: 'R$', flag: '🇧🇷', locale: 'pt-BR' },
  { code: 'MXN', symbol: 'MX$', flag: '🇲🇽', locale: 'es-MX' },
  { code: 'AUD', symbol: 'A$', flag: '🇦🇺', locale: 'en-AU' },
  { code: 'CHF', symbol: 'CHF', flag: '🇨🇭', locale: 'de-CH' },
  { code: 'HTG', symbol: 'G', flag: '🇭🇹', locale: 'fr-HT' },
];

export const CURRENCY_MAP: Record<string, CurrencyInfo> = CURRENCIES.reduce((acc, c) => {
  acc[c.code] = c;
  return acc;
}, {} as Record<string, CurrencyInfo>);
