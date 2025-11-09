"""
SustainabilityAssistant - Conversational agent for Photon integration

Uses rapid-ai-dev concepts to provide intelligent responses to user queries
about travel itineraries, sustainability, and trip management.
"""

from __future__ import annotations

import logging
import os
from datetime import date, datetime, timedelta
from typing import Dict, Any, Optional, List
import httpx
import json
from .itinerary_cache import get_itinerary, get_latest_itinerary

logger = logging.getLogger(__name__)


class SustainabilityAssistant:
    """
    Conversational agent that handles user queries via iMessage.
    
    Maintains short-term memory and routes queries to appropriate
    backend endpoints, returning Photon-formatted responses.
    """
    
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
        self.memory: Dict[str, Any] = {
            "last_query": None,
            "last_itinerary": None,
            "last_user_id": None,
            "conversation_context": []
        }
        self.client = httpx.AsyncClient(timeout=30.0)
    
    async def close(self):
        """Close the HTTP client"""
        await self.client.aclose()
    
    def detect_intent(self, text: str) -> str:
        """
        Detect user intent from message text.
        
        Uses simple rule-based matching (can be enhanced with LLM).
        """
        text_lower = text.lower().strip()
        
        # Intent patterns
        if any(word in text_lower for word in ["today", "today's plan", "what's today", "today schedule"]):
            return "plan_today"
        elif any(word in text_lower for word in ["tomorrow", "tomorrow's plan", "what's tomorrow", "tomorrow schedule"]):
            return "plan_tomorrow"
        elif any(word in text_lower for word in ["rebook", "change flight", "reschedule flight", "different flight"]):
            return "rebook_flight"
        elif any(word in text_lower for word in ["other options", "alternatives", "more flights", "different options"]):
            return "other_options"
        elif any(word in text_lower for word in ["eco", "sustainability", "carbon", "emissions", "environmental", "green"]):
            return "trip_summary"
        elif any(word in text_lower for word in ["what to do", "recommendations", "suggestions", "activities", "things to do"]):
            return "things_to_do"
        elif any(word in text_lower for word in ["summary", "overview", "trip summary", "itinerary summary"]):
            return "trip_summary"
        else:
            return "general"
    
    async def handle_query(
        self, 
        text: str, 
        user_id: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Main handler for user queries.
        
        Returns Photon-formatted JSON response.
        """
        intent = self.detect_intent(text)
        logger.info(f"Detected intent: {intent} for query: {text[:50]}")
        
        # Update memory
        self.memory["last_query"] = text
        if user_id:
            self.memory["last_user_id"] = user_id
        
        # Auto-load itinerary from cache if not provided in context
        if not context or not context.get("itinerary"):
            cached_itinerary = get_itinerary(user_id) or get_latest_itinerary()
            if cached_itinerary:
                logger.info(f"Auto-loaded itinerary from cache for user {user_id}")
                if not context:
                    context = {}
                context["itinerary"] = cached_itinerary
        
        try:
            if intent == "plan_today":
                return await self._handle_plan_today(user_id, context)
            elif intent == "plan_tomorrow":
                return await self._handle_plan_tomorrow(user_id, context)
            elif intent == "rebook_flight":
                return await self._handle_rebook_flight(user_id, context)
            elif intent == "other_options":
                return await self._handle_other_options(user_id, context)
            elif intent == "trip_summary":
                return await self._handle_trip_summary(user_id, context)
            elif intent == "things_to_do":
                return await self._handle_things_to_do(text, user_id, context)
            else:
                return await self._handle_general(text, user_id, context)
        except Exception as e:
            logger.error(f"Error handling query: {e}", exc_info=True)
            return {
                "type": "message",
                "text": f"I encountered an error processing your request. Please try again later. 🌿",
                "buttons": []
            }
    
    async def _handle_plan_today(
        self, 
        user_id: Optional[str],
        context: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Get today's plan from itinerary"""
        today = date.today().isoformat()
        
        # Try to get itinerary from context or memory
        itinerary = context.get("itinerary") if context else self.memory.get("last_itinerary")
        
        if not itinerary:
            return {
                "type": "message",
                "text": "I don't have an active itinerary. Please generate one first using the web app! 📱",
                "buttons": []
            }
        
        # Extract today's activities
        days = itinerary.get("days", [])
        today_plan = self._extract_day_plan(days, today)
        
        if today_plan:
            message = f"🌅 **Today's Plan** ({today}):\n\n{today_plan}"
            return {
                "type": "message",
                "text": message,
                "buttons": ["Rebook", "More options", "Eco summary"]
            }
        else:
            return {
                "type": "message",
                "text": f"I don't have a plan for today ({today}). Your trip might start on a different date. 📅",
                "buttons": []
            }
    
    async def _handle_plan_tomorrow(
        self,
        user_id: Optional[str],
        context: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Get tomorrow's plan from itinerary"""
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        
        itinerary = context.get("itinerary") if context else self.memory.get("last_itinerary")
        
        if not itinerary:
            return {
                "type": "message",
                "text": "I don't have an active itinerary. Please generate one first! 📱",
                "buttons": []
            }
        
        days = itinerary.get("days", [])
        tomorrow_plan = self._extract_day_plan(days, tomorrow)
        
        if tomorrow_plan:
            message = f"🌅 **Tomorrow's Plan** ({tomorrow}):\n\n{tomorrow_plan}"
            return {
                "type": "message",
                "text": message,
                "buttons": ["Rebook", "More options", "Eco summary"]
            }
        else:
            return {
                "type": "message",
                "text": f"I don't have a plan for tomorrow ({tomorrow}). Check your trip dates! 📅",
                "buttons": []
            }
    
    async def _handle_rebook_flight(
        self,
        user_id: Optional[str],
        context: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Handle flight rebooking request"""
        itinerary = context.get("itinerary") if context else self.memory.get("last_itinerary")
        
        if not itinerary:
            return {
                "type": "message",
                "text": "I need your itinerary to help rebook flights. Please generate one first! ✈️",
                "buttons": []
            }
        
        flights = itinerary.get("flights", [])
        if not flights:
            return {
                "type": "message",
                "text": "I don't see any flights in your itinerary. Generate a new itinerary with flights to rebook! ✈️",
                "buttons": []
            }
        
        # For now, provide guidance (actual rebooking would need booking_id)
        return {
            "type": "message",
            "text": "To rebook your flight, please visit the web app and use the rebooking feature. I can help you find alternative flights if you'd like! ✈️",
            "buttons": ["Other options", "Trip summary"]
        }
    
    async def _handle_other_options(
        self,
        user_id: Optional[str],
        context: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Get alternative flight/lodging options"""
        itinerary = context.get("itinerary") if context else self.memory.get("last_itinerary")
        
        if not itinerary:
            return {
                "type": "message",
                "text": "I need your itinerary to find alternatives. Generate one first! 🔄",
                "buttons": []
            }
        
        # Extract current selections
        current_flights = itinerary.get("flights", [])
        current_lodging = itinerary.get("lodging", [])
        
        message = "Here are some alternatives:\n\n"
        
        if current_flights:
            message += "✈️ **Alternative Flights:**\n"
            message += "Visit the web app to see more flight options with different times and prices.\n\n"
        
        if current_lodging:
            message += "🏨 **Alternative Hotels:**\n"
            message += "Check the web app for more lodging options in different areas.\n\n"
        
        message += "I can help you compare sustainability scores too! 🌿"
        
        return {
            "type": "message",
            "text": message,
            "buttons": ["Eco summary", "Trip summary"]
        }
    
    async def _handle_trip_summary(
        self,
        user_id: Optional[str],
        context: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Get sustainability/eco summary of trip"""
        itinerary = context.get("itinerary") if context else self.memory.get("last_itinerary")
        
        if not itinerary:
            return {
                "type": "message",
                "text": "I need your itinerary to provide an eco summary. Generate one first! 🌿",
                "buttons": []
            }
        
        # Extract sustainability info
        sustainability = itinerary.get("sustainability", {})
        total_emissions = itinerary.get("total_emissions", 0)
        eco_score = sustainability.get("score", 0) if isinstance(sustainability, dict) else 0
        
        message = f"🌿 **Eco-Friendly Trip Summary**\n\n"
        
        if total_emissions:
            message += f"📊 **Carbon Footprint:** {total_emissions:.1f} kg CO₂\n"
        
        if eco_score:
            message += f"⭐ **Eco Score:** {eco_score}/100\n"
        
        if isinstance(sustainability, dict):
            breakdown = sustainability.get("breakdown", [])
            if breakdown:
                message += f"\n**Highlights:**\n"
                for item in breakdown[:3]:  # Top 3
                    message += f"• {item}\n"
        
        message += "\nYour trip is optimized for sustainability! 🌍"
        
        return {
            "type": "message",
            "text": message,
            "buttons": ["More options", "Today's plan"]
        }
    
    async def _handle_things_to_do(
        self,
        text: str,
        user_id: Optional[str],
        context: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Get recommendations for things to do"""
        itinerary = context.get("itinerary") if context else self.memory.get("last_itinerary")
        
        if not itinerary:
            # Try to extract destination from text
            destination = self._extract_destination(text)
            if destination:
                return {
                    "type": "message",
                    "text": f"To get recommendations for {destination}, please generate an itinerary first using the web app! I'll include great activities in your plan. 🎯",
                    "buttons": []
                }
            else:
                return {
                    "type": "message",
                    "text": "I need to know your destination to suggest activities. Generate an itinerary or tell me where you're going! 🗺️",
                    "buttons": []
                }
        
        # Get POIs from itinerary
        pois = itinerary.get("points_of_interest", [])
        if pois:
            message = "🎯 **Top Recommendations:**\n\n"
            for poi in pois[:5]:  # Top 5
                name = poi.get("name", "Activity")
                message += f"• {name}\n"
            message += "\nCheck your full itinerary in the app for details! 📱"
        else:
            message = "Your itinerary includes great activities! Check the web app for the full list. 📱"
        
        return {
            "type": "message",
            "text": message,
            "buttons": ["Today's plan", "Eco summary"]
        }
    
    async def _handle_general(
        self,
        text: str,
        user_id: Optional[str],
        context: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Handle general queries"""
        # Try using chat_planner if available
        itinerary = context.get("itinerary") if context else self.memory.get("last_itinerary")
        
        if itinerary:
            try:
                response = await self.client.post(
                    f"{self.base_url}/chat_planner",
                    json={
                        "message": text,
                        "itinerary": itinerary,
                        "user_id": user_id
                    }
                )
                
                if response.status_code == 200:
                    data = response.json()
                    return {
                        "type": "message",
                        "text": data.get("response", "I'm here to help with your travel plans! 🌿"),
                        "buttons": ["Today's plan", "Eco summary", "More options"]
                    }
            except Exception as e:
                logger.warning(f"Chat planner failed: {e}")
        
        # Default response
        return {
            "type": "message",
            "text": "I can help you with:\n• Today's plan\n• Tomorrow's schedule\n• Flight rebooking\n• Eco-friendly trip summary\n• Recommendations\n\nWhat would you like to know? 🌿",
            "buttons": ["Today's plan", "Eco summary", "More options"]
        }
    
    def _extract_day_plan(self, days: List[Dict[str, Any]], target_date: str) -> Optional[str]:
        """Extract plan for a specific date from itinerary days"""
        if not days:
            return None
        
        # Find matching day
        for day in days:
            day_date = day.get("date")
            if day_date == target_date:
                plan_parts = []
                
                morning = day.get("morning")
                if morning:
                    activity = morning.get("activity", morning) if isinstance(morning, dict) else morning
                    plan_parts.append(f"🌅 Morning: {activity}")
                
                afternoon = day.get("afternoon")
                if afternoon:
                    activity = afternoon.get("activity", afternoon) if isinstance(afternoon, dict) else afternoon
                    plan_parts.append(f"☀️ Afternoon: {activity}")
                
                evening = day.get("evening")
                if evening:
                    activity = evening.get("activity", evening) if isinstance(evening, dict) else evening
                    plan_parts.append(f"🌙 Evening: {activity}")
                
                return "\n".join(plan_parts) if plan_parts else None
        
        return None
    
    def _extract_destination(self, text: str) -> Optional[str]:
        """Extract destination from text (simple pattern matching)"""
        # Simple extraction - can be enhanced with NLP
        text_lower = text.lower()
        
        # Look for "in [place]" or "to [place]"
        import re
        patterns = [
            r"in ([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)",
            r"to ([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)",
            r"([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)"
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                return match.group(1)
        
        return None
    
    def update_memory(self, key: str, value: Any):
        """Update agent memory"""
        self.memory[key] = value
    
    def get_memory(self, key: str) -> Any:
        """Get value from memory"""
        return self.memory.get(key)

