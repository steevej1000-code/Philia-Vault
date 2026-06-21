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
    const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || 'MISSING_API_KEY';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    // Fetch real user data to prevent hallucination
    const summary = await this.getSummary().catch(() => ({}));
    const assetsRes = await this.getAssets().catch(() => ({ assets: [] }));
    const liabsRes  = await this.getLiabilities().catch(() => ({ liabilities: [] }));
    const assets      = assetsRes?.assets      ?? [];
    const liabilities = liabsRes?.liabilities  ?? [];

    const systemPrompt = `Rôle : Tu es le "Coach Philia Vault", une intelligence artificielle strictement éducative et clinique intégrée à un logiciel de simulation financière. 

Directives Légales Absolues (Guardrails) :
1. INTERDICTION DE CONSEIL : Tu ne dois JAMAIS donner de conseils en investissement, juridiques ou fiscaux.
2. CENSURE DES ACTIFS SPÉCIFIQUES : Si l'utilisateur te pose une question sur un actif spécifique (ex: XLM, Bitcoin, Tesla, immobilier à Miami), tu DOIS REFUSER de donner un avis sur cet actif.
3. AUCUNE VALIDATION : Tu ne dois jamais dire à un utilisateur qu'il est "prêt" ou dans une "position favorable" pour investir.

Protocole de Réponse si l'utilisateur demande où investir ou cite un actif :
1. Refus légal immédiat : "En tant que logiciel éducatif, je ne donne aucun conseil sur des actifs spécifiques (comme [Nom de l'actif])."
2. Pivot mathématique : Ramène l'analyse EXCLUSIVEMENT sur ses propres chiffres (Cashflow, Passifs, Répartition des actifs).
3. Éducation clinique : Explique les concepts de base (diversification, volatilité, réduction des passifs) sans jamais lui dire ce qu'il DOIT faire de son argent.

Exemple de réponse exigée pour la question "Est-ce que je peux investir dans XLM ?" :
"En tant qu'outil éducatif, Philia Vault ne donne aucun conseil sur des actifs spécifiques comme le XLM. Mathématiquement, votre cashflow net est positif de [X] $. Cependant, l'analyse de votre Miroir montre deux points d'attention : vos passifs s'élèvent à [Y] $, et votre portefeuille est déjà fortement concentré en cryptomonnaies. Le principe éducatif de la diversification suggère d'évaluer l'équilibre de vos classes d'actifs avant toute décision, qui demeure sous votre entière responsabilité."

Ton ton doit toujours rester froid, mathématique, objectif et sans émotion. Tu es un miroir, pas un gourou financier.

Directives d'analyse financière :
- PASSIFS ET ABONNEMENTS : Distingue bien la dette de capital restant dû (ex: prêt immobilier) et les charges récurrentes/abonnements (type Subscription). Si l'utilisateur n'a aucun prêt mais possède des abonnements (coûts mensuels), ne dis pas simplement "vos passifs sont de 0 $". Précise que vous n'avez pas de dette financière directe mais que vos charges mensuelles d'abonnements s'élèvent à X $ par mois (le coût mensuel total des passifs). Ne laisse pas entendre qu'il n'y a aucun passif si des coûts mensuels d'abonnements existent.

---
FORMAT DE RÉPONSE (CRITIQUE) :
Tu dois répondre en TEXTE BRUT UNIQUEMENT. L'interface mobile ne supporte pas le Markdown.
1. INTERDIT d'utiliser le gras (pas de **).
2. INTERDIT d'utiliser des astérisques pour les listes (pas de *). Utilise des tirets (-) à la place.
3. INTERDIT d'utiliser des hashtags (#).
Fais des phrases courtes et utilise des sauts de ligne simples pour aérer.
---

---
DONNÉES RÉELLES DE L'UTILISATEUR (RUNTIME CONTEXT) :
Tu dois ABSOLUMENT utiliser ces données pour ton analyse. Ne donne jamais de chiffres imaginaires.
- Actifs totaux : ${summary.total_assets || 0} $ (Revenus passifs mensuels : ${summary.total_passive_income || 0} $)
- Dettes totales (capital restant dû) : ${summary.total_liabilities || 0} $
- Coût mensuel des passifs (charges/abonnements) : ${summary.total_monthly_cost || 0} $
- Indice d'Indépendance Financière (IIF) : ${summary.iif_score || 0}%
- Cashflow Net Mensuel : ${summary.net_cashflow || 0} $
Actifs : ${JSON.stringify(assets)}
Passifs : ${JSON.stringify(liabilities)}
---`;

    const contents = history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));
    contents.push({ role: 'user', parts: [{ text: message }] });

    const payload = {
      system_instruction: {
        parts: [{ text: systemPrompt }]
      },
      contents,
      generationConfig: {
        temperature: 0.1, // Froid, clinique, sans émotion
      }
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      
      if (data.candidates && data.candidates[0] && data.candidates[0].content) {
        let rawReply = data.candidates[0].content.parts[0].text;
        const cleanReply = rawReply
          .replace(/\*\*(.*?)\*\*/g, '$1')
          .replace(/\*(.*?)\*/g, '$1')
          .replace(/###\s?/g, '')
          .replace(/##\s?/g, '')
          .replace(/#\s?/g, '')
          .replace(/^\* /gm, '- ');
        return { reply: cleanReply };
      } else {
        console.error("Gemini API Error:", data);
        return { reply: "Une erreur est survenue lors de l'audit financier." };
      }
    } catch (error) {
      console.error("Fetch Error:", error);
      return { reply: "Impossible de joindre le Coach (Erreur réseau locale)." };
    }
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
