"""Dedalus API client for generating travel itineraries"""
from __future__ import annotations

import json
import logging
import os
from typing import Dict, Any

from dedalus_labs import AsyncDedalus, DedalusRunner
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)
DEDALUS_API_KEY = os.getenv("DEDALUS_API_KEY")


async def call_dedalus(prompt: str, max_steps: int = 10) -> Dict[str, Any]:
    """
    Call Dedalus API to generate an itinerary.
    Returns the parsed JSON response.
    """
    if not DEDALUS_API_KEY:
        logger.error("DEDALUS_API_KEY not set in environment variables")
        raise ValueError("DEDALUS_API_KEY not set in environment variables")
    
    logger.info(f"Calling Dedalus with {max_steps} max steps")
    logger.debug(f"Prompt length: {len(prompt)} characters")
    
    try:
        # Initialize Dedalus client - it reads DEDALUS_API_KEY from env automatically
        logger.info(f"Dedalus API key present: {'Yes' if DEDALUS_API_KEY else 'No'}")
        logger.info(f"Dedalus API key format: {DEDALUS_API_KEY[:10]}..." if DEDALUS_API_KEY else "No key")
        
        client = AsyncDedalus()
        runner = DedalusRunner(client)
        
        logger.info("Starting Dedalus runner...")
        # Try with a simpler model first, or check if model name is correct
        result = await runner.run(
            input=prompt,
            model="openai/gpt-4o",  # Changed from gpt-4.1 to gpt-4o (more common)
            max_steps=max_steps,
            mcp_servers=[
                "joerup/exa-mcp",
                "windsor/brave-search-mcp",
                "joerup/open-meteo-mcp"
            ]
        )
        
        logger.info("Dedalus runner completed")
        
        # Dedalus returns final_output as a string, parse it as JSON
        final_output = result.final_output if hasattr(result, 'final_output') else str(result)
        
        logger.debug(f"Final output type: {type(final_output)}, length: {len(str(final_output))}")
        
        if isinstance(final_output, str):
            try:
                parsed = json.loads(final_output)
                logger.info("Successfully parsed Dedalus JSON response")
                return parsed
            except json.JSONDecodeError:
                logger.warning("Failed to parse as JSON, trying regex extraction...")
                # If parsing fails, try to extract JSON from the string
                import re
                json_match = re.search(r'\{.*\}', final_output, re.DOTALL)
                if json_match:
                    parsed = json.loads(json_match.group())
                    logger.info("Successfully extracted JSON from response")
                    return parsed
                logger.error(f"Could not parse Dedalus response. First 500 chars: {final_output[:500]}")
                raise ValueError(f"Could not parse Dedalus response as JSON: {final_output[:200]}...")
        logger.info("Returning final_output as-is (not a string)")
        return final_output
    except Exception as e:
        logger.error(f"Dedalus API error: {type(e).__name__}: {str(e)}")
        raise Exception(f"Error calling Dedalus: {str(e)}")

