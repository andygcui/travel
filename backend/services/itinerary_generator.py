"""Main service for generating GreenTrip itineraries"""
from __future__ import annotations

from datetime import date, timedelta
from typing import List

from schemas import (
    DedalusItineraryDay,
    FlightOption,
    GreenTripItineraryResponse,
    ItineraryGenerationRequest,
    LodgingOption,
    PointOfInterest,
    WeatherForecast,
)

from . import (
    amadeus_flights,
    amadeus_hotels,
    climatiq_service,
    dedalus_client,
    google_places_service,
    openweather_service,
    prompt_builder,
)


async def generate_itinerary(request: ItineraryGenerationRequest) -> GreenTripItineraryResponse:
    """
    Main function to generate a GreenTrip itinerary.
    
    1. Geocode destination
    2. Fetch flights, hotels, weather, attractions
    3. Estimate emissions if missing
    4. Build prompt and call Dedalus
    5. Return formatted response
    """
    # Step 1: Geocode destination
    latitude, longitude = await google_places_service.geocode_destination(request.destination)
    
    if not latitude or not longitude:
        # Fallback: use a default location or raise error
        raise ValueError(f"Could not geocode destination: {request.destination}")
    
    # Step 2: Calculate dates (using num_days)
    today = date.today()
    start_date = today + timedelta(days=30)  # Default: 30 days from now
    end_date = start_date + timedelta(days=request.num_days - 1)
    
    # Step 3: Fetch data in parallel
    # For now, use a default origin. In production, add origin to ItineraryGenerationRequest
    origin = "JFK"  # Default origin - TODO: add origin field to request schema
    
    # Fetch flights
    flights = await amadeus_flights.fetch_flights_amadeus(
        origin=origin,
        destination=request.destination,
        departure_date=start_date.isoformat(),
        return_date=end_date.isoformat(),
        adults=1,
    )
    
    # Fetch hotels
    hotels = await amadeus_hotels.fetch_hotels_amadeus(
        latitude=latitude,
        longitude=longitude,
        check_in=start_date.isoformat(),
        check_out=end_date.isoformat(),
        adults=1,
    )
    
    # Fetch weather
    weather = await openweather_service.fetch_weather_openweather(
        latitude=latitude,
        longitude=longitude,
        start=start_date,
        end=end_date,
    )
    
    # Fetch attractions
    attractions = await google_places_service.fetch_attractions_google(
        destination=request.destination,
        latitude=latitude,
        longitude=longitude,
        preferences=request.preferences,
        limit=5,
    )
    
    # Step 4: Estimate emissions if missing
    for flight in flights:
        if not flight.emissions_kg:
            # Try Climatiq, fallback to estimation
            emissions = await climatiq_service.estimate_flight_emissions(
                origin=origin,
                destination=request.destination,
                passengers=1,
            )
            if emissions:
                flight.emissions_kg = emissions
            else:
                flight.emissions_kg = climatiq_service.estimate_flight_emissions_fallback(
                    origin, request.destination, 1
                )
    
    for hotel in hotels:
        if not hotel.emissions_kg:
            emissions = await climatiq_service.estimate_hotel_emissions(
                nights=request.num_days,
            )
            if emissions:
                hotel.emissions_kg = emissions / request.num_days  # Per night
            else:
                hotel.emissions_kg = climatiq_service.estimate_hotel_emissions_fallback(
                    request.num_days
                ) / request.num_days
    
    # Step 5: Build prompt and call Dedalus
    prompt = prompt_builder.build_dedalus_prompt(
        destination=request.destination,
        num_days=request.num_days,
        budget=request.budget,
        preferences=request.preferences,
        mode=request.mode,
        flights=flights,
        hotels=hotels,
        attractions=attractions,
        weather=weather,
    )
    
    # Call Dedalus
    try:
        dedalus_response = await dedalus_client.call_dedalus(prompt, max_steps=10)
    except Exception as e:
        # Fallback: return a basic itinerary
        return _fallback_itinerary(request, flights, hotels)
    
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
    
    return GreenTripItineraryResponse(
        destination=request.destination,
        num_days=request.num_days,
        budget=request.budget,
        mode=request.mode,
        days=itinerary_days,
        totals=totals,
        rationale=rationale,
        eco_score=eco_score,
    )


def _fallback_itinerary(
    request: ItineraryGenerationRequest,
    flights: List[FlightOption],
    hotels: List[LodgingOption],
) -> GreenTripItineraryResponse:
    """Fallback itinerary when Dedalus is unavailable"""
    days = []
    for i in range(1, request.num_days + 1):
        days.append(
            DedalusItineraryDay(
                day=i,
                morning=f"Explore {request.destination} - morning activities",
                afternoon=f"Visit local attractions - afternoon activities",
                evening=f"Enjoy local cuisine and culture - evening activities",
            )
        )
    
    total_cost = (flights[0].price if flights else 0) + (
        (hotels[0].nightly_rate * request.num_days) if hotels else 0
    )
    total_emissions = (flights[0].emissions_kg if flights and flights[0].emissions_kg else 200) + (
        (hotels[0].emissions_kg * request.num_days) if hotels and hotels[0].emissions_kg else 15 * request.num_days
    )
    
    return GreenTripItineraryResponse(
        destination=request.destination,
        num_days=request.num_days,
        budget=request.budget,
        mode=request.mode,
        days=days,
        totals={"cost": total_cost, "emissions_kg": total_emissions},
        rationale="Fallback itinerary generated due to API unavailability.",
        eco_score=max(0, 100 - (total_emissions / 10)),
    )

