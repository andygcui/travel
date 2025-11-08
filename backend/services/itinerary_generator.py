"""Main service for generating GreenTrip itineraries"""
from __future__ import annotations

import logging
import os
from datetime import date, timedelta
from typing import List, Optional, Tuple

from schemas import (
    DayWeather,
    DaypartWeather,
    DedalusItineraryDay,
    FlightOption,
    GreenTripFlightOption,
    GreenTripItineraryResponse,
    ItineraryGenerationRequest,
    LodgingOption,
    PointOfInterest,
    WeatherForecast,
)

from . import (
    amadeus_flights,
    amadeus_hotels,
    airport_code_resolver,
    climatiq_service,
    dedalus_client,
    google_places_service,
    openweather_service,
    prompt_builder,
)

logger = logging.getLogger(__name__)


async def generate_itinerary(request: ItineraryGenerationRequest) -> GreenTripItineraryResponse:
    """
    Main function to generate a GreenTrip itinerary.
    
    1. Geocode destination
    2. Fetch flights, hotels, weather, attractions
    3. Estimate emissions if missing
    4. Build prompt and call Dedalus
    5. Return formatted response
    """
    # Normalise dates and duration
    start_date, end_date, trip_days = _resolve_trip_dates(request)
    normalized_request = request.copy(
        update={
            "start_date": start_date,
            "end_date": end_date,
            "num_days": trip_days,
        }
    )

    # Step 1: Geocode destination
    logger.info(f"Geocoding destination: {request.destination}")
    latitude, longitude = await google_places_service.geocode_destination(request.destination)
    
    if not latitude or not longitude:
        logger.warning(f"Could not geocode {request.destination}, attempting fallback coordinates")
        fallback_coords = {
            "paris": (48.8566, 2.3522),
            "paris, france": (48.8566, 2.3522),
            "new york": (40.7128, -74.0060),
            "new york, usa": (40.7128, -74.0060),
            "london": (51.5074, -0.1278),
            "tokyo": (35.6762, 139.6503),
            "rome": (41.9028, 12.4964),
        }
        dest_lower = request.destination.lower()
        if dest_lower in fallback_coords:
            latitude, longitude = fallback_coords[dest_lower]
            logger.info(f"Using fallback coordinates for {request.destination}: ({latitude}, {longitude})")
        else:
            if GOOGLE_PLACES_KEY := os.getenv("GOOGLE_PLACES_KEY"):
                logger.warning(f"Unknown destination '{request.destination}', defaulting to Paris coordinates")
            else:
                logger.warning(
                    "GOOGLE_PLACES_KEY is not set; please add it to backend/.env to enable accurate geocoding."
                )
            latitude, longitude = 48.8566, 2.3522
    
    logger.info(f"Geocoded to: {latitude}, {longitude}")
    
    # Step 3: Fetch data in parallel
    # Resolve origin to airport code
    origin_input = request.origin or "New York"  # Default to New York if not provided
    origin_code = airport_code_resolver.resolve_airport_code(origin_input)
    if not origin_code:
        logger.warning(f"Could not resolve airport code for origin '{origin_input}', using 'JFK' as default")
        origin_code = "JFK"  # Fallback to JFK
    
    # Convert destination city name to airport code for Amadeus
    destination_code = airport_code_resolver.resolve_airport_code(request.destination)
    if not destination_code:
        logger.warning(f"Could not resolve airport code for '{request.destination}', will use city name (may fail)")
        destination_code = request.destination
    
    # Fetch flights
    logger.info(f"Fetching flights from {origin_code} ({origin_input}) to {destination_code} ({request.destination})")
    flights = await amadeus_flights.fetch_flights_amadeus(
        origin=origin_code,
        destination=destination_code,
        departure_date=start_date.isoformat(),
        return_date=end_date.isoformat(),
        adults=1,
    )
    logger.info(f"Found {len(flights)} flight options")
    
    # Fetch hotels
    logger.info(f"Fetching hotels near {latitude}, {longitude}")
    hotels = await amadeus_hotels.fetch_hotels_amadeus(
        latitude=latitude,
        longitude=longitude,
        check_in=start_date.isoformat(),
        check_out=end_date.isoformat(),
        adults=1,
    )
    logger.info(f"Found {len(hotels)} hotel options")
    
    # Fetch weather
    logger.info(f"Fetching weather forecast")
    weather_daily, daypart_weather = await openweather_service.fetch_weather_openweather(
        latitude=latitude,
        longitude=longitude,
        start=start_date,
        end=end_date,
    )
    logger.info(f"Got {len(weather_daily)} days of weather data")
    
    # Fetch attractions
    logger.info(f"Fetching attractions for preferences: {request.preferences}")
    attractions = await google_places_service.fetch_attractions_google(
        destination=request.destination,
        latitude=latitude,
        longitude=longitude,
        preferences=request.preferences,
        limit=5,
    )
    logger.info(f"Found {len(attractions)} attractions")
    
    # Step 4: Estimate emissions if missing
    for flight in flights:
        if not flight.emissions_kg:
            # Try Climatiq, fallback to estimation
            emissions = await climatiq_service.estimate_flight_emissions(
                origin=origin_code,
                destination=destination_code,
                passengers=1,
            )
            if emissions:
                flight.emissions_kg = emissions
            else:
                flight.emissions_kg = climatiq_service.estimate_flight_emissions_fallback(
                    origin_code, destination_code, 1
                )
    
    for hotel in hotels:
        if not hotel.emissions_kg:
            emissions = await climatiq_service.estimate_hotel_emissions(
                nights=trip_days,
            )
            if emissions:
                hotel.emissions_kg = emissions / trip_days  # Per night
            else:
                hotel.emissions_kg = climatiq_service.estimate_hotel_emissions_fallback(
                    trip_days
                ) / trip_days
    
    # Step 5: Build prompt and call Dedalus
    logger.info("Building Dedalus prompt...")
    prompt = prompt_builder.build_dedalus_prompt(
        destination=request.destination,
        num_days=trip_days,
        budget=request.budget,
        preferences=request.preferences,
        mode=request.mode,
        flights=flights,
        hotels=hotels,
        attractions=attractions,
        weather=weather_daily,
        likes=request.likes or [],
        dislikes=request.dislikes or [],
        dietary_restrictions=request.dietary_restrictions or [],
    )
    
    # Call Dedalus
    logger.info("Calling Dedalus API...")
    try:
        dedalus_response = await dedalus_client.call_dedalus(prompt, max_steps=10)
        logger.info(f"Dedalus response received: {type(dedalus_response)}")
        logger.info(f"Dedalus returned {len(dedalus_response.get('days', []))} days")
    except Exception as e:
        logger.error(f"Dedalus API error: {str(e)}")
        logger.warning("Falling back to basic itinerary")
        # Fallback: return a basic itinerary
        return _fallback_itinerary(normalized_request, flights, hotels, start_date, end_date, weather_daily, daypart_weather)
    
    # Step 6: Parse and format response
    days = dedalus_response.get("days", [])
    totals = dedalus_response.get("totals", {"cost": 0, "emissions_kg": 0})
    rationale = dedalus_response.get("rationale", "Itinerary generated based on available data.")
    
    # Convert days to DedalusItineraryDay format
    itinerary_days: List[DedalusItineraryDay] = []
    for day_data in days:
        itinerary_days.append(
            DedalusItineraryDay(
                day=day_data.get("day", len(itinerary_days) + 1),
                morning=day_data.get("morning", ""),
                afternoon=day_data.get("afternoon", ""),
                evening=day_data.get("evening", ""),
            )
        )
    
    # Calculate eco score (0-100)
    total_emissions = totals.get("emissions_kg", 0)
    eco_score = max(0, 100 - (total_emissions / 10))  # Simple scoring: lower emissions = higher score

    flight_summaries = _summarize_flights(flights)
    
    logger.info(f"✅ Itinerary generation complete!")
    logger.info(f"   - {len(itinerary_days)} days generated")
    logger.info(f"   - Total cost: ${totals.get('cost', 0):.2f}")
    logger.info(f"   - Total emissions: {total_emissions:.1f} kg CO₂")
    logger.info(f"   - Eco score: {eco_score:.0f}/100")
    
    return GreenTripItineraryResponse(
        destination=request.destination,
        start_date=start_date,
        end_date=end_date,
        num_days=trip_days,
        budget=request.budget,
        mode=request.mode,
        days=itinerary_days,
        totals=totals,
        rationale=rationale,
        eco_score=eco_score,
        flights=flight_summaries,
        day_weather=daypart_weather,
    )


