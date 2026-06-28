import { create } from 'zustand';
import { storage } from '../services/storage';
import api from '../services/api';

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  avatar_url?: string;
  premium_status: number;
  currency?: string;
  monthly_income?: number;
  income_updated_at?: string;
}


interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isPremium: boolean;

  setUser: (user: User | null) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (firstName: string, lastName: string, email: string, password: string, referralCode?: string) => Promise<void>;
  loginWithGoogle: (idToken: string, email?: string) => Promise<void>;
  loginWithApple: (idToken: string, email?: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  loadSession: () => Promise<void>;
  setPremium: (status: boolean) => void;
  refreshUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  isPremium: false,

  setUser: (user) => set({
    user,
    isAuthenticated: !!user,
    isPremium: (user?.premium_status ?? 0) >= 1,
  }),

  login: async (email, password) => {
    await api.init();
    const data = await api.login(email, password);
    if (!data.success) throw new Error(data.error || 'Identifiants incorrects');

    // Fetch full user profile after login
    await get().refreshUser();
  },

  register: async (firstName, lastName, email, password, referralCode?: string) => {
    await api.init();
    const data = await api.register(firstName, lastName, email, password, referralCode);
    if (!data.success) throw new Error(data.error || 'Inscription échouée');

    // Auto-login after registration
    await get().login(email, password);
  },

  loginWithGoogle: async (idToken: string, email?: string) => {
    await api.init();
    const data = await api.googleAuth(idToken, email);
    if (!data.success) throw new Error(data.error || 'Connexion Google échouée');

    // Now fetch full profile
    await get().refreshUser();
  },

  loginWithApple: async (idToken: string, email?: string) => {
    await api.init();
    const data = await api.appleAuth(idToken, email);
    if (!data.success) throw new Error(data.error || 'Connexion Apple échouée');

    // Now fetch full profile
    await get().refreshUser();
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    await api.init();
    const data = await api.changePassword(currentPassword, newPassword);
    if (!data.success) throw new Error(data.error || 'Modification du mot de passe échouée');
  },

  logout: async () => {
    await api.logout();
    set({ user: null, isAuthenticated: false, isPremium: false });
  },

  refreshUser: async () => {
    const userData = await api.getUser();
    if (userData.success && userData.user) {
      const user: User = userData.user;
      get().setUser(user);
      await storage.setItem('user_data', JSON.stringify(user));
    }
  },

  loadSession: async () => {
    set({ isLoading: true });
    try {
      await api.init();

      // Check if we have a stored email (means user was logged in)
      const storedEmail = await storage.getItem('user_email');
      if (!storedEmail) {
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }

      // Try to restore session by fetching fresh user profile
      try {
        await get().refreshUser();
      } catch {
        // Server unreachable — use cached data
        const cached = await storage.getItem('user_data');
        if (cached) {
          get().setUser(JSON.parse(cached));
        } else {
          set({ user: null, isAuthenticated: false });
        }
      }
    } catch {
      set({ user: null, isAuthenticated: false });
    } finally {
      set({ isLoading: false });
    }
  },

  setPremium: (status) => {
    set((state) => ({
      isPremium: status,
      user: state.user ? { ...state.user, premium_status: status ? 1 : 0 } : null,
    }));
    // Also update on server
    api.setPremiumStatus(status ? 1 : 0).catch(() => {});
  },
}));
