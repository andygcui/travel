"""Preference aggregation and promotion logic"""
from __future__ import annotations

import logging
from typing import Dict, Any, List, Optional

from services.supabase_client import get_supabase_client

logger = logging.getLogger(__name__)


async def save_preferences(preferences: List[Dict[str, Any]]) -> None:
    """
    Save extracted preferences to database, updating frequency if duplicate.
    
    Args:
        preferences: List of preference dictionaries
    """
    if not preferences:
        return
    
    try:
        supabase = get_supabase_client()
        if not supabase:
            logger.warning("Supabase client not available, skipping preference save")
            return
        
        for pref in preferences:
            # Check if this preference already exists
            existing = supabase.table("chat_preferences").select("*").eq(
                "user_id", pref["user_id"]
            ).eq("preference_category", pref["preference_category"]).eq(
                "preference_value", pref["preference_value"]
            ).eq("preference_type", pref["preference_type"]).execute()
            
            if existing.data and len(existing.data) > 0:
                # Update frequency
                existing_pref = existing.data[0]
                new_frequency = existing_pref.get("frequency", 1) + 1
                
                supabase.table("chat_preferences").update({
                    "frequency": new_frequency,
                    "updated_at": "now()",
                }).eq("id", existing_pref["id"]).execute()
                
                logger.info(f"Updated preference frequency: {pref['preference_value']} -> {new_frequency}")
            else:
                # Insert new preference
                supabase.table("chat_preferences").insert(pref).execute()
                logger.info(f"Inserted new preference: {pref['preference_value']}")
        
    except Exception as e:
        logger.error(f"Error saving preferences: {e}", exc_info=True)


async def promote_frequent_preferences(user_id: str) -> List[Dict[str, Any]]:
    """
    Promote trip-specific preferences to long-term if they appear frequently (frequency >= 3).
    
    Args:
        user_id: User ID
        
    Returns:
        List of promoted preferences
    """
    try:
        supabase = get_supabase_client()
        if not supabase:
            return []
        
        # Find trip-specific preferences with frequency >= 3
        frequent_prefs = supabase.table("chat_preferences").select("*").eq(
            "user_id", user_id
        ).eq("preference_type", "trip_specific").gte("frequency", 3).execute()
        
        if not frequent_prefs.data:
            return []
        
        promoted = []
        
        for pref in frequent_prefs.data:
            # Check if a long-term version already exists
            existing_long_term = supabase.table("chat_preferences").select("*").eq(
                "user_id", user_id
            ).eq("preference_category", pref["preference_category"]).eq(
                "preference_value", pref["preference_value"]
            ).eq("preference_type", "long_term").execute()
            
            if not existing_long_term.data:
                # Create long-term version
                new_pref = {
                    "user_id": user_id,
                    "trip_id": None,  # Long-term preferences don't have trip_id
                    "preference_type": "long_term",
                    "preference_category": pref["preference_category"],
                    "preference_value": pref["preference_value"],
                    "frequency": pref["frequency"],
                    "confidence": pref.get("confidence", 0.5),
                    "extracted_from_message": f"Promoted from trip-specific (frequency: {pref['frequency']})",
                }
                
                supabase.table("chat_preferences").insert(new_pref).execute()
                promoted.append(new_pref)
                logger.info(f"Promoted preference to long-term: {pref['preference_value']}")
        
        # Also update user_preferences table with promoted dietary restrictions
        if promoted:
            dietary_promoted = [p for p in promoted if p["preference_category"] == "dietary"]
            if dietary_promoted:
                # Get current user_preferences
                user_prefs = supabase.table("user_preferences").select("*").eq(
                    "user_id", user_id
                ).execute()
                
                current_dietary = []
                if user_prefs.data and len(user_prefs.data) > 0:
                    current_dietary = user_prefs.data[0].get("dietary_restrictions", [])
                
                # Add new dietary restrictions
                new_dietary = list(set(current_dietary + [p["preference_value"] for p in dietary_promoted]))
                
                if user_prefs.data and len(user_prefs.data) > 0:
                    # Update existing
                    supabase.table("user_preferences").update({
                        "dietary_restrictions": new_dietary,
                    }).eq("user_id", user_id).execute()
                else:
                    # Create new
                    supabase.table("user_preferences").insert({
                        "user_id": user_id,
                        "dietary_restrictions": new_dietary,
                    }).execute()
        
        return promoted
        
    except Exception as e:
        logger.error(f"Error promoting preferences: {e}", exc_info=True)
        return []

