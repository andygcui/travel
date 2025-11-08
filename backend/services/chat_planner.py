"""Chat-based itinerary modification service"""
from __future__ import annotations

import logging
from datetime import date
from typing import Dict, Any

from dedalus_labs import AsyncDedalus, DedalusRunner
from services import (
    prompt_builder,
    amadeus_flights,
    amadeus_hotels,
    google_places_service,
    openweather_service,
    airport_code_resolver,
    climatiq_service,
    dedalus_client,
)
from schemas import ItineraryGenerationRequest

logger = logging.getLogger(__name__)


async def chat_planner(message: str, current_itinerary: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle chat messages to modify itinerary.
    
    Args:
        message: User's chat message (e.g., "This flight time doesn't work", "Avoid crowded places")
        current_itinerary: Current itinerary data
    
    Returns:
        Dict with 'response' (chat response) and optionally 'updated_itinerary'
    """
    try:
        # Extract key information from current itinerary
        destination = current_itinerary.get("destination", "")
        start_date_str = current_itinerary.get("start_date")
        end_date_str = current_itinerary.get("end_date")
        
        # Parse dates
        if isinstance(start_date_str, str):
            start_date = date.fromisoformat(start_date_str)
        elif isinstance(start_date_str, date):
            start_date = start_date_str
        else:
            start_date = date.today()
            
        if isinstance(end_date_str, str):
            end_date = date.fromisoformat(end_date_str)
        elif isinstance(end_date_str, date):
            end_date = end_date_str
        else:
            end_date = date.today()
        
        num_days = current_itinerary.get("num_days", 5)
        budget = current_itinerary.get("budget", 2000)
        mode = current_itinerary.get("mode", "balanced")
        origin = current_itinerary.get("origin")
        
        # Build a conversational prompt for Dedalus
        conversation_prompt = f"""You are a helpful travel planning assistant. A user has an existing itinerary and wants to make changes.

CURRENT ITINERARY:
Destination: {destination}
Dates: {start_date} to {end_date} ({num_days} days)
Budget: ${budget}
Mode: {mode}

USER REQUEST: "{message}"

Your task:
1. Understand what the user wants to change
2. If the request requires regenerating the itinerary (e.g., changing flight times, avoiding crowded places, adding/removing activities), respond with "REGENERATE_ITINERARY" and provide a brief explanation
3. If it's a simple question or clarification, just answer helpfully
4. Be friendly and conversational

Respond in a natural, helpful way. If you need to regenerate the itinerary, say so clearly."""

        # Call Dedalus for conversational response
        client = AsyncDedalus()
        runner = DedalusRunner(client)
        result = await runner.run(
            input=conversation_prompt,
            model="openai/gpt-4o",
            max_steps=3,
            stream=False,
        )
        
        assistant_response = result.final_output if hasattr(result, 'final_output') else str(result)
        
        # Check if we need to regenerate itinerary
        should_regenerate = "REGENERATE_ITINERARY" in assistant_response.upper() or any(
            keyword in message.lower() 
            for keyword in ["flight", "time", "crowded", "avoid", "change", "different", "modify", "update"]
        )
        
        if should_regenerate:
            # Get fresh data similar to itinerary_generator
            # Geocode destination
            latitude, longitude = await google_places_service.geocode_destination(destination)
            if not latitude or not longitude:
                latitude, longitude = 48.8566, 2.3522  # Fallback
            
            # Resolve airport codes
            origin_code = airport_code_resolver.resolve_airport_code(origin or "New York") or "JFK"
            destination_code = airport_code_resolver.resolve_airport_code(destination) or destination
            
            # Fetch fresh data
            flights = await amadeus_flights.fetch_flights_amadeus(
                origin=origin_code,
                destination=destination_code,
                departure_date=start_date,
                return_date=end_date,
                adults=1,
            )
            
            hotels = await amadeus_hotels.fetch_hotels_amadeus(
                latitude=latitude,
                longitude=longitude,
                check_in=start_date,
                check_out=end_date,
                adults=1,
            )
            
            weather_daily, _ = await openweather_service.fetch_weather_openweather(
                latitude=latitude,
                longitude=longitude,
                start=start_date,
                end=end_date,
            )
            
            attractions = await google_places_service.fetch_attractions_google(
                destination=destination,
                latitude=latitude,
                longitude=longitude,
                preferences=current_itinerary.get("preferences", []),
                limit=5,
            )
            
            # Estimate emissions
            for flight in flights:
                if not flight.emissions_kg:
                    emissions = await climatiq_service.estimate_flight_emissions(
                        origin=origin_code,
                        destination=destination_code,
                        passengers=1,
                    )
                    if emissions:
                        flight.emissions_kg = emissions
            
            # Build prompt with modifications
            prompt = prompt_builder.build_dedalus_prompt(
                destination=destination,
                num_days=num_days,
                budget=budget,
                preferences=current_itinerary.get("preferences", []),
                mode=mode,
                flights=flights,
                hotels=hotels,
                attractions=attractions,
                weather=weather_daily,
                likes=current_itinerary.get("likes", []),
                dislikes=current_itinerary.get("dislikes", []),
                dietary_restrictions=current_itinerary.get("dietary_restrictions", []),
            )
            
            # Add modification instructions
            prompt += f"\n\nIMPORTANT MODIFICATIONS REQUESTED BY USER:\n{message}\n\nPlease incorporate these changes into the itinerary."
            
            # Generate updated itinerary
            dedalus_response = await dedalus_client.call_dedalus(prompt, max_steps=10)
            
            # Parse response and return updated itinerary
            updated_itinerary = {
                **current_itinerary,
                "days": dedalus_response.get("days", current_itinerary.get("days", [])),
                "totals": dedalus_response.get("totals", current_itinerary.get("totals", {})),
                "rationale": dedalus_response.get("rationale", current_itinerary.get("rationale", "")),
            }
            
            return {
                "response": f"I've updated your itinerary based on your request: {message}. The changes have been applied!",
                "updated_itinerary": updated_itinerary,
            }
        else:
            # Just a conversational response, no itinerary update needed
            return {
                "response": assistant_response,
                "updated_itinerary": None,
            }
            
    except Exception as e:
        logger.error(f"Error in chat planner: {e}", exc_info=True)
        return {
            "response": f"I apologize, but I encountered an error processing your request. Please try rephrasing it or contact support if the issue persists.",
            "updated_itinerary": None,
        }

