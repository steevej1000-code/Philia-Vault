# Philia Vault — Project Handoff for Claude

This document provides all the paths, architecture decisions, and scripts needed to modify the project and deploy updates to both the PWA (web) and the native iOS app.

---

## 📁 PROJECT PATHS

* **Project Root (Backend / Flask & Landing static assets)**:
  `path: /Users/steeve/philia_vault_landing`
* **Mobile / PWA App (React Native Expo)**:
  `path: /Users/steeve/philia_vault_landing/PhiliaVaultApp`
* **Desktop Symlink (outside iCloud sync to prevent build conflicts)**:
  `/Users/steeve/Desktop/philia_vault_landing` -> points to `/Users/steeve/philia_vault_landing`

---

## ⚡ AUTOMATED SYNC & DEPLOY

A shell script has been created to automate PWA web exports, static asset copying, GitHub pushes (triggering Render deploy), and building/installing the native iOS app to the connected iPhone:
👉 **Script Path**: `/Users/steeve/philia_vault_landing/scripts/deploy_sync.sh`

### How to use it:
```bash
# Set execute permissions if needed
chmod +x /Users/steeve/philia_vault_landing/scripts/deploy_sync.sh

# Run the complete synchronized update
/Users/steeve/philia_vault_landing/scripts/deploy_sync.sh
```

---

## 📱 TARGET IOS DEVICE CONFIGURATION

* **Connected Device**: `iPhone Steeve`
* **Target ID**: `00008150-001A74262288401C`
* **DerivedData Path used for clean native builds**: `/tmp/DerivedData`
* **Native Build Commands (run inside PhiliaVaultApp)**:
  ```bash
  # Rebuild native app scheme
  rm -rf /tmp/DerivedData
  xcodebuild -workspace ios/PhiliaVault.xcworkspace \
    -scheme PhiliaVault \
    -configuration Debug \
    -destination id=00008150-001A74262288401C \
    -derivedDataPath /tmp/DerivedData

  # Deploy to iPhone
  npx native-run ios --app /tmp/DerivedData/Build/Products/Debug-iphoneos/PhiliaVault.app --target 00008150-001A74262288401C
  ```

---

## ⚠️ KNOWN BUILD CACHES & ROOT PATH CONFLICTS

* **Stale DerivedData in node_modules**:
  Moving the directory out of iCloud (`/Users/steeve/Desktop` to `/Users/steeve`) caused some `expo-modules-jsi` files to have hardcoded absolute reference path mismatches.
  If swift compile errors occur:
  ```bash
  rm -rf /Users/steeve/philia_vault_landing/PhiliaVaultApp/node_modules/expo-modules-jsi/apple/.DerivedData
  ```

---

## 🛠️ TECH STACK & DESIGN TOKENS

* **Backend**: Flask (`server.py`).
* **Database**: SQLite native operations (`database.py`) — **NO ORM / SQLAlchemy**.
* **Frontend**: Expo React Native (exported to Web PWA in `dist/` and copied to `static/` of landing).
* **Color Accents**: `#CCFF00` (Electric Lime/Green) is the verified green color code for active states, CTA buttons, metrics, and streak cards.
* **Global Skill Location**: `/Users/steeve/.gemini/config/skills/philia-vault-architect/SKILL.md` contains the full rules, mathematical formulas (IIF score, Hemorrhage Rate), and lock definitions.
