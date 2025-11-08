from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import List

from ..schemas import LodgingOption, TripPlanRequest


async def fetch_lodging(request: TripPlanRequest) -> List[LodgingOption]:
    """
    Placeholder for lodging providers (e.g., Amadeus, Booking, Airbnb).
    Currently returns curated example data based on budget.
    """
    nightly_budget = max(request.budget * 0.35, 120)
    length = (request.end_date - request.start_date).days or 1
    average_rate = round(min(nightly_budget, request.budget / length), 2)

    return [
        LodgingOption(
            id=str(uuid.uuid4()),
            name="EcoStay Boutique Hotel",
            address=f"Central District, {request.destination}",
            nightly_rate=average_rate,
            currency="USD",
            distance_to_center_km=1.2,
            sustainability_score=0.85,
            booking_url=None,
            refundable_until=datetime.utcnow() + timedelta(days=5),
        ),
        LodgingOption(
            id=str(uuid.uuid4()),
            name="Riverside Hostel & Co-Work",
            address=f"Old Town, {request.destination}",
            nightly_rate=max(75, average_rate * 0.6),
            currency="USD",
            distance_to_center_km=0.5,
            sustainability_score=0.65,
            booking_url=None,
            refundable_until=datetime.utcnow() + timedelta(days=3),
        ),
    ]

