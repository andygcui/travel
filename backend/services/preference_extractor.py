"""Preference extraction from chat messages using Dedalus"""
from __future__ import annotations

import json
import logging
import re
from typing import Dict, Any, List, Optional

from dedalus_labs import AsyncDedalus, DedalusRunner

logger = logging.getLogger(__name__)


async def extract_preferences_from_message(
    message: str, 
    user_id: str, 
    trip_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Extract preferences from a chat message using Dedalus.
    
    IMPORTANT: This function should ONLY be called from chat messages, NOT from initial trip queries.
    Preferences from initial trip queries should NOT be saved as user preferences.
    
    Args:
        message: User's chat message
        user_id: User ID
        trip_id: Optional trip ID if this is trip-specific
        
    Returns:
        List of preference dictionaries
    """
    if not message or not message.strip():
        return []
    
    # Filter out common query patterns that shouldn't be saved as preferences
    # These are typically from initial trip queries, not chat messages
    message_lower = message.lower().strip()
    
    # Skip if message looks like a trip query (contains destination, dates, budget keywords)
    query_indicators = [
        "plan a trip", "generate itinerary", "create itinerary", "plan itinerary",
        "trip to", "travel to", "visit", "going to", "destination",
        "budget", "days", "duration", "start date", "end date",
        "preferences:", "i want", "i need", "i'm looking for"
    ]
    
    # If message contains query indicators and is very short, it's likely a query, not a chat message
    if any(indicator in message_lower for indicator in query_indicators) and len(message.split()) < 10:
        logger.warning(f"Message appears to be a trip query, not a chat message. Skipping preference extraction: {message[:50]}")
        return []
    
    try:
        # Build prompt for Dedalus to extract preferences
        extraction_prompt = f"""Analyze the following user message and extract travel preferences.

USER MESSAGE: "{message}"

IMPORTANT: Only extract preferences that are clearly stated as personal preferences or travel habits.
DO NOT extract preferences that are just part of a trip query or request (e.g., "I want shopping for this trip").
Only extract preferences that indicate a general preference or habit (e.g., "I love shopping", "I always prefer shopping", "I'm a shopping enthusiast").

Extract any preferences mentioned in the message and categorize them as:
1. **Long-term preferences** (e.g., dietary restrictions like vegetarian/vegan, accessibility needs, travel style)
2. **Trip-specific preferences** (e.g., "want nature for this trip", "avoid early flights for this trip")
3. **Temporal preferences** (e.g., "don't like early flights", "prefer afternoon activities")

For each preference found, provide:
- preference_type: "long_term", "trip_specific", or "temporal"
- preference_category: "dietary", "activity", "timing", "crowd", "budget", "accommodation", "transportation", or "other"
- preference_value: A clear, concise description of the preference
- confidence: A number between 0 and 1 indicating how confident you are this is a real preference

Return your response as a JSON array of preference objects. If no preferences are found, return an empty array.

Example format:
[
  {{
    "preference_type": "temporal",
    "preference_category": "timing",
    "preference_value": "avoid early morning flights",
    "confidence": 0.9
  }},
  {{
    "preference_type": "long_term",
    "preference_category": "dietary",
    "preference_value": "vegetarian",
    "confidence": 0.95
  }}
]

Only extract preferences that are clearly stated. Be conservative with confidence scores."""

        # Call Dedalus to extract preferences
        client = AsyncDedalus()
        runner = DedalusRunner(client)
        result = await runner.run(
            input=extraction_prompt,
            model="openai/gpt-4o",
            max_steps=3,
            stream=False,
        )
        
        response_text = result.final_output if hasattr(result, 'final_output') else str(result)
        
        # Parse JSON response
        preferences = []
        try:
            # Try to parse as JSON directly
            if isinstance(response_text, str):
                # Extract JSON from response if it's wrapped in text
                json_match = re.search(r'\[.*\]', response_text, re.DOTALL)
                if json_match:
                    preferences = json.loads(json_match.group())
                else:
                    preferences = json.loads(response_text)
            else:
                preferences = response_text
            
            # Validate and structure preferences
            structured_preferences = []
            for pref in preferences:
                if not isinstance(pref, dict):
                    continue
                
                # Validate required fields
                pref_type = pref.get("preference_type", "").lower()
                if pref_type not in ["long_term", "trip_specific", "temporal"]:
                    # Default to trip_specific if trip_id provided, otherwise temporal
                    pref_type = "trip_specific" if trip_id else "temporal"
                
                category = pref.get("preference_category", "other").lower()
                value = pref.get("preference_value", "").strip()
                confidence = float(pref.get("confidence", 0.5))
                
                if not value:
                    continue
                
                # Only include preferences with reasonable confidence
                if confidence < 0.3:
                    continue
                
                structured_preferences.append({
                    "user_id": user_id,
                    "trip_id": trip_id if pref_type == "trip_specific" else None,
                    "preference_type": pref_type,
                    "preference_category": category,
                    "preference_value": value,
                    "confidence": min(max(confidence, 0.0), 1.0),  # Clamp between 0 and 1
                    "extracted_from_message": message,
                })
            
            logger.info(f"Extracted {len(structured_preferences)} preferences from message")
            return structured_preferences
            
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse Dedalus response as JSON: {e}")
            # Fallback: try simple regex-based extraction
            return _fallback_extraction(message, user_id, trip_id)
            
    except Exception as e:
        logger.error(f"Error extracting preferences: {e}", exc_info=True)
        # Fallback to simple extraction
        return _fallback_extraction(message, user_id, trip_id)


def _fallback_extraction(
    message: str, 
    user_id: str, 
    trip_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Fallback simple regex-based preference extraction"""
    preferences = []
    message_lower = message.lower()
    
    # Dietary restrictions
    dietary_keywords = {
        "vegetarian": "vegetarian",
        "vegan": "vegan",
        "gluten-free": "gluten-free",
        "gluten free": "gluten-free",
        "kosher": "kosher",
        "halal": "halal",
    }
    
    for keyword, value in dietary_keywords.items():
        if keyword in message_lower:
            preferences.append({
                "user_id": user_id,
                "trip_id": None,  # Dietary is always long-term
                "preference_type": "long_term",
                "preference_category": "dietary",
                "preference_value": value,
                "confidence": 0.8,
                "extracted_from_message": message,
            })
    
    # Timing preferences
    if any(word in message_lower for word in ["early", "morning", "too early"]):
        if any(word in message_lower for word in ["flight", "flights"]):
            preferences.append({
                "user_id": user_id,
                "trip_id": trip_id,
                "preference_type": "temporal",
                "preference_category": "timing",
                "preference_value": "avoid early morning flights",
                "confidence": 0.7,
                "extracted_from_message": message,
            })
    
    # Crowd preferences
    if any(word in message_lower for word in ["crowded", "crowds", "too many people", "busy"]):
        preferences.append({
            "user_id": user_id,
            "trip_id": trip_id,
            "preference_type": "temporal",
            "preference_category": "crowd",
            "preference_value": "avoid crowded places",
            "confidence": 0.7,
            "extracted_from_message": message,
        })
    
    # Activity preferences
    if "nature" in message_lower or "outdoor" in message_lower:
        preferences.append({
            "user_id": user_id,
            "trip_id": trip_id,
            "preference_type": "trip_specific" if trip_id else "temporal",
            "preference_category": "activity",
            "preference_value": "nature activities",
            "confidence": 0.6,
            "extracted_from_message": message,
        })
    
    return preferences

