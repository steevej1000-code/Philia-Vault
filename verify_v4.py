import requests
import sys
import os

def test_v4_features():
    base_url = "http://127.0.0.1:5001"
    
    # 1. Fetch current premium status to restore it at the end
    print("Checking current user profile...")
    res = requests.get(f"{base_url}/api/user")
    assert res.status_code == 200
    original_premium = res.json()["user"].get("premium_status", 0)
    print(f"Original premium status: {original_premium}")

    try:
        # A. Set to non-premium to test paywall translations
        print("\nSetting premium status to 0 to test paywall translations...")
        res = requests.post(f"{base_url}/api/user/premium", json={"premium_status": 0})
        assert res.status_code == 200
        
        print("Making non-premium request in French...")
        res_fr = requests.post(f"{base_url}/api/coach/chat", json={"lang": "fr", "message": "Bonjour"})
        assert res_fr.status_code == 200
        data_fr = res_fr.json()
        print("French reply:", data_fr.get("reply"))
        assert "⚠️ L'accès au Coach" in data_fr.get("reply")
        
        print("Making non-premium request in German...")
        res_de = requests.post(f"{base_url}/api/coach/chat", json={"lang": "de", "message": "Hallo"})
        assert res_de.status_code == 200
        data_de = res_de.json()
        print("German reply:", data_de.get("reply"))
        assert "⚠️ Der Zugriff" in data_de.get("reply")
        
        print("Making non-premium request in English...")
        res_en = requests.post(f"{base_url}/api/coach/chat", json={"lang": "en", "message": "Hello"})
        assert res_en.status_code == 200
        data_en = res_en.json()
        print("English reply:", data_en.get("reply"))
        assert "⚠️ Access to the" in data_en.get("reply")
        print("✓ Paywall messaging translates successfully for all languages.")
        
        # B. Set to premium to test localized system prompt and responses
        print("\nSetting premium status to 1 to test coach response language...")
        res = requests.post(f"{base_url}/api/user/premium", json={"premium_status": 1})
        assert res.status_code == 200
        
        print("Making premium request in German...")
        res_de_prem = requests.post(f"{base_url}/api/coach/chat", json={"lang": "de", "message": "Bonjour"})
        assert res_de_prem.status_code == 200
        reply_de = res_de_prem.json().get("reply")
        print("Premium German reply starts with:", reply_de[:120])
        # A simple check: since it uses offline mode fallback or Gemini, verify presence of typical German words
        # (like 'Ich', 'und', 'ist', 'der', 'die', 'das', 'Vermögenswerte', 'Konto')
        german_words = ["ich", "ist", "und", "der", "die", "das", "finanz", "konto", "wert"]
        has_german = any(w in reply_de.lower() for w in german_words)
        assert has_german, f"Response does not seem to be in German: {reply_de}"
        print("✓ Premium coach replies in the requested language.")

    finally:
        # Restore original premium status
        print(f"\nRestoring original premium status to {original_premium}...")
        requests.post(f"{base_url}/api/user/premium", json={"premium_status": original_premium})

    print("\n--- 2. Checking index.html static dictionary and element bindings ---")
    # Read index.html to verify i18n tags and select selector
    index_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "index.html")
    with open(index_path, "r", encoding="utf-8") as f:
        html = f.read()
    
    # Assert TRANSLATIONS has EN, FR, ES, PT, DE
    assert "fr: {" in html
    assert "en: {" in html
    assert "es: {" in html
    assert "pt: {" in html
    assert "de: {" in html
    print("✓ HTML translations dictionary confirmed for EN, FR, ES, PT, DE.")
    
    # Assert dynamic keys added to dictionary are present
    assert "no_data_available:" in html
    assert "monthly_yield_label:" in html
    assert "delete_btn_label:" in html
    assert "remaining_label:" in html
    assert "repaid_label:" in html
    assert "year_suffix:" in html
    assert "month_suffix:" in html
    assert "coach_legal_notice:" in html
    print("✓ Dynamic translations keys (including legal notice) present in dictionary.")

    # Assert language select exists
    assert 'id="lang-select"' in html
    assert 'onchange="changeLanguage(this.value)"' in html
    print("✓ Language dropdown selector exists in HTML.")
    
    # Assert navigator.language detection logic exists
    assert "navigator.language" in html
    print("✓ Auto-language browser detection logic exists in HTML.")
    
    print("\nAll v4 internationalization and translation tests passed successfully! [x]")

if __name__ == "__main__":
    try:
        test_v4_features()
    except Exception as e:
        print(f"\n❌ Test Failed: {e}")
        sys.exit(1)
