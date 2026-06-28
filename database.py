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
        # SECURITY: Stable fallback key for local dev so restarts don't break decryption
        # AVERTISSEMENT CRITIQUE: Cette clé de fallback est codée en dur et connue de quiconque
        # lit ce code. En production, DB_ENCRYPTION_KEY DOIT être définie dans l'environnement.
        # Voir .env.example pour générer une clé via: python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
        print("WARNING [SECURITY] DB_ENCRYPTION_KEY non définie dans l'environnement — utilisation de la clé de fallback codée en dur !")  # SECURITY
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
        monthly_income REAL DEFAULT 0,
        income_updated_at TIMESTAMP,
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
        ("password_reset_expires", "TEXT"),
        ("monthly_income", "REAL DEFAULT 0"),
        ("income_updated_at", "TIMESTAMP"),
        ("available_cashflow", "REAL DEFAULT 0.0"),
        ("total_hemorrhage", "INTEGER DEFAULT 0"),
        ("daily_budget", "REAL DEFAULT 0"),
        ("stripe_status", "TEXT DEFAULT 'free'"),
        ("payment_channel", "TEXT"),
        ("stripe_status_updated_at", "TIMESTAMP")
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

    # Create push_subscriptions table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        device_type TEXT DEFAULT 'unknown',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_used_at TIMESTAMP,
        is_active INTEGER DEFAULT 1,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
    """)

    # Create daily_discipline table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS daily_discipline (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('success', 'failed')),
        amount_spent REAL NOT NULL,
        freedom_days_earned REAL NOT NULL,
        category_id INTEGER DEFAULT 1,
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(user_id, date)
    )
    """)

    try:
        cursor.execute("ALTER TABLE daily_discipline ADD COLUMN category_id INTEGER DEFAULT 1")
    except Exception:
        pass

    # Migrate daily_discipline for My Target: add new columns
    for col_def in [
        ("reason", "TEXT"),
        ("points", "INTEGER DEFAULT 0"),
        ("epargne_du_jour", "REAL DEFAULT 0"),
        ("depense_du_jour", "REAL DEFAULT 0"),
    ]:
        try:
            cursor.execute(f"ALTER TABLE daily_discipline ADD COLUMN {col_def[0]} {col_def[1]}")
        except Exception:
            pass

    # Create user_targets table for My Target feature
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS user_targets (
        user_id INTEGER PRIMARY KEY,
        monthly_savings_goal REAL DEFAULT 0,
        monthly_budget REAL DEFAULT 0,
        monthly_income REAL DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
    """)

    # Create financial_goals table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS financial_goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        target_amount REAL NOT NULL,
        saved_amount REAL DEFAULT 0,
        target_date DATE NOT NULL,
        category TEXT DEFAULT 'savings' CHECK (category IN ('savings','debt','investment','project')),
        status TEXT DEFAULT 'active' CHECK (status IN ('active','completed','abandoned')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    );
    """)

    # Create goal_contributions table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS goal_contributions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        goal_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        note TEXT,
        contributed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (goal_id) REFERENCES financial_goals(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
    );
    """)

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
            "monthly_income": d.get("monthly_income", 0.0),
            "income_updated_at": d.get("income_updated_at"),
            "created_at": d.get("created_at"),
            "stripe_status": d.get("stripe_status") or "free",
            "payment_channel": d.get("payment_channel"),
            "is_blocked": bool(d.get("is_blocked", 0))
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

def update_user_income(user_id, monthly_income: float) -> bool:
    """Met à jour le revenu mensuel net de l'utilisateur"""
    conn = get_db()
    try:
        conn.execute("""
            UPDATE users 
            SET monthly_income = ?,
                income_updated_at = CURRENT_TIMESTAMP
            WHERE email = ? OR id = ?
        """, (monthly_income, user_id, user_id))
        conn.commit()
        return True
    except Exception as e:
        print(f"Erreur update_user_income: {e}")
        return False
    finally:
        conn.close()

def get_user_income(user_id) -> float:
    """Retourne le revenu mensuel net de l'utilisateur"""
    conn = get_db()
    try:
        result = conn.execute(
            "SELECT monthly_income FROM users WHERE email = ? OR id = ?",
            (user_id, user_id)
        ).fetchone()
        return result['monthly_income'] if result else 0.0
    except Exception as e:
        print(f"Erreur get_user_income: {e}")
        return 0.0
    finally:
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

