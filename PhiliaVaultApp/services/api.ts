import { storage } from './storage';
import { API_BASE, ENDPOINTS } from '../constants/api';
import NetInfo from '@react-native-community/netinfo';
import { CACHE_KEYS, saveToCache, getFromCache } from './offlineCache';

class ApiClient {
  private userEmail: string | null = null;

  async init() {
    this.userEmail = await storage.getItem('user_email');
  }

  setUserEmail(email: string | null) {
    this.userEmail = email;
    if (email) {
      storage.setItem('user_email', email);
    } else {
      storage.removeItem('user_email');
    }
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    // The Flask backend identifies users via X-User-Email header
    if (this.userEmail) {
      headers['X-User-Email'] = this.userEmail;
    }

    const url = `${API_BASE}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const text = await response.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Réponse invalide du serveur: ${text.substring(0, 100)}`);
      }

      if (!response.ok) {
        throw new Error(data.error || `Erreur serveur ${response.status}`);
      }

      return data;
    } catch (e: any) {
      if (e?.message?.includes('fetch') || e?.message?.includes('Network')) {
        throw new Error('Impossible de contacter le serveur. Vérifiez que server.py est lancé.');
      }
      throw e;
    }
  }

  /**
   * Checks live connectivity. Falls back to "online" if NetInfo can't be
   * reached (better to attempt the request than to assume offline).
   */
  async isOnline(): Promise<boolean> {
    try {
      const state = await NetInfo.fetch();
      if (state.isConnected === false) return false;
      if (state.isInternetReachable === false) return false;
      return true;
    } catch {
      return true;
    }
  }

  /**
   * Generic offline-aware fetch: when online, performs `fetcher()` and caches
   * the result under `cacheKey`. When offline (or when the network request
   * fails), returns the cached value instead. Throws if neither is available.
   */
  private async withOfflineCache<T = any>(cacheKey: string, fetcher: () => Promise<T>): Promise<T> {
    const online = await this.isOnline();

    if (online) {
      try {
        const data = await fetcher();
        await saveToCache(cacheKey, data);
        return data;
      } catch (e: any) {
        const cached = await getFromCache<T>(cacheKey);
        if (cached) return cached;
        throw e;
      }
    }

    const cached = await getFromCache<T>(cacheKey);
    if (cached) return cached;
    throw new Error('Aucune donnée en cache disponible hors ligne.');
  }

  // ─── Auth ─────────────────────────────────────────────────────────────────

  async login(email: string, password: string) {
    const data = await this.request(ENDPOINTS.login, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (data.success) {
      this.setUserEmail(email);
    }
    return data;
  }

  async register(firstName: string, lastName: string, email: string, password: string, referralCode?: string) {
    const data = await this.request(ENDPOINTS.register, {
      method: 'POST',
      body: JSON.stringify({ first_name: firstName, last_name: lastName, email, password, referral_code: referralCode }),
    });
    return data;
  }

  async googleAuth(idToken: string) {
    const data = await this.request(ENDPOINTS.googleAuth, {
      method: 'POST',
      body: JSON.stringify({ id_token: idToken }),
    });
    if (data.success && data.user?.email) {
      this.setUserEmail(data.user.email);
    }
    return data;
  }

  async logout() {
    this.setUserEmail(null);
    await storage.removeItem('user_email');
    await storage.removeItem('user_data');
  }

  // ─── User ──────────────────────────────────────────────────────────────────

  async getUser() {
    return this.withOfflineCache(CACHE_KEYS.userProfile, () => this.request(ENDPOINTS.user));
  }

  async getSummary() {
    return this.withOfflineCache(CACHE_KEYS.iifScore, () => this.request(ENDPOINTS.summary));
  }

  async updateProfile(data: { first_name?: string; last_name?: string }) {
    return this.request(ENDPOINTS.profile, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getSettings() {
    return this.request(ENDPOINTS.settings);
  }

  async updateSettings(data: { currency?: string; notifications_enabled?: boolean }) {
    return this.request(ENDPOINTS.settings, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getPreferences() {
    return this.request(ENDPOINTS.preferences);
  }

  async updatePreferences(data: { language?: string; currency?: string; currency_symbol?: string }) {
    return this.request(ENDPOINTS.preferences, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async setPremiumStatus(status: number) {
    return this.request(ENDPOINTS.premium, {
      method: 'POST',
      body: JSON.stringify({ premium_status: status }),
    });
  }

  // ─── Assets ────────────────────────────────────────────────────────────────

  async getAssets() {
    return this.withOfflineCache(CACHE_KEYS.assets, () => this.request(ENDPOINTS.assets));
  }

  async addAsset(data: { name: string; type: string; value: number; monthly_yield: number }) {
    return this.request(ENDPOINTS.assets, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteAsset(id: number) {
    return this.request(`${ENDPOINTS.assets}/${id}`, { method: 'DELETE' });
  }

  async updateAsset(id: number, data: { name: string; type: string; value: number; monthly_yield: number }) {
    return this.request(`${ENDPOINTS.assets}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // ─── Liabilities ───────────────────────────────────────────────────────────

  async getLiabilities() {
    return this.withOfflineCache(CACHE_KEYS.liabilities, () => this.request(ENDPOINTS.liabilities));
  }

  async addLiability(data: { name: string; type: string; total_debt: number; monthly_cost: number }) {
    return this.request(ENDPOINTS.liabilities, {
      method: 'POST',
      body: JSON.stringify({
        name: data.name,
        type: data.type,
        monthly_cost: data.monthly_cost,
        total_amount: data.total_debt,
        remaining_amount: data.total_debt,
      }),
    });
  }

  async deleteLiability(id: number) {
    return this.request(`${ENDPOINTS.liabilities}/${id}`, { method: 'DELETE' });
  }

  async updateLiability(id: number, data: { name: string; type: string; total_debt: number; monthly_cost: number }) {
    return this.request(`${ENDPOINTS.liabilities}/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: data.name,
        type: data.type,
        monthly_cost: data.monthly_cost,
        total_amount: data.total_debt,
        remaining_amount: data.total_debt,
      }),
    });
  }

  // ─── Transactions ──────────────────────────────────────────────────────────

  async getTransactions() {
    return this.withOfflineCache(CACHE_KEYS.transactions, () => this.request(ENDPOINTS.transactions));
  }

  // ─── Savings Goals ─────────────────────────────────────────────────────────

  async getSavingsGoals() {
    return this.withOfflineCache(CACHE_KEYS.savingsGoals, () => this.request(ENDPOINTS.savingsGoals));
  }

  // ─── Affiliation ───────────────────────────────────────────────────────────

  async getAffiliationStats() {
    return this.withOfflineCache(CACHE_KEYS.passiveIncome, () => this.request(ENDPOINTS.affiliationStats));
  }

  // ─── Coach / AI ────────────────────────────────────────────────────────────

  async sendChatMessage(message: string, history: { role: string; text: string }[] = [], lang: string = 'fr') {
    return this.request(ENDPOINTS.chat, {
      method: 'POST',
      body: JSON.stringify({ message, lang, history }),
    });
  }


  /**
   * Pre-fetches and caches all offline-supported endpoints. Intended to run
   * on app startup (when online) and on reconnect, so cached data is fresh
   * even before the user visits each screen.
   */
  async syncAll(): Promise<void> {
    const online = await this.isOnline();
    if (!online) return;

    const tasks = [
      this.getSummary(),
      this.getAssets(),
      this.getLiabilities(),
      this.getTransactions(),
      this.getSavingsGoals(),
      this.getUser(),
      this.getAffiliationStats(),
    ];

    await Promise.allSettled(tasks);
  }
}

export const api = new ApiClient();
export default api;
