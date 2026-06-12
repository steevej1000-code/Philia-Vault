import sqlite3
import os
import base64
from cryptography.fernet import Fernet

DB_PATH = os.environ.get("DATABASE_PATH", os.path.join(os.path.dirname(__file__), "cashflow.db"))

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
    
    # Create assets table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        value REAL NOT NULL,
        monthly_yield REAL NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # Create liabilities table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS liabilities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        total_amount REAL NOT NULL,
        remaining_amount REAL NOT NULL,
        monthly_cost REAL NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # Create transactions table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        description TEXT NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        date TEXT NOT NULL
    )
    """)

    # Create users table for auth
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL
    )
    """)

    # Create user_profile table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS user_profile (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        premium_status INTEGER DEFAULT 0,
        premium_expires TEXT,
        subscriber_id TEXT,
        currency TEXT DEFAULT 'USD'
    )
    """)
    
    # Try to add currency column if table existed without it
    try:
        cursor.execute("ALTER TABLE user_profile ADD COLUMN currency TEXT DEFAULT 'USD'")
    except Exception:
        pass

    # Create savings_goals table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS savings_goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        target_amount TEXT NOT NULL,
        current_amount TEXT NOT NULL,
        target_date TEXT NOT NULL
    )
    """)

    # Check if we need to seed the database
    cursor.execute("SELECT COUNT(*) FROM assets")
    if cursor.fetchone()[0] == 0:
        # Seed Assets
        assets = [
            ("Stocks Portfolio", "Stocks", encrypt_val(42850.00), encrypt_val(840.12)),
            ("Crypto Staking", "Crypto", encrypt_val(12305.50), encrypt_val(312.45)),
            ("Shopify Store", "Commerce", encrypt_val(28400.00), encrypt_val(4250.00)),
            ("Rental Property", "Real Estate", encrypt_val(350000.00), encrypt_val(1800.00))
        ]
        cursor.executemany("INSERT INTO assets (name, type, value, monthly_yield) VALUES (?, ?, ?, ?)", assets)
        
        # Seed Liabilities
        liabilities = [
            ("Real Estate Mortgage", "Mortgage", encrypt_val(422000.00), encrypt_val(245000.00), encrypt_val(1450.00)),
            ("Tesla Model Y Lease", "Loan", encrypt_val(56000.00), encrypt_val(12400.00), encrypt_val(680.00)),
            ("Business Expansion Loan", "Loan", encrypt_val(56000.00), encrypt_val(4500.00), encrypt_val(210.00)),
            ("Netflix Premium", "Subscription", encrypt_val(215.00), encrypt_val(215.00), encrypt_val(17.92)),
            ("Spotify Family", "Subscription", encrypt_val(119.00), encrypt_val(119.00), encrypt_val(9.92)),
            ("Klarna Shopping BNPL", "Subscription", encrypt_val(840.00), encrypt_val(840.00), encrypt_val(70.00)),
            ("Adobe CC Portfolio", "Subscription", encrypt_val(635.00), encrypt_val(635.00), encrypt_val(52.92))
        ]
        cursor.executemany("INSERT INTO liabilities (name, type, total_amount, remaining_amount, monthly_cost) VALUES (?, ?, ?, ?, ?)", liabilities)
        
        # Seed Transactions (Recent yields & payments)
        transactions = [
            ("Vanguard S&P 500 ETF Dividend", "asset_yield", encrypt_val(124.50), "2026-06-09"),
            ("Amazon FBA - Home Goods Store #1 Payout", "asset_yield", encrypt_val(3210.00), "2026-06-10"),
            ("Mortgage Auto-pay", "liability_payment", encrypt_val(-1450.00), "2026-06-15"),
            ("Tesla Lease Payment", "liability_payment", encrypt_val(-680.00), "2026-06-20"),
            ("Premium Insurance Plan", "liability_payment", encrypt_val(-210.00), "2026-06-24")
        ]
        cursor.executemany("INSERT INTO transactions (description, type, amount, date) VALUES (?, ?, ?, ?)", transactions)
        
        # Seed User Profile
        cursor.execute("INSERT INTO user_profile (name, premium_status) VALUES ('Alex', 0)")
        
        conn.commit()
    
    # Ensure there is at least one profile even if seeded before IAP change
    cursor.execute("SELECT COUNT(*) FROM user_profile")
    if cursor.fetchone()[0] == 0:
        cursor.execute("INSERT INTO user_profile (name, premium_status) VALUES ('Alex', 0)")
        conn.commit()
        
    conn.close()

# User Profile Helpers
def get_user_profile():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM user_profile LIMIT 1")
    row = cursor.fetchone()
    conn.close()
    if row:
        d = dict(row)
        if "currency" not in d or d["currency"] is None:
            d["currency"] = "USD"
        return d
    return {"name": "Alex", "premium_status": 0, "subscriber_id": None, "currency": "USD"}

def set_premium_status(status, subscriber_id=None):
    conn = get_db()
    cursor = conn.cursor()
    if subscriber_id:
        cursor.execute("UPDATE user_profile SET premium_status=?, subscriber_id=? WHERE id=1", (int(status), subscriber_id))
    else:
        cursor.execute("UPDATE user_profile SET premium_status=? WHERE id=1", (int(status),))
    conn.commit()
    conn.close()

