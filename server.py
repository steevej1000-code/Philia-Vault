import os
from flask import Flask, request, jsonify, send_from_directory, redirect
import database
import json
from dotenv import load_dotenv

from flask_cors import CORS

load_dotenv()

# --- Vérification des variables d'environnement critiques ---
# ENCRYPTION_KEY est accepté en alias de DB_ENCRYPTION_KEY (nom historique
# utilisé par database.py) : l'un des deux doit être présent.
REQUIRED_ENV_VARS = ["GEMINI_API_KEY", "SECRET_KEY"]
_missing = [v for v in REQUIRED_ENV_VARS if not os.environ.get(v)]
if not os.environ.get("DB_ENCRYPTION_KEY") and not os.environ.get("ENCRYPTION_KEY"):
    _missing.append("DB_ENCRYPTION_KEY (ou ENCRYPTION_KEY)")
if _missing:
    raise EnvironmentError(
        f"Variables d'environnement manquantes : {', '.join(_missing)}. "
        f"Vérifiez votre fichier .env (voir .env.example)."
    )

from routes.stripe_webhook import stripe_webhook_bp
from routes.admin_routes import admin_bp

app = Flask(__name__, static_folder="static")
app.secret_key = os.environ.get("SECRET_KEY")

# Register Blueprints
app.register_blueprint(stripe_webhook_bp)
app.register_blueprint(admin_bp, url_prefix="/api/admin")

@app.before_request
def skip_json_parsing_for_webhook():
    if request.path == '/api/webhooks/stripe':
        return  # Laisse le raw body intact

allowed_origins = [
    os.environ.get('ALLOWED_ORIGIN', 'https://philiavault.com'),
    'https://www.philiavault.com',
    'http://localhost:3000',
    'http://localhost:5000',
    'http://localhost:5001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5000',
    'http://127.0.0.1:5001',
    'http://localhost:8081',
    'http://localhost:5173'
]
CORS(app, 
     origins=allowed_origins,
     allow_headers=["Content-Type", "X-User-Email", "Authorization"],
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
     supports_credentials=False)

@app.before_request
def redirect_www():
    # Only redirect in production environments
    if os.environ.get('FLASK_ENV') == 'production' and request.host.startswith('www.'):
        return redirect(
            request.url.replace('www.', '', 1),
            code=301
        )

# Initialize DB on load
database.init_db()

# Gemini Config
GEMINI_KEY = os.environ.get("GEMINI_API_KEY")
gemini_model = None
if GEMINI_KEY:
    try:
        import google.generativeai as genai
        genai.configure(api_key=GEMINI_KEY)
        gemini_model = genai.GenerativeModel('gemini-2.5-flash')
    except Exception as e:
        print(f"Error configuring Gemini: {e}")

# Static Routes
@app.route("/")
def serve_index():
    # If the file landing.html doesn't exist yet, fallback to index.html gracefully
    if os.path.exists(os.path.join("static", "landing.html")):
        return send_from_directory("static", "landing.html")
    return send_from_directory("static", "index.html")

@app.route("/app")
def serve_app():
    return send_from_directory("static", "index.html")

@app.route("/static/<path:path>")
def serve_static(path):
    return send_from_directory("static", path)

# User Session / Auth Helper to get current user_id
# For maximum robustness in this single-page client, we accept a X-User-Email header or user parameter.
# We also support a fallback mock if not supplied to keep local verification scripts working smoothly.
def get_current_user_id():
    # Attempt to extract user email from headers or parameters
    user_id = request.headers.get("X-User-Email") or request.args.get("user_id")
    if not user_id:
        # Check request json body if applicable
        if request.is_json:
            try:
                user_id = request.json.get("user_id")
            except Exception:
                pass
    return user_id or "alex@philiavault.com" # fallback default to prevent crash, but front-end will send X-User-Email

# Google Auth Verification helper
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")

# Apple Sign In verification helper
import jwt as pyjwt
from jwt import PyJWKClient

APPLE_CLIENT_ID = os.environ.get("APPLE_CLIENT_ID")
APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"

@app.route("/api/auth/config", methods=["GET"])
def auth_config():
    return jsonify({
        "google_client_id": GOOGLE_CLIENT_ID
    })

@app.route("/api/auth/google", methods=["POST"])
def auth_google():
    data = request.json or {}
    token = data.get("id_token")
    if not token:
        return jsonify({"success": False, "error": "Token d'identification Google manquant"}), 400
        
    try:
        # If GOOGLE_CLIENT_ID is set, verify; otherwise mock validation for test mode
        if GOOGLE_CLIENT_ID:
            idinfo = id_token.verify_oauth2_token(token, google_requests.Request(), GOOGLE_CLIENT_ID)
            email = idinfo['email']
            google_id = idinfo['sub']
        else:
            # Local dev fallback verification if no client ID is configured
            import base64
            # Mock parse token if it looks like JWT
            email = "alex@philiavault.com"
            google_id = "mock_google_id_123"
            if "." in token:
                try:
                    payload = token.split(".")[1]
                    # Add padding
                    payload += "=" * ((4 - len(payload) % 4) % 4)
                    decoded = json.loads(base64.b64decode(payload).decode('utf-8'))
                    email = decoded.get("email", email)
                    google_id = decoded.get("sub", google_id)
                except Exception:
                    pass
                    
        user_email = database.create_or_get_google_user(email, google_id)
        return jsonify({"success": True, "user": {"email": user_email}, "message": "Connexion Google réussie"})
    except Exception as e:
        return jsonify({"success": False, "error": f"Échec de validation Google: {str(e)}"}), 401

