"""Amadeus API client for hotel search"""
from __future__ import annotations

import os
import uuid
from typing import List, Optional

import httpx
from dotenv import load_dotenv

from schemas import LodgingOption

load_dotenv()

AMADEUS_API_KEY = os.getenv("AMADEUS_API_KEY")
AMADEUS_API_SECRET = os.getenv("AMADEUS_API_SECRET")
AMADEUS_BASE_URL = os.getenv("AMADEUS_BASE_URL", "https://test.api.amadeus.com")


async def get_amadeus_token() -> Optional[str]:
    """Get OAuth token from Amadeus (shared with flights)"""
    if not AMADEUS_API_KEY or not AMADEUS_API_SECRET:
        return None
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.post(
                f"{AMADEUS_BASE_URL}/v1/security/oauth2/token",
                data={
                    "grant_type": "client_credentials",
                    "client_id": AMADEUS_API_KEY,
                    "client_secret": AMADEUS_API_SECRET,
                },
            )
            response.raise_for_status()
            return response.json().get("access_token")
        except Exception:
            return None


async def fetch_hotels_amadeus(
    latitude: float,
    longitude: float,
    check_in: str,
    check_out: str,
    adults: int = 1,
) -> List[LodgingOption]:
    """
    Fetch hotel options from Amadeus API.
    Returns top 3-5 hotel options.
    """
    token = await get_amadeus_token()
    if not token:
        return _fallback_hotels()
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # First, search hotels by geocode
    search_params = {
        "latitude": latitude,
        "longitude": longitude,
        "radius": 5,
        "radiusUnit": "KM",
        "hotelSource": "ALL",
    }
    
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            # Search for hotels
            search_response = await client.get(
                f"{AMADEUS_BASE_URL}/v1/reference-data/locations/hotels/by-geocode",
                headers=headers,
                params=search_params,
            )
            search_response.raise_for_status()
            hotels_data = search_response.json()
            
            hotel_ids = [h.get("hotelId") for h in hotels_data.get("data", [])[:5]]
            if not hotel_ids:
                return _fallback_hotels()
            
            # Get hotel offers
            offers_params = {
                "hotelIds": ",".join(hotel_ids),
                "checkInDate": check_in,
                "checkOutDate": check_out,
                "adults": adults,
                "currency": "USD",
            }
            
            offers_response = await client.get(
                f"{AMADEUS_BASE_URL}/v3/shopping/hotel-offers",
                headers=headers,
                params=offers_params,
            )
            offers_response.raise_for_status()
            offers_data = offers_response.json()
            
            hotels: List[LodgingOption] = []
            for hotel in offers_data.get("data", [])[:5]:
                hotel_info = hotel.get("hotel", {})
                offers = hotel.get("offers", [])
                if not offers:
                    continue
                
                best_offer = offers[0]
                price = float(best_offer.get("price", {}).get("total", 0))
                
                hotels.append(
                    LodgingOption(
                        id=str(uuid.uuid4()),
                        name=hotel_info.get("name", "Hotel"),
                        address=hotel_info.get("address", {}).get("lines", [""])[0] or "Address not available",
                        nightly_rate=price,
                        currency="USD",
                        booking_url=best_offer.get("self", ""),
                    )
                )
            
            return hotels if hotels else _fallback_hotels()
        except Exception:
            return _fallback_hotels()


def _fallback_hotels() -> List[LodgingOption]:
    """Fallback hotel data when API is unavailable"""
    return [
        LodgingOption(
            id=str(uuid.uuid4()),
            name="Eco-Friendly Hotel",
            address="City Center",
            nightly_rate=120.0,
            currency="USD",
            sustainability_score=0.8,
        )
    ]

