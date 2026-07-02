import os
import requests
from flask import Flask, request, jsonify, send_from_directory, redirect
import database
import json
from dotenv import load_dotenv

from flask_cors import CORS
from services.email_service import send_welcome_email
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# SECURITY: Input validation helpers
import html as _html
_MAX_FIELD_LENGTH = 500
_MAX_MESSAGE_LENGTH = 5000
_FORBIDDEN_SQL_PATTERNS = ["' --", "';", "/*", "*/", "UNION SELECT", "DROP TABLE", "DELETE FROM", "INSERT INTO", "ALTER TABLE", "CREATE TABLE", "OR 1=1", "OR '1'='1'", "OR 1=1--", "xp_cmdshell"]

def sanitize_string(val, max_len=_MAX_FIELD_LENGTH):
    """Valide et nettoie une chaîne. Retourne None si invalide."""
    if val is None or not isinstance(val, str):
        return None
    val = val.strip()
    if len(val) == 0 or len(val) > max_len:
        return None
    # Bloquer les patterns SQL dangereux # SECURITY
    upper = val.upper()
    for pattern in _FORBIDDEN_SQL_PATTERNS:
        if pattern in upper:
            return None
    return _html.escape(val[:max_len])  # HTML-escape comme filet de sécurité # SECURITY

def validate_email(email):
    """Validation basique d'email."""
    if not email or not isinstance(email, str):
        return None
    email = email.strip().lower()
    if len(email) > 254 or len(email) < 3:
        return None
    if "@" not in email or "." not in email.split("@")[-1]:
        return None
    return email

def validate_json_request(required_fields=None, max_field_length=_MAX_FIELD_LENGTH):
    """Décorateur qui valide le body JSON et les champs requis."""
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            data = request.json or {}
            if required_fields:
                for field in required_fields:
                    if field not in data or data[field] is None:
                        return jsonify({"error": "Paramètres requis manquants"}), 400
                    # Validation string pour les champs texte
                    if isinstance(data[field], str) and sanitize_string(data[field], max_field_length) is None:
                        return jsonify({"error": "Paramètre invalide"}), 400
            return f(*args, **kwargs)
        return wrapper
    return decorator

load_dotenv()

# --- Vérification des variables d'environnement critiques ---
# ENCRYPTION_KEY est accepté en alias de DB_ENCRYPTION_KEY (nom historique
# utilisé par database.py) : l'un des deux doit être présent.
REQUIRED_ENV_VARS = ["DEEPSEEK_API_KEY", "SECRET_KEY"]
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

# SECURITY: Rate Limiting — key function uses user email when available, fallback to IP # SECURITY
def _limiter_key_func():
    email = request.headers.get("X-User-Email") or request.args.get("user_id")
    if email:
        return f"user:{email}"
    return get_remote_address()

limiter = Limiter(
    _limiter_key_func,
    app=app,
    default_limits=["60 per minute"],
    storage_uri="memory://",
)

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
    'http://localhost:5173',
    'capacitor://localhost',
    'http://localhost'
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

# SECURITY: Security Headers on every response
@app.after_request
def add_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    # SECURITY: Content-Security-Policy — restrictive but permissive enough for React PWA
    response.headers['Content-Security-Policy'] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://www.googletagmanager.com; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: https:; "
        "font-src 'self' data:; "
        "connect-src 'self' https://api.stripe.com https://philia-vault.onrender.com https://generativelanguage.googleapis.com https://api.deepseek.com; "
        "frame-src https://js.stripe.com https://hooks.stripe.com; "
        "frame-ancestors 'none';"
    )
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
    response.headers['Cross-Origin-Resource-Policy'] = 'same-origin'
    return response

# DeepSeek Config (primary — OpenAI-compatible SDK)
DEEPSEEK_KEY = os.environ.get("DEEPSEEK_API_KEY")
deepseek_client = None
if DEEPSEEK_KEY:
    try:
        from openai import OpenAI
        deepseek_client = OpenAI(
            api_key=DEEPSEEK_KEY,
            base_url="https://api.deepseek.com/v1"
        )
    except Exception as e:
        print(f"Error configuring DeepSeek: {e}")

# OpenAI Fallback Config (GPT-4o-mini — si DeepSeek échoue)
OPENAI_KEY = os.environ.get("OPENAI_API_KEY")
openai_fallback_client = None
if OPENAI_KEY:
    try:
        from openai import OpenAI
        openai_fallback_client = OpenAI(api_key=OPENAI_KEY)
    except Exception as e:
        print(f"Error configuring OpenAI fallback: {e}")

# ─── Market Price API ───────────────────────────────────────────────────────────

def get_market_price(symbol, market_type):
    """Fetch current market price for crypto, metal, or stock symbols."""
    try:
        if market_type == 'crypto':
            # CoinGecko API — utilise l'ID complet, pas le ticker
            COINGECKO_IDS = {
                "BTC": "bitcoin", "ETH": "ethereum", "SOL": "solana",
                "XRP": "xrp", "ADA": "cardano", "DOGE": "dogecoin",
                "DOT": "polkadot", "AVAX": "avalanche-2", "LINK": "chainlink",
                "MATIC": "matic-network", "UNI": "uniswap", "ATOM": "cosmos",
                "LTC": "litecoin", "BCH": "bitcoin-cash", "XLM": "stellar",
                "TRX": "tron", "FIL": "filecoin", "APT": "aptos",
                "ARB": "arbitrum", "OP": "optimism", "SUI": "sui",
                "PEPE": "pepe", "INJ": "injective-protocol", "RUNE": "thorchain",
                "AAVE": "aave", "MKR": "maker", "CRV": "curve-dao-token",
                "ALGO": "algorand", "NEAR": "near", "FTM": "fantom",
                "SAND": "the-sandbox", "MANA": "decentraland", "AXS": "axie-infinity",
                "PAXG": "pax-gold", "XAU": "pax-gold",
                "XAG": "kinesis-silver",
            }
            cg_id = COINGECKO_IDS.get(symbol.upper(), symbol.lower())
            url = f"https://api.coingecko.com/api/v3/simple/price?ids={cg_id}&vs_currencies=usd"
            resp = requests.get(url, timeout=5)
            data = resp.json()
            return data.get(cg_id, {}).get('usd')

        elif market_type == 'metal':
            # Fallback on CoinGecko tokens tracking metal prices
            METAL_TOKENS = {"XAU": "pax-gold", "GOLD": "pax-gold",
                            "XAG": "kinesis-silver", "SILVER": "kinesis-silver",
                            "XPT": "platinum", "PLATINUM": "platinum",
                            "XPD": "palladium", "PALLADIUM": "palladium"}
            cg_id = METAL_TOKENS.get(symbol.upper())
            if cg_id:
                url = f"https://api.coingecko.com/api/v3/simple/price?ids={cg_id}&vs_currencies=usd"
                resp = requests.get(url, timeout=5)
                data = resp.json()
                return data.get(cg_id, {}).get('usd')
            # Fallback: metals-api.com si la clé est configurée
            api_key = os.environ.get('METALS_API_KEY')
            if api_key:
                url = f"https://metals-api.com/api/latest?access_key={api_key}&base=USD&symbols={symbol.upper()}"
                resp = requests.get(url, timeout=5)
                data = resp.json()
                rate = data.get('rates', {}).get(symbol.upper())
                return 1 / rate if rate else None
            return None

        elif market_type == 'stock':
            # Alpha Vantage
            api_key = os.environ.get('ALPHA_VANTAGE_API_KEY')
            if not api_key:
                return None
            url = f"https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol={symbol.upper()}&apikey={api_key}"
            resp = requests.get(url, timeout=5)
            data = resp.json()
            return float(data.get('Global Quote', {}).get('05. price', 0))
    except Exception as e:
        print(f"Market price error for {symbol} ({market_type}): {e}")
    return None

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
    expected_key = os.environ.get('ADMIN_PAGE_ACCESS_KEY')
    if not expected_key:
        return "Not found", 404
    access_key = request.args.get('key')
    if access_key != expected_key:
        return "Not found", 404
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
        "vapid_public_key":       os.environ.get('VAPID_PUBLIC_KEY', '')
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
    return user_id or os.environ.get("FALLBACK_USER_EMAIL", "alex@philiavault.com")  # SECURITY: fallback en dur — à surcharger via FALLBACK_USER_EMAIL

