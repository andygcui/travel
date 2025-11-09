"""Flight API client for flight search"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timedelta
from typing import List, Optional

import httpx
from dotenv import load_dotenv

from schemas import FlightOption, FlightSegment
from services.tools_travel import estimate_co2_climatiq
import asyncio

load_dotenv()

logger = logging.getLogger(__name__)
FLIGHT_API_KEY = os.getenv("FLIGHT_API_KEY")
FLIGHT_API_BASE_URL = "https://api.flightapi.io"  # Update this with the correct base URL

async def fetch_flights(
    origin: str,
    destination: str,
    departure_date: str,
    return_date: Optional[str] = None,
    adults: int = 1,
) -> List[FlightOption]:
    """
    Fetch flight options from Flight API.
    Returns top flight options.
    Note: origin and destination should be IATA airport codes (e.g., "JFK", "LAX")
    """
    logger.info(f"Fetching flights: {origin} -> {destination} on {departure_date}")
    
    if not FLIGHT_API_KEY:
        logger.warning("Flight API key not set, using fallback data")
        return _fallback_flights(origin, destination, departure_date, return_date)
    
    headers = {"apikey": FLIGHT_API_KEY}
    params = {
        "from": origin,
        "to": destination,
        "depart": departure_date,
        "adults": adults,
        "currency": "USD"
    }
    
    if return_date:
        params["return"] = return_date
    
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            response = await client.get(
                f"{FLIGHT_API_BASE_URL}/search",
                headers=headers,
                params=params,
            )
            response.raise_for_status()
            data = response.json()
            
            flights: List[FlightOption] = []
            for offer in data.get("flights", [])[:5]:  # Adjust based on actual API response structure
                segments: List[FlightSegment] = []
                for segment in offer.get("segments", []):  # Adjust based on actual API response structure
                    segments.append(
                        FlightSegment(
                            carrier=segment.get("airline", "N/A"),
                            flight_number=segment.get("flight_number", ""),
                            origin=segment.get("from", ""),
                            destination=segment.get("to", ""),
                            departure=datetime.fromisoformat(segment.get("departure_time")),
                            arrival=datetime.fromisoformat(segment.get("arrival_time")),
                        )
                    )
                
                price = float(offer.get("price", 0))
                flights.append(
                    FlightOption(
                        id=str(uuid.uuid4()),
                        price=price,
                        currency="USD",
                        segments=segments,
                        booking_url=offer.get("booking_link", ""),
                    )
                )
            
            logger.info(f"Flight API returned {len(flights)} flights")
            return flights if flights else _fallback_flights(origin, destination, departure_date, return_date)
        except Exception as e:
            logger.error(f"Flight API error: {str(e)}, using fallback")
            return _fallback_flights(origin, destination, departure_date, return_date)


def _fallback_flights(
    origin: str,
    destination: str,
    departure_date: str,
    return_date: Optional[str] = None,
) -> List[FlightOption]:
    """Fallback flight data when API is unavailable.

    Provide multiple varied options (carriers, prices, times, durations) and
    include a return segment when a return date is supplied so the UI can
    showcase diversity.
    """
    carriers = ["AA", "DL", "UA", "SW", "JB"]
    base_prices = [320.0, 355.0, 389.0, 412.0, 449.0]
    depart_times = ["05:40:00", "08:05:00", "11:25:00", "14:55:00", "19:10:00"]
    durations_min = [95, 110, 125, 140, 155]  # short hops example

    results: List[FlightOption] = []
    for i in range(len(base_prices)):
        dep_dt = datetime.fromisoformat(f"{departure_date}T{depart_times[i]}")
        arr_dt = dep_dt + timedelta(minutes=durations_min[i])
        segments = [
            FlightSegment(
                carrier=carriers[i],
                flight_number=f"{300 + i}",
                origin=origin,
                destination=destination,
                departure=dep_dt,
                arrival=arr_dt,
            )
        ]
        if return_date:
            ret_times = ["06:20:00", "09:45:00", "13:05:00", "16:30:00", "21:00:00"]
            ret_durations = [100, 115, 130, 145, 160]
            rdep = datetime.fromisoformat(f"{return_date}T{ret_times[i]}")
            rarr = rdep + timedelta(minutes=ret_durations[i])
            segments.append(
                FlightSegment(
                    carrier=carriers[(i + 1) % len(carriers)],
                    flight_number=f"{800 + i}",
                    origin=destination,
                    destination=origin,
                    departure=rdep,
                    arrival=rarr,
                )
            )
        results.append(
            FlightOption(
                id=str(uuid.uuid4()),
                price=base_prices[i],
                currency="USD",
                segments=segments,
            )
        )
    return results


async def fetch_flights_with_emissions(
    origin: str,
    destination: str,
    departure_date: str,
    return_date: Optional[str] = None,
    adults: int = 1,
) -> dict:
    """Return two lists: regular (price-sorted) and eco (CO2-sorted).

    Uses Flight API for flight offers and estimates CO2 per offer via
    the Climatiq helper in `services.tools_travel`. If Climatiq key
    is missing, a heuristic is used there.
    """
    offers = await fetch_flights(origin, destination, departure_date, return_date, adults)

    async def _estimate_for_offer(offer: FlightOption) -> dict:
        # Prepare minimal segments for the estimator
        segs = []
        for s in offer.segments:
            segs.append({
                "origin": s.origin,
                "destination": s.destination,
                "distance_km": getattr(s, "distance_km", None) or 0,
            })

        # run estimate_co2_climatiq in thread since it's synchronous
        co2 = await asyncio.to_thread(estimate_co2_climatiq, segs, adults)
        co2_kg = co2.get("co2_kg")
        # Subtract 500 from emissions (minimum 0)
        if co2_kg is not None:
            co2_kg = max(0, co2_kg - 500)
        return {
            "id": offer.id,
            "price": offer.price,
            "currency": offer.currency,
            "segments": [
                {
                    "origin": seg.origin,
                    "destination": seg.destination,
                    "carrier": seg.carrier,
                    "flight_number": seg.flight_number,
                }
                for seg in offer.segments
            ],
            "co2_kg": co2_kg,
            "co2_source": co2.get("source"),
            "booking_url": getattr(offer, "booking_url", None),
        }

    tasks = [_estimate_for_offer(o) for o in offers]
    enriched = []
    if tasks:
        enriched = await asyncio.gather(*tasks)

    regular = sorted(enriched, key=lambda x: (x.get("price") or 0))
    eco = sorted(enriched, key=lambda x: (x.get("co2_kg") or float("inf")))

    return {"regular": regular, "eco": eco}