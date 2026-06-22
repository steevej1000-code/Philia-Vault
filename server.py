import os
from flask import Flask, request, jsonify, send_from_directory, redirect
import database
import json
from dotenv import load_dotenv

from flask_cors import CORS
import stripe
STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY")
if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY

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
    'https://philia-vault-pwa.onrender.com',
    'https://app.philiavault.com',
    'https://admin.philiavault.com',
    'http://localhost:3000',
    'http://localhost:5000',
    'http://localhost:5001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5000',
    'http://127.0.0.1:5001',
    'http://localhost:8081',
    'http://localhost:8082',
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
    host = request.host
    if host.startswith("admin.philiavault.com"):
        return send_from_directory("static", "admin.html")
    if host.startswith("app.philiavault.com"):
        return send_from_directory("static", "index.html")
    # If the file landing.html doesn't exist yet, fallback to index.html gracefully
    if os.path.exists(os.path.join("static", "landing.html")):
        return send_from_directory("static", "landing.html")
    return send_from_directory("static", "index.html")

@app.route("/app")
def serve_app():
    return send_from_directory("static", "index.html")

@app.route("/admin")
@app.route("/admin/")
def serve_admin():
    return send_from_directory("static", "admin.html")

@app.route("/assets/<path:path>")
def serve_assets(path):
    return send_from_directory(os.path.join("static", "assets"), path)

@app.route("/favicon.svg")
def serve_favicon():
    return send_from_directory("static", "favicon.svg")

@app.route("/icons.svg")
def serve_icons():
    return send_from_directory("static", "icons.svg")

@app.route("/static/<path:path>")
def serve_static(path):
    return send_from_directory("static", path)

@app.route("/api/public/config", methods=["GET"])
def get_public_config():
    """Public endpoint — returns display prices, FAQ, hero text for PWA/landing."""
    import json as _json
    cfg = database.get_config()
    faq_raw = cfg.get('faq', '[]')
    try:
        faq = _json.loads(faq_raw)
    except Exception:
        faq = []
    return jsonify({
        "price_monthly_display":  cfg.get('price_monthly_display',  '$9.99'),
        "price_yearly_display":   cfg.get('price_yearly_display',   '$79.99'),
        "price_monthly_equiv":    cfg.get('price_monthly_equiv',    '= $6.67/mo'),
        "price_founder_display":  cfg.get('price_founder_display',  '$4.99'),
        "stripe_price_monthly":   cfg.get('stripe_price_monthly',   ''),
        "stripe_price_yearly":    cfg.get('stripe_price_yearly',    ''),
        "hero_title":             cfg.get('hero_title',             'Your Financial Mirror'),
        "hero_subtitle":          cfg.get('hero_subtitle',          'AI-powered wealth management'),
        "faq":                    faq,
    })

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
        # Registration always grants app access — premium is feature-gated separately,
        # never at the account/login level (new accounts must never be blocked from entering the app).
        email_clean = email.lower().strip()
        return jsonify({
            "success": True,
            "user": {"email": email_clean},
            "token": email_clean,
            "message": "Compte créé avec succès"
        })
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
        # Login only authenticates — it never blocks access to the app itself.
        # Premium-only features (e.g. /api/coach/chat) check premium_status on their own.
        # Seed default data if they login and somehow have no items
        database.seed_user_data(user["email"])
        return jsonify({"success": True, "user": {"email": user["email"]}, "token": user["email"], "message": "Connexion réussie"})
    else:
        return jsonify({"success": False, "error": "Email ou mot de passe incorrect"}), 401