@app.route("/api/auth/apple", methods=["POST"])
def auth_apple():
    data = request.json or {}
    token = data.get("id_token")
    if not token:
        return jsonify({"success": False, "error": "Token d'identification Apple manquant"}), 400

    try:
        if APPLE_CLIENT_ID:
            jwk_client = PyJWKClient(APPLE_JWKS_URL)
            signing_key = jwk_client.get_signing_key_from_jwt(token)
            idinfo = pyjwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                audience=APPLE_CLIENT_ID,
                issuer="https://appleid.apple.com",
            )
            email = idinfo.get("email", "")
            apple_id = idinfo["sub"]
        else:
            # Local dev fallback: decode without signature verification
            idinfo = pyjwt.decode(token, options={"verify_signature": False})
            email = idinfo.get("email", "")
            apple_id = idinfo.get("sub", "mock_apple_id_123")

        # Apple may not resend the email on repeat sign-ins; the client should
        # cache it from the first response and resend it as a fallback.
        email = email or data.get("email", "")
        user_email = database.create_or_get_apple_user(email, apple_id)
        if not user_email:
            return jsonify({"success": False, "error": "Compte Apple introuvable, veuillez réessayer la connexion"}), 401
        return jsonify({"success": True, "user": {"email": user_email}, "message": "Connexion Apple réussie"})
    except Exception as e:
        return jsonify({"success": False, "error": f"Échec de validation Apple: {str(e)}"}), 401

# User Authentication endpoints
@app.route("/api/auth/register", methods=["POST"])
def auth_register():
    data = request.json or {}
    email = data.get("email")
    password = data.get("password")
    first_name = data.get("first_name", "")
    last_name = data.get("last_name", "")
    referral_code = data.get("referral_code")
    if not email or not password:
        return jsonify({"success": False, "error": "Email et mot de passe requis"}), 400
    
    success = database.create_user(email, password, first_name, last_name, referral_code)
    if success:
        return jsonify({"success": True, "message": "Compte créé avec succès"})
    else:
        return jsonify({"success": False, "error": "Cet email est déjà utilisé"}), 400

@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    data = request.json or {}
    email = data.get("email")
    password = data.get("password")
    if not email or not password:
        return jsonify({"success": False, "error": "Email et mot de passe requis"}), 400
        
    user = database.verify_user(email, password)
    if user:
        # Seed default data if they login and somehow have no items
        database.seed_user_data(user["email"])
        return jsonify({"success": True, "user": {"email": user["email"]}, "message": "Connexion réussie"})
    else:
        return jsonify({"success": False, "error": "Email ou mot de passe incorrect"}), 401

@app.route("/api/auth/forgot-password", methods=["POST"])
def auth_forgot_password():
    data = request.json or {}
    email = data.get("email")
    language = data.get("language", "en")
    if not email:
        return jsonify({"success": False, "error": "Email requis"}), 400

    code = database.create_password_reset_code(email)
    if code:
        from services.email_service import send_password_reset_email
        send_password_reset_email(email.lower().strip(), code, language)
    # Always return success to avoid leaking whether an email is registered
    return jsonify({"success": True, "message": "Si ce compte existe, un code a été envoyé par email"})

@app.route("/api/auth/reset-password", methods=["POST"])
def auth_reset_password():
    data = request.json or {}
    email = data.get("email")
    code = data.get("code")
    new_password = data.get("new_password")
    if not email or not code or not new_password:
        return jsonify({"success": False, "error": "Email, code et nouveau mot de passe requis"}), 400

    success, error = database.reset_password_with_code(email, code, new_password)
    if success:
        return jsonify({"success": True, "message": "Mot de passe réinitialisé avec succès"})
    error_messages = {
        "invalid_code": "Code invalide",
        "code_expired": "Ce code a expiré, veuillez en demander un nouveau",
    }
    return jsonify({"success": False, "error": error_messages.get(error, "Échec de la réinitialisation")}), 400

@app.route("/api/auth/change-password", methods=["POST"])
def auth_change_password():
    data = request.json or {}
    current_password = data.get("current_password")
    new_password = data.get("new_password")
    if not current_password or not new_password:
        return jsonify({"success": False, "error": "Mot de passe actuel et nouveau mot de passe requis"}), 400

    email = get_current_user_id()
    success, error = database.change_password(email, current_password, new_password)
    if success:
        return jsonify({"success": True, "message": "Mot de passe modifié avec succès"})
    error_messages = {
        "user_not_found": "Utilisateur introuvable",
        "invalid_current_password": "Mot de passe actuel incorrect",
    }
    return jsonify({"success": False, "error": error_messages.get(error, "Échec de la modification")}), 400

