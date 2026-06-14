import { Platform } from 'react-native';
import Purchases, { PurchasesOffering, CustomerInfo } from 'react-native-purchases';

// RevenueCat API keys are public client keys (safe to ship in the app, but
// still kept out of source control). Set them via env vars — see .env.example.
//   EXPO_PUBLIC_REVENUECAT_IOS_API_KEY
//   EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY
const IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? '';
const ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ?? '';

// Entitlement identifier configured in the RevenueCat dashboard
// (Entitlements tab). Grants access to the Coach IA paywall.
export const COACH_ENTITLEMENT_ID = 'coach_premium';

// Product/package identifiers. These must match what Steeve configures in
// App Store Connect / Google Play Console *and* the RevenueCat dashboard
// (Products tab + the "default" Offering's packages).
export const PRODUCT_IDS = {
  monthly: 'coach_monthly', // $9.99 / month
  yearly: 'coach_yearly',   // $79.99 / year
} as const;

let configured = false;

/**
 * Initialize the RevenueCat SDK. Safe to call multiple times — only
 * configures once. Call this once on app startup (e.g. in app/_layout.tsx).
 */
export function configurePurchases(appUserId?: string) {
  if (configured) return;

  const apiKey = Platform.OS === 'ios' ? IOS_API_KEY : ANDROID_API_KEY;
  if (!apiKey) {
    console.warn(
      'RevenueCat: clé API manquante. Définissez EXPO_PUBLIC_REVENUECAT_IOS_API_KEY / ' +
      'EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY (voir .env.example).'
    );
    return;
  }

  Purchases.configure({ apiKey, appUserID: appUserId });
  configured = true;
}

/**
 * Fetch the current offerings (plans) configured in the RevenueCat dashboard.
 */
export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  const offerings = await Purchases.getOfferings();
  return offerings.current ?? null;
}

/**
 * Purchase a plan ("monthly" | "yearly") and return the resulting
 * CustomerInfo, or null if the user cancelled.
 */
export async function purchasePlan(plan: 'monthly' | 'yearly'): Promise<CustomerInfo | null> {
  const offering = await getCurrentOffering();
  if (!offering) {
    throw new Error('Aucune offre RevenueCat disponible. Vérifiez la configuration du dashboard.');
  }

  const pkg =
    (plan === 'monthly' ? offering.monthly : offering.annual) ??
    offering.availablePackages.find((p) => p.product.identifier === PRODUCT_IDS[plan]);

  if (!pkg) {
    throw new Error(`Forfait "${plan}" introuvable dans l'offre RevenueCat (ID attendu: ${PRODUCT_IDS[plan]}).`);
  }

  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return customerInfo;
  } catch (e: any) {
    if (e?.userCancelled) return null;
    throw e;
  }
}

/**
 * Restore previous purchases (required by App Store guidelines).
 */
export async function restorePurchases(): Promise<CustomerInfo> {
  return Purchases.restorePurchases();
}

/**
 * Check whether the user currently has the Coach IA entitlement active.
 */
export function hasCoachEntitlement(info: CustomerInfo): boolean {
  return !!info.entitlements.active[COACH_ENTITLEMENT_ID];
}