# ─── Push Notifications Helpers ───────────────────────────────────────────────

def save_push_subscription(user_id: int, subscription: dict) -> bool:
    """Enregistre ou met à jour une subscription push"""
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO push_subscriptions
            (user_id, endpoint, p256dh, auth, device_type, last_used_at, is_active)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 1)
        """, (
            user_id,
            subscription['endpoint'],
            subscription['keys']['p256dh'],
            subscription['keys']['auth'],
            subscription.get('device_type', 'unknown')
        ))
        conn.commit()
        return True
    except Exception as e:
        print(f"Erreur save_push_subscription: {e}")
        return False
    finally:
        conn.close()

def deactivate_push_subscription(endpoint: str) -> bool:
    """Marque une subscription push comme inactive"""
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE push_subscriptions SET is_active = 0
            WHERE endpoint = ?
        """, (endpoint,))
        conn.commit()
        return True
    except Exception as e:
        print(f"Erreur deactivate_push_subscription: {e}")
        return False
    finally:
        conn.close()

def get_user_subscriptions(user_id: int) -> list:
    """Retourne toutes les subscriptions actives d'un utilisateur"""
    conn = get_db()
    try:
        cursor = conn.cursor()
        rows = cursor.execute("""
            SELECT endpoint, p256dh, auth
            FROM push_subscriptions
            WHERE user_id = ? AND is_active = 1
        """, (user_id,)).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()

def get_users_for_daily_decision_reminder() -> list:
    """Retourne les users qui n'ont pas encore répondu au dilemme du jour"""
    conn = get_db()
    try:
        import datetime
        today = datetime.date.today().isoformat()
        rows = conn.execute("""
            SELECT DISTINCT u.id
            FROM users u
            JOIN push_subscriptions ps ON ps.user_id = u.id
            WHERE u.premium_status = 1
            AND ps.is_active = 1
            AND u.id NOT IN (
                SELECT user_id FROM user_dilemma_history
                WHERE DATE(answered_at) = ?
            )
        """, (today,)).fetchall()
        return [row['id'] for row in rows]
    finally:
        conn.close()

def get_users_negative_cashflow() -> list:
    """Retourne les users avec cashflow négatif (actifs < passifs)"""
    conn = get_db()
    try:
        # Get users with active subscription and premium_status = 1
        rows = conn.execute("""
            SELECT DISTINCT u.id, u.email
            FROM users u
            JOIN push_subscriptions ps ON ps.user_id = u.id
            WHERE u.premium_status = 1
            AND ps.is_active = 1
        """).fetchall()
        
        users_neg = []
        for r in rows:
            user_id_int = r["id"]
            user_email = r["email"]
            
            assets_id = get_assets(str(user_id_int))
            assets_email = get_assets(user_email)
            all_assets = assets_id + [a for a in assets_email if a["id"] not in {x["id"] for x in assets_id}]
            
            liab_id = get_liabilities(str(user_id_int))
            liab_email = get_liabilities(user_email)
            all_liab = liab_id + [l for l in liab_email if l["id"] not in {x["id"] for x in liab_id}]
            
            total_passive_income = sum(a["monthly_yield"] for a in all_assets)
            total_monthly_cost = sum(l["monthly_cost"] for l in all_liab)
            
            if total_passive_income < total_monthly_cost:
                users_neg.append(user_id_int)
        return users_neg
    finally:
        conn.close()

def get_users_renewal_reminder() -> list:
    """Retourne les users dont l'abonnement se renouvelle/expire dans 24h"""
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT u.id
            FROM users u
            JOIN push_subscriptions ps ON ps.user_id = u.id
            WHERE u.premium_status = 1
            AND ps.is_active = 1
            AND DATE(u.premium_expires) = DATE('now', '+1 day')
        """).fetchall()
        return [row['id'] for row in rows]
    finally:
        conn.close()


# ─── Discipline Helpers ───────────────────────────────────────────────────────

def save_discipline_entry(user_id: int, date_str: str, status: str, amount_spent: float, freedom_days_earned: float, category_id: int = 1) -> bool:
    """Enregistre ou met à jour une entrée de discipline quotidienne"""
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO daily_discipline
            (user_id, date, status, amount_spent, freedom_days_earned, category_id)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (user_id, date_str, status, amount_spent, freedom_days_earned, category_id))
        conn.commit()
        return True
    except Exception as e:
        print(f"Erreur save_discipline_entry: {e}")
        return False
    finally:
        conn.close()

def get_discipline_history(user_id: int, start_date: str, end_date: str) -> list:
    """Retourne l'historique des entrées de discipline pour un intervalle de dates"""
    conn = get_db()
    try:
        cursor = conn.cursor()
        rows = cursor.execute("""
            SELECT date, status, amount_spent, freedom_days_earned, category_id
            FROM daily_discipline
            WHERE user_id = ? AND date BETWEEN ? AND ?
            ORDER BY date ASC
        """, (user_id, start_date, end_date)).fetchall()
        return [dict(row) for row in rows]
    except Exception as e:
        print(f"Erreur get_discipline_history: {e}")
        return []
    finally:
        conn.close()

