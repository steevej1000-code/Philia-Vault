import { Platform } from 'react-native';

// Web stub — RevenueCat n'existe pas sur le web

export const COACH_ENTITLEMENT_ID = 'coach_premium';

export const PRODUCT_IDS = {
  monthly: 'coach_monthly',
  yearly: 'coach_yearly',
} as const;

export function configurePurchases(_appUserId?: string) {
  // No-op on web
}

export async function getCurrentOffering(): Promise<null> {
  return null;
}

export async function purchasePlan(_plan: 'monthly' | 'yearly'): Promise<null> {
  throw new Error('Les achats natifs ne sont pas disponibles sur le web. Utilisez Stripe.');
}

export async function restorePurchases(): Promise<null> {
  throw new Error('Les restaurations natives ne sont pas disponibles sur le web.');
}

export function hasCoachEntitlement(_info: any): boolean {
  return false;
}
