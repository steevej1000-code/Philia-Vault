import subprocess
import time
import requests
import sys

def run_tests():
    print("Starting Flask test server on port 5055...")
    server_process = subprocess.Popen(
        [sys.executable, "server.py"],
        env={"PORT": "5055"},
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    
    # Wait for server to start
    time.sleep(2.5)
    
    base_url = "http://127.0.0.1:5001" # Defaults to 5001 in server.py
    
    try:
        # 1. Test Summary
        print("Testing GET /api/summary...")
        res = requests.get(f"{base_url}/api/summary")
        assert res.status_code == 200, "Summary failed"
        data = res.json()
        assert data["success"] is True
        print(f"Summary loaded. Active Index Score: {data['iif_score']}%")
        
        # 2. Test Shopify Webhook
        print("Testing POST /api/webhooks/shopify...")
        webhook_payload = {
            "store_name": "TestStore Elite",
            "monthly_profit": 5500.0,
            "value": 45000.0
        }
        res = requests.post(f"{base_url}/api/webhooks/shopify", json=webhook_payload)
        assert res.status_code == 200, "Shopify Webhook failed"
        webhook_res = res.json()
        assert webhook_res["success"] is True
        print(f"Webhook response: {webhook_res['message']}")
        
        # 3. Test summary updates
        print("Verifying summary updates...")
        res = requests.get(f"{base_url}/api/summary")
        data = res.json()
        assert data["success"] is True
        # E-commerce store value should be in list
        print(f"New Net Cashflow: {data['net_cashflow']}")
        
        # 4. Test Coach Chat response
        print("Testing POST /api/coach/chat...")
        chat_payload = {
            "message": "Fais un audit rapide de mon cashflow",
            "history": []
        }
        res = requests.post(f"{base_url}/api/coach/chat", json=chat_payload)
        assert res.status_code == 200, "Coach chat failed"
        chat_res = res.json()
        assert chat_res["success"] is True
        print(f"Coach reply: {chat_res['reply'][:150]}...")
        
        print("\nAll integration tests passed successfully! [x]")
        
    except Exception as e:
        print(f"Test failure: {e}")
        server_process.terminate()
        sys.exit(1)
        
    finally:
        print("Stopping Flask test server...")
        server_process.terminate()

if __name__ == "__main__":
    run_tests()
