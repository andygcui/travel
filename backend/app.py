from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, Optional
from schemas import ItineraryGenerationRequest, GreenTripItineraryResponse
from services.itinerary_generator import generate_itinerary
from services.chat_planner import chat_planner

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


class ChatPlannerResponse(BaseModel):
    response: str
    updated_itinerary: Optional[Dict[str, Any]] = None


@app.post("/chat_planner", response_model=ChatPlannerResponse)
async def chat_planner_endpoint(request: ChatPlannerRequest):
    """Chat with the travel planner to modify itinerary"""
    result = await chat_planner(request.message, request.itinerary)
    return ChatPlannerResponse(
        response=result["response"],
        updated_itinerary=result.get("updated_itinerary"),
    )