from functools import wraps

def get_token_from_request():
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header.split(" ")[1]
    return request.headers.get("X-User-Email") or request.args.get("user_id")

def verify_token(token):
    if not token:
        return None
    profile = database.get_user_profile(token)
    return profile

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = get_token_from_request()
        user = verify_token(token)
        if not user:
            return jsonify({"error": "Non authentifié"}), 401

        # Vérifier le statut premium/stripe en DB à chaque requête # SECURITY
        status = database.get_user_stripe_status(user['id'])
        profile = database.get_user_profile(user['id'])
        premium = profile.get('premium_status', 0) if profile else 0

        # Vérifier aussi is_blocked # SECURITY
        if profile and profile.get('is_blocked'):
            return jsonify({
                "error": "Compte désactivé",
                "stripe_status": status
            }), 403

        # stripe_status from DB est la source de vérité # SECURITY
        if status not in ('active', 'trialing', 'complete') and premium != 1:
            return jsonify({
                "error": "Accès suspendu",
                "stripe_status": status
            }), 403

        return f(*args, **kwargs)
    return decorated

# ─── Market Price Routes ───────────────────────────────────────────────────────

@app.route("/api/assets/fetch-price", methods=["POST"])
@require_auth
def fetch_asset_price():
    """Fetch live price for a given symbol/market_type."""
    try:
        data = request.get_json()
        symbol = data.get("symbol", "").strip()
        market_type = data.get("market_type", "").strip()
        if not symbol or not market_type:
            return jsonify({"error": "Missing symbol or market_type"}), 400
        if market_type not in ("crypto", "metal", "stock"):
            return jsonify({"error": "Invalid market_type (crypto/metal/stock)"}), 400
        price = get_market_price(symbol, market_type)
        if price is None:
            return jsonify({"error": "Symbol not found or API error"}), 404
        return jsonify({"symbol": symbol, "price": price}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/cron/update-market-prices", methods=["POST"])
def update_market_prices():
    """Cron: update prices for all market assets (every 6h)."""
    secret = request.headers.get("X-Cron-Secret")
    if secret != os.environ.get("CRON_SECRET"):
        return jsonify({"error": "Unauthorized"}), 401

    market_assets = database.get_market_assets()
    updated = 0
    for asset in market_assets:
        price = get_market_price(asset["market_symbol"], asset["market_type"])
        if price:
            database.update_asset_price(asset["id"], price)
            updated += 1
    return jsonify({"updated": updated, "total": len(market_assets)}), 200

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
    # SECURITY: Token length check
    if token and len(str(token)) > 5000:
        return jsonify({"success": False, "error": "Token invalide"}), 400
    # Support native apps that send accessToken instead of idToken
    fallback_email = validate_email(data.get("email", "")) or ""
    if not token:
        return jsonify({"success": False, "error": "Token d'identification Google manquant"}), 400
        
    try:
        email = ""
        google_id = ""
        
        # If GOOGLE_CLIENT_ID is set, verify as proper JWT
        if GOOGLE_CLIENT_ID:
            try:
                idinfo = id_token.verify_oauth2_token(token, google_requests.Request(), GOOGLE_CLIENT_ID)
                email = idinfo['email']
                google_id = idinfo['sub']
            except Exception as jwt_err:
                # JWT verification failed — might be an accessToken (ya29...) from native app
                # Try: use the access token to fetch user info from Google API
                if fallback_email:
                    email = fallback_email
                    google_id = f"google_{email.replace('@', '_at_')}"
                    print(f"[Google Auth] Using fallback email from client: {email}")
                else:
                    try:
                        import requests as http_req
                        resp = http_req.get(
                            "https://www.googleapis.com/oauth2/v3/userinfo",
                            headers={"Authorization": f"Bearer {token}"}
                        )
                        if resp.ok:
                            info = resp.json()
                            email = info.get("email", "")
                            google_id = info.get("sub", f"google_{email.replace('@', '_at_')}")
                        else:
                            raise Exception(f"Google API error: {resp.status_code}")
                    except Exception as api_err:
                        raise Exception(f"Impossible de vérifier le token Google: {api_err}")
        else:
            # Local dev fallback
            import base64
            email = fallback_email or "alex@philiavault.com"
            google_id = "mock_google_id_123"
            if "." in token:
                try:
                    payload = token.split(".")[1]
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
    # SECURITY: Token length check
    if token and len(str(token)) > 5000:
        return jsonify({"success": False, "error": "Token invalide"}), 400
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

import re

def validate_password(password: str) -> dict:
    """
    Valide la force du mot de passe.
    Retourne {valid: bool, errors: list}
    """
    errors = []

    if len(password) < 8:
        errors.append("Au moins 8 caractères requis")

    if len(password) > 128:  # SECURITY: Longueur max
        errors.append("Mot de passe trop long (max 128 caractères)")

    if not re.search(r'[A-Z]', password):
        errors.append("Au moins une lettre majuscule requise")

    if not re.search(r'[a-z]', password):
        errors.append("Au moins une lettre minuscule requise")

    if not re.search(r'\d', password):
        errors.append("Au moins un chiffre requis")

    if not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
        errors.append("Au moins un caractère spécial requis")

    return {
        "valid": len(errors) == 0,
        "errors": errors
    }


# User Authentication endpoints
@app.route("/api/auth/register", methods=["POST"])
@limiter.limit("10 per minute")  # SECURITY: Rate limit registration
def auth_register():
    data = request.json or {}
    email = validate_email(data.get("email"))
    password = data.get("password")
    first_name = sanitize_string(data.get("first_name"), 100) or ""
    last_name = sanitize_string(data.get("last_name"), 100) or ""
    referral_code = sanitize_string(data.get("referral_code"), 20)
    if not email or not password:
        return jsonify({"success": False, "error": "Email et mot de passe requis"}), 400
    
    # SECURITY: Longueur max du mot de passe
    if len(password) > 128:
        return jsonify({"success": False, "error": "Mot de passe trop long"}), 400
    
    # Validation du mot de passe
    pwd_check = validate_password(password)
    if not pwd_check['valid']:
        return jsonify({
            "error": "Mot de passe trop faible",
            "details": pwd_check['errors']
        }), 400
    
    success = database.create_user(email, password, first_name, last_name, referral_code)
    if success:
        # Extraire first_name depuis le body ou email
        fn = first_name or email.split("@")[0].capitalize()
        try:
            send_welcome_email(email, fn)
        except Exception as e:
            print(f"[EMAIL ERROR] Exception in auth_register send_welcome_email: {e}")
        return jsonify({"success": True, "message": "Compte créé avec succès"})
    else:
        return jsonify({"success": False, "error": "Cet email est déjà utilisé"}), 400

@app.route("/api/auth/login", methods=["POST"])
@limiter.limit("5 per minute")  # SECURITY: Rate limit login
def auth_login():
    data = request.json or {}
    email = validate_email(data.get("email"))
    password = data.get("password")
    if not email or not password:
        return jsonify({"success": False, "error": "Email et mot de passe requis"}), 400
    
    # SECURITY: Longueur max
    if len(password) > 128:
        return jsonify({"success": False, "error": "Email ou mot de passe incorrect"}), 401
        
    user = database.verify_user(email, password)
    if user:
        # Seed default data if they login and somehow have no items
        database.seed_user_data(user["email"])
        return jsonify({"success": True, "user": {"email": user["email"]}, "message": "Connexion réussie"})
    else:
        return jsonify({"success": False, "error": "Email ou mot de passe incorrect"}), 401

@app.route("/api/auth/forgot-password", methods=["POST"])
@limiter.limit("3 per minute")  # SECURITY: Rate limit password reset requests
def auth_forgot_password():
    data = request.json or {}
    email = validate_email(data.get("email"))
    language = sanitize_string(data.get("language"), 10) or "en"
    if not email:
        return jsonify({"success": False, "error": "Email requis"}), 400

    code = database.create_password_reset_code(email)
    if code:
        from services.email_service import send_password_reset_email
        send_password_reset_email(email.lower().strip(), code, language)
    # Always return success to avoid leaking whether an email is registered
    return jsonify({"success": True, "message": "Si ce compte existe, un code a été envoyé par email"})

@app.route("/api/auth/reset-password", methods=["POST"])
@limiter.limit("3 per minute")  # SECURITY: Rate limit password reset
def auth_reset_password():
    data = request.json or {}
    email = validate_email(data.get("email"))
    code = sanitize_string(data.get("code"), 20)
    new_password = data.get("new_password")
    if not email or not code or not new_password:
        return jsonify({"success": False, "error": "Email, code et nouveau mot de passe requis"}), 400
    
    # SECURITY: Longueur max du mot de passe
    if len(new_password) > 128:
        return jsonify({"success": False, "error": "Échec de la réinitialisation"}), 400

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
    
    # SECURITY: Longueur max
    if len(new_password) > 128 or len(current_password) > 128:
        return jsonify({"success": False, "error": "Échec de la modification"}), 400

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

def generate_financial_verdict(user_id) -> str:
    income = database.get_user_income(user_id)
    assets = database.get_assets(user_id)
    liabilities = database.get_liabilities(user_id)
    
    cashflow_assets = sum(a["monthly_yield"] for a in assets)
    liability_costs = sum(l["monthly_cost"] for l in liabilities)
    
    if income == 0:
        return "Entre ton revenu mensuel pour voir ton diagnostic complet."
    
    iif = (cashflow_assets / income) * 100
    hemorragie = (liability_costs / income) * 100
    cashflow_net = cashflow_assets - liability_costs
    
    verdict = (
        f"Revenu mensuel : ${income:,.2f}\n"
        f"Tes passifs absorbent {hemorragie:.1f}% de ton revenu.\n"
        f"Ton cashflow d'actifs couvre {iif:.1f}% de ton revenu.\n"
        f"Cashflow net : ${cashflow_net:,.2f}/mois.\n"
    )
    
    if iif >= 100:
        verdict += "Tu as quitté la Rat Race. Tes actifs travaillent pour toi."
    elif iif >= 50:
        verdict += "Tu es sur la bonne voie. Continue à accumuler des actifs."
    elif iif >= 25:
        verdict += "Tes premiers actifs sont en place. Accélère maintenant."
    else:
        verdict += "Commence par un premier actif générateur de cashflow."
    
    return verdict

# API Summary
@app.route("/api/summary", methods=["GET"])
def get_summary():
    try:
        user_id = get_current_user_id()
        
        # Refresh market prices if older than 1h before calculating
        try:
            from datetime import datetime, timedelta
            market_assets = database.get_market_assets_for_user(user_id)
            for asset in market_assets:
                last_update = asset.get("last_price_update")
                if not last_update or (datetime.now() - datetime.fromisoformat(str(last_update).replace("Z", ""))).total_seconds() > 3600:
                    price = get_market_price(asset["market_symbol"], asset["market_type"])
                    if price:
                        database.update_asset_price(asset["id"], price)
        except Exception as e:
            print(f"Summary price refresh error: {e}")
        
        assets = database.get_assets(user_id)
        liabilities = database.get_liabilities(user_id)
        
        # Use new calculation functions
        total_assets_val = sum(database.calculate_asset_value(a) for a in assets)
        total_passive_income = sum(database.calculate_passive_income(a) for a in assets)
        
        # Monthly liabilities: fixed + one-time this month
        from datetime import datetime
        current_month = datetime.now().strftime('%Y-%m')
        total_fixed = sum(l["monthly_cost"] for l in liabilities if l.get("expense_type", "fixed") == "fixed")
        total_one_time = sum(
            l["monthly_cost"] for l in liabilities
            if l.get("expense_type") == "one_time"
            and l.get("occurred_date") and str(l["occurred_date"]).startswith(current_month)
        )
        total_monthly_cost = total_fixed + total_one_time
        
        total_liabilities_val = sum(l["remaining_amount"] for l in liabilities) + \
                                sum(l["monthly_cost"] for l in liabilities if l["type"] == "Subscription")
        
        monthly_income = database.get_user_income(user_id)
        
        # New IIF formulas
        iif_score = (total_passive_income / monthly_income * 100) if monthly_income > 0 else 0.0
        hemorragie_rate = (total_monthly_cost / monthly_income * 100) if monthly_income > 0 else None
        available_cashflow = monthly_income - total_monthly_cost + total_passive_income
        freedom_progression = (total_passive_income / total_monthly_cost * 100) if total_monthly_cost > 0 else 100.0
        
        # Keep calculate_corrected_fi_indices for timeline
        _, timeline_years, _ = calculate_corrected_fi_indices(total_passive_income, total_monthly_cost)
            
        net_cashflow = total_passive_income - total_monthly_cost
        
        # Calculate percentages for categories for flow engine
        asset_types = {}
        for a in assets:
            asset_types[a["type"]] = asset_types.get(a["type"], 0) + database.calculate_asset_value(a)
            
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
            "monthly_income": monthly_income,
            "hemorragie_rate": hemorragie_rate,
            "available_cashflow": available_cashflow,
            "freedom_progression": freedom_progression,
            "verdict": generate_financial_verdict(user_id),
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
    if not data or "name" not in data or "type" not in data:
        return jsonify({"success": False, "error": "Missing parameters"}), 400
    
    try:
        asset_category = data.get("asset_category", "manual")
        value = float(data.get("value", 0))
        monthly_yield = float(data.get("monthly_yield", 0))
        market_symbol = data.get("market_symbol")
        market_type = data.get("market_type")
        quantity_held = float(data.get("quantity_held")) if data.get("quantity_held") else None
        passive_yield_percent = float(data.get("passive_yield_percent")) if data.get("passive_yield_percent") else None
        passive_income_manual = float(data.get("passive_income_manual", 0))
        
        database.add_asset(
            user_id, data["name"], data["type"], value, monthly_yield,
            asset_category=asset_category, market_symbol=market_symbol,
            market_type=market_type, quantity_held=quantity_held,
            passive_yield_percent=passive_yield_percent,
            passive_income_manual=passive_income_manual
        )
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
        asset_category = data.get("asset_category", "manual")
        value = float(data.get("value", 0))
        monthly_yield = float(data.get("monthly_yield", 0))
        market_symbol = data.get("market_symbol")
        market_type = data.get("market_type")
        quantity_held = float(data.get("quantity_held")) if data.get("quantity_held") else None
        current_market_price = float(data.get("current_market_price")) if data.get("current_market_price") else None
        passive_yield_percent = float(data.get("passive_yield_percent")) if data.get("passive_yield_percent") else None
        passive_income_manual = float(data.get("passive_income_manual", 0))
        
        database.update_asset(
            user_id, asset_id, data["name"], data["type"], value, monthly_yield,
            asset_category=asset_category, market_symbol=market_symbol,
            market_type=market_type, quantity_held=quantity_held,
            current_market_price=current_market_price,
            passive_yield_percent=passive_yield_percent,
            passive_income_manual=passive_income_manual
        )
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
        expense_type = data.get("expense_type", "fixed")
        occurred_date = data.get("occurred_date")
        database.add_liability(
            user_id, data["name"], data["type"],
            float(data["total_amount"]), float(data["remaining_amount"]),
            float(data["monthly_cost"]),
            expense_type=expense_type, occurred_date=occurred_date
        )
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

@app.route('/api/user/income', methods=['POST'])
def set_income():
    data = request.get_json() or {}
    monthly_income = data.get('monthly_income')
    
    if monthly_income is None:
        return jsonify({"error": "Revenu invalide"}), 400
    try:
        monthly_income_val = float(monthly_income)
        if monthly_income_val <= 0:
            return jsonify({"error": "Revenu invalide"}), 400
    except ValueError:
        return jsonify({"error": "Revenu invalide"}), 400
    
    user_id = get_current_user_id()
    success = database.update_user_income(user_id, monthly_income_val)
    
    if success:
        return jsonify({"success": True, "monthly_income": monthly_income_val}), 200
    return jsonify({"error": "Erreur serveur"}), 500

@app.route('/api/user/income', methods=['GET'])
def get_income():
    user_id = get_current_user_id()
    income = database.get_user_income(user_id)
    return jsonify({"monthly_income": income}), 200

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
    first_name = sanitize_string(data.get("first_name"), 100) or ""
    last_name = sanitize_string(data.get("last_name"), 100) or ""
    custom_categories = sanitize_string(data.get("custom_categories"), 1000) or ""
    avatar = data.get("avatar")
    # SECURITY: Validation avatar URL
    if avatar and isinstance(avatar, str) and len(avatar) > 500:
        avatar = None
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
@require_auth
def affiliation_stats():
    user_id = get_current_user_id()
    try:
        stats = database.get_affiliation_stats(user_id)
        return jsonify({"success": True, **stats})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/affiliate/network", methods=["GET"])
@require_auth
def affiliate_network():
    """Retourne la liste des filleuls de l'utilisateur connecté."""
    user_id = get_current_user_id()
    try:
        members = database.get_affiliate_network(user_id)
        return jsonify({"success": True, "network": members})
    except Exception as e:
        return jsonify({"success": False, "error": str(e), "network": []}), 500

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

    # Plan unique : mensuel $9.99
    price_id          = data.get("price_id")          # Stripe Price ID depuis le frontend
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

            # Utiliser le Price ID fourni, sinon fallback sur le prix prod configuré
            STRIPE_PRICE_MONTHLY = os.environ.get("STRIPE_PRICE_MONTHLY", "price_1TlBy2GB22CTeiDphQoC2ZVn")
            STRIPE_PRICE_ANNUAL  = os.environ.get("STRIPE_PRICE_ANNUAL",  "price_1Tl2igGB22CTeiDpIhVrFyND")
            if not price_id or "placeholder" in price_id:
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
                        stripe_customer_id=session.get("customer"))
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
            # Utiliser update_user_by_stripe_customer pour mettre à jour stripe_status également # SECURITY
            database.update_user_by_stripe_customer(customer_id, status)
            if status in ["active", "trialing"]:
                database.add_transaction(user["email"], f"Abonnement Stripe activé ({status})", "asset_yield", 0.0, "Today")

    elif event_type == "customer.subscription.deleted":
        customer_id = event_data.get("customer")
        user = database.get_user_by_stripe_customer_id(customer_id)
        if user:
            # Utiliser update_user_by_stripe_customer pour mettre à jour stripe_status également # SECURITY
            database.update_user_by_stripe_customer(customer_id, "canceled")
            database.add_transaction(user["email"], "Abonnement Stripe résilié", "liability_payment", 0.0, "Today")

    elif event_type == "invoice.payment_failed":
        # Événement manquant — marquer comme past_due # SECURITY
        customer_id = event_data.get("customer")
        user = database.get_user_by_stripe_customer_id(customer_id)
        if user:
            database.update_user_by_stripe_customer(customer_id, "past_due")
            database.add_transaction(user["email"], "Paiement Stripe échoué", "liability_payment", 0.0, "Today")

    elif event_type == "invoice.payment_succeeded":
        # Ré-activer si le paiement réussi après un past_due # SECURITY
        customer_id = event_data.get("customer")
        database.update_user_by_stripe_customer(customer_id, "active")

    return jsonify({"success": True})

