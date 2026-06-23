import requests
import sys

def test_auth():
    base_url = "http://127.0.0.1:5001"
    email = "testuser@philia.com"
    password = "securepassword123"
    
    try:
        # 1. Test registering a user
        print("Testing POST /api/auth/register...")
        res = requests.post(f"{base_url}/api/auth/register", json={"email": email, "password": password})
        if res.status_code == 400 and "déjà utilisé" in res.json().get("error", ""):
            print("User already registered, proceeding to login test.")
        else:
            assert res.status_code == 200
            assert res.json()["success"] is True
            print("Registration success.")
        
        # 2. Test logging in
        print("Testing POST /api/auth/login...")
        res = requests.post(f"{base_url}/api/auth/login", json={"email": email, "password": password})
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["user"]["email"] == email
        token = data.get("token")
        assert token, "Login response must include a JWT"
        print(f"Login success! Message: {data['message']}")

        # 3. Test logging in with wrong password
        print("Testing login with incorrect credentials...")
        res = requests.post(f"{base_url}/api/auth/login", json={"email": email, "password": "wrongpassword"})
        assert res.status_code == 401
        assert res.json()["success"] is False
        print("Auth blocks incorrect credentials successfully.")

        # 4. Test that the issued JWT actually unlocks a private route
        print("Testing GET /api/user with Authorization: Bearer <token>...")
        res = requests.get(f"{base_url}/api/user", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200, "Token should grant access to a private route"
        assert res.json()["success"] is True
        print("JWT correctly authorizes a private route.")

        # 5. Test that the same route rejects requests with no token
        print("Testing GET /api/user without a token (expect 401)...")
        res = requests.get(f"{base_url}/api/user")
        assert res.status_code == 401, "Private route must reject requests with no JWT"
        print("Private route correctly rejects unauthenticated requests.")

        print("\nAll User Authentication integration tests passed successfully! [x]")
        
    except Exception as e:
        print(f"Test failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    test_auth()
