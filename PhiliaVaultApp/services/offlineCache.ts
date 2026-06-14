import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Cache keys ──────────────────────────────────────────────────────────────
// Centralized list of all cache keys used for offline mode. Each key stores
// the last successfully fetched payload for its corresponding endpoint so the
// app can keep showing data while offline.
export const CACHE_KEYS = {
  assets: 'cache_assets',
  liabilities: 'cache_liabilities',
  iifScore: 'cache_iif_score',
  transactions: 'cache_transactions',
  savingsGoals: 'cache_savings_goals',
  userProfile: 'cache_user_profile',
  passiveIncome: 'cache_passive_income',
  lastSync: 'cache_last_sync',
} as const;

export type CacheKey = typeof CACHE_KEYS[keyof typeof CACHE_KEYS];

const PREFIX = '@philia_offline:';

/**
 * Save a JSON-serializable payload to the offline cache under the given key,
 * and bump the global "last sync" timestamp.
 */
export async function saveToCache<T = any>(key: string, data: T): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(data));
    if (key !== CACHE_KEYS.lastSync) {
      await AsyncStorage.setItem(PREFIX + CACHE_KEYS.lastSync, new Date().toISOString());
    }
  } catch (e) {
    console.warn(`offlineCache: failed to save "${key}"`, e);
  }
}

/**
 * Read a previously cached payload. Returns null if nothing is cached or if
 * the stored value can't be parsed.
 */
export async function getFromCache<T = any>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (raw == null) return null;
    return JSON.parse(raw) as T;
  } catch (e) {
    console.warn(`offlineCache: failed to read "${key}"`, e);
    return null;
  }
}

/**
 * Remove a single cached entry, or clear every cache entry managed by this
 * module when no key is provided (e.g. on logout).
 */
export async function clearCache(key?: string): Promise<void> {
  try {
    if (key) {
      await AsyncStorage.removeItem(PREFIX + key);
      return;
    }
    const allKeys = Object.values(CACHE_KEYS);
    await Promise.all(allKeys.map((k) => AsyncStorage.removeItem(PREFIX + k)));
  } catch (e) {
    console.warn('offlineCache: failed to clear cache', e);
  }
}

/**
 * Returns the ISO timestamp of the last successful sync, or null if the app
 * has never synced.
 */
export async function getLastSync(): Promise<string | null> {
  return getFromCache<string>(CACHE_KEYS.lastSync);
}

/**
 * Formats the last-sync timestamp into a short, human-friendly string for
 * display in the offline banner (e.g. "14/06 09:32").
 */
export function formatLastSync(iso: string | null): string {
  if (!iso) return 'jamais';
  try {
    const d = new Date(iso);
    const datePart = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    const timePart = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `${datePart} ${timePart}`;
  } catch {
    return 'jamais';
  }
}
