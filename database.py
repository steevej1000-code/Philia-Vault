import sqlite3
import os
import base64
import secrets
import string
from cryptography.fernet import Fernet
from dotenv import load_dotenv

# Load environment variables early for encryption keys
load_dotenv()

DB_PATH = os.environ.get("DATABASE_PATH", os.path.join(os.path.dirname(__file__), "cashflow.db"))
db_dir = os.path.dirname(DB_PATH)
if db_dir:
    os.makedirs(db_dir, exist_ok=True)

def get_encryptor():
    key = os.environ.get("DB_ENCRYPTION_KEY")
    if not key:
        # Stable fallback key for local dev so restarts don't break decryption
        key = base64.urlsafe_b64encode(b"PhiliaVaultEncryptionFallbackKey")
    else:
        try:
            # Check if it's already a valid Fernet key
            Fernet(key.encode('utf-8'))
            key = key.encode('utf-8')
        except Exception:
            # Derive a valid Fernet key if it's a simple password
            import hashlib
            key = base64.urlsafe_b64encode(hashlib.sha256(key.encode('utf-8')).digest())
    return Fernet(key)

_cipher = get_encryptor()

def encrypt_val(val):
    if val is None:
        return None
    val_str = str(val)
    encrypted_bytes = _cipher.encrypt(val_str.encode('utf-8'))
    return encrypted_bytes.decode('utf-8')

