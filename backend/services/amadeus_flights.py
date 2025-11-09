"""Amadeus API client for flight search"""
from __future__ import annotations

import logging
import math
import os
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

import httpx
from dotenv import load_dotenv

from schemas import FlightOption, FlightSegment

load_dotenv()

logger = logging.getLogger(__name__)
AMADEUS_API_KEY = os.getenv("AMADEUS_API_KEY")
AMADEUS_API_SECRET = os.getenv("AMADEUS_API_SECRET")
AMADEUS_ENV = os.getenv("AMADEUS_ENV", "test").lower()
AMADEUS_BASE_URL = (
    "https://api.amadeus.com" if AMADEUS_ENV == "live" else "https://test.api.amadeus.com"
)

# Reference coordinates for common airports (lat, lon in degrees)
# Source: public airport datasets (rounded)
AIRPORT_COORDS: Dict[str, Tuple[float, float]] = {
    "ATL": (33.6407, -84.4277),
    "AUS": (30.1975, -97.6664),
    "BOS": (42.3656, -71.0096),
    "CDG": (49.0097, 2.5479),
    "CLT": (35.2144, -80.9473),
    "DAL": (32.8471, -96.8518),
    "DEN": (39.8561, -104.6737),
    "DFW": (32.8998, -97.0403),
    "DUB": (53.4213, -6.2701),
    "DXB": (25.2532, 55.3657),
    "EWR": (40.6895, -74.1745),
    "FCO": (41.8003, 12.2389),
    "FRA": (50.0379, 8.5622),
    "HKG": (22.3080, 113.9185),
    "HNL": (21.3187, -157.9224),
    "IAH": (29.9902, -95.3368),
    "ICN": (37.4602, 126.4407),
    "IST": (41.2753, 28.7519),
    "JFK": (40.6413, -73.7781),
    "LAS": (36.0840, -115.1537),
    "LAX": (33.9416, -118.4085),
    "LHR": (51.4700, -0.4543),
    "MAD": (40.4893, -3.5676),
    "MIA": (25.7959, -80.2870),
    "MSP": (44.8848, -93.2223),
    "NRT": (35.7767, 140.3189),
    "ORD": (41.9742, -87.9073),
    "ORY": (48.7262, 2.3652),
    "PEK": (40.0801, 116.5846),
    "PHL": (39.8729, -75.2437),
    "PHX": (33.4343, -112.0116),
    "SAN": (32.7338, -117.1933),
    "SEA": (47.4502, -122.3088),
    "SFO": (37.6213, -122.3790),
    "SIN": (1.3644, 103.9915),
    "SYD": (-33.9399, 151.1753),
    "YYZ": (43.6777, -79.6248),
}

CABIN_VARIANTS: Dict[str, Dict[str, float]] = {
    "economy": {"price_multiplier": 1.0, "emission_multiplier": 1.0},
    "premium economy": {"price_multiplier": 1.25, "emission_multiplier": 1.15},
    "business": {"price_multiplier": 1.8, "emission_multiplier": 1.5},
    "first": {"price_multiplier": 2.6, "emission_multiplier": 2.0},
}


