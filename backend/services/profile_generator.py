"""Generate user profile summaries from preferences"""
from __future__ import annotations

import logging
from typing import Dict, Any, List, Optional

from dedalus_labs import AsyncDedalus, DedalusRunner
from services.supabase_client import get_supabase_client

logger = logging.getLogger(__name__)


async def generate_user_profile_summary(user_id: str) -> str:
    """
    Generate a natural language summary of user's travel preferences.
    
    Args:
        user_id: User ID
        
    Returns:
        Natural language summary string
    """
    try:
        supabase = get_supabase_client()
        if not supabase:
            logger.warning("Supabase client not available for profile generation")
            return "Unable to load preferences at this time."
        
        logger.info(f"Generating profile summary for user: {user_id}")
        
        # Fetch all preferences for the user
        # Get long-term preferences
        long_term_response = supabase.table("chat_preferences").select("*").eq(
            "user_id", user_id
        ).eq("preference_type", "long_term").execute()
        logger.info(f"Found {len(long_term_response.data or [])} long-term chat preferences")
        
        # Get frequently mentioned trip-specific preferences (frequency >= 3)
        frequent_trip_prefs_response = supabase.table("chat_preferences").select("*").eq(
            "user_id", user_id
        ).eq("preference_type", "trip_specific").gte("frequency", 3).execute()
        logger.info(f"Found {len(frequent_trip_prefs_response.data or [])} frequent trip-specific preferences")
        
        # Get temporal preferences with frequency >= 2
        temporal_prefs_response = supabase.table("chat_preferences").select("*").eq(
            "user_id", user_id
        ).eq("preference_type", "temporal").gte("frequency", 2).execute()
        logger.info(f"Found {len(temporal_prefs_response.data or [])} temporal preferences")
        
        # Also get user_preferences from the main table
        user_prefs_response = supabase.table("user_preferences").select("*").eq(
            "user_id", user_id
        ).execute()
        logger.info(f"Found {len(user_prefs_response.data or [])} user preferences records")
        if user_prefs_response.data and len(user_prefs_response.data) > 0:
            user_prefs = user_prefs_response.data[0]
            logger.info(f"User preferences: interests={user_prefs.get('preferences', [])}, likes={user_prefs.get('likes', [])}, dislikes={user_prefs.get('dislikes', [])}, dietary={user_prefs.get('dietary_restrictions', [])}")
        
        # Combine all preferences
        all_preferences = []
        
        # Add long-term chat preferences
        if long_term_response.data:
            for pref in long_term_response.data:
                all_preferences.append({
                    "type": "long_term",
                    "category": pref.get("preference_category"),
                    "value": pref.get("preference_value"),
                    "frequency": pref.get("frequency", 1),
                })
        
        # Add frequent trip-specific preferences
        if frequent_trip_prefs_response.data:
            for pref in frequent_trip_prefs_response.data:
                all_preferences.append({
                    "type": "frequent_trip",
                    "category": pref.get("preference_category"),
                    "value": pref.get("preference_value"),
                    "frequency": pref.get("frequency", 1),
                })
        
        # Add temporal preferences
        if temporal_prefs_response.data:
            for pref in temporal_prefs_response.data:
                all_preferences.append({
                    "type": "temporal",
                    "category": pref.get("preference_category"),
                    "value": pref.get("preference_value"),
                    "frequency": pref.get("frequency", 1),
                })
        
        # Add manual preferences from user_preferences table
        if user_prefs_response.data and len(user_prefs_response.data) > 0:
            user_prefs = user_prefs_response.data[0]
            
            # Add interests/preferences
            if user_prefs.get("preferences"):
                for pref in user_prefs["preferences"]:
                    all_preferences.append({
                        "type": "long_term",
                        "category": "activity",
                        "value": pref,
                        "frequency": 1,
                    })
            
            # Add dietary restrictions
            if user_prefs.get("dietary_restrictions"):
                for restriction in user_prefs["dietary_restrictions"]:
                    all_preferences.append({
                        "type": "long_term",
                        "category": "dietary",
                        "value": restriction,
                        "frequency": 1,
                    })
            
            # Add likes
            if user_prefs.get("likes"):
                for like in user_prefs["likes"]:
                    all_preferences.append({
                        "type": "long_term",
                        "category": "activity",
                        "value": like,
                        "frequency": 1,
                    })
            
            # Add dislikes
            if user_prefs.get("dislikes"):
                for dislike in user_prefs["dislikes"]:
                    all_preferences.append({
                        "type": "long_term",
                        "category": "activity",
                        "value": f"avoid {dislike}",
                        "frequency": 1,
                    })
        
        logger.info(f"Total preferences found: {len(all_preferences)}")
        if not all_preferences:
            logger.warning(f"No preferences found for user {user_id}")
            return "You haven't set any preferences yet. Start planning trips and chatting with the planner to build your profile!"
        
        # Use Dedalus to generate a natural language summary
        preferences_text = "\n".join([
            f"- {pref['type']}: {pref['category']}: {pref['value']} (mentioned {pref['frequency']} times)"
            for pref in all_preferences
        ])
        logger.info(f"Generating summary with preferences: {preferences_text[:200]}...")
        
        summary_prompt = f"""Based on the following travel preferences, generate a friendly, natural language summary (2-3 sentences) that describes the user's travel style and preferences.

PREFERENCES:
{preferences_text}

Write a summary that:
1. Highlights their main preferences (dietary, activities, timing, etc.)
2. Mentions what they like and what they avoid (if any dislikes are mentioned)
3. Is friendly and conversational
4. Is concise (2-3 sentences max)
5. If they have dietary restrictions, mention them naturally
6. If they have specific likes/dislikes, incorporate them naturally

Example format:
"You prefer nature activities and outdoor adventures. You avoid crowded tourist spots and prefer afternoon flights. You're vegetarian and prefer mid-range accommodations."

Another example:
"You enjoy museums, hiking, and beaches. You prefer to avoid crowds and nightlife. You're vegan and love trying local cuisine."

Generate the summary now:"""

        try:
            client = AsyncDedalus()
            runner = DedalusRunner(client)
            logger.info("Calling Dedalus to generate profile summary...")
            result = await runner.run(
                input=summary_prompt,
                model="openai/gpt-4o",
                max_steps=2,
                stream=False,
            )
            
            summary = result.final_output if hasattr(result, 'final_output') else str(result)
            
            # Clean up the summary (remove quotes if wrapped)
            summary = summary.strip().strip('"').strip("'")
            
            logger.info(f"Profile summary generated successfully: {summary[:100]}...")
            return summary if summary else "Your travel preferences are being analyzed. Check back soon for your profile summary!"
        except Exception as dedalus_error:
            logger.error(f"Error calling Dedalus for profile summary: {dedalus_error}", exc_info=True)
            # Fallback: Generate a simple summary without Dedalus
            logger.info("Falling back to simple summary generation...")
            return _generate_simple_summary(all_preferences)
        
    except Exception as e:
        logger.error(f"Error generating profile summary: {e}", exc_info=True)
        return "Unable to generate profile summary at this time. Please try again later."