def update_user_balance(user_id: int, amount_spent: float, is_hemorrhage: bool) -> bool:
    """Met à jour le solde (available_cashflow) et incrémente total_hemorrhage en transaction"""
    conn = get_db()
    try:
        conn.execute("BEGIN TRANSACTION")
        cursor = conn.cursor()
        
        # Obtenir les informations de l'utilisateur
        cursor.execute("""
            SELECT available_cashflow, total_hemorrhage, monthly_income, email 
            FROM users WHERE id = ?
        """, (user_id,))
        row = cursor.fetchone()
        if not row:
            conn.execute("ROLLBACK")
            return False
            
        current_cashflow = row["available_cashflow"] or 0.0
        current_hemorrhage = row["total_hemorrhage"] or 0
        monthly_income = row["monthly_income"] or 0.0
        user_email = row["email"]

        # Si available_cashflow est 0.0, l'initialiser à partir du cashflow calculé
        if current_cashflow == 0.0 and monthly_income > 0.0:
            # Calculer les charges mensuelles (passifs)
            cursor.execute("""
                SELECT monthly_cost FROM liabilities 
                WHERE user_id = ? OR user_id = ?
            """, (str(user_id), user_email))
            liab_rows = cursor.fetchall()
            total_liab_cost = 0.0
            for lr in liab_rows:
                val = decrypt_val(lr["monthly_cost"])
                if val is not None:
                    total_liab_cost += val

            # Calculer les rendements d'actifs
            cursor.execute("""
                SELECT monthly_yield FROM assets 
                WHERE user_id = ? OR user_id = ?
            """, (str(user_id), user_email))
            asset_rows = cursor.fetchall()
            total_asset_yield = 0.0
            for ar in asset_rows:
                val = decrypt_val(ar["monthly_yield"])
                if val is not None:
                    total_asset_yield += val
            
            current_cashflow = monthly_income - total_liab_cost + total_asset_yield
            
        new_cashflow = current_cashflow - amount_spent
        new_hemorrhage = current_hemorrhage + (1 if is_hemorrhage else 0)
        
        cursor.execute("""
            UPDATE users
            SET available_cashflow = ?, total_hemorrhage = ?
            WHERE id = ?
        """, (new_cashflow, new_hemorrhage, user_id))
        
        conn.commit()
        return True
    except Exception as e:
        conn.execute("ROLLBACK")
        print(f"Erreur update_user_balance: {e}")
        return False
    finally:
        conn.close()

def calculate_daily_budget(user_id: int) -> float:
    """Calcule le budget quotidien dynamique restant pour le mois en cours"""
    import datetime
    import calendar
    conn = get_db()
    try:
        cursor = conn.cursor()
        # Récupérer le revenu mensuel
        cursor.execute("SELECT monthly_income FROM users WHERE id = ? OR email = ?", (user_id, user_id))
        row = cursor.fetchone()
        monthly_income = row["monthly_income"] if row else 0.0
        
        # Récupérer la somme de toutes les dépenses du mois en cours
        today = datetime.date.today()
        month_str = today.strftime("%Y-%m")
        cursor.execute("""
            SELECT SUM(amount_spent) FROM daily_discipline
            WHERE user_id = (SELECT id FROM users WHERE id = ? OR email = ?) AND date LIKE ?
        """, (user_id, user_id, f"{month_str}-%"))
        sum_row = cursor.fetchone()
        sum_spent = sum_row[0] if sum_row and sum_row[0] is not None else 0.0
        
        budget_restant = monthly_income - sum_spent
        days_in_month = calendar.monthrange(today.year, today.month)[1]
        jours_restants = days_in_month - today.day
        if jours_restants < 1:
            jours_restants = 1
            
        nouveau_daily_budget = budget_restant / jours_restants
        return max(round(nouveau_daily_budget, 2), 0.0)
    except Exception as e:
        print(f"Erreur calculate_daily_budget: {e}")
        return 0.0
    finally:
        conn.close()

