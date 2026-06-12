import sqlite3
import os
import base64
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
        custom_categories TEXT
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
        ("custom_categories", "TEXT")
    ]:
        try:
            cursor.execute(f"ALTER TABLE users ADD COLUMN {col_def[0]} {col_def[1]}")
        except Exception:
            pass

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

    # Migrate old data if any exists without user_id
    for table in ["assets", "liabilities", "transactions", "savings_goals"]:
        try:
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN user_id TEXT")
        except Exception:
            pass
            
    conn.commit()
    conn.close()

# Seed mock data for new users to start with a realistic dashboard
def seed_user_data(user_id):
    conn = get_db()
    cursor = conn.cursor()
    
    # Check if user already has data
    cursor.execute("SELECT COUNT(*) FROM assets WHERE user_id = ?", (user_id,))
    if cursor.fetchone()[0] == 0:
        # Seed Assets
        assets = [
            (user_id, "Stocks Portfolio", "Stocks", encrypt_val(42850.00), encrypt_val(840.12)),
            (user_id, "Crypto Staking", "Crypto", encrypt_val(12305.50), encrypt_val(312.45)),
            (user_id, "Shopify Store", "Commerce", encrypt_val(28400.00), encrypt_val(4250.00)),
            (user_id, "Rental Property", "Real Estate", encrypt_val(350000.00), encrypt_val(1800.00))
        ]
        cursor.executemany("INSERT INTO assets (user_id, name, type, value, monthly_yield) VALUES (?, ?, ?, ?, ?)", assets)
        
        # Seed Liabilities
        liabilities = [
            (user_id, "Real Estate Mortgage", "Mortgage", encrypt_val(422000.00), encrypt_val(245000.00), encrypt_val(1450.00)),
            (user_id, "Tesla Model Y Lease", "Loan", encrypt_val(56000.00), encrypt_val(12400.00), encrypt_val(680.00)),
            (user_id, "Business Expansion Loan", "Loan", encrypt_val(56000.00), encrypt_val(4500.00), encrypt_val(210.00)),
            (user_id, "Netflix Premium", "Subscription", encrypt_val(215.00), encrypt_val(215.00), encrypt_val(17.92)),
            (user_id, "Spotify Family", "Subscription", encrypt_val(119.00), encrypt_val(119.00), encrypt_val(9.92)),
            (user_id, "Klarna Shopping BNPL", "Subscription", encrypt_val(840.00), encrypt_val(840.00), encrypt_val(70.00)),
            (user_id, "Adobe CC Portfolio", "Subscription", encrypt_val(635.00), encrypt_val(635.00), encrypt_val(52.92))
        ]
        cursor.executemany("INSERT INTO liabilities (user_id, name, type, total_amount, remaining_amount, monthly_cost) VALUES (?, ?, ?, ?, ?, ?)", liabilities)
        
        # Seed Transactions (Recent yields & payments)
        transactions = [
            (user_id, "Vanguard S&P 500 ETF Dividend", "asset_yield", encrypt_val(124.50), "2026-06-09"),
            (user_id, "Amazon FBA - Home Goods Store #1 Payout", "asset_yield", encrypt_val(3210.00), "2026-06-10"),
            (user_id, "Mortgage Auto-pay", "liability_payment", encrypt_val(-1450.00), "2026-06-15"),
            (user_id, "Tesla Lease Payment", "liability_payment", encrypt_val(-680.00), "2026-06-20"),
            (user_id, "Premium Insurance Plan", "liability_payment", encrypt_val(-210.00), "2026-06-24")
        ]
        cursor.executemany("INSERT INTO transactions (user_id, description, type, amount, date) VALUES (?, ?, ?, ?, ?)", transactions)
        
        conn.commit()
    conn.close()

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
            cursor.execute("INSERT INTO users (email, password) VALUES (?, '')", (user_id,))
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
        # return compatible dictionary format
        return {
            "name": d["email"].split("@")[0].capitalize() if "@" in d["email"] else d["email"],
            "email": d["email"],
            "premium_status": d["premium_status"],
            "stripe_customer_id": d["stripe_customer_id"],
            "currency": d["currency"] or "EUR",
            "first_name": d["first_name"] or "",
            "last_name": d["last_name"] or "",
            "custom_categories": d["custom_categories"] or ""
        }
    return None

def update_user_profile(user_id, first_name, last_name, custom_categories):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET first_name=?, last_name=?, custom_categories=? WHERE email=? OR id=?", (first_name, last_name, custom_categories, user_id, user_id))
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
        d["total_amount"] = decrypt_val(d["total_amount"])
        d["remaining_amount"] = decrypt_val(d["remaining_amount"])
        d["monthly_cost"] = decrypt_val(d["monthly_cost"])
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

def create_user(email, password):
    conn = get_db()
    cursor = conn.cursor()
    pwd_hash = hash_password(password)
    try:
        cursor.execute("INSERT INTO users (email, password) VALUES (?, ?)", (email.lower().strip(), pwd_hash))
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
    else:
        # Create Google user
        cursor.execute("INSERT INTO users (email, google_id, password) VALUES (?, ?, '')", (email_clean, google_id))
        conn.commit()
        conn.close()
        seed_user_data(email_clean)
        return email_clean

def get_user_by_stripe_customer_id(customer_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE stripe_customer_id=?", (customer_id,))
    user = cursor.fetchone()
    conn.close()
    return dict(user) if user else None