def _generate_simple_summary(preferences: List[Dict[str, Any]]) -> str:
    """Generate a simple summary without Dedalus as fallback"""
    if not preferences:
        return "You haven't set any preferences yet. Start planning trips and chatting with the planner to build your profile!"
    
    activities = []
    dietary = []
    likes = []
    dislikes = []
    
    for pref in preferences:
        category = pref.get("category", "")
        value = pref.get("value", "")
        
        if category == "activity":
            if value.startswith("avoid "):
                dislikes.append(value.replace("avoid ", ""))
            else:
                # Check if it's a like or a general activity
                if value not in ["Food", "Art", "Outdoors", "History", "Nightlife", "Wellness", "Shopping", "Adventure"]:
                    # It's a custom like
                    likes.append(value)
                else:
                    # It's a general interest
                    activities.append(value.lower())
        elif category == "dietary":
            dietary.append(value)
    
    # Build summary
    parts = []
    
    # Combine activities and likes
    all_interests = list(set(activities + [like.lower() for like in likes if like]))
    if all_interests:
        interests_text = ', '.join(all_interests[:3])
        if len(all_interests) > 3:
            interests_text += f", and {len(all_interests) - 3} more"
        parts.append(f"You enjoy {interests_text}.")
    
    if dislikes:
        dislikes_text = ', '.join(dislikes[:2])
        if len(dislikes) > 2:
            dislikes_text += f", and {len(dislikes) - 2} more"
        parts.append(f"You prefer to avoid {dislikes_text}.")
    
    if dietary:
        dietary_text = ', '.join(dietary)
        parts.append(f"You're {dietary_text}.")
    
    if parts:
        return " ".join(parts)
    else:
        return "Your travel preferences are being analyzed. Check back soon for your profile summary!"

