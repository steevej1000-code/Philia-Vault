# Philia Vault — Rapport de parité PWA

## Fichiers créés / modifiés dans cette session

| Fichier | Action | Raison |
|---|---|---|
| `app.json` | Modifié | Section `web` PWA ajoutée |
| `services/revenueCatService.web.ts` | Créé | Stub web (évite crash bundling) |
| `services/purchases.web.ts` | Créé | Stub web + routage vers Stripe |
| `services/stripe.ts` | Créé | Service Stripe Checkout + snippet Flask |
| `app/paywall.tsx` | Refait | Design polished, prix dynamiques, web-aware |
| `constants/translations.ts` | Modifié | Clé `paywall.benefit_instant` ajoutée |

---

## Compatibilité web par module

### 🔴 Crashs corrigés

| Module | Problème | Fix appliqué |
|---|---|---|
| `react-native-purchases` | Import natif = crash bundler web | `.web.ts` stub — Metro le choisit automatiquement |
| `react-native-purchases-ui` | Idem | Couvert par le même stub |

### 🟡 Dégradations silencieuses (pas de crash, comportement différent)

| Feature | Sur natif | Sur web | Impact |
|---|---|---|---|
| **Biométrie** (Face ID) | Actif | `hasHardwareAsync()` → `false`, section masquée | Faible — l'utilisateur web ne voit juste pas la section |
| **RevenueCat** | Achats in-app | Remplacé par Stripe Checkout | Zéro — tunnel différent, même résultat |
| **Restore purchases** | RevenueCat API | Email support | Faible — cas rare |
| **KeyboardAvoidingView** (coach input) | Évite clavier | No-op | Faible — le clavier mobile web peut couvrir l'input |

### ✅ Compatibles sans modification

`expo-linear-gradient`, `react-native-svg` (icons), `expo-clipboard`, `expo-auth-session` (Google OAuth), `expo-web-browser`, `react-native-safe-area-context`, `react-native-gesture-handler` v3+, `AsyncStorage` (→ localStorage), `zustand`, `@react-native-community/netinfo`, toutes les Google Fonts, `FlatList`, `ScrollView`, `Animated`.

---

## Build web — instructions

```bash
cd PhiliaVaultApp

# Installer les dépendances si nécessaire
npm install

# Lancer en développement web
npx expo start --web

# Exporter en production (dossier dist/)
npx expo export --platform web

# Déployer sur Vercel (recommandé)
cd dist && npx vercel --prod

# Ou sur Netlify
netlify deploy --prod --dir=dist
```

---

## Stripe — à configurer

### 1. Variables d'environnement (.env.local)
```
EXPO_PUBLIC_PRICE_MONTHLY=$9.99
EXPO_PUBLIC_PRICE_YEARLY=$79.99
EXPO_PUBLIC_PRICE_MONTHLY_EQUIV== $6.67/mo
EXPO_PUBLIC_STRIPE_PRICE_MONTHLY=price_xxx   ← depuis Stripe Dashboard
EXPO_PUBLIC_STRIPE_PRICE_YEARLY=price_xxx    ← depuis Stripe Dashboard
```

### 2. Backend Flask (server.py)
Le snippet complet est dans `services/stripe.ts` (commentaire en bas du fichier).
Endpoints à ajouter :
- `POST /api/stripe/create-checkout-session`
- `POST /api/stripe/webhook`
- `POST /api/stripe/verify-session`

### 3. Stripe Dashboard
- Créer 2 produits : "Philia Vault Monthly" + "Philia Vault Annual"
- Copier les Price IDs dans `.env.local`
- Configurer le webhook vers `https://philia-vault.onrender.com/api/stripe/webhook`
- Événement à écouter : `checkout.session.completed`

### 4. Page de retour Stripe
Créer `app/stripe-success.tsx` qui :
1. Lit `?session_id=` depuis l'URL
2. Appelle `verifyStripeSession(sessionId)` de `services/stripe.ts`
3. Met à jour le store (`setPremium(true)`)
4. Redirige vers `/(tabs)`

---

## "Ajouter à l'écran d'accueil" — checklist

Une fois le build déployé :
- [ ] Chrome Android : ⋮ → "Ajouter à l'écran d'accueil" (déclenché automatiquement si manifest + HTTPS + service worker)
- [ ] Safari iOS : Partager → "Sur l'écran d'accueil"
- [ ] Vérifier que `display: standalone` masque bien la barre d'URL
- [ ] Vérifier `themeColor: #ccff00` dans la barre de status Android

---

## Estimation pour un lancement web propre

| Tâche | Temps estimé |
|---|---|
| Ajouter les 3 endpoints Stripe dans server.py | 2h |
| Créer `app/stripe-success.tsx` | 1h |
| Configurer Stripe Dashboard + webhook | 1h |
| `expo export --platform web` + déploiement Vercel | 30min |
| Test checkout Stripe sur Safari iOS + Chrome Android | 1h |
| **Total** | **~5–6h de dev** |
