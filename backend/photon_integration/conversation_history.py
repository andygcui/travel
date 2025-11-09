"""
Conversation history storage for Photon integration.

Stores conversation history per trip_id so Dedalus can maintain context
across multiple text messages for the same saved trip.
"""

from __future__ import annotations

import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
from services.supabase_client import get_supabase_client

logger = logging.getLogger(__name__)


async def save_conversation_message(
    trip_id: str,
    user_id: str,
    user_message: str,
    assistant_response: str
) -> bool:
    """
    Save a conversation message pair to the database.
    
    Args:
        trip_id: The saved trip ID
        user_id: The user ID
        user_message: The user's message
        assistant_response: The assistant's response
        
    Returns:
        True if saved successfully, False otherwise
    """
    supabase = get_supabase_client()
    if not supabase:
        logger.warning("Supabase client not available, conversation history not saved")
        return False
    
    try:
        result = supabase.table("photon_conversations").insert({
            "trip_id": trip_id,
            "user_id": user_id,
            "user_message": user_message,
            "assistant_response": assistant_response,
            "created_at": datetime.utcnow().isoformat()
        }).execute()
        
        logger.info(f"Saved conversation message for trip {trip_id}")
        return True
    except Exception as e:
        logger.error(f"Error saving conversation message: {e}", exc_info=True)
        return False


async def get_conversation_history(
    trip_id: str,
    limit: int = 10
) -> List[Dict[str, Any]]:
    """
    Retrieve conversation history for a trip.
    
    Args:
        trip_id: The saved trip ID
        limit: Maximum number of recent messages to retrieve
        
    Returns:
        List of conversation messages, ordered by created_at (oldest first)
    """
    supabase = get_supabase_client()
    if not supabase:
        logger.warning("Supabase client not available, returning empty conversation history")
        return []
    
    try:
        result = supabase.table("photon_conversations")\
            .select("*")\
            .eq("trip_id", trip_id)\
            .order("created_at", desc=False)\
            .limit(limit)\
            .execute()
        
        conversations = result.data if result.data else []
        logger.info(f"Retrieved {len(conversations)} conversation messages for trip {trip_id}")
        return conversations
    except Exception as e:
        logger.error(f"Error retrieving conversation history: {e}", exc_info=True)
        return []


def format_conversation_history_for_prompt(
    conversations: List[Dict[str, Any]]
) -> str:
    """
    Format conversation history for inclusion in Dedalus prompt.
    
    Args:
        conversations: List of conversation messages
        
    Returns:
        Formatted string for prompt
    """
    if not conversations:
        return ""
    
    formatted = "\n\nPREVIOUS CONVERSATION HISTORY:\n"
    formatted += "The following is the conversation history for this trip:\n\n"
    
    for conv in conversations:
        user_msg = conv.get("user_message", "")
        assistant_msg = conv.get("assistant_response", "")
        
        if user_msg:
            formatted += f"User: {user_msg}\n"
        if assistant_msg:
            formatted += f"Assistant: {assistant_msg}\n"
        formatted += "\n"
    
    formatted += "Use this conversation history to provide context-aware responses. "
    formatted += "Reference previous topics discussed and maintain continuity in the conversation.\n"
    
    return formatted