# API Summary
def calculate_corrected_fi_indices(active_cashflow_m, fixed_expenses_m):
    # Sécurité anti-division par zéro si les dépenses sont nulles
    if fixed_expenses_m == 0:
        return 0, 0, 0 # Indice 0%, Timeline 0, Gain 0

    # Nouvelle Formule de l'Indice FI Standardisé
    # (Revenus - Dépenses) / |Dépenses|
    normalized_index = (active_cashflow_m - fixed_expenses_m) / abs(fixed_expenses_m)

    # Convertir en pourcentage (e.g., -1.0 -> -100%)
    indice_percent = round(normalized_index * 100, 2)

    # Appliquer le plancher logique de l'utilisateur : L'indice ne peut pas descendre en dessous de -100%
    if indice_percent <= -100:
        indice_percent = -100

    # ----------------------------------------------------
    # CORRECTION DE LA LOGIQUE TIMELINE
    # ----------------------------------------------------
    if indice_percent <= 0:
        timeline_years = 0 # Timeline fixé à 0 tant que le flux n'est pas inversé
    else:
        # L'ancienne logique de projection (à adapter selon votre méthode préférée)
        # e.g., timeline = (Dépenses / Gains) -> exemple simplifié
        timeline_years = round(fixed_expenses_m / (active_cashflow_m - fixed_expenses_m), 1)

    return indice_percent, timeline_years, active_cashflow_m

