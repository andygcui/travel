from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class TravelerPreferences(BaseModel):
    likes: List[str] = Field(default_factory=list, description="e.g. food, art, outdoors")
    dislikes: List[str] = Field(default_factory=list)
    dietary_restrictions: List[str] = Field(default_factory=list)
    accessibility_needs: List[str] = Field(default_factory=list)
    sustainability_priority: bool = True


class TravelerProfile(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    travel_style: Optional[str] = Field(
        default=None, description="e.g. luxury, backpacking, family"
    )
    loyalty_programs: List[str] = Field(default_factory=list)
    preferences: TravelerPreferences = Field(default_factory=TravelerPreferences)


class TripPlanRequest(BaseModel):
    destination: str
    origin: Optional[str] = Field(
        default=None, description="Origin airport/city code for flights"
    )
    start_date: date
    end_date: date
    budget: float
    travelers: int = 1
    profile: Optional[TravelerProfile] = None


class ItineraryGenerationRequest(BaseModel):
    """GreenTrip-specific request for /generate_itinerary endpoint"""
    destination: str
    origin: Optional[str] = Field(default=None, description="Origin city or airport code (e.g. 'New York' or 'JFK')")
    num_days: int = Field(gt=0, le=30, description="Number of days for the trip")
    budget: float = Field(gt=0, description="Total budget in USD")
    preferences: List[str] = Field(default_factory=list, description="e.g. food, art, outdoors")
    mode: str = Field(default="balanced", description="price-optimal or balanced")


class WeatherForecast(BaseModel):
    date: date
    summary: str
    temperature_high_c: float
    temperature_low_c: float
    precipitation_probability: float = Field(
        0.0, description="Percentage chance between 0 and 1"
    )


class FlightSegment(BaseModel):
    carrier: str
    flight_number: str
    origin: str
    destination: str
    departure: datetime
    arrival: datetime


class FlightOption(BaseModel):
    id: str
    price: float
    currency: str = "USD"
    booking_url: Optional[str] = None
    segments: List[FlightSegment]
    refundable_until: Optional[datetime] = None
    emissions_kg: Optional[float] = Field(default=None, description="CO₂ emissions in kg")


class LodgingOption(BaseModel):
    id: str
    name: str
    address: str
    nightly_rate: float
    currency: str = "USD"
    distance_to_center_km: Optional[float] = None
    sustainability_score: Optional[float] = Field(
        default=None, description="0-1 rating of sustainable practices"
    )
    booking_url: Optional[str] = None
    refundable_until: Optional[datetime] = None
    emissions_kg: Optional[float] = Field(default=None, description="CO₂ emissions per night in kg")


class PointOfInterest(BaseModel):
    name: str
    category: str
    description: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    entrance_fee: Optional[float] = None


class HealthAdvisory(BaseModel):
    title: str
    description: str
    severity: str = Field(description="low, medium, high")
    source: Optional[str] = None


class ItineraryActivity(BaseModel):
    time: str
    name: str
    description: Optional[str] = None
    poi: Optional[PointOfInterest] = None


class ItineraryDay(BaseModel):
    date: date
    theme: Optional[str] = None
    summary: str
    activities: List[ItineraryActivity] = Field(default_factory=list)


class DedalusItineraryDay(BaseModel):
    """Dedalus API response format for daily itinerary"""
    day: int
    morning: str
    afternoon: str
    evening: str


class DedalusItineraryResponse(BaseModel):
    """Dedalus API response format"""
    days: List[DedalusItineraryDay]
    totals: dict = Field(description="Contains cost and emissions_kg")
    rationale: str


class BudgetBreakdown(BaseModel):
    flights: float
    lodging: float
    activities: float
    dining: float
    transit: float
    emergency_fund: float
    currency: str = "USD"

    @property
    def total(self) -> float:
        return (
            self.flights
            + self.lodging
            + self.activities
            + self.dining
            + self.transit
            + self.emergency_fund
        )


class SustainabilityScore(BaseModel):
    total_points: int
    tier: str
    breakdown: List[str] = Field(default_factory=list)


class TripPlanResponse(BaseModel):
    destination: str
    start_date: date
    end_date: date
    travelers: int
    budget: float
    currency: str = "USD"
    weather: List[WeatherForecast]
    flights: List[FlightOption]
    lodging: List[LodgingOption]
    health: List[HealthAdvisory]
    points_of_interest: List[PointOfInterest]
    itinerary: List[ItineraryDay]
    budget_breakdown: BudgetBreakdown
    sustainability: SustainabilityScore


class BookingRequest(BaseModel):
    trip_plan: TripPlanResponse
    selected_flight_id: Optional[str] = None
    selected_lodging_id: Optional[str] = None
    contact_email: Optional[str] = None


class BookingConfirmation(BaseModel):
    booking_id: str
    created_at: datetime
    refundable_until: Optional[datetime] = None
    details: dict


class GreenTripItineraryResponse(BaseModel):
    """GreenTrip response from /generate_itinerary"""
    destination: str
    num_days: int
    budget: float
    mode: str
    days: List[DedalusItineraryDay]
    totals: dict = Field(description="Contains cost and emissions_kg")
    rationale: str
    eco_score: Optional[float] = Field(default=None, description="0-100 sustainability score")

