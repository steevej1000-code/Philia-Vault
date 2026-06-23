import sys
import json
import os

# Adjust path to import database
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import database

DEFAULT_USER_EMAIL = "alex@philiavault.com"

def calculate_corrected_fi_indices(active_cashflow_m, fixed_expenses_m):
    # Sécurité anti-division par zéro si les dépenses sont nulles
    if fixed_expenses_m == 0:
        return 0, 0, 0 # Indice 0%, Timeline 0, Gain 0

    # Nouvelle Formule de l'Indice FI Standardisé
    # (Revenus - Dépenses) / |Dépenses|
    normalized_index = (active_cashflow_m - fixed_expenses_m) / abs(fixed_expenses_m)

    # Convertir en pourcentage (e.g., -1.0 -> -100%)
    indice_percent = round(normalized_index * 100, 2)

    # Appliquer le plancher logique de l'utilisateur : L'indice ne peut pas descendre en dessous de -100%
    if indice_percent <= -100:
        indice_percent = -100

    # ----------------------------------------------------
    # CORRECTION DE LA LOGIQUE TIMELINE
    # ----------------------------------------------------
    if indice_percent <= 0:
        timeline_years = 0 # Timeline fixé à 0 tant que le flux n'est pas inversé
    else:
        # L'ancienne logique de projection (à adapter selon votre méthode préférée)
        # e.g., timeline = (Dépenses / Gains) -> exemple simplifié
        timeline_years = round(fixed_expenses_m / (active_cashflow_m - fixed_expenses_m), 1)

    return indice_percent, timeline_years, active_cashflow_m

def get_financial_summary():
    try:
        assets = database.get_assets(DEFAULT_USER_EMAIL)
        liabilities = database.get_liabilities(DEFAULT_USER_EMAIL)
        
        total_assets_val = sum(a["value"] for a in assets)
        total_passive_income = sum(a["monthly_yield"] for a in assets)
        
        total_liabilities_val = sum(l["remaining_amount"] for l in liabilities)
        total_monthly_cost = sum(l["monthly_cost"] for l in liabilities)
        
        iif_score, timeline_years, _ = calculate_corrected_fi_indices(total_passive_income, total_monthly_cost)
            
        net_cashflow = total_passive_income - total_monthly_cost
        
        summary = {
            "total_assets": total_assets_val,
            "total_passive_income": total_passive_income,
            "total_liabilities": total_liabilities_val,
            "total_monthly_cost": total_monthly_cost,
            "iif_score": iif_score,
            "timeline": timeline_years,
            "net_cashflow": net_cashflow,
            "assets_count": len(assets),
            "liabilities_count": len(liabilities)
        }
        return {"content": [{"type": "text", "text": json.dumps(summary, indent=2)}]}
    except Exception as e:
        return {"content": [{"type": "text", "text": f"Error: {str(e)}"}], "isError": True}

def simulate_purchase(cost=0.0, yield_amount=0.0):
    try:
        assets = database.get_assets(DEFAULT_USER_EMAIL)
        liabilities = database.get_liabilities(DEFAULT_USER_EMAIL)
        
        total_passive_income = sum(a["monthly_yield"] for a in assets) + float(yield_amount)
        total_monthly_cost = sum(l["monthly_cost"] for l in liabilities) + float(cost)
        
        iif_score, timeline_years, _ = calculate_corrected_fi_indices(total_passive_income, total_monthly_cost)
            
        net_cashflow = total_passive_income - total_monthly_cost
        
        result = {
            "simulated_monthly_cost": float(cost),
            "simulated_monthly_yield": float(yield_amount),
            "new_iif_score": iif_score,
            "new_timeline": timeline_years,
            "new_net_cashflow": net_cashflow
        }
        return {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}
    except Exception as e:
        return {"content": [{"type": "text", "text": f"Error: {str(e)}"}], "isError": True}

