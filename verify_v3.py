import requests
import sqlite3
import sys
import os

# Import database module to check encryption
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import database
from server import generate_jwt

TEST_USER_EMAIL = "alex@philiavault.com"

def test_v3_features():
    base_url = "http://127.0.0.1:5001"
    headers = {"Authorization": f"Bearer {generate_jwt(TEST_USER_EMAIL)}"}

    print("--- 1. Testing Savings Goals (DB and API) ---")
    # A. Test direct database CRUD for savings goals (chiffrement transparent)
    print("Testing direct DB insert for savings goal...")
    database.add_savings_goal(TEST_USER_EMAIL, "Apport Immobilier", 50000.0, 12000.0, "Dec 2026")
    
    # Check directly inside the sqlite3 DB to verify values are stored ENCRYPTED (text starting with gAAAAA)
    conn = sqlite3.connect(database.DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT target_amount, current_amount FROM savings_goals LIMIT 1")
    row = cursor.fetchone()
    conn.close()
    
    tgt, curr = row[0], row[1]
    print(f"Direct SQL row check - target_amount: '{tgt}', current_amount: '{curr}'")
    assert tgt.startswith("gAAAAA"), "Target amount is not encrypted in the DB!"
    assert curr.startswith("gAAAAA"), "Current amount is not encrypted in the DB!"
    print("✓ Confirmed: Savings goals values are encrypted in SQLite.")
    
    # B. Test python retrieval and decryption
    goals = database.get_savings_goals(TEST_USER_EMAIL)
    assert len(goals) > 0
    goal = goals[0]
    print(f"Decrypted Python API - target: {goal['target_amount']}, current: {goal['current_amount']}")
    assert goal["target_amount"] == 50000.0
    assert goal["current_amount"] == 12000.0
    print("✓ Confirmed: Savings goals helpers decrypt data correctly.")
    
    # C. Test GET /api/savings_goals
    print("Testing GET /api/savings_goals API endpoint...")
    res = requests.get(f"{base_url}/api/savings_goals", headers=headers)
    assert res.status_code == 200
    goals_api = res.json()["savings_goals"]
    assert len(goals_api) > 0
    print(f"API confirmed: retrieved {len(goals_api)} savings goal(s).")
    
    print("\n--- 2. Testing Currency Settings ---")
    # A. Test initial user currency (should be EUR, the schema default)
    print("Testing initial user profile settings...")
    res = requests.get(f"{base_url}/api/user", headers=headers)
    assert res.status_code == 200
    profile = res.json()["user"]
    print(f"Current currency setting: {profile.get('currency')} (Expected: EUR)")
    assert profile.get("currency") == "EUR"

    # B. Update currency via API
    print("Updating user settings currency to USD...")
    res = requests.post(f"{base_url}/api/user/settings", json={"currency": "USD"}, headers=headers)
    assert res.status_code == 200
    assert res.json()["success"] is True

    # C. Verify change is persisted
    res = requests.get(f"{base_url}/api/user", headers=headers)
    profile = res.json()["user"]
    print(f"New currency setting: {profile.get('currency')} (Expected: USD)")
    assert profile.get("currency") == "USD"
    print("✓ Confirmed: Currency updates persisted correctly in database.")
    
    print("\nAll v3 savings goals and multi-currency tests passed! [x]")

if __name__ == "__main__":
    try:
        test_v3_features()
    except Exception as e:
        print(f"\n❌ Test Failed: {e}")
        sys.exit(1)