def _fallback_itinerary(
    request: ItineraryGenerationRequest,
    flights: List[FlightOption],
    hotels: List[LodgingOption],
    start_date: date,
    end_date: date,
    weather_daily: List[WeatherForecast],
    daypart_weather: List[DayWeather],
) -> GreenTripItineraryResponse:
    """Fallback itinerary when Dedalus is unavailable"""
    days = []
    for i in range(1, (request.num_days or 1) + 1):
        days.append(
            DedalusItineraryDay(
                day=i,
                morning=f"Explore {request.destination} - morning activities",
                afternoon=f"Visit local attractions - afternoon activities",
                evening=f"Enjoy local cuisine and culture - evening activities",
            )
        )
    
    nights = request.num_days or 1
    total_cost = (flights[0].price if flights else 0) + (
        (hotels[0].nightly_rate * nights) if hotels else 0
    )
    total_emissions = (flights[0].emissions_kg if flights and flights[0].emissions_kg else 200) + (
        (hotels[0].emissions_kg * nights) if hotels and hotels[0].emissions_kg else 15 * nights
    )
    
    return GreenTripItineraryResponse(
        destination=request.destination,
        start_date=start_date,
        end_date=end_date,
        num_days=request.num_days or nights,
        budget=request.budget,
        mode=request.mode,
        days=days,
        totals={"cost": total_cost, "emissions_kg": total_emissions},
        rationale="Fallback itinerary generated due to API unavailability.",
        eco_score=max(0, 100 - (total_emissions / 10)),
        flights=_summarize_flights(flights),
        day_weather=daypart_weather or _fallback_daypart_weather_list(start_date, end_date),
    )


