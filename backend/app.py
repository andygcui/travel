from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from schemas import ItineraryGenerationRequest, GreenTripItineraryResponse
from services.itinerary_generator import generate_itinerary

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

