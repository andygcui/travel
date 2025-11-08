# trip_agent.py
# -----------------------------------------------
# Dedalus-native Personalized Trip Planner
# -----------------------------------------------
# ✔ Uses ONLY your DEDALUS_API_KEY (no OpenAI key required)
# ✔ Works with Amadeus, Climatiq, Open-Meteo, and Brave APIs
# ✔ Dedalus orchestrates tools & MCPs directly
# -----------------------------------------------

import os
import asyncio
from dedalus_labs import AsyncDedalus, DedalusRunner
from dotenv import load_dotenv
from dedalus_labs.utils.streaming import stream_async

# import the tools file below (make sure it's in same folder)
from tools_travel import (
    parse_user_prefs,
    search_flights_amadeus,
    estimate_co2_climatiq,
    get_weather_openmeteo,
    search_pois_brave,
    estimate_budget_and_tips,
)

# -------------------------------------------------------
# 1️⃣  Load API keys from .env
# -------------------------------------------------------
load_dotenv()

# sanity check print
print("DEDALUS_API_KEY:", bool(os.getenv("DEDALUS_API_KEY")), 
      "| OPENAI_API_KEY:", os.getenv("OPENAI_API_KEY"))

# -------------------------------------------------------
# 2️⃣  Dedalus planner system prompt
# -------------------------------------------------------
PLANNER_PROMPT = """You are TripPlanner, an orchestration agent running inside Dedalus.

You have access to the following tools:
- search_flights_amadeus
- estimate_co2_climatiq
- get_weather_openmeteo
- search_pois_brave
- estimate_budget_and_tips

Guidelines:
1. Always use tools to gather real data.
2. Adjust constraints if searches fail (broaden date ±1, nearby airports, lower price class).
3. Respect user preferences: budget, eco_weight, pace, likes/dislikes.
4. Optimize for feasibility → cost → convenience → sustainability.
5. Output a clear markdown itinerary with these sections:
   • Summary
   • Flights
   • Weather Snapshot
   • Daily Plan
   • Budget
   • Sustainability
"""

# -------------------------------------------------------
# 3️⃣  Main async function
# -------------------------------------------------------
async def main():
    client = AsyncDedalus()
    runner = DedalusRunner(client)

    # Example user preferences (frontend can send JSON)
    user_input = """Plan a trip with these preferences:
    {
      "origin": "JFK",
      "destination": "PAR",
      "start_date": "2025-10-10",
      "end_date": "2025-10-14",
      "pax": 2,
      "cabin": "eco",
      "budget": 3000,
      "currency": "USD",
      "likes": ["museums", "bakeries", "walkable"],
      "dislikes": ["nightclubs"],
      "eco_weight": 0.6,
      "pace": "balanced"
    }
    """

    # ✅ 4️⃣  Model routed through Dedalus (no OpenAI key required)
    model = "openai/gpt-4.1"

    # ✅ 5️⃣  Run the Dedalus agent with our tools
    result = await runner.run(
        input=f"{PLANNER_PROMPT}\n\nUser request:\n{user_input}",
        model=model,
        tools=[
            parse_user_prefs,
            search_flights_amadeus,
            estimate_co2_climatiq,
            get_weather_openmeteo,
            search_pois_brave,
            estimate_budget_and_tips,
        ],
        mcp_servers=[
            "joerup/open-meteo-mcp",
            "windsor/brave-search-mcp"
        ],
        stream=False,
    )

    print("\n=== PERSONALIZED TRIP PLAN ===\n")
    print(result.final_output)

# -------------------------------------------------------
# 6️⃣  Entry point
# -------------------------------------------------------
if __name__ == "__main__":
    asyncio.run(main())