def decrypt_val(val_encrypted, default=0.0):
    if val_encrypted is None:
        return default
    if isinstance(val_encrypted, (int, float)):
        return float(val_encrypted)
    
    val_str = str(val_encrypted)
    if not val_str.startswith("gAAAAA"):
        try:
            return float(val_str)
        except ValueError:
            return default
            
    try:
        decrypted_bytes = _cipher.decrypt(val_str.encode('utf-8'))
        return float(decrypted_bytes.decode('utf-8'))
    except Exception:
        try:
            return float(val_str)
        except ValueError:
            return default

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# Generate a unique 8-character alphanumeric referral code (program de parrainage)
def generate_unique_referral_code(cursor):
    alphabet = string.ascii_uppercase + string.digits
    for _ in range(20):
        code = ''.join(secrets.choice(alphabet) for _ in range(8))
        cursor.execute("SELECT 1 FROM users WHERE code_parrainage = ?", (code,))
        if not cursor.fetchone():
            return code
    # Extremely unlikely fallback
    return secrets.token_hex(4).upper()

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    # Create users table for auth (supports email/password & google auth)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password TEXT,
        google_id TEXT,
        stripe_customer_id TEXT,
        premium_status INTEGER DEFAULT 0,
        premium_expires TEXT,
        currency TEXT DEFAULT 'EUR',
        first_name TEXT,
        last_name TEXT,
        custom_categories TEXT,
        avatar TEXT,
        notifications_enabled INTEGER DEFAULT 1,
        code_parrainage TEXT UNIQUE,
        parrain_id INTEGER,
        stripe_subscription_id TEXT,
        cancel_at_period_end INTEGER DEFAULT 0,
        cancel_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Try to add missing columns to users if the table already existed
    for col_def in [
        ("google_id", "TEXT"),
        ("stripe_customer_id", "TEXT"),
        ("premium_status", "INTEGER DEFAULT 0"),
        ("premium_expires", "TEXT"),
        ("currency", "TEXT DEFAULT 'EUR'"),
        ("first_name", "TEXT"),
        ("last_name", "TEXT"),
        ("custom_categories", "TEXT"),
        ("avatar", "TEXT"),
        ("notifications_enabled", "INTEGER DEFAULT 1"),
        ("code_parrainage", "TEXT"),
        ("parrain_id", "INTEGER"),
        ("stripe_subscription_id", "TEXT"),
        ("cancel_at_period_end", "INTEGER DEFAULT 0"),
        ("cancel_at", "TEXT"),
        ("created_at", "TEXT DEFAULT CURRENT_TIMESTAMP"),
        ("language", "TEXT DEFAULT 'en'"),
        ("currency_symbol", "TEXT DEFAULT '$'"),
        ("is_blocked", "INTEGER DEFAULT 0"),
        ("apple_id", "TEXT"),
        ("password_reset_code", "TEXT"),
        ("password_reset_expires", "TEXT")
    ]:
        try:
            cursor.execute(f"ALTER TABLE users ADD COLUMN {col_def[0]} {col_def[1]}")
        except Exception:
            pass

    conn.commit()

    # Backfill referral codes for any existing users that don't have one yet
    # (new users get one assigned at creation time via generate_referral_code)
    cursor.execute("SELECT id FROM users WHERE code_parrainage IS NULL OR code_parrainage = ''")
    for row in cursor.fetchall():
        code = generate_unique_referral_code(cursor)
        cursor.execute("UPDATE users SET code_parrainage=? WHERE id=?", (code, row["id"] if isinstance(row, sqlite3.Row) else row[0]))

    # Create assets table (with user_id)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        value REAL NOT NULL,
        monthly_yield REAL NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # Create liabilities table (with user_id)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS liabilities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        total_amount REAL NOT NULL,
        remaining_amount REAL NOT NULL,
        monthly_cost REAL NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # Create transactions table (with user_id)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        description TEXT NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        date TEXT NOT NULL
    )
    """)

    # Create savings_goals table (with user_id)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS savings_goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        target_amount TEXT NOT NULL,
        current_amount TEXT NOT NULL,
        target_date TEXT NOT NULL
    )
    """)

    # Create founder_members table for Stripe (updated)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS founder_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stripe_customer_id TEXT UNIQUE NOT NULL,
        stripe_subscription_id TEXT UNIQUE,
        email TEXT NOT NULL,
        member_number INTEGER NOT NULL,
        amount_paid REAL DEFAULT 4.99,
        currency TEXT DEFAULT 'usd',
        status TEXT DEFAULT 'active',
        language TEXT DEFAULT 'en',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        meta_event_sent INTEGER DEFAULT 0
    )
    """)

    # Try to add missing columns to founder_members if the table existed with the old Square schema
    for col_def in [
        ("stripe_customer_id", "TEXT"),
        ("stripe_subscription_id", "TEXT"),
        ("member_number", "INTEGER"),
        ("amount_paid", "REAL DEFAULT 4.99"),
        ("currency", "TEXT DEFAULT 'usd'"),
        ("status", "TEXT DEFAULT 'active'"),
        ("language", "TEXT DEFAULT 'en'"),
        ("meta_event_sent", "INTEGER DEFAULT 0")
    ]:
        try:
            cursor.execute(f"ALTER TABLE founder_members ADD COLUMN {col_def[0]} {col_def[1]}")
        except Exception:
            pass

    # Create founder_spots_counter table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS founder_spots_counter (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        total_spots INTEGER DEFAULT 10,
        spots_taken INTEGER DEFAULT 0
    )
    """)

    # Create founder_waitlist table for backup email collections
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS founder_waitlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        lang TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Migrate old data if any exists without user_id
    for table in ["assets", "liabilities", "transactions", "savings_goals"]:
        try:
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN user_id TEXT")
        except Exception:
            pass
            
    # Create admin_users table for backoffice
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT,
        google_id TEXT UNIQUE,
        avatar_url TEXT,
        full_name TEXT,
        role TEXT DEFAULT 'viewer',
        is_active INTEGER DEFAULT 1,
        last_login TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Try to add missing columns to admin_users if the table already existed
    for col_def in [
        ("google_id", "TEXT UNIQUE"),
        ("avatar_url", "TEXT"),
        ("full_name", "TEXT"),
        ("last_login", "TEXT")
    ]:
        try:
            cursor.execute(f"ALTER TABLE admin_users ADD COLUMN {col_def[0]} {col_def[1]}")
        except Exception:
            pass

    # Create config table (editable key/value store for admin)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)
    # Seed default config values (INSERT OR IGNORE → won't overwrite live edits)
    _config_defaults = [
        ('price_monthly_display',  '$9.99'),
        ('price_yearly_display',   ''),
        ('price_monthly_equiv',    ''),
        ('price_founder_display',  '$4.99'),
        ('stripe_price_monthly',   'price_1TkdtnGB22CTeiDpoTNsaFQM'),
        ('stripe_price_yearly',    ''),
        ('faq',                    '[]'),
        ('hero_title',             'Your Financial Mirror'),
        ('hero_subtitle',          'AI-powered wealth management'),
    ]
    for _k, _v in _config_defaults:
        cursor.execute("INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)", (_k, _v))

    # Create admin_invited_emails table (Whitelist)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS admin_invited_emails (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        intended_role TEXT NOT NULL DEFAULT 'viewer',
        invited_by INTEGER,
        invited_at TEXT DEFAULT CURRENT_TIMESTAMP,
        used INTEGER DEFAULT 0,
        FOREIGN KEY (invited_by) REFERENCES admin_users(id)
    )
    """)

    # ── Daily Decision tables ─────────────────────────────────────────────────
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS dilemma_translations (
        dilemma_id TEXT NOT NULL,
        lang TEXT NOT NULL,
        title TEXT NOT NULL,
        scenario TEXT NOT NULL,
        choice_liability_label TEXT NOT NULL,
        choice_liability_feedback TEXT NOT NULL,
        choice_asset_label TEXT NOT NULL,
        choice_asset_feedback TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (dilemma_id, lang)
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS user_dilemma_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        dilemma_id TEXT NOT NULL,
        choice TEXT NOT NULL CHECK (choice IN ('asset', 'liability')),
        answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS user_streak (
        user_id INTEGER PRIMARY KEY,
        current_streak INTEGER DEFAULT 0,
        longest_streak INTEGER DEFAULT 0,
        last_answered_date DATE,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
    """)


    # ── Stripe Connect affiliate tables ───────────────────────────────────────
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS affiliate_accounts (
        user_id INTEGER PRIMARY KEY,
        stripe_account_id TEXT,
        onboarding_status TEXT DEFAULT 'pending' CHECK (onboarding_status IN ('pending','active','restricted')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS affiliate_commissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        affiliate_user_id INTEGER NOT NULL,
        referred_user_id INTEGER NOT NULL,
        subscription_payment_id TEXT NOT NULL,
        commission_amount REAL NOT NULL,
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending','eligible','paid','cancelled')),
        eligible_at TIMESTAMP,
        paid_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (affiliate_user_id) REFERENCES users(id),
        FOREIGN KEY (referred_user_id) REFERENCES users(id)
    )
    """)

    # Try to add missing columns if tables already existed without them
    for col_def in [
        ("stripe_account_id", "TEXT"),
        ("onboarding_status", "TEXT DEFAULT 'pending'"),
    ]:
        try:
            cursor.execute(f"ALTER TABLE affiliate_accounts ADD COLUMN {col_def[0]} {col_def[1]}")
        except Exception:
            pass

    # Add plan_type to affiliate_commissions (migration for existing DBs)
    try:
        cursor.execute("ALTER TABLE affiliate_commissions ADD COLUMN plan_type TEXT DEFAULT 'monthly'")
    except Exception:
        pass  # column already present

    # ── Seed owner email so Google OAuth works on first boot ──────────────────
    _owner_email = os.environ.get("ADMIN_EMAIL", "steevej1000@gmail.com")
    cursor.execute(
        "INSERT OR IGNORE INTO admin_invited_emails (email, intended_role) VALUES (?, 'owner')",
        (_owner_email,)
    )
    # Also ensure the owner row in admin_users exists (if already created via invite, skip)
    cursor.execute(
        "INSERT OR IGNORE INTO admin_users (email, role, is_active) VALUES (?, 'owner', 1)",
        (_owner_email,)
    )

    conn.commit()
    conn.close()

# Seed mock data for new users to start with a realistic dashboard (Disabled for real accounts)
def seed_user_data(user_id):
    pass

# User Profile Helpers
def get_user_profile(user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE email = ? OR id = ?", (user_id, user_id))
    row = cursor.fetchone()
    conn.close()
    if not row:
        conn = get_db()
        cursor = conn.cursor()
        try:
            code = generate_unique_referral_code(cursor)
            cursor.execute("INSERT INTO users (email, password, code_parrainage) VALUES (?, '', ?)", (user_id, code))
            conn.commit()
        except Exception:
            pass
        conn.close()
        
        # Seed default dashboard data
        seed_user_data(user_id)
        
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE email = ? OR id = ?", (user_id, user_id))
        row = cursor.fetchone()
        conn.close()
        
    if row:
        d = dict(row)
        return {
            "name": d["email"].split("@")[0].capitalize() if "@" in d["email"] else d["email"],
            "email": d["email"],
            "premium_status": d["premium_status"],
            "stripe_customer_id": d["stripe_customer_id"],
            "stripe_subscription_id": d.get("stripe_subscription_id"),
            "cancel_at_period_end": bool(d.get("cancel_at_period_end")),
            "cancel_at": d.get("cancel_at"),
            "currency": d["currency"] or "EUR",
            "id": d["id"],
            "first_name": d["first_name"] or "",
            "last_name": d["last_name"] or "",
            "custom_categories": d["custom_categories"] or "",
            "avatar": d.get("avatar") or "",
            "parrain_id": d.get("parrain_id"),
        }
    return None

def update_user_profile(user_id, first_name, last_name, custom_categories, avatar=None):
    conn = get_db()
    cursor = conn.cursor()
    if avatar is not None:
        cursor.execute("UPDATE users SET first_name=?, last_name=?, custom_categories=?, avatar=? WHERE email=? OR id=?", 
                       (first_name, last_name, custom_categories, avatar, user_id, user_id))
    else:
        cursor.execute("UPDATE users SET first_name=?, last_name=?, custom_categories=? WHERE email=? OR id=?", 
                       (first_name, last_name, custom_categories, user_id, user_id))
    conn.commit()
    conn.close()
    return True

def set_premium_status(user_id, status, stripe_customer_id=None, stripe_subscription_id=None):
    conn = get_db()
    cursor = conn.cursor()
    if stripe_customer_id and stripe_subscription_id:
        cursor.execute("UPDATE users SET premium_status=?, stripe_customer_id=?, stripe_subscription_id=? WHERE email=? OR id=?",
                       (int(status), stripe_customer_id, stripe_subscription_id, user_id, user_id))
    elif stripe_customer_id:
        cursor.execute("UPDATE users SET premium_status=?, stripe_customer_id=? WHERE email=? OR id=?",
                       (int(status), stripe_customer_id, user_id, user_id))
    else:
        cursor.execute("UPDATE users SET premium_status=? WHERE email=? OR id=?", (int(status), user_id, user_id))
    conn.commit()
    conn.close()

def set_subscription_cancel_at_period_end(user_id, cancel_at_period_end, cancel_at=None):
    """Flag a subscription as scheduled to cancel at period end.

    Does NOT touch premium_status — the user keeps access until Stripe fires
    customer.subscription.deleted at the real period end.
    """
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE users SET cancel_at_period_end=?, cancel_at=? WHERE email=? OR id=?",
        (1 if cancel_at_period_end else 0, cancel_at, user_id, user_id),
    )
    conn.commit()
    conn.close()

def update_user_currency(user_id, currency):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET currency=? WHERE email=? OR id=?", (currency, user_id, user_id))
    conn.commit()
    conn.close()

def get_user_settings(user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE email = ? OR id = ?", (user_id, user_id))
    row = cursor.fetchone()
    conn.close()
    if not row:
        # Fall back to defaults, creating the user row via get_user_profile
        get_user_profile(user_id)
        return {"currency": "EUR", "notifications_enabled": True}
    d = dict(row)
    return {
        "currency": d["currency"] or "EUR",
        "notifications_enabled": bool(d["notifications_enabled"]) if d["notifications_enabled"] is not None else True,
    }

def update_user_settings(user_id, currency=None, notifications_enabled=None):
    conn = get_db()
    cursor = conn.cursor()
    if currency is not None:
        cursor.execute("UPDATE users SET currency=? WHERE email=? OR id=?", (currency, user_id, user_id))
    if notifications_enabled is not None:
        cursor.execute("UPDATE users SET notifications_enabled=? WHERE email=? OR id=?", (1 if notifications_enabled else 0, user_id, user_id))
    conn.commit()
    conn.close()

# Profile preferences (language / currency) helpers
def get_user_preferences(user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE email = ? OR id = ?", (user_id, user_id))
    row = cursor.fetchone()
    conn.close()
    if not row:
        get_user_profile(user_id)
        return {"language": "en", "currency": "EUR", "currency_symbol": "\u20ac"}
    d = dict(row)
    return {
        "language": d.get("language") or "en",
        "currency": d.get("currency") or "EUR",
        "currency_symbol": d.get("currency_symbol") or "$",
    }

def update_user_preferences(user_id, language=None, currency=None, currency_symbol=None):
    conn = get_db()
    cursor = conn.cursor()
    if language is not None:
        cursor.execute("UPDATE users SET language=? WHERE email=? OR id=?", (language, user_id, user_id))
    if currency is not None:
        cursor.execute("UPDATE users SET currency=? WHERE email=? OR id=?", (currency, user_id, user_id))
    if currency_symbol is not None:
        cursor.execute("UPDATE users SET currency_symbol=? WHERE email=? OR id=?", (currency_symbol, user_id, user_id))
    conn.commit()
    conn.close()

# Savings Goals Helpers
def get_savings_goals(user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM savings_goals WHERE user_id = ? ORDER BY id DESC", (user_id,))
    rows = []
    for r in cursor.fetchall():
        d = dict(r)
        d["target_amount"] = decrypt_val(d["target_amount"])
        d["current_amount"] = decrypt_val(d["current_amount"])
        rows.append(d)
    conn.close()
    return rows

def add_savings_goal(user_id, name, target_amount, current_amount, target_date):
    conn = get_db()
    cursor = conn.cursor()
    enc_target = encrypt_val(target_amount)
    enc_current = encrypt_val(current_amount)
    cursor.execute("INSERT INTO savings_goals (user_id, name, target_amount, current_amount, target_date) VALUES (?, ?, ?, ?, ?)",
                   (user_id, name, enc_target, enc_current, target_date))
    conn.commit()
    conn.close()

def update_savings_goal(user_id, goal_id, name, target_amount, current_amount, target_date):
    conn = get_db()
    cursor = conn.cursor()
    enc_target = encrypt_val(target_amount)
    enc_current = encrypt_val(current_amount)
    cursor.execute("UPDATE savings_goals SET name=?, target_amount=?, current_amount=?, target_date=? WHERE id=? AND user_id=?",
                   (name, enc_target, enc_current, target_date, goal_id, user_id))
    conn.commit()
    conn.close()

def delete_savings_goal(user_id, goal_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM savings_goals WHERE id=? AND user_id=?", (goal_id, user_id))
    conn.commit()
    conn.close()

# Assets CRUD Helpers
def get_assets(user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM assets WHERE user_id = ? ORDER BY id DESC", (user_id,))
    rows = []
    for r in cursor.fetchall():
        d = dict(r)
        d["value"] = decrypt_val(d["value"])
        d["monthly_yield"] = decrypt_val(d["monthly_yield"])
        rows.append(d)
    conn.close()
    return rows

def add_asset(user_id, name, type_, value, monthly_yield):
    conn = get_db()
    cursor = conn.cursor()
    enc_value = encrypt_val(value)
    enc_yield = encrypt_val(monthly_yield)
    cursor.execute("INSERT INTO assets (user_id, name, type, value, monthly_yield) VALUES (?, ?, ?, ?, ?)", (user_id, name, type_, enc_value, enc_yield))
    conn.commit()
    conn.close()

def update_asset(user_id, asset_id, name, type_, value, monthly_yield):
    conn = get_db()
    cursor = conn.cursor()
    enc_value = encrypt_val(value)
    enc_yield = encrypt_val(monthly_yield)
    cursor.execute("UPDATE assets SET name=?, type=?, value=?, monthly_yield=? WHERE id=? AND user_id=?", (name, type_, enc_value, enc_yield, asset_id, user_id))
    conn.commit()
    conn.close()

def delete_asset(user_id, asset_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM assets WHERE id=? AND user_id=?", (asset_id, user_id))
    conn.commit()
    conn.close()

# Liabilities CRUD Helpers
def get_liabilities(user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM liabilities WHERE user_id = ? ORDER BY id DESC", (user_id,))
    rows = []
    for r in cursor.fetchall():
        d = dict(r)
        d["total_amount"] = decrypt_val(d["total_amount"]) if d["total_amount"] is not None else 0.0
        d["remaining_amount"] = decrypt_val(d["remaining_amount"]) if d["remaining_amount"] is not None else 0.0
        d["monthly_cost"] = decrypt_val(d["monthly_cost"]) if d["monthly_cost"] is not None else 0.0
        # If decryption somehow returns None, default to 0.0
        if d["total_amount"] is None: d["total_amount"] = 0.0
        if d["remaining_amount"] is None: d["remaining_amount"] = 0.0
        if d["monthly_cost"] is None: d["monthly_cost"] = 0.0
        rows.append(d)
    conn.close()
    return rows

def add_liability(user_id, name, type_, total_amount, remaining_amount, monthly_cost):
    conn = get_db()
    cursor = conn.cursor()
    enc_total = encrypt_val(total_amount)
    enc_rem = encrypt_val(remaining_amount)
    enc_cost = encrypt_val(monthly_cost)
    cursor.execute("INSERT INTO liabilities (user_id, name, type, total_amount, remaining_amount, monthly_cost) VALUES (?, ?, ?, ?, ?, ?)",
                   (user_id, name, type_, enc_total, enc_rem, enc_cost))
    conn.commit()
    conn.close()

def update_liability(user_id, lib_id, name, type_, total_amount, remaining_amount, monthly_cost):
    conn = get_db()
    cursor = conn.cursor()
    enc_total = encrypt_val(total_amount)
    enc_rem = encrypt_val(remaining_amount)
    enc_cost = encrypt_val(monthly_cost)
    cursor.execute("UPDATE liabilities SET name=?, type=?, total_amount=?, remaining_amount=?, monthly_cost=? WHERE id=? AND user_id=?",
                   (name, type_, enc_total, enc_rem, enc_cost, lib_id, user_id))
    conn.commit()
    conn.close()

def delete_liability(user_id, lib_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM liabilities WHERE id=? AND user_id=?", (lib_id, user_id))
    conn.commit()
    conn.close()

# Transactions Helpers
def get_transactions(user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC, id DESC", (user_id,))
    rows = []
    for r in cursor.fetchall():
        d = dict(r)
        d["amount"] = decrypt_val(d["amount"])
        rows.append(d)
    conn.close()
    return rows

def add_transaction(user_id, description, type_, amount, date):
    conn = get_db()
    cursor = conn.cursor()
    enc_amount = encrypt_val(amount)
    cursor.execute("INSERT INTO transactions (user_id, description, type, amount, date) VALUES (?, ?, ?, ?, ?)", (user_id, description, type_, enc_amount, date))
    conn.commit()
    conn.close()

# User Auth helpers (SHA256 password hashing)
import hashlib

def hash_password(password):
    return hashlib.sha256(password.encode('utf-8')).hexdigest()

def create_user(email, password, first_name="", last_name="", referral_code=None):
    conn = get_db()
    cursor = conn.cursor()
    pwd_hash = hash_password(password)
    
    # Resolve sponsor parrain_id from referral_code
    parrain_id = None
    if referral_code:
        cursor.execute("SELECT id FROM users WHERE code_parrainage = ?", (referral_code.strip().upper(),))
        row = cursor.fetchone()
        if row:
            parrain_id = row["id"]
            
    try:
        code = generate_unique_referral_code(cursor)
        # premium_status = 0 : l'utilisateur doit compléter Stripe pour accéder à l'app.
        # Le trial 3 jours est géré par Stripe (subscription trialing),
        # pas par un timestamp local. premium_status passe à 1 uniquement après
        # confirmation Stripe via /api/stripe/verify-session ou webhook.
        cursor.execute(
            "INSERT INTO users (email, password, first_name, last_name, code_parrainage, parrain_id, premium_status) VALUES (?, ?, ?, ?, ?, ?, 0)",
            (email.lower().strip(), pwd_hash, first_name, last_name, code, parrain_id)
        )
        conn.commit()
        success = True
    except sqlite3.IntegrityError:
        success = False # User already exists
    conn.close()
    if success:
        seed_user_data(email.lower().strip())
    return success

def verify_user(email, password):
    conn = get_db()
    cursor = conn.cursor()
    pwd_hash = hash_password(password)
    cursor.execute("SELECT * FROM users WHERE email=? AND password=?", (email.lower().strip(), pwd_hash))
    user = cursor.fetchone()
    conn.close()
    return dict(user) if user else None

def create_or_get_google_user(email, google_id):
    conn = get_db()
    cursor = conn.cursor()
    email_clean = email.lower().strip()
    cursor.execute("SELECT * FROM users WHERE email=?", (email_clean,))
    user = cursor.fetchone()
    if user:
        if not user["google_id"]:
            cursor.execute("UPDATE users SET google_id=? WHERE email=?", (google_id, email_clean))
            conn.commit()
        conn.close()
        return email_clean

    # Create Google user — premium_status=0 until Stripe checkout completes
    code = generate_unique_referral_code(cursor)
    cursor.execute(
        "INSERT INTO users (email, google_id, password, code_parrainage, premium_status) VALUES (?, ?, '', ?, 0)",
        (email_clean, google_id, code)
    )
    conn.commit()
    conn.close()
    seed_user_data(email_clean)
    return email_clean

def create_or_get_apple_user(email, apple_id):
    conn = get_db()
    cursor = conn.cursor()
    email_clean = email.lower().strip()

    # Apple only sends the email on first sign-in; subsequent sign-ins may omit it.
    # Fall back to looking the user up by apple_id when no email is available.
    if not email_clean:
        cursor.execute("SELECT * FROM users WHERE apple_id=?", (apple_id,))
        user = cursor.fetchone()
        conn.close()
        return dict(user)["email"] if user else None

    cursor.execute("SELECT * FROM users WHERE email=?", (email_clean,))
    user = cursor.fetchone()
    if user:
        if not user["apple_id"]:
            cursor.execute("UPDATE users SET apple_id=? WHERE email=?", (apple_id, email_clean))
            conn.commit()
        conn.close()
        return email_clean

    # Create Apple user — premium_status=0 until Stripe checkout completes
    code = generate_unique_referral_code(cursor)
    cursor.execute(
        "INSERT INTO users (email, apple_id, password, code_parrainage, premium_status) VALUES (?, ?, '', ?, 0)",
        (email_clean, apple_id, code)
    )
    conn.commit()
    conn.close()
    seed_user_data(email_clean)
    return email_clean

def change_password(email, current_password, new_password):
    conn = get_db()
    cursor = conn.cursor()
    email_clean = email.lower().strip()
    cursor.execute("SELECT * FROM users WHERE email=?", (email_clean,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        return False, "user_not_found"
    if hash_password(current_password) != user["password"]:
        conn.close()
        return False, "invalid_current_password"
    cursor.execute("UPDATE users SET password=? WHERE email=?", (hash_password(new_password), email_clean))
    conn.commit()
    conn.close()
    return True, None

def create_password_reset_code(email):
    conn = get_db()
    cursor = conn.cursor()
    email_clean = email.lower().strip()
    cursor.execute("SELECT id FROM users WHERE email=?", (email_clean,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        return None
    from datetime import datetime, timedelta
    code = ''.join(secrets.choice(string.digits) for _ in range(6))
    expires = (datetime.utcnow() + timedelta(minutes=30)).strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute(
        "UPDATE users SET password_reset_code=?, password_reset_expires=? WHERE email=?",
        (code, expires, email_clean)
    )
    conn.commit()
    conn.close()
    return code

def reset_password_with_code(email, code, new_password):
    conn = get_db()
    cursor = conn.cursor()
    email_clean = email.lower().strip()
    cursor.execute("SELECT * FROM users WHERE email=?", (email_clean,))
    user = cursor.fetchone()
    if not user or not user["password_reset_code"]:
        conn.close()
        return False, "invalid_code"
    if user["password_reset_code"] != code.strip():
        conn.close()
        return False, "invalid_code"
    from datetime import datetime
    try:
        expires = datetime.strptime(user["password_reset_expires"], "%Y-%m-%d %H:%M:%S")
    except (TypeError, ValueError):
        conn.close()
        return False, "invalid_code"
    if datetime.utcnow() > expires:
        conn.close()
        return False, "code_expired"
    cursor.execute(
        "UPDATE users SET password=?, password_reset_code=NULL, password_reset_expires=NULL WHERE email=?",
        (hash_password(new_password), email_clean)
    )
    conn.commit()
    conn.close()
    return True, None

def get_user_by_stripe_customer_id(customer_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE stripe_customer_id=?", (customer_id,))
    user = cursor.fetchone()
    conn.close()
    return dict(user) if user else None

def get_user_by_stripe_subscription_id(subscription_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE stripe_subscription_id=?", (subscription_id,))
    user = cursor.fetchone()
    conn.close()
    return dict(user) if user else None

# Affiliation / Referral program (Revenu Passif)
# Commission per active premium referral. Philia Vault Premium Monthly is
# priced at 9.99 (see price_amount in server.py /api/stripe/create-checkout-session).
# We pay out ~50% of that subscription price per active referral.
COMMISSION_PER_REFERRAL = 7.50

def get_affiliation_stats(user_id, _retry=False):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE email = ? OR id = ?", (user_id, user_id))
    row = cursor.fetchone()
    if not row:
        conn.close()
        if _retry:
            # User could not be created (e.g. race condition) - return safe defaults
            return {
                "code_parrainage": "",
                "active_referrals": 0,
                "estimated_monthly_gain": 0.0,
                "commission_per_referral": COMMISSION_PER_REFERRAL,
            }
        # Ensure the user exists (and has a referral code) then retry once
        get_user_profile(user_id)
        return get_affiliation_stats(user_id, _retry=True)

    d = dict(row)
    code = d["code_parrainage"]
    if not code:
        code = generate_unique_referral_code(cursor)
        cursor.execute("UPDATE users SET code_parrainage=? WHERE id=?", (code, d["id"]))
        conn.commit()

    cursor.execute(
        "SELECT COUNT(*) AS cnt FROM users WHERE parrain_id = ? AND premium_status = 1",
        (d["id"],)
    )
    active_referrals = cursor.fetchone()["cnt"]

    cursor.execute(
        "SELECT COUNT(*) AS cnt FROM users WHERE parrain_id = ?",
        (d["id"],)
    )
    total_invited = cursor.fetchone()["cnt"]
    conn.close()

    return {
        "code_parrainage": code,
        "active_referrals": active_referrals,
        "total_invited": total_invited,
        "estimated_monthly_gain": round(active_referrals * COMMISSION_PER_REFERRAL, 2),
        "commission_per_referral": COMMISSION_PER_REFERRAL,
    }




def fix_referral_link(user_email, parrain_email):
    """Retroactively link user to parrain. Used for manual corrections (admin only)."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, email FROM users WHERE email = ?", (user_email,))
    user_row = cursor.fetchone()
    if not user_row:
        conn.close()
        return {"success": False, "error": f"User not found: {user_email}"}
    cursor.execute("SELECT id, email, code_parrainage FROM users WHERE email = ?", (parrain_email,))
    parrain_row = cursor.fetchone()
    if not parrain_row:
        conn.close()
        return {"success": False, "error": f"Parrain not found: {parrain_email}"}
    parrain_id = parrain_row["id"]
    user_id = user_row["id"]
    cursor.execute("UPDATE users SET parrain_id = ? WHERE id = ?", (parrain_id, user_id))
    conn.commit()
    conn.close()
    return {
        "success": True,
        "message": f"{user_email} is now linked to parrain {parrain_email} (id={parrain_id})",
        "user_id": user_id,
        "parrain_id": parrain_id,
    }

