"""Climatiq API client for CO₂ emissions estimation"""
from __future__ import annotations

import os
from typing import Optional

import httpx
from dotenv import load_dotenv

load_dotenv()

CLIMATIQ_KEY = os.getenv("CLIMATIQ_KEY")
CLIMATIQ_BASE_URL = "https://beta3.api.climatiq.io"


async def estimate_flight_emissions(
    origin: str,
    destination: str,
    passengers: int = 1,
) -> Optional[float]:
    """
    Estimate CO₂ emissions for a flight using Climatiq API.
    Returns emissions in kg CO₂.
    """
    if not CLIMATIQ_KEY:
        return None
    
    headers = {
        "Authorization": f"Bearer {CLIMATIQ_KEY}",
        "Content-Type": "application/json",
    }
    
    # Use flight activity ID
    payload = {
        "emission_factor": {
            "id": "passenger_flight-route_type_domestic_international-aircraft_type_jet-distance_na-class_na",
        },
        "parameters": {
            "passengers": passengers,
            "distance": None,  # Climatiq can estimate from route
            "route": {
                "origin": origin,
                "destination": destination,
            },
        },
    }
    
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            response = await client.post(
                f"{CLIMATIQ_BASE_URL}/estimate",
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
            
            # Climatiq returns CO2e in kg
            co2e = data.get("co2e", 0)
            return float(co2e) if co2e else None
        except Exception:
            return None


async def estimate_hotel_emissions(
    nights: int,
    hotel_category: str = "mid-range",
) -> Optional[float]:
    """
    Estimate CO₂ emissions for hotel stay.
    Returns total emissions in kg CO₂.
    """
    if not CLIMATIQ_KEY:
        return None
    
    headers = {
        "Authorization": f"Bearer {CLIMATIQ_KEY}",
        "Content-Type": "application/json",
    }
    
    # Use accommodation emission factor
    payload = {
        "emission_factor": {
            "id": "accommodation-hotel",
        },
        "parameters": {
            "number_of_nights": nights,
            "number_of_rooms": 1,
        },
    }
    
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            response = await client.post(
                f"{CLIMATIQ_BASE_URL}/estimate",
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
            
            co2e = data.get("co2e", 0)
            return float(co2e) if co2e else None
        except Exception:
            return None


def estimate_flight_emissions_fallback(
    origin: str,
    destination: str,
    passengers: int = 1,
) -> float:
    """
    Fallback estimation using average values.
    Average flight emits ~0.25 kg CO₂ per km per passenger.
    Rough distance estimation based on route.
    """
    # Very rough estimation - in production, use actual distance calculation
    return 200.0 * passengers  # Conservative estimate


def estimate_hotel_emissions_fallback(nights: int) -> float:
    """Fallback estimation: ~15 kg CO₂ per night"""
    return 15.0 * nights

