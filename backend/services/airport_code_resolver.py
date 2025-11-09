"""Helper to resolve city names to airport IATA codes"""
from __future__ import annotations

import logging
import os
import time
from typing import Optional

import httpx
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Common city to airport code mappings (used as fast-path hints only)
CITY_TO_AIRPORT = {
    "paris": "CDG",
    "paris, france": "CDG",
    "london": "LHR",
    "london, uk": "LHR",
    "london, england": "LHR",
    "new york": "JFK",
    "new york city": "JFK",
    "new york, ny": "JFK",
    "new york, usa": "JFK",
    "los angeles": "LAX",
    "los angeles, ca": "LAX",
    "los angeles, california": "LAX",
    "san francisco": "SFO",
    "san francisco, ca": "SFO",
    "chicago": "ORD",
    "chicago, il": "ORD",
    "chicago, illinois": "ORD",
    "miami": "MIA",
    "miami, fl": "MIA",
    "miami, florida": "MIA",
    "boston": "BOS",
    "boston, ma": "BOS",
    "boston, massachusetts": "BOS",
    "seattle": "SEA",
    "seattle, wa": "SEA",
    "seattle, washington": "SEA",
    "atlanta": "ATL",
    "atlanta, ga": "ATL",
    "atlanta, georgia": "ATL",
    "dallas": "DFW",
    "dallas, tx": "DFW",
    "dallas, texas": "DFW",
    "houston": "IAH",
    "houston, tx": "IAH",
    "houston, texas": "IAH",
    "denver": "DEN",
    "denver, co": "DEN",
    "denver, colorado": "DEN",
    "philadelphia": "PHL",
    "philadelphia, pa": "PHL",
    "philadelphia, pennsylvania": "PHL",
    "phoenix": "PHX",
    "phoenix, az": "PHX",
    "phoenix, arizona": "PHX",
    "las vegas": "LAS",
    "las vegas, nv": "LAS",
    "las vegas, nevada": "LAS",
    "detroit": "DTW",
    "detroit, mi": "DTW",
    "detroit, michigan": "DTW",
    "minneapolis": "MSP",
    "minneapolis, mn": "MSP",
    "minneapolis, minnesota": "MSP",
    "portland": "PDX",
    "portland, or": "PDX",
    "portland, oregon": "PDX",
    "washington": "DCA",
    "washington dc": "DCA",
    "washington, dc": "DCA",
    "baltimore": "BWI",
    "baltimore, md": "BWI",
    "baltimore, maryland": "BWI",
    "tokyo": "NRT",
    "tokyo, japan": "NRT",
    "beijing": "PEK",
    "beijing, china": "PEK",
    "shanghai": "PVG",
    "shanghai, china": "PVG",
    "mumbai": "BOM",
    "mumbai, india": "BOM",
    "dubai": "DXB",
    "dubai, uae": "DXB",
    "sydney": "SYD",
    "sydney, australia": "SYD",
    "rome": "FCO",
    "rome, italy": "FCO",
    "barcelona": "BCN",
    "barcelona, spain": "BCN",
    "amsterdam": "AMS",
    "amsterdam, netherlands": "AMS",
    "berlin": "BER",
    "berlin, germany": "BER",
    "madrid": "MAD",
    "madrid, spain": "MAD",
    "singapore": "SIN",
    "singapore, singapore": "SIN",
    "hong kong": "HKG",
    "hong kong, china": "HKG",
    "bangkok": "BKK",
    "bangkok, thailand": "BKK",
    "seoul": "ICN",
    "seoul, south korea": "ICN",
    "istanbul": "IST",
    "istanbul, turkey": "IST",
    "moscow": "SVO",
    "moscow, russia": "SVO",
    "cairo": "CAI",
    "cairo, egypt": "CAI",
    "dublin": "DUB",
    "dublin, ireland": "DUB",
    "vienna": "VIE",
    "vienna, austria": "VIE",
    "prague": "PRG",
    "prague, czech republic": "PRG",
    "lisbon": "LIS",
    "lisbon, portugal": "LIS",
    "athens": "ATH",
    "athens, greece": "ATH",
    "warsaw": "WAW",
    "warsaw, poland": "WAW",
    "stockholm": "ARN",
    "stockholm, sweden": "ARN",
    "copenhagen": "CPH",
    "copenhagen, denmark": "CPH",
    "oslo": "OSL",
    "oslo, norway": "OSL",
    "helsinki": "HEL",
    "helsinki, finland": "HEL",
    "brussels": "BRU",
    "brussels, belgium": "BRU",
    "zurich": "ZRH",
    "zurich, switzerland": "ZRH",
    "geneva": "GVA",
    "geneva, switzerland": "GVA",
    "frankfurt": "FRA",
    "frankfurt, germany": "FRA",
    "munich": "MUC",
    "munich, germany": "MUC",
    "milan": "MXP",
    "milan, italy": "MXP",
    "venice": "VCE",
    "venice, italy": "VCE",
    "florence": "FLR",
    "florence, italy": "FLR",
    "naples": "NAP",
    "naples, italy": "NAP",
    "porto": "OPO",
    "porto, portugal": "OPO",
    "edinburgh": "EDI",
    "edinburgh, scotland": "EDI",
    "glasgow": "GLA",
    "glasgow, scotland": "GLA",
    "manchester": "MAN",
    "manchester, uk": "MAN",
    "birmingham": "BHX",
    "birmingham, uk": "BHX",
    "bristol": "BRS",
    "bristol, uk": "BRS",
    "newcastle": "NCL",
    "newcastle, uk": "NCL",
    "liverpool": "LPL",
    "liverpool, uk": "LPL",
    "leeds": "LBA",
    "leeds, uk": "LBA",
    "nottingham": "EMA",
    "nottingham, uk": "EMA",
    "sheffield": "DSA",
    "sheffield, uk": "DSA",
    "cardiff": "CWL",
    "cardiff, wales": "CWL",
    "belfast": "BFS",
    "belfast, northern ireland": "BFS",
    "dublin": "DUB",
    "dublin, ireland": "DUB",
    "cork": "ORK",
    "cork, ireland": "ORK",
    "shannon": "SNN",
    "shannon, ireland": "SNN",
    "reykjavik": "KEF",
    "reykjavik, iceland": "KEF",
    "tallinn": "TLL",
    "tallinn, estonia": "TLL",
    "riga": "RIX",
    "riga, latvia": "RIX",
    "vilnius": "VNO",
    "vilnius, lithuania": "VNO",
    "bucharest": "OTP",
    "bucharest, romania": "OTP",
    "budapest": "BUD",
    "budapest, hungary": "BUD",
    "zagreb": "ZAG",
    "zagreb, croatia": "ZAG",
    "ljubljana": "LJU",
    "ljubljana, slovenia": "LJU",
    "bratislava": "BTS",
    "bratislava, slovakia": "BTS",
    "sofia": "SOF",
    "sofia, bulgaria": "SOF",
    "belgrade": "BEG",
    "belgrade, serbia": "BEG",
    "sarajevo": "SJJ",
    "sarajevo, bosnia": "SJJ",
    "skopje": "SKP",
    "skopje, macedonia": "SKP",
    "tirana": "TIA",
    "tirana, albania": "TIA",
    "podgorica": "TGD",
    "podgorica, montenegro": "TGD",
    "nicosia": "LCA",
    "nicosia, cyprus": "LCA",
    "valletta": "MLA",
    "valletta, malta": "MLA",
    "luxembourg": "LUX",
    "luxembourg, luxembourg": "LUX",
    "monaco": "NCE",
    "monaco, monaco": "NCE",
    "andorra": "LEU",
    "andorra, andorra": "LEU",
    "san marino": "RMI",
    "san marino, san marino": "RMI",
    "vatican": "FCO",
    "vatican city": "FCO",
    "liechtenstein": "ZRH",
    "liechtenstein, liechtenstein": "ZRH",
}