# ─── Stripe Connect affiliate DB helpers ──────────────────────────────────────

def get_affiliate_account(user_id):
    """Return affiliate_accounts row for user (by email or int id)."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE email = ? OR id = ?", (user_id, user_id))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None
    uid = row["id"]
    cursor.execute("SELECT * FROM affiliate_accounts WHERE user_id = ?", (uid,))
    acc = cursor.fetchone()
    conn.close()
    return dict(acc) if acc else None

def upsert_affiliate_account(user_id, stripe_account_id, status='pending'):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE email = ? OR id = ?", (user_id, user_id))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return False
    uid = row["id"]
    cursor.execute("""
        INSERT INTO affiliate_accounts (user_id, stripe_account_id, onboarding_status)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            stripe_account_id = excluded.stripe_account_id,
            onboarding_status = excluded.onboarding_status
    """, (uid, stripe_account_id, status))
    conn.commit()
    conn.close()
    return True

def update_affiliate_onboarding_status(user_id, status):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE email = ? OR id = ?", (user_id, user_id))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return
    uid = row["id"]
    cursor.execute("UPDATE affiliate_accounts SET onboarding_status = ? WHERE user_id = ?", (status, uid))
    conn.commit()
    conn.close()

def insert_affiliate_commission(affiliate_user_id, referred_user_id, payment_id, commission_amount, plan_type='monthly'):
    """Insert a pending commission row. Idempotent on payment_id."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id FROM affiliate_commissions WHERE subscription_payment_id = ?", (payment_id,)
    )
    if cursor.fetchone():
        conn.close()
        return  # already recorded
    cursor.execute("""
        INSERT INTO affiliate_commissions
            (affiliate_user_id, referred_user_id, subscription_payment_id, commission_amount, status, plan_type)
        VALUES (?, ?, ?, ?, 'pending', ?)
    """, (affiliate_user_id, referred_user_id, payment_id, commission_amount, plan_type))
    conn.commit()
    conn.close()

