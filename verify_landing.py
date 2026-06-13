import subprocess
import time
import requests
import sys
import os
import shutil

def run_tests():
    print("Starting Flask test server for landing page verification on port 5056...")
    # Clean up test databases/states if necessary, but we can just use the active DB
    server_process = subprocess.Popen(
        [sys.executable, "server.py"],
        env={**os.environ, "PORT": "5056"},
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    
    # Wait for server to boot up
    time.sleep(3.0)
    
    base_url = "http://127.0.0.1:5001"
    
    try:
        # 1. Verify founder count
        print("Testing GET /api/founder/count...")
        res = requests.get(f"{base_url}/api/founder/count")
        assert res.status_code == 200, "Founder count endpoint failed"
        data = res.json()
        assert data["success"] is True, "Founder count response unsuccessful"
        initial_count = data["count"]
        print(f"Initial founder spots remaining: {initial_count}")
        
        # 2. Verify purchase
        print("Testing POST /api/founder/purchase...")
        test_email = f"test_founder_{int(time.time())}@philiavault.com"
        purchase_payload = {
            "email": test_email,
            "name": "Jean Testeur",
            "source_id": "cnon:card-nonce-ok" # mock card nonce for sandbox
        }
        res = requests.post(f"{base_url}/api/founder/purchase", json=purchase_payload)
        assert res.status_code == 200, f"Purchase failed with status {res.status_code}: {res.text}"
        purchase_res = res.json()
        assert purchase_res["success"] is True, "Purchase response unsuccessful"
        print(f"Purchase successful! Payment ID: {purchase_res['payment_id']}")
        
        # 3. Verify decremented count
        print("Verifying updated spots remaining...")
        res = requests.get(f"{base_url}/api/founder/count")
        data = res.json()
        new_count = data["count"]
        print(f"New founder spots remaining: {new_count}")
        assert new_count == initial_count - 1, "Spot count did not decrement correctly"
        
        # 4. Verify waitlist submission
        print("Testing POST /api/founder/waitlist...")
        waitlist_payload = {
            "email": f"waitlist_{int(time.time())}@philiavault.com",
            "lang": "fr"
        }
        res = requests.post(f"{base_url}/api/founder/waitlist", json=waitlist_payload)
        assert res.status_code == 200, "Waitlist signup failed"
        waitlist_res = res.json()
        assert waitlist_res["success"] is True
        print(f"Waitlist message: {waitlist_res['message']}")
        
        # 5. Verify email file was written
        print("Verifying confirmation email logging...")
        email_dir = os.path.join(os.path.dirname(__file__), "emails")
        assert os.path.exists(email_dir), "Emails directory was not created"
        files = os.listdir(email_dir)
        matching_files = [f for f in files if test_email in f]
        assert len(matching_files) > 0, "No confirmation email file logged for founder"
        print(f"Found confirmation log file: {matching_files[0]}")
        
        print("\nAll Pre-launch Landing Page Integration Tests Passed Successfully! [x]")
        
    except Exception as e:
        print(f"Test failure: {e}")
        server_process.terminate()
        sys.exit(1)
        
    finally:
        print("Stopping Flask test server...")
        server_process.terminate()

if __name__ == "__main__":
    run_tests()