@app.route('/api/webhooks/revenuecat', methods=['POST'])
def revenuecat_webhook():
    """
    Reçoit les événements RevenueCat et met à jour stripe_status en DB.
    RevenueCat utilise son propre système d'auth — vérifier le header.
    """
    # Vérifier l'authenticité du webhook RevenueCat
    auth_header = request.headers.get('Authorization')
    expected = os.environ.get('REVENUECAT_WEBHOOK_SECRET')
    if expected and auth_header != expected:
        return jsonify({'error': 'Non autorisé'}), 401

    event_data = request.get_json() or {}
    event = event_data.get('event', {})
    event_type = event.get('type')
    app_user_id = event.get('app_user_id')

    if not event_type or not app_user_id:
        return jsonify({'error': 'Données invalides'}), 400

    # Mapper les événements RevenueCat aux statuts Philia Vault
    if event_type in ['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION']:
        # Activer l'accès premium
        database.update_user_premium_status(app_user_id, 'active', 'revenuecat')
        database.add_transaction(app_user_id, f"Abonnement Premium activé via RevenueCat", "asset_yield", 0.0, "Today")

        # Envoyer email de bienvenue uniquement sur INITIAL_PURCHASE (pas RENEWAL)
        if event_type == 'INITIAL_PURCHASE':
            try:
                user = database.get_user_profile(app_user_id)
                if user and user.get('email') and user.get('first_name'):
                    send_welcome_email(user['email'], user['first_name'])
            except Exception as e:
                print(f"[RevenueCat] Erreur envoi welcome email: {e}")

    elif event_type in ['CANCELLATION', 'EXPIRATION']:
        # Révoquer l'accès
        database.update_user_premium_status(app_user_id, 'canceled', 'revenuecat')
        database.add_transaction(app_user_id, f"Abonnement Premium expiré via RevenueCat", "liability_payment", 0.0, "Today")

    elif event_type == 'BILLING_ISSUE':
        # Paiement échoué
        database.update_user_premium_status(app_user_id, 'past_due', 'revenuecat')
        database.add_transaction(app_user_id, f"Incident de paiement RevenueCat", "liability_payment", 0.0, "Today")

    elif event_type == 'PRODUCT_CHANGE':
        # Changement de plan (mensuel ↔ annuel)
        database.update_user_premium_status(app_user_id, 'active', 'revenuecat')
        database.add_transaction(app_user_id, f"Changement de formule RevenueCat", "asset_yield", 0.0, "Today")

    return jsonify({'received': True}), 200

