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
        
        # For now, always regenerate the itinerary when chat_planner is called
        # TODO: Add logic to determine if regeneration is needed vs just conversational response
        
        # Validate destination exists
        if not destination:
            return {
                "response": "I need a destination to help you plan. Please make sure your itinerary has a destination set.",
                "updated_itinerary": None,
                "extracted_preferences": extracted_prefs if extracted_prefs else None,
            }
        
        # Get geo coordinates for destination
        from services import geo
        try:
            latitude, longitude, _ = await geo.resolve_destination(destination)
        except Exception as e:
            logger.error(f"Error resolving destination: {e}")
            raise Exception(f"Could not resolve destination '{destination}': {str(e)}")
        
        # Get airport codes
        try:
            origin_code = await airport_code_resolver.resolve_airport_code(origin) if origin else None
            destination_code = await airport_code_resolver.resolve_airport_code(destination)
        except Exception as e:
            logger.warning(f"Error resolving airport codes: {e}")
            origin_code = None
            destination_code = None
        
        # Fetch flights and hotels
        from schemas import TripPlanRequest, TravelerProfile, TravelerPreferences
        trip_request = TripPlanRequest(
            destination=destination,
            start_date=start_date,
            end_date=end_date,
            travelers=1,
            budget=budget,
            profile=TravelerProfile(
                preferences=TravelerPreferences(
                    likes=combined_likes,
                    dislikes=combined_dislikes,
                    dietary_restrictions=combined_dietary
                )
            )
        )
        
        try:
            flights = await amadeus_flights.fetch_flights(trip_request)
        except Exception as e:
            logger.warning(f"Error fetching flights: {e}")
            flights = []
        
        try:
            hotels = await amadeus_hotels.fetch_hotels(trip_request)
        except Exception as e:
            logger.warning(f"Error fetching hotels: {e}")
            hotels = []
        
        # Get weather
        try:
            weather_daily = await openweather_service.fetch_weather_forecast(latitude, longitude, start_date, end_date)
        except Exception as e:
            logger.warning(f"Error fetching weather: {e}")
            weather_daily = []
        
        try:
            attractions = await google_places_service.fetch_attractions_google(
                destination=destination,
                latitude=latitude,
                longitude=longitude,
                preferences=combined_preferences,
                limit=5,
            )
        except Exception as e:
            logger.warning(f"Error fetching attractions: {e}")
            attractions = []
        
        # Estimate emissions
        for flight in flights:
            if not flight.emissions_kg:
                try:
                    emissions = await climatiq_service.estimate_flight_emissions(
                        origin=origin_code or "",
                        destination=destination_code or "",
                        passengers=1,
                    )
                    if emissions:
                        flight.emissions_kg = emissions
                except Exception as e:
                    logger.warning(f"Error estimating emissions: {e}")
        
        # Build prompt with modifications using combined preferences
        try:
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
        except Exception as e:
            logger.error(f"Error building prompt: {e}")
            raise Exception(f"Error building prompt: {str(e)}")
        
        # Add note about collaboration if applicable
        if collaborator_id:
            prompt += "\n\nNOTE: This trip is being planned collaboratively. The preferences above combine preferences from both the trip owner and collaborator."
        
        # Add modification instructions
        prompt += f"\n\nIMPORTANT MODIFICATIONS REQUESTED BY USER:\n{message}\n\nPlease incorporate these changes into the itinerary."
        
        # Generate updated itinerary
        try:
            dedalus_response = await dedalus_client.call_dedalus(prompt, max_steps=10)
        except Exception as e:
            logger.error(f"Error calling Dedalus: {e}")
            raise Exception(f"Error generating itinerary: {str(e)}")
        
        # Get updated days from Dedalus response
        updated_days = dedalus_response.get("days", current_itinerary.get("days", []))
        
        # Regenerate day_attractions to match the new days
        # ALWAYS use existing attractions from current itinerary if they exist (even if empty list)
        # Only fall back to newly fetched ones if attractions key doesn't exist in itinerary
        existing_attractions = current_itinerary.get("attractions")
        # Check if "attractions" key exists in the itinerary (could be None, [], or a list)
        has_existing_attractions_key = "attractions" in current_itinerary
        attraction_pool = existing_attractions if has_existing_attractions_key else (attractions if attractions else [])
        
        # Convert to PointOfInterest objects if needed (for compatibility)
        from schemas import PointOfInterest
        poi_objects = []
        for poi in attraction_pool:
            if isinstance(poi, dict):
                try:
                    poi_objects.append(PointOfInterest(**poi))
                except Exception as e:
                    logger.warning(f"Error converting POI dict to object: {e}")
                    continue
            elif isinstance(poi, PointOfInterest):
                poi_objects.append(poi)
            else:
                logger.warning(f"Unknown POI type: {type(poi)}")
        
        # Filter attractions with valid coordinates
        valid_attractions = [poi for poi in poi_objects if poi.latitude and poi.longitude]
        
        # Regenerate day_attractions mapping
        from schemas import DayAttractionBundle
        from geopy.distance import geodesic
        day_attraction_bundles = []
        used_pois = set()
        
        def cluster_and_order_pois(pois, n, center_lat, center_lng):
            """Simple greedy nearest-neighbor for n POIs"""
            if not pois or n == 0:
                return []
            selected = []
            remaining = pois[:]
            current = (center_lat, center_lng)
            for _ in range(n):
                if not remaining:
                    break
                # Find nearest unused POI
                nearest = min(remaining, key=lambda poi: geodesic(current, (poi.latitude, poi.longitude)).km)
                selected.append(nearest)
                current = (nearest.latitude, nearest.longitude)
                remaining.remove(nearest)
            return selected
        
        for day_data in updated_days:
            day_number = day_data.get("day", len(day_attraction_bundles) + 1)
            bundle = DayAttractionBundle(day=day_number)
            
            # Pick 3 closest unused POIs for this day
            available_pois = [poi for poi in valid_attractions if poi.name not in used_pois]
            ordered_pois = cluster_and_order_pois(available_pois, 3, latitude, longitude)
            
            for poi in ordered_pois:
                used_pois.add(poi.name)
            
            if ordered_pois:
                bundle.morning = ordered_pois[0]
                bundle.afternoon = ordered_pois[1] if len(ordered_pois) > 1 else ordered_pois[0]
                bundle.evening = ordered_pois[2] if len(ordered_pois) > 2 else (ordered_pois[1] if len(ordered_pois) > 1 else ordered_pois[0])
            
            day_attraction_bundles.append(bundle)
        
        # Parse response and return updated itinerary
        # Preserve all existing fields and only update what changed
        # Convert Pydantic models to dicts for JSON serialization
        def to_dict(obj):
            if hasattr(obj, 'model_dump'):
                return obj.model_dump()
            elif hasattr(obj, 'dict'):
                return obj.dict()
            elif isinstance(obj, dict):
                return obj
            else:
                return obj
        
        # Always preserve the existing attractions list - don't overwrite it
        # The exploreMoreOptions section depends on the full attractions list
        # Use existing attractions if the key exists in itinerary, otherwise use new ones
        if has_existing_attractions_key:
            # Use existing attractions (even if empty list or None)
            final_attractions = existing_attractions if existing_attractions is not None else []
        else:
            # Key doesn't exist, use newly fetched attractions
            final_attractions = attractions if attractions else []
        
        # Convert attractions to dict format if needed, but preserve all of them
        if not final_attractions:
            attractions_dict = []
        elif isinstance(final_attractions[0], dict):
            # Already in dict format, keep as is
            attractions_dict = final_attractions
        else:
            # Convert Pydantic models to dicts
            attractions_dict = [to_dict(attr) for attr in final_attractions]
        
        # Log for debugging
        logger.info(f"Preserving attractions: {len(attractions_dict)} attractions (existing key: {has_existing_attractions_key})")
        
        updated_itinerary = {
            **current_itinerary,
            "days": updated_days,
            "totals": dedalus_response.get("totals", current_itinerary.get("totals", {})),
            "rationale": dedalus_response.get("rationale", current_itinerary.get("rationale", "")),
            "day_attractions": [to_dict(bundle) for bundle in day_attraction_bundles],
            # Always preserve the full attractions list for exploreMoreOptions
            "attractions": attractions_dict,
        }
        
        # Generate a smart conversational response using Dedalus
        # Summarize what changed in the itinerary
        response_prompt = f"""You are a helpful travel planning assistant. A user just asked you to modify their itinerary, and you've successfully updated it.

USER REQUEST: "{message}"

ITINERARY UPDATED: Yes, the itinerary has been regenerated with the requested changes.

INSTRUCTIONS:
1. Provide a natural, friendly response acknowledging their request
2. Briefly mention what was updated (e.g., "I've adjusted your itinerary to avoid crowded places" or "I've updated the flight times as requested")
3. Be specific about the changes if possible (mention days, activities, or preferences that changed)
4. Keep it concise (2-3 sentences)
5. Be conversational and helpful
6. If preferences were extracted, you can mention that you've noted them for future trips

Generate a helpful, natural response:"""
        
        try:
            # Use Dedalus to generate a smart response
            response_result = await dedalus_client.call_dedalus(response_prompt, max_steps=5)
            # Dedalus might return structured data, extract the text response
            if isinstance(response_result, dict):
                smart_response = response_result.get("response") or response_result.get("text") or response_result.get("message")
                if smart_response:
                    response_text = smart_response
                else:
                    # Fallback: use rationale or first value
                    response_text = response_result.get("rationale") or str(list(response_result.values())[0]) if response_result.values() else None
            else:
                response_text = str(response_result)
            
            # Clean up the response
            if response_text:
                response_text = response_text.strip()
                # Remove any JSON-like formatting
                if response_text.startswith("{") or response_text.startswith("["):
                    response_text = None
        except Exception as e:
            logger.warning(f"Error generating smart response with Dedalus: {e}")
            response_text = None
        
        # Fallback to generic response if Dedalus didn't provide a good one
        if not response_text or len(response_text) < 10:
            response_text = f"I've updated your itinerary based on your request: {message}. The changes have been applied!"
        
        # Add preference extraction note if applicable
        if extracted_prefs:
            prefs_list = [p.get("preference_value", str(p)) for p in extracted_prefs]
            response_text += f"\n\n✓ I've also noted your preferences: {', '.join(prefs_list[:3])}"  # Show first 3
        
        return {
            "response": response_text,
            "updated_itinerary": updated_itinerary,
            "extracted_preferences": extracted_prefs if extracted_prefs else None,
        }
            
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Error in chat planner: {error_msg}", exc_info=True)
        # Provide more helpful error message
        return {
            "response": f"I encountered an error: {error_msg}. Please make sure your itinerary has all required information (destination, dates, etc.) and try again.",
            "updated_itinerary": None,
            "extracted_preferences": extracted_prefs if extracted_prefs else None,
        }