@app.route("/api/auth/validate", methods=["GET"])
def auth_validate():
    """Called by the mobile app on every launch to verify subscription is still active."""
    email = get_current_user_id()
    if not email:
        return jsonify({"valid": False, "error": "Non authentifié"}), 403

    profile = database.get_user_profile(email)
    if not profile:
        return jsonify({"valid": False, "error": "Utilisateur introuvable"}), 403

    import datetime as _dt
    is_premium = bool(profile.get("premium_status", 0))
    created_at_str = profile.get("created_at", "")
    try:
        created_dt = _dt.datetime.fromisoformat(created_at_str.replace(" ", "T").rstrip("Z"))
        in_trial = (_dt.datetime.utcnow() - created_dt).total_seconds() < 3 * 86400
    except Exception:
        in_trial = False

    if not is_premium and not in_trial:
        return jsonify({"valid": False, "error": "Ce compte n'a pas d'accès actif. Vérifiez vos identifiants."}), 403

    return jsonify({
        "valid": True,
        "user": {
            "email": profile.get("email"),
            "first_name": profile.get("first_name"),
            "last_name": profile.get("last_name"),
            "premium_status": profile.get("premium_status"),
            "cancel_at_period_end": profile.get("cancel_at_period_end"),
        }
    }), 200

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
        
        total_liabilities_val = sum(l["remaining_amount"] for l in liabilities) + sum(l["monthly_cost"] for l in liabilities if l["type"] == "Subscription")
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
            val = l["remaining_amount"] if l["type"] != "Subscription" else l["monthly_cost"]
            liability_types[l["type"]] = liability_types.get(l["type"], 0) + val
            
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




# ═══════════════════════════════════════════════════════════════════════════════
# STRIPE CONNECT — AFFILIATE ONBOARDING & PAYOUTS
# ═══════════════════════════════════════════════════════════════════════════════

STRIPE_CONNECT_RETURN_URL  = os.environ.get("STRIPE_CONNECT_RETURN_URL",  "https://app.philiavault.com/affiliate-onboarding-return")
STRIPE_CONNECT_REFRESH_URL = os.environ.get("STRIPE_CONNECT_REFRESH_URL", "https://app.philiavault.com/affiliate-onboarding-refresh")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "steevej1000@gmail.com")

def _require_admin(req):
    """Return None if authorized, or a JSON error response."""
    caller = req.headers.get("X-Admin-Email", "")
    if caller != ADMIN_EMAIL:
        return jsonify({"success": False, "error": "Unauthorized"}), 403
    return None


@app.route("/api/affiliate/onboard", methods=["POST"])
def affiliate_onboard():
    """Create (or re-create) a Stripe Connect Express account and return the onboarding URL."""
    user_id = get_current_user_id()
    if not STRIPE_SECRET_KEY:
        return jsonify({"success": False, "error": "Stripe not configured"}), 500
    try:
        existing = database.get_affiliate_account(user_id)
        if existing and existing.get("stripe_account_id") and existing.get("onboarding_status") == "active":
            return jsonify({"success": True, "status": "active", "onboarding_url": None})

        # Re-use existing account id if already created but not yet active
        if existing and existing.get("stripe_account_id"):
            account_id = existing["stripe_account_id"]
        else:
            account = stripe.Account.create(
                type="express",
                country="US",
                capabilities={"transfers": {"requested": True}},
            )
            account_id = account.id
            database.upsert_affiliate_account(user_id, account_id, status="pending")

        link = stripe.AccountLink.create(
            account=account_id,
            refresh_url=STRIPE_CONNECT_REFRESH_URL,
            return_url=STRIPE_CONNECT_RETURN_URL,
            type="account_onboarding",
        )
        return jsonify({"success": True, "onboarding_url": link.url, "stripe_account_id": account_id})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/affiliate/onboard/status", methods=["GET"])
def affiliate_onboard_status():
    """Return current onboarding status, syncing with Stripe if an account exists."""
    user_id = get_current_user_id()
    acc = database.get_affiliate_account(user_id)
    if not acc or not acc.get("stripe_account_id"):
        return jsonify({"success": True, "status": "not_started", "stripe_account_id": None})

    account_id = acc["stripe_account_id"]
    current_status = acc.get("onboarding_status", "pending")

    if STRIPE_SECRET_KEY and current_status != "active":
        try:
            sa = stripe.Account.retrieve(account_id)
            if sa.charges_enabled:
                current_status = "active"
            elif sa.requirements and (sa.requirements.currently_due or sa.requirements.past_due):
                current_status = "restricted"
            # else stays "pending"
            database.update_affiliate_onboarding_status(user_id, current_status)
        except Exception as e:
            print(f"[Affiliate] Stripe account retrieve error: {e}")

    return jsonify({"success": True, "status": current_status, "stripe_account_id": account_id})