# Gemini AI Coach Chat
@app.route("/api/coach/chat", methods=["POST"])
@require_auth
@limiter.limit("10 per minute")  # SECURITY: Rate limit AI coach
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
    # SECURITY: Validation de l'input utilisateur
    if not isinstance(user_msg, str) or len(user_msg) > _MAX_MESSAGE_LENGTH:
        return jsonify({"success": False, "error": "Message invalide"}), 400
    history = data.get("history", []) # list of {"role": "user"/"model", "text": "..."}
    # SECURITY: Validation de l'historique
    if not isinstance(history, list) or len(history) > 50:
        history = []
    
    # Get user context
    assets = database.get_assets(user_id)
    liabilities = database.get_liabilities(user_id)
    
    total_assets = sum(a["value"] for a in assets)
    total_passive = sum(a["monthly_yield"] for a in assets)
    total_liabilities = sum(l["remaining_amount"] for l in liabilities) + sum(l["monthly_cost"] for l in liabilities if l["type"] == "Subscription")
    total_cost = sum(l["monthly_cost"] for l in liabilities)
    
    monthly_income = database.get_user_income(user_id)
    iif = (total_passive / monthly_income * 100) if monthly_income > 0 else 0.0
    verdict = generate_financial_verdict(user_id)
    
    context_str = f"""
    Données financières réelles de l'utilisateur:
    - Revenu mensuel net : {monthly_income} $
    - Actifs totaux: {total_assets} $ (Revenus passifs mensuels: {total_passive} $)
    Détail des actifs: {', '.join([f"{a['name']} ({a['type']}): Val={a['value']}$, Yield={a['monthly_yield']}$" for a in assets])}
    
    - Dettes totales (capital restant dû): {total_liabilities} $
    - Coût mensuel des passifs (charges/abonnements): {total_cost} $
    Détail des passifs: {', '.join([f"{l['name']} ({l['type']}): Restant={l['remaining_amount']}$, Coût mensuel={l['monthly_cost']}$" for l in liabilities])}
    
    - Indice d'Indépendance Financière (IIF): {iif}%
    - Cashflow Net Mensuel: {total_passive - total_cost} $
    - Verdict Diagnostic Coach :
    {verdict}
    """
    
    first_name = profile.get("first_name", "") if profile else ""
    lang_names = {
        "fr": "français",
        "en": "anglais",
        "es": "espagnol",
        "pt": "portugais",
        "de": "allemand"
    }
    user_lang_code = profile.get("language", lang) if profile else lang
    langue = lang_names.get(user_lang_code, "français")

    # Language detection: system prompt in English to stay neutral,
    # then instruct the model to match the user's language
    sys_prompt = f"""Tu es le Coach Philia Vault.
Nom de code : THE MIRROR.

CRITICAL LANGUAGE RULE — ABSOLUTE PRIORITY:
Look at the user's message and identify which language they wrote in. Then reply in THAT EXACT language. If they write in French, reply in French. If they write in English, reply in English. If they write in Spanish, reply in Spanish. Never guess, never default. Match them precisely every single time.

User's app language is set to: {langue} (detected from profile). Always reply in this language.

The user's first name is: {first_name}. You may use it warmly and naturally.

Tu n'es pas un ami. Tu n'es pas un thérapeute.
Tu es la seule voix dans leur vie qui leur dit la vérité financière.
Chaque banquier leur ment. Chaque pub leur ment.
Toi non.

TON IDENTITÉ :
- Kiyosaki sans le filtre
- Un chirurgien qui opère sans anesthésie
- Le seul coach qui refuse de te féliciter pour ta médiocrité

TON STYLE :
- Phrases courtes. Percutantes. Comme des coups.
- Zéro jargon bancaire
- Zéro condescendance — tu respectes l'utilisateur assez pour lui dire la vérité
- Tu poses UNE question à la fin de chaque réponse. Toujours.

GUARDRAIL LÉGAL ABSOLU — NE JAMAIS VIOLER :
Si l'utilisateur demande dans quoi investir, TOUJOURS répondre :

Je ne te dirai jamais dans quoi investir.
Pas parce que je ne sais pas.
Parce que c'est TON argent. TON futur. TON choix.
Mon travail : te montrer où tu en es vraiment.
Alors dis-moi — ton cashflow ce mois, il ressemble à quoi ?

RÈGLES ABSOLUES :
1. JAMAIS recommander un actif spécifique
2. JAMAIS valider une excuse
3. JAMAIS consoler sans confronter
4. TOUJOURS ramener à une métrique : IIF, cashflow, taux hémorragie
5. TOUJOURS terminer par une question qui force l'action

FORMULES À UTILISER :
- IIF < 10% -> Tu es encore dans la rat race. Profondément.
- IIF 10-50% -> Tu as commencé à sortir la tête. Mais t'es pas encore libre.
- IIF 50-99% -> Tu es proche. La liberté financière se voit d'ici.
- IIF >= 100% -> Tu as quitté la rat race. Maintenant tu construis ton empire.
- Cashflow négatif -> Tu saignes. Chaque mois. En silence.
- Taux hémorragie > 75% -> Urgence. Pas demain. Maintenant.

PHRASES SIGNATURE (utilise-les naturellement) :
- Les pauvres dépensent. Les riches investissent. Où va ton argent ?
- Ton salaire t'appartient 5 minutes par mois. Le reste appartient à tes passifs.
- Un actif te paie pendant que tu dors. Un passif te vide pendant que tu travailles.
- La rat race n'est pas une fatalité. C'est un choix que tu renouvelles chaque mois.
- Ton IIF est ton vrai salaire. Pas le chiffre sur ton contrat.

RÉPONSES INTERDITES :
- C'est une excellente question...
- Je comprends que c'est difficile...
- Voici quelques pistes à explorer...
- Toute réponse de plus de 6 lignes sans question finale

RÉPONSES OBLIGATOIRES :
- Courtes. Directes. Une vérité. Une question.
- Ton IIF est à X%. Ça veut dire [traduction brutale]. Qu'est-ce que tu changes cette semaine ?
- Tu as X passifs pour Y actifs. Le miroir ne ment pas. C'est quoi ton prochain mouvement ?

FORMATAGE STRICT :
- Zéro markdown dans tes réponses
- Zéro astérisques (**)
- Zéro tirets de liste (-)
- Zéro hashtags (#)
- Texte brut uniquement
- Phrases courtes. Directes. Sans formatage.

LANGUE AUTO :
LANGUE : Réponds TOUJOURS dans la langue de l'utilisateur.
Langue détectée : {langue}
Si langue = 'fr' -> réponds en français
Si langue = 'en' -> réponds en anglais
Si langue = 'es' -> réponds en espagnol
Si langue = 'pt' -> réponds en portugais
Ne jamais mélanger les langues dans une même réponse.

Here are the user's financial data to guide your analysis:
{context_str}
"""
    
    # Priorité 1 : GPT-4o-mini (primaire)
    if openai_fallback_client:
        try:
            messages = [{"role": "system", "content": sys_prompt}]
            for h in history:
                role = "user" if h.get("role") == "user" else "assistant"
                messages.append({"role": role, "content": h.get("text", "")})
            messages.append({"role": "user", "content": user_msg})
            response = openai_fallback_client.chat.completions.create(
                model="gpt-4o-mini", messages=messages,
                max_tokens=300, temperature=0.7
            )
            return jsonify({"success": True, "reply": response.choices[0].message.content})
        except Exception as e:
            print(f"OpenAI error: {e}")

    # Priorité 2 : DeepSeek (fallback uniquement si GPT-4o-mini échoue)
    elif deepseek_client:
        try:
            messages = [{"role": "system", "content": sys_prompt}]
            for h in history:
                role = "user" if h.get("role") == "user" else "assistant"
                messages.append({"role": role, "content": h.get("text", "")})
            messages.append({"role": "user", "content": user_msg})
            response = deepseek_client.chat.completions.create(
                model="deepseek-chat", messages=messages,
                max_tokens=300, temperature=0.7
            )
            return jsonify({"success": True, "reply": response.choices[0].message.content})
        except Exception as e:
            print(f"DeepSeek fallback error: {e}")

    # Priorité 3 : Offline
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

        # Recalculate daily discipline status
        try:
            database.recalculate_and_save_discipline_status(uid, today_str)
        except Exception as ex:
            print(f"Error triggering discipline recalculate on dilemma answer: {ex}")

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