def sync_webhook_data(source, store_name, monthly_profit, value):
    try:
        # Simulate Shopify or TikTok webhook sync
        source = str(source).lower().strip()
        if source not in ["shopify", "tiktok"]:
            return {"content": [{"type": "text", "text": "Error: Source must be shopify or tiktok"}], "isError": True}
        
        # Check if store already exists
        assets = database.get_assets(DEFAULT_USER_EMAIL)
        store_asset = None
        for a in assets:
            if a["type"] == "Commerce" and store_name in a["name"]:
                store_asset = a
                break
                
        if store_asset:
            database.update_asset(store_asset["id"], store_asset["name"], "Commerce", float(value), float(monthly_profit))
            action = "updated"
        else:
            database.add_asset(DEFAULT_USER_EMAIL, f"{source.capitalize()} Store - {store_name}", "Commerce", float(value), float(monthly_profit))
            action = "created"
            
        database.add_transaction(f"MCP Webhook Sync ({source}): {store_name}", "asset_yield", float(monthly_profit), "Today")
        
        result = {
            "success": True,
            "action": action,
            "store_name": store_name,
            "monthly_profit": float(monthly_profit),
            "value": float(value)
        }
        return {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}
    except Exception as e:
        return {"content": [{"type": "text", "text": f"Error: {str(e)}"}], "isError": True}

def main():
    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break
            
            req = json.loads(line)
            method = req.get("method")
            req_id = req.get("id")
            
            if method == "initialize":
                res = {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": {
                        "capabilities": {
                            "tools": {}
                        },
                        "serverInfo": {
                            "name": "philia-vault-mcp",
                            "version": "1.0.0"
                        },
                        "protocolVersion": "2024-11-05"
                    }
                }
                sys.stdout.write(json.dumps(res) + "\n")
                sys.stdout.flush()
                
            elif method == "notifications/initialized":
                # Notifications don't get a response
                continue
                
            elif method == "tools/list":
                res = {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": {
                        "tools": [
                            {
                                "name": "get_financial_summary",
                                "description": "Get summary of all assets, liabilities, and Independence Index (IIF)",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {}
                                }
                            },
                            {
                                "name": "simulate_purchase",
                                "description": "Simulate the impact of a purchase (asset yield or liability cost) on the IIF index",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "cost": {"type": "number", "description": "Monthly cost/payment of the simulated purchase"},
                                        "yield_amount": {"type": "number", "description": "Monthly yield generated by the simulated purchase"}
                                    }
                                }
                            },
                            {
                                "name": "sync_webhook_data",
                                "description": "Simulate sending a webhook payload for Shopify or TikTok e-commerce store",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "source": {"type": "string", "description": "Source webhook platform ('shopify' or 'tiktok')"},
                                        "store_name": {"type": "string", "description": "Name of store"},
                                        "monthly_profit": {"type": "number", "description": "Monthly profit yield"},
                                        "value": {"type": "number", "description": "Valuation of the store"}
                                    },
                                    "required": ["source", "store_name", "monthly_profit", "value"]
                                }
                            }
                        ]
                    }
                }
                sys.stdout.write(json.dumps(res) + "\n")
                sys.stdout.flush()
                
            elif method == "tools/call":
                params = req.get("params", {})
                tool_name = params.get("name")
                args = params.get("arguments", {})
                
                if tool_name == "get_financial_summary":
                    result = get_financial_summary()
                elif tool_name == "simulate_purchase":
                    result = simulate_purchase(
                        cost=args.get("cost", 0.0),
                        yield_amount=args.get("yield_amount", 0.0)
                    )
                elif tool_name == "sync_webhook_data":
                    result = sync_webhook_data(
                        source=args.get("source"),
                        store_name=args.get("store_name"),
                        monthly_profit=args.get("monthly_profit"),
                        value=args.get("value")
                    )
                else:
                    result = {"content": [{"type": "text", "text": f"Error: Tool {tool_name} not found"}], "isError": True}
                
                res = {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": result
                }
                sys.stdout.write(json.dumps(res) + "\n")
                sys.stdout.flush()
                
            else:
                # Unknown method
                if req_id is not None:
                    res = {
                        "jsonrpc": "2.0",
                        "id": req_id,
                        "error": {
                            "code": -32601,
                            "message": f"Method {method} not found"
                        }
                    }
                    sys.stdout.write(json.dumps(res) + "\n")
                    sys.stdout.flush()
        except Exception as e:
            pass

if __name__ == "__main__":
    main()
