import subprocess
import json
import sqlite3
import os
import sys

# Import database module to test Python CRUD
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import database

TEST_USER_EMAIL = "alex@philiavault.com"

def test_db_encryption():
    print("--- 1. Testing DB Column Encryption ---")

    # Initialize DB and seed a known asset for the test user
    database.init_db()
    database.add_asset(TEST_USER_EMAIL, "Test Asset V2", "Commerce", 10000.0, 800.0)

    # Check directly inside the sqlite3 DB to verify values are stored ENCRYPTED (text starting with gAAAAA)
    conn = sqlite3.connect(database.DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT value, monthly_yield FROM assets WHERE user_id = ? LIMIT 1", (TEST_USER_EMAIL,))
    row = cursor.fetchone()
    conn.close()

    val, yld = row[0], row[1]
    print(f"Direct SQL row check - raw value: '{val}', raw monthly_yield: '{yld}'")

    # Ensure they are strings and look like Fernet ciphertexts
    assert isinstance(val, str), "Database value is not a string!"
    assert val.startswith("gAAAAA"), "Database value is not encrypted!"
    assert yld.startswith("gAAAAA"), "Database monthly_yield is not encrypted!"
    print("✓ Confirmed: Raw DB values are stored as Fernet-encrypted strings.")

    # Verify that python helper automatically decrypts them to float
    assets = database.get_assets(TEST_USER_EMAIL)
    assert len(assets) > 0, "No assets found!"
    first_asset = assets[0]
    print(f"Decrypted Python API - value: {first_asset['value']} (type {type(first_asset['value'])}), yield: {first_asset['monthly_yield']}")
    assert isinstance(first_asset['value'], float), "Decrypted value is not a float!"
    print("✓ Confirmed: CRUD helpers transparently decrypt strings to floats.")

def test_mcp_server():
    print("\n--- 2. Testing MCP Server JSON-RPC Stdio Interface ---")
    
    # Start MCP server subprocess
    p = subprocess.Popen(
        [sys.executable, "mcp_server.py"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    
    try:
        # Step A: Send initialize request
        init_req = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "capabilities": {},
                "clientInfo": {"name": "test-client", "version": "1.0"},
                "protocolVersion": "2024-11-05"
            }
        }
        print("Sending initialize request...")
        p.stdin.write(json.dumps(init_req) + "\n")
        p.stdin.flush()
        
        response_line = p.stdout.readline()
        init_res = json.loads(response_line)
        print("Received response:", json.dumps(init_res, indent=2))
        assert init_res["id"] == 1
        assert "capabilities" in init_res["result"]
        assert init_res["result"]["serverInfo"]["name"] == "philia-vault-mcp"
        print("✓ Confirmed: MCP server initialized successfully.")
        
        # Step B: Send tools/list request
        list_req = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list"
        }
        print("Sending tools/list request...")
        p.stdin.write(json.dumps(list_req) + "\n")
        p.stdin.flush()
        
        response_line = p.stdout.readline()
        list_res = json.loads(response_line)
        print("Received tools/list response:", json.dumps(list_res, indent=2))
        assert list_res["id"] == 2
        tools = list_res["result"]["tools"]
        tool_names = [t["name"] for t in tools]
        assert "get_financial_summary" in tool_names
        assert "simulate_purchase" in tool_names
        assert "sync_webhook_data" in tool_names
        print("✓ Confirmed: MCP server tools declared correctly.")
        
        # Step C: Call get_financial_summary
        call_req = {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {
                "name": "get_financial_summary",
                "arguments": {}
            }
        }
        print("Calling get_financial_summary tool...")
        p.stdin.write(json.dumps(call_req) + "\n")
        p.stdin.flush()
        
        response_line = p.stdout.readline()
        call_res = json.loads(response_line)
        print("Received tool call response:", json.dumps(call_res, indent=2))
        assert call_res["id"] == 3
        text_content = call_res["result"]["content"][0]["text"]
        summary = json.loads(text_content)
        assert "iif_score" in summary
        assert "total_assets" in summary
        print(f"✓ Confirmed: get_financial_summary returned: IIF={summary['iif_score']}%, Assets={summary['total_assets']}")
        
    finally:
        p.terminate()
        p.wait()

if __name__ == "__main__":
    try:
        # First, ensure clean DB for test or test existing
        test_db_encryption()
        test_mcp_server()
        print("\nAll v2 security and MCP server checks passed! [x]")
    except Exception as e:
        print(f"\n❌ Test Failed: {e}")
        sys.exit(1)
