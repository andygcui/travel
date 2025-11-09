from __future__ import annotations

import os
from typing import List

import httpx

from schemas import (
    ItineraryActivity,
    ItineraryDay,
    PointOfInterest,
    TripPlanRequest,
    WeatherForecast,
)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")


async def generate_itinerary(
    request: TripPlanRequest,
    weather: List[WeatherForecast],
    pois: List[PointOfInterest],
) -> List[ItineraryDay]:
    """Generate a multi-day itinerary via OpenAI, falling back to templated plan."""
    if not OPENAI_API_KEY:
        return _fallback_itinerary(request, pois)

    payload = {
        "model": OPENAI_MODEL,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are GreenTrip AI, an environmentally conscious travel planner. "
                    "Craft detailed, friendly itineraries that include sustainable activity options."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Plan a daily itinerary for a trip to {request.destination} from "
                    f"{request.start_date} to {request.end_date} for {request.travelers} travelers. "
                    f"Budget: ${request.budget}. Prioritize sustainability and traveler preferences: "
                    f"{request.profile.preferences.dict() if request.profile else 'N/A'}. "
                    f"Weather outlook: {[w.dict() for w in weather]}. "
                    f"Points of interest: {[poi.dict() for poi in pois]}."
                ),
            },
        ],
        "response_format": {"type": "json_object"},
    }

    headers = {"Authorization": f"Bearer {OPENAI_API_KEY}"}

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            completion = response.json()
        except Exception:
            return _fallback_itinerary(request, pois)

    try:
        content = completion["choices"][0]["message"]["content"]
        itinerary_json = httpx.Response(200, text=content).json()
        result = []
        for day in itinerary_json.get("days", []):
            activities = [
                ItineraryActivity(
                    time=item.get("time", "09:00"),
                    name=item.get("name"),
                    description=item.get("description"),
                )
                for item in day.get("activities", [])
            ]
            result.append(
                ItineraryDay(
                    date=day.get("date", request.start_date),
                    theme=day.get("theme"),
                    summary=day.get("summary", ""),
                    activities=activities,
                )
            )
        return result or _fallback_itinerary(request, pois)
    except Exception:
        return _fallback_itinerary(request, pois)


def _fallback_itinerary(
    request: TripPlanRequest,
    pois: List[PointOfInterest],
) -> List[ItineraryDay]:
    activities = [
        ItineraryActivity(
            time="10:00",
            name="Guided Welcome Walk",
            description=f"Explore {request.destination}'s historic center with a local guide.",
            poi=pois[0] if pois else None,
        ),
        ItineraryActivity(
            time="13:00",
            name="Farm-to-Table Lunch",
            description="Dine at a locally-owned restaurant supporting sustainable agriculture.",
        ),
        ItineraryActivity(
            time="15:30",
            name="Community Eco-Workshop",
            description="Participate in a sustainability-focused workshop with local artisans.",
            poi=pois[1] if len(pois) > 1 else None,
        ),
        ItineraryActivity(
            time="19:00",
            name="Sunset at Riverside Promenade",
            description="Evening stroll with optional bike rental.",
            poi=pois[2] if len(pois) > 2 else None,
        ),
    ]

    return [
        ItineraryDay(
            date=request.start_date,
            theme="Arrival & Immersion",
            summary="Ease into the city with a balanced mix of culture, cuisine, and sustainability.",
            activities=activities,
        )
    ]