def get_discipline_streak(user_id: int) -> int:
    """Calcule le streak actuel d'entrées success"""
    conn = get_db()
    try:
        import datetime
        cursor = conn.cursor()
        rows = cursor.execute("""
            SELECT date FROM daily_discipline
            WHERE user_id = ? AND status = 'success'
            ORDER BY date DESC
        """, (user_id,)).fetchall()
        
        dates = [r[0] for r in rows]
        if not dates:
            return 0
            
        today = datetime.date.today()
        yesterday = today - datetime.timedelta(days=1)
        
        success_dates = set()
        for d_str in dates:
            try:
                d = datetime.datetime.strptime(d_str, "%Y-%m-%d").date()
                success_dates.add(d)
            except ValueError:
                pass
        
        current = today
        if current not in success_dates:
            current = yesterday
            if current not in success_dates:
                return 0
        
        streak = 0
        while current in success_dates:
            streak += 1
            current -= datetime.timedelta(days=1)
        return streak
    except Exception as e:
        print(f"Erreur get_discipline_streak: {e}")
        return 0
    finally:
        conn.close()


# ─── Financial Goals & Extended Discipline Helpers ───────────────────────────

def get_or_calculate_daily_budget(user_id: int) -> float:
    """Retourne le budget quotidien défini ou calculé automatiquement"""
    conn = get_db()
    try:
        result = conn.execute(
            "SELECT daily_budget, monthly_income FROM users WHERE id = ?",
            (user_id,)
        ).fetchone()
        
        if not result:
            return 0.0
            
        if result['daily_budget'] and result['daily_budget'] > 0:
            return result['daily_budget']
        
        # Calcul automatique : revenu mensuel / 30
        if result['monthly_income'] and result['monthly_income'] > 0:
            return round(result['monthly_income'] / 30, 2)
        
        return 0.0
    finally:
        conn.close()

def update_user_daily_budget(user_id: int, daily_budget: float) -> bool:
    """Met à jour le budget quotidien défini par l'utilisateur"""
    conn = get_db()
    try:
        conn.execute(
            "UPDATE users SET daily_budget = ? WHERE id = ?",
            (daily_budget, user_id)
        )
        conn.commit()
        return True
    except Exception as e:
        print(f"Erreur update_user_daily_budget: {e}")
        return False
    finally:
        conn.close()

def get_user_goals(user_id: int) -> list:
    """Retourne tous les objectifs actifs de l'utilisateur avec calculs"""
    conn = get_db()
    try:
        goals = conn.execute("""
            SELECT
                g.*,
                ROUND((g.saved_amount / g.target_amount) * 100, 1)
                    as progress_pct,
                CAST(
                    (julianday(g.target_date) - julianday('now'))
                AS INTEGER) as days_remaining,
                ROUND(
                    (g.target_amount - g.saved_amount) /
                    MAX(1, (
                        (julianday(g.target_date) - julianday('now')) / 30
                    ))
                , 2) as monthly_needed
            FROM financial_goals g
            WHERE g.user_id = ? AND g.status = 'active'
            ORDER BY g.target_date ASC
        """, (user_id,)).fetchall()
        return [dict(g) for g in goals]
    finally:
        conn.close()

def create_goal(user_id: int, name: str, target_amount: float,
                target_date: str, category: str) -> int:
    """Crée un nouvel objectif financier"""
    conn = get_db()
    try:
        cursor = conn.execute("""
            INSERT INTO financial_goals
            (user_id, name, target_amount, target_date, category)
            VALUES (?, ?, ?, ?, ?)
        """, (user_id, name, target_amount, target_date, category))
        conn.commit()
        return cursor.lastrowid
    finally:
        conn.close()