AMADEUS_API_KEY = os.getenv("AMADEUS_API_KEY")
AMADEUS_API_SECRET = os.getenv("AMADEUS_API_SECRET")
AMADEUS_ENV = os.getenv("AMADEUS_ENV", "test").lower()
AMADEUS_BASE_URL = (
    "https://api.amadeus.com" if AMADEUS_ENV == "live" else "https://test.api.amadeus.com"
)

_token_cache: dict[str, tuple[str, float]] = {}


def _get_amadeus_token_sync() -> Optional[str]:
    """Fetch (and cache) an Amadeus OAuth token for synchronous use."""
    if not AMADEUS_API_KEY or not AMADEUS_API_SECRET:
        logger.warning("Amadeus credentials missing; cannot resolve airport via API")
        return None

    token_entry = _token_cache.get("token")
    if token_entry:
        token, expires_at = token_entry
        if time.time() < expires_at - 30:  # refresh a little early
            return token

    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.post(
                f"{AMADEUS_BASE_URL}/v1/security/oauth2/token",
                data={
                    "grant_type": "client_credentials",
                    "client_id": AMADEUS_API_KEY,
                    "client_secret": AMADEUS_API_SECRET,
                },
            )
            response.raise_for_status()
            payload = response.json()
            token = payload.get("access_token")
            expires_in = payload.get("expires_in", 1800)
            if token:
                _token_cache["token"] = (token, time.time() + int(expires_in))
                return token
    except Exception as exc:
        logger.warning("Failed to fetch Amadeus token: %s", exc)
    return None


