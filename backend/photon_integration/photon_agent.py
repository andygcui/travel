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
import re
from .itinerary_cache import get_itinerary, get_latest_itinerary
from dedalus_labs import AsyncDedalus, DedalusRunner

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
        
        Uses enhanced rule-based matching with more patterns.
        """
        text_lower = text.lower().strip()
        
        # Intent patterns (more comprehensive)
        if any(word in text_lower for word in ["next location", "where next", "next place", "where to go next", "next stop", "what's next"]):
            return "next_location"
        elif any(word in text_lower for word in ["how to get", "directions", "how do i get", "route", "way to", "navigate"]):
            return "directions"
        elif any(word in text_lower for word in ["today", "today's plan", "what's today", "today schedule", "what am i doing today"]):
            return "plan_today"
        elif any(word in text_lower for word in ["tomorrow", "tomorrow's plan", "what's tomorrow", "tomorrow schedule", "what am i doing tomorrow"]):
            return "plan_tomorrow"
        elif re.search(r"day\s*(\d+)", text_lower) or any(word in text_lower for word in ["day 1", "day 2", "day 3", "first day", "second day", "third day"]):
            return "plan_specific_day"
        elif any(word in text_lower for word in ["rebook", "change flight", "reschedule flight", "different flight", "switch flight"]):
            return "rebook_flight"
        elif any(word in text_lower for word in ["other options", "alternatives", "more flights", "different options", "other flights"]):
            return "other_options"
        elif any(word in text_lower for word in ["eco", "sustainability", "carbon", "emissions", "environmental", "green", "eco-friendly", "carbon footprint"]):
            return "trip_summary"
        elif any(word in text_lower for word in ["what to do", "recommendations", "suggestions", "activities", "things to do", "attractions", "places to visit"]):
            return "things_to_do"
        elif any(word in text_lower for word in ["summary", "overview", "trip summary", "itinerary summary", "tell me about my trip"]):
            return "trip_summary"
        elif any(word in text_lower for word in ["flight", "flights", "airline", "departure", "arrival"]):
            return "flight_info"
        elif any(word in text_lower for word in ["hotel", "hotels", "lodging", "accommodation", "where am i staying"]):
            return "hotel_info"
        elif any(word in text_lower for word in ["weather", "forecast", "temperature", "rain", "sunny"]):
            return "weather_info"
        elif any(word in text_lower for word in ["cost", "price", "budget", "how much", "total cost", "spending"]):
            return "cost_info"
        elif any(word in text_lower for word in ["destination", "where am i going", "where are we going", "trip to"]):
            return "destination_info"
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
        
        # Try to fetch fresh itinerary from backend if cache is stale or missing
        itinerary = context.get("itinerary") if context else self.memory.get("last_itinerary")
        if not itinerary or self._is_cache_stale(user_id):
            logger.info("Cache is stale or missing, attempting to fetch from backend")
            fresh_itinerary = await self._fetch_latest_itinerary_from_backend()
            if fresh_itinerary:
                itinerary = fresh_itinerary
                if not context:
                    context = {}
                context["itinerary"] = fresh_itinerary
                logger.info("Fetched fresh itinerary from backend")
        
        try:
            # For specific intents that need structured data, handle them first
            if intent == "next_location":
                return await self._handle_next_location(user_id, context)
            elif intent == "directions":
                return await self._handle_directions(text, user_id, context)
            else:
                # Use Dedalus for all other responses
                return await self._generate_llm_response(text, intent, itinerary, user_id)
        except Exception as e:
            logger.error(f"Error handling query: {e}", exc_info=True)
            return {
                "type": "message",
                "text": "I encountered an error processing your request. Please try again later.",
                "buttons": []
            }
    
    def _is_cache_stale(self, user_id: Optional[str]) -> bool:
        """Check if cached itinerary is stale (older than 1 hour)"""
        from .itinerary_cache import get_itinerary
        itinerary = get_itinerary(user_id)
        # If no itinerary, consider it stale
        return itinerary is None
    
    async def _fetch_latest_itinerary_from_backend(self) -> Optional[Dict[str, Any]]:
        """Fetch the latest itinerary from the backend API"""
        try:
            response = await self.client.get(f"{self.base_url}/latest_itinerary")
            if response.status_code == 200:
                data = response.json()
                if data.get("found") and data.get("itinerary"):
                    logger.info("Successfully fetched latest itinerary from backend")
                    return data.get("itinerary")
                else:
                    logger.info("Backend returned no itinerary")
                    return None
            else:
                logger.warning(f"Backend returned status {response.status_code}")
                return None
        except Exception as e:
            logger.warning(f"Could not fetch from backend: {e}")
            return None
    
    async def _generate_llm_response(
        self,
        text: str,
        intent: str,
        itinerary: Optional[Dict[str, Any]],
        user_id: Optional[str]
    ) -> Dict[str, Any]:
        """Generate a natural language response using Dedalus"""
        
        # Build comprehensive context about the itinerary
        itinerary_context = ""
        if itinerary:
            destination = itinerary.get("destination", "unknown")
            num_days = itinerary.get("num_days", 0)
            start_date = itinerary.get("start_date", "")
            end_date = itinerary.get("end_date", "")
            budget = itinerary.get("budget", 0)
            mode = itinerary.get("mode", "balanced")
            totals = itinerary.get("totals", {})
            total_cost = totals.get("cost", 0) if isinstance(totals, dict) else 0
            total_emissions = totals.get("emissions_kg", 0) if isinstance(totals, dict) else 0
            eco_score = itinerary.get("eco_score", 0)
            rationale = itinerary.get("rationale", "")
            
            itinerary_context = f"""
