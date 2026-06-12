import requests
import sys

def test_iap_flow():
    base_url = "http://127.0.0.1:5001"
    
    try:
        # 1. Check initial user status (should be Free / 0)
        print("Testing initial user profile status...")
        res = requests.get(f"{base_url}/api/user")
        assert res.status_code == 200
        user = res.json()["user"]
        print(f"Current status: {user['premium_status']} (Expected: 0)")
        assert user["premium_status"] == 0, "User should start as free"
        
        # 2. Test chat blocking (should fail/require premium)
        print("Testing chat blocking for free user...")
        res = requests.post(f"{base_url}/api/coach/chat", json={"message": "Audit financier"})
        assert res.status_code == 200
        chat_data = res.json()
        assert chat_data["success"] is False
        assert chat_data["premium_required"] is True
        print("Premium blocker verified successfully.")
        
        # 3. Simulate RevenueCat Purchase Webhook
        print("Simulating RevenueCat INITIAL_PURCHASE webhook...")
        payload = {
            "event": {
                "type": "INITIAL_PURCHASE",
                "app_user_id": "test_alex_user"
            }
        }
        res = requests.post(f"{base_url}/api/webhooks/revenuecat", json=payload)
        assert res.status_code == 200
        assert res.json()["success"] is True
        
        # 4. Re-verify user is Premium
        print("Checking user profile status after webhook...")
        res = requests.get(f"{base_url}/api/user")
        user = res.json()["user"]
        print(f"Current status: {user['premium_status']} (Expected: 1)")
        assert user["premium_status"] == 1, "User should be premium"
        
        # 5. Test chat now unlocks
        print("Testing chat access for premium user...")
        res = requests.post(f"{base_url}/api/coach/chat", json={"message": "audit"})
        assert res.status_code == 200
        chat_data = res.json()
        assert chat_data["success"] is True
        print(f"Chat unlocked. Reply snippet: {chat_data['reply'][:100]}...")
        
        # 6. Simulate RevenueCat Expiration
        print("Simulating RevenueCat EXPIRATION webhook...")
        payload = {
            "event": {
                "type": "EXPIRATION",
                "app_user_id": "test_alex_user"
            }
        }
        res = requests.post(f"{base_url}/api/webhooks/revenuecat", json=payload)
        assert res.status_code == 200
        assert res.json()["success"] is True
        
        # 7. Check user status is back to Free
        print("Re-checking user profile status after expiration...")
        res = requests.get(f"{base_url}/api/user")
        user = res.json()["user"]
        print(f"Current status: {user['premium_status']} (Expected: 0)")
        assert user["premium_status"] == 0, "User should be back to free"
        
        print("\nAll In-App Purchase and RevenueCat integration tests passed successfully! [x]")
        
    except Exception as e:
        print(f"Test failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    test_iap_flow()
