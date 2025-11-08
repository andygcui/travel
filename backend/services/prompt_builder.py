"""Build prompts for Dedalus API to generate optimized travel itineraries"""
from __future__ import annotations

from typing import List

from schemas import FlightOption, LodgingOption, PointOfInterest, WeatherForecast


def build_dedalus_prompt(
    destination: str,
    num_days: int,
    budget: float,
    preferences: List[str],
    mode: str,
    flights: List[FlightOption],
    hotels: List[LodgingOption],
    attractions: List[PointOfInterest],
    weather: List[WeatherForecast],
) -> str:
    """
    Build a comprehensive prompt for Dedalus API.
    Mode: 'price-optimal' or 'balanced'
    """
    # Determine weights based on mode
    if mode == "price-optimal":
        alpha = 0.7  # Price weight
        beta = 0.2   # Emissions weight
        gamma = 0.1  # Preference weight
    else:  # balanced
        alpha = 0.4  # Price weight
        beta = 0.4   # Emissions weight
        gamma = 0.2  # Preference weight
    
    # Summarize top options (3-5 each)
    top_flights = flights[:5]
    top_hotels = hotels[:5]
    top_attractions = attractions[:5]
    
    # Build flight summary
    flight_summary = "\n".join([
        f"- {f.segments[0].carrier} {f.segments[0].flight_number}: ${f.price:.2f}"
        + (f" ({f.emissions_kg:.1f} kg CO₂)" if f.emissions_kg else "")
        for f in top_flights
    ])
    
    # Build hotel summary
    hotel_summary = "\n".join([
        f"- {h.name}: ${h.nightly_rate:.2f}/night"
        + (f" (sustainability: {h.sustainability_score*100:.0f}%)" if h.sustainability_score else "")
        + (f", {h.emissions_kg:.1f} kg CO₂/night" if h.emissions_kg else "")
        for h in top_hotels
    ])
    
    # Build attractions summary
    attraction_summary = "\n".join([
        f"- {a.name} ({a.category})" + (f": {a.description}" if a.description else "")
        for a in top_attractions
    ])
    
    # Build weather summary
    weather_summary = "\n".join([
        f"- {w.date}: {w.summary} ({w.temperature_low_c:.0f}°C - {w.temperature_high_c:.0f}°C)"
        for w in weather
    ])
    
    prompt = f"""You are an AI travel planner for GreenTrip, an eco-friendly travel planning service.

TASK: Generate an optimized {num_days}-day travel itinerary for {destination} with a budget of ${budget:.2f}.

MODE: {mode.upper()}
- Price weight (α): {alpha}
- Emissions weight (β): {beta}
- Preference weight (γ): {gamma}

PREFERENCES: {', '.join(preferences) if preferences else 'No specific preferences'}

AVAILABLE DATA:

FLIGHTS (top {len(top_flights)} options):
{flight_summary if flight_summary else "No flight data available"}

HOTELS (top {len(top_hotels)} options):
{hotel_summary if hotel_summary else "No hotel data available"}

ATTRACTIONS (top {len(top_attractions)} options):
{attraction_summary if attraction_summary else "No attractions data available"}

WEATHER FORECAST:
{weather_summary if weather_summary else "Weather data unavailable"}

REQUIREMENTS:
1. Optimize based on mode: prioritize {'cost' if mode == 'price-optimal' else 'balance between cost and emissions'}
2. Select best flight and hotel from the options above
3. Create a day-by-day itinerary using the attractions and preferences
4. Consider weather when planning outdoor activities
5. Include sustainable travel tips where relevant
6. Stay within the budget of ${budget:.2f}

OUTPUT FORMAT (strict JSON):
{{
  "days": [
    {{
      "day": 1,
      "morning": "Detailed morning activity description",
      "afternoon": "Detailed afternoon activity description",
      "evening": "Detailed evening activity description"
    }},
    ...
  ],
  "totals": {{
    "cost": <total_cost_number>,
    "emissions_kg": <total_emissions_kg_number>
  }},
  "rationale": "Brief explanation of why this itinerary was chosen, considering mode ({mode}), preferences, and sustainability"
}}

IMPORTANT:
- Return ONLY valid JSON, no markdown, no code blocks
- Calculate totals based on selected flight + hotel + estimated activities/dining
- emissions_kg should include flight + hotel emissions
- Be specific about activities and times
- Consider weather conditions in your planning
"""
    
    return prompt

