import Purchases, { LOG_LEVEL, PurchasesPackage } from 'react-native-purchases';
import { Platform } from 'react-native';

const REVENUECAT_API_KEYS = {
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || 'appl_xxxxxxxxxxxx',
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY || 'goog_xxxxxxxxxxxx',
};

export const initializeRevenueCat = async (userId: string) => {
  if (__DEV__) {
    console.log('[RevenueCat] Mode DEV — SDK désactivé, aucun appel réel.');
    return;
  }
  try {
    Purchases.setLogLevel(LOG_LEVEL.WARN);
    const apiKey = Platform.OS === 'ios'
      ? REVENUECAT_API_KEYS.ios
      : REVENUECAT_API_KEYS.android;
    await Purchases.configure({ apiKey, appUserID: userId });
    console.log('[RevenueCat] Initialisé avec succès');
  } catch (error) {
    console.error('[RevenueCat] Erreur initialisation:', error);
  }
};

export const getOfferings = async () => {
  if (__DEV__) {
    console.log('[RevenueCat] Mode DEV — getOfferings retourne les offerings simulés.');
    return {
      monthly: {
        identifier: '$rc_monthly',
        packageType: 'MONTHLY',
        product: {
          identifier: 'coach_monthly',
          description: 'Philia Vault Premium Mensuel',
          title: 'Premium Mensuel',
          price: 14.99,
          priceString: '$14.99',
          currencyCode: 'USD',
        },
        offeringIdentifier: 'default',
      },
      annual: {
        identifier: '$rc_annual',
        packageType: 'ANNUAL',
        product: {
          identifier: 'coach_annual',
          description: 'Philia Vault Premium Annuel',
          title: 'Premium Annuel',
          price: 149.90,
          priceString: '$149.90',
          currencyCode: 'USD',
        },
        offeringIdentifier: 'default',
      },
    } as any;
  }
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current;
  } catch (error) {
    console.error('[RevenueCat] Erreur récupération offerings:', error);
    return null;
  }
};

export const purchasePackage = async (pkg: PurchasesPackage) => {
  if (__DEV__) {
    console.log('[RevenueCat] Mode DEV — purchasePackage simulé.');
    return { success: true, customerInfo: null };
  }
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { success: true, customerInfo };
  } catch (error: any) {
    if (error.userCancelled) {
      return { success: false, cancelled: true };
    }
    console.error('[RevenueCat] Erreur achat:', error);
    return { success: false, error: error.message };
  }
};

export const restorePurchases = async () => {
  if (__DEV__) {
    console.log('[RevenueCat] Mode DEV — restorePurchases simulé.');
    return { success: false, customerInfo: null };
  }
  try {
    const customerInfo = await Purchases.restorePurchases();
    return { success: true, customerInfo };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

export const checkPremiumStatus = async () => {
  if (__DEV__) {
    console.log('[RevenueCat] Mode DEV — checkPremiumStatus retourne false.');
    return { isPremium: false, customerInfo: null };
  }
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    const isPremium = customerInfo.entitlements.active['premium'] !== undefined;
    return { isPremium, customerInfo };
  } catch (error) {
    console.error('[RevenueCat] Erreur vérification statut:', error);
    return { isPremium: false, customerInfo: null };
  }
};
