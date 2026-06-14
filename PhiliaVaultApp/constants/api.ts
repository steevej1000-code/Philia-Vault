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
  authConfig:     '/api/auth/config',

  // User
  user:           '/api/user',
  premium:        '/api/user/premium',
  profile:        '/api/user/profile',
  settings:       '/api/user/settings',

  // Financial data
  summary:        '/api/summary',
  assets:         '/api/assets',
  liabilities:    '/api/liabilities',
  transactions:   '/api/transactions',
  savingsGoals:   '/api/savings_goals',

  // Affiliation / Revenu Passif
  affiliationStats: '/api/affiliation/stats',

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