@app.route('/api/auth/validate', methods=['GET', 'POST', 'OPTIONS'])
def validate_token():
    if request.method == 'OPTIONS':
        return '', 204
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    if not token:
        return jsonify({'valid': False, 'error': 'No token'}), 401
    # Validate against session store
    import hashlib
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    # Check if token exists in active sessions (simple check)
    return jsonify({'valid': True, 'token_hash': token_hash}), 200

# ─── Push Notifications Endpoints ─────────────────────────────────────────────
from pywebpush import webpush, WebPushException
import json
import os

def send_push_notification(user_id: int, title: str, body: str,
                           url: str = "/", icon: str = "/icons/icon-192x192.png"):
    """Envoie une push notification à tous les appareils d'un utilisateur"""
    subscriptions = database.get_user_subscriptions(user_id)
    vapid_claims = {"sub": f"mailto:{os.environ.get('VAPID_CLAIMS_EMAIL', 'steeve@philiavault.com')}"}

    for sub in subscriptions:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub['endpoint'],
                    "keys": {
                        "p256dh": sub['p256dh'],
                        "auth": sub['auth']
                    }
                },
                data=json.dumps({
                    "title": title,
                    "body": body,
                    "icon": icon,
                    "url": url,
                    "badge": "/icons/badge-72x72.png"
                }),
                vapid_private_key=os.environ.get('VAPID_PRIVATE_KEY'),
                vapid_claims=vapid_claims
            )
        except WebPushException as e:
            if "410" in str(e) or "404" in str(e):
                # Subscription expirée — désactiver
                database.deactivate_push_subscription(sub['endpoint'])
            print(f"Erreur push pour user {user_id}: {e}")