@app.route("/api/admin/affiliate/payout-batch", methods=["GET"])
def affiliate_payout_batch():
    """List all eligible commissions grouped by affiliate (admin only)."""
    err = _require_admin(request)
    if err:
        return err
    try:
        rows = database.get_eligible_commissions_batch()
        return jsonify({"success": True, "batch": rows, "count": len(rows)})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/admin/affiliate/payout-execute", methods=["POST"])
def affiliate_payout_execute():
    """Execute Stripe transfers for eligible commissions (admin only)."""
    err = _require_admin(request)
    if err:
        return err
    data = request.json or {}
    target_user_id = data.get("affiliate_user_id")
    execute_all = data.get("all", False)

    if not STRIPE_SECRET_KEY:
        return jsonify({"success": False, "error": "Stripe not configured"}), 500

    try:
        batch = database.get_eligible_commissions_batch()
        if not execute_all and target_user_id:
            batch = [b for b in batch if str(b["affiliate_user_id"]) == str(target_user_id)]

        transferred = []
        errors = []

        for item in batch:
            stripe_account_id = item.get("stripe_account_id")
            if not stripe_account_id:
                errors.append({"affiliate_user_id": item["affiliate_user_id"], "error": "No Stripe account linked"})
                continue
            total_cents = int(round(item["total_amount"] * 100))
            if total_cents < 100:  # Stripe minimum $1
                errors.append({"affiliate_user_id": item["affiliate_user_id"], "error": f"Amount too low: ${item['total_amount']:.2f}"})
                continue
            try:
                transfer = stripe.Transfer.create(
                    amount=total_cents,
                    currency="usd",
                    destination=stripe_account_id,
                    metadata={"affiliate_user_id": item["affiliate_user_id"], "email": item["email"]},
                )
                commission_ids = [int(i) for i in item["commission_ids"].split(",")]
                database.mark_commissions_paid(commission_ids)
                transferred.append({
                    "affiliate_user_id": item["affiliate_user_id"],
                    "email": item["email"],
                    "amount_usd": item["total_amount"],
                    "transfer_id": transfer.id,
                })
            except Exception as e:
                errors.append({"affiliate_user_id": item["affiliate_user_id"], "error": str(e)})

        return jsonify({"success": True, "transferred": transferred, "errors": errors})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/admin/affiliate/process-eligible", methods=["POST"])