def get_eligible_commissions_batch():
    """Return eligible commissions grouped by affiliate for payout."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT ac.affiliate_user_id, u.email, aa.stripe_account_id,
               SUM(ac.commission_amount) AS total_amount,
               GROUP_CONCAT(ac.id) AS commission_ids
        FROM affiliate_commissions ac
        JOIN users u ON u.id = ac.affiliate_user_id
        LEFT JOIN affiliate_accounts aa ON aa.user_id = ac.affiliate_user_id
        WHERE ac.status = 'eligible'
        GROUP BY ac.affiliate_user_id
    """)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def get_pending_commissions_older_than_days(days=30):
    """Commissions in 'pending' status older than `days` days."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT ac.*,
               u.email AS referred_email,
               u.stripe_customer_id AS referred_stripe_customer_id,
               u.stripe_subscription_id AS referred_stripe_sub_id
        FROM affiliate_commissions ac
        JOIN users u ON u.id = ac.referred_user_id
        WHERE ac.status = 'pending'
          AND ac.created_at <= datetime('now', ?)
    """, (f'-{days} days',))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def mark_commissions_eligible(commission_ids):
    if not commission_ids:
        return
    conn = get_db()
    cursor = conn.cursor()
    placeholders = ','.join('?' * len(commission_ids))
    cursor.execute(
        f"UPDATE affiliate_commissions SET status='eligible', eligible_at=CURRENT_TIMESTAMP WHERE id IN ({placeholders})",
        commission_ids
    )
    conn.commit()
    conn.close()

