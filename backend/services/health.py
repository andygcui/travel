from __future__ import annotations

import httpx

from schemas import HealthAdvisory

TRAVEL_HEALTH_API = "https://www.travel-advisory.info/api"


async def fetch_health_advisories(country_code: str | None) -> list[HealthAdvisory]:
    """
    Pull health advisories. Uses travel-advisory.info if ISO2 code provided,
    otherwise returns general guidance.
    """
    if not country_code:
        return _fallback_health()

    params = {"countrycode": country_code.upper()}

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.get(TRAVEL_HEALTH_API, params=params)
            response.raise_for_status()
            payload = response.json()
        except Exception:
            return _fallback_health()

    data = payload.get("data", {}).get(country_code.upper())
    if not data:
        return _fallback_health()

    advisory = data.get("advisory", {})
    return [
        HealthAdvisory(
            title=f"Travel advisory level {advisory.get('score', 'N/A')}",
            description=advisory.get("message", "Exercise normal precautions."),
            severity=_score_to_severity(advisory.get("score", 1)),
            source=advisory.get("source"),
        )
    ]


def _score_to_severity(score: float | int) -> str:
    try:
        value = float(score)
    except (TypeError, ValueError):
        return "medium"
    if value < 2.5:
        return "low"
    if value < 3.5:
        return "medium"
    return "high"


def _fallback_health() -> list[HealthAdvisory]:
    return [
        HealthAdvisory(
            title="Stay hydrated & pack essentials",
            description="Carry a reusable water bottle, basic meds, and travel insurance documentation.",
            severity="low",
            source="GreenTrip AI",
        )
    ]

