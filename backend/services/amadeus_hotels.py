"""Amadeus API client for hotel search"""
from __future__ import annotations

import difflib
import os
import uuid
from datetime import datetime
from typing import List, Optional, Tuple

import httpx
from dotenv import load_dotenv

from schemas import LodgingOption, PointOfInterest
from services import google_places_service

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
                return _fallback_hotels(destination=(latitude, longitude))
            
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
                try:
                    nights = max(
                        (datetime.fromisoformat(check_out) - datetime.fromisoformat(check_in)).days,
                        1,
                    )
                except ValueError:
                    nights = 1
                nightly_rate = price / nights if nights > 0 else price

                hotels.append(
                    LodgingOption(
                        id=str(uuid.uuid4()),
                        name=hotel_info.get("name", "Hotel"),
                        address=hotel_info.get("address", {}).get("lines", [""])[0] or "Address not available",
                        nightly_rate=round(nightly_rate, 2),
                        currency="USD",
                        booking_url=best_offer.get("self", ""),
                    )
                )

            nearby_hotels = await google_places_service.fetch_hotels_nearby(
                latitude, longitude, limit=15
            )

            for lodging in hotels:
                poi_match = _match_poi_for_lodging(lodging, nearby_hotels)
                if poi_match:
                    enrichment = poi_match
                else:
                    enrichment = await google_places_service.fetch_place_details_for_lodging(
                        lodging.name,
                        latitude=latitude,
                        longitude=longitude,
                        address=lodging.address,
                    )

                if not enrichment:
                    continue

                _apply_enrichment(lodging, enrichment)

                if lodging.place_id and (
                    not lodging.photo_urls or not lodging.reviews
                ):
                    detail_enrichment = await google_places_service.fetch_place_details_by_id(
                        lodging.place_id
                    )
                    if detail_enrichment:
                        _apply_enrichment(lodging, detail_enrichment)

                if (not lodging.photo_urls or not lodging.reviews) and enrichment is not poi_match:
                    fallback_enrichment = await google_places_service.fetch_place_details_for_lodging(
                        lodging.name,
                        latitude=latitude,
                        longitude=longitude,
                        address=lodging.address,
                    )
                    if fallback_enrichment:
                        _apply_enrichment(lodging, fallback_enrichment)

            return hotels if hotels else _fallback_hotels(destination=(latitude, longitude))
        except Exception:
            return _fallback_hotels(destination=(latitude, longitude))


def _fallback_hotels(destination: Optional[Tuple[float, float]] = None) -> List[LodgingOption]:
    """Fallback hotel data when API is unavailable"""
    fallback_hotels = [
        ("Hilton Garden Inn Signature", 189.0, 0.7),
        ("Marriott Select Suites", 215.0, 0.75),
        ("Anderson Boutique Hotel", 245.0, 0.82),
        ("The Heritage Collection", 260.0, 0.78),
        ("Summit Grand Residences", 305.0, 0.8),
    ]

    hotels: List[LodgingOption] = []
    for name, rate, sustainability in fallback_hotels:
        hotels.append(
            LodgingOption(
                id=str(uuid.uuid4()),
                name=name,
                address="City Center",
                nightly_rate=rate,
                currency="USD",
                sustainability_score=sustainability,
            )
        )
    return hotels


def _normalize_name(value: str) -> str:
    return "".join(ch for ch in value.lower() if ch.isalnum() or ch.isspace()).strip()


def _match_poi_for_lodging(
    lodging: LodgingOption, pois: List[PointOfInterest]
) -> Optional[PointOfInterest]:
    if not pois:
        return None

    lodging_name = _normalize_name(lodging.name)
    if not lodging_name:
        return None

    best_match: Optional[PointOfInterest] = None
    best_score = 0.0

    for poi in pois:
        candidate_name = _normalize_name(poi.name or "")
        if not candidate_name:
            continue

        if lodging_name == candidate_name:
            pois.remove(poi)
            return poi

        score = difflib.SequenceMatcher(None, lodging_name, candidate_name).ratio()
        if score > best_score:
            best_score = score
            best_match = poi

    if best_match and best_score >= 0.68:
        pois.remove(best_match)
        return best_match

    return None


def _apply_enrichment(lodging: LodgingOption, enrichment: PointOfInterest) -> None:
    if enrichment.photo_urls:
        lodging.photo_urls = enrichment.photo_urls
    if enrichment.reviews:
        lodging.reviews = enrichment.reviews
    if enrichment.rating is not None:
        lodging.rating = enrichment.rating
    if enrichment.user_ratings_total is not None:
        lodging.user_ratings_total = enrichment.user_ratings_total
    if enrichment.latitude is not None:
        lodging.latitude = enrichment.latitude
    if enrichment.longitude is not None:
        lodging.longitude = enrichment.longitude
    if enrichment.description:
        lodging.description = enrichment.description
        if lodging.address in {"Address not available", "City Center"}:
            lodging.address = enrichment.description
    if enrichment.place_id:
        lodging.place_id = enrichment.place_id

