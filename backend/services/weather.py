from __future__ import annotations

from datetime import date, timedelta
from typing import List, Optional

import httpx

from ..schemas import WeatherForecast


async def fetch_weather_forecast(
    latitude: Optional[float],
    longitude: Optional[float],
    start: date,
    end: date,
) -> List[WeatherForecast]:
    """Query Open-Meteo for a daily forecast. Returns sample data if lat/lon missing."""
    if latitude is None or longitude is None:
        return _fallback_weather(start, end)

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "daily": ["weathercode", "temperature_2m_max", "temperature_2m_min", "precipitation_probability_max"],
        "timezone": "auto",
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.get("https://api.open-meteo.com/v1/forecast", params=params)
            response.raise_for_status()
            payload = response.json()
        except Exception:
            return _fallback_weather(start, end)

    daily = payload.get("daily", {})
    dates = daily.get("time", [])
    highs = daily.get("temperature_2m_max", [])
    lows = daily.get("temperature_2m_min", [])
    precipitation = daily.get("precipitation_probability_max", [])

    forecast: List[WeatherForecast] = []
    for idx, day_str in enumerate(dates):
        try:
            day = date.fromisoformat(day_str)
        except ValueError:
            continue

        summary = _summarize_weather(
            precipitation[idx] if idx < len(precipitation) else 0,
            highs[idx] if idx < len(highs) else 0,
        )
        forecast.append(
            WeatherForecast(
                date=day,
                summary=summary,
                temperature_high_c=highs[idx] if idx < len(highs) else 0,
                temperature_low_c=lows[idx] if idx < len(lows) else 0,
                precipitation_probability=(
                    (precipitation[idx] or 0) / 100 if idx < len(precipitation) else 0
                ),
            )
        )
    return forecast


def _summarize_weather(precip_probability: float, high: float) -> str:
    if precip_probability > 70:
        return "Likely rain showers"
    if precip_probability > 30:
        return "Chance of light rain"
    if high >= 30:
        return "Hot and sunny"
    if high <= 5:
        return "Cold conditions"
    return "Pleasant weather"


def _fallback_weather(start: date, end: date) -> List[WeatherForecast]:
    days = (end - start).days + 1
    fallback: List[WeatherForecast] = []
    for offset in range(max(days, 3)):
        current = start + timedelta(days=offset)
        fallback.append(
            WeatherForecast(
                date=current,
                summary="Data unavailable, assume mild weather",
                temperature_high_c=22,
                temperature_low_c=14,
                precipitation_probability=0.2,
            )
        )
    return fallback

