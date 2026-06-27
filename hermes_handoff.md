# Handoff for Hermes — Project Architecture & Status

Welcome to the Philia Vault project! This document outlines everything you need to know about the system, its architecture, rules of engagement, and the recent V1 Launch modifications.

---

## 📁 PROJECT PATHS & DIRECTORIES

* **Project Root (Backend / Flask & Static PWA host)**:
  `path: /Users/steeve/philia_vault_landing`
* **Mobile / PWA App (React Native Expo)**:
  `path: /Users/steeve/philia_vault_landing/PhiliaVaultApp`
* **Desktop Symlink**:
  `/Users/steeve/Desktop/philia_vault_landing 2` -> points to `/Users/steeve/philia_vault_landing`
* **Database File**:
  `/Users/steeve/philia_vault_landing/cashflow.db`

---

## 🎯 PRODUCT VISION & BUSINESS LOGIC

Philia Vault is a financial education SaaS inspired by Robert Kiyosaki's philosophy (Rich Dad Poor Dad, Cashflow Quadrant).
* **Positioning**: "The Ruthless Financial Mirror".
* **Legal Scope**: 100% educational and simulation tool.
* **No Integrations**: Zero bank API connections, zero automated scrapers, zero investment advice. Users log assets and liabilities manually.

---

## 🛠️ TECH STACK

* **Backend**: Flask (`server.py`).
* **Database**: SQLite native operations (`database.py`) — **NO ORM / SQLAlchemy — EVER**.
* **Frontend**: Expo React Native (`PhiliaVaultApp`).
  * Metro builds both the native iOS/Android client and exports the Web PWA inside `dist/`.
  * The compiled PWA is served as static files directly by the Flask server.
* **Hosting**: Render (automated git deployment on the main branch).
* **Connected iPhone Target**: `00008150-001A74262288401C` (iPhone Steeve).

---

## 🎨 DESIGN SYSTEM & TOKENS

The app utilizes a dark premium aesthetic with high visual contrast:
* **Background**: `#000000` (Pure Black)
* **Cards & Containers**: `#1A1A1A`
* **Primary/Streak/Streak Card Accent**: `#CCFF00` (Electric Lime / Neon Green)
* **Negative State (Passives/Hemorrhage)**: `#FF4444` (Electric Red)
* **Warning States**: `#FFA500` (Orange)
* **Main Text**: `#FFFFFF`
* **Subtext / Outlines**: `#888888` / `#2C2C2E`
* **CTA Buttons**: Background `#CCFF00` with text `#000000`

---

## 📊 MATHEMATICAL FORMULAS

Ensure all calculations in Python or TypeScript respect these definitions:

1. **IIF (Independence Index Formula)**:
   $$\text{IIF} = \left(\frac{\text{CASHFLOW\_ACTIFS}}{\text{REVENU\_MENSUEL\_NET}}\right) \times 100$$
   * *Guard*: If net monthly income is 0, IIF is 0.
   * *Threshold*: IIF $\geq 100\%$ indicates the user is out of the Rat Race.

2. **Hemorrhage Rate (Taux d'hémorragie)**:
   $$\text{TAUX\_HEMORRAGIE} = \left(\frac{\text{COUTS\_PASSIFS}}{\text{REVENU\_MENSUEL\_NET}}\right) \times 100$$
   * *0-30%*: Healthy (Green `#CCFF00`)
   * *31-50%*: Attention (Orange `#FFA500`)
   * *51-75%*: Critical (Red `#FF4444`)
   * *75%+*: Emergency (Flashing Red `#FF4444`)

3. **Available Cashflow**:
   $$\text{CASHFLOW\_DISPONIBLE} = \text{REVENU\_MENSUEL\_NET} - \text{COUTS\_PASSIFS} + \text{CASHFLOW\_ACTIFS}$$

4. **Freedom Progression**:
   $$\text{PROGRESSION\_LIBERTE} = \left(\frac{\text{CASHFLOW\_ACTIFS}}{\text{COUTS\_PASSIFS}}\right) \times 100$$
   * *Guard*: If passive costs are 0, progression is $100\%$.

5. **Days of Freedom**:
   $$\text{JOURS\_LIBERTE} = \frac{\text{CASHFLOW\_ACTIFS} \times 12}{\text{DEPENSES\_ANNUELLES} / 365}$$

---

## 🚀 V1 LAUNCH IMPLEMENTATION STATUS

We completed the V1 launch refactoring which aligns web and native capabilities:

### 1. Affiliation UI Removal
* Affiliation is postponed to V2.
* The tab icon 🎁 was hidden from the Tab Bar navigation (`href: null` in `PhiliaVaultApp/app/(tabs)/_layout.tsx`).
* Referral code (`referralCode`) input field, URL auto-fill extraction, and registration param hooks were removed from `login.tsx`.
* **Important**: Do not drop the database tables related to affiliation (e.g. `affiliates`, etc.) in SQLite. They must remain intact for future V2 iterations.

### 2. Payments (Stripe vs RevenueCat)
* **Web (PWA)**: Uses Stripe Checkout.
* **Native (iOS/Android)**: Uses **RevenueCat** SDK.
  * In development (`__DEV__`), the app simulates purchases and returns mock offerings: Monthly ($14.99) and Annual ($149.90) packages.
  * In production, the app calls the configured RevenueCat products.
* **Webhooks**: 
  * Stripe webhooks (`routes/stripe_webhook.py`) handle lifecycle events.
  * RevenueCat webhooks (`/api/webhooks/revenuecat` in `server.py`) handle native iOS/Android transactions.
  * Both webhooks interact directly with the user profile database via `update_user_premium_status(...)` and `update_user_by_stripe_customer(...)`.

### 3. AI Coach Access Protection
* The AI Coach Chat API `/api/coach/chat` is protected by a `@require_auth` decorator.
* It checks the user's `stripe_status` in the SQLite database and returns a `403 Forbidden` response (`{"error": "Accès suspendu"}`) if the status is not `'active'` or `'trialing'`.

---

## ⚡ RECURRING SYNC & DEPLOYMENT SCRIPT

To update both the PWA and native clients concurrently, you must run the following automated script:
```bash
chmod +x /Users/steeve/philia_vault_landing/scripts/deploy_sync.sh
/Users/steeve/philia_vault_landing/scripts/deploy_sync.sh
```

### Script Workflow:
1. Exports the React Native PWA web assets.
2. Copies web assets to the Flask server's `static/` directory.
3. Commits and pushes the static assets to GitHub to trigger the Render web deployment.
4. Cleans Xcode's DerivedData, compiles the iOS project workspace, and deploys it directly to Steeve's connected iPhone.

---

## ⚠️ AGENT CONSTRAINTS & DEVELOPMENT RULES

1. **SQL queries**: Always execute native SQLite transactions inside `database.py`. **Never** introduce or propose SQLAlchemy or any other ORM.
2. **Sync PWA & Natif**: Whenever you modify frontend screens, always run `deploy_sync.sh` so both the PWA on Render and the native app on the iPhone remain in $100\%$ synchronization.
3. **No Pricing changes**: The pricing structure ($14.99/mo, $149.90/yr) is final and locked. Do not reopen pricing reviews.
4. **Meta Ads**: Ads are currently paused. Do not suggest restarting or configuring Meta Ads unless explicitly asked by Steeve.
