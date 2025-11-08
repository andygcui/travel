# tools_travel.py
# Dedalus-friendly sync tools (simple functions with type hints + docstrings).
# Light HTTP clients with retries. Env-based config. No external SDKs required.

import os
import json
import time
import math
import random
from typing import Any, Dict, List, Optional, Tuple
import requests

AMAD_AUTH_URL = "https://test.api.amadeus.com/v1/security/oauth2/token"
AMAD_FLIGHTS_URL = "https://test.api.amadeus.com/v2/shopping/flight-offers"
OPENMETEO_GEO = "https://geocoding-api.open-meteo.com/v1/search"
OPENMETEO_FC = "https://api.open-meteo.com/v1/forecast"
BRAVE_WEB = "https://api.search.brave.com/res/v1/web/search"
CLIM_Batch = "https://api.climatiq.io/estimate/batch"

# ---------------- basics ----------------

def _retry_http(method: str, url: str, **kwargs) -> requests.Response:
    """Tiny retry wrapper for flaky calls."""
    tries, delay = 3, 0.6
    for attempt in range(1, tries + 1):
        try:
            r = requests.request(method, url, timeout=20, **kwargs)
            r.raise_for_status()
            return r
        except requests.RequestException as e:
            if attempt == tries:
                raise
            time.sleep(delay)
            delay *= 1.8

def parse_user_prefs(text: str) -> Dict[str, Any]:
    """Extract a JSON block of preferences from user text. Returns normalized dict."""
    try:
        start = text.index("{")
        end = text.rindex("}") + 1
        prefs = json.loads(text[start:end])
    except Exception:
        # minimal fallback
        prefs = {}

    # Normalize + defaults
    prefs.setdefault("pax", 1)
    prefs.setdefault("cabin", "eco")
    prefs.setdefault("currency", "USD")
    prefs.setdefault("likes", [])
    prefs.setdefault("dislikes", [])
    prefs.setdefault("eco_weight", 0.0)
    prefs.setdefault("pace", "balanced")
    return prefs

# ---------------- Amadeus flights ----------------

