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
            "currency": d["currency"] or "EUR",
            "first_name": d["first_name"] or "",
            "last_name": d["last_name"] or "",
            "custom_categories": d["custom_categories"] or "",
            "avatar": d.get("avatar") or ""
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

def set_premium_status(user_id, status, stripe_customer_id=None):
    conn = get_db()
    cursor = conn.cursor()
    if stripe_customer_id:
        cursor.execute("UPDATE users SET premium_status=?, stripe_customer_id=? WHERE email=? OR id=?", (int(status), stripe_customer_id, user_id, user_id))
    else:
        cursor.execute("UPDATE users SET premium_status=? WHERE email=? OR id=?", (int(status), user_id, user_id))
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
        from datetime import datetime, timedelta
        # Premium status set to 1 (active) with an expiration date in 3 days
        expires_date = (datetime.utcnow() + timedelta(days=3)).strftime("%Y-%m-%d %H:%M:%S")
        code = generate_unique_referral_code(cursor)
        cursor.execute(
            "INSERT INTO users (email, password, first_name, last_name, code_parrainage, parrain_id, premium_status, premium_expires) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
            (email.lower().strip(), pwd_hash, first_name, last_name, code, parrain_id, expires_date)
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

    # Create Google user
    from datetime import datetime, timedelta
    expires_date = (datetime.utcnow() + timedelta(days=3)).strftime("%Y-%m-%d %H:%M:%S")
    code = generate_unique_referral_code(cursor)
    cursor.execute(
        "INSERT INTO users (email, google_id, password, code_parrainage, premium_status, premium_expires) VALUES (?, ?, '', ?, 1, ?)",
        (email_clean, google_id, code, expires_date)
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

    # Create Apple user
    from datetime import datetime, timedelta
    expires_date = (datetime.utcnow() + timedelta(days=3)).strftime("%Y-%m-%d %H:%M:%S")
    code = generate_unique_referral_code(cursor)
    cursor.execute(
        "INSERT INTO users (email, apple_id, password, code_parrainage, premium_status, premium_expires) VALUES (?, ?, '', ?, 1, ?)",
        (email_clean, apple_id, code, expires_date)
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

# Affiliation / Referral program (Revenu Passif)
# Commission per active premium referral. Philia Vault Premium Monthly is
# priced at 9.99 (see price_amount in server.py /api/stripe/create-checkout-session).
# We pay out ~30% of that monthly subscription price per active referral.
COMMISSION_PER_REFERRAL = 3.00

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
    conn.close()

    return {
        "code_parrainage": code,
        "active_referrals": active_referrals,
        "estimated_monthly_gain": round(active_referrals * COMMISSION_PER_REFERRAL, 2),
        "commission_per_referral": COMMISSION_PER_REFERRAL,
    }

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
    cursor.execute("""
        SELECT id, email, code_parrainage, premium_status, created_at, is_blocked 
        FROM users 
        ORDER BY created_at DESC
    """)
    rows = cursor.fetchall()
    conn.close()
    
    users = []
    for row in rows:
        users.append({
            "id": row[0],
            "email": row[1],
            "code_parrainage": row[2],
            "balance": 0.00,  # Mocked as we don't have a direct balance column
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
    return True

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