CURRENT ITINERARY DETAILS:
Destination: {destination}
Duration: {num_days} days
Dates: {start_date} to {end_date}
Budget: ${budget:,.0f}
Mode: {mode}
Total Cost: ${total_cost:,.0f}
Carbon Footprint: {total_emissions:.1f} kg CO₂
Eco Score: {eco_score}/100
"""
            
            if rationale:
                itinerary_context += f"Trip Rationale: {rationale[:300]}\n"
            
            # Add complete day-by-day details
            days = itinerary.get("days", [])
            day_attractions = itinerary.get("day_attractions", [])
            day_weather = itinerary.get("day_weather", [])
            
            if days:
                itinerary_context += "\nCOMPLETE DAILY PLAN:\n"
                for day in days:
                    day_num = day.get("day", 0)
                    morning = day.get("morning", "")
                    afternoon = day.get("afternoon", "")
                    evening = day.get("evening", "")
                    
                    itinerary_context += f"\nDay {day_num}:\n"
                    if morning:
                        itinerary_context += f"  Morning: {morning}\n"
                    if afternoon:
                        itinerary_context += f"  Afternoon: {afternoon}\n"
                    if evening:
                        itinerary_context += f"  Evening: {evening}\n"
                    
                    # Add attractions for this day
                    day_bundle = None
                    for bundle in day_attractions:
                        if bundle.get("day") == day_num:
                            day_bundle = bundle
                            break
                    
                    if day_bundle:
                        if day_bundle.get("morning"):
                            poi = day_bundle.get("morning")
                            if isinstance(poi, dict):
                                poi_name = poi.get("name", "")
                                poi_desc = poi.get("description", "")
                                if poi_name:
                                    itinerary_context += f"    Morning Location: {poi_name}"
                                    if poi_desc:
                                        itinerary_context += f" - {poi_desc[:100]}"
                                    itinerary_context += "\n"
                        if day_bundle.get("afternoon"):
                            poi = day_bundle.get("afternoon")
                            if isinstance(poi, dict):
                                poi_name = poi.get("name", "")
                                poi_desc = poi.get("description", "")
                                if poi_name:
                                    itinerary_context += f"    Afternoon Location: {poi_name}"
                                    if poi_desc:
                                        itinerary_context += f" - {poi_desc[:100]}"
                                    itinerary_context += "\n"
                        if day_bundle.get("evening"):
                            poi = day_bundle.get("evening")
                            if isinstance(poi, dict):
                                poi_name = poi.get("name", "")
                                poi_desc = poi.get("description", "")
                                if poi_name:
                                    itinerary_context += f"    Evening Location: {poi_name}"
                                    if poi_desc:
                                        itinerary_context += f" - {poi_desc[:100]}"
                                    itinerary_context += "\n"
                    
                    # Add weather for this day
                    weather_for_day = None
                    for weather in day_weather:
                        if weather.get("day") == day_num or (isinstance(weather.get("date"), str) and str(day_num) in str(weather.get("date", ""))):
                            weather_for_day = weather
                            break
                        # Try by index
                        try:
                            if day_weather.index(weather) + 1 == day_num:
                                weather_for_day = weather
                                break
                        except:
                            pass
                    
                    if weather_for_day:
                        morning_w = weather_for_day.get("morning", {})
                        afternoon_w = weather_for_day.get("afternoon", {})
                        evening_w = weather_for_day.get("evening", {})
                        if morning_w or afternoon_w or evening_w:
                            itinerary_context += "    Weather: "
                            if morning_w:
                                temp = morning_w.get("temperature_c", 0)
                                precip = morning_w.get("precipitation_probability", 0) * 100
                                itinerary_context += f"Morning {temp:.0f}°C ({precip:.0f}% rain), "
                            if afternoon_w:
                                temp = afternoon_w.get("temperature_c", 0)
                                precip = afternoon_w.get("precipitation_probability", 0) * 100
                                itinerary_context += f"Afternoon {temp:.0f}°C ({precip:.0f}% rain), "
                            if evening_w:
                                temp = evening_w.get("temperature_c", 0)
                                precip = evening_w.get("precipitation_probability", 0) * 100
                                itinerary_context += f"Evening {temp:.0f}°C ({precip:.0f}% rain)"
                            itinerary_context += "\n"
            
            # Add all flights with full details
            flights = itinerary.get("flights", [])
            if flights:
                itinerary_context += "\nFLIGHT DETAILS:\n"
                for i, flight in enumerate(flights, 1):
                    carrier = flight.get("carrier", "")
                    origin = flight.get("origin", "")
                    dest = flight.get("destination", "")
                    departure = flight.get("departure", "")
                    arrival = flight.get("arrival", "")
                    price = flight.get("price", 0)
                    emissions = flight.get("emissions_kg", 0)
                    eco_score_flight = flight.get("eco_score", 0)
                    
                    itinerary_context += f"Flight {i}: {carrier}\n"
                    itinerary_context += f"  Route: {origin} to {dest}\n"
                    if departure:
                        itinerary_context += f"  Departure: {departure}\n"
                    if arrival:
                        itinerary_context += f"  Arrival: {arrival}\n"
                    if price:
                        itinerary_context += f"  Price: ${price:,.0f}\n"
                    if emissions:
                        itinerary_context += f"  Emissions: {emissions:.1f} kg CO₂\n"
                    if eco_score_flight:
                        itinerary_context += f"  Eco Score: {eco_score_flight}/100\n"
            
            # Add all hotels with full details
            hotels = itinerary.get("hotels", [])
            if hotels:
                itinerary_context += "\nHOTEL DETAILS:\n"
                for i, hotel in enumerate(hotels, 1):
                    name = hotel.get("name", "")
                    address = hotel.get("address", "")
                    nightly_rate = hotel.get("nightly_rate", 0)
                    rating = hotel.get("rating", 0)
                    sustainability = hotel.get("sustainability_score", 0)
                    emissions = hotel.get("emissions_kg", 0)
                    
                    itinerary_context += f"Hotel {i}: {name}\n"
                    if address:
                        itinerary_context += f"  Address: {address}\n"
                    if nightly_rate:
                        itinerary_context += f"  Rate: ${nightly_rate:.0f}/night\n"
                    if rating:
                        itinerary_context += f"  Rating: {rating:.1f}/5.0\n"
                    if sustainability:
                        itinerary_context += f"  Sustainability: {sustainability*100:.0f}%\n"
                    if emissions:
                        itinerary_context += f"  Emissions: {emissions:.1f} kg CO₂/night\n"
            
            # Add top attractions
            attractions = itinerary.get("attractions", [])
            if attractions:
                itinerary_context += "\nTOP ATTRACTIONS:\n"
                for i, poi in enumerate(attractions[:10], 1):  # Top 10
                    name = poi.get("name", "")
                    category = poi.get("category", "")
                    description = poi.get("description", "")
                    rating = poi.get("rating", 0)
                    if name:
                        itinerary_context += f"{i}. {name}"
                        if category:
                            itinerary_context += f" ({category})"
                        if rating:
                            itinerary_context += f" - Rating: {rating:.1f}/5"
                        itinerary_context += "\n"
                        if description:
                            itinerary_context += f"   {description[:150]}...\n"
        else:
            itinerary_context = "No active itinerary found. The user needs to generate one first using the web app at http://localhost:3000 or the /generate_itinerary endpoint."
        
        # Also include the full itinerary JSON for Dedalus to parse if needed
        itinerary_json = ""
        if itinerary:
            try:
                # Convert itinerary to JSON string (limit size to avoid token limits)
                import json as json_module
                itinerary_json = json_module.dumps(itinerary, default=str, indent=2)[:5000]  # Limit to 5000 chars
            except Exception as e:
                logger.warning(f"Could not serialize itinerary to JSON: {e}")
        
        # Build the prompt for Dedalus
        prompt = f"""You are a helpful travel assistant for a sustainable travel planning app. A user is asking you about their trip via text message.

USER QUESTION: "{text}"

DETECTED INTENT: {intent}

{itinerary_context}

INSTRUCTIONS:
1. Provide a natural, conversational response to the user's question
2. Be helpful and friendly, but concise (aim for 2-4 sentences)
3. Use the itinerary information above to answer their question accurately
4. If they ask about "next location" or "directions", mention that they can ask specifically for that
5. If they ask about costs, flights, hotels, weather, or activities, use the data provided above
6. If no itinerary is available, politely suggest they generate one first using the web app
7. Do NOT use emojis in your response
8. Do NOT use markdown formatting like **bold** or *italic* - iMessage doesn't support it
9. Format your response naturally for a text message conversation with good spacing
10. Use line breaks to separate different ideas or pieces of information
11. Break up long paragraphs into shorter, readable chunks
12. Use blank lines between major sections if listing multiple items
13. Keep sentences short and conversational
14. If relevant, you can mention specific locations, times, or details from the itinerary
15. Reference specific details from the itinerary when answering (e.g., specific hotel names, flight times, attraction names)

