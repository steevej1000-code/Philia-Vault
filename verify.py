import subprocess
import time
import requests
import sys

from server import generate_jwt

TEST_USER_EMAIL = "alex@philiavault.com"


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

    # All private routes require a signed JWT since the X-User-Email migration.
    headers = {"Authorization": f"Bearer {generate_jwt(TEST_USER_EMAIL)}"}

    try:
        # 1. Test Summary
        print("Testing GET /api/summary...")
        res = requests.get(f"{base_url}/api/summary", headers=headers)
        assert res.status_code == 200, "Summary failed"
        data = res.json()
        assert data["success"] is True
        print(f"Summary loaded. Active Index Score: {data['iif_score']}%")

        # 2. Test asset creation (replaces the removed Shopify/TikTok webhooks)
        print("Testing POST /api/assets...")
        asset_payload = {
            "name": "Test Asset Elite",
            "type": "Commerce",
            "value": 45000.0,
            "monthly_yield": 5500.0
        }
        res = requests.post(f"{base_url}/api/assets", json=asset_payload, headers=headers)
        assert res.status_code == 200, "Asset creation failed"
        asset_res = res.json()
        assert asset_res["success"] is True
        print(f"Asset response: {asset_res['message']}")

        # 3. Test summary updates
        print("Verifying summary updates...")
        res = requests.get(f"{base_url}/api/summary", headers=headers)
        data = res.json()
        assert data["success"] is True
        print(f"New Net Cashflow: {data['net_cashflow']}")

        # 4. Test Coach Chat response
        print("Testing POST /api/coach/chat...")
        chat_payload = {
            "message": "Fais un audit rapide de mon cashflow",
            "history": []
        }
        res = requests.post(f"{base_url}/api/coach/chat", json=chat_payload, headers=headers)
        assert res.status_code == 200, "Coach chat failed"
        chat_res = res.json()
        assert chat_res["success"] is True
        print(f"Coach reply: {chat_res['reply'][:150]}...")

        # 5. Test that protected routes reject requests with no token
        print("Testing GET /api/summary without a token (expect 401)...")
        res = requests.get(f"{base_url}/api/summary")
        assert res.status_code == 401, "Unauthenticated request should be rejected"
        print("Unauthenticated request correctly rejected.")

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
