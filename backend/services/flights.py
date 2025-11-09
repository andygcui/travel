from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta
from typing import List

import httpx

from schemas import FlightOption, FlightSegment, TripPlanRequest

TEQUILA_API_KEY = os.getenv("TEQUILA_API_KEY")
TEQUILA_BASE_URL = "https://api.tequila.kiwi.com"


async def fetch_flights(request: TripPlanRequest) -> List[FlightOption]:
    """Retrieve flight options via Tequila. Returns sample data if API key missing."""
    if not TEQUILA_API_KEY or not request.origin:
        return _fallback_flights(request)

    headers = {"apikey": TEQUILA_API_KEY}
    params = {
        "fly_from": request.origin,
        "fly_to": request.destination,
        "date_from": request.start_date.strftime("%d/%m/%Y"),
        "date_to": request.start_date.strftime("%d/%m/%Y"),
        "return_from": request.end_date.strftime("%d/%m/%Y"),
        "return_to": request.end_date.strftime("%d/%m/%Y"),
        "curr": "USD",
        "limit": 3,
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            response = await client.get(
                f"{TEQUILA_BASE_URL}/v2/search", headers=headers, params=params
            )
            response.raise_for_status()
            payload = response.json()
        except Exception:
            return _fallback_flights(request)

    flights: List[FlightOption] = []
    for idx, item in enumerate(payload.get("data", [])):
        price = float(item.get("price", 0))
        booking_token = item.get("booking_token")
        segments: List[FlightSegment] = []
        for route in item.get("route", []):
            segments.append(
                FlightSegment(
                    carrier=route.get("airline", "Unknown"),
                    flight_number=route.get("flight_no", ""),
                    origin=route.get("flyFrom", ""),
                    destination=route.get("flyTo", ""),
                    departure=datetime.fromtimestamp(route.get("dTimeUTC", 0)),
                    arrival=datetime.fromtimestamp(route.get("aTimeUTC", 0)),
                )
            )
        flights.append(
            FlightOption(
                id=str(uuid.uuid4()),
                price=price,
                currency="USD",
                booking_url=item.get("deep_link"),
                segments=segments,
                refundable_until=datetime.utcnow() + timedelta(days=3),
            )
        )
        if idx >= 2:
            break

    return flights or _fallback_flights(request)


def _fallback_flights(request: TripPlanRequest) -> List[FlightOption]:
    departure = datetime.combine(request.start_date, datetime.min.time()) + timedelta(hours=8)
    return [
        FlightOption(
            id="sample-flight",
            price=420.0,
            segments=[
                FlightSegment(
                    carrier="GreenTrip Air",
                    flight_number="TS123",
                    origin=request.origin or "HUB",
                    destination=request.destination,
                    departure=departure,
                    arrival=departure + timedelta(hours=6),
                )
            ],
            refundable_until=departure - timedelta(days=2),
            currency="USD",
            booking_url=None,
        )
    ]

