"""
Simple in-memory cache for recently generated itineraries

Stores itineraries by user_id so the AI can access them automatically
"""

from typing import Dict, Any, Optional
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

# In-memory cache: {user_id: {itinerary: {...}, timestamp: datetime}}
_itinerary_cache: Dict[str, Dict[str, Any]] = {}

# Cache expiration: 24 hours
CACHE_EXPIRY_HOURS = 24


def store_itinerary(user_id: str, itinerary: Dict[str, Any]):
    """Store an itinerary for a user"""
    _itinerary_cache[user_id] = {
        "itinerary": itinerary,
        "timestamp": datetime.now()
    }
    logger.info(f"Stored itinerary for user {user_id}")


def get_itinerary(user_id: Optional[str]) -> Optional[Dict[str, Any]]:
    """Get the most recent itinerary for a user"""
    if not user_id:
        # If no user_id, return the most recent itinerary from any user
        if not _itinerary_cache:
            return None
        
        # Get the most recent one
        most_recent = max(_itinerary_cache.items(), key=lambda x: x[1]["timestamp"])
        logger.info(f"Returning most recent itinerary (no user_id provided)")
        return most_recent[1]["itinerary"]
    
    if user_id not in _itinerary_cache:
        return None
    
    cache_entry = _itinerary_cache[user_id]
    
    # Check if expired
    age = datetime.now() - cache_entry["timestamp"]
    if age > timedelta(hours=CACHE_EXPIRY_HOURS):
        logger.info(f"Itinerary for user {user_id} expired, removing from cache")
        del _itinerary_cache[user_id]
        return None
    
    return cache_entry["itinerary"]


def get_latest_itinerary() -> Optional[Dict[str, Any]]:
    """Get the most recently generated itinerary (any user)"""
    if not _itinerary_cache:
        return None
    
    # Get the most recent one
    most_recent = max(_itinerary_cache.items(), key=lambda x: x[1]["timestamp"])
    return most_recent[1]["itinerary"]


def clear_cache(user_id: Optional[str] = None):
    """Clear cache for a specific user or all users"""
    if user_id:
        if user_id in _itinerary_cache:
            del _itinerary_cache[user_id]
            logger.info(f"Cleared cache for user {user_id}")
    else:
        _itinerary_cache.clear()
        logger.info("Cleared all itinerary cache")