def affiliate_process_eligible():
    """Move commissions from pending→eligible (30-day quarantine) or pending→cancelled."""
    err = _require_admin(request)
    if err:
        return err
    if not STRIPE_SECRET_KEY:
        return jsonify({"success": False, "error": "Stripe not configured"}), 500
    try:
        pending = database.get_pending_commissions_older_than_days(30)
        eligible_ids = []
        cancelled_ids = []

        for row in pending:
            sub_id = row.get("referred_stripe_sub_id")
            if not sub_id:
                # No subscription on file — mark eligible (will be reviewed manually)
                eligible_ids.append(row["id"])
                continue
            try:
                sub = stripe.Subscription.retrieve(sub_id)
                if sub.status in ("active", "trialing"):
                    eligible_ids.append(row["id"])
                else:
                    cancelled_ids.append(row["id"])
            except Exception:
                # Can't retrieve — mark eligible conservatively
                eligible_ids.append(row["id"])

        database.mark_commissions_eligible(eligible_ids)
        database.mark_commissions_cancelled(cancelled_ids)

        return jsonify({
            "success": True,
            "processed": len(pending),
            "eligible": len(eligible_ids),
            "cancelled": len(cancelled_ids),
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/admin/fix-referral", methods=["POST"])
def admin_fix_referral():
    """Manually link a user to a parrain by email (admin only). For retroactive referral fixes."""
    err = _require_admin(request)
    if err:
        return err
    data = request.json or {}
    user_email = (data.get("user_email") or "").strip().lower()
    parrain_email = (data.get("parrain_email") or "").strip().lower()
    if not user_email or not parrain_email:
        return jsonify({"success": False, "error": "user_email and parrain_email required"}), 400
    try:
        result = database.fix_referral_link(user_email, parrain_email)
        return jsonify(result)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/admin/debug/affiliates", methods=["GET"])
def debug_affiliates():
    """Temporary debug route: list all users with their parrain_id to verify referral linking."""
    import os
    # Protect with a simple env-var secret to avoid exposing in prod without auth
    secret = request.headers.get("X-Admin-Secret", "")
    expected = os.environ.get("ADMIN_DEBUG_SECRET", "philia-debug-2025")
    if secret != expected:
        return jsonify({"success": False, "error": "Unauthorized"}), 401
    try:
        conn = database.get_db()
        cursor = conn.cursor()
        cursor.execute(
            """SELECT id, email, first_name, last_name, code_parrainage, parrain_id, premium_status, created_at
               FROM users ORDER BY created_at DESC LIMIT 100"""
        )
        rows = [dict(r) for r in cursor.fetchall()]
        conn.close()
        return jsonify({"success": True, "users": rows, "count": len(rows)})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/affiliate/network", methods=["GET"])
def affiliate_network():
    user_id = get_current_user_id()
    try:
        network = database.get_affiliate_network(user_id)
        return jsonify({"success": True, "network": network})
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

# Stripe Checkout / Portal Endpoints
@app.route("/api/stripe/create-checkout-session", methods=["POST"])
def stripe_checkout():
    user_id = get_current_user_id()
    data = request.json or {}

    # Plan mensuel $14.99 ou annuel $149.90
    price_id          = data.get("price_id")          # Stripe Price ID depuis le frontend (optionnel)
    plan              = data.get("plan", "monthly")    # 'monthly' ou 'annual'
    trial_period_days = int(data.get("trial_period_days", 3))
    success_url       = data.get("success_url")
    cancel_url        = data.get("cancel_url")

    domain_url = request.host_url.rstrip('/')
    if not success_url:
        success_url = domain_url + "/stripe-success?session_id={CHECKOUT_SESSION_ID}"
    if not cancel_url:
        cancel_url = domain_url + "/paywall"

    try:
        profile = database.get_user_profile(user_id)
        customer_id = profile.get("stripe_customer_id") if profile else None

        if STRIPE_SECRET_KEY:
            if not customer_id:
                customer = stripe.Customer.create(
                    email=user_id,
                    metadata={"user_id": user_id}
                )
                customer_id = customer.id
                database.set_premium_status(user_id, profile.get("premium_status", 0), stripe_customer_id=customer_id)

            # Résoudre le Price ID selon le plan choisi
            STRIPE_PRICE_MONTHLY = os.environ.get(
                "STRIPE_PRICE_MONTHLY", "price_1TkdtnGB22CTeiDpoTNsaFQM"
            )
            STRIPE_PRICE_ANNUAL = os.environ.get("STRIPE_ANNUAL_PRICE_ID")
            if not price_id or "placeholder" in price_id:
                if plan == "annual" and STRIPE_PRICE_ANNUAL:
                    price_id = STRIPE_PRICE_ANNUAL
                else:
                    price_id = STRIPE_PRICE_MONTHLY

            session_params = dict(
                customer=customer_id,
                payment_method_types=['card'],
                line_items=[{'price': price_id, 'quantity': 1}],
                mode='subscription',
                success_url=success_url,
                cancel_url=cancel_url,
                metadata={'user_email': user_id},
            )

            # Essai gratuit 3 jours
            if trial_period_days > 0:
                session_params['subscription_data'] = {
                    'trial_period_days': trial_period_days,
                }

            session = stripe.checkout.Session.create(**session_params)
            return jsonify({"success": True, "url": session.url})
        else:
            # Mode dev sans clé Stripe — bypass immédiat
            database.set_premium_status(user_id, 1)
            return jsonify({"success": True, "url": success_url.replace("{CHECKOUT_SESSION_ID}", "mock_session")})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/stripe/verify-session", methods=["POST"])
def stripe_verify_session():
    """
    Called by stripe-success.tsx after Stripe redirects back.
    Verifies the session and activates premium for the user.
    """
    user_email = request.headers.get('X-User-Email') or get_current_user_id()
    data = request.json or {}
    session_id = data.get("session_id")

    if not session_id or session_id == "mock_session":
        # Dev mode bypass
        if user_email:
            database.set_premium_status(user_email, 1)
        return jsonify({"success": True, "verified": True})

    try:
        if STRIPE_SECRET_KEY:
            session = stripe.checkout.Session.retrieve(session_id)
            payment_status = session.get("payment_status")  # 'paid' or 'no_payment_required' (trial)
            subscription_status = None
            if session.get("subscription"):
                sub = stripe.Subscription.retrieve(session["subscription"])
                subscription_status = sub.get("status")  # 'trialing', 'active', etc.

            is_active = payment_status in ("paid", "no_payment_required") or \
                        subscription_status in ("active", "trialing")

            if is_active:
                # Activate via email from metadata or header
                email = session.get("customer_email") or \
                        (session.get("metadata") or {}).get("user_email") or \
                        user_email
                if email:
                    database.set_premium_status(email, 1,
                        stripe_customer_id=session.get("customer"),
                        stripe_subscription_id=session.get("subscription"))
                return jsonify({"success": True, "verified": True,
                                "payment_status": payment_status,
                                "subscription_status": subscription_status})
            else:
                return jsonify({"success": False, "verified": False,
                                "payment_status": payment_status})
        else:
            # Dev mode — no Stripe key
            if user_email:
                database.set_premium_status(user_email, 1)
            return jsonify({"success": True, "verified": True})
    except Exception as e:
        print(f"[verify-session] Error: {e}")
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

# Cancel Subscription — schedules cancellation at the end of the current
# billing period. The user keeps full access until then; no refund is granted.
@app.route("/api/subscription/cancel", methods=["POST"])
def cancel_subscription():
    user_id = get_current_user_id()

    profile = database.get_user_profile(user_id)
    if not profile:
        return jsonify({"success": False, "error": "Utilisateur introuvable"}), 401

    # Must be an active premium member with a Stripe subscription on file
    if not profile.get("premium_status"):
        return jsonify({"success": False, "error": "Aucun abonnement actif"}), 400

    subscription_id = profile.get("stripe_subscription_id")
    cancel_at_ts = None

    try:
        if STRIPE_SECRET_KEY and subscription_id:
            sub = stripe.Subscription.modify(
                subscription_id,
                cancel_at_period_end=True,
            )
            cancel_at_ts = sub.get("cancel_at") or sub.get("current_period_end")

        import datetime as _dt
        cancel_at_iso = (
            _dt.datetime.fromtimestamp(cancel_at_ts).isoformat() if cancel_at_ts else None
        )
        database.set_subscription_cancel_at_period_end(
            user_id, True, cancel_at=cancel_at_iso
        )

        return jsonify({
            "success": True,
            "message": "Your subscription will end at period end.",
            "cancel_at": cancel_at_iso,
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/subscription/reactivate", methods=["POST"])
def reactivate_subscription():
    user_id = get_current_user_id()
    profile = database.get_user_profile(user_id)
    if not profile:
        return jsonify({"success": False, "error": "Utilisateur introuvable"}), 401
    subscription_id = profile.get("stripe_subscription_id")
    try:
        if STRIPE_SECRET_KEY and subscription_id:
            stripe.Subscription.modify(subscription_id, cancel_at_period_end=False)
        database.set_subscription_cancel_at_period_end(user_id, False, cancel_at=None)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/subscription/status", methods=["GET"])
def subscription_status():
    user_id = get_current_user_id()
    profile = database.get_user_profile(user_id)
    if not profile:
        return jsonify({"success": False, "error": "Utilisateur introuvable"}), 401

    cancel_at = profile.get("cancel_at")
    access_until = None
    if cancel_at:
        try:
            import datetime as _dt
            # cancel_at may be ISO string or unix timestamp
            if isinstance(cancel_at, (int, float)):
                dt = _dt.datetime.fromtimestamp(cancel_at)
            else:
                dt = _dt.datetime.fromisoformat(str(cancel_at).replace("Z", ""))
            access_until = dt.strftime("%B %d, %Y")
        except Exception:
            access_until = str(cancel_at)

    return jsonify({
        "success": True,
        "is_premium": bool(profile.get("premium_status")),
        "cancel_at_period_end": bool(profile.get("cancel_at_period_end")),
        "cancel_at": cancel_at,
        "access_until": access_until,
        "stripe_subscription_id": profile.get("stripe_subscription_id"),
    })


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

            # Track a scheduled cancellation without revoking access. Stripe will
            # fire customer.subscription.deleted at the real period end.
            if event_type == "customer.subscription.updated":
                cancel_flag = bool(event_data.get("cancel_at_period_end"))
                cancel_at_ts = event_data.get("cancel_at")
                cancel_at_iso = None
                if cancel_at_ts:
                    import datetime as _dt
                    cancel_at_iso = _dt.datetime.fromtimestamp(cancel_at_ts).isoformat()
                database.set_subscription_cancel_at_period_end(
                    user["email"], cancel_flag, cancel_at=cancel_at_iso
                )
                if cancel_flag:
                    database.add_transaction(user["email"], "Résiliation programmée (fin de période)", "liability_payment", 0.0, "Today")

    elif event_type == "customer.subscription.deleted":
        customer_id = event_data.get("customer")
        user = database.get_user_by_stripe_customer_id(customer_id)
        if user:
            # Period actually ended — revoke premium and clear the pending-cancel flag
            database.set_premium_status(user["email"], 0, stripe_customer_id=customer_id)
            database.set_subscription_cancel_at_period_end(user["email"], False, cancel_at=None)
            database.add_transaction(user["email"], "Abonnement Stripe résilié", "liability_payment", 0.0, "Today")

    elif event_type == "invoice.payment_succeeded":
        # Recurring subscription renewal — record affiliate commission if applicable
        customer_id = event_data.get("customer")
        payment_intent_id = event_data.get("payment_intent")
        amount_paid = event_data.get("amount_paid", 0) / 100  # cents → dollars
        billing_reason = event_data.get("billing_reason", "")
        # Only process renewals (not the initial invoice, already handled by checkout.session.completed)
        if billing_reason == "subscription_cycle" and customer_id and payment_intent_id:
            try:
                user = database.get_user_by_stripe_customer_id(customer_id)
                if user and user.get("parrain_id"):
                    commission_amount = round(amount_paid * 0.50, 2)
                    plan_type_inv = 'annual' if amount_paid > 100 else 'monthly'
                    database.insert_affiliate_commission(
                        affiliate_user_id=user["parrain_id"],
                        referred_user_id=user["id"],
                        payment_id=payment_intent_id,
                        commission_amount=commission_amount,
                        plan_type=plan_type_inv,
                    )
                    print(f"[Affiliate] Renewal commission {commission_amount} USD for parrain_id={user['parrain_id']}")
            except Exception as e:
                print(f"[Affiliate] Renewal commission error: {e}")

    return jsonify({"success": True})
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
    total_liabilities = sum(l["remaining_amount"] for l in liabilities) + sum(l["monthly_cost"] for l in liabilities if l["type"] == "Subscription")
    total_cost = sum(l["monthly_cost"] for l in liabilities)
    iif, _, _ = calculate_corrected_fi_indices(total_passive, total_cost)
    
    context_str = f"""
    Données financières réelles de l'utilisateur:
    - Actifs totaux: {total_assets} $ (Revenus passifs mensuels: {total_passive} $)
    Détail des actifs: {', '.join([f"{a['name']} ({a['type']}): Val={a['value']}$, Yield={a['monthly_yield']}$" for a in assets])}
    
    - Dettes totales (capital restant dû): {total_liabilities} $
    - Coût mensuel des passifs (charges/abonnements): {total_cost} $
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
5. PASSIFS ET ABONNEMENTS : Distingue bien la dette de capital restant dû (ex: prêt immobilier) et les charges récurrentes/abonnements (type Subscription). Si l'utilisateur n'a aucun prêt mais possède des abonnements (coûts mensuels), ne dis pas simplement "vos passifs sont de 0 $". Précise que vous n'avez pas de dette financière directe mais que vos charges mensuelles d'abonnements s'élèvent à X $ par mois (le coût mensuel total des passifs). Ne laisse pas entendre qu'il n'y a aucun passif si des coûts mensuels d'abonnements existent.

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

# ── Daily Decision ────────────────────────────────────────────────────────────
import json as _json
import hashlib as _hashlib

# Static dilemma files per language — zero API cost, fully offline
_DILEMMAS_CACHE: dict = {}
_SUPPORTED_LANGS = {"fr", "en", "es", "pt"}

def _load_dilemmas(lang: str = "fr"):
    """Load dilemmas from static pre-translated JSON file. Falls back to French."""
    lang = lang.lower()[:2] if lang else "fr"
    if lang not in _SUPPORTED_LANGS:
        lang = "fr"
    if lang not in _DILEMMAS_CACHE:
        fname = "dilemmas.json" if lang == "fr" else f"dilemmas.{lang}.json"
        _path = os.path.join(os.path.dirname(__file__), fname)
        if not os.path.exists(_path):
            _path = os.path.join(os.path.dirname(__file__), "dilemmas.json")
        with open(_path, "r", encoding="utf-8") as f:
            _DILEMMAS_CACHE[lang] = _json.load(f)
    return _DILEMMAS_CACHE[lang]

def _get_dilemma_in_lang(dilemma, lang):
    """Return dilemma in the requested language using static pre-translated files."""
    lang = (lang or "fr").lower()[:2]
    if lang == "fr" or lang not in _SUPPORTED_LANGS:
        return dilemma
    dilemmas = _load_dilemmas(lang)
    # Find matching dilemma by id in the language file
    localized = next((d for d in dilemmas if d["id"] == dilemma["id"]), None)
    return localized if localized else dilemma

def _pick_dilemma_for_user(user_id, today_str):
    dilemmas = _load_dilemmas("fr")  # rotation always based on FR master list
    conn = database.get_db()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT dilemma_id FROM user_dilemma_history WHERE user_id = (SELECT id FROM users WHERE email = ? OR id = ?)",
            (user_id, user_id)
        )
        seen = {row[0] for row in cursor.fetchall()}
    finally:
        conn.close()

    unseen = [d for d in dilemmas if d["id"] not in seen]
    pool = unseen if unseen else dilemmas  # full cycle reset

    seed_str = f"{user_id}:{today_str}"
    seed = int(_hashlib.md5(seed_str.encode()).hexdigest(), 16)
    return pool[seed % len(pool)]


@app.route("/api/daily-decision", methods=["GET"])
def get_daily_decision():
    user_id = get_current_user_id()
    today_str = request.args.get("date") or __import__("datetime").date.today().isoformat()
    lang = (request.args.get("lang") or request.headers.get("X-User-Lang") or "fr").lower()[:2]

    conn = database.get_db()
    cursor = conn.cursor()
    try:
        # Check if already answered today
        cursor.execute(
            """SELECT dh.dilemma_id, dh.choice FROM user_dilemma_history dh
               JOIN users u ON u.id = dh.user_id
               WHERE (u.email = ? OR u.id = ?)
               AND date(dh.answered_at) = ?
               ORDER BY dh.answered_at DESC LIMIT 1""",
            (user_id, user_id, today_str)
        )
        existing = cursor.fetchone()
        if existing:
            dilemmas = _load_dilemmas("fr")  # always look up by FR id
            dilemma_raw = next((d for d in dilemmas if d["id"] == existing[0]), None)
            choice = existing[1]
        else:
            dilemma_raw = _pick_dilemma_for_user(user_id, today_str)
            choice = None

        dilemma = _get_dilemma_in_lang(dilemma_raw, lang) if dilemma_raw else None

        # Streak
        cursor.execute(
            """SELECT current_streak, longest_streak, last_answered_date
               FROM user_streak WHERE user_id = (SELECT id FROM users WHERE email = ? OR id = ?)""",
            (user_id, user_id)
        )
        streak_row = cursor.fetchone()
        streak = {"current": 0, "longest": 0, "last_answered_date": None}
        if streak_row:
            streak = {"current": streak_row[0], "longest": streak_row[1], "last_answered_date": streak_row[2]}
    finally:
        conn.close()

    return jsonify({
        "success": True,
        "dilemma": dilemma,
        "already_answered": existing is not None if not existing else True,
        "choice": choice,
        "streak": streak,
        "date": today_str
    })


@app.route("/api/daily-decision/answer", methods=["POST"])
def post_daily_decision():
    user_id = get_current_user_id()
    data = request.json or {}
    dilemma_id = data.get("dilemma_id")
    choice = data.get("choice")  # "asset" or "liability"
    today_str = data.get("date") or __import__("datetime").date.today().isoformat()

    if not dilemma_id or choice not in ("asset", "liability"):
        return jsonify({"success": False, "error": "dilemma_id and choice (asset|liability) required"}), 400

    conn = database.get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM users WHERE email = ? OR id = ?", (user_id, user_id))
        user_row = cursor.fetchone()
        if not user_row:
            return jsonify({"success": False, "error": "User not found"}), 404
        uid = user_row[0]

        # Prevent double-answer for same day
        cursor.execute(
            "SELECT 1 FROM user_dilemma_history WHERE user_id = ? AND date(answered_at) = ?",
            (uid, today_str)
        )
        if cursor.fetchone():
            return jsonify({"success": False, "error": "Already answered today"}), 409

        cursor.execute(
            "INSERT INTO user_dilemma_history (user_id, dilemma_id, choice) VALUES (?, ?, ?)",
            (uid, dilemma_id, choice)
        )

        # Update streak
        import datetime as _dt
        today = _dt.date.fromisoformat(today_str)
        yesterday = (today - _dt.timedelta(days=1)).isoformat()

        cursor.execute("SELECT current_streak, longest_streak, last_answered_date FROM user_streak WHERE user_id = ?", (uid,))
        s = cursor.fetchone()
        if s:
            last = s[2]
            current = s[0] + 1 if last == yesterday else 1
            longest = max(s[1], current)
            cursor.execute(
                "UPDATE user_streak SET current_streak=?, longest_streak=?, last_answered_date=? WHERE user_id=?",
                (current, longest, today_str, uid)
            )
        else:
            cursor.execute(
                "INSERT INTO user_streak (user_id, current_streak, longest_streak, last_answered_date) VALUES (?, 1, 1, ?)",
                (uid, today_str)
            )
            current, longest = 1, 1

        conn.commit()

        # Return feedback from dilemma (localized)
        dilemmas = _load_dilemmas("fr")  # always look up by FR id
        dilemma_raw = next((d for d in dilemmas if d["id"] == dilemma_id), None)
        feedback = None
        if dilemma_raw:
            _lang = (data.get("lang") or request.headers.get("X-User-Lang") or "fr").lower()[:2]
            dilemma_loc = _get_dilemma_in_lang(dilemma_raw, _lang)
            key = "choice_asset" if choice == "asset" else "choice_liability"
            feedback = dilemma_loc[key]["feedback"]

    finally:
        conn.close()

    return jsonify({
        "success": True,
        "feedback": feedback,
        "streak": {"current": current, "longest": longest, "last_answered_date": today_str}
    })


@app.route("/api/daily-decision/history", methods=["GET"])
def get_daily_decision_history():
    user_id = get_current_user_id()
    conn = database.get_db()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """SELECT dh.dilemma_id, dh.choice, dh.answered_at
               FROM user_dilemma_history dh
               JOIN users u ON u.id = dh.user_id
               WHERE u.email = ? OR u.id = ?
               ORDER BY dh.answered_at DESC
               LIMIT 30""",
            (user_id, user_id)
        )
        rows = cursor.fetchall()
        history = [{"dilemma_id": r[0], "choice": r[1], "answered_at": r[2]} for r in rows]

        cursor.execute(
            """SELECT current_streak, longest_streak, last_answered_date
               FROM user_streak WHERE user_id = (SELECT id FROM users WHERE email = ? OR id = ?)""",
            (user_id, user_id)
        )
        s = cursor.fetchone()
        streak = {"current": s[0] if s else 0, "longest": s[1] if s else 0, "last_answered_date": s[2] if s else None}
    finally:
        conn.close()

    return jsonify({"success": True, "history": history, "streak": streak})



if __name__ == "__main__":
    # Ensure static directory exists
    os.makedirs("static", exist_ok=True)
    app.run(host="0.0.0.0", port=5001, debug=True)
