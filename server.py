import os
from flask import Flask, request, jsonify, send_from_directory
import database
import json
from dotenv import load_dotenv

from flask_cors import CORS

load_dotenv()

app = Flask(__name__, static_folder="static")
CORS(app, 
     origins="*",
     allow_headers=["Content-Type", "X-User-Email", "Authorization"],
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
     supports_credentials=False)

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

# User Authentication endpoints
@app.route("/api/auth/register", methods=["POST"])
def auth_register():
    data = request.json or {}
    email = data.get("email")
    password = data.get("password")
    first_name = data.get("first_name", "")
    last_name = data.get("last_name", "")
    if not email or not password:
        return jsonify({"success": False, "error": "Email et mot de passe requis"}), 400
    
    success = database.create_user(email, password, first_name, last_name)
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
        
        # Independence Index Formula: (Passive Income / Total Monthly Cost) * 100
        if total_monthly_cost > 0:
            iif_score = int((total_passive_income / total_monthly_cost) * 100)
        else:
            iif_score = 100 if total_passive_income > 0 else 0
            
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

@app.route("/api/user/settings", methods=["POST"])
def update_settings():
    user_id = get_current_user_id()
    data = request.json or {}
    currency = data.get("currency")
    if not currency:
        return jsonify({"success": False, "error": "Devise manquante"}), 400
    try:
        database.update_user_currency(user_id, currency)
        return jsonify({"success": True, "message": "Devise mise à jour avec succès"})
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
    iif = int((total_passive / total_cost) * 100) if total_cost > 0 else 100
    
    context_str = f"""
    Données financières réelles de l'utilisateur:
    - Actifs totaux: {total_assets} $ (Revenus passifs mensuels: {total_passive} $)
    Détail des actifs: {', '.join([f"{a['name']} ({a['type']}): Val={a['value']}$, Yield={a['monthly_yield']}$" for a in assets])}
    
    - Passifs totaux: {total_liabilities} $ (Coût mensuel total: {total_cost} $)
    Détail des passifs: {', '.join([f"{l['name']} ({l['type']}): Restant={l['remaining_amount']}$, Coût mensuel={l['monthly_cost']}$" for l in liabilities])}
    
    - Indice d'Indépendance Financière (IIF): {iif}%
    - Cashflow Net Mensuel: {total_passive - total_cost} $
    """
    
    lang_directives = {
        "fr": "Exprime-toi en français. Reste motivant, concis et professionnel.",
        "en": "Express yourself in English. Stay motivational, concise, and professional.",
        "es": "Exprésate en español. Sé motivador, conciso y profesional.",
        "pt": "Expresse-se em português. Seja motivador, conciso et professionnel.",
        "de": "Drücke dich auf Deutsch aus. Bleibe motivierend, präzise und professionell."
    }
    
    sys_prompt = f"""
    Tu es le "Coach Philia Vault", un conseiller financier virtuel premium et expert dans la méthodologie d'indépendance financière par les flux de trésorerie (séparation stricte Actifs vs Passifs). Ne mentionne JAMAIS de titres de livres ou de marques déposées comme "Rich Dad Poor Dad" ou "Père Riche Père Pauvre" dans tes réponses pour des raisons de droits d'auteur.
    Ton but est d'analyser le patrimoine de l'utilisateur, de lui donner des conseils d'éducation financière bienveillants et d'optimiser ses flux de trésorerie.
    Tu dois impérativement t'exprimer dans cette langue : {lang_directives.get(lang, lang_directives["en"])}
    Quand tu proposes des plans de rebalancement ou d'investissement, fais des suggestions concrètes basées sur ses données.
    
    {context_str}
    """
    
    if gemini_model:
        try:
            # Build conversation history
            contents = [{"role": "user", "parts": [sys_prompt + "\n\nInitialisons le chat."]}]
            for h in history:
                contents.append({
                    "role": "user" if h["role"] == "user" else "model",
                    "parts": [h["text"]]
                })
            contents.append({"role": "user", "parts": [user_msg]})
            
            response = gemini_model.generate_content(contents)
            return jsonify({"success": True, "reply": response.text})
        except Exception as e:
            print(f"Gemini error: {e}")
            # fall through to offline mockup fallback if API call fails
    
    # Intelligent Offline Mock Mode (Heuristic engine based on actual DB stats)
    reply = ""
    lower_msg = user_msg.lower()
    
    if lang == "fr":
        if "audit" in lower_msg or "analys" in lower_msg or "conseil" in lower_msg or "iif" in lower_msg:
            reply = f"""Voici votre **Audit Mensuel Personnalisé** généré à partir de votre profil réel :
1. **Analyse de l'IIF ({iif}%)** : Vos revenus passifs ({total_passive} $) couvrent une partie de vos dépenses.
2. **Fuites Détectées** : Vos passifs drainent {total_cost} $/mois.
3. **Stratégie** : Réinvestissez vos mensualités superflues pour atteindre la liberté plus tôt !"""
        else:
            reply = f"""Bonjour ! Je suis votre Coach Financier Philia Vault. En analysant votre situation :
* Vos Actifs génèrent **{total_passive} $** par mois.
* Vos Passifs consomment **{total_cost} $** par mois.
* Votre Indice d'Indépendance Financière (IIF) est à **{iif}%**.
Que souhaitez-vous optimiser aujourd'hui ? Demandez un 'audit de mon cashflow'."""
    else:
        # Default to English mock if not FR
        if "audit" in lower_msg or "analys" in lower_msg or "advice" in lower_msg or "iif" in lower_msg:
            reply = f"""Here is your **Personalized Monthly Audit** generated from your real profile:
1. **IIF Index Analysis ({iif}%)**: Your passive income ({total_passive} $) covers part of your costs.
2. **Leaks Detected**: Your liabilities drain {total_cost} $/month.
3. **Strategy**: Reinvest extra monthly costs to accelerate your financial freedom!"""
        else:
            reply = f"""Hello! I am your Philia Vault Financial Coach. Analyzing your situation:
* Your Assets generate **{total_passive} $** per month.
* Your Liabilities consume **{total_cost} $** per month.
* Your Independence Index (IIF) is at **{iif}%**.
What would you like to optimize today? Ask for a 'cashflow audit'."""
        
    return jsonify({"success": True, "reply": reply})

if __name__ == "__main__":
    # Ensure static directory exists
    os.makedirs("static", exist_ok=True)
    app.run(host="0.0.0.0", port=5001, debug=True)
