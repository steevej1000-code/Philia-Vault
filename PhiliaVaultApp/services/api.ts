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

  async googleAuth(idToken: string, email?: string) {
    const data = await this.request(ENDPOINTS.googleAuth, {
      method: 'POST',
      body: JSON.stringify({ id_token: idToken, email: email || '' }),
    });
    if (data.success && data.user?.email) {
      this.setUserEmail(data.user.email);
    }
    return data;
  }

  async appleAuth(idToken: string, email?: string) {
    const data = await this.request(ENDPOINTS.appleAuth, {
      method: 'POST',
      body: JSON.stringify({ id_token: idToken, email }),
    });
    if (data.success && data.user?.email) {
      this.setUserEmail(data.user.email);
    }
    return data;
  }

  async forgotPassword(email: string, language?: string) {
    return this.request(ENDPOINTS.forgotPassword, {
      method: 'POST',
      body: JSON.stringify({ email, language }),
    });
  }

  async resetPassword(email: string, code: string, newPassword: string) {
    return this.request(ENDPOINTS.resetPassword, {
      method: 'POST',
      body: JSON.stringify({ email, code, new_password: newPassword }),
    });
  }

  async changePassword(currentPassword: string, newPassword: string) {
    return this.request(ENDPOINTS.changePassword, {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
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

  async getSubscriptionStatus() {
    return this.request(ENDPOINTS.subscriptionStatus);
  }

  async reactivateSubscription() {
    return this.request(ENDPOINTS.reactivateSubscription, { method: 'POST', body: JSON.stringify({}) });
  }

  async cancelSubscription() {
    return this.request(ENDPOINTS.cancelSubscription, {
      method: 'POST',
      body: JSON.stringify({}),
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
    const res = await this.withOfflineCache(CACHE_KEYS.liabilities, () => this.request(ENDPOINTS.liabilities));
    if (res && res.success && Array.isArray(res.liabilities)) {
      res.liabilities = res.liabilities.map((l: any) => ({
        ...l,
        total_debt: l.total_debt !== undefined ? l.total_debt : (l.remaining_amount !== undefined ? l.remaining_amount : l.total_amount),
      }));
    }
    return res;
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

  async getIncome() {
    return this.request('/api/user/income');
  }

  async setIncome(monthlyIncome: number) {
    return this.request('/api/user/income', {
      method: 'POST',
      body: JSON.stringify({ monthly_income: monthlyIncome }),
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

  async getAffiliateNetwork() {
    return this.request(ENDPOINTS.affiliateNetwork);
  }

  async getAffiliateOnboardStatus() {
    return this.request(ENDPOINTS.affiliateOnboardStatus);
  }

  async startAffiliateOnboarding() {
    return this.request(ENDPOINTS.affiliateOnboard, { method: 'POST', body: JSON.stringify({}) });
  }

  // ─── Coach / AI ────────────────────────────────────────────────────────────

  async sendChatMessage(message: string, history: { role: string; text: string }[] = [], lang: string = 'fr') {
    // Route via backend API (uses DeepSeek)
    return this.request('/api/coach/chat', {
      method: 'POST',
      body: JSON.stringify({ message, history, lang }),
    }).then(data => ({
      reply: data.reply || "Une erreur est survenue lors de l'audit financier."
    }));
  }


  // ─── Discipline ───────────────────────────────────────────────────────────

  async getDisciplineHistory(startDate?: string, endDate?: string) {
    let url = '/api/discipline/history';
    const params: string[] = [];
    if (startDate) params.push(`start_date=${startDate}`);
    if (endDate) params.push(`end_date=${endDate}`);
    if (params.length > 0) {
      url += `?${params.join('&')}`;
    }
    return this.request(url);
  }

  async logDiscipline(amountSpent: number, date?: string, categoryId?: number) {
    return this.request('/api/discipline/log', {
      method: 'POST',
      body: JSON.stringify({ amount_spent: amountSpent, date, category_id: categoryId }),
    });
  }

  async getDailyBudget() {
    return this.request('/api/discipline/budget');
  }

  async setDailyBudget(dailyBudget: number) {
    return this.request('/api/discipline/budget', {
      method: 'POST',
      body: JSON.stringify({ daily_budget: dailyBudget }),
    });
  }

  async getGoals() {
    return this.request('/api/goals');
  }

  async createGoal(name: string, targetAmount: number, targetDate: string, category: string) {
    return this.request('/api/goals', {
      method: 'POST',
      body: JSON.stringify({ name, target_amount: targetAmount, target_date: targetDate, category }),
    });
  }

  async contributeToGoal(goalId: number, amount: number, note?: string) {
    return this.request(`/api/goals/${goalId}/contribute`, {
      method: 'POST',
      body: JSON.stringify({ amount, note }),
    });
  }

  async abandonGoal(goalId: number) {
    return this.request(`/api/goals/${goalId}`, {
      method: 'DELETE',
    });
  }

  // ─── My Target ────────────────────────────────────────────────────────────

  async logTargetDailyEntry(epargne: number, depense: number) {
    return this.request('/api/target/daily-entry', {
      method: 'POST',
      body: JSON.stringify({ epargne, depense }),
    });
  }

  async getTargetCalendar(month?: string) {
    let url = '/api/target/calendar';
    if (month) {
      url += `?month=${month}`;
    }
    return this.request(url);
  }

  async getTargetStreak() {
    return this.request('/api/target/streak');
  }

  async getTargetSummary() {
    return this.request('/api/target/summary');
  }

  async setTargetGoal(savings_goal: number, monthly_budget: number) {
    return this.request('/api/target/set-goal', {
      method: 'POST',
      body: JSON.stringify({ savings_goal, monthly_budget }),
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