def mark_commissions_cancelled(commission_ids):
    if not commission_ids:
        return
    conn = get_db()
    cursor = conn.cursor()
    placeholders = ','.join('?' * len(commission_ids))
    cursor.execute(
        f"UPDATE affiliate_commissions SET status='cancelled' WHERE id IN ({placeholders})",
        commission_ids
    )
    conn.commit()
    conn.close()

def mark_commissions_paid(commission_ids):
    if not commission_ids:
        return
    conn = get_db()
    cursor = conn.cursor()
    placeholders = ','.join('?' * len(commission_ids))
    cursor.execute(
        f"UPDATE affiliate_commissions SET status='paid', paid_at=CURRENT_TIMESTAMP WHERE id IN ({placeholders})",
        commission_ids
    )
    conn.commit()
    conn.close()

def get_affiliate_network(user_id):
    """Return the list of users referred by user_id."""
    conn = get_db()
    cursor = conn.cursor()
    # Resolve to internal id first
    cursor.execute("SELECT id, code_parrainage FROM users WHERE email = ? OR id = ?", (user_id, user_id))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return []
    uid = row["id"]
    cursor.execute(
        """SELECT u.id, u.email, u.first_name, u.last_name, u.created_at, u.premium_status,
                  COALESCE(
                      (SELECT ac.plan_type FROM affiliate_commissions ac
                       WHERE ac.referred_user_id = u.id
                       ORDER BY ac.created_at DESC LIMIT 1),
                      'monthly'
                  ) AS plan_type
           FROM users u WHERE u.parrain_id = ?
           ORDER BY u.created_at DESC""",
        (uid,)
    )
    rows = cursor.fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        name = ((d.get("first_name") or "") + " " + (d.get("last_name") or "")).strip()
        plan_type = d.get("plan_type", "monthly")
        commission = 74.50 if plan_type == "annual" else (COMMISSION_PER_REFERRAL if d["premium_status"] == 1 else 0.0)
        result.append({
            "id": d["id"],
            "email": d["email"],
            "name": name if name else d["email"].split("@")[0],
            "created_at": d["created_at"] or "",
            "subscription_status": "active" if d["premium_status"] == 1 else "inactive",
            "plan_type": plan_type,
            "commission_earned": commission,
        })
    return result