def _resolve_trip_dates(request: ItineraryGenerationRequest) -> Tuple[date, date, int]:
    today = date.today()
    start = request.start_date or (today + timedelta(days=30))
    if request.end_date:
        end = request.end_date
    else:
        fallback_days = request.num_days or 5
        end = start + timedelta(days=fallback_days - 1)

    if end < start:
        end = start

    trip_days = max(1, (end - start).days + 1)
    return start, end, trip_days


def _compute_flight_eco_score(emissions_kg: Optional[float]) -> Optional[float]:
    if emissions_kg is None:
        return None
    return max(0.0, min(100.0, 100.0 - emissions_kg))


def _summarize_flights(flights: List[FlightOption]) -> List[GreenTripFlightOption]:
    summaries: List[GreenTripFlightOption] = []
    for option in flights:
        if not option.segments:
            continue
        first_segment = option.segments[0]
        last_segment = option.segments[-1]
        carrier = first_segment.carrier or "Carrier"
        summaries.append(
            GreenTripFlightOption(
                id=option.id,
                carrier=carrier,
                origin=first_segment.origin,
                destination=last_segment.destination,
                departure=first_segment.departure,
                arrival=last_segment.arrival,
                price=option.price,
                currency=option.currency,
                eco_score=_compute_flight_eco_score(option.emissions_kg),
                emissions_kg=option.emissions_kg,
            )
        )
    return summaries


def _fallback_daypart_weather_list(start: date, end: date) -> List[DayWeather]:
    current = start
    results: List[DayWeather] = []
    while current <= end:
        fallback_slice = DaypartWeather(
            summary="Mild conditions",
            temperature_c=20,
            precipitation_probability=0.2,
        )
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

