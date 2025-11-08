"""Helper to diagnose Amadeus API connection issues."""
import os
from typing import Dict, Any, Optional
import httpx

async def check_amadeus_connection() -> Dict[str, Any]:
    """Test Amadeus connectivity and return detailed diagnostics."""
    result = {
        "status": "unknown",
        "details": [],
        "token": None,
        "error": None
    }
    
    # Check env vars
    api_key = os.getenv("AMADEUS_API_KEY")
    api_secret = os.getenv("AMADEUS_API_SECRET")
    
    if not api_key:
        result["status"] = "error"
        result["details"].append("AMADEUS_API_KEY not found in environment")
    if not api_secret:
        result["status"] = "error"
        result["details"].append("AMADEUS_API_SECRET not found in environment")
    
    if result["status"] == "error":
        return result
        
    # Test token endpoint
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                "https://test.api.amadeus.com/v1/security/oauth2/token",
                data={
                    "grant_type": "client_credentials",
                    "client_id": api_key,
                    "client_secret": api_secret,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            
            result["details"].append(f"Token endpoint status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                result["status"] = "ok"
                result["token"] = {
                    "type": data.get("token_type"),
                    "expires_in": data.get("expires_in"),
                    "state": "valid"
                }
            else:
                result["status"] = "error"
                try:
                    error_data = response.json()
                    result["error"] = error_data
                except:
                    result["error"] = {"message": "Failed to parse error response"}
                    
    except Exception as e:
        result["status"] = "error"
        result["error"] = {"message": str(e)}
        
    return result