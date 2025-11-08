from __future__ import annotations

import os
from typing import Optional, Tuple

import httpx

OPENTRIPMAP_API_KEY = os.getenv("OPENTRIPMAP_API_KEY")


async def resolve_destination(
    destination: str,
) -> Tuple[Optional[float], Optional[float], Optional[str]]:
    """
    Resolve a destination name into latitude, longitude, and an OpenTripMap XID.
    Falls back to None values if the API is unavailable or misconfigured.
    """
    if not OPENTRIPMAP_API_KEY:
        return None, None, None

    params = {
        "apikey": OPENTRIPMAP_API_KEY,
        "name": destination,
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.get(
                "https://api.opentripmap.com/0.1/en/places/geoname", params=params
            )
            response.raise_for_status()
        except Exception:
            return None, None, None

    payload = response.json()
    lat = payload.get("lat")
    lon = payload.get("lon")
    xid = payload.get("osm_id")

    return lat, lon, str(xid) if xid else None

