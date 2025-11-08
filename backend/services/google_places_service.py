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


async def geocode_destination(destination: str) -> Tuple[Optional[float], Optional[float]]:
    """
    Geocode destination using Google Places Text Search API.
    Returns (latitude, longitude).
    """
    if not GOOGLE_PLACES_KEY:
        logger.warning("GOOGLE_PLACES_KEY not set, cannot geocode")
        return None, None
    
    logger.info(f"Geocoding '{destination}' with Google Places API...")
    
    params = {
        "query": destination,
        "key": GOOGLE_PLACES_KEY,
    }
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.get(
                f"{GOOGLE_PLACES_BASE_URL}/place/textsearch/json",
                params=params,
            )
            response.raise_for_status()
            data = response.json()
            
            if data.get("results") and len(data["results"]) > 0:
                location = data["results"][0].get("geometry", {}).get("location", {})
                lat, lng = location.get("lat"), location.get("lng")
                logger.info(f"Geocoded '{destination}' to ({lat}, {lng})")
                return lat, lng
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
    
    # Build query based on preferences
    query = destination
    if preferences:
        query += f" {', '.join(preferences)} attractions"
    
    params = {
        "query": query,
        "key": GOOGLE_PLACES_KEY,
        "type": "tourist_attraction",
    }
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            # Use text search
            response = await client.get(
                f"{GOOGLE_PLACES_BASE_URL}/place/textsearch/json",
                params=params,
            )
            response.raise_for_status()
            data = response.json()
            
            for place in data.get("results", [])[:limit]:
                location = place.get("geometry", {}).get("location", {})
                pois.append(
                    PointOfInterest(
                        name=place.get("name", ""),
                        category=place.get("types", ["attraction"])[0] if place.get("types") else "attraction",
                        description=place.get("formatted_address", ""),
                        latitude=location.get("lat"),
                        longitude=location.get("lng"),
                    )
                )
            
            # If we have lat/lon, also try nearby search
            if latitude and longitude and len(pois) < limit:
                nearby_params = {
                    "location": f"{latitude},{longitude}",
                    "radius": 5000,
                    "type": "tourist_attraction",
                    "key": GOOGLE_PLACES_KEY,
                }
                
                nearby_response = await client.get(
                    f"{GOOGLE_PLACES_BASE_URL}/place/nearbysearch/json",
                    params=nearby_params,
                )
                nearby_response.raise_for_status()
                nearby_data = nearby_response.json()
                
                existing_names = {poi.name for poi in pois}
                for place in nearby_data.get("results", []):
                    if len(pois) >= limit:
                        break
                    if place.get("name") not in existing_names:
                        location = place.get("geometry", {}).get("location", {})
                        pois.append(
                            PointOfInterest(
                                name=place.get("name", ""),
                                category=place.get("types", ["attraction"])[0] if place.get("types") else "attraction",
                                description=place.get("vicinity", ""),
                                latitude=location.get("lat"),
                                longitude=location.get("lng"),
                            )
                        )
            
            return pois if pois else _fallback_pois(destination)
        except Exception:
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

