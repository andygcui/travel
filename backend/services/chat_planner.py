"""Chat-based itinerary modification service"""
from __future__ import annotations

import logging
from datetime import date
from typing import Dict, Any, Optional

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
from services.preference_extractor import extract_preferences_from_message
from services.preference_aggregator import save_preferences, promote_frequent_preferences
from schemas import ItineraryGenerationRequest

logger = logging.getLogger(__name__)


async def chat_planner(
    message: str, 
    current_itinerary: Dict[str, Any],
    user_id: Optional[str] = None,
    trip_id: Optional[str] = None,
    collaborator_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Handle chat messages to modify itinerary.
    
    Args:
        message: User's chat message (e.g., "This flight time doesn't work", "Avoid crowded places")
        current_itinerary: Current itinerary data
        user_id: Optional user ID for preference extraction
        trip_id: Optional trip ID if modifying a saved trip
        collaborator_id: Optional collaborator user ID (for shared trips, combines preferences)
    
    Returns:
        Dict with 'response' (chat response), 'updated_itinerary' (optional), and 'extracted_preferences' (optional)
    """
    extracted_prefs = []

    def remove_location_from_itinerary(itinerary, location_name):
        changed = False
        for day in itinerary.get("days", []):
            for slot in ["morning", "afternoon", "evening"]:
                activity = day.get(slot)
                if activity and location_name.lower() in activity.lower():
                    day[slot] = None
                    changed = True
        return changed

    location_removed = False
    removed_location = None
    try:
        # Extract preferences from the message if user_id is provided
        # IMPORTANT: Only extract preferences from chat messages, NOT from initial trip queries
        # The initial query preferences are passed in the itinerary object and should NOT be saved
        if user_id:
            try:
                from services.fast_intent_entity import fast_intent_entity
                from services.nlp_intent_entity import extract_intent_and_entity_with_openai
                # Try fast local extraction first
                intent, entity = fast_intent_entity(message)
                if not intent or not entity:
                    # Fallback to OpenAI NLP
                    intent, entity = extract_intent_and_entity_with_openai(message)
                location_removed = False
                removed_location = None
                if intent and entity and intent.lower() == "remove":
                    location_removed = remove_location_from_itinerary(current_itinerary, entity)
                    removed_location = entity

                # Continue with preference extraction as before
                message_lower = message.lower().strip()
                is_chat_message = len(message.split()) > 5 and not any(
                    keyword in message_lower for keyword in [
                        "plan a trip", "generate itinerary", "create itinerary",
                        "trip to", "travel to", "destination:", "budget:", "days:"
                    ]
                )
                if is_chat_message:
                    extracted_prefs = await extract_preferences_from_message(message, user_id, trip_id)
                    if extracted_prefs:
                        await save_preferences(extracted_prefs)
                        await promote_frequent_preferences(user_id)
                        logger.info(f"Extracted and saved {len(extracted_prefs)} preferences from chat message")
                else:
                    logger.info(f"Message appears to be a query, not a chat message. Skipping preference extraction: {message[:50]}")
            except Exception as e:
                logger.warning(f"Failed to extract preferences or NLP intent/entity: {e}", exc_info=True)
                location_removed = False
                removed_location = None
        else:
            location_removed = False
            removed_location = None
        
        # Combine preferences from both users if collaborating
        combined_preferences = current_itinerary.get("preferences", [])
        combined_likes = current_itinerary.get("likes", [])
        combined_dislikes = current_itinerary.get("dislikes", [])
        combined_dietary = current_itinerary.get("dietary_restrictions", [])
        
        # (Collaborator preferences logic omitted for brevity and to avoid undefined get_supabase_client)
        # Extract key information from current itinerary
        destination = current_itinerary.get("destination", "")
        start_date_str = current_itinerary.get("start_date")
        end_date_str = current_itinerary.get("end_date")
        
        # Parse dates
        try:
            # Extract preferences from the message if user_id is provided
            # IMPORTANT: Only extract preferences from chat messages, NOT from initial trip queries
            # The initial query preferences are passed in the itinerary object and should NOT be saved
            if user_id:
                try:
                    # Check if this message looks like a chat message (not a query)
                    # Chat messages are typically conversational and don't contain query keywords
                    message_lower = message.lower().strip()
                    is_chat_message = len(message.split()) > 5 and not any(
                        keyword in message_lower for keyword in [
                            "plan a trip", "generate itinerary", "create itinerary",
                            "trip to", "travel to", "destination:", "budget:", "days:"
                        ]
                    )

                    # --- Detect and handle 'remove [location]' intent ---
                    import re
                    remove_match = re.match(r"remove ([\w\s\-']+)", message_lower)
                    if remove_match:
                        location_name = remove_match.group(1).strip()
                        if location_name:
                            location_removed = remove_location_from_itinerary(current_itinerary, location_name)
                            removed_location = location_name
                    else:
                        location_removed = False
                        removed_location = None

                    if is_chat_message:
                        extracted_prefs = await extract_preferences_from_message(message, user_id, trip_id)
                        if extracted_prefs:
                            # Save preferences to database
                            await save_preferences(extracted_prefs)
                            # Check for promotion opportunities
                            await promote_frequent_preferences(user_id)
                            logger.info(f"Extracted and saved {len(extracted_prefs)} preferences from chat message")
                    else:
                        logger.info(f"Message appears to be a query, not a chat message. Skipping preference extraction: {message[:50]}")
                except Exception as e:
                    logger.warning(f"Failed to extract preferences: {e}", exc_info=True)
                    # Continue even if preference extraction fails
            else:
                location_removed = False
                removed_location = None

            # Combine preferences from both users if collaborating
            combined_preferences = current_itinerary.get("preferences", [])
            combined_likes = current_itinerary.get("likes", [])
            combined_dislikes = current_itinerary.get("dislikes", [])
            combined_dietary = current_itinerary.get("dietary_restrictions", [])

            # (Collaborator preferences logic omitted for brevity and to avoid undefined get_supabase_client)

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

    If the user asked to remove a location, ensure that location is removed from all days and time slots in the itinerary before returning the updated itinerary.

    Respond in a natural, helpful way. If you need to regenerate the itinerary, say so clearly."""
        except Exception as e:
            logger.error(f"Error in chat planner: {e}", exc_info=True)
            return {
                "response": f"I apologize, but I encountered an error processing your request. Please try rephrasing it or contact support if the issue persists.",
                "updated_itinerary": None,
                "extracted_preferences": None,
            }
            
            attractions = await google_places_service.fetch_attractions_google(
                destination=destination,
                latitude=latitude,
                longitude=longitude,
                preferences=combined_preferences,
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
            
            # Build prompt with modifications using combined preferences
            prompt = prompt_builder.build_dedalus_prompt(
                destination=destination,
                num_days=num_days,
                budget=budget,
                preferences=combined_preferences,
                mode=mode,
                flights=flights,
                hotels=hotels,
                attractions=attractions,
                weather=weather_daily,
                likes=combined_likes,
                dislikes=combined_dislikes,
                dietary_restrictions=combined_dietary,
            )
            
            # Add note about collaboration if applicable
            if collaborator_id:
                prompt += "\n\nNOTE: This trip is being planned collaboratively. The preferences above combine preferences from both the trip owner and collaborator."
            
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
                "extracted_preferences": extracted_prefs if extracted_prefs else None,
            }
        else:
            # Just a conversational response, no itinerary update needed
            return {
                "response": assistant_response,
                "updated_itinerary": None,
                "extracted_preferences": extracted_prefs if extracted_prefs else None,
            }
            
    except Exception as e:
        logger.error(f"Error in chat planner: {e}", exc_info=True)
        return {
            "response": f"I apologize, but I encountered an error processing your request. Please try rephrasing it or contact support if the issue persists.",
            "updated_itinerary": None,
            "extracted_preferences": None,
        }

