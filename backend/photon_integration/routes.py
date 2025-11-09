"""
Photon Integration Routes

Defines the /photon/message endpoint for iMessage integration.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
import logging
import os

from .photon_agent import SustainabilityAssistant
from .itinerary_cache import get_latest_itinerary

logger = logging.getLogger(__name__)

router = APIRouter()

# Global assistant instance
_assistant: Optional[SustainabilityAssistant] = None


def get_assistant() -> SustainabilityAssistant:
    """Get or create the SustainabilityAssistant instance"""
    global _assistant
    
    if _assistant is None:
        base_url = os.getenv("BACKEND_URL", "http://localhost:8000")
        _assistant = SustainabilityAssistant(base_url=base_url)
        logger.info("Initialized SustainabilityAssistant")
    
    return _assistant


class PhotonMessageRequest(BaseModel):
    """Request model for Photon messages"""
    text: str
    user_id: Optional[str] = None
    context: Optional[Dict[str, Any]] = None  # Can include itinerary, trip_id, etc.


class PhotonMessageResponse(BaseModel):
    """Response model for Photon messages"""
    type: str = "message"
    text: str
    buttons: list = []


@router.post("/message", response_model=PhotonMessageResponse)
async def handle_photon_message(request: PhotonMessageRequest):
    """
    Handle incoming messages from Photon iMessage integration.
    
    This endpoint:
    1. Instantiates SustainabilityAssistant
    2. Determines intent from user message
    3. Calls existing backend routes internally
    4. Returns Photon-formatted JSON response
    
    Example:
        POST /photon/message
        {
            "text": "What's the plan for today?",
            "user_id": "user-123",
            "context": {
                "itinerary": {...}
            }
        }
    """
    try:
        assistant = get_assistant()
        
        # Auto-load itinerary if not provided and available in cache
        context = request.context or {}
        if not context.get("itinerary"):
            latest_itinerary = get_latest_itinerary()
            if latest_itinerary:
                context["itinerary"] = latest_itinerary
                logger.info("Auto-loaded latest itinerary from cache")
        
        # Handle the query
        response = await assistant.handle_query(
            text=request.text,
            user_id=request.user_id,
            context=context if context else None
        )
        
        # Ensure response matches Photon format
        if not isinstance(response, dict):
            response = {"type": "message", "text": str(response), "buttons": []}
        
        # Validate response structure
        if "type" not in response:
            response["type"] = "message"
        if "text" not in response:
            response["text"] = "I'm here to help! 🌿"
        if "buttons" not in response:
            response["buttons"] = []
        
        logger.info(f"Photon message handled: intent detected, response generated")
        
        return PhotonMessageResponse(**response)
    
    except Exception as e:
        logger.error(f"Error handling Photon message: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error processing message: {str(e)}"
        )


@router.get("/health")
async def photon_health():
    """Health check for Photon integration"""
    return {
        "status": "healthy",
        "assistant_initialized": _assistant is not None,
        "photon_api_key_set": bool(os.getenv("PHOTON_API_KEY")),
    }

