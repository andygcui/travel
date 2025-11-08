from __future__ import annotations

import os
from typing import List

import httpx

from schemas import PointOfInterest

OPENTRIPMAP_API_KEY = os.getenv("OPENTRIPMAP_API_KEY")


async def fetch_points_of_interest(
    destination: str,
    latitude: float | None,
    longitude: float | None,
    limit: int = 6,
) -> List[PointOfInterest]:
    """Fetch POIs using OpenTripMap, fallback to curated samples."""
    if not OPENTRIPMAP_API_KEY or latitude is None or longitude is None:
        return _fallback_pois(destination)

    params = {
        "apikey": OPENTRIPMAP_API_KEY,
        "lat": latitude,
        "lon": longitude,
        "radius": 5000,
        "limit": limit,
        "rate": 3,
        "format": "json",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.get(
                "https://api.opentripmap.com/0.1/en/places/radius", params=params
            )
            response.raise_for_status()
            items = response.json()
        except Exception:
            return _fallback_pois(destination)

    pois: List[PointOfInterest] = []
    for item in items:
        pois.append(
            PointOfInterest(
                name=item.get("name") or "Landmark",
                category=item.get("kinds", "attraction"),
                description=None,
                latitude=item.get("point", {}).get("lat"),
                longitude=item.get("point", {}).get("lon"),
            )
        )

    return pois or _fallback_pois(destination)


def _fallback_pois(destination: str) -> List[PointOfInterest]:
    return [
        PointOfInterest(
            name=f"{destination} Old Town",
            category="historic",
            description="Cultural heart with cafes and artisan shops.",
        ),
        PointOfInterest(
            name=f"{destination} Riverside Promenade",
            category="outdoor",
            description="Relaxed river walk perfect for sunsets.",
        ),
        PointOfInterest(
            name="Local Sustainability Hub",
            category="experience",
            description="Community project showcasing eco-friendly living.",
        ),
    ]

