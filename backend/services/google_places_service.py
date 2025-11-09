"""Google Places API client for attractions and geocoding"""
from __future__ import annotations

import logging
import os
from typing import List, Optional, Tuple

import httpx
from dotenv import load_dotenv

from schemas import PointOfInterest, POIReview

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

            field_mask = ",".join(
                [
                    "places.id",
                    "places.displayName",
                    "places.primaryType",
                    "places.location",
                    "places.formattedAddress",
                    "places.rating",
                    "places.userRatingCount",
                    "places.photos",
                    "places.editorialSummary",
                    "places.reviews",
                    "places.id",
                ]
            )

            response = await client.post(
                f"{GOOGLE_PLACES_BASE_URL_NEW}/places:searchText",
                headers={
                    "X-Goog-Api-Key": GOOGLE_PLACES_KEY,
                    "X-Goog-FieldMask": field_mask,
                },
                json={
                    "textQuery": text_query,
                },
            )
            response.raise_for_status()
            data = response.json()

            pois.extend(_parse_places(data.get("places", []), limit))

            if latitude and longitude and len(pois) < limit:
                nearby_response = await client.post(
                    f"{GOOGLE_PLACES_BASE_URL_NEW}/places:searchNearby",
                    headers={
                        "X-Goog-Api-Key": GOOGLE_PLACES_KEY,
                        "X-Goog-FieldMask": field_mask,
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
                for poi in _parse_places(nearby_data.get("places", []), limit):
                    if poi.name in existing_names:
                        continue
                    pois.append(poi)
                    existing_names.add(poi.name)
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


async def fetch_place_details_for_lodging(
    name: str,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    address: Optional[str] = None,
) -> Optional[PointOfInterest]:
    """
    Fetch hotel details (photos, reviews, ratings) from Google Places.
    """
    if not GOOGLE_PLACES_KEY or not name:
        return None

    queries = []
    normalized_address = (address or "").strip()
    if normalized_address and normalized_address.lower() not in {"address not available", "city center"}:
        queries.append(f"{name} {normalized_address}")
    queries.append(name)
    queries.append(f"{name} hotel")

    field_mask = ",".join(
        [
            "id",
            "displayName",
            "primaryType",
            "location",
            "formattedAddress",
            "rating",
            "userRatingCount",
            "photos",
            "editorialSummary",
            "reviews",
        ]
    )

    async with httpx.AsyncClient(timeout=10.0) as client:
        for text_query in queries:
            request_body = {
                "textQuery": text_query,
                "includedTypes": ["lodging"],
            }

            if latitude is not None and longitude is not None:
                request_body["locationBias"] = {
                    "circle": {
                        "center": {"latitude": latitude, "longitude": longitude},
                        "radius": 5000,
                    }
                }

            try:
                response = await client.post(
                    f"{GOOGLE_PLACES_BASE_URL_NEW}/places:searchText",
                    headers={
                        "X-Goog-Api-Key": GOOGLE_PLACES_KEY,
                        "X-Goog-FieldMask": field_mask,
                    },
                    json=request_body,
                )
                response.raise_for_status()
                data = response.json()
                parsed = _parse_places(data.get("places", []), 1)
                if parsed:
                    return parsed[0]
            except httpx.HTTPStatusError as exc:
                logger.error(
                    "Google Places hotel enrichment error %s: %s",
                    exc.response.status_code,
                    exc.response.text,
                )
                return None
            except Exception as exc:
                logger.error("Google Places hotel enrichment error: %s", exc)
                return None

        if latitude is not None and longitude is not None:
            try:
                nearby_response = await client.post(
                    f"{GOOGLE_PLACES_BASE_URL_NEW}/places:searchNearby",
                    headers={
                        "X-Goog-Api-Key": GOOGLE_PLACES_KEY,
                        "X-Goog-FieldMask": field_mask,
                    },
                    json={
                        "locationRestriction": {
                            "circle": {
                                "center": {"latitude": latitude, "longitude": longitude},
                                "radius": 3000,
                            }
                        },
                        "includedTypes": ["lodging"],
                        "maxResultCount": 5,
                    },
                )
                nearby_response.raise_for_status()
                nearby_data = nearby_response.json()
                parsed_nearby = _parse_places(nearby_data.get("places", []), 1)
                if parsed_nearby:
                    return parsed_nearby[0]
            except httpx.HTTPStatusError as exc:
                logger.error(
                    "Google Places hotel nearby enrichment error %s: %s",
                    exc.response.status_code,
                    exc.response.text,
                )
            except Exception as exc:
                logger.error("Google Places hotel nearby enrichment error: %s", exc)

    logger.info("Google Places returned no lodging details for '%s'", name)
    return None


async def fetch_place_details_by_id(place_id: str) -> Optional[PointOfInterest]:
    """
    Fetch detailed place info using a Google Places ID.
    """
    if not GOOGLE_PLACES_KEY or not place_id:
        return None

    field_mask = ",".join(
        [
            "places.id",
            "places.displayName",
            "places.primaryType",
            "places.location",
            "places.formattedAddress",
            "places.rating",
            "places.userRatingCount",
            "places.photos",
            "places.editorialSummary",
            "places.reviews",
        ]
    )

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.get(
                f"{GOOGLE_PLACES_BASE_URL_NEW}/places/{place_id}",
                headers={
                    "X-Goog-Api-Key": GOOGLE_PLACES_KEY,
                    "X-Goog-FieldMask": field_mask,
                },
            )
            response.raise_for_status()
            place_data = response.json()
            parsed = _parse_places([place_data], 1)
            return parsed[0] if parsed else None
        except httpx.HTTPStatusError as exc:
            logger.error(
                "Google Places detail error %s: %s",
                exc.response.status_code,
                exc.response.text,
            )
        except Exception as exc:
            logger.error("Google Places detail error: %s", exc)

    return None


async def fetch_hotels_nearby(
    latitude: float,
    longitude: float,
    limit: int = 10,
) -> List[PointOfInterest]:
    """
    Fetch hotel POIs near a location using Google Places.
    """
    if not GOOGLE_PLACES_KEY:
        return []

    field_mask = ",".join(
        [
            "places.id",
            "places.displayName",
            "places.primaryType",
            "places.location",
            "places.formattedAddress",
            "places.rating",
            "places.userRatingCount",
            "places.photos",
            "places.editorialSummary",
            "places.reviews",
        ]
    )

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.post(
                f"{GOOGLE_PLACES_BASE_URL_NEW}/places:searchNearby",
                headers={
                    "X-Goog-Api-Key": GOOGLE_PLACES_KEY,
                    "X-Goog-FieldMask": field_mask,
                },
                json={
                    "locationRestriction": {
                        "circle": {
                            "center": {"latitude": latitude, "longitude": longitude},
                            "radius": 5000,
                        }
                    },
                    "includedTypes": ["lodging"],
                    "maxResultCount": max(limit, 5),
                },
            )
            response.raise_for_status()
            data = response.json()
            return _parse_places(data.get("places", []), limit)
        except httpx.HTTPStatusError as exc:
            logger.error(
                "Google Places nearby hotels error %s: %s",
                exc.response.status_code,
                exc.response.text,
            )
        except Exception as exc:
            logger.error("Google Places nearby hotels error: %s", exc)

    return []


def _fallback_pois(destination: str) -> List[PointOfInterest]:
    """Fallback POI data"""
    return [
        PointOfInterest(
            name=f"{destination} Main Attraction",
            category="attraction",
            description="Popular tourist destination",
            photo_urls=[],
            reviews=[],
        )
    ]


def _parse_places(places: List[dict], limit: int) -> List[PointOfInterest]:
    results: List[PointOfInterest] = []
    if not places:
        return results

    for place in places[:limit]:
        location = place.get("location", {})
        photos = []
        for photo in (place.get("photos") or [])[:5]:
            name = photo.get("name")
            if not name:
                continue
            photo_url = (
                f"https://places.googleapis.com/v1/{name}/media"
                f"?key={GOOGLE_PLACES_KEY}&maxHeightPx=1000&maxWidthPx=1000"
            )
            photos.append(photo_url)

        reviews: List[POIReview] = []
        for review in (place.get("reviews") or [])[:3]:
            author_attr = review.get("authorAttribution") or {}
            text_obj = review.get("text") or {}
            reviews.append(
                POIReview(
                    author=author_attr.get("displayName"),
                    rating=review.get("rating"),
                    relative_time_description=review.get("relativePublishTimeDescription"),
                    text=text_obj.get("text"),
                )
            )

        results.append(
            PointOfInterest(
                name=place.get("displayName", {}).get("text", ""),
                category=place.get("primaryType", "attraction"),
                description=place.get("formattedAddress", "")
                or (place.get("editorialSummary") or {}).get("text"),
                latitude=location.get("latitude"),
                longitude=location.get("longitude"),
                rating=place.get("rating"),
                user_ratings_total=place.get("userRatingCount"),
                photo_urls=photos,
                reviews=reviews,
                place_id=place.get("id"),
            )
        )
    return results