def add_goal_contribution(goal_id: int, user_id: int,
                          amount: float, note: str = '') -> bool:
    """Ajoute une contribution à un objectif"""
    conn = get_db()
    try:
        conn.execute("BEGIN TRANSACTION")
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO goal_contributions
            (goal_id, user_id, amount, note)
            VALUES (?, ?, ?, ?)
        """, (goal_id, user_id, amount, note))
        
        # Mettre à jour le montant épargné
        cursor.execute("""
            UPDATE financial_goals
            SET saved_amount = saved_amount + ?
            WHERE id = ? AND user_id = ?
        """, (amount, goal_id, user_id))
        
        # Vérifier si l'objectif est atteint
        goal = cursor.execute(
            "SELECT saved_amount, target_amount FROM financial_goals WHERE id = ?",
            (goal_id,)
        ).fetchone()
        
        if goal and goal['saved_amount'] >= goal['target_amount']:
            cursor.execute("""
                UPDATE financial_goals
                SET status = 'completed', completed_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (goal_id,))
        
        conn.commit()
        return True
    except Exception as e:
        conn.execute("ROLLBACK")
        print(f"Erreur add_goal_contribution: {e}")
        return False
    finally:
        conn.close()

def validate_discipline_day(user_id: int, date: str) -> bool:
    """
    Un jour est vert si au moins une de ces conditions est vraie :
    1. Daily Decision complété
    2. Contribution à un objectif
    3. Dépenses inférieures au budget quotidien (si budget > 0 et dépenses enregistrées)
    """
    conn = get_db()
    try:
        cursor = conn.cursor()
        # Vérifier Daily Decision
        daily_done = cursor.execute("""
            SELECT COUNT(*) as cnt FROM user_dilemma_history
            WHERE user_id = ? AND DATE(answered_at, 'localtime') = ?
        """, (user_id, date)).fetchone()['cnt'] > 0

        # Vérifier contribution objectif
        goal_contributed = cursor.execute("""
            SELECT COUNT(*) as cnt FROM goal_contributions
            WHERE user_id = ? AND DATE(contributed_at, 'localtime') = ?
        """, (user_id, date)).fetchone()['cnt'] > 0

        # Vérifier budget respecté (si budget défini et log existant)
        budget = get_or_calculate_daily_budget(user_id)
        spending_ok = True
        
        has_log = cursor.execute("""
            SELECT COUNT(*) as cnt FROM daily_discipline
            WHERE user_id = ? AND date = ?
        """, (user_id, date)).fetchone()['cnt'] > 0

        if budget > 0:
            daily_spending = cursor.execute("""
                SELECT COALESCE(SUM(amount_spent), 0) as total
                FROM daily_discipline
                WHERE user_id = ? AND date = ?
            """, (user_id, date)).fetchone()['total']
            spending_ok = daily_spending <= budget
        elif has_log:
            daily_spending = cursor.execute("""
                SELECT COALESCE(SUM(amount_spent), 0) as total
                FROM daily_discipline
                WHERE user_id = ? AND date = ?
            """, (user_id, date)).fetchone()['total']
            spending_ok = daily_spending <= 0

        return daily_done or goal_contributed or (has_log and spending_ok)
    finally:
        conn.close()

