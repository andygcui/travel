import logging
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from schemas import (
    BookingRequest,
    BookingConfirmation,
    TripPlanRequest,
    TripPlanResponse,
    ItineraryGenerationRequest,
    GreenTripItineraryResponse,
)
from services import planner
from services.itinerary_generator import generate_itinerary

load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

app = FastAPI(title="GreenTrip AI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/plan")
def heartbeat():
    return {"message": "TripSmith backend running!"}


@app.post("/plan", response_model=TripPlanResponse)
async def create_plan(request: TripPlanRequest):
    return await planner.build_trip_plan(request)


@app.post("/bookings", response_model=BookingConfirmation)
async def create_booking(request: BookingRequest):
    confirmation = planner.create_booking(request)
    return confirmation


@app.get("/bookings/{booking_id}", response_model=BookingConfirmation)
def get_booking(booking_id: str):
    confirmation = planner.get_booking(booking_id)
    if not confirmation:
        raise HTTPException(status_code=404, detail="Booking not found")
    return confirmation


@app.post("/generate_itinerary", response_model=GreenTripItineraryResponse)
async def create_itinerary(request: ItineraryGenerationRequest):
    """GreenTrip endpoint: Generate optimized eco-friendly travel itinerary"""
    import logging
    logger = logging.getLogger(__name__)
    
    logger.info(f"Received itinerary request: {request.destination}, {request.num_days} days, ${request.budget}, mode: {request.mode}")
    
    try:
        result = await generate_itinerary(request)
        logger.info(f"Successfully generated itinerary for {request.destination}")
        return result
    except ValueError as e:
        logger.error(f"Validation error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error generating itinerary: {type(e).__name__}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error generating itinerary: {str(e)}")

