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
        
        # Combine all preferences with deduplication
        all_preferences = []
        seen_preferences = set()  # Track seen preferences (case-insensitive, normalized)
        
        def normalize_preference_value(value: str) -> str:
            """Normalize preference value for comparison (lowercase, trimmed)"""
            if not value:
                return ""
            return value.strip().lower()
        
        def add_preference_if_unique(pref_dict: Dict[str, Any]) -> None:
            """Add preference only if it's not a duplicate (case-insensitive)"""
            value = pref_dict.get("value", "")
            if not value:
                return
            
            normalized_value = normalize_preference_value(value)
            category = pref_dict.get("category", "").lower()
            
            # Create a unique key: category + normalized value
            unique_key = f"{category}:{normalized_value}"
            
            if unique_key not in seen_preferences:
                seen_preferences.add(unique_key)
                all_preferences.append(pref_dict)
            else:
                # If duplicate found, update frequency if this one has higher frequency
                for existing_pref in all_preferences:
                    if (normalize_preference_value(existing_pref.get("value", "")) == normalized_value and
                        existing_pref.get("category", "").lower() == category):
                        # Update frequency to the maximum
                        existing_pref["frequency"] = max(
                            existing_pref.get("frequency", 1),
                            pref_dict.get("frequency", 1)
                        )
                        logger.info(f"Deduplicated preference: {value} (keeping existing with frequency {existing_pref['frequency']})")
                        break
        
        # Add long-term chat preferences
        if long_term_response.data:
            for pref in long_term_response.data:
                add_preference_if_unique({
                    "type": "long_term",
                    "category": pref.get("preference_category"),
                    "value": pref.get("preference_value"),
                    "frequency": pref.get("frequency", 1),
                })
        
        # Add frequent trip-specific preferences
        if frequent_trip_prefs_response.data:
            for pref in frequent_trip_prefs_response.data:
                add_preference_if_unique({
                    "type": "frequent_trip",
                    "category": pref.get("preference_category"),
                    "value": pref.get("preference_value"),
                    "frequency": pref.get("frequency", 1),
                })
        
        # Add temporal preferences
        if temporal_prefs_response.data:
            for pref in temporal_prefs_response.data:
                add_preference_if_unique({
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
                    add_preference_if_unique({
                        "type": "long_term",
                        "category": "activity",
                        "value": pref,
                        "frequency": 1,
                    })
            
            # Add dietary restrictions
            if user_prefs.get("dietary_restrictions"):
                for restriction in user_prefs["dietary_restrictions"]:
                    add_preference_if_unique({
                        "type": "long_term",
                        "category": "dietary",
                        "value": restriction,
                        "frequency": 1,
                    })
            
            # Add likes
            if user_prefs.get("likes"):
                for like in user_prefs["likes"]:
                    add_preference_if_unique({
                        "type": "long_term",
                        "category": "activity",
                        "value": like,
                        "frequency": 1,
                    })
            
            # Add dislikes
            if user_prefs.get("dislikes"):
                for dislike in user_prefs["dislikes"]:
                    add_preference_if_unique({
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
        
        summary_prompt = f"""Based on the following travel preferences, generate a friendly, natural language summary that describes the user's travel style and preferences.

PREFERENCES:
{preferences_text}

Write a summary that:
1. Highlights their main preferences (dietary, activities, timing, etc.)
2. Mentions what they like and what they avoid (if any dislikes are mentioned)
3. Is friendly and conversational
4. Is at least 50 words long (aim for 3-5 sentences)
5. If they have dietary restrictions, mention them naturally
6. If they have specific likes/dislikes, incorporate them naturally
7. Provides context and details about their travel personality

Example format (50+ words):
"You have a passion for nature activities and outdoor adventures, always seeking experiences that connect you with the natural world. You prefer to avoid crowded tourist spots and instead look for quieter, more authentic destinations. When it comes to travel logistics, you tend to prefer afternoon flights that give you time to prepare. You're vegetarian and appreciate accommodations that cater to your dietary needs, typically choosing mid-range options that balance comfort and value."

Another example (50+ words):
"You enjoy exploring museums, hiking scenic trails, and relaxing on beautiful beaches during your travels. You have a strong preference for avoiding crowds and nightlife, instead seeking peaceful moments and cultural enrichment. You're vegan and love trying local cuisine that aligns with your dietary choices. Your travel style reflects a thoughtful approach to experiencing new places while staying true to your values and preferences."

Generate the summary now (must be at least 50 words):"""

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
            
            # Ensure summary is at least 50 words
            word_count = len(summary.split())
            logger.info(f"Initial summary word count: {word_count}")
            
            if word_count < 50:
                logger.warning(f"Summary is only {word_count} words, expanding to meet 50-word minimum...")
                # Add more context to reach 50 words
                summary = _expand_summary(summary, all_preferences, 50 - word_count)
                # Double-check after expansion
                final_word_count = len(summary.split())
                logger.info(f"After expansion word count: {final_word_count}")
                
                if final_word_count < 50:
                    logger.warning(f"Summary still only {final_word_count} words after expansion, forcing to 50 words...")
                    # Force add content to reach exactly 50 words
                    words_needed = 50 - final_word_count
                    filler = "This personalized approach to travel helps ensure that every trip you take reflects your unique preferences and travel style, making each journey more enjoyable and meaningful."
                    summary += " " + filler
                    final_word_count = len(summary.split())
            
            final_word_count = len(summary.split())
            logger.info(f"Profile summary generated successfully ({final_word_count} words): {summary[:100]}...")
            
            # Final validation - ensure we have at least 50 words
            if final_word_count < 50:
                logger.error(f"Summary still below 50 words ({final_word_count}), adding minimum filler...")
                # Emergency fallback - add enough words to reach 50
                while len(summary.split()) < 50:
                    summary += " Your travel preferences help create personalized and meaningful travel experiences."
                    if len(summary.split()) > 100:  # Safety check
                        break
            
            return summary if summary else "Your travel preferences are being analyzed. Check back soon for your profile summary!"
        except Exception as dedalus_error:
            logger.error(f"Error calling Dedalus for profile summary: {dedalus_error}", exc_info=True)
            # Fallback: Generate a simple summary without Dedalus
            logger.info("Falling back to simple summary generation...")
            return _generate_simple_summary(all_preferences)
        
    except Exception as e:
        logger.error(f"Error generating profile summary: {e}", exc_info=True)
        return "Unable to generate profile summary at this time. Please try again later."


def _expand_summary(summary: str, preferences: List[Dict[str, Any]], words_needed: int) -> str:
    """Expand a summary to reach the minimum word count (50 words)"""
    expanded = summary
    current_word_count = len(expanded.split())
    
    if current_word_count >= 50:
        return expanded
    
    # Add more details about preferences
    additional_context = []
    
    # Count preference types
    activity_count = sum(1 for p in preferences if p.get("category") == "activity")
    dietary_count = sum(1 for p in preferences if p.get("category") == "dietary")
    temporal_count = sum(1 for p in preferences if p.get("type") == "temporal")
    
    if activity_count > 0:
        additional_context.append(f"Your travel interests span {activity_count} different activity categories, showing a diverse range of preferences that shape your travel experiences.")
    
    if dietary_count > 0:
        additional_context.append("You pay close attention to dietary needs when planning your trips, ensuring that your food preferences are always considered.")
    
    if temporal_count > 0:
        additional_context.append("You have specific timing preferences for your travels, whether it's flight times, activity schedules, or seasonal considerations.")
    
    # Add frequency information if available
    high_frequency = [p for p in preferences if p.get("frequency", 1) >= 3]
    if high_frequency:
        additional_context.append("Some of these preferences have been consistently mentioned across multiple trips, indicating strong and well-established travel preferences.")
    
    # Add preference details
    if preferences:
        pref_categories = set(p.get("category", "") for p in preferences)
        if pref_categories:
            additional_context.append(f"Your preferences cover multiple aspects of travel including activities, accommodations, dining, and overall travel style.")
    
    # Combine with original summary
    for context in additional_context:
        if len(expanded.split()) < 50:
            expanded += " " + context
        else:
            break
    
    # If still not enough words, add generic travel personality context
    generic_contexts = [
        "Your travel style reflects a thoughtful and personalized approach to exploring new destinations, always considering your unique preferences and values when planning your adventures.",
        "You approach travel with careful consideration of what matters most to you, creating experiences that align with your personal travel philosophy.",
        "Your travel preferences demonstrate a well-developed sense of what you enjoy and what you prefer to avoid, helping you create more meaningful and enjoyable trips.",
    ]
    
    context_index = 0
    while len(expanded.split()) < 50:
        if context_index < len(generic_contexts):
            expanded += " " + generic_contexts[context_index]
            context_index += 1
        else:
            # Fallback: add a simple context
            expanded += " Your travel style reflects a thoughtful approach to experiencing new places while staying true to your values and preferences."
        
        # Safety check to prevent infinite loop
        if len(expanded.split()) > 200:
            break
    
    # Final guarantee - ensure we have at least 50 words
    final_word_count = len(expanded.split())
    if final_word_count < 50:
        # Add filler content to reach exactly 50 words
        words_to_add = 50 - final_word_count
        filler = "This personalized approach to travel helps ensure that every trip you take reflects your unique preferences and travel style, making each journey more enjoyable and meaningful."
        expanded += " " + filler
    
    return expanded


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
        summary = " ".join(parts)
        # Ensure summary is at least 50 words
        word_count = len(summary.split())
        logger.info(f"Simple summary initial word count: {word_count}")
        
        if word_count < 50:
            summary = _expand_summary(summary, preferences, 50 - word_count)
            # Double-check after expansion
            final_word_count = len(summary.split())
            logger.info(f"Simple summary after expansion word count: {final_word_count}")
            
            if final_word_count < 50:
                logger.warning(f"Simple summary still only {final_word_count} words, forcing to 50...")
                # Force add content to reach exactly 50 words
                filler = "This personalized approach to travel helps ensure that every trip you take reflects your unique preferences and travel style, making each journey more enjoyable and meaningful."
                summary += " " + filler
                final_word_count = len(summary.split())
                
                # Emergency fallback if still under 50
                while final_word_count < 50:
                    summary += " Your travel preferences help create personalized and meaningful travel experiences."
                    final_word_count = len(summary.split())
                    if final_word_count > 100:  # Safety check
                        break
        
        # Final validation
        final_word_count = len(summary.split())
        if final_word_count < 50:
            logger.error(f"Simple summary still below 50 words ({final_word_count}), this should not happen!")
            # Emergency: add words until we reach 50
            while len(summary.split()) < 50:
                summary += " Your travel style reflects thoughtful planning and personal preferences."
                if len(summary.split()) > 100:
                    break
        
        logger.info(f"Simple summary final word count: {len(summary.split())}")
        return summary
    else:
        return "Your travel preferences are being analyzed. Check back soon for your profile summary!"

