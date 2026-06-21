/**
 * Web stub for revenueCatService.
 * Metro bundler automatically picks this file over revenueCatService.ts on web builds.
 * RevenueCat SDK is native-only — on web, Stripe handles payments instead.
 */

export const initializeRevenueCat = async (_userId: string): Promise<void> => {
  console.log('[RevenueCat] Web — SDK désactivé, Stripe utilisé à la place.');
};

export const getOfferings = async (): Promise<null> => null;

export const purchasePackage = async (_pkg: any) => ({
  success: false,
  error: 'RevenueCat non disponible sur web. Utilisez Stripe.',
});

export const restorePurchases = async () => ({
  success: false,
  customerInfo: null,
});

export const checkPremiumStatus = async () => {
  // On web, RevenueCat is unavailable — check premium status via backend API
  try {
    const { storage } = await import('./storage');
    const email = await storage.getItem('user_email');
    if (!email) return { isPremium: false, customerInfo: null };

    const { API_BASE } = await import('../constants/api');
    const res = await fetch(`${API_BASE}/api/user`, {
      headers: { 'X-User-Email': email },
    });
    if (!res.ok) return { isPremium: false, customerInfo: null };
    const data = await res.json();
    const isPremium = (data.user?.premium_status ?? 0) >= 1;
    return { isPremium, customerInfo: null };
  } catch {
    return { isPremium: false, customerInfo: null };
  }
};
