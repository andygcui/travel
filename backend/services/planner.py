from __future__ import annotations

from datetime import date

from schemas import (
    BookingConfirmation,
    BookingRequest,
    TripPlanRequest,
    TripPlanResponse,
)
from services import budget, bookings, flights, geo, health, lodging, pois, sustainability, weather
from services.ai import generate_itinerary


async def build_trip_plan(request: TripPlanRequest) -> TripPlanResponse:
    start = request.start_date
    end = request.end_date

    latitude, longitude, _ = await geo.resolve_destination(request.destination)

    weather_outlook = await weather.fetch_weather_forecast(latitude, longitude, start, end)
    flight_options = await flights.fetch_flights(request)
    lodging_options = await lodging.fetch_lodging(request)
    pois_list = await pois.fetch_points_of_interest(request.destination, latitude, longitude)
    health_notices = await health.fetch_health_advisories(_country_code_from_destination(request.destination))
    itinerary = await generate_itinerary(request, weather_outlook, pois_list)

    flight_cost = flight_options[0].price if flight_options else 0
    nightly_rate = lodging_options[0].nightly_rate if lodging_options else 0
    lodging_cost = nightly_rate * max((end - start).days, 1)
    budget_breakdown = budget.build_budget_breakdown(request, flight_cost, lodging_cost)
    sustainability_score = sustainability.calculate_sustainability(request, lodging_options)

    return TripPlanResponse(
        destination=request.destination,
        start_date=start,
        end_date=end,
        travelers=request.travelers,
        budget=request.budget,
        weather=weather_outlook,
        flights=flight_options,
        lodging=lodging_options,
        health=health_notices,
        points_of_interest=pois_list,
        itinerary=itinerary,
        budget_breakdown=budget_breakdown,
        sustainability=sustainability_score,
    )


def _country_code_from_destination(destination: str) -> str | None:
    parts = destination.split(",")
    if len(parts) > 1:
        return parts[-1].strip()[:2].upper()
    return None


def create_booking(request: BookingRequest) -> BookingConfirmation:
    return bookings.store_booking(request)


def get_booking(booking_id: str) -> BookingConfirmation | None:
    return bookings.get_booking(booking_id)

