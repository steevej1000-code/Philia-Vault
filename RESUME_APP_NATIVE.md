# Philia Vault — App Native (iOS + Android) — Résumé Claude

## 📱 Stack
- **Framework :** React Native Expo (SDK ~56.0.11)
- **Code source :** `/Users/steeve/philia_vault_landing/PhiliaVaultApp/`
- **Dossier Android :** `PhiliaVaultApp/android/`
- **Dossier iOS :** `PhiliaVaultApp/ios/`
- **Compte Expo :** `steevej12`
- **GitHub :** `steevej1000-code/Philia-Vault`
- **iPhone ID :** `00008150-001A74262288401C`

## ✅ Déjà fait

### Builds
- **iOS :** ✅ Build OK via `deploy_sync.sh` — app installée sur iPhone
- **Android :** ✅ APK debug (247MB) buildé — crash Multidex fixé
  - Fix : `multiDexEnabled true` + `MainApplication extends MultiDexApplication`
  - Fix : `expo-clipboard` downgradé 8.0.8 → 56.0.4 (incompatible SDK)
- **Émulateur Android :** Pixel 6 API 33 créé, app tourne sans crash

### Google OAuth
- Configuré Web + iOS + Android
- Client IDs dans `PhiliaVaultApp/constants/api.ts`

### Push Notifications (PWA)
- Backend prêt, VAPID keys sur Render, 3 crons actifs
- **App native :** PAS ENCORE — le hook `usePushNotifications` est mocké
  (fichier : `PhiliaVaultApp/hooks/usePushNotifications.ts`)

## 🔧 Configuration iOS (Xcode)

Commandes de build :
```bash
cd PhiliaVaultApp
npx expo run:ios
```

Pour le déploiement iPhone (via deploy_sync.sh) :
```bash
./deploy_sync.sh
```

## 🔧 Configuration Android

Build APK debug :
```bash
cd PhiliaVaultApp
npx expo run:android --variant debug
```

Build APK release :
```bash
cd PhiliaVaultApp
npx expo run:android --variant release
```

### Versions Android
- Java 17 (`/opt/homebrew/opt/openjdk@17`)
- Gradle 8.13
- SDK : Android 13 (API 33), émulateur arm64-v8a

## ⚠️ Bugs connus

### Android
- ~~Crash au lancement~~ ✅ **FIXED** — Multidex + expo-clipboard version
- ~~Vision Claude pas dispo~~ Toujours pas résolu (Anthropic key format)

### iOS
- Provisioning profile expire → rebuild via `deploy_sync.sh`

## 🚧 À faire tracking (session en cours)

### PWA (app.philiavault.com)
- [ ] GA4 Measurement ID
- [ ] Meta Pixel ID
- [ ] TikTok Pixel ID
- [ ] Scripts tracking dans `index.html`

### App Native (iOS/Android)
- [ ] Firebase Analytics (GA4) uniquement — pas de Meta/TikTok natif
- [ ] `@react-native-firebase/app` + `@react-native-firebase/analytics`
- [ ] `google-services.json` (Android) + `GoogleService-Info.plist` (iOS)
- [ ] Événements : `login_success`, `holdings_viewed`, `app_opened`
- [ ] Zéro popup ATT

### CGU natives
- [ ] Conditions générales dans l'app native

## 📁 Structure clé

```
PhiliaVaultApp/
├── app/
│   ├── (tabs)/
│   │   ├── assets.tsx          # ✅ Marché live toggle implémenté
│   │   ├── liabilities.tsx     # ✅ Fixe/Ponctuel toggle implémenté
│   │   └── ...
│   └── _layout.tsx
├── services/
│   └── api.ts                  # API client avec fetchPrice()
├── hooks/
│   └── usePushNotifications.ts # ⚠️ MOCKÉ — pas de vraies pushes natives
├── constants/
│   └── api.ts                  # API_BASE = https://philia-vault.onrender.com
├── android/                    # Build Android
├── ios/                        # Build iOS
└── package.json
```

## 🌐 Backend (Flask — Render)

- **URL :** `https://philia-vault.onrender.com`
- **Fichiers :** `server.py` + `database.py` (dossier racine)
- **Déploiement :** Push GitHub → Manual Deploy sur Render Dashboard
- **Nouveaux endpoints :**
  - `POST /api/assets/fetch-price` → marché live (BTC, AAPL, XAU…)
  - `POST /api/cron/update-market-prices` → mise à jour prix (toutes les 6h)
- **Exemple :**
  ```bash
  curl -X POST https://philia-vault.onrender.com/api/assets/fetch-price \
    -H "Content-Type: application/json" \
    -H "X-User-Email: steevejeune162@gmail.com" \
    -d '{"symbol":"BTC","market_type":"crypto"}'
  # → {"price":58567,"symbol":"BTC"}
  ```

### Variables d'env Render
| Variable | Valeur | Statut |
|---|---|---|
| `ALPHA_VANTAGE_API_KEY` | `51ZIXOTYVMFHD5MI` | ✅ Ajoutée |
| `METALS_API_KEY` | — | ❌ Pas besoin (CoinGecko fait métaux) |
| `GA4_MEASUREMENT_ID` | — | ⏳ À créer |
| `META_PIXEL_ID` | — | ⏳ À créer |
| `TIKTOK_PIXEL_ID` | — | ⏳ À créer |