def add_founder_member(email, name, payment_id):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO founder_members (email, name, square_payment_id) VALUES (?, ?, ?)",
            (email, name, payment_id)
        )
        conn.commit()
        success = True
    except Exception as e:
        print(f"Error adding founder member: {e}")
        success = False
    finally:
        conn.close()
    return success

def add_founder_waitlist(email, lang):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO founder_waitlist (email, lang) VALUES (?, ?)",
            (email, lang)
        )
        conn.commit()
        success = True
    except Exception as e:
        print(f"Error adding to waitlist: {e}")
        success = False
    finally:
        conn.close()
    return success

def get_founder_count():
    conn = get_db()
    cursor = conn.cursor()
    try:
        # We read from the new founder_spots_counter table
        cursor.execute("SELECT spots_taken FROM founder_spots_counter ORDER BY id ASC LIMIT 1")
        row = cursor.fetchone()
        if row:
            count = row["spots_taken"]
        else:
            # If counter row doesn't exist, count the actual members to be safe
            cursor.execute("SELECT COUNT(*) AS cnt FROM founder_members")
            count = cursor.fetchone()["cnt"]
    except Exception as e:
        print(f"Error getting founder count: {e}")
        count = 0
    finally:
        conn.close()
    return count

def get_founder_spots_counter():
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT total_spots, spots_taken FROM founder_spots_counter ORDER BY id ASC LIMIT 1")
        row = cursor.fetchone()
        if not row:
            # Create the counter if it doesn't exist
            cursor.execute("INSERT INTO founder_spots_counter (total_spots, spots_taken) VALUES (10, 0)")
            conn.commit()
            return {"total_spots": 10, "spots_taken": 0, "spots_remaining": 10}
        
        spots_taken = row["spots_taken"]
        total_spots = row["total_spots"]
        spots_remaining = max(0, total_spots - spots_taken)
        return {
            "total_spots": total_spots,
            "spots_taken": spots_taken,
            "spots_remaining": spots_remaining
        }
    finally:
        conn.close()