def update_user_currency(currency):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE user_profile SET currency=? WHERE id=1", (currency,))
    conn.commit()
    conn.close()

# Savings Goals Helpers
def get_savings_goals():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM savings_goals ORDER BY id DESC")
    rows = []
    for r in cursor.fetchall():
        d = dict(r)
        d["target_amount"] = decrypt_val(d["target_amount"])
        d["current_amount"] = decrypt_val(d["current_amount"])
        rows.append(d)
    conn.close()
    return rows

def add_savings_goal(name, target_amount, current_amount, target_date):
    conn = get_db()
    cursor = conn.cursor()
    enc_target = encrypt_val(target_amount)
    enc_current = encrypt_val(current_amount)
    cursor.execute("INSERT INTO savings_goals (name, target_amount, current_amount, target_date) VALUES (?, ?, ?, ?)",
                   (name, enc_target, enc_current, target_date))
    conn.commit()
    conn.close()

def update_savings_goal(goal_id, name, target_amount, current_amount, target_date):
    conn = get_db()
    cursor = conn.cursor()
    enc_target = encrypt_val(target_amount)
    enc_current = encrypt_val(current_amount)
    cursor.execute("UPDATE savings_goals SET name=?, target_amount=?, current_amount=?, target_date=? WHERE id=?",
                   (name, enc_target, enc_current, target_date, goal_id))
    conn.commit()
    conn.close()

def delete_savings_goal(goal_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM savings_goals WHERE id=?", (goal_id,))
    conn.commit()
    conn.close()

# Assets CRUD Helpers
def get_assets():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM assets ORDER BY id DESC")
    rows = []
    for r in cursor.fetchall():
        d = dict(r)
        d["value"] = decrypt_val(d["value"])
        d["monthly_yield"] = decrypt_val(d["monthly_yield"])
        rows.append(d)
    conn.close()
    return rows

def add_asset(name, type_, value, monthly_yield):
    conn = get_db()
    cursor = conn.cursor()
    enc_value = encrypt_val(value)
    enc_yield = encrypt_val(monthly_yield)
    cursor.execute("INSERT INTO assets (name, type, value, monthly_yield) VALUES (?, ?, ?, ?)", (name, type_, enc_value, enc_yield))
    conn.commit()
    conn.close()

def update_asset(asset_id, name, type_, value, monthly_yield):
    conn = get_db()
    cursor = conn.cursor()
    enc_value = encrypt_val(value)
    enc_yield = encrypt_val(monthly_yield)
    cursor.execute("UPDATE assets SET name=?, type=?, value=?, monthly_yield=? WHERE id=?", (name, type_, enc_value, enc_yield, asset_id))
    conn.commit()
    conn.close()

def delete_asset(asset_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM assets WHERE id=?", (asset_id,))
    conn.commit()
    conn.close()

# Liabilities CRUD Helpers
def get_liabilities():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM liabilities ORDER BY id DESC")
    rows = []
    for r in cursor.fetchall():
        d = dict(r)
        d["total_amount"] = decrypt_val(d["total_amount"])
        d["remaining_amount"] = decrypt_val(d["remaining_amount"])
        d["monthly_cost"] = decrypt_val(d["monthly_cost"])
        rows.append(d)
    conn.close()
    return rows

def add_liability(name, type_, total_amount, remaining_amount, monthly_cost):
    conn = get_db()
    cursor = conn.cursor()
    enc_total = encrypt_val(total_amount)
    enc_rem = encrypt_val(remaining_amount)
    enc_cost = encrypt_val(monthly_cost)
    cursor.execute("INSERT INTO liabilities (name, type, total_amount, remaining_amount, monthly_cost) VALUES (?, ?, ?, ?, ?)",
                   (name, type_, enc_total, enc_rem, enc_cost))
    conn.commit()
    conn.close()

def update_liability(lib_id, name, type_, total_amount, remaining_amount, monthly_cost):
    conn = get_db()
    cursor = conn.cursor()
    enc_total = encrypt_val(total_amount)
    enc_rem = encrypt_val(remaining_amount)
    enc_cost = encrypt_val(monthly_cost)
    cursor.execute("UPDATE liabilities SET name=?, type=?, total_amount=?, remaining_amount=?, monthly_cost=? WHERE id=?",
                   (name, type_, enc_total, enc_rem, enc_cost, lib_id))
    conn.commit()
    conn.close()

def delete_liability(lib_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM liabilities WHERE id=?", (lib_id,))
    conn.commit()
    conn.close()

# Transactions Helpers
def get_transactions():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM transactions ORDER BY date DESC, id DESC")
    rows = []
    for r in cursor.fetchall():
        d = dict(r)
        d["amount"] = decrypt_val(d["amount"])
        rows.append(d)
    conn.close()
    return rows

def add_transaction(description, type_, amount, date):
    conn = get_db()
    cursor = conn.cursor()
    enc_amount = encrypt_val(amount)
    cursor.execute("INSERT INTO transactions (description, type, amount, date) VALUES (?, ?, ?, ?)", (description, type_, enc_amount, date))
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
    return success

def verify_user(email, password):
    conn = get_db()
    cursor = conn.cursor()
    pwd_hash = hash_password(password)
    cursor.execute("SELECT * FROM users WHERE email=? AND password=?", (email.lower().strip(), pwd_hash))
    user = cursor.fetchone()
    conn.close()
    return dict(user) if user else None
