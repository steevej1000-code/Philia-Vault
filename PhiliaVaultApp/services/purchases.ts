import { Platform } from 'react-native';
import Purchases, { PurchasesOffering, CustomerInfo } from 'react-native-purchases';

const IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? '';
const ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ?? '';

export const COACH_ENTITLEMENT_ID = 'coach_premium';

export const PRODUCT_IDS = {
  monthly: 'coach_monthly',
  yearly: 'coach_yearly',
} as const;

let configured = false;

export function configurePurchases(appUserId?: string) {
  if (__DEV__) {
    console.log('[Purchases] Mode DEV — RevenueCat désactivé.');
    return;
  }
  if (configured) return;
  const apiKey = Platform.OS === 'ios' ? IOS_API_KEY : ANDROID_API_KEY;
  if (!apiKey) {
    console.warn('[Purchases] Clé API manquante.');
    return;
  }
  Purchases.configure({ apiKey, appUserID: appUserId });
  configured = true;
}

export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  if (__DEV__) return null;
  const offerings = await Purchases.getOfferings();
  return offerings.current ?? null;
}

export async function purchasePlan(plan: 'monthly' | 'yearly'): Promise<CustomerInfo | null> {
  if (__DEV__) {
    throw new Error('Mode DEV — utilisez le bouton "DEV: ACTIVER PREMIUM".');
  }
  const offering = await getCurrentOffering();
  if (!offering) {
    throw new Error('Aucune offre RevenueCat disponible.');
  }
  const pkg =
    (plan === 'monthly' ? offering.monthly : offering.annual) ??
    offering.availablePackages.find((p) => p.product.identifier === PRODUCT_IDS[plan]);
  if (!pkg) {
    throw new Error(`Forfait "${plan}" introuvable.`);
  }
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return customerInfo;
  } catch (e: any) {
    if (e?.userCancelled) return null;
    throw e;
  }
}

export async function restorePurchases(): Promise<CustomerInfo> {
  if (__DEV__) {
    throw new Error('Mode DEV — RevenueCat désactivé.');
  }
  return Purchases.restorePurchases();
}

export function hasCoachEntitlement(info: CustomerInfo): boolean {
  return !!info?.entitlements?.active[COACH_ENTITLEMENT_ID];
}
