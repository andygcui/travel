from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Dict

from schemas import BookingConfirmation, BookingRequest, TripPlanResponse

_BOOKINGS: Dict[str, BookingConfirmation] = {}


def store_booking(request: BookingRequest) -> BookingConfirmation:
    booking_id = str(uuid.uuid4())
    refundable_until = None

    if request.selected_flight_id:
        refundable_until = datetime.utcnow() + timedelta(days=3)

    confirmation = BookingConfirmation(
        booking_id=booking_id,
        created_at=datetime.utcnow(),
        refundable_until=refundable_until,
        details={
            "selected_flight_id": request.selected_flight_id,
            "selected_lodging_id": request.selected_lodging_id,
            "destination": request.trip_plan.destination,
            "start_date": request.trip_plan.start_date,
            "end_date": request.trip_plan.end_date,
        },
    )

    _BOOKINGS[booking_id] = confirmation
    return confirmation


def get_booking(booking_id: str) -> BookingConfirmation | None:
    return _BOOKINGS.get(booking_id)