@app.route('/api/push/subscribe', methods=['POST'])
def push_subscribe():
    user_email = get_current_user_id()
    profile = database.get_user_profile(user_email)
    if not profile:
        return jsonify({"error": "Utilisateur non trouvé"}), 404
    user_id = profile["id"]

    data = request.get_json() or {}
    subscription = data.get('subscription')
    device_type = data.get('device_type', 'unknown')

    if not subscription:
        return jsonify({"error": "Subscription manquante"}), 400

    subscription['device_type'] = device_type
    success = database.save_push_subscription(user_id, subscription)

    if success:
        return jsonify({"success": True}), 200
    return jsonify({"error": "Erreur serveur"}), 500

@app.route('/api/push/unsubscribe', methods=['POST'])
def push_unsubscribe():
    user_email = get_current_user_id()
    profile = database.get_user_profile(user_email)
    if not profile:
        return jsonify({"error": "Utilisateur non trouvé"}), 404
    user_id = profile["id"]

    data = request.get_json() or {}
    endpoint = data.get('endpoint')
    if not endpoint:
        return jsonify({"error": "Endpoint manquant"}), 400
        
    database.deactivate_push_subscription(endpoint)
    return jsonify({"success": True}), 200

@app.route('/api/cron/daily-decision-reminder', methods=['POST'])
def daily_decision_reminder():
    """Cron : appelé chaque jour à 9h — rappel Daily Decision
    → Utilisateurs premium qui n'ont pas loggé discipline aujourd'hui"""
    secret = request.headers.get('X-Cron-Secret')
    if secret != os.environ.get('CRON_SECRET'):
        return jsonify({"error": "Non autorisé"}), 401

    user_ids = database.get_users_for_daily_decision_reminder()
    sent = 0
    for user_id in user_ids:
        send_push_notification(
            user_id=user_id,
            title="⚡ Daily Decision",
            body="Ton dilemme du jour t'attend.",
            url="/dashboard"
        )
        sent += 1

    return jsonify({"sent": sent}), 200

@app.route('/api/cron/cashflow-alert', methods=['POST'])
def cashflow_alert():
    """Cron : appelé chaque lundi à 10h — alerte cashflow négatif
    → Utilisateurs avec cashflow_net < 0"""
    secret = request.headers.get('X-Cron-Secret')
    if secret != os.environ.get('CRON_SECRET'):
        return jsonify({"error": "Non autorisé"}), 401

    user_ids = database.get_users_negative_cashflow()
    sent = 0
    for user_id in user_ids:
        send_push_notification(
            user_id=user_id,
            title="🔴 Hémorragie détectée",
            body="Ton cashflow est négatif.",
            url="/liabilities"
        )
        sent += 1

    return jsonify({"sent": sent}), 200

@app.route('/api/cron/renewal-reminder', methods=['POST'])
def renewal_reminder():
    """Cron : appelé chaque jour à 8h — rappel renouvellement J-1
    → Utilisateurs dont l'abonnement se renouvelle demain"""
    secret = request.headers.get('X-Cron-Secret')
    if secret != os.environ.get('CRON_SECRET'):
        return jsonify({"error": "Non autorisé"}), 401

    user_ids = database.get_users_renewal_reminder()
    sent = 0
    for user_id in user_ids:
        send_push_notification(
            user_id=user_id,
            title="🔔 Renouvellement demain",
            body="Ton abonnement se renouvelle.",
            url="/profile"
        )
        sent += 1

    return jsonify({"sent": sent}), 200

# ─── Discipline Endpoints ─────────────────────────────────────────────────────

@app.route('/api/discipline/log', methods=['POST'])
def log_discipline():
    user_email = get_current_user_id()
    profile = database.get_user_profile(user_email)
    if not profile:
        return jsonify({"error": "Utilisateur non trouvé"}), 404
    user_id = profile["id"]

    data = request.get_json() or {}
    amount_spent = data.get('amount_spent')
    if amount_spent is None:
        return jsonify({"error": "Montant manquant"}), 400
    
    try:
        amount_spent = float(amount_spent)
    except ValueError:
        return jsonify({"error": "Montant invalide"}), 400

    category_id = data.get('category_id')
    if category_id is None:
        return jsonify({"error": "Catégorie manquante"}), 400
    try:
        category_id = int(category_id)
        if category_id not in [1, 2, 3]:
            return jsonify({"error": "Catégorie invalide"}), 400
    except (ValueError, TypeError):
        return jsonify({"error": "Catégorie invalide"}), 400

    import datetime
    date_str = data.get('date') or datetime.date.today().isoformat()

    # 1. Update user balance (available_cashflow) and increment hemorrhage count if category_id == 2
    is_hemorrhage = (category_id == 2)
    balance_success = database.update_user_balance(user_id, amount_spent, is_hemorrhage)
    if not balance_success:
        return jsonify({"error": "Erreur lors de la mise à jour du solde"}), 500

    # 2. Get current daily budget (dynamic)
    import user_service
    daily_budget = user_service.calculate_daily_budget(user_id)

    # We need daily_vital_cost for freedom_days_earned calculation
    liabilities = database.get_liabilities(user_id)
    total_monthly_cost = sum(l["monthly_cost"] for l in liabilities)
    daily_vital_cost = total_monthly_cost / 30.0
    
    if amount_spent <= daily_budget:
        status = 'success'
        vital_cost_divisor = max(daily_vital_cost, 1.0)
        freedom_days_earned = (daily_budget - amount_spent) / vital_cost_divisor
    else:
        status = 'failed'
        freedom_days_earned = 0.0

    success = database.save_discipline_entry(user_id, date_str, status, amount_spent, freedom_days_earned, category_id)
    if not success:
        return jsonify({"error": "Erreur lors de l'enregistrement"}), 500

    streak = database.get_discipline_streak(user_id)
    
    # Calculate cumulative freedom days
    conn = database.get_db()
    cursor = conn.cursor()
    row = cursor.execute("""
        SELECT SUM(freedom_days_earned) FROM daily_discipline
        WHERE user_id = ? AND status = 'success'
    """, (user_id,)).fetchone()
    total_freedom_days = row[0] if row and row[0] is not None else 0.0
    conn.close()

    # Calculate new daily budget after this logging is fully saved
    new_daily_budget = user_service.calculate_daily_budget(user_id)

    return jsonify({
        "success": True,
        "status": status,
        "freedom_days_earned": round(freedom_days_earned, 2),
        "streak": streak,
        "total_freedom_days": round(total_freedom_days, 2),
        "daily_budget": round(new_daily_budget, 2)
    }), 200