def _lookup_airport_by_keyword(city_name: str) -> Optional[str]:
    token = _get_amadeus_token_sync()
    if not token:
        return None

    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.get(
                f"{AMADEUS_BASE_URL}/v1/reference-data/locations",
                headers={"Authorization": f"Bearer {token}"},
                params={
                    "subType": "AIRPORT",
                    "keyword": city_name,
                    "page[limit]": 5,
                    "view": "FULL",
                },
            )
            response.raise_for_status()
            data = response.json()
            for entry in data.get("data", []):
                code = entry.get("iataCode")
                if code:
                    logger.info("Resolved '%s' to airport code '%s' via Amadeus keyword search", city_name, code)
                    return code.upper()
    except httpx.HTTPStatusError as exc:
        logger.warning("Amadeus keyword lookup failed for '%s': %s", city_name, exc.response.text)
    except Exception as exc:
        logger.warning("Amadeus keyword lookup error for '%s': %s", city_name, exc)
    return None


def _lookup_airport_by_coordinates(latitude: float, longitude: float) -> Optional[str]:
    token = _get_amadeus_token_sync()
    if not token:
        return None

    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.get(
                f"{AMADEUS_BASE_URL}/v1/reference-data/locations/airports",
                headers={"Authorization": f"Bearer {token}"},
                params={
                    "latitude": latitude,
                    "longitude": longitude,
                    "radius": 200,  # kilometers
                    "page[limit]": 5,
                },
            )
            response.raise_for_status()
            data = response.json()
            for entry in data.get("data", []):
                code = entry.get("iataCode")
                if code:
                    logger.info(
                        "Resolved coordinates (%s, %s) to airport code '%s' via Amadeus geosearch",
                        latitude,
                        longitude,
                        code,
                    )
                    return code.upper()
    except httpx.HTTPStatusError as exc:
        logger.warning(
            "Amadeus coordinate lookup failed (%s, %s): %s",
            latitude,
            longitude,
            exc.response.text,
        )
    except Exception as exc:
        logger.warning("Amadeus coordinate lookup error (%s, %s): %s", latitude, longitude, exc)
    return None


def resolve_airport_code(city_name: str, latitude: Optional[float] = None, longitude: Optional[float] = None) -> Optional[str]:
    """
    Resolve a city name to an IATA airport code.
    Returns None if not found.
    """
    city_lower = city_name.lower().strip()
    
    # Direct lookup
    if city_lower in CITY_TO_AIRPORT:
        code = CITY_TO_AIRPORT[city_lower]
        logger.info(f"Resolved '{city_name}' to airport code '{code}'")
        return code
    
    # Try without country/state qualifiers
    city_only = city_lower.split(",")[0].strip()
    if city_only in CITY_TO_AIRPORT:
        code = CITY_TO_AIRPORT[city_only]
        logger.info(f"Resolved '{city_name}' to airport code '{code}'")
        return code

    # Try Amadeus keyword search
    code = _lookup_airport_by_keyword(city_name)
    if code:
        return code

    # Try Amadeus geosearch when coordinates are available
    if latitude is not None and longitude is not None:
        code = _lookup_airport_by_coordinates(latitude, longitude)
        if code:
            return code

    logger.warning(f"Could not resolve airport code for '{city_name}'")
    return None