FORMATTING GUIDELINES:
- Use line breaks (\\n) to separate different thoughts
- Add spacing between different pieces of information
- Keep paragraphs to 2-3 sentences max
- Use bullet points or line breaks when listing multiple items
- Make it easy to scan and read quickly
- NO markdown formatting - just plain text with line breaks

Generate a helpful, natural response with good spacing and formatting:"""
        
        # Add full JSON if available (for Dedalus to parse if needed)
        if itinerary_json:
            prompt += f"\n\nFULL ITINERARY JSON (for reference):\n{itinerary_json[:2000]}..."  # Limit JSON size

        try:
            client = AsyncDedalus()
            runner = DedalusRunner(client)
            
            logger.info(f"Calling Dedalus to generate response for intent: {intent}")
            result = await runner.run(
                input=prompt,
                model="openai/gpt-4o",
                max_steps=3,  # Fewer steps for faster responses
                stream=False,
            )
            
            response_text = result.final_output if hasattr(result, 'final_output') else str(result)
            response_text = response_text.strip().strip('"').strip("'")
            
            # Format the response for better readability
            response_text = self._format_response_for_readability(response_text)
            
            # Determine appropriate buttons based on intent
            buttons = self._get_buttons_for_intent(intent)
            
            # For next location queries, add maps links if we have location data
            if intent in ["next_location", "directions"] and itinerary:
                next_location = self._get_next_location(itinerary)
                if next_location and next_location.get("poi"):
                    poi = next_location.get("poi")
                    if isinstance(poi, dict):
                        poi_name = poi.get("name", "")
                        poi_lat = poi.get("latitude")
                        poi_lng = poi.get("longitude")
                        if poi_lat and poi_lng:
                            maps_links = self._generate_maps_links(poi_name, poi_lat, poi_lng)
                            if maps_links.get("apple_maps"):
                                response_text += f"\n\nApple Maps: {maps_links['apple_maps']}"
                            if maps_links.get("google_maps"):
                                response_text += f"\nGoogle Maps: {maps_links['google_maps']}"
            
            return {
                "type": "message",
                "text": response_text,
                "buttons": buttons
            }
            
        except Exception as e:
            logger.error(f"Error calling Dedalus: {e}", exc_info=True)
            # Fallback to simple response
            return {
                "type": "message",
                "text": "I'm having trouble processing that right now. Could you try rephrasing your question?",
                "buttons": ["Today's plan", "Trip summary"]
            }
    
    def _format_response_for_readability(self, text: str) -> str:
        """Format response text for better readability with proper spacing"""
        if not text:
            return text
        
        import re
        
        # Remove markdown formatting (iMessage doesn't support it)
        # Remove ** for bold
        text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)
        # Remove * for italic
        text = re.sub(r'\*([^*]+)\*', r'\1', text)
        # Remove __ for bold
        text = re.sub(r'__([^_]+)__', r'\1', text)
        # Remove _ for italic
        text = re.sub(r'_([^_]+)_', r'\1', text)
        
        # First, preserve any existing line breaks
        if '\n\n' in text or '\n' in text:
            # Already has some formatting, just clean it up
            text = re.sub(r'\n{3,}', '\n\n', text)
            return text.strip()
        
        # Split into sentences (preserving punctuation)
        # Match sentence endings followed by space and capital letter
        sentences = re.split(r'([.!?]+)\s+', text)
        
        # Recombine sentences with punctuation
        complete_sentences = []
        for i in range(0, len(sentences) - 1, 2):
            if i + 1 < len(sentences):
                sentence = (sentences[i] + sentences[i + 1]).strip()
                if sentence:
                    complete_sentences.append(sentence)
        if len(sentences) % 2 == 1 and sentences[-1].strip():
            complete_sentences.append(sentences[-1].strip())
        
        # If we have multiple sentences, group them into readable paragraphs
        if len(complete_sentences) <= 1:
            return text  # Single sentence, return as-is
        
        # Group sentences: 2-3 sentences per paragraph
        paragraphs = []
        current_para = []
        
        for i, sentence in enumerate(complete_sentences):
            current_para.append(sentence)
            
            # Start new paragraph after 2-3 sentences, or at natural breaks
            if len(current_para) >= 2:
                # Check if next sentence starts a new topic (heuristic)
                if i < len(complete_sentences) - 1:
                    next_sentence = complete_sentences[i + 1]
                    # If current sentence ends and next starts with certain words, break
                    if any(word in sentence.lower() for word in ['also', 'additionally', 'furthermore', 'however', 'meanwhile']):
                        paragraphs.append(' '.join(current_para))
                        current_para = []
                    elif len(current_para) >= 3:
                        paragraphs.append(' '.join(current_para))
                        current_para = []
                else:
                    # Last sentence
                    if len(current_para) >= 2:
                        paragraphs.append(' '.join(current_para))
                        current_para = []
        
        # Add any remaining sentences
        if current_para:
            paragraphs.append(' '.join(current_para))
        
        # Join with double newline for spacing
        result = '\n\n'.join(paragraphs)
        
        # Clean up excessive spacing
        result = re.sub(r'\n{3,}', '\n\n', result)
        
        return result.strip()
    
    def _get_buttons_for_intent(self, intent: str) -> List[str]:
        """Get appropriate action buttons for an intent"""
        button_map = {
            "plan_today": ["Next location", "Tomorrow", "Trip summary"],
            "plan_tomorrow": ["Today", "Trip summary"],
            "plan_specific_day": ["Today", "Trip summary"],
            "trip_summary": ["Today's plan", "Flight info", "Hotel info"],
            "flight_info": ["Hotel info", "Trip summary"],
            "hotel_info": ["Flight info", "Trip summary"],
            "weather_info": ["Today's plan", "Trip summary"],
            "cost_info": ["Trip summary", "Flight info"],
            "things_to_do": ["Today's plan", "Trip summary"],
            "destination_info": ["Today's plan", "Trip summary"],
            "general": ["Today's plan", "Trip summary", "Next location"]
        }
        return button_map.get(intent, ["Today's plan", "Trip summary"])
    
    async def _handle_plan_today(
        self, 
        user_id: Optional[str],
        context: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Get today's plan from itinerary"""
        today = date.today()
        
        # Try to get itinerary from context or memory
        itinerary = context.get("itinerary") if context else self.memory.get("last_itinerary")
        
        if not itinerary:
            return {
                "type": "message",
                "text": "I don't have an active itinerary. Please generate one first using the web app.",
                "buttons": []
            }
        
        # Get trip dates
        start_date_str = itinerary.get("start_date")
        if isinstance(start_date_str, str):
            try:
                start_date = datetime.fromisoformat(start_date_str.replace('Z', '+00:00')).date()
            except:
                try:
                    start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
                except:
                    start_date = None
        else:
            start_date = None
        
        # Calculate which day of the trip today is
        if start_date:
            days_into_trip = (today - start_date).days + 1
            if days_into_trip < 1:
                days_until = (start_date - today).days
                return {
                    "type": "message",
                    "text": f"Your trip to {itinerary.get('destination', 'your destination')} starts on {start_date.strftime('%B %d')}. That's in {days_until} days.",
                    "buttons": ["Trip summary", "Flight info"]
                }
            elif days_into_trip > itinerary.get("num_days", 999):
                return {
                    "type": "message",
                    "text": f"Your trip to {itinerary.get('destination', 'your destination')} has ended. Hope you had a great time!",
                    "buttons": ["Trip summary"]
                }
        else:
            days_into_trip = 1  # Default to day 1 if we can't calculate
        
        # Extract today's activities
        days = itinerary.get("days", [])
        day_attractions = itinerary.get("day_attractions", [])
        day_weather = itinerary.get("day_weather", [])
        
        plan = self._extract_day_plan_enhanced(days, day_attractions, day_weather, days_into_trip, itinerary)
        
        if plan:
            destination = itinerary.get("destination", "your destination")
            message = f"Today's plan for {destination}:\n\n{plan}"
            return {
                "type": "message",
                "text": message,
                "buttons": ["Next location", "Tomorrow", "Trip summary"]
            }
        else:
            return {
                "type": "message",
                "text": "I don't have a plan for today. Your trip might start on a different date.",
                "buttons": ["Trip summary"]
            }
    
    async def _handle_plan_tomorrow(
        self,
        user_id: Optional[str],
        context: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Get tomorrow's plan from itinerary"""
        tomorrow = date.today() + timedelta(days=1)
        
        itinerary = context.get("itinerary") if context else self.memory.get("last_itinerary")
        
        if not itinerary:
            return {
                "type": "message",
                "text": "I don't have an active itinerary. Please generate one first.",
                "buttons": []
            }
        
        # Get trip dates
        start_date_str = itinerary.get("start_date")
        if isinstance(start_date_str, str):
            try:
                start_date = datetime.fromisoformat(start_date_str.replace('Z', '+00:00')).date()
            except:
                try:
                    start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
                except:
                    start_date = None
        else:
            start_date = None
        
        # Calculate which day of the trip tomorrow is
        if start_date:
            days_into_trip = (tomorrow - start_date).days + 1
            if days_into_trip < 1 or days_into_trip > itinerary.get("num_days", 999):
                return {
                    "type": "message",
                    "text": f"Tomorrow is outside your trip dates. Your trip to {itinerary.get('destination', 'your destination')} is from {start_date.strftime('%B %d')} to {itinerary.get('end_date', '?')}.",
                    "buttons": ["Trip summary"]
                }
        else:
            days_into_trip = 2  # Default to day 2 if we can't calculate
        
        days = itinerary.get("days", [])
        day_attractions = itinerary.get("day_attractions", [])
        day_weather = itinerary.get("day_weather", [])
        
        plan = self._extract_day_plan_enhanced(days, day_attractions, day_weather, days_into_trip, itinerary)
        
        if plan:
            destination = itinerary.get("destination", "your destination")
            message = f"Tomorrow's plan for {destination}:\n\n{plan}"
            return {
                "type": "message",
                "text": message,
                "buttons": ["Today", "Trip summary"]
            }
        else:
            return {
                "type": "message",
                "text": "I don't have a plan for tomorrow. Check your trip dates.",
                "buttons": ["Trip summary"]
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
            message += "Alternative Flights:\n"
            message += "Visit the web app to see more flight options with different times and prices.\n\n"
        
        if current_lodging:
            message += "Alternative Hotels:\n"
            message += "Check the web app for more lodging options in different areas.\n\n"
        
        message += "I can help you compare sustainability scores too! 🌿"
        
        return {
            "type": "message",
            "text": message,
            "buttons": ["Eco summary", "Trip summary"]
        }
    
    async def _handle_plan_specific_day(
        self,
        text: str,
        user_id: Optional[str],
        context: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Get plan for a specific day number"""
        itinerary = context.get("itinerary") if context else self.memory.get("last_itinerary")
        
        if not itinerary:
            return {
                "type": "message",
                "text": "I don't have an active itinerary. Please generate one first! 📱",
                "buttons": []
            }
        
        # Extract day number from text
        day_match = re.search(r"day\s*(\d+)", text.lower())
        if day_match:
            day_number = int(day_match.group(1))
        elif "first" in text.lower():
            day_number = 1
        elif "second" in text.lower():
            day_number = 2
        elif "third" in text.lower():
            day_number = 3
        else:
            day_number = 1  # Default
        
        if day_number < 1 or day_number > itinerary.get("num_days", 999):
            return {
                "type": "message",
                "text": f"Day {day_number} is not in your itinerary. Your trip has {itinerary.get('num_days', 0)} days. 📅",
                "buttons": ["Trip summary"]
            }
        
        days = itinerary.get("days", [])
        day_attractions = itinerary.get("day_attractions", [])
        day_weather = itinerary.get("day_weather", [])
        
        plan = self._extract_day_plan_enhanced(days, day_attractions, day_weather, day_number, itinerary)
        
        if plan:
            destination = itinerary.get("destination", "your destination")
            message = f"Day {day_number} Plan for {destination}:\n\n{plan}"
            return {
                "type": "message",
                "text": message,
                "buttons": ["Tomorrow", "Eco summary", "Weather"]
            }
        else:
            return {
                "type": "message",
                "text": f"I don't have a plan for day {day_number}. 📅",
                "buttons": ["Trip summary"]
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
        
        destination = itinerary.get("destination", "your destination")
        num_days = itinerary.get("num_days", 0)
        totals = itinerary.get("totals", {})
        total_cost = totals.get("cost", 0) if isinstance(totals, dict) else 0
        total_emissions = totals.get("emissions_kg", 0) if isinstance(totals, dict) else 0
        eco_score = itinerary.get("eco_score", 0)
        rationale = itinerary.get("rationale", "")
        
        message = f"Trip Summary: {destination}\n\n"
        message += f"Duration: {num_days} days\n"
        
        if total_cost:
            message += f"Total Cost: ${total_cost:,.0f}\n"
        
        if total_emissions:
            message += f"Carbon Footprint: {total_emissions:.1f} kg CO₂\n"
            # Calculate per day
            if num_days > 0:
                per_day = total_emissions / num_days
                message += f"   (≈{per_day:.1f} kg CO₂ per day)\n"
        
        if eco_score:
            message += f"Eco Score: {eco_score:.0f}/100\n"
            if eco_score >= 80:
                message += "   Excellent sustainability!\n"
            elif eco_score >= 60:
                message += "   Good eco-friendly choices!\n"
            else:
                message += "   Room for improvement\n"
        
        if rationale:
            # Truncate rationale if too long
            rationale_short = rationale[:200] + "..." if len(rationale) > 200 else rationale
            message += f"\nWhy this trip?\n{rationale_short}\n"
        
        message += "\nYour trip is optimized for sustainability! 🌍"
        
        return {
            "type": "message",
            "text": message,
            "buttons": ["Today's plan", "Flight info", "Hotel info"]
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
        
        destination = itinerary.get("destination", "your destination")
        attractions = itinerary.get("attractions", [])
        day_attractions = itinerary.get("day_attractions", [])
        
        message = f"Top Attractions in {destination}:\n\n"
        
        # Use attractions if available, otherwise extract from day_attractions
        if attractions:
            for i, poi in enumerate(attractions[:8], 1):  # Top 8
                name = poi.get("name", "Activity")
                category = poi.get("category", "")
                rating = poi.get("rating")
                description = poi.get("description", "")
                poi_lat = poi.get("latitude")
                poi_lng = poi.get("longitude")
                
                message += f"{i}. {name}"
                if category:
                    message += f" ({category})"
                if rating:
                    message += f" - Rating: {rating:.1f}/5"
                message += "\n"
                if description:
                    desc_short = description[:80] + "..." if len(description) > 80 else description
                    message += f"   {desc_short}\n"
                # Add Apple Maps link if coordinates available
                if poi_lat and poi_lng:
                    apple_maps_url = f"https://maps.apple.com/?ll={poi_lat},{poi_lng}&q={name.replace(' ', '+')}"
                    message += f"   {apple_maps_url}\n"
                message += "\n"
        elif day_attractions:
            # Extract unique POIs from day_attractions
            seen_pois = set()
            count = 0
            for bundle in day_attractions:
                for period in ["morning", "afternoon", "evening"]:
                    poi = bundle.get(period)
                    if poi and isinstance(poi, dict):
                        name = poi.get("name", "")
                        if name and name not in seen_pois:
                            seen_pois.add(name)
                            count += 1
                            rating = poi.get("rating")
                            poi_lat = poi.get("latitude")
                            poi_lng = poi.get("longitude")
                            message += f"{count}. {name}"
                            if rating:
                                message += f" - Rating: {rating:.1f}/5"
                            message += "\n"
                            # Add Apple Maps link if coordinates available
                            if poi_lat and poi_lng:
                                apple_maps_url = f"https://maps.apple.com/?ll={poi_lat},{poi_lng}&q={name.replace(' ', '+')}"
                                message += f"   {apple_maps_url}\n"
                            message += "\n"
                            if count >= 8:
                                break
                if count >= 8:
                    break
        
        if not attractions and not day_attractions:
            message = f"Your itinerary for {destination} includes great activities! Check the web app for the full list. 📱"
        else:
            message += "\nCheck your full itinerary in the app for more details! 📱"
        
        return {
            "type": "message",
            "text": message,
            "buttons": ["Today's plan", "Eco summary", "Weather"]
        }
    
    async def _handle_flight_info(
        self,
        user_id: Optional[str],
        context: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Get flight information"""
        itinerary = context.get("itinerary") if context else self.memory.get("last_itinerary")
        
        if not itinerary:
            return {
                "type": "message",
                "text": "I need your itinerary to provide flight info. Generate one first! ✈️",
                "buttons": []
            }
        
        flights = itinerary.get("flights", [])
        if not flights:
            return {
                "type": "message",
                "text": "I don't see any flights in your itinerary. ✈️",
                "buttons": ["Trip summary"]
            }
        
        message = "Your Flights:\n\n"
        
        for i, flight in enumerate(flights[:3], 1):  # Show up to 3 flights
            carrier = flight.get("carrier", "Airline")
            origin = flight.get("origin", "")
            destination = flight.get("destination", "")
            departure = flight.get("departure", "")
            arrival = flight.get("arrival", "")
            price = flight.get("price", 0)
            emissions = flight.get("emissions_kg", 0)
            eco_score = flight.get("eco_score", 0)
            
            message += f"{i}. {carrier}\n"
            message += f"   {origin} → {destination}\n"
            
            if departure:
                try:
                    if isinstance(departure, str):
                        dep_dt = datetime.fromisoformat(departure.replace('Z', '+00:00'))
                        message += f"   Departure: {dep_dt.strftime('%b %d, %I:%M %p')}\n"
                except:
                    message += f"   Departure: {departure}\n"
            
            if arrival:
                try:
                    if isinstance(arrival, str):
                        arr_dt = datetime.fromisoformat(arrival.replace('Z', '+00:00'))
                        message += f"   Arrival: {arr_dt.strftime('%b %d, %I:%M %p')}\n"
                except:
                    message += f"   Arrival: {arrival}\n"
            
            if price:
                message += f"   💰 ${price:,.0f}\n"
            
            if emissions:
                message += f"   🌿 {emissions:.1f} kg CO₂\n"
            
            if eco_score:
                message += f"   ⭐ Eco Score: {eco_score:.0f}/100\n"
            
            message += "\n"
        
        if len(flights) > 3:
            message += f"... and {len(flights) - 3} more flight(s)\n"
        
        return {
            "type": "message",
            "text": message,
            "buttons": ["Hotel info", "Trip summary", "Eco summary"]
        }
    
    async def _handle_hotel_info(
        self,
        user_id: Optional[str],
        context: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Get hotel/lodging information"""
        itinerary = context.get("itinerary") if context else self.memory.get("last_itinerary")
        
        if not itinerary:
            return {
                "type": "message",
                "text": "I need your itinerary to provide hotel info. Generate one first! 🏨",
                "buttons": []
            }
        
        hotels = itinerary.get("hotels", [])
        if not hotels:
            return {
                "type": "message",
                "text": "I don't see any hotels in your itinerary. 🏨",
                "buttons": ["Trip summary"]
            }
        
        message = "Your Hotels:\n\n"
        
        for i, hotel in enumerate(hotels[:3], 1):  # Show up to 3 hotels
            name = hotel.get("name", "Hotel")
            address = hotel.get("address", "")
            nightly_rate = hotel.get("nightly_rate", 0)
            rating = hotel.get("rating", 0)
            sustainability_score = hotel.get("sustainability_score", 0)
            emissions = hotel.get("emissions_kg", 0)
            hotel_lat = hotel.get("latitude")
            hotel_lng = hotel.get("longitude")
            
            message += f"{i}. {name}\n"
            # Add Apple Maps link if coordinates available
            if hotel_lat and hotel_lng:
                apple_maps_url = f"https://maps.apple.com/?ll={hotel_lat},{hotel_lng}&q={name.replace(' ', '+')}"
                message += f"   {apple_maps_url}\n"
            if address:
                message += f"   📍 {address}\n"
            if nightly_rate:
                message += f"   💰 ${nightly_rate:.0f}/night\n"
            if rating:
                message += f"   ⭐ {rating:.1f}/5.0\n"
            if sustainability_score:
                message += f"   🌿 Sustainability: {sustainability_score*100:.0f}%\n"
            if emissions:
                message += f"   🌍 {emissions:.1f} kg CO₂/night\n"
            message += "\n"
        
        if len(hotels) > 3:
            message += f"... and {len(hotels) - 3} more hotel(s)\n"
        
        return {
            "type": "message",
            "text": message,
            "buttons": ["Flight info", "Trip summary", "Today's plan"]
        }
    
    async def _handle_weather_info(
        self,
        text: str,
        user_id: Optional[str],
        context: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Get weather information"""
        itinerary = context.get("itinerary") if context else self.memory.get("last_itinerary")
        
        if not itinerary:
            return {
                "type": "message",
                "text": "I need your itinerary to provide weather info. Generate one first! 🌤️",
                "buttons": []
            }
        
        day_weather = itinerary.get("day_weather", [])
        if not day_weather:
            destination = itinerary.get("destination", "your destination")
            return {
                "type": "message",
                "text": f"I don't have weather data for {destination} yet. Check the web app for weather updates! 🌤️",
                "buttons": ["Trip summary"]
            }
        
        destination = itinerary.get("destination", "your destination")
        message = f"Weather for {destination}:\n\n"
        
        # Show weather for next 3 days
        for i, weather in enumerate(day_weather[:3], 1):
            date_str = weather.get("date", "")
            morning = weather.get("morning", {})
            afternoon = weather.get("afternoon", {})
            evening = weather.get("evening", {})
            
            message += f"Day {i}"
            if date_str:
                try:
                    if isinstance(date_str, str):
                        weather_date = datetime.fromisoformat(date_str.replace('Z', '+00:00')).date()
                        message += f" ({weather_date.strftime('%b %d')})"
                except:
                    pass
            message += ":\n"
            
            if morning:
                temp = morning.get("temperature_c", 0)
                precip = morning.get("precipitation_probability", 0) * 100
                message += f"   🌅 Morning: {temp:.0f}°C, {precip:.0f}% rain\n"
            
            if afternoon:
                temp = afternoon.get("temperature_c", 0)
                precip = afternoon.get("precipitation_probability", 0) * 100
                message += f"   ☀️ Afternoon: {temp:.0f}°C, {precip:.0f}% rain\n"
            
            if evening:
                temp = evening.get("temperature_c", 0)
                precip = evening.get("precipitation_probability", 0) * 100
                message += f"   🌙 Evening: {temp:.0f}°C, {precip:.0f}% rain\n"
            
            message += "\n"
        
        return {
            "type": "message",
            "text": message,
            "buttons": ["Today's plan", "Trip summary"]
        }
    
    async def _handle_cost_info(
        self,
        user_id: Optional[str],
        context: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Get cost/budget information"""
        itinerary = context.get("itinerary") if context else self.memory.get("last_itinerary")
        
        if not itinerary:
            return {
                "type": "message",
                "text": "I need your itinerary to provide cost info. Generate one first! 💰",
                "buttons": []
            }
        
        totals = itinerary.get("totals", {})
        total_cost = totals.get("cost", 0) if isinstance(totals, dict) else 0
        budget = itinerary.get("budget", 0)
        num_days = itinerary.get("num_days", 0)
        
        message = "Trip Cost Breakdown:\n\n"
        
        if total_cost:
            message += f"Total Cost: ${total_cost:,.0f}\n"
            if num_days > 0:
                per_day = total_cost / num_days
                message += f"   (≈${per_day:.0f} per day)\n"
        
        if budget:
            message += f"Budget: ${budget:,.0f}\n"
            if total_cost and budget:
                remaining = budget - total_cost
                percentage = (total_cost / budget) * 100
                message += f"Used: {percentage:.0f}% (${remaining:,.0f} remaining)\n"
        
        flights = itinerary.get("flights", [])
        hotels = itinerary.get("hotels", [])
        
        if flights:
            flight_cost = sum(f.get("price", 0) for f in flights)
            if flight_cost:
                message += f"\n✈️ Flights: ${flight_cost:,.0f}\n"
        
        if hotels:
            hotel_cost = sum(h.get("nightly_rate", 0) * num_days for h in hotels) / len(hotels) if hotels else 0
            if hotel_cost:
                message += f"🏨 Hotels: ${hotel_cost:,.0f}\n"
        
        message += "\nCheck the web app for detailed breakdown! 📱"
        
        return {
            "type": "message",
            "text": message,
            "buttons": ["Trip summary", "Flight info", "Hotel info"]
        }
    
    async def _handle_destination_info(
        self,
        user_id: Optional[str],
        context: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Get destination information"""
        itinerary = context.get("itinerary") if context else self.memory.get("last_itinerary")
        
        if not itinerary:
            return {
                "type": "message",
                "text": "I need your itinerary to provide destination info. Generate one first! 🗺️",
                "buttons": []
            }
        
        destination = itinerary.get("destination", "your destination")
        start_date_str = itinerary.get("start_date", "")
        end_date_str = itinerary.get("end_date", "")
        num_days = itinerary.get("num_days", 0)
        mode = itinerary.get("mode", "balanced")
        
        message = f"Your Trip to {destination}:\n\n"
        
        if start_date_str:
            try:
                if isinstance(start_date_str, str):
                    start_date = datetime.fromisoformat(start_date_str.replace('Z', '+00:00')).date()
                    message += f"Start: {start_date.strftime('%B %d, %Y')}\n"
            except:
                try:
                    start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
                    message += f"Start: {start_date.strftime('%B %d, %Y')}\n"
                except:
                    message += f"Start: {start_date_str}\n"
        
        if end_date_str:
            try:
                if isinstance(end_date_str, str):
                    end_date = datetime.fromisoformat(end_date_str.replace('Z', '+00:00')).date()
                    message += f"End: {end_date.strftime('%B %d, %Y')}\n"
            except:
                try:
                    end_date = datetime.strptime(end_date_str, "%Y-%m-%d").date()
                    message += f"End: {end_date.strftime('%B %d, %Y')}\n"
                except:
                    message += f"End: {end_date_str}\n"
        
        if num_days:
            message += f"Duration: {num_days} days\n"
        
        if mode:
            mode_display = "Balanced" if mode == "balanced" else "Price Optimal"
            message += f"Mode: {mode_display}\n"
        
        rationale = itinerary.get("rationale", "")
        if rationale:
            rationale_short = rationale[:150] + "..." if len(rationale) > 150 else rationale
            message += f"\nWhy {destination}?\n{rationale_short}\n"
        
        return {
            "type": "message",
            "text": message,
            "buttons": ["Today's plan", "Trip summary", "Attractions"]
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
        
        # Default response - try to be helpful based on itinerary
        if itinerary:
            destination = itinerary.get("destination", "your destination")
            return {
                "type": "message",
                "text": f"I can help you with your trip to {destination}!\n\n• Today's plan\n• Tomorrow's schedule\n• Flight & hotel info\n• Weather forecast\n• Eco-friendly summary\n• Attractions & activities\n• Cost breakdown\n\nWhat would you like to know? 🌿",
                "buttons": ["Today's plan", "Trip summary", "Flight info", "Weather"]
            }
        else:
            return {
                "type": "message",
                "text": "I can help you with:\n• Today's plan\n• Tomorrow's schedule\n• Flight rebooking\n• Eco-friendly trip summary\n• Recommendations\n\nGenerate an itinerary first to get started! 🌿",
                "buttons": []
            }
    
    def _extract_day_plan_enhanced(
        self, 
        days: List[Dict[str, Any]], 
        day_attractions: List[Dict[str, Any]],
        day_weather: List[Dict[str, Any]],
        day_number: int,
        itinerary: Dict[str, Any]
    ) -> Optional[str]:
        """Extract enhanced plan for a specific day number with attractions and weather"""
        if not days:
            return None
        
        # Find matching day by day number
        day_data = None
        for day in days:
            if day.get("day") == day_number:
                day_data = day
                break
        
        if not day_data:
            return None
        
        plan_parts = []
        
        # Get weather for this day
        weather_info = None
        for weather in day_weather:
            # Weather can be indexed by day number or date
            weather_day = weather.get("day")
            weather_date = weather.get("date")
            if weather_day == day_number:
                weather_info = weather
                break
            elif isinstance(weather_date, str) and str(day_number) in weather_date:
                weather_info = weather
                break
            # Try to match by index if day_weather is ordered
            try:
                weather_index = day_weather.index(weather)
                if weather_index + 1 == day_number:
                    weather_info = weather
                    break
            except:
                pass
        
        # Get attractions for this day
        attractions_bundle = None
        for bundle in day_attractions:
            if bundle.get("day") == day_number:
                attractions_bundle = bundle
                break
        
        # Build morning plan
        morning = day_data.get("morning", "")
        if morning:
            morning_poi = attractions_bundle.get("morning") if attractions_bundle else None
            if morning_poi and isinstance(morning_poi, dict):
                poi_name = morning_poi.get("name", "")
                poi_desc = morning_poi.get("description", "")
                rating = morning_poi.get("rating")
                if poi_name:
                    plan_parts.append(f"Morning: {morning}")
                    plan_parts.append(f"  Location: {poi_name}" + (f" (Rating: {rating:.1f}/5)" if rating else ""))
                    if poi_desc:
                        plan_parts.append(f"  {poi_desc[:100]}...")
                else:
                    plan_parts.append(f"Morning: {morning}")
            else:
                plan_parts.append(f"Morning: {morning}")
            
            # Add weather if available
            if weather_info and weather_info.get("morning"):
                morning_weather = weather_info.get("morning", {})
                temp = morning_weather.get("temperature_c", 0)
                precip = morning_weather.get("precipitation_probability", 0) * 100
                plan_parts.append(f"  Weather: {temp:.0f}°C, {precip:.0f}% chance of rain")
        
        # Build afternoon plan
        afternoon = day_data.get("afternoon", "")
        if afternoon:
            afternoon_poi = attractions_bundle.get("afternoon") if attractions_bundle else None
            if afternoon_poi and isinstance(afternoon_poi, dict):
                poi_name = afternoon_poi.get("name", "")
                poi_desc = afternoon_poi.get("description", "")
                rating = afternoon_poi.get("rating")
                if poi_name:
                    plan_parts.append(f"\nAfternoon: {afternoon}")
                    plan_parts.append(f"  Location: {poi_name}" + (f" (Rating: {rating:.1f}/5)" if rating else ""))
                    if poi_desc:
                        plan_parts.append(f"  {poi_desc[:100]}...")
                else:
                    plan_parts.append(f"\nAfternoon: {afternoon}")
            else:
                plan_parts.append(f"\nAfternoon: {afternoon}")
            
            # Add weather if available
            if weather_info and weather_info.get("afternoon"):
                afternoon_weather = weather_info.get("afternoon", {})
                temp = afternoon_weather.get("temperature_c", 0)
                precip = afternoon_weather.get("precipitation_probability", 0) * 100
                plan_parts.append(f"  Weather: {temp:.0f}°C, {precip:.0f}% chance of rain")
        
        # Build evening plan
        evening = day_data.get("evening", "")
        if evening:
            evening_poi = attractions_bundle.get("evening") if attractions_bundle else None
            if evening_poi and isinstance(evening_poi, dict):
                poi_name = evening_poi.get("name", "")
                poi_desc = evening_poi.get("description", "")
                rating = evening_poi.get("rating")
                if poi_name:
                    plan_parts.append(f"\nEvening: {evening}")
                    plan_parts.append(f"  Location: {poi_name}" + (f" (Rating: {rating:.1f}/5)" if rating else ""))
                    if poi_desc:
                        plan_parts.append(f"  {poi_desc[:100]}...")
                else:
                    plan_parts.append(f"\nEvening: {evening}")
            else:
                plan_parts.append(f"\nEvening: {evening}")
            
            # Add weather if available
            if weather_info and weather_info.get("evening"):
                evening_weather = weather_info.get("evening", {})
                temp = evening_weather.get("temperature_c", 0)
                precip = evening_weather.get("precipitation_probability", 0) * 100
                plan_parts.append(f"  Weather: {temp:.0f}°C, {precip:.0f}% chance of rain")
        
        return "\n".join(plan_parts) if plan_parts else None
    
    def _extract_day_plan(self, days: List[Dict[str, Any]], target_date: str) -> Optional[str]:
        """Extract plan for a specific date from itinerary days (legacy method)"""
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
    
    def _generate_maps_links(self, name: str, latitude: Optional[float] = None, longitude: Optional[float] = None, address: Optional[str] = None) -> Dict[str, str]:
        """Generate Apple Maps and Google Maps links for a location"""
        links = {}
        
        # Apple Maps link
        if latitude and longitude:
            # Apple Maps uses maps.apple.com with coordinates
            apple_url = f"https://maps.apple.com/?ll={latitude},{longitude}&q={name.replace(' ', '+')}"
            links["apple_maps"] = apple_url
        elif address:
            # Apple Maps with address
            apple_url = f"https://maps.apple.com/?q={address.replace(' ', '+')}"
            links["apple_maps"] = apple_url
        
        # Google Maps link
        if latitude and longitude:
            google_url = f"https://www.google.com/maps/search/?api=1&query={latitude},{longitude}"
            links["google_maps"] = google_url
        elif address:
            google_url = f"https://www.google.com/maps/search/?api=1&query={address.replace(' ', '+')}"
            links["google_maps"] = google_url
        elif name:
            google_url = f"https://www.google.com/maps/search/?api=1&query={name.replace(' ', '+')}"
            links["google_maps"] = google_url
        
        return links
    
    def _get_next_location(self, itinerary: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Determine the next location based on current time and itinerary"""
        if not itinerary:
            return None
        
        now = datetime.now()
        current_hour = now.hour
        today = date.today()
        
        # Get trip dates
        start_date_str = itinerary.get("start_date")
        if isinstance(start_date_str, str):
            try:
                start_date = datetime.fromisoformat(start_date_str.replace('Z', '+00:00')).date()
            except:
                try:
                    start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
                except:
                    start_date = None
        else:
            start_date = None
        
        if not start_date:
            return None
        
        # Calculate which day of the trip today is
        days_into_trip = (today - start_date).days + 1
        if days_into_trip < 1 or days_into_trip > itinerary.get("num_days", 999):
            return None
        
        days = itinerary.get("days", [])
        day_attractions = itinerary.get("day_attractions", [])
        
        # Find today's day data
        day_data = None
        for day in days:
            if day.get("day") == days_into_trip:
                day_data = day
                break
        
        if not day_data:
            return None
        
        # Find today's attractions
        attractions_bundle = None
        for bundle in day_attractions:
            if bundle.get("day") == days_into_trip:
                attractions_bundle = bundle
                break
        
        # Determine next time period based on current hour
        # Morning: 6-12, Afternoon: 12-18, Evening: 18-24
        if current_hour < 12:
            # Still in morning, next is afternoon
            next_period = "afternoon"
            next_poi = attractions_bundle.get("afternoon") if attractions_bundle else None
            next_activity = day_data.get("afternoon", "")
        elif current_hour < 18:
            # Still in afternoon, next is evening
            next_period = "evening"
            next_poi = attractions_bundle.get("evening") if attractions_bundle else None
            next_activity = day_data.get("evening", "")
        else:
            # Evening or later, next is tomorrow morning
            if days_into_trip < itinerary.get("num_days", 999):
                # Get tomorrow's data
                tomorrow_day = None
                for day in days:
                    if day.get("day") == days_into_trip + 1:
                        tomorrow_day = day
                        break
                
                tomorrow_bundle = None
                for bundle in day_attractions:
                    if bundle.get("day") == days_into_trip + 1:
                        tomorrow_bundle = bundle
                        break
                
                if tomorrow_day:
                    next_period = "tomorrow_morning"
                    next_poi = tomorrow_bundle.get("morning") if tomorrow_bundle else None
                    next_activity = tomorrow_day.get("morning", "")
                else:
                    return None
            else:
                return None
        
        return {
            "period": next_period,
            "activity": next_activity,
            "poi": next_poi,
            "day": days_into_trip if next_period != "tomorrow_morning" else days_into_trip + 1
        }
    
    async def _handle_next_location(
        self,
        user_id: Optional[str],
        context: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Get the next location in the itinerary"""
        itinerary = context.get("itinerary") if context else self.memory.get("last_itinerary")
        
        if not itinerary:
            return {
                "type": "message",
                "text": "I don't have an active itinerary. Please generate one first using the web app.",
                "buttons": []
            }
        
        next_location = self._get_next_location(itinerary)
        
        if not next_location:
            return {
                "type": "message",
                "text": "I couldn't determine your next location. Your trip might be over or hasn't started yet.",
                "buttons": ["Today's plan", "Trip summary"]
            }
        
        poi = next_location.get("poi")
        activity = next_location.get("activity", "")
        period = next_location.get("period", "")
        
        # Build context for Dedalus
        location_info = ""
        if poi and isinstance(poi, dict):
            poi_name = poi.get("name", "")
            poi_desc = poi.get("description", "")
            poi_rating = poi.get("rating")
            location_info = f"Next location: {poi_name}"
            if poi_desc:
                location_info += f"\nDescription: {poi_desc}"
            if poi_rating:
                location_info += f"\nRating: {poi_rating}/5"
            if activity:
                location_info += f"\nActivity: {activity}"
        elif activity:
            location_info = f"Next activity: {activity}"
        
        period_text = {
            "tomorrow_morning": "tomorrow morning",
            "afternoon": "this afternoon",
            "evening": "this evening"
        }.get(period, period)
        
        # Use Dedalus to generate a natural response
        prompt = f"""You are a helpful travel assistant. A user is asking about their next location on their trip.

{location_info}

Time period: {period_text}

Generate a natural, conversational response (2-3 sentences) telling them about their next location. Be friendly and helpful. Do NOT use emojis. Include the location name and activity if available.

FORMATTING:
- Use line breaks to separate different pieces of information
- Keep sentences short and readable
- Add spacing between thoughts for easy scanning

Response:"""

        try:
            client = AsyncDedalus()
            runner = DedalusRunner(client)
            
            result = await runner.run(
                input=prompt,
                model="openai/gpt-4o",
                max_steps=2,
                stream=False,
            )
            
            response_text = result.final_output if hasattr(result, 'final_output') else str(result)
            response_text = response_text.strip().strip('"').strip("'")
            
            # Add maps links if we have location data
            if poi and isinstance(poi, dict):
                poi_name = poi.get("name", "")
                poi_lat = poi.get("latitude")
                poi_lng = poi.get("longitude")
                poi_address = poi.get("description", "")
                
                if poi_lat and poi_lng:
                    maps_links = self._generate_maps_links(poi_name, poi_lat, poi_lng, poi_address)
                    response_text += "\n\nMaps:"
                    if maps_links.get("apple_maps"):
                        response_text += f"\nApple Maps: {maps_links['apple_maps']}"
                    if maps_links.get("google_maps"):
                        response_text += f"\nGoogle Maps: {maps_links['google_maps']}"
            
            return {
                "type": "message",
                "text": response_text,
                "buttons": ["Directions", "Today's plan"]
            }
        except Exception as e:
            logger.error(f"Error calling Dedalus for next location: {e}", exc_info=True)
            # Fallback to simple response
            if poi and isinstance(poi, dict):
                poi_name = poi.get("name", "")
                if poi_name:
                    return {
                        "type": "message",
                        "text": f"Your next location is {poi_name} {period_text}. {activity if activity else ''}",
                        "buttons": ["Directions", "Today's plan"]
                    }
            return {
                "type": "message",
                "text": f"Your next activity is {activity} {period_text}." if activity else "I couldn't determine your next location.",
                "buttons": ["Today's plan"]
            }
    
    async def _handle_directions(
        self,
        text: str,
        user_id: Optional[str],
        context: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Get directions to the next location"""
        itinerary = context.get("itinerary") if context else self.memory.get("last_itinerary")
        
        if not itinerary:
            return {
                "type": "message",
                "text": "I don't have an active itinerary. Please generate one first.",
                "buttons": []
            }
        
        next_location = self._get_next_location(itinerary)
        
        if not next_location:
            return {
                "type": "message",
                "text": "I couldn't determine your next location. Your trip might be over or hasn't started yet.",
                "buttons": ["Today's plan"]
            }
        
        poi = next_location.get("poi")
        
        if not poi or not isinstance(poi, dict):
            return {
                "type": "message",
                "text": "I don't have location details for your next stop. Check your itinerary for more information.",
                "buttons": ["Today's plan"]
            }
        
        poi_name = poi.get("name", "")
        poi_lat = poi.get("latitude")
        poi_lng = poi.get("longitude")
        poi_address = poi.get("description", "")
        
        if not poi_lat or not poi_lng:
            return {
                "type": "message",
                "text": f"I don't have coordinates for {poi_name}. Here's a general search link:",
                "buttons": []
            }
        
        # Generate maps links with directions
        maps_links = self._generate_maps_links(poi_name, poi_lat, poi_lng, poi_address)
        
        message_parts = [f"Directions to {poi_name}:"]
        
        # Apple Maps directions link
        if poi_lat and poi_lng:
            apple_directions = f"https://maps.apple.com/?daddr={poi_lat},{poi_lng}&dirflg=w"  # w = walking, d = driving, r = transit
            message_parts.append(f"\nApple Maps (walking): {apple_directions}")
            message_parts.append(f"Apple Maps (driving): https://maps.apple.com/?daddr={poi_lat},{poi_lng}&dirflg=d")
            message_parts.append(f"Apple Maps (transit): https://maps.apple.com/?daddr={poi_lat},{poi_lng}&dirflg=r")
        
        # Google Maps directions link
        if poi_lat and poi_lng:
            google_directions = f"https://www.google.com/maps/dir/?api=1&destination={poi_lat},{poi_lng}&travelmode=walking"
            message_parts.append(f"\nGoogle Maps (walking): {google_directions}")
            message_parts.append(f"Google Maps (driving): https://www.google.com/maps/dir/?api=1&destination={poi_lat},{poi_lng}&travelmode=driving")
            message_parts.append(f"Google Maps (transit): https://www.google.com/maps/dir/?api=1&destination={poi_lat},{poi_lng}&travelmode=transit")
        
        return {
            "type": "message",
            "text": "\n".join(message_parts),
            "buttons": ["Next location", "Today's plan"]
        }

