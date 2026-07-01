# RevenueCat — Test Complet IAP (iOS + Android)

## Dépendances
- SDK : `react-native-purchases`
- Install : `npx expo install react-native-purchases`

## Variables d'env Render
| Variable | Statut |
|---|---|
| `REVENUECAT_WEBHOOK_SECRET` | ⏳ |
| `REVENUECAT_API_KEY_IOS` | ⏳ |
| `REVENUECAT_API_KEY_ANDROID` | ⏳ |

## Produits IAP
- `philia_vault_monthly_1499` ($14.99/mois)
- `philia_vault_annual_14990` ($149.90/an)

## Entitlement
- `premium` lié aux deux produits

## Endpoint webhook
- `POST /api/webhooks/revenuecat` dans server.py
- Body : `{ event: { type, app_user_id } }`
- Met à jour `stripe_status` en DB

## Étapes
1. Config RevenueCat Dashboard (App iOS + Android liées)
2. App Store Connect produits IAP (sandbox tester)
3. Google Play Console produits abonnements
4. SDK integration (Purchases.configure, getOfferings, purchasePackage)
5. Webhook backend endpoint
6. Test sandbox iOS
7. Test sandbox Android
8. Test renouvellement + annulation

⚠️ Ne pas toucher : Coach AI, My Target, Net Worth, Stripe web (restent séparés)