def recalculate_and_save_discipline_status(user_id: int, date_str: str) -> bool:
    """Recalcule le statut d'un jour donné (success ou failed) et le met à jour dans daily_discipline"""
    conn = get_db()
    try:
        cursor = conn.cursor()
        
        # Check if they have any activity on this date: dilemma, contribution, or existing discipline entry
        daily_done = cursor.execute("""
            SELECT COUNT(*) as cnt FROM user_dilemma_history
            WHERE user_id = ? AND DATE(answered_at, 'localtime') = ?
        """, (user_id, date_str)).fetchone()['cnt'] > 0

        goal_contributed = cursor.execute("""
            SELECT COUNT(*) as cnt FROM goal_contributions
            WHERE user_id = ? AND DATE(contributed_at, 'localtime') = ?
        """, (user_id, date_str)).fetchone()['cnt'] > 0

        existing = cursor.execute("""
            SELECT amount_spent, freedom_days_earned, category_id
            FROM daily_discipline
            WHERE user_id = ? AND date = ?
        """, (user_id, date_str)).fetchone()

        if not (daily_done or goal_contributed or existing):
            return True

        # Calculate if the day was successful
        is_success = validate_discipline_day(user_id, date_str)
        status = 'success' if is_success else 'failed'

        # Get existing values or use defaults
        amount_spent = existing['amount_spent'] if existing else 0.0
        freedom_days_earned = existing['freedom_days_earned'] if existing else 0.0
        category_id = existing['category_id'] if existing else 1

        # If it's a success now and freedom_days_earned is 0.0, calculate freedom_days_earned
        if is_success and freedom_days_earned == 0.0:
            budget = get_or_calculate_daily_budget(user_id)
            if budget > 0 and amount_spent < budget:
                liabilities = get_liabilities(user_id)
                total_monthly_cost = sum(l["monthly_cost"] for l in liabilities)
                daily_vital_cost = total_monthly_cost / 30.0
                vital_cost_divisor = max(daily_vital_cost, 1.0)
                freedom_days_earned = (budget - amount_spent) / vital_cost_divisor

        cursor.execute("""
            INSERT OR REPLACE INTO daily_discipline
            (user_id, date, status, amount_spent, freedom_days_earned, category_id)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (user_id, date_str, status, amount_spent, freedom_days_earned, category_id))
        conn.commit()
        return True
    except Exception as e:
        print(f"Erreur recalculate_and_save_discipline_status: {e}")
        return False
    finally:
        conn.close()

def update_user_premium_status(app_user_id: str,
                                new_status: str,
                                source: str = 'stripe') -> bool:
    """
    Met à jour le statut premium d'un utilisateur.
    app_user_id = user.id.toString() (envoyé à RevenueCat à l'init)
    source = 'stripe' ou 'revenuecat'
    """
    conn = get_db()
    try:
        premium_status = 1 if new_status in ['active', 'trialing'] else 0
        conn.execute("""
            UPDATE users
            SET stripe_status = ?,
                payment_channel = ?,
                stripe_status_updated_at = CURRENT_TIMESTAMP,
                premium_status = ?
            WHERE id = ?
        """, (new_status, source, premium_status, int(app_user_id)))
        conn.commit()
        return True
    except Exception as e:
        print(f"Erreur update_user_premium_status: {e}")
        return False
    finally:
        conn.close()

def update_user_by_stripe_customer(stripe_customer_id: str,
                                    new_status: str) -> bool:
    conn = get_db()
    try:
        premium_status = 1 if new_status in ['active', 'trialing'] else 0
        conn.execute("""
            UPDATE users
            SET stripe_status = ?,
                payment_channel = 'stripe',
                stripe_status_updated_at = CURRENT_TIMESTAMP,
                premium_status = ?
            WHERE stripe_customer_id = ?
        """, (new_status, premium_status, stripe_customer_id))
        conn.commit()
        return True
    except Exception as e:
        print(f"Erreur update_user_by_stripe_customer: {e}")
        return False
    finally:
        conn.close()

def get_user_stripe_status(user_id) -> str:
    """
    Récupère le statut stripe/premium de l'utilisateur.
    """
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT stripe_status FROM users WHERE id = ? OR email = ?", (user_id, user_id))
        row = cursor.fetchone()
        if row and row["stripe_status"]:
            return row["stripe_status"]
        # Fallback to premium_status if stripe_status not set
        cursor.execute("SELECT premium_status FROM users WHERE id = ? OR email = ?", (user_id, user_id))
        row = cursor.fetchone()
        if row and row["premium_status"] == 1:
            return "active"
        return "free"
    except Exception as e:
        print(f"Erreur get_user_stripe_status: {e}")
        return "free"
    finally:
        conn.close()


# ─── My Target Helpers ────────────────────────────────────────────────────────

def get_user_targets(user_id: int) -> dict:
    """Retourne les objectifs mensuels de l'utilisateur (My Target)"""
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM user_targets WHERE user_id = ?",
            (user_id,)
        ).fetchone()
        if row:
            return dict(row)
        # Return defaults if no targets set
        return {
            "user_id": user_id,
            "monthly_savings_goal": 0.0,
            "monthly_budget": 0.0,
            "monthly_income": 0.0,
        }
    finally:
        conn.close()


def set_user_targets(user_id: int, savings_goal: float, monthly_budget: float) -> bool:
    """Définit ou met à jour les objectifs mensuels de l'utilisateur"""
    conn = get_db()
    try:
        # Also update monthly_income from users table
        income_row = conn.execute(
            "SELECT monthly_income FROM users WHERE id = ?",
            (user_id,)
        ).fetchone()
        monthly_income = income_row["monthly_income"] if income_row else 0.0

        conn.execute("""
            INSERT INTO user_targets (user_id, monthly_savings_goal, monthly_budget, monthly_income)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                monthly_savings_goal = excluded.monthly_savings_goal,
                monthly_budget = excluded.monthly_budget,
                monthly_income = excluded.monthly_income
        """, (user_id, savings_goal, monthly_budget, monthly_income))
        conn.commit()
        return True
    except Exception as e:
        print(f"Erreur set_user_targets: {e}")
        return False
    finally:
        conn.close()


def save_daily_target_entry(user_id: int, date_str: str, epargne: float,
                            depense: float, status: str, points: int = 0,
                            reason: str = "") -> bool:
    """Enregistre une entrée quotidienne My Target dans daily_discipline
    Note: status must be 'success' or 'failed' per table CHECK constraint.
    """
    conn = get_db()
    try:
        # Normalize status to match table CHECK constraint
        if status not in ('success', 'failed'):
            if status == 'failure':
                status = 'failed'
            else:
                status = 'failed'  # default for neutral/unknown

        # Get existing freedom_days_earned if already present
        existing = conn.execute("""
            SELECT id, freedom_days_earned, amount_spent, category_id
            FROM daily_discipline
            WHERE user_id = ? AND date = ?
        """, (user_id, date_str)).fetchone()

        if existing:
            conn.execute("""
                UPDATE daily_discipline
                SET status = ?,
                    epargne_du_jour = ?,
                    depense_du_jour = ?,
                    amount_spent = ?,
                    points = ?,
                    reason = ?
                WHERE id = ?
            """, (status, epargne, depense, depense, points, reason, existing["id"]))
        else:
            conn.execute("""
                INSERT INTO daily_discipline
                (user_id, date, status, epargne_du_jour, depense_du_jour,
                 amount_spent, freedom_days_earned, points, reason, category_id)
                VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 1)
            """, (user_id, date_str, status, epargne, depense, depense, points, reason))
        conn.commit()
        return True
    except Exception as e:
        print(f"Erreur save_daily_target_entry: {e}")
        return False
    finally:
        conn.close()


def get_monthly_target_entries(user_id: int, year_month: str) -> list:
    """Retourne les entrées My Target pour un mois donné (YYYY-MM)"""
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT date, status, epargne_du_jour, depense_du_jour,
                   points, reason, amount_spent as depense
            FROM daily_discipline
            WHERE user_id = ? AND date LIKE ?
            ORDER BY date ASC
        """, (user_id, f"{year_month}-%")).fetchall()
        return [dict(r) for r in rows]
    except Exception as e:
        print(f"Erreur get_monthly_target_entries: {e}")
        return []
    finally:
        conn.close()


def get_target_streak_data(user_id: int) -> dict:
    """Calcule la série de succès consécutifs à partir d'aujourd'hui.
    Retourne { streak_count, label }
    Labels: 1-6='Étincelle', 7-29='Flamme', 30-99='Brasier',
            100-364='Phare', 365+='Légende Philia'
    """
    conn = get_db()
    try:
        import datetime
        cursor = conn.cursor()
        rows = cursor.execute("""
            SELECT date, status FROM daily_discipline
            WHERE user_id = ? AND status IN ('success', 'failure')
            ORDER BY date DESC
        """, (user_id,)).fetchall()

        if not rows:
            return {"streak_count": 0, "label": "Aucune"}

        # Build a lookup: date -> status
        status_map = {}
        for r in rows:
            status_map[r["date"]] = r["status"]

        today = datetime.date.today()
        current = today
        streak = 0

        while True:
            d_str = current.isoformat()
            if d_str in status_map:
                if status_map[d_str] == 'success':
                    streak += 1
                else:
                    # Failed day breaks the streak, but only if today hasn't started
                    if current == today:
                        # Today is a failure, streak is 0
                        streak = 0
                        break
                    break
            else:
                # No entry for this day — streak is broken (unless it's today)
                if current == today:
                    # Today has no entry, streak starts counting from yesterday
                    current -= datetime.timedelta(days=1)
                    continue
                break
            current -= datetime.timedelta(days=1)

        # Determine label
        if streak >= 365:
            label = "Légende Philia"
        elif streak >= 100:
            label = "Phare"
        elif streak >= 30:
            label = "Brasier"
        elif streak >= 7:
            label = "Flamme"
        elif streak >= 1:
            label = "Étincelle"
        else:
            label = "Aucune"

        return {"streak_count": streak, "label": label}
    except Exception as e:
        print(f"Erreur get_target_streak_data: {e}")
        return {"streak_count": 0, "label": "Aucune"}
    finally:
        conn.close()


def get_target_summary_data(user_id: int) -> dict:
    """Calcule le résumé My Target pour l'utilisateur.
    Jours de Liberté = (CASHFLOW_ACTIFS * 12) / (DEPENSES_ANNUELLES / 365)
    Si DEPENSES_ANNUELLES = 0 → jours_liberte = 0
    """
    conn = get_db()
    try:
        import datetime
        cursor = conn.cursor()

        # Récupérer les objectifs
        targets = get_user_targets(user_id)
        budget_mensuel = targets.get("monthly_budget", 0.0)
        objectif_epargne = targets.get("monthly_savings_goal", 0.0)

        # Récupérer les actifs (cashflow actifs)
        assets = get_assets(user_id)
        cashflow_actifs = sum(a.get("monthly_yield", 0) for a in assets)

        # Récupérer les passifs (dépenses annuelles)
        liabilities = get_liabilities(user_id)
        depenses_mensuelles = sum(l.get("monthly_cost", 0) for l in liabilities)
        depenses_annuelles = depenses_mensuelles * 12

        # Jours de Liberté
        if depenses_annuelles > 0:
            jours_liberte = (cashflow_actifs * 12) / (depenses_annuelles / 365)
        else:
            jours_liberte = 0.0

        # Progression (percentage of savings goal achieved this month)
        today = datetime.date.today()
        month_str = today.strftime("%Y-%m")
        rows = cursor.execute("""
            SELECT COALESCE(SUM(epargne_du_jour), 0) as total_epargne
            FROM daily_discipline
            WHERE user_id = ? AND date LIKE ? AND status = 'success'
        """, (user_id, f"{month_str}-%")).fetchone()
        total_epargne_mois = rows["total_epargne"] if rows else 0.0

        progression = 0.0
        if objectif_epargne > 0:
            progression = round((total_epargne_mois / objectif_epargne) * 100, 1)

        return {
            "budget_mensuel": budget_mensuel,
            "objectif_epargne": objectif_epargne,
            "jours_liberte": round(jours_liberte, 2),
            "progression": progression,
            "total_epargne_mois": round(total_epargne_mois, 2),
        }
    except Exception as e:
        print(f"Erreur get_target_summary_data: {e}")
        return {
            "budget_mensuel": 0.0,
            "objectif_epargne": 0.0,
            "jours_liberte": 0.0,
            "progression": 0.0,
            "total_epargne_mois": 0.0,
        }
    finally:
        conn.close()


def auto_insert_neutral_entries() -> int:
    """Cron job: Insère des entrées 'failure' avec reason='neutral' pour les
    utilisateurs n'ayant pas d'entrée aujourd'hui.
    Si depense_du_jour > budget_variable → 'failure'.
    Retourne le nombre d'entrées insérées.
    """
    conn = get_db()
    try:
        import datetime
        today = datetime.date.today().isoformat()
        cursor = conn.cursor()

        # Get all users who have targets set
        users = cursor.execute("""
            SELECT ut.user_id FROM user_targets ut
            WHERE ut.monthly_budget > 0 OR ut.monthly_savings_goal > 0
        """).fetchall()

        count = 0
        for user_row in users:
            uid = user_row["user_id"]

            # Check if entry exists for today
            existing = cursor.execute("""
                SELECT id FROM daily_discipline
                WHERE user_id = ? AND date = ?
            """, (uid, today)).fetchone()

            if existing:
                continue

            # Auto-insert neutral entry
            cursor.execute("""
                INSERT INTO daily_discipline
                (user_id, date, status, amount_spent, freedom_days_earned,
                 epargne_du_jour, depense_du_jour, points, reason, category_id)
                VALUES (?, ?, 'failure', 0, 0, 0, 0, 0, 'neutral', 1)
            """, (uid, today))
            count += 1

        if count > 0:
            conn.commit()
        return count
    except Exception as e:
        print(f"Erreur auto_insert_neutral_entries: {e}")
        conn.rollback()
        return 0
    finally:
        conn.close()

