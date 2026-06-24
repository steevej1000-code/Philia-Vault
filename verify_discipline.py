import subprocess
import time
import requests
import sys
import datetime

def run_tests():
    # Setup test environment via database imports
    import database
    database.init_db()
    
    test_email = "alex@philiavault.com"
    
    # 1. Clean existing records for a clean test run
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM daily_discipline WHERE user_id = (SELECT id FROM users WHERE email = ?)", (test_email,))
    conn.commit()
    conn.close()

    # Configure user details
    database.set_premium_status(test_email, 1)
    database.update_user_income(test_email, 3000.0) # $3000 / month income
    
    # Clean liabilities and add a standard one to set vital cost
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM liabilities WHERE user_id = (SELECT id FROM users WHERE email = ?)", (test_email,))
    cursor.execute("DELETE FROM assets WHERE user_id = (SELECT id FROM users WHERE email = ?)", (test_email,))
    conn.commit()
    conn.close()
    profile = database.get_user_profile(test_email)
    user_id = profile["id"]

    # Add a liability of $1200/month cost -> vital cost is $40/day
    database.add_liability(user_id, "Rent", "Subscription", 0.0, 0.0, 1200.0)
    
    # Available Cashflow = 3000 - 1200 = 1800
    # Daily Budget = 1800 / 30 = 60.0
    # Daily Vital Cost = 1200 / 30 = 40.0
    
    # 2. Test DB Helpers
    print("Testing database helper functions...")
    
    today_str = datetime.date.today().isoformat()
    yesterday_str = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
    two_days_ago_str = (datetime.date.today() - datetime.timedelta(days=2)).isoformat()
    
    # Save a success day today
    # budget (60) - spent (20) = 40. 40 / vital (40) = 1.0 freedom day
    success = database.save_discipline_entry(user_id, today_str, 'success', 20.0, 1.0)
    assert success is True, "save_discipline_entry failed"
    
    # Save a success day yesterday
    success = database.save_discipline_entry(user_id, yesterday_str, 'success', 0.0, 1.5)
    assert success is True
    
    # Save a failed day 2 days ago
    success = database.save_discipline_entry(user_id, two_days_ago_str, 'failed', 100.0, 0.0)
    assert success is True
    
    # Check history
    history = database.get_discipline_history(user_id, two_days_ago_str, today_str)
    assert len(history) == 3, f"Expected 3 history items, got {len(history)}"
    
    # Check streak (consecutive successes ending today or yesterday)
    # Today and Yesterday are successes, so streak should be 2
    streak = database.get_discipline_streak(user_id)
    assert streak == 2, f"Expected streak of 2, got {streak}"
    print(f"Database helpers passed. Current Streak: {streak}")
    
    # 3. Test API Endpoints
    print("Starting Flask test server...")
    server_process = subprocess.Popen(
        [sys.executable, "server.py"],
        env={"PORT": "5055"},
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    
    # Wait for server to start
    time.sleep(2.0)
    
    base_url = "http://127.0.0.1:5001" # Defaults to 5001 in server.py
    headers = {"X-User-Email": test_email}
    
    try:
        # Test GET /api/discipline/history
        print("Testing GET /api/discipline/history...")
        res = requests.get(f"{base_url}/api/discipline/history", headers=headers)
        assert res.status_code == 200, "History route failed"
        data = res.json()
        assert data["success"] is True
        assert data["streak"] == 2
        assert data["total_freedom_days"] == 2.5 # 1.0 (today) + 1.5 (yesterday)
        print(f"History endpoint returned streak={data['streak']} and total_freedom_days={data['total_freedom_days']}")
        
        # Test POST /api/discipline/log (Success spent)
        # Category 1: Necessary
        print("Testing POST /api/discipline/log (Spent <= budget, Category 1)...")
        log_payload = {
            "amount_spent": 40.0,
            "category_id": 1,
            "date": today_str
        }
        res = requests.post(f"{base_url}/api/discipline/log", json=log_payload, headers=headers)
        assert res.status_code == 200, f"Log route failed: {res.text}"
        log_data = res.json()
        assert log_data["success"] is True
        assert log_data["status"] == "success"
        print(f"Logged category 1 successfully. New daily budget limit: {log_data['daily_budget']}")
        
        # Verify database available_cashflow update
        conn = database.get_db()
        row = conn.execute("SELECT available_cashflow, total_hemorrhage FROM users WHERE id = ?", (user_id,)).fetchone()
        cashflow_after_cat1 = row["available_cashflow"]
        hemorrhage_after_cat1 = row["total_hemorrhage"]
        conn.close()
        
        # Test POST /api/discipline/log (Hemorrhage spend)
        # Category 2: Hemorragie (should increment total_hemorrhage)
        print("Testing POST /api/discipline/log (Spent <= budget, Category 2)...")
        log_payload = {
            "amount_spent": 10.0,
            "category_id": 2,
            "date": today_str
        }
        res = requests.post(f"{base_url}/api/discipline/log", json=log_payload, headers=headers)
        assert res.status_code == 200, f"Log route failed: {res.text}"
        log_data = res.json()
        assert log_data["success"] is True
        
        # Verify hemorrhage incremented and balance decremented
        conn = database.get_db()
        row = conn.execute("SELECT available_cashflow, total_hemorrhage FROM users WHERE id = ?", (user_id,)).fetchone()
        cashflow_after_cat2 = row["available_cashflow"]
        hemorrhage_after_cat2 = row["total_hemorrhage"]
        conn.close()
        
        assert hemorrhage_after_cat2 == hemorrhage_after_cat1 + 1, "total_hemorrhage was not incremented"
        assert abs(cashflow_after_cat2 - (cashflow_after_cat1 - 10.0)) < 0.01, "available_cashflow was not decremented correctly"
        print("Hemorrhage detection and balance decrement verification passed.")
        
        print("\nAll Discipline Integration Tests passed successfully! [x]")
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        server_process.terminate()
        sys.exit(1)
        
    finally:
        print("Stopping Flask test server...")
        server_process.terminate()

if __name__ == "__main__":
    run_tests()
