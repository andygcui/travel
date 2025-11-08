"""OpenWeather API client for weather forecasts"""
from __future__ import annotations

import os
from datetime import date, timedelta
from collections import Counter
from typing import Dict, List, Optional, Tuple

import httpx
from dotenv import load_dotenv

from schemas import DayWeather, DaypartWeather, WeatherForecast

load_dotenv()

OPENWEATHER_KEY = os.getenv("OPENWEATHER_KEY")
OPENWEATHER_BASE_URL = "https://api.openweathermap.org/data/2.5"


async def fetch_weather_openweather(
    latitude: float,
    longitude: float,
    start: date,
    end: date,
) -> Tuple[List[WeatherForecast], List[DayWeather]]:
    """
    Fetch weather forecast from OpenWeather API.
    Returns daily forecasts for the trip duration.
    """
    if not OPENWEATHER_KEY:
        return _fallback_weather(start, end), _fallback_daypart_weather(start, end)
    
    # OpenWeather 5-day forecast endpoint
    params = {
        "lat": latitude,
        "lon": longitude,
        "appid": OPENWEATHER_KEY,
        "units": "metric",
    }
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.get(
                f"{OPENWEATHER_BASE_URL}/forecast",
                params=params,
            )
            response.raise_for_status()
            data = response.json()
            
            forecasts: List[WeatherForecast] = []
            daypart_results: List[DayWeather] = []
            forecast_list = data.get("list", [])
            
            # Group by date and get daily min/max and dayparts
            daily_data: Dict[date, Dict[str, List]] = {}
            daypart_entries: Dict[date, Dict[str, List[dict]]] = {}
            for item in forecast_list:
                dt = item.get("dt")
                if not dt:
                    continue
                
                forecast_date = date.fromtimestamp(dt)
                if forecast_date < start or forecast_date > end:
                    continue
                
                daily_data.setdefault(
                    forecast_date,
                    {"highs": [], "lows": [], "precip": [], "conditions": []},
                )
                daypart_entries.setdefault(
                    forecast_date,
                    {"morning": [], "afternoon": [], "evening": []},
                )

                main = item.get("main", {})
                weather = item.get("weather", [{}])[0]
                pop = item.get("pop", 0.0) or 0.0
                
                daily_data[forecast_date]["highs"].append(main.get("temp_max", 0))
                daily_data[forecast_date]["lows"].append(main.get("temp_min", 0))
                daily_data[forecast_date]["precip"].append(
                    item.get("rain", {}).get("3h", 0) or item.get("snow", {}).get("3h", 0)
                )
                daily_data[forecast_date]["conditions"].append(weather.get("main", "Clear"))

                hour = int(item.get("dt_txt", "00").split(" ")[1].split(":")[0])
                if 6 <= hour < 12:
                    label = "morning"
                elif 12 <= hour < 18:
                    label = "afternoon"
                else:
                    label = "evening"
                daypart_entries[forecast_date][label].append(
                    {
                        "temp": main.get("temp"),
                        "condition": weather.get("description", weather.get("main", "Clear")),
                        "pop": pop,
                    }
                )
            
            # Create forecasts for each day
            current = start
            while current <= end:
                if current in daily_data:
                    day_data = daily_data[current]
                    high = max(day_data["highs"]) if day_data["highs"] else 20
                    low = min(day_data["lows"]) if day_data["lows"] else 10
                    precip = sum(day_data["precip"]) / len(day_data["precip"]) if day_data["precip"] else 0
                    condition = day_data["conditions"][0] if day_data["conditions"] else "Clear"
                    
                    summary = _summarize_weather(condition, precip, high)
                    forecasts.append(
                        WeatherForecast(
                            date=current,
                            summary=summary,
                            temperature_high_c=high,
                            temperature_low_c=low,
                            precipitation_probability=min(precip / 10.0, 1.0),
                        )
                    )

                    dayparts = daypart_entries.get(current, {})
                    daypart_results.append(
                        DayWeather(
                            date=current,
                            morning=_build_daypart(dayparts.get("morning"), summary, (high + low) / 2),
                            afternoon=_build_daypart(dayparts.get("afternoon"), summary, high - 1),
                            evening=_build_daypart(dayparts.get("evening"), summary, low),
                        )
                    )
                else:
                    # Fallback for missing dates
                    forecasts.append(
                        WeatherForecast(
                            date=current,
                            summary="Weather data unavailable",
                            temperature_high_c=20,
                            temperature_low_c=10,
                            precipitation_probability=0.2,
                        )
                    )
                    daypart_results.append(
                        DayWeather(
                            date=current,
                            morning=_fallback_daypart(),
                            afternoon=_fallback_daypart(),
                            evening=_fallback_daypart(),
                        )
                    )
                
                current += timedelta(days=1)
            
            if not forecasts:
                return _fallback_weather(start, end), _fallback_daypart_weather(start, end)

            if not daypart_results:
                daypart_results = _fallback_daypart_weather(start, end)

            return forecasts, daypart_results
        except Exception:
            return _fallback_weather(start, end), _fallback_daypart_weather(start, end)


def _summarize_weather(condition: str, precip: float, high: float) -> str:
    """Summarize weather conditions"""
    if "Rain" in condition or precip > 5:
        return "Rainy conditions expected"
    if "Snow" in condition:
        return "Snow expected"
    if high >= 30:
        return "Hot and sunny"
    if high <= 5:
        return "Cold conditions"
    return "Pleasant weather"


def _fallback_weather(start: date, end: date) -> List[WeatherForecast]:
    """Fallback weather data"""
    forecasts: List[WeatherForecast] = []
    current = start
    while current <= end:
        forecasts.append(
            WeatherForecast(
                date=current,
                summary="Weather data unavailable, assume mild weather",
                temperature_high_c=22,
                temperature_low_c=14,
                precipitation_probability=0.2,
            )
        )
        current += timedelta(days=1)
    return forecasts


def _fallback_daypart() -> DaypartWeather:
    return DaypartWeather(
        summary="Mild conditions",
        temperature_c=20,
        precipitation_probability=0.2,
    )


def _fallback_daypart_weather(start: date, end: date) -> List[DayWeather]:
    results: List[DayWeather] = []
    current = start
    while current <= end:
        fallback_slice = _fallback_daypart()
        results.append(
            DayWeather(
                date=current,
                morning=fallback_slice,
                afternoon=fallback_slice,
                evening=fallback_slice,
            )
        )
        current += timedelta(days=1)
    return results


def _build_daypart(entries: Optional[List[dict]], fallback_summary: str, fallback_temp: float) -> DaypartWeather:
    if not entries:
        return DaypartWeather(
            summary=fallback_summary,
            temperature_c=fallback_temp,
            precipitation_probability=0.2,
        )

    temps = [entry.get("temp", fallback_temp) for entry in entries]
    pops = [entry.get("pop", 0.0) for entry in entries]
    conditions = [entry.get("condition", fallback_summary) for entry in entries]

    avg_temp = sum(temps) / len(temps) if temps else fallback_temp
    avg_pop = sum(pops) / len(pops) if pops else 0.2
    condition = Counter(conditions).most_common(1)[0][0] if conditions else fallback_summary

    return DaypartWeather(
        summary=condition.capitalize(),
        temperature_c=avg_temp,
        precipitation_probability=min(max(avg_pop, 0.0), 1.0),
    )