# API Summary
@app.route("/api/summary", methods=["GET"])
def get_summary():
    try:
        user_id = get_current_user_id()
        assets = database.get_assets(user_id)
        liabilities = database.get_liabilities(user_id)
        
        total_assets_val = sum(a["value"] for a in assets)
        total_passive_income = sum(a["monthly_yield"] for a in assets)
        
        total_liabilities_val = sum(l["remaining_amount"] for l in liabilities)
        total_monthly_cost = sum(l["monthly_cost"] for l in liabilities)
        
        # Calculate standardized index and timeline
        iif_score, timeline_years, _ = calculate_corrected_fi_indices(total_passive_income, total_monthly_cost)
            
        net_cashflow = total_passive_income - total_monthly_cost
        
        # Calculate percentages for categories for flow engine
        # Group by types
        asset_types = {}
        for a in assets:
            asset_types[a["type"]] = asset_types.get(a["type"], 0) + a["value"]
            
        liability_types = {}
        for l in liabilities:
            liability_types[l["type"]] = liability_types.get(l["type"], 0) + l["remaining_amount"]
            
        return jsonify({
            "success": True,
            "total_assets": total_assets_val,
            "total_passive_income": total_passive_income,
            "total_liabilities": total_liabilities_val,
            "total_monthly_cost": total_monthly_cost,
            "iif_score": iif_score,
            "timeline": timeline_years,
            "net_cashflow": net_cashflow,
            "asset_types": asset_types,
            "liability_types": liability_types
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# Assets API
@app.route("/api/assets", methods=["GET", "POST"])
def manage_assets():
    user_id = get_current_user_id()
    if request.method == "GET":
        return jsonify({"success": True, "assets": database.get_assets(user_id)})
    
    data = request.json
    if not data or "name" not in data or "type" not in data or "value" not in data or "monthly_yield" not in data:
        return jsonify({"success": False, "error": "Missing parameters"}), 400
    
    try:
        database.add_asset(user_id, data["name"], data["type"], float(data["value"]), float(data["monthly_yield"]))
        return jsonify({"success": True, "message": "Asset added successfully"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/assets/<int:asset_id>", methods=["PUT", "DELETE"])
def update_delete_asset(asset_id):
    user_id = get_current_user_id()
    if request.method == "DELETE":
        try:
            database.delete_asset(user_id, asset_id)
            return jsonify({"success": True, "message": "Asset deleted successfully"})
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500
            
    data = request.json
    try:
        database.update_asset(user_id, asset_id, data["name"], data["type"], float(data["value"]), float(data["monthly_yield"]))
        return jsonify({"success": True, "message": "Asset updated successfully"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# Liabilities API
@app.route("/api/liabilities", methods=["GET", "POST"])
def manage_liabilities():
    user_id = get_current_user_id()
    if request.method == "GET":
        return jsonify({"success": True, "liabilities": database.get_liabilities(user_id)})
    
    data = request.json
    if not data or "name" not in data or "type" not in data or "total_amount" not in data or "remaining_amount" not in data or "monthly_cost" not in data:
        return jsonify({"success": False, "error": "Missing parameters"}), 400
        
    try:
        database.add_liability(user_id, data["name"], data["type"], float(data["total_amount"]), float(data["remaining_amount"]), float(data["monthly_cost"]))
        return jsonify({"success": True, "message": "Liability added successfully"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/liabilities/<int:lib_id>", methods=["PUT", "DELETE"])
def update_delete_liability(lib_id):
    user_id = get_current_user_id()
    if request.method == "DELETE":
        try:
            database.delete_liability(user_id, lib_id)
            return jsonify({"success": True, "message": "Liability deleted successfully"})
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500
            
    data = request.json
    try:
        database.update_liability(user_id, lib_id, data["name"], data["type"], float(data["total_amount"]), float(data["remaining_amount"]), float(data["monthly_cost"]))
        return jsonify({"success": True, "message": "Liability updated successfully"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# Transactions API
@app.route("/api/transactions", methods=["GET", "POST"])
def manage_transactions():
    user_id = get_current_user_id()
    if request.method == "GET":
        return jsonify({"success": True, "transactions": database.get_transactions(user_id)})
    
    data = request.json
    try:
        database.add_transaction(user_id, data["description"], data["type"], float(data["amount"]), data["date"])
        return jsonify({"success": True, "message": "Transaction added successfully"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# Webhooks Endpoints
@app.route("/api/webhooks/shopify", methods=["POST"])
def webhook_shopify():
    user_id = get_current_user_id()
    data = request.json
    if not data or "store_name" not in data or "monthly_profit" not in data or "value" not in data:
        return jsonify({"success": False, "error": "Invalid payload"}), 400
    
    try:
        # Check if Shopify store already exists in assets
        assets = database.get_assets(user_id)
        store_asset = None
        for a in assets:
            if a["type"] == "Commerce" and data["store_name"] in a["name"]:
                store_asset = a
                break
                
        if store_asset:
            database.update_asset(user_id, store_asset["id"], store_asset["name"], "Commerce", float(data["value"]), float(data["monthly_profit"]))
            action = "updated"
        else:
            database.add_asset(user_id, f"Shopify Store - {data['store_name']}", "Commerce", float(data["value"]), float(data["monthly_profit"]))
            action = "created"
            
        # Add notification transaction
        database.add_transaction(user_id, f"Webhook Update: Shopify Store '{data['store_name']}' synced", "asset_yield", float(data["monthly_profit"]), "Today")
        
        return jsonify({"success": True, "action": action, "message": f"Shopify asset {action} successfully"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/webhooks/tiktok", methods=["POST"])
def webhook_tiktok():
    user_id = get_current_user_id()
    data = request.json
    if not data or "store_name" not in data or "monthly_profit" not in data or "value" not in data:
        return jsonify({"success": False, "error": "Invalid payload"}), 400
    
    try:
        # Check if TikTok Shop already exists in assets
        assets = database.get_assets(user_id)
        store_asset = None
        for a in assets:
            if a["type"] == "Commerce" and data["store_name"] in a["name"]:
                store_asset = a
                break
                
        if store_asset:
            database.update_asset(user_id, store_asset["id"], store_asset["name"], "Commerce", float(data["value"]), float(data["monthly_profit"]))
            action = "updated"
        else:
            database.add_asset(user_id, f"TikTok Shop - {data['store_name']}", "Commerce", float(data["value"]), float(data["monthly_profit"]))
            action = "created"
            
        # Add notification transaction
        database.add_transaction(user_id, f"Webhook Update: TikTok Shop '{data['store_name']}' synced", "asset_yield", float(data["monthly_profit"]), "Today")
        
        return jsonify({"success": True, "action": action, "message": f"TikTok Shop asset {action} successfully"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# User profile and Premium status endpoints
@app.route("/api/user", methods=["GET"])
def get_user():
    user_id = get_current_user_id()
    try:
        profile = database.get_user_profile(user_id)
        if not profile:
            # Automatically create profile for user if it doesn't exist
            database.seed_user_data(user_id)
            # Fetch profile again
            profile = database.get_user_profile(user_id)
        return jsonify({"success": True, "user": profile})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/user/premium", methods=["POST"])
def toggle_user_premium():
    user_id = get_current_user_id()
    data = request.json or {}
    status = data.get("premium_status", 0)
    try:
        database.set_premium_status(user_id, status)
        return jsonify({"success": True, "message": f"Premium status updated to {status}"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/user/profile", methods=["POST"])
def update_profile():
    user_id = get_current_user_id()
    data = request.json or {}
    first_name = data.get("first_name", "")
    last_name = data.get("last_name", "")
    custom_categories = data.get("custom_categories", "")
    avatar = data.get("avatar")
    try:
        database.update_user_profile(user_id, first_name, last_name, custom_categories, avatar)
        return jsonify({"success": True, "message": "Profile mis à jour avec succès"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/user/settings", methods=["GET", "POST", "PUT"])
def manage_settings():
    user_id = get_current_user_id()
    if request.method == "GET":
        try:
            settings = database.get_user_settings(user_id)
            return jsonify({"success": True, "settings": settings})
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500

    data = request.json or {}
    currency = data.get("currency")
    notifications_enabled = data.get("notifications_enabled")
    if currency is None and notifications_enabled is None:
        return jsonify({"success": False, "error": "Aucun paramètre fourni"}), 400
    try:
        database.update_user_settings(user_id, currency=currency, notifications_enabled=notifications_enabled)
        settings = database.get_user_settings(user_id)
        return jsonify({"success": True, "message": "Paramètres mis à jour avec succès", "settings": settings})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/profile/preferences", methods=["GET", "PUT"])
def manage_preferences():
    user_id = get_current_user_id()
    if request.method == "GET":
        try:
            prefs = database.get_user_preferences(user_id)
            return jsonify({"success": True, "preferences": prefs})
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500

    data = request.json or {}
    language = data.get("language")
    currency = data.get("currency")
    currency_symbol = data.get("currency_symbol")
    if language is None and currency is None and currency_symbol is None:
        return jsonify({"success": False, "error": "Aucun parametre fourni"}), 400
    try:
        database.update_user_preferences(user_id, language=language, currency=currency, currency_symbol=currency_symbol)
        prefs = database.get_user_preferences(user_id)
        return jsonify({"success": True, "message": "Preferences mises a jour avec succes", "preferences": prefs})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/affiliation/stats", methods=["GET"])
def affiliation_stats():
    user_id = get_current_user_id()
    try:
        stats = database.get_affiliation_stats(user_id)
        return jsonify({"success": True, **stats})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/savings_goals", methods=["GET", "POST"])
def manage_savings_goals():
    user_id = get_current_user_id()
    if request.method == "GET":
        try:
            return jsonify({"success": True, "savings_goals": database.get_savings_goals(user_id)})
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500
            
    data = request.json or {}
    name = data.get("name")
    target_amount = data.get("target_amount")
    current_amount = data.get("current_amount", 0.0)
    target_date = data.get("target_date", "")
    
    if not name or target_amount is None:
        return jsonify({"success": False, "error": "Paramètres requis manquants"}), 400
        
    try:
        database.add_savings_goal(user_id, name, float(target_amount), float(current_amount), target_date)
        return jsonify({"success": True, "message": "Objectif d'épargne ajouté avec succès"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/savings_goals/<int:goal_id>", methods=["PUT", "DELETE"])
def update_delete_savings_goal(goal_id):
    user_id = get_current_user_id()
    if request.method == "DELETE":
        try:
            database.delete_savings_goal(user_id, goal_id)
            return jsonify({"success": True, "message": "Objectif d'épargne supprimé avec succès"})
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500
            
    data = request.json or {}
    name = data.get("name")
    target_amount = data.get("target_amount")
    current_amount = data.get("current_amount")
    target_date = data.get("target_date")
    
    try:
        database.update_savings_goal(user_id, goal_id, name, float(target_amount), float(current_amount), target_date)
        return jsonify({"success": True, "message": "Objectif d'épargne mis à jour avec succès"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# Stripe Payments Configuration
import stripe
STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY")
stripe.api_key = STRIPE_SECRET_KEY

# Stripe Checkout / Portal Endpoints
@app.route("/api/stripe/create-checkout-session", methods=["POST"])
def stripe_checkout():
    user_id = get_current_user_id()
    data = request.json or {}
    plan_type = data.get("plan", "monthly") # monthly or annual
    
    # Define prices or fallback mock mode
    price_amount = 999 if plan_type == "monthly" else 7999
    price_name = "Philia Vault Premium Monthly" if plan_type == "monthly" else "Philia Vault Premium Annual"
    interval = "month" if plan_type == "monthly" else "year"
    
    # Domain url
    domain_url = request.host_url.rstrip('/')
    
    try:
        profile = database.get_user_profile(user_id)
        customer_id = profile.get("stripe_customer_id") if profile else None
        
        # In real test, if STRIPE_SECRET_KEY is defined:
        if STRIPE_SECRET_KEY:
            if not customer_id:
                customer = stripe.Customer.create(
                    email=user_id,
                    metadata={"user_id": user_id}
                )
                customer_id = customer.id
                database.set_premium_status(user_id, profile.get("premium_status", 0), stripe_customer_id=customer_id)
            
            # Create price on the fly for testing
            price = stripe.Price.create(
                unit_amount=price_amount,
                currency="eur",
                recurring={"interval": interval},
                product_data={"name": price_name},
            )
            
            session = stripe.checkout.Session.create(
                customer=customer_id,
                payment_method_types=['card'],
                line_items=[{
                    'price': price.id,
                    'quantity': 1,
                }],
                mode='subscription',
                success_url=domain_url + "/?stripe_session=success",
                cancel_url=domain_url + "/?stripe_session=cancel",
            )
            return jsonify({"success": True, "url": session.url})
        else:
            # Mock redirect for developer local testing
            database.set_premium_status(user_id, 1)
            return jsonify({"success": True, "url": domain_url + "/?stripe_session=success_mock"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/stripe/create-portal-session", methods=["POST"])
def stripe_portal():
    user_id = get_current_user_id()
    domain_url = request.host_url.rstrip('/')
    try:
        profile = database.get_user_profile(user_id)
        customer_id = profile.get("stripe_customer_id") if profile else None
        
        if STRIPE_SECRET_KEY and customer_id:
            session = stripe.billing_portal.Session.create(
                customer=customer_id,
                return_url=domain_url,
            )
            return jsonify({"success": True, "url": session.url})
        else:
            # Mock portal response for offline testing
            return jsonify({"success": True, "url": domain_url + "/?stripe_portal=mock_cancel"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# Webhook Stripe
@app.route("/api/webhook/stripe", methods=["POST"])
def webhook_stripe():
    payload = request.data
    sig_header = request.headers.get('STRIPE_SIGNATURE')
    endpoint_secret = os.environ.get("STRIPE_WEBHOOK_SECRET")
    
    event = None
    try:
        if STRIPE_SECRET_KEY and sig_header and endpoint_secret:
            event = stripe.Webhook.construct_event(
                payload, sig_header, endpoint_secret
            )
        else:
            # Parse directly if local test run
            event = json.loads(payload)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400
        
    event_type = event.get("type")
    event_data = event.get("data", {}).get("object", {})
    
    # Handle subscription creation, updating, or cancellation
    if event_type in ["customer.subscription.created", "customer.subscription.updated"]:
        customer_id = event_data.get("customer")
        status = event_data.get("status")
        
        user = database.get_user_by_stripe_customer_id(customer_id)
        if user:
            # active/trialing implies active premium status
            premium = 1 if status in ["active", "trialing"] else 0
            database.set_premium_status(user["email"], premium, stripe_customer_id=customer_id)
            if premium:
                database.add_transaction(user["email"], f"Abonnement Stripe activé ({status})", "asset_yield", 0.0, "Today")
                
    elif event_type == "customer.subscription.deleted":
        customer_id = event_data.get("customer")
        user = database.get_user_by_stripe_customer_id(customer_id)
        if user:
            database.set_premium_status(user["email"], 0, stripe_customer_id=customer_id)
            database.add_transaction(user["email"], "Abonnement Stripe résilié", "liability_payment", 0.0, "Today")
            
    return jsonify({"success": True})

# RevenueCat Webhook Endpoint
@app.route("/api/webhooks/revenuecat", methods=["POST"])
def webhook_revenuecat():
    data = request.json or {}
    event = data.get("event", {})
    event_type = event.get("type")
    app_user_id = event.get("app_user_id")
    
    if not event_type or not app_user_id:
        return jsonify({"success": False, "error": "Invalid event data"}), 400
        
    try:
        if event_type in ["INITIAL_PURCHASE", "RENEWAL", "SUBSCRIBE"]:
            # Set user premium
            database.set_premium_status(app_user_id, 1)
            database.add_transaction(app_user_id, f"Abonnement Premium activé via RevenueCat", "asset_yield", 0.0, "Today")
        elif event_type in ["CANCELLATION", "EXPIRATION"]:
            # Cancel user premium
            database.set_premium_status(app_user_id, 0)
            database.add_transaction(app_user_id, f"Abonnement Premium expiré via RevenueCat", "liability_payment", 0.0, "Today")
            
        return jsonify({"success": True, "message": f"Processed RevenueCat event {event_type}"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# Gemini AI Coach Chat
@app.route("/api/coach/chat", methods=["POST"])
def coach_chat():
    user_id = get_current_user_id()
    data = request.json or {}
    lang = data.get("lang", "fr").lower().strip()[:2]
    
    # Verify Premium status
    profile = database.get_user_profile(user_id)
    if not profile or profile.get("premium_status", 0) == 0:
        blocked_msg = {
            "fr": "⚠️ L'accès au Coach Philia Vault et aux audits mensuels est réservé aux membres Premium. Veuillez souscrire à un abonnement pour continuer.",
            "en": "⚠️ Access to the Philia Vault Coach and monthly audits is reserved for Premium members. Please subscribe to continue.",
            "es": "⚠️ El acceso al Coach Philia Vault y a las auditorías mensuales está reservado para miembros Premium. Por favor suscríbase para continuar.",
            "pt": "⚠️ O acesso au Coach Philia Vault e às auditorias mensais é reservado para membros Premium. Por favor, assine para continuar.",
            "de": "⚠️ Der Zugriff auf den Philia Vault Coach und monatliche Audits ist Premium-Mitgliedern vorbehalten. Bitte abonnieren Sie, um fortzufahren."
        }
        return jsonify({
            "success": False,
            "premium_required": True,
            "reply": blocked_msg.get(lang, blocked_msg["en"])
        })

    user_msg = data.get("message", "")
    history = data.get("history", []) # list of {"role": "user"/"model", "text": "..."}
    
    # Get user context
    assets = database.get_assets(user_id)
    liabilities = database.get_liabilities(user_id)
    
    total_assets = sum(a["value"] for a in assets)
    total_passive = sum(a["monthly_yield"] for a in assets)
    total_liabilities = sum(l["remaining_amount"] for l in liabilities)
    total_cost = sum(l["monthly_cost"] for l in liabilities)
    iif, _, _ = calculate_corrected_fi_indices(total_passive, total_cost)
    
    context_str = f"""
    Données financières réelles de l'utilisateur:
    - Actifs totaux: {total_assets} $ (Revenus passifs mensuels: {total_passive} $)
    Détail des actifs: {', '.join([f"{a['name']} ({a['type']}): Val={a['value']}$, Yield={a['monthly_yield']}$" for a in assets])}
    
    - Passifs totaux: {total_liabilities} $ (Coût mensuel total: {total_cost} $)
    Détail des passifs: {', '.join([f"{l['name']} ({l['type']}): Restant={l['remaining_amount']}$, Coût mensuel={l['monthly_cost']}$" for l in liabilities])}
    
    - Indice d'Indépendance Financière (IIF): {iif}%
    - Cashflow Net Mensuel: {total_passive - total_cost} $
    """
    
    first_name = profile.get("first_name", "") if profile else ""
    lang_names = {
        "fr": "français",
        "en": "anglais",
        "es": "espagnol",
        "pt": "portugais",
        "de": "allemand"
    }
    locale = lang_names.get(lang, "français")

    sys_prompt = f"""Tu es le 'Coach Philia Vault', un stratège financier d'élite.
L'utilisateur te parle en : {locale}. TU DOIS IMPÉRATIVEMENT RÉPONDRE DANS CETTE LANGUE ({locale}).
Le prénom de l'utilisateur est : {first_name}. Tu peux l'utiliser pour le saluer ou personnaliser tes conseils de manière chaleureuse et naturelle.

CONSIGNES POUR UN COMPORTEMENT HUMAIN ET PROFESSIONNEL :
1. TON ET SOUPLESSE : Parle avec bienveillance, expertise et humanité. Évite absolument de répéter les mots 'Miroir Financier' ou 'GPS Financier' comme un robot au début de chaque message ou phrase. Intègre ces notions (Miroir = situation brute/passifs, GPS = itinéraire/actions de rebalancement) de manière fluide et naturelle dans le fil de la conversation uniquement quand c'est nécessaire.
2. LONGUEUR DES RÉPONSES : Rédige une réponse courte, claire et précise de maximum 5 phrases. Sois chaleureux et pédagogue, ne sois pas trop sec ou distant.
3. PAS DE LISTES : N'utilise jamais de puces ou de numéros. Rédige en paragraphes fluides.
4. CHIFFRES CLÉS : Utilise les données financières réelles de l'utilisateur de manière pertinente pour étayer tes conseils.

Voici les données financières de l'utilisateur pour orienter sa navigation :
{context_str}
"""
    
    if gemini_model:
        try:
            # Build conversation history with strict alternating roles
            import google.generativeai as genai
            contents = []
            last_role = None
            for h in history:
                role = "user" if h.get("role") == "user" else "model"
                if role == last_role:
                    continue
                contents.append({
                    "role": role,
                    "parts": [h.get("text", "")]
                })
                last_role = role
            
            # If the last message in history was 'user', pop it to avoid duplicate 'user' roles when appending user_msg
            if last_role == "user" and contents:
                contents.pop()
            
            contents.append({"role": "user", "parts": [user_msg]})
            
            model_with_sys = genai.GenerativeModel('gemini-2.5-flash', system_instruction=sys_prompt)
            response = model_with_sys.generate_content(
                contents
            )
            return jsonify({"success": True, "reply": response.text})
        except Exception as e:
            print(f"Gemini error: {e}")
            # fall through to offline mockup fallback if API call fails
    
    # Intelligent Offline Mock Mode (Heuristic engine based on actual DB stats)
    reply = ""
    lower_msg = user_msg.lower()
    
    if lang == "fr":
        if "audit" in lower_msg or "analys" in lower_msg or "conseil" in lower_msg or "iif" in lower_msg or "miroir" in lower_msg or "gps" in lower_msg:
            reply = f"Votre Miroir Financier affiche des passifs de {total_cost} $/mois. Votre GPS Financier estime votre IIF à {iif}%. Injectez du cash-flow immédiat pour recalculer votre route et accélérer l'indépendance."
        else:
            reply = f"Votre Miroir Financier consomme {total_cost} $/mois et vos actifs rapportent {total_passive} $/mois. Votre GPS Financier affiche une progression IIF de {iif}%. Précisez votre question pour optimiser l'itinéraire."
    else:
        # Default to English mock if not FR
        if "audit" in lower_msg or "analys" in lower_msg or "advice" in lower_msg or "iif" in lower_msg or "mirror" in lower_msg or "gps" in lower_msg:
            reply = f"Your Financial Mirror shows liabilities of {total_cost} $/month. Your Financial GPS tracks your IIF at {iif}%. Inject immediate cash-flow to recalculate your route and accelerate freedom."
        else:
            reply = f"Your Financial Mirror consumes {total_cost} $/month and assets yield {total_passive} $/month. Your Financial GPS progress is at {iif}%. Ask a specific question to optimize the route."
    return jsonify({"success": True, "reply": reply})

# --- PRE-LAUNCH LANDING PAGE & SQUARE ENDPOINTS ---
import uuid
import time

SQUARE_ACCESS_TOKEN = os.environ.get("SQUARE_ACCESS_TOKEN")
SQUARE_LOCATION_ID = os.environ.get("SQUARE_LOCATION_ID")
SQUARE_APPLICATION_ID = os.environ.get("SQUARE_APPLICATION_ID")

def send_founder_email(email, name, remaining_spots):
    subject = "Welcome to Philia Vault — Your founder spot is secured 🔒"
    body = f"""Hi {name or email},

Your founding membership is confirmed.

What happens next:
→ You'll receive a private beta invitation in July 2026
→ Full app access launches August 2026
→ Your $4.99/month rate is locked for life
→ Something waiting for you inside the app. You'll see.

You're one of {10 - remaining_spots} people who believed before anyone else.
That means something.

— The Philia Vault Team

---
Questions? Reply to this email.
Cancel anytime: https://philiavault.app/cancel?email={email}
"""
    print("=" * 60)
    print(f"SIMULATED EMAIL SENT TO: {email}")
    print(f"Subject: {subject}")
    print(body)
    print("=" * 60)
    try:
        os.makedirs(os.path.join(os.path.dirname(__file__), "emails"), exist_ok=True)
        filename = os.path.join(os.path.dirname(__file__), "emails", f"founder_confirmation_{email}_{int(time.time())}.txt")
        with open(filename, "w", encoding="utf-8") as f:
            f.write(f"To: {email}\nSubject: {subject}\n\n{body}")
    except Exception as e:
        print(f"Could not log email to file: {e}")

@app.route("/api/founder/stripe-config", methods=["GET"])
def founder_stripe_config():
    return jsonify({
        "publishableKey": os.environ.get("STRIPE_PUBLISHABLE_KEY", "")
    })

@app.route("/api/founder/count", methods=["GET"])
def founder_count():
    data = database.get_founder_spots_counter()
    return jsonify({
        "success": True,
        "count": data["spots_remaining"],
        "remaining": data["spots_remaining"],
        "total": data["total_spots"]
    })

@app.route("/api/user/founder-status", methods=["GET"])
def founder_status():
    email = request.args.get("email")
    if not email:
        return jsonify({"success": False, "error": "Email requis"}), 400
    
    is_founder = database.check_is_founder(email)
    return jsonify({
        "success": True,
        "isFounder": is_founder
    })

@app.route("/api/founder/purchase", methods=["POST"])
def founder_purchase():
    data = request.json or {}
    email = data.get("email")
    name = data.get("name")
    source_id = data.get("source_id") # Stripe token (tok_...)
    
    if not email or not source_id:
        return jsonify({"success": False, "error": "Email and payment token are required"}), 400

    # Server-side validation of spots left
    count = database.get_founder_count()
    remaining = max(0, 10 - count)
    if remaining <= 0:
        return jsonify({"success": False, "error": "No founder spots remaining. Please join the waitlist."}), 400

    payment_id = f"st-mock-{uuid.uuid4().hex}"
    
    # Process with Stripe if config exists
    if STRIPE_SECRET_KEY:
        try:
            charge = stripe.Charge.create(
                amount=499, # $4.99 USD
                currency="usd",
                source=source_id,
                description=f"Philia Vault Founder Spot - {email}",
                receipt_email=email
            )
            payment_id = charge["id"]
        except Exception as e:
            return jsonify({"success": False, "error": f"Stripe Error: {str(e)}"}), 400

    # Save founder subscription in database
    success = database.add_founder_member(email, name, payment_id)
    if not success:
        return jsonify({"success": False, "error": "Email already registered as a founding member"}), 400

    # Re-evaluate remaining spots for email text
    new_count = database.get_founder_count()
    new_remaining = max(0, 10 - new_count)
    
    send_founder_email(email, name, new_remaining)

    return jsonify({
        "success": True,
        "message": "Founder spot claimed successfully",
        "payment_id": payment_id,
        "remaining_spots": new_remaining
    })

@app.route("/api/founder/waitlist", methods=["POST"])
def founder_waitlist():
    data = request.json or {}
    email = data.get("email")
    lang = data.get("lang", "en")
    
    if not email:
        return jsonify({"success": False, "error": "Email is required"}), 400
        
    success = database.add_founder_waitlist(email, lang)
    if not success:
        return jsonify({"success": False, "error": "Email already added to the waitlist"}), 400
        
    return jsonify({
        "success": True,
        "message": "Added to waitlist successfully"
    })

if __name__ == "__main__":
    # Ensure static directory exists
    os.makedirs("static", exist_ok=True)
    app.run(host="0.0.0.0", port=5001, debug=True)
