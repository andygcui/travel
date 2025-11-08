"""Dedalus API client for generating travel itineraries"""
from __future__ import annotations

import json
import os
from typing import Dict, Any

from dedalus_labs import AsyncDedalus, DedalusRunner
from dotenv import load_dotenv

load_dotenv()

DEDALUS_API_KEY = os.getenv("DEDALUS_API_KEY")


async def call_dedalus(prompt: str, max_steps: int = 10) -> Dict[str, Any]:
    """
    Call Dedalus API to generate an itinerary.
    Returns the parsed JSON response.
    """
    if not DEDALUS_API_KEY:
        raise ValueError("DEDALUS_API_KEY not set in environment variables")
    
    try:
        client = AsyncDedalus()
        runner = DedalusRunner(client)
        
        result = await runner.run(
            input=prompt,
            model="openai/gpt-4.1",
            max_steps=max_steps,
            mcp_servers=[
                "joerup/exa-mcp",
                "windsor/brave-search-mcp",
                "joerup/open-meteo-mcp"
            ]
        )
        
        # Dedalus returns final_output as a string, parse it as JSON
        final_output = result.final_output if hasattr(result, 'final_output') else str(result)
        
        if isinstance(final_output, str):
            try:
                return json.loads(final_output)
            except json.JSONDecodeError:
                # If parsing fails, try to extract JSON from the string
                import re
                json_match = re.search(r'\{.*\}', final_output, re.DOTALL)
                if json_match:
                    return json.loads(json_match.group())
                raise ValueError(f"Could not parse Dedalus response as JSON: {final_output}")
        return final_output
    except Exception as e:
        raise Exception(f"Error calling Dedalus: {str(e)}")

