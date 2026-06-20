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

export const checkPremiumStatus = async () => ({
  isPremium: false,
  customerInfo: null,
});
