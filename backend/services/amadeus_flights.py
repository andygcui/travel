"""Amadeus API client for flight search"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta
from typing import List, Optional

import httpx
from dotenv import load_dotenv

from schemas import FlightOption, FlightSegment

load_dotenv()

AMADEUS_API_KEY = os.getenv("AMADEUS_API_KEY")
AMADEUS_API_SECRET = os.getenv("AMADEUS_API_SECRET")
AMADEUS_BASE_URL = os.getenv("AMADEUS_BASE_URL", "https://test.api.amadeus.com")


async def get_amadeus_token() -> Optional[str]:
    """Get OAuth token from Amadeus"""
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


async def fetch_flights_amadeus(
    origin: str,
    destination: str,
    departure_date: str,
    return_date: Optional[str] = None,
    adults: int = 1,
) -> List[FlightOption]:
    """
    Fetch flight options from Amadeus API.
    Returns top 3-5 flight options.
    """
    token = await get_amadeus_token()
    if not token:
        return _fallback_flights(origin, destination, departure_date)
    
    headers = {"Authorization": f"Bearer {token}"}
    params = {
        "originLocationCode": origin,
        "destinationLocationCode": destination,
        "departureDate": departure_date,
        "adults": adults,
        "max": 5,
        "currencyCode": "USD",
    }
    
    if return_date:
        params["returnDate"] = return_date
    
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            response = await client.get(
                f"{AMADEUS_BASE_URL}/v2/shopping/flight-offers",
                headers=headers,
                params=params,
            )
            response.raise_for_status()
            data = response.json()
            
            flights: List[FlightOption] = []
            for offer in data.get("data", [])[:5]:
                segments: List[FlightSegment] = []
                for segment in offer.get("itineraries", [{}])[0].get("segments", []):
                    segments.append(
                        FlightSegment(
                            carrier=segment.get("carrierCode", "N/A"),
                            flight_number=segment.get("number", ""),
                            origin=segment.get("departure", {}).get("iataCode", ""),
                            destination=segment.get("arrival", {}).get("iataCode", ""),
                            departure=datetime.fromisoformat(
                                segment.get("departure", {}).get("at", "").replace("Z", "+00:00")
                            ),
                            arrival=datetime.fromisoformat(
                                segment.get("arrival", {}).get("at", "").replace("Z", "+00:00")
                            ),
                        )
                    )
                
                price = float(offer.get("price", {}).get("total", 0))
                flights.append(
                    FlightOption(
                        id=str(uuid.uuid4()),
                        price=price,
                        currency="USD",
                        segments=segments,
                        booking_url=offer.get("links", {}).get("flightOffers", ""),
                    )
                )
            
            return flights if flights else _fallback_flights(origin, destination, departure_date)
        except Exception:
            return _fallback_flights(origin, destination, departure_date)


def _fallback_flights(origin: str, destination: str, departure_date: str) -> List[FlightOption]:
    """Fallback flight data when API is unavailable"""
    return [
        FlightOption(
            id=str(uuid.uuid4()),
            price=450.0,
            currency="USD",
            segments=[
                FlightSegment(
                    carrier="AA",
                    flight_number="1234",
                    origin=origin,
                    destination=destination,
                    departure=datetime.fromisoformat(f"{departure_date}T10:00:00"),
                    arrival=datetime.fromisoformat(f"{departure_date}T14:30:00"),
                )
            ],
        )
    ]