def process_stripe_payment(customer_email, customer_id, subscription_id, amount_total, currency, language='en'):
    conn = get_db()
    cursor = conn.cursor()
    try:
        # Check idempotency
        cursor.execute("SELECT id FROM founder_members WHERE stripe_customer_id = ?", (customer_id,))
        if cursor.fetchone():
            return {"success": True, "already_processed": True}

        # Initialize counter if not exists
        cursor.execute("SELECT id, total_spots, spots_taken FROM founder_spots_counter ORDER BY id ASC LIMIT 1")
        row = cursor.fetchone()
        if not row:
            cursor.execute("INSERT INTO founder_spots_counter (total_spots, spots_taken) VALUES (10, 0)")
            conn.commit()
            row = {"id": 1, "total_spots": 10, "spots_taken": 0}

        spots_taken = row["spots_taken"]
        spots_remaining = row["total_spots"] - spots_taken
        
        new_member_number = spots_taken + 1

        # Write new member
        cursor.execute("""
            INSERT INTO founder_members 
            (stripe_customer_id, stripe_subscription_id, email, member_number, amount_paid, currency, status, language) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (customer_id, subscription_id, customer_email, new_member_number, amount_total, currency, 'active', language))

        # Update counter
        cursor.execute("UPDATE founder_spots_counter SET spots_taken = spots_taken + 1 WHERE id = ?", (row["id"] if isinstance(row, dict) else row[0],))
        
        conn.commit()
        return {
            "success": True, 
            "member_number": new_member_number, 
            "spots_remaining": max(0, spots_remaining - 1),
            "language": language
        }
    except Exception as e:
        conn.rollback()
        print(f"Error processing stripe payment: {e}")
        return {"success": False, "error": str(e)}
    finally:
        conn.close()

def update_founder_meta_event_status(customer_id, sent_status=True):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE founder_members SET meta_event_sent = ? WHERE stripe_customer_id = ?", (1 if sent_status else 0, customer_id))
        conn.commit()
    except Exception as e:
        print(f"Error updating meta status: {e}")
    finally:
        conn.close()

# ==========================================
# ADMIN BACKOFFICE AUTHENTICATION FUNCTIONS
# ==========================================

def get_admin_by_email(email):
    """Récupère l'administrateur complet par son email (inclus le hash du mot de passe)"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        """SELECT id, email, password_hash, role, full_name, avatar_url, is_active 
           FROM admin_users WHERE email = ?""",
        (email,)
    )
    row = cursor.fetchone()
    conn.close()
    return row

def create_admin_user(email, password_hash, role='viewer', full_name=None):
    """Crée un nouvel administrateur avec un mot de passe déjà hashé"""
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """INSERT INTO admin_users (email, password_hash, role, full_name)
               VALUES (?, ?, ?, ?)""",
            (email, password_hash, role, full_name)
        )
        new_id = cursor.lastrowid
        conn.commit()
        return new_id
    except Exception as e:
        print(f"Erreur création admin: {e}")
        conn.rollback()
        return None
    finally:
        conn.close()

def update_last_login(admin_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE admin_users SET last_login = CURRENT_TIMESTAMP WHERE id = ?", (admin_id,))
    conn.commit()
    conn.close()

def log_admin_action(admin_id, action, target_table, target_id):
    pass  # Optional: implement audit logging if needed

def get_admin_dashboard_stats():
    conn = get_db()
    cursor = conn.cursor()
    
    # Founder Spots
    cursor.execute("SELECT total_spots, spots_taken FROM founder_spots_counter ORDER BY id DESC LIMIT 1")
    spots_row = cursor.fetchone()
    spots = {"total": 10, "taken": 0}
    if spots_row:
        spots["total"] = spots_row[0]
        spots["taken"] = spots_row[1]
        
    # Total Users (from users table)
    cursor.execute("SELECT COUNT(id) FROM users")
    total_users = cursor.fetchone()[0]
    
    # Total Founders (from founder_members table)
    cursor.execute("SELECT COUNT(id) FROM founder_members")
    total_founders = cursor.fetchone()[0]
    
    conn.close()
    
    return {
        "spots": spots,
        "total_users": total_users,
        "total_founders": total_founders,
        "status": "ONLINE"
    }

def get_all_users_for_admin():
    conn = get_db()
    cursor = conn.cursor()
    # Fetching founder members as they are the most important right now
    cursor.execute("""
        SELECT id, email, stripe_customer_id, status, amount_paid, created_at 
        FROM founder_members 
        ORDER BY created_at DESC
    """)
    rows = cursor.fetchall()
    conn.close()
    
    users = []
    for row in rows:
        users.append({
            "id": row[0],
            "email": row[1],
            "customer_id": row[2],
            "status": row[3],
            "amount_paid": row[4],
            "created_at": row[5]
        })
    return users

def get_standard_users_for_admin():
    conn = get_db()
    cursor = conn.cursor()
    # Use COALESCE in case created_at column is missing on older DB instances
    try:
        cursor.execute("""
            SELECT id, email, code_parrainage, premium_status, created_at, is_blocked
            FROM users
            ORDER BY created_at DESC
        """)
    except Exception:
        # Fallback: created_at column not yet added by migration
        cursor.execute("""
            SELECT id, email, code_parrainage, premium_status, NULL as created_at, is_blocked
            FROM users
            ORDER BY id DESC
        """)
    rows = cursor.fetchall()

    # Also ensure the column exists for future queries (safe migration)
    try:
        cursor.execute("ALTER TABLE users ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP")
        conn.commit()
    except Exception:
        pass  # Column already exists

    conn.close()

    users = []
    for row in rows:
        users.append({
            "id": row[0],
            "email": row[1],
            "code_parrainage": row[2],
            "balance": 0.00,
            "has_founder_access": bool(row[3]),
            "created_at": row[4],
            "is_blocked": bool(row[5])
        })
    return users

def block_user(user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET is_blocked = 1 WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    return True

def block_founder(founder_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE founder_members SET status = 'blocked' WHERE id = ?", (founder_id,))
    conn.commit()
    conn.close()

def check_is_founder(email):
    """Check if an email is a founder member (for premium checks)"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM founder_members WHERE email = ? COLLATE NOCASE", (email,))
        row = cursor.fetchone()
        conn.close()
        return row is not None
    except Exception as e:
        print(f"Error checking founder status: {e}")
        return False

def update_founder_spots_counter(new_total, new_taken):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO founder_spots_counter (total_spots, spots_taken) VALUES (?, ?)",
        (new_total, new_taken)
    )
    conn.commit()
    conn.close()
    return True

# ─── Config helpers ────────────────────────────────────────────────────────────

def get_config(key=None):
    """Return a single config value (str) or the full dict if key is None."""
    conn = get_db()
    cursor = conn.cursor()
    if key:
        cursor.execute("SELECT value FROM config WHERE key = ?", (key,))
        row = cursor.fetchone()
        conn.close()
        return row[0] if row else None
    else:
        cursor.execute("SELECT key, value FROM config")
        rows = cursor.fetchall()
        conn.close()
        return {r[0]: r[1] for r in rows}

def set_config(key, value):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO config (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
        (key, str(value))
    )
    conn.commit()
    conn.close()
    return True

# ─── Admin Google OAuth helper ─────────────────────────────────────────────────

def get_admin_by_google_id(google_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, email, role, full_name, avatar_url, is_active FROM admin_users WHERE google_id = ?",
        (google_id,)
    )
    row = cursor.fetchone()
    conn.close()
    return row

def create_or_link_google_admin(email, google_id, full_name=None, avatar_url=None):
    """
    Returns (admin_id, role) if the email is in admin_users or admin_invited_emails.
    Links google_id if not already set. Creates the admin_user row if invited.
    Returns None if the email is not allowed.
    """
    conn = get_db()
    cursor = conn.cursor()

    # 1. Existing admin user by email?
    cursor.execute(
        "SELECT id, role, is_active, google_id FROM admin_users WHERE email = ? COLLATE NOCASE",
        (email,)
    )
    row = cursor.fetchone()
    if row:
        admin_id, role, is_active, existing_gid = row
        if not is_active:
            conn.close()
            return None, None, 'disabled'
        if not existing_gid:
            cursor.execute(
                "UPDATE admin_users SET google_id=?, full_name=COALESCE(full_name,?), avatar_url=COALESCE(avatar_url,?) WHERE id=?",
                (google_id, full_name, avatar_url, admin_id)
            )
            conn.commit()
        conn.close()
        return admin_id, role, None

    # 2. Email in admin_invited_emails?
    cursor.execute(
        "SELECT id, intended_role FROM admin_invited_emails WHERE email = ? COLLATE NOCASE AND used = 0",
        (email,)
    )
    invite = cursor.fetchone()
    if invite:
        invite_id, intended_role = invite
        cursor.execute(
            "INSERT INTO admin_users (email, google_id, full_name, avatar_url, role, is_active) VALUES (?,?,?,?,?,1)",
            (email, google_id, full_name, avatar_url, intended_role)
        )
        new_id = cursor.lastrowid
        cursor.execute("UPDATE admin_invited_emails SET used=1 WHERE id=?", (invite_id,))
        conn.commit()
        conn.close()
        return new_id, intended_role, None

    conn.close()
    return None, None, 'not_invited'

