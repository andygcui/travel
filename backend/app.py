from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, Optional, List
from schemas import ItineraryGenerationRequest, GreenTripItineraryResponse
from services.itinerary_generator import generate_itinerary
from services.chat_planner import chat_planner
from services.profile_generator import generate_user_profile_summary
from services.preference_aggregator import promote_frequent_preferences
from services.supabase_client import get_supabase_client

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/plan")
def read_root():
    return {"message": "TripSmith backend running!"}


@app.post("/generate_itinerary", response_model=GreenTripItineraryResponse)
async def generate_itinerary_endpoint(request: ItineraryGenerationRequest):
    """Generate a travel itinerary using Dedalus Labs"""
    return await generate_itinerary(request)


class ChatPlannerRequest(BaseModel):
    message: str
    itinerary: Dict[str, Any]
    user_id: Optional[str] = None
    trip_id: Optional[str] = None


class ChatPlannerResponse(BaseModel):
    response: str
    updated_itinerary: Optional[Dict[str, Any]] = None
    extracted_preferences: Optional[List[Dict[str, Any]]] = None


@app.post("/chat_planner", response_model=ChatPlannerResponse)
async def chat_planner_endpoint(request: ChatPlannerRequest):
    """Chat with the travel planner to modify itinerary"""
    result = await chat_planner(
        request.message, 
        request.itinerary,
        user_id=request.user_id,
        trip_id=request.trip_id
    )
    return ChatPlannerResponse(
        response=result["response"],
        updated_itinerary=result.get("updated_itinerary"),
        extracted_preferences=result.get("extracted_preferences"),
    )


@app.get("/user/preferences")
async def get_user_preferences(user_id: str):
    """Get all user preferences (long-term + frequent trip-specific)"""
    try:
        supabase = get_supabase_client()
        if not supabase:
            raise HTTPException(status_code=503, detail="Database service unavailable")
        
        # Get long-term preferences
        long_term = supabase.table("chat_preferences").select("*").eq(
            "user_id", user_id
        ).eq("preference_type", "long_term").execute()
        
        # Get frequent trip-specific preferences (frequency >= 3)
        frequent_trip = supabase.table("chat_preferences").select("*").eq(
            "user_id", user_id
        ).eq("preference_type", "trip_specific").gte("frequency", 3).execute()
        
        # Get temporal preferences (frequency >= 2)
        temporal = supabase.table("chat_preferences").select("*").eq(
            "user_id", user_id
        ).eq("preference_type", "temporal").gte("frequency", 2).execute()
        
        return {
            "long_term": long_term.data or [],
            "frequent_trip_specific": frequent_trip.data or [],
            "temporal": temporal.data or [],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching preferences: {str(e)}")


@app.get("/user/profile")
async def get_user_profile(user_id: str):
    """Get generated user profile summary"""
    try:
        summary = await generate_user_profile_summary(user_id)
        return {"summary": summary}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating profile: {str(e)}")


class PromotePreferenceRequest(BaseModel):
    user_id: str
    preference_id: str


@app.post("/user/preferences/promote")
async def promote_preference(request: PromotePreferenceRequest):
    """Manually promote a trip-specific preference to long-term"""
    try:
        supabase = get_supabase_client()
        if not supabase:
            raise HTTPException(status_code=503, detail="Database service unavailable")
        
        # Get the preference
        pref = supabase.table("chat_preferences").select("*").eq(
            "id", request.preference_id
        ).eq("user_id", request.user_id).execute()
        
        if not pref.data or len(pref.data) == 0:
            raise HTTPException(status_code=404, detail="Preference not found")
        
        pref_data = pref.data[0]
        
        if pref_data["preference_type"] != "trip_specific":
            raise HTTPException(status_code=400, detail="Can only promote trip-specific preferences")
        
        # Check if long-term version already exists
        existing = supabase.table("chat_preferences").select("*").eq(
            "user_id", request.user_id
        ).eq("preference_category", pref_data["preference_category"]).eq(
            "preference_value", pref_data["preference_value"]
        ).eq("preference_type", "long_term").execute()
        
        if existing.data and len(existing.data) > 0:
            return {"message": "Preference already promoted", "preference": existing.data[0]}
        
        # Create long-term version
        new_pref = {
            "user_id": request.user_id,
            "trip_id": None,
            "preference_type": "long_term",
            "preference_category": pref_data["preference_category"],
            "preference_value": pref_data["preference_value"],
            "frequency": pref_data["frequency"],
            "confidence": pref_data.get("confidence", 0.5),
            "extracted_from_message": f"Manually promoted from trip-specific",
        }
        
        result = supabase.table("chat_preferences").insert(new_pref).execute()
        
        return {"message": "Preference promoted successfully", "preference": new_pref}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error promoting preference: {str(e)}")

