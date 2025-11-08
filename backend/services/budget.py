from __future__ import annotations

from ..schemas import BudgetBreakdown, TripPlanRequest


def build_budget_breakdown(request: TripPlanRequest, flight_cost: float, lodging_cost: float) -> BudgetBreakdown:
    remaining = max(request.budget - flight_cost - lodging_cost, 0)
    activities = remaining * 0.35
    dining = remaining * 0.25
    transit = remaining * 0.2
    emergency = remaining * 0.2

    return BudgetBreakdown(
        flights=flight_cost,
        lodging=lodging_cost,
        activities=round(activities, 2),
        dining=round(dining, 2),
        transit=round(transit, 2),
        emergency_fund=round(emergency, 2),
    )

