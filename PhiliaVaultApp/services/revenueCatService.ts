/**
 * RevenueCat service for native iOS/Android.
 * Metro picks this file over revenueCatService.web.ts on native builds.
 */
import Purchases, {
  LOG_LEVEL,
  CustomerInfo,
  PurchasesPackage,
} from 'react-native-purchases';
import { API_BASE } from '../constants/api';
import { storage } from './storage';

// RevenueCat API Keys from environment
const REVENUECAT_API_KEY_IOS = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';
const REVENUECAT_API_KEY_ANDROID = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';

/**
 * Initialize RevenueCat SDK.
 * Call once at app startup with the user's ID.
 */
export const initializeRevenueCat = async (userId: string): Promise<void> => {
  const apiKey = REVENUECAT_API_KEY_IOS || REVENUECAT_API_KEY_ANDROID;
  if (!apiKey) {
    console.warn('[RevenueCat] No API key configured. Purchases will not work.');
    return;
  }

  Purchases.setLogLevel(LOG_LEVEL.DEBUG);

  try {
    await Purchases.configure({ apiKey });
    if (userId) {
      await Purchases.logIn(userId);
    }
    console.log('[RevenueCat] Initialized successfully');
  } catch (e) {
    console.error('[RevenueCat] Initialization error:', e);
  }
};

/**
 * Fetch available offerings (monthly + annual plans).
 */
export const getOfferings = async (): Promise<{
  monthly: PurchasesPackage | null;
  annual: PurchasesPackage | null;
} | null> => {
  try {
    const offerings = await Purchases.getOfferings();
    if (!offerings.current) return null;

    return {
      monthly: offerings.current.monthly ?? null,
      annual: offerings.current.annual ?? null,
    };
  } catch (e) {
    console.error('[RevenueCat] Error fetching offerings:', e);
    return null;
  }
};

/**
 * Purchase a package (monthly or annual).
 * Returns { success, customerInfo, error }
 */
export const purchasePackage = async (pkg: PurchasesPackage) => {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return {
      success: true,
      customerInfo,
      error: null,
    };
  } catch (e: any) {
    // User cancelled or error
    return {
      success: false,
      customerInfo: null,
      error: e.userCancelled ? null : e.message,
    };
  }
};

/**
 * Restore previous purchases.
 */
export const restorePurchases = async () => {
  try {
    const customerInfo = await Purchases.restorePurchases();
    return {
      success: true,
      customerInfo,
    };
  } catch (e: any) {
    return {
      success: false,
      customerInfo: null,
      error: e.message,
    };
  }
};

/**
 * Check if current user has premium entitlement.
 */
export const checkPremiumStatus = async () => {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    const isPremium = customerInfo.entitlements.active['premium'] !== undefined;
    return { isPremium, customerInfo };
  } catch {
    // Fallback: check via backend API
    try {
      const email = await storage.getItem('user_email');
      if (!email) return { isPremium: false, customerInfo: null };
      const res = await fetch(`${API_BASE}/api/user`, {
        headers: { 'X-User-Email': email },
      });
      if (!res.ok) return { isPremium: false, customerInfo: null };
      const data = await res.json();
      return { isPremium: (data.user?.premium_status ?? 0) >= 1, customerInfo: null };
    } catch {
      return { isPremium: false, customerInfo: null };
    }
  }
};

/**
 * Get current customer info.
 */
export const getCustomerInfo = async (): Promise<CustomerInfo | null> => {
  try {
    return await Purchases.getCustomerInfo();
  } catch {
    return null;
  }
};
