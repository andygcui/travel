"""Google Places API client for attractions and geocoding"""
from __future__ import annotations

import logging
import os
from typing import List, Optional, Tuple

import httpx
from dotenv import load_dotenv

from schemas import PointOfInterest

load_dotenv()

logger = logging.getLogger(__name__)
GOOGLE_PLACES_KEY = os.getenv("GOOGLE_PLACES_KEY")
GOOGLE_PLACES_BASE_URL = "https://maps.googleapis.com/maps/api"
GOOGLE_PLACES_BASE_URL_NEW = "https://places.googleapis.com/v1"


async def geocode_destination(destination: str) -> Tuple[Optional[float], Optional[float]]:
    """
    Geocode destination using Google Places Text Search API.
    Returns (latitude, longitude).
    """
    if not GOOGLE_PLACES_KEY:
        logger.warning("GOOGLE_PLACES_KEY not set, cannot geocode")
        return None, None
    
    logger.info(f"Geocoding '{destination}' with Google Places API...")
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            # Prefer new Places API endpoint if available
            response = await client.post(
                f"{GOOGLE_PLACES_BASE_URL_NEW}/places:searchText",
                headers={
                    "X-Goog-Api-Key": GOOGLE_PLACES_KEY,
                    "X-Goog-FieldMask": "places.id,places.displayName,places.location",
                },
                json={"textQuery": destination},
            )
            response.raise_for_status()
            data = response.json()

            places = data.get("places", [])
            if places:
                loc = places[0].get("location", {})
                lat = loc.get("latitude")
                lng = loc.get("longitude")
                if lat is not None and lng is not None:
                    logger.info(f"Geocoded '{destination}' to ({lat}, {lng}) via Places API (New)")
                    return lat, lng

            # Fallback to legacy Text Search if needed
            params = {
                "query": destination,
                "key": GOOGLE_PLACES_KEY,
            }
            legacy_response = await client.get(
                f"{GOOGLE_PLACES_BASE_URL}/place/textsearch/json",
                params=params,
            )
            legacy_response.raise_for_status()
            legacy_data = legacy_response.json()

            if legacy_data.get("results"):
                location = legacy_data["results"][0].get("geometry", {}).get("location", {})
                lat, lng = location.get("lat"), location.get("lng")
                logger.info(f"Geocoded '{destination}' to ({lat}, {lng}) via legacy Places API")
                return lat, lng

            logger.warning(
                f"Google Places returned no results for '{destination}'. Response status: "
                f"{data.get('status') or legacy_data.get('status')} message: "
                f"{data.get('error_message') or legacy_data.get('error_message')}"
            )
        except httpx.HTTPStatusError as exc:
            logger.error(
                "Google Places geocoding error %s: %s",
                exc.response.status_code,
                exc.response.text,
            )
        except Exception as e:
            logger.error(f"Google Places geocoding error: {str(e)}")
    
    logger.warning(f"Could not geocode '{destination}'")
    return None, None


async def fetch_attractions_google(
    destination: str,
    latitude: Optional[float],
    longitude: Optional[float],
    preferences: List[str],
    limit: int = 5,
) -> List[PointOfInterest]:
    """
    Fetch attractions using Google Places API.
    Uses nearby search if lat/lon available, otherwise text search.
    """
    if not GOOGLE_PLACES_KEY:
        return _fallback_pois(destination)
    
    pois: List[PointOfInterest] = []
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            text_query = destination
            if preferences:
                text_query += f" {', '.join(preferences)} attractions"

            response = await client.post(
                f"{GOOGLE_PLACES_BASE_URL_NEW}/places:searchText",
                headers={
                    "X-Goog-Api-Key": GOOGLE_PLACES_KEY,
                    "X-Goog-FieldMask": "places.displayName,places.primaryType,places.location,places.formattedAddress",
                },
                json={
                    "textQuery": text_query,
                },
            )
            response.raise_for_status()
            data = response.json()

            for place in data.get("places", [])[:limit]:
                location = place.get("location", {})
                pois.append(
                    PointOfInterest(
                        name=place.get("displayName", {}).get("text", ""),
                        category=place.get("primaryType", "attraction"),
                        description=place.get("formattedAddress", ""),
                        latitude=location.get("latitude"),
                        longitude=location.get("longitude"),
                    )
                )

            if latitude and longitude and len(pois) < limit:
                nearby_response = await client.post(
                    f"{GOOGLE_PLACES_BASE_URL_NEW}/places:searchNearby",
                    headers={
                        "X-Goog-Api-Key": GOOGLE_PLACES_KEY,
                        "X-Goog-FieldMask": "places.displayName,places.primaryType,places.location,places.formattedAddress",
                    },
                    json={
                        "locationRestriction": {
                            "circle": {
                                "center": {"latitude": latitude, "longitude": longitude},
                                "radius": 5000,
                            }
                        },
                        "includedTypes": ["tourist_attraction"],
                    },
                )
                nearby_response.raise_for_status()
                nearby_data = nearby_response.json()

                existing_names = {poi.name for poi in pois}
                for place in nearby_data.get("places", []):
                    name = place.get("displayName", {}).get("text", "")
                    if not name or name in existing_names:
                        continue
                    location = place.get("location", {})
                    pois.append(
                        PointOfInterest(
                            name=name,
                            category=place.get("primaryType", "attraction"),
                            description=place.get("formattedAddress", ""),
                            latitude=location.get("latitude"),
                            longitude=location.get("longitude"),
                        )
                    )
                    if len(pois) >= limit:
                        break

            return pois if pois else _fallback_pois(destination)
        except httpx.HTTPStatusError as exc:
            logger.error(
                "Google Places attractions error %s: %s",
                exc.response.status_code,
                exc.response.text,
            )
            return _fallback_pois(destination)
        except Exception as e:
            logger.error(f"Google Places attractions error: {str(e)}")
            return _fallback_pois(destination)


def _fallback_pois(destination: str) -> List[PointOfInterest]:
    """Fallback POI data"""
    return [
        PointOfInterest(
            name=f"{destination} Main Attraction",
            category="attraction",
            description="Popular tourist destination",
        )
    ]