def _get_airport_coords(code: str) -> Optional[Tuple[float, float]]:
    """Return (lat, lon) tuple for an airport code if known."""
    return AIRPORT_COORDS.get(code.upper())


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two points on Earth in kilometers."""
    r = 6371.0  # Earth radius in km
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)

    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return r * c


def _segment_distance_km(segment: FlightSegment) -> Optional[float]:
    origin_coords = _get_airport_coords(segment.origin)
    dest_coords = _get_airport_coords(segment.destination)
    if not origin_coords or not dest_coords:
        return None
    return _haversine_km(origin_coords[0], origin_coords[1], dest_coords[0], dest_coords[1])


def _total_distance_km(segments: List[FlightSegment]) -> float:
    total = 0.0
    missing = False
    for seg in segments:
        distance = _segment_distance_km(seg)
        if distance is None:
            missing = True
        else:
            total += distance
    if total == 0.0 and missing:
        # Fallback heuristic when coordinates are missing: estimate from duration (~800 km/h)
        duration_hours = sum(
            (seg.arrival - seg.departure).total_seconds() for seg in segments
        ) / 3600.0
        if duration_hours > 0:
            total = max(500.0, duration_hours * 800.0)
    if total == 0.0:
        # Absolute fallback to keep downstream calculations safe
        total = 1500.0
    return total


def _base_emission_factor(distance_km: float) -> float:
    """Return kg CO2 per passenger-km for economy, using DEFRA guidance."""
    if distance_km <= 1500:
        factor = 0.158
    elif distance_km <= 3500:
        factor = 0.111
    else:
        factor = 0.102
    # Apply radiative forcing index (approximated at 1.9)
    return factor * 1.9


def _estimate_emissions(distance_km: float, cabin: str) -> float:
    base_factor = _base_emission_factor(distance_km)
    multiplier = CABIN_VARIANTS.get(cabin.lower(), {"emission_multiplier": 1.0})["emission_multiplier"]
    emissions = distance_km * base_factor * multiplier
    return round(emissions, 1)


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
    Note: origin and destination should be IATA airport codes (e.g., "JFK", "CDG")
    """
    logger.info(f"Fetching Amadeus flights: {origin} -> {destination} on {departure_date}")
    
    if not AMADEUS_API_KEY or not AMADEUS_API_SECRET:
        logger.warning("Amadeus API keys not set, using fallback data")
        return _fallback_flights(origin, destination, departure_date, return_date)
    
    token = await get_amadeus_token()
    if not token:
        logger.warning("Failed to get Amadeus token, using fallback data")
        return _fallback_flights(origin, destination, departure_date, return_date)
    
    logger.info("Got Amadeus token, fetching flights...")
    
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
                cabin = None
                traveler_pricing = offer.get("travelerPricings", [])
                if traveler_pricing:
                    fare_details = traveler_pricing[0].get("fareDetailsBySegment", [])
                    if fare_details:
                        cabin = fare_details[0].get("cabin", None)
                cabin_label = cabin.lower() if isinstance(cabin, str) else "economy"
                distance_km = _total_distance_km(segments)
                emissions = _estimate_emissions(distance_km, cabin_label)
                flights.append(
                    FlightOption(
                        id=str(uuid.uuid4()),
                        price=price,
                        currency="USD",
                        segments=segments,
                        booking_url=offer.get("links", {}).get("flightOffers", ""),
                        emissions_kg=emissions,
                        cabin=cabin_label,
                    )
                )
            
            logger.info(f"Amadeus returned {len(flights)} flights")
            return flights if flights else _fallback_flights(origin, destination, departure_date, return_date)
        except Exception as e:
            logger.error(f"Amadeus API error: {str(e)}, using fallback")
            return _fallback_flights(origin, destination, departure_date, return_date)

def _fallback_flights(
    origin: str,
    destination: str,
    departure_date: str,
    return_date: Optional[str] = None,
) -> List[FlightOption]:
    """Fallback flight data when API is unavailable.

    Generates realistic-looking options across multiple cabin classes with
    estimated emissions derived from route distance and seat class modifiers.
    """
    from . import airport_code_resolver  # Local import to avoid circular dependency

    origin_code = (airport_code_resolver.resolve_airport_code(origin) or origin).upper()
    destination_code = (airport_code_resolver.resolve_airport_code(destination) or destination).upper()

    carriers = ["AA", "DL", "UA", "BA", "AF"]
    base_prices = [399.0, 429.0, 475.0, 515.0, 559.0]
    depart_times = ["06:30:00", "09:15:00", "12:45:00", "15:20:00", "20:10:00"]
    durations_minutes = [380, 420, 455, 495, 540]  # 6h20, 7h, 7h35, 8h15, 9h

    options: List[FlightOption] = []
    for i in range(len(base_prices)):
        dep_dt = datetime.fromisoformat(f"{departure_date}T{depart_times[i]}")
        arr_dt = dep_dt + timedelta(minutes=durations_minutes[i])

        segments = [
            FlightSegment(
                carrier=carriers[i % len(carriers)],
                flight_number=f"{1000 + i}",
                origin=origin_code,
                destination=destination_code,
                departure=dep_dt,
                arrival=arr_dt,
            )
        ]

        if return_date:
            ret_dep_times = ["07:10:00", "11:00:00", "13:35:00", "17:25:00", "21:15:00"]
            ret_durations = [395, 430, 465, 505, 545]
            rdep = datetime.fromisoformat(f"{return_date}T{ret_dep_times[i]}")
            rarr = rdep + timedelta(minutes=ret_durations[i])
            segments.append(
                FlightSegment(
                    carrier=carriers[(i + 1) % len(carriers)],
                    flight_number=f"{2000 + i}",
                    origin=destination_code,
                    destination=origin_code,
                    departure=rdep,
                    arrival=rarr,
                )
            )

        total_distance_km = _total_distance_km(segments)
        base_price = base_prices[i]

        for cabin_name, modifiers in CABIN_VARIANTS.items():
            adjusted_price = round(base_price * modifiers["price_multiplier"], 2)
            emissions = _estimate_emissions(total_distance_km, cabin_name)
            options.append(
                FlightOption(
                    id=str(uuid.uuid4()),
                    price=adjusted_price,
                    currency="USD",
                    segments=[seg.copy(deep=True) for seg in segments],
                    emissions_kg=emissions,
                    cabin=cabin_name,
                )
            )

    # Sort flights by price ascending for consistent display
    options.sort(key=lambda opt: opt.price)
    return options