def _amadeus_token() -> str:
    key = os.getenv("AMADEUS_KEY")
    sec = os.getenv("AMADEUS_SECRET")
    if not key or not sec:
        raise RuntimeError("Missing AMADEUS_KEY / AMADEUS_SECRET")
    r = _retry_http(
        "POST",
        AMAD_AUTH_URL,
        data={
            "grant_type": "client_credentials",
            "client_id": key,
            "client_secret": sec,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    return r.json().get("access_token", "")

def search_flights_amadeus(
    origin: str,
    destination: str,
    start_date: str,
    end_date: str,
    pax: int = 1,
    cabin: str = "eco",
    currency: str = "USD",
) -> Dict[str, Any]:
    """
    Search round-trip flight offers via Amadeus (test env).
    Returns a compact list sorted by price, then stops.
    """
    token = _amadeus_token()
    params = {
        "originLocationCode": origin,
        "destinationLocationCode": destination,
        "departureDate": start_date,
        "returnDate": end_date,
        "adults": pax,
        "currencyCode": currency,
        "max": 5,
    }
    if cabin and cabin.lower() != "eco":
        params["travelClass"] = cabin.upper()

    r = _retry_http(
        "GET",
        AMAD_FLIGHTS_URL,
        params=params,
        headers={"Authorization": f"Bearer {token}"},
    )
    data = r.json()
    results: List[Dict[str, Any]] = []
    for offer in data.get("data", [])[:5]:
        price = float(offer["price"]["grandTotal"])
        segments: List[Dict[str, Any]] = []
        stops = 0
        for itin in offer.get("itineraries", []):
            segs = itin.get("segments", [])
            stops += max(0, len(segs) - 1)
            for s in segs:
                segments.append(
                    {
                        "origin": s["departure"]["iataCode"],
                        "destination": s["arrival"]["iataCode"],
                        "carrier": s["carrierCode"],
                        "number": s.get("number"),
                        "duration": s.get("duration"),
                        # distance_km can be computed later; keep None for now
                    }
                )
        results.append(
            {
                "id": offer.get("id"),
                "price": price,
                "currency": currency,
                "segments": segments,
                "stops": stops,
            }
        )
    results.sort(key=lambda x: (x["price"], x["stops"]))
    return {"results": results}

# ---------------- Climatiq CO2 ----------------

def estimate_co2_climatiq(segments: List[Dict[str, Any]], pax: int = 1) -> Dict[str, Any]:
    """
    Estimate CO₂ with Climatiq batch endpoint if CLIMATIQ_KEY exists.
    Fallback heuristic if no key or distances unknown.
    Heuristic: 90 kg CO₂ per 1000 km per pax; if distance unknown, assume 6000 km for TATL-like legs.
    """
    key = os.getenv("CLIMATIQ_KEY")
    # prepare legs with a distance guess if missing
    items = []
    total_km = 0.0
    for seg in segments:
        km = float(seg.get("distance_km") or 0.0)
        if km <= 0:
            # rough guess if intercontinental unknown
            km = 6000.0
        total_km += km
        items.append(
            {
                "emission_factor": {
                    "activity_id": "passenger_flight-route_distance_short_haul"
                    if km < 1500
                    else "passenger_flight-route_distance_long_haul"
                },
                "parameters": {"passengers": pax, "distance": km, "distance_unit": "km"},
            }
        )

    if not key:
        co2 = (total_km / 1000.0) * 90.0 * max(pax, 1)
        return {"co2_kg": round(co2, 1), "source": "heuristic_no_key"}

    r = _retry_http(
        "POST",
        CLIM_Batch,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={"estimates": items},
    )
    js = r.json()
    total = sum(est.get("co2e", 0.0) for est in js.get("results", []))
    return {"co2_kg": round(total, 1), "source": "climatiq"}

# ---------------- Open-Meteo ----------------

def get_weather_openmeteo(city: str, start_date: str, end_date: str) -> Dict[str, Any]:
    """
    Geocode city then fetch daily temps + precip for date range.
    """
    g = _retry_http("GET", OPENMETEO_GEO, params={"name": city, "count": 1}).json()
    if not g.get("results"):
        return {"city": city, "daily": []}
    lat = g["results"][0]["latitude"]
    lon = g["results"][0]["longitude"]

    w = _retry_http(
        "GET",
        OPENMETEO_FC,
        params={
            "latitude": lat,
            "longitude": lon,
            "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum",
            "start_date": start_date,
            "end_date": end_date,
            "timezone": "auto",
        },
    ).json()

    daily = []
    times = w.get("daily", {}).get("time", []) or []
    tmax = w.get("daily", {}).get("temperature_2m_max", []) or []
    tmin = w.get("daily", {}).get("temperature_2m_min", []) or []
    psum = w.get("daily", {}).get("precipitation_sum", []) or []
    for i in range(min(len(times), len(tmax), len(tmin), len(psum))):
        daily.append({"date": times[i], "t_max": tmax[i], "t_min": tmin[i], "precip_mm": psum[i]})
    return {"city": city, "daily": daily}

# ---------------- Brave POIs ----------------

def search_pois_brave(city: str, likes: List[str], dislikes: List[str]) -> Dict[str, Any]:
    """
    Pragmatic POI finder via Brave web search.
    If BRAVE_KEY missing, return a sensible seed so the itinerary still works.
    """
    key = os.getenv("BRAVE_KEY")
    if not key:
        seeds = [
            {"title": f"{city} City Museum", "type": "museum"},
            {"title": f"{city} Old Town Walk", "type": "walk"},
            {"title": f"{city} Famous Bakery", "type": "bakery"},
        ]
        return {
            "grouped_by_theme": [{"theme": "mixed", "items": [s["title"] for s in seeds]}],
            "avg_poi_cost_per_day": 40.0,
            "hotel_price_hint_per_night": 180.0,
            "walkability": 0.7,
        }

    query_bits = likes[:] if likes else ["top sights", "museums", "parks", "bakeries"]
    q = f"best {', '.join(query_bits)} in {city} official site hours tickets"
    js = _retry_http(
        "GET",
        BRAVE_WEB,
        params={"q": q, "count": 10, "country": "US"},
        headers={"X-Subscription-Token": key},
    ).json()

    items: List[Dict[str, str]] = []
    for w in (js.get("web", {}) or {}).get("results", [])[:10]:
        title = (w.get("title") or "").strip()
        url = w.get("url") or ""
        tl = title.lower()
        t = "poi"
        if "museum" in tl:
            t = "museum"
        elif any(k in tl for k in ["walk", "trail", "park", "garden", "river"]):
            t = "walk"
        elif any(k in tl for k in ["bakery", "patisserie", "boulangerie"]):
            t = "bakery"
        items.append({"title": title, "url": url, "type": t})

    clusters: Dict[str, List[str]] = {}
    for it in items:
        clusters.setdefault(it["type"], []).append(it["title"])

    grouped = [{"theme": k, "items": v} for k, v in clusters.items()]
    walkability = 0.65 if "walk" in clusters else 0.55
    return {
        "grouped_by_theme": grouped or [{"theme": "mixed", "items": [it["title"] for it in items]}],
        "avg_poi_cost_per_day": 45.0,
        "hotel_price_hint_per_night": 190.0,
        "walkability": walkability,
    }

# ---------------- Budget + tips (Capital One track) ----------------

def _pct_save(old: float, new: float) -> int:
    if old <= 0:
        return 0
    return round(100 * (old - new) / old)

def estimate_budget_and_tips(
    currency: str,
    pax: int,
    flight_price: float,
    hotel_estimate_per_night: float,
    nights: int,
    poi_cost_hint_per_day: float,
    eco_weight: float,
) -> Dict[str, Any]:
    """
    Roll up a fast budget and produce actionable saving tips.
    """
    nights = max(1, int(nights))
    base_flights = max(0.0, float(flight_price))
    hotels = max(0.0, float(hotel_estimate_per_night)) * nights
    pois = max(0.0, float(poi_cost_hint_per_day)) * nights
    est_total = base_flights + hotels + pois

    tips: List[str] = []
    bundle_price = base_flights * 0.95 + hotels * 0.97
    tips.append(f"Bundle flight+hotel could save ~{_pct_save(base_flights + hotels, bundle_price)}% on transport+stay.")
    shift_price = base_flights * 0.9
    tips.append(f"Shift departure by ±1 day; fares often drop by ~{_pct_save(base_flights, shift_price)}%.")
    tips.append("Prefer nonstop when feasible—often similar price, lower CO₂, fewer delays.")
    if eco_weight and eco_weight > 0.4:
        tips.append("Use metro/bus over rideshare to cut both cost and emissions.")
    return {
        "currency": currency,
        "est_total": round(est_total, 2),
        "by_day": [{"day": i + 1, "spend_hint": round(poi_cost_hint_per_day, 2)} for i in range(nights)],
        "tips": tips,
        "over_budget": False,
    }