# ─── Admin: user detail ────────────────────────────────────────────────────────

def get_user_detail_for_admin(user_email):
    """Return full user profile + decrypted assets + liabilities + computed IIF."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, email, premium_status, created_at, is_blocked, first_name, last_name FROM users WHERE email = ? COLLATE NOCASE",
        (user_email,)
    )
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None

    uid, email, premium, created_at, is_blocked, first_name, last_name = row
    assets     = get_assets(email)
    liabilities = get_liabilities(email)

    total_passive = sum(a['monthly_yield'] for a in assets)
    total_cost    = sum(l['monthly_cost'] for l in liabilities)
    if total_cost > 0:
        iif = round(((total_passive - total_cost) / abs(total_cost)) * 100, 1)
        iif = max(iif, -100)
    else:
        iif = 0

    return {
        'id':           uid,
        'email':        email,
        'first_name':   first_name or '',
        'last_name':    last_name or '',
        'premium_status': bool(premium),
        'created_at':   created_at,
        'is_blocked':   bool(is_blocked),
        'assets':       assets,
        'liabilities':  liabilities,
        'iif_score':    iif,
        'total_assets': sum(a['value'] for a in assets),
        'total_passive_income': total_passive,
        'total_monthly_cost':   total_cost,
        'net_cashflow':         total_passive - total_cost,
    }

# ─── Admin: product metrics ────────────────────────────────────────────────────

def get_product_metrics():
    import json
    from datetime import datetime, timedelta

    conn = get_db()
    cursor = conn.cursor()

    now = datetime.utcnow()
    cutoff_7d  = (now - timedelta(days=7)).strftime('%Y-%m-%d')
    cutoff_30d = (now - timedelta(days=30)).strftime('%Y-%m-%d')

    # Total registered users
    cursor.execute("SELECT COUNT(id) FROM users")
    total_users = cursor.fetchone()[0]

    # Total founders
    cursor.execute("SELECT COUNT(id) FROM founder_members WHERE status='active'")
    total_founders = cursor.fetchone()[0]

    # Users created > 7 days ago (for retention denominator)
    cursor.execute("SELECT COUNT(id) FROM users WHERE created_at <= ?", (cutoff_7d,))
    users_older_7d = cursor.fetchone()[0]

    # Users created > 30 days ago
    cursor.execute("SELECT COUNT(id) FROM users WHERE created_at <= ?", (cutoff_30d,))
    users_older_30d = cursor.fetchone()[0]

    # Active = have at least 1 asset (proxy for real usage)
    cursor.execute("""
        SELECT COUNT(DISTINCT u.id) FROM users u
        WHERE EXISTS (SELECT 1 FROM assets a WHERE a.user_id = u.email)
        AND u.created_at <= ?
    """, (cutoff_7d,))
    active_7d = cursor.fetchone()[0]

    cursor.execute("""
        SELECT COUNT(DISTINCT u.id) FROM users u
        WHERE EXISTS (SELECT 1 FROM assets a WHERE a.user_id = u.email)
        AND u.created_at <= ?
    """, (cutoff_30d,))
    active_30d = cursor.fetchone()[0]

    # Asset type distribution
    cursor.execute("SELECT type, COUNT(id) as cnt FROM assets GROUP BY type ORDER BY cnt DESC")
    asset_dist = {r[0]: r[1] for r in cursor.fetchall()}

    # Liability type distribution
    cursor.execute("SELECT type, COUNT(id) as cnt FROM liabilities GROUP BY type ORDER BY cnt DESC")
    liability_dist = {r[0]: r[1] for r in cursor.fetchall()}

    # Users with any data
    cursor.execute("""
        SELECT COUNT(DISTINCT u.id) FROM users u
        WHERE EXISTS (SELECT 1 FROM assets a WHERE a.user_id = u.email)
           OR EXISTS (SELECT 1 FROM liabilities l WHERE l.user_id = u.email)
    """)
    users_with_data = cursor.fetchone()[0]

    # Average IIF — compute in Python for users who have at least 1 asset
    cursor.execute("""
        SELECT DISTINCT u.email FROM users u
        WHERE EXISTS (SELECT 1 FROM assets a WHERE a.user_id = u.email)
        LIMIT 200
    """)
    sample_emails = [r[0] for r in cursor.fetchall()]
    conn.close()

    iif_scores = []
    for email in sample_emails:
        assets_u = get_assets(email)
        liabs_u  = get_liabilities(email)
        passive  = sum(a['monthly_yield'] for a in assets_u)
        cost     = sum(l['monthly_cost'] for l in liabs_u)
        if cost > 0:
            iif = max(round(((passive - cost) / abs(cost)) * 100, 1), -100)
        else:
            iif = 0 if passive == 0 else 100
        iif_scores.append(iif)

    avg_iif = round(sum(iif_scores) / len(iif_scores), 1) if iif_scores else 0

    return {
        'total_users':        total_users,
        'total_founders':     total_founders,
        'users_with_data':    users_with_data,
        'retention_7d_pct':   round(active_7d / users_older_7d * 100, 1) if users_older_7d else 0,
        'retention_30d_pct':  round(active_30d / users_older_30d * 100, 1) if users_older_30d else 0,
        'active_7d':          active_7d,
        'active_30d':         active_30d,
        'avg_iif_score':      avg_iif,
        'asset_distribution': asset_dist,
        'liability_distribution': liability_dist,
    }

# ─── Admin: Stripe payment history from founder_members ───────────────────────

def get_payment_history():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, email, stripe_customer_id, stripe_subscription_id,
               amount_paid, currency, status, created_at, member_number
        FROM founder_members
        ORDER BY created_at DESC
    """)
    rows = cursor.fetchall()
    conn.close()
    payments = []
    for r in rows:
        payments.append({
            'id':               r[0],
            'email':            r[1],
            'stripe_customer_id': r[2],
            'stripe_subscription_id': r[3],
            'amount_paid':      r[4],
            'currency':         r[5],
            'status':           r[6],
            'created_at':       r[7],
            'member_number':    r[8],
            'stripe_url': f"https://dashboard.stripe.com/customers/{r[2]}" if r[2] else None,
        })
    return payments

