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
            return "Unable to load preferences at this time."
        
        # Fetch all preferences for the user
        # Get long-term preferences
        long_term_response = supabase.table("chat_preferences").select("*").eq(
            "user_id", user_id
        ).eq("preference_type", "long_term").execute()
        
        # Get frequently mentioned trip-specific preferences (frequency >= 3)
        frequent_trip_prefs_response = supabase.table("chat_preferences").select("*").eq(
            "user_id", user_id
        ).eq("preference_type", "trip_specific").gte("frequency", 3).execute()
        
        # Get temporal preferences with frequency >= 2
        temporal_prefs_response = supabase.table("chat_preferences").select("*").eq(
            "user_id", user_id
        ).eq("preference_type", "temporal").gte("frequency", 2).execute()
        
        # Also get user_preferences from the main table
        user_prefs_response = supabase.table("user_preferences").select("*").eq(
            "user_id", user_id
        ).execute()
        
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
            if user_prefs.get("dietary_restrictions"):
                for restriction in user_prefs["dietary_restrictions"]:
                    all_preferences.append({
                        "type": "long_term",
                        "category": "dietary",
                        "value": restriction,
                        "frequency": 1,
                    })
            if user_prefs.get("likes"):
                for like in user_prefs["likes"]:
                    all_preferences.append({
                        "type": "long_term",
                        "category": "activity",
                        "value": like,
                        "frequency": 1,
                    })
            if user_prefs.get("dislikes"):
                for dislike in user_prefs["dislikes"]:
                    all_preferences.append({
                        "type": "long_term",
                        "category": "activity",
                        "value": f"avoid {dislike}",
                        "frequency": 1,
                    })
        
        if not all_preferences:
            return "You haven't set any preferences yet. Start planning trips and chatting with the planner to build your profile!"
        
        # Use Dedalus to generate a natural language summary
        preferences_text = "\n".join([
            f"- {pref['type']}: {pref['category']}: {pref['value']} (mentioned {pref['frequency']} times)"
            for pref in all_preferences
        ])
        
        summary_prompt = f"""Based on the following travel preferences, generate a friendly, natural language summary (2-3 sentences) that describes the user's travel style and preferences.

PREFERENCES:
{preferences_text}

Write a summary that:
1. Highlights their main preferences (dietary, activities, timing, etc.)
2. Mentions patterns you notice (e.g., "You consistently prefer...")
3. Is friendly and conversational
4. Is concise (2-3 sentences max)

Example format:
"You prefer nature activities and outdoor adventures. You avoid crowded tourist spots and prefer afternoon flights. You're vegetarian and prefer mid-range accommodations."

Generate the summary now:"""

        client = AsyncDedalus()
        runner = DedalusRunner(client)
        result = await runner.run(
            input=summary_prompt,
            model="openai/gpt-4o",
            max_steps=2,
            stream=False,
        )
        
        summary = result.final_output if hasattr(result, 'final_output') else str(result)
        
        # Clean up the summary (remove quotes if wrapped)
        summary = summary.strip().strip('"').strip("'")
        
        return summary if summary else "Your travel preferences are being analyzed. Check back soon for your profile summary!"
        
    except Exception as e:
        logger.error(f"Error generating profile summary: {e}", exc_info=True)
        return "Unable to generate profile summary at this time. Please try again later."

