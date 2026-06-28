#!/bin/bash
set -e

# Configuration
PROJECT_DIR="/Users/steeve/philia_vault_landing"
APP_DIR="$PROJECT_DIR/PhiliaVaultApp"
IPHONE_TARGET="00008150-001A74262288401C"
DERIVED_DATA="/tmp/DerivedData"

echo "=================================================="
echo "⚡ Starting Philia Vault Sync Update (PWA + Native)"
echo "=================================================="

# Step 1: Export PWA
echo "🚀 [1/4] Exporting React Native PWA (web assets)..."
cd "$APP_DIR"
npx expo export --platform web

# Step 2: Copy web assets to static/
echo "📁 [2/4] Copying web assets to landing static directory..."
# Clear only app directories and files, leaving others untouched if needed, or clear all app-generated files
# We can do a clean copy of the build assets
rm -rf "$PROJECT_DIR/static/"*
cp -R dist/* "$PROJECT_DIR/static/"

# Step 3: Git Push to trigger Render deploy
echo "📤 [3/4] Committing and pushing web assets to GitHub..."
cd "$PROJECT_DIR"
git add static/
git commit -m "build: sync update static web assets" || echo "No changes to commit"
git push origin main || echo "Git push skipped or failed"

# Step 4: Rebuild and deploy native app
echo "📱 [4/4] Cleaning, compiling, and deploying iOS Native App to iPhone..."
rm -rf "$DERIVED_DATA"
cd "$APP_DIR"
xcodebuild -workspace ios/PhiliaVault.xcworkspace \
  -scheme PhiliaVault \
  -configuration Debug \
  -destination id="$IPHONE_TARGET" \
  -derivedDataPath "$DERIVED_DATA" \
  -allowProvisioningUpdates

echo "📲 Installing app on iPhone ($IPHONE_TARGET)..."
npx native-run ios --app "$DERIVED_DATA/Build/Products/Debug-iphoneos/PhiliaVault.app" --target "$IPHONE_TARGET"

echo "=================================================="
echo "✅ Philia Vault Sync Update Completed Successfully!"
echo "=================================================="
