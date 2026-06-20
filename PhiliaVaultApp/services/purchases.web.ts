/**
 * Web stub for purchases.ts.
 * Metro bundler automatically picks this file over purchases.ts on web builds.
 * On web: RevenueCat is unavailable — redirect to Stripe checkout instead.
 */

export const COACH_ENTITLEMENT_ID = 'coach_premium';

export const PRODUCT_IDS = {
  monthly: 'coach_monthly',
  yearly: 'coach_yearly',
} as const;

export function configurePurchases(_appUserId?: string) {
  console.log('[Purchases] Web — RevenueCat désactivé, Stripe actif.');
}

export async function getCurrentOffering() {
  return null;
}

export async function purchasePlan(_plan: 'monthly' | 'yearly'): Promise<null> {
  // On web, payment goes through Stripe checkout (see services/stripe.ts)
  throw new Error('Utilisez stripeCheckout() sur web.');
}

export async function restorePurchases(): Promise<any> {
  throw new Error('Restore non disponible sur web — contactez support@philiavault.com');
}

export function hasCoachEntitlement(_info: any): boolean {
  return false;
}
