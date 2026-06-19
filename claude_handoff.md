# Philia Vault - Project Handoff / Summary

## 📌 Project Context
- **Project Name:** Philia Vault
- **Path:** `PhiliaVaultApp/` (subdirectory of this repo).
- **Stack:** Expo (React Native), TypeScript, RevenueCat (for Premium Subscriptions), Gemini AI (for the Financial Coach).
- **Core Concept:** A financial dashboard and simulator allowing the user to track their Assets (Actifs productifs de cashflow), Liabilities (Passifs), and their Affiliation (Holdings). The tone is highly "clinical" and direct.

## ✨ Recent Work & Architecture

### 1. The Design System (Dribbble-inspired)
- A highly polished Dark Mode UI with vibrant **Lime Green** accents (e.g., `#B5E140`).
- Use of Glassmorphism (blur backgrounds, semi-transparent overlays).
- Specific typography and spacing to maintain a premium, financial-dashboard look.

### 2. Specific Vocabulary ("The Mirror")
- The dashboard is referred to as **"Le Miroir de vos décisions"** (The Mirror of your decisions).
- The simulator is the **"GPS vers la liberté"** (GPS to freedom).
- The affiliation program is referred to as **"Mon Parc"** ou **"Holdings"**.
- All text keys are strictly managed in `constants/translations.ts`. Do not use generic financial terms; stick to the "clinical/philia" terminology defined in the translations file.

### 3. The Coach IA (Gemini)
- **Local Integration:** The Coach now runs directly via the Gemini API using an API key stored locally.
- **Environment Variable:** The key `EXPO_PUBLIC_GEMINI_API_KEY` is securely stored in `.env.local` (not pushed to GitHub).
- **Offline Mode:** The app includes logic to detect network connectivity (`@react-native-community/netinfo`). The Coach is explicitly disabled when offline, while the rest of the dashboard remains lightning-fast using cached data (AsyncStorage).

### 4. Git & File Structure Cleanup
- The single source of truth is `PhiliaVaultApp/` inside this repo.
- The current working state is fully synced and stable.

## 🚀 How to Run the App (for Claude / Agents)
1. Navigate to the correct directory:
   `cd PhiliaVaultApp`
2. Ensure dependencies are up to date:
   `npm install`
3. Start the Expo server (clearing the cache is recommended for fresh starts):
   `npx expo start -c`
4. The user tests the app via **Expo Go** on their iPhone. Whenever a change is made, tell the user to shake their phone and tap "Reload" to fetch the latest bundle.

## ⚠️ Important Rules for Claude
- **Do not modify `services/api.ts` blindly:** It contains the specific Gemini initialization and offline caching logic we just perfected.
- **Always use targeted file edits.**
- **Keep the Tone:** If adding new screens or text, ensure they align with the direct, "red pill", clinical vocabulary defined in `translations.ts`.
