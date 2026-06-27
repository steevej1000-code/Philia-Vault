import { Platform } from 'react-native';

// Change to your computer's local IP for real device testing
// For iOS Simulator: localhost works
// For Android Emulator: use 10.0.2.2
// For real phone: use your Mac's IP (e.g., 192.168.1.x)
const getBaseUrl = () => {
  return 'https://philia-vault.onrender.com';
};

export const API_BASE = getBaseUrl();

// Real Flask backend endpoints
export const ENDPOINTS = {
  // Auth
  login:          '/api/auth/login',
  register:       '/api/auth/register',
  googleAuth:     '/api/auth/google',
  appleAuth:      '/api/auth/apple',
  authConfig:     '/api/auth/config',
  forgotPassword: '/api/auth/forgot-password',
  resetPassword:  '/api/auth/reset-password',
  changePassword: '/api/auth/change-password',

  // User
  user:           '/api/user',
  premium:        '/api/user/premium',
  cancelSubscription: '/api/subscription/cancel',
  reactivateSubscription: '/api/subscription/reactivate',
  subscriptionStatus: '/api/subscription/status',
  profile:        '/api/user/profile',
  preferences:    '/api/profile/preferences',
  settings:       '/api/user/settings',

  // Financial data
  summary:        '/api/summary',
  assets:         '/api/assets',
  liabilities:    '/api/liabilities',
  transactions:   '/api/transactions',
  savingsGoals:   '/api/savings_goals',

  // Affiliation / Revenu Passif
  affiliationStats: '/api/affiliation/stats',
  affiliateNetwork: '/api/affiliate/network',
  affiliateOnboard: '/api/affiliate/onboard',
  affiliateOnboardStatus: '/api/affiliate/onboard/status',

  // Coach & Payments
  chat:           '/api/coach/chat',
  // Note: RevenueCat purchases are handled client-side via react-native-purchases.
  // This backend webhook (already present server-side) receives RevenueCat
  // events to keep premium_status in sync server-side.
  revenueCat:     '/api/webhooks/revenuecat',
};

// Google OAuth Web Client ID (for expo-auth-session)
// This is the WEB client ID from Google Console (not iOS/Android)
export const GOOGLE_WEB_CLIENT_ID = '179843169337-kod2rt6ab6fon6sc2h7p1hrcqq7pp03q.apps.googleusercontent.com';
// iOS Client ID — créé dans Google Cloud Console (type: iOS)
// Bundle ID: com.philia.vault
// TODO: Remplacer par le vrai Client ID iOS après création
export const GOOGLE_IOS_CLIENT_ID = '179843169337-kod2rt6ab6fon6sc2h7p1hrcqq7pp03q.apps.googleusercontent.com';