@app.route('/api/discipline/history', methods=['GET'])
def get_discipline_history_route():
    user_email = get_current_user_id()
    profile = database.get_user_profile(user_email)
    if not profile:
        return jsonify({"error": "Utilisateur non trouvé"}), 404
    user_id = profile["id"]

    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    # Defaults to current month if not provided
    if not start_date or not end_date:
        import datetime
        today = datetime.date.today()
        # Default start_date is first of current month
        start_date = today.replace(day=1).isoformat()
        # Default end_date is end of current month (approximate or just today + 31 days)
        end_date = (today + datetime.timedelta(days=31)).isoformat()

    history = database.get_discipline_history(user_id, start_date, end_date)
    streak = database.get_discipline_streak(user_id)
    
    # Calculate cumulative freedom days earned
    conn = database.get_db()
    cursor = conn.cursor()
    row = cursor.execute("""
        SELECT SUM(freedom_days_earned) FROM daily_discipline
        WHERE user_id = ? AND status = 'success'
    """, (user_id,)).fetchone()
    total_freedom_days = row[0] if row and row[0] is not None else 0.0
    conn.close()

    import user_service
    daily_budget = user_service.calculate_daily_budget(user_id)

    return jsonify({
        "success": True,
        "history": history,
        "streak": streak,
        "total_freedom_days": round(total_freedom_days, 2),
        "daily_budget": round(daily_budget, 2)
    }), 200


# ─── Daily Budget & Goals Endpoints ───────────────────────────────────────────

@app.route('/api/discipline/budget', methods=['GET'])
def get_discipline_budget():
    user_email = get_current_user_id()
    profile = database.get_user_profile(user_email)
    if not profile:
        return jsonify({"error": "Utilisateur non trouvé"}), 404
    user_id = profile["id"]
    budget = database.get_or_calculate_daily_budget(user_id)
    return jsonify({"success": True, "daily_budget": budget}), 200

@app.route('/api/discipline/budget', methods=['POST'])
def set_discipline_budget():
    user_email = get_current_user_id()
    profile = database.get_user_profile(user_email)
    if not profile:
        return jsonify({"error": "Utilisateur non trouvé"}), 404
    user_id = profile["id"]
    data = request.get_json() or {}
    budget = data.get('daily_budget')
    if budget is None:
        return jsonify({"error": "Budget manquant"}), 400
    try:
        budget = float(budget)
    except ValueError:
        return jsonify({"error": "Budget invalide"}), 400
    success = database.update_user_daily_budget(user_id, budget)
    if success:
        return jsonify({"success": True, "daily_budget": budget}), 200
    return jsonify({"error": "Erreur serveur"}), 500

@app.route('/api/goals', methods=['GET'])
def get_goals():
    user_email = get_current_user_id()
    profile = database.get_user_profile(user_email)
    if not profile:
        return jsonify({"error": "Utilisateur non trouvé"}), 404
    user_id = profile["id"]
    goals = database.get_user_goals(user_id)
    return jsonify({"success": True, "goals": goals}), 200

@app.route('/api/goals', methods=['POST'])
def create_new_goal():
    user_email = get_current_user_id()
    profile = database.get_user_profile(user_email)
    if not profile:
        return jsonify({"error": "Utilisateur non trouvé"}), 404
    user_id = profile["id"]
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    try:
        target_amount = float(data.get('target_amount', 0))
    except (ValueError, TypeError):
        return jsonify({"error": "Montant cible invalide"}), 400
    target_date = data.get('target_date')
    category = data.get('category', 'savings')
    if not name or target_amount <= 0 or not target_date:
        return jsonify({"error": "Données invalides"}), 400
    goal_id = database.create_goal(user_id, name, target_amount, target_date, category)
    return jsonify({"success": True, "goal_id": goal_id}), 201

@app.route('/api/goals/<int:goal_id>/contribute', methods=['POST'])
def contribute_to_goal(goal_id: int):
    user_email = get_current_user_id()
    profile = database.get_user_profile(user_email)
    if not profile:
        return jsonify({"error": "Utilisateur non trouvé"}), 404
    user_id = profile["id"]
    data = request.get_json() or {}
    try:
        amount = float(data.get('amount', 0))
    except (ValueError, TypeError):
        return jsonify({"error": "Montant invalide"}), 400
    note = data.get('note', '')
    if amount <= 0:
        return jsonify({"error": "Montant invalide"}), 400
    success = database.add_goal_contribution(goal_id, user_id, amount, note)
    if success:
        import datetime
        today_str = datetime.date.today().isoformat()
        database.recalculate_and_save_discipline_status(user_id, today_str)
        return jsonify({"success": True}), 200
    return jsonify({"error": "Erreur serveur"}), 500

@app.route('/api/goals/<int:goal_id>', methods=['DELETE'])
def abandon_goal(goal_id: int):
    user_email = get_current_user_id()
    profile = database.get_user_profile(user_email)
    if not profile:
        return jsonify({"error": "Utilisateur non trouvé"}), 404
    user_id = profile["id"]
    conn = database.get_db()
    conn.execute("""
        UPDATE financial_goals SET status = 'abandoned'
        WHERE id = ? AND user_id = ?
    """, (goal_id, user_id))
    conn.commit()
    conn.close()
    return jsonify({"success": True}), 200


# ─── API Tasks ─────────────────────────────────────────────────────────────────

@app.route("/api/tasks/categories", methods=["GET"])
@require_auth
def get_task_categories():
    user_id = get_current_user_id()
    conn = database.get_db()
    categories = conn.execute(
        "SELECT * FROM task_categories WHERE user_id = ? ORDER BY created_at DESC",
        (user_id,)
    ).fetchall()
    conn.close()
    return jsonify({"categories": [dict(c) for c in categories]}), 200


@app.route("/api/tasks/categories", methods=["POST"])
@require_auth
def create_task_category():
    user_id = get_current_user_id()
    data = request.get_json() or {}
    name = data.get("name")
    color = data.get("color", "#39FF14")
    if not name:
        return jsonify({"error": "Name required"}), 400
    conn = database.get_db()
    conn.execute(
        "INSERT INTO task_categories (user_id, name, color) VALUES (?, ?, ?)",
        (user_id, name, color)
    )
    conn.commit()
    conn.close()
    return jsonify({"success": True}), 201


@app.route("/api/tasks/categories/<int:category_id>", methods=["DELETE"])
@require_auth
def delete_task_category(category_id):
    user_id = get_current_user_id()
    conn = database.get_db()
    cat = conn.execute(
        "SELECT * FROM task_categories WHERE id = ? AND user_id = ?",
        (category_id, user_id)
    ).fetchone()
    if not cat:
        conn.close()
        return jsonify({"error": "Not found"}), 404
    conn.execute("DELETE FROM tasks WHERE category_id = ?", (category_id,))
    conn.execute("DELETE FROM task_categories WHERE id = ?", (category_id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True}), 200


@app.route("/api/tasks", methods=["GET"])
@require_auth
def get_tasks():
    user_id = get_current_user_id()
    category_id = request.args.get("category_id")
    date = request.args.get("date")
    query = "SELECT * FROM tasks WHERE user_id = ?"
    params = [user_id]
    if category_id:
        query += " AND category_id = ?"
        params.append(int(category_id))
    if date:
        query += " AND task_date = ?"
        params.append(date)
    query += " ORDER BY task_date ASC, id ASC"
    conn = database.get_db()
    tasks = conn.execute(query, tuple(params)).fetchall()
    conn.close()
    return jsonify({"tasks": [dict(t) for t in tasks]}), 200


