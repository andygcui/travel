from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .schemas import BookingRequest, BookingConfirmation, TripPlanRequest, TripPlanResponse
from .services import planner

load_dotenv()

app = FastAPI(title="TripSmith AI Backend")

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

