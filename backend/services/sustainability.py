from __future__ import annotations

from schemas import LodgingOption, SustainabilityScore, TripPlanRequest


def calculate_sustainability(
    request: TripPlanRequest,
    lodging_options: list[LodgingOption],
) -> SustainabilityScore:
    points = 0
    breakdown: list[str] = []

    if request.profile and request.profile.preferences.sustainability_priority:
        points += 20
        breakdown.append("Profile prioritizes sustainable choices (+20)")

    if request.travelers > 1:
        points += 10
        breakdown.append("Group travel reduces per-person footprint (+10)")

    for option in lodging_options:
        if option.sustainability_score and option.sustainability_score > 0.8:
            points += 15
            breakdown.append(
                f"{option.name} is eco-certified (+15)"
            )
            break

    if request.budget <= 1500:
        points += 5
        breakdown.append("Compact budget encourages mindful spending (+5)")

    tier = "Seedling"
    if points >= 60:
        tier = "Canopy"
    elif points >= 40:
        tier = "Forest"
    elif points >= 25:
        tier = "Sapling"

    return SustainabilityScore(
        total_points=points,
        tier=tier,
        breakdown=breakdown,
    )