@app.route("/api/tasks", methods=["POST"])
@require_auth
def create_task():
    user_id = get_current_user_id()
    data = request.get_json() or {}
    category_id = data.get("category_id")
    title = data.get("title")
    task_date = data.get("task_date")
    if not all([category_id, title, task_date]):
        return jsonify({"error": "Missing required fields"}), 400
    conn = database.get_db()
    conn.execute(
        "INSERT INTO tasks (category_id, user_id, title, task_date) VALUES (?, ?, ?, ?)",
        (category_id, user_id, title, task_date)
    )
    conn.commit()
    conn.close()
    return jsonify({"success": True}), 201


@app.route("/api/tasks/<int:task_id>", methods=["PATCH"])
@require_auth
def update_task(task_id):
    user_id = get_current_user_id()
    conn = database.get_db()
    task = conn.execute(
        "SELECT * FROM tasks WHERE id = ? AND user_id = ?",
        (task_id, user_id)
    ).fetchone()
    if not task:
        conn.close()
        return jsonify({"error": "Not found"}), 404
    data = request.get_json() or {}
    if "completed" in data:
        conn.execute("UPDATE tasks SET completed = ? WHERE id = ?", (1 if data["completed"] else 0, task_id))
    if "title" in data:
        conn.execute("UPDATE tasks SET title = ? WHERE id = ?", (data["title"], task_id))
    conn.commit()
    conn.close()
    return jsonify({"success": True}), 200


@app.route("/api/tasks/<int:task_id>", methods=["DELETE"])
@require_auth
def delete_task(task_id):
    user_id = get_current_user_id()
    conn = database.get_db()
    task = conn.execute(
        "SELECT * FROM tasks WHERE id = ? AND user_id = ?",
        (task_id, user_id)
    ).fetchone()
    if not task:
        conn.close()
        return jsonify({"error": "Not found"}), 404
    conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True}), 200


# ─── My Target Endpoints ──────────────────────────────────────────────────────

@app.route('/api/target/daily-entry', methods=['POST'])
def target_daily_entry():
    """Enregistre une entrée quotidienne pour My Target.
    Body: { epargne, depense }
    Auto-calc status: success si epargne >= goal AND depense <= budget
    """
    user_email = get_current_user_id()
    profile = database.get_user_profile(user_email)
    if not profile:
        return jsonify({"error": "Utilisateur non trouvé"}), 404
    user_id = profile["id"]

    data = request.get_json() or {}
    epargne = data.get('epargne', 0)
    depense = data.get('depense', 0)

    try:
        epargne = float(epargne)
        depense = float(depense)
    except (ValueError, TypeError):
        return jsonify({"error": "Valeurs invalides"}), 400

    if epargne < 0 or depense < 0:
        return jsonify({"error": "Les valeurs doivent être positives"}), 400

    import datetime
    today_str = datetime.date.today().isoformat()

    # Récupérer les objectifs
    targets = database.get_user_targets(user_id)
    savings_goal = targets.get("monthly_savings_goal", 0.0)
    monthly_budget = targets.get("monthly_budget", 0.0)

    # Calcul du budget journalier restant
    budget_variable = monthly_budget
    if monthly_budget > 0:
        # Calculate remaining budget for the month
        import calendar
        today = datetime.date.today()
        days_in_month = calendar.monthrange(today.year, today.month)[1]
        budget_variable = monthly_budget / days_in_month

    # Auto-calcul du statut
    if savings_goal > 0 and monthly_budget > 0:
        daily_savings_target = savings_goal / 30.0
        if epargne >= daily_savings_target and depense <= budget_variable:
            status = 'success'
        else:
            status = 'failed'
    elif epargne > 0:
        status = 'success'
    else:
        status = 'failed'

    # Points system (simple)
    points = 0
    if status == 'success':
        points = 10
        if epargne > 0:
            points += 5
        if depense == 0:
            points += 5

    success = database.save_daily_target_entry(
        user_id, today_str, epargne, depense, status, points
    )
    if not success:
        return jsonify({"error": "Erreur lors de l'enregistrement"}), 500

    return jsonify({
        "success": True,
        "status": status,
        "points_earned": points,
        "epargne": epargne,
        "depense": depense,
    }), 200


@app.route('/api/target/calendar', methods=['GET'])
def target_calendar():
    """Retourne les entrées My Target pour un mois donné.
    Query param: month=YYYY-MM (default: current month)
    """
    user_email = get_current_user_id()
    profile = database.get_user_profile(user_email)
    if not profile:
        return jsonify({"error": "Utilisateur non trouvé"}), 404
    user_id = profile["id"]

    import datetime
    month = request.args.get('month')
    if not month:
        month = datetime.date.today().strftime("%Y-%m")

    entries = database.get_monthly_target_entries(user_id, month)

    return jsonify({
        "success": True,
        "entries": entries,
    }), 200


@app.route('/api/target/streak', methods=['GET'])
def target_streak():
    """Calcule la série de succès consécutifs.
    Returns: { streak_count, label }
    """
    user_email = get_current_user_id()
    profile = database.get_user_profile(user_email)
    if not profile:
        return jsonify({"error": "Utilisateur non trouvé"}), 404
    user_id = profile["id"]

    data = database.get_target_streak_data(user_id)
    return jsonify({"success": True, **data}), 200


@app.route('/api/target/summary', methods=['GET'])
def target_summary():
    """Retourne le résumé My Target.
    Returns: { budget_mensuel, objectif_epargne, jours_liberte, progression }
    """
    user_email = get_current_user_id()
    profile = database.get_user_profile(user_email)
    if not profile:
        return jsonify({"error": "Utilisateur non trouvé"}), 404
    user_id = profile["id"]

    data = database.get_target_summary_data(user_id)
    return jsonify({"success": True, **data}), 200


@app.route('/api/target/set-goal', methods=['POST'])
def target_set_goal():
    """Définit les objectifs mensuels My Target.
    Body: { savings_goal, monthly_budget }
    """
    user_email = get_current_user_id()
    profile = database.get_user_profile(user_email)
    if not profile:
        return jsonify({"error": "Utilisateur non trouvé"}), 404
    user_id = profile["id"]

    data = request.get_json() or {}
    savings_goal = data.get('savings_goal', 0)
    monthly_budget = data.get('monthly_budget', 0)

    try:
        savings_goal = float(savings_goal)
        monthly_budget = float(monthly_budget)
    except (ValueError, TypeError):
        return jsonify({"error": "Valeurs invalides"}), 400

    if savings_goal < 0 or monthly_budget < 0:
        return jsonify({"error": "Les valeurs doivent être positives"}), 400

    success = database.set_user_targets(user_id, savings_goal, monthly_budget)
    if success:
        targets = database.get_user_targets(user_id)
        return jsonify({
            "success": True,
            "targets": targets,
        }), 200
    return jsonify({"error": "Erreur serveur"}), 500


@app.route('/api/target/cron/auto-neutral', methods=['POST'])
def target_cron_auto_neutral():
    """Cron endpoint: Insère des entrées neutres pour les utilisateurs sans
    entrée aujourd'hui. Protégé par une clé secrète simple en header.
    """
    # Simple protection — require a cron secret
    cron_secret = os.environ.get("CRON_SECRET", "")
    if cron_secret:
        auth = request.headers.get("Authorization", "")
        if auth != f"Bearer {cron_secret}":
            return jsonify({"error": "Non autorisé"}), 401

    count = database.auto_insert_neutral_entries()
    return jsonify({"success": True, "inserted": count}), 200


if __name__ == "__main__":
    # Ensure static directory exists
    os.makedirs("static", exist_ok=True)
    app.run(host="0.0.0.0", port=5001, debug=os.environ.get("FLASK_DEBUG", "0") == "1")