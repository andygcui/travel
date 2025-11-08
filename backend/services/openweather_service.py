"""OpenWeather API client for weather forecasts"""
from __future__ import annotations

import os
from datetime import date, timedelta
from typing import List, Optional

import httpx
from dotenv import load_dotenv

from schemas import WeatherForecast

load_dotenv()

OPENWEATHER_KEY = os.getenv("OPENWEATHER_KEY")
OPENWEATHER_BASE_URL = "https://api.openweathermap.org/data/2.5"


async def fetch_weather_openweather(
    latitude: float,
    longitude: float,
    start: date,
    end: date,
) -> List[WeatherForecast]:
    """
    Fetch weather forecast from OpenWeather API.
    Returns daily forecasts for the trip duration.
    """
    if not OPENWEATHER_KEY:
        return _fallback_weather(start, end)
    
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
            forecast_list = data.get("list", [])
            
            # Group by date and get daily min/max
            daily_data: dict = {}
            for item in forecast_list:
                dt = item.get("dt")
                if not dt:
                    continue
                
                forecast_date = date.fromtimestamp(dt)
                if forecast_date < start or forecast_date > end:
                    continue
                
                if forecast_date not in daily_data:
                    daily_data[forecast_date] = {
                        "highs": [],
                        "lows": [],
                        "precip": [],
                        "conditions": [],
                    }
                
                main = item.get("main", {})
                weather = item.get("weather", [{}])[0]
                
                daily_data[forecast_date]["highs"].append(main.get("temp_max", 0))
                daily_data[forecast_date]["lows"].append(main.get("temp_min", 0))
                daily_data[forecast_date]["precip"].append(
                    item.get("rain", {}).get("3h", 0) or item.get("snow", {}).get("3h", 0)
                )
                daily_data[forecast_date]["conditions"].append(weather.get("main", "Clear"))
            
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
                
                current += timedelta(days=1)
            
            return forecasts if forecasts else _fallback_weather(start, end)
        except Exception:
            return _fallback_weather(start, end)


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

