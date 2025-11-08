import { useMemo, useState } from "react";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export default function Home() {
  const [destination, setDestination] = useState("");
  const [origin, setOrigin] = useState("");
  const [budget, setBudget] = useState(1500);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [travelers, setTravelers] = useState(1);
  const [likes, setLikes] = useState("");
  const [dislikes, setDislikes] = useState("");
  const [travelStyle, setTravelStyle] = useState("balanced");
  const [sustainability, setSustainability] = useState(true);
  const [email, setEmail] = useState("");

  const [plan, setPlan] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [selectedFlight, setSelectedFlight] = useState(null);
  const [selectedLodging, setSelectedLodging] = useState(null);
  const [booking, setBooking] = useState(null);
  const [bookingStatus, setBookingStatus] = useState("");

  const likesArray = useMemo(
    () =>
      likes
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    [likes]
  );

  const dislikesArray = useMemo(
    () =>
      dislikes
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    [dislikes]
  );

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setPlan(null);
    setBooking(null);

    const payload = {
      destination,
      origin: origin || null,
      start_date: startDate,
      end_date: endDate,
      budget: Number(budget),
      travelers: Number(travelers),
      profile: {
        email: email || null,
        travel_style: travelStyle,
        preferences: {
          likes: likesArray,
          dislikes: dislikesArray,
          sustainability_priority: sustainability,
        },
      },
    };

    try {
      const response = await fetch("http://localhost:8000/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Failed to generate plan.");
      }

      const data = await response.json();
      setPlan(data);
      setSelectedFlight(data.flights?.[0]?.id ?? null);
      setSelectedLodging(data.lodging?.[0]?.id ?? null);
    } catch (err) {
      setError(
        err.message || "Unable to reach TripSmith backend. Make sure it is running."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleBooking = async () => {
    if (!plan) return;
    setBookingStatus("Submitting booking request…");

    try {
      const response = await fetch("http://localhost:8000/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_plan: plan,
          selected_flight_id: selectedFlight,
          selected_lodging_id: selectedLodging,
          contact_email: email || null,
        }),
      });

      if (!response.ok) {
        throw new Error("Booking failed");
      }

      const confirmation = await response.json();
      setBooking(confirmation);
      setBookingStatus("Booking confirmed!");
    } catch (err) {
      setBookingStatus("Unable to complete booking. Try again later.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">TripSmith AI 🌍</h1>
            <p className="text-sm text-slate-500">
              Your adaptive, sustainability-first travel companion.
            </p>
          </div>
          <div className="text-sm text-slate-500">
            Built at HackPrinceton 2025 • Powered by OpenAI, Open-Meteo, Tequila, OpenTripMap
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-10">
        <section className="grid gap-8 lg:grid-cols-[1.1fr,1fr]">
          <form
            onSubmit={handleSubmit}
            className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60"
          >
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Plan Your Trip</h2>
              <p className="text-sm text-slate-500">
                We’ll assemble flights, weather, health advisories, lodging, and a personalized itinerary.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-slate-700">Destination</span>
                <input
                  type="text"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="e.g. Kyoto, Japan"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-sky-500"
                  required
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-slate-700">
                  Origin (airport code)
                </span>
                <input
                  type="text"
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value.toUpperCase())}
                  placeholder="EWR"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 uppercase outline-none focus:border-sky-500"
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-slate-700">Start Date</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-sky-500"
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-slate-700">End Date</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-sky-500"
                  required
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-slate-700">Budget (USD)</span>
                <input
                  type="number"
                  min="0"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-sky-500"
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-slate-700">Travelers</span>
                <input
                  type="number"
                  min="1"
                  value={travelers}
                  onChange={(e) => setTravelers(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-sky-500"
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-slate-700">Contact Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-sky-500"
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-slate-700">What do you love?</span>
                <input
                  type="text"
                  value={likes}
                  onChange={(e) => setLikes(e.target.value)}
                  placeholder="tea ceremonies, hiking, street food"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-sky-500"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-slate-700">Anything to avoid?</span>
                <input
                  type="text"
                  value={dislikes}
                  onChange={(e) => setDislikes(e.target.value)}
                  placeholder="crowds, late nights"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-sky-500"
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-slate-700">Travel Style</span>
                <select
                  value={travelStyle}
                  onChange={(e) => setTravelStyle(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-sky-500"
                >
                  <option value="balanced">Balanced</option>
                  <option value="luxury">Luxury</option>
                  <option value="budget">Budget</option>
                  <option value="adventure">Adventure</option>
                  <option value="wellness">Wellness</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={sustainability}
                  onChange={(e) => setSustainability(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 bg-white text-sky-500 focus:ring-0"
                />
                <span className="font-semibold text-slate-700">
                  Prioritize sustainability
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 inline-flex items-center justify-center rounded-lg bg-sky-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-wait disabled:bg-slate-300"
            >
              {loading ? "Planning your trip…" : "Generate Smart Plan"}
            </button>

            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </p>
            )}
          </form>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/60">
            <h2 className="text-lg font-semibold text-slate-900">What you get</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-600">
              <li>• AI-personalized daily itinerary with sustainability tips</li>
              <li>• Live weather outlook and activity adjustments</li>
              <li>• Flight + lodging matches with refund tracking</li>
              <li>• Health + safety guidance for confident travel</li>
              <li>• Budget optimization breakdown and eco-points</li>
            </ul>
          </div>
        </section>

        {plan && (
          <section className="grid gap-8">
            <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/60 md:grid-cols-2">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">Trip Snapshot</h3>
                <p className="text-sm text-slate-600">
                  {plan.destination} • {plan.travelers} traveler(s) •{" "}
                  {plan.start_date} → {plan.end_date}
                </p>
              </div>
              <div className="grid gap-2 text-sm text-slate-600 md:text-right">
                <p>
                  Budget:{" "}
                  <span className="font-semibold text-slate-900">
                    {currency.format(plan.budget)}
                  </span>
                </p>
                <p>
                  Sustainability tier:{" "}
                  <span className="font-semibold text-emerald-600">
                    {plan.sustainability.tier} ({plan.sustainability.total_points} pts)
                  </span>
                </p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/60">
                <h3 className="text-lg font-semibold text-slate-900">Flight Options</h3>
                <div className="mt-4 space-y-4">
                  {plan.flights?.map((flight) => (
                    <label
                      key={flight.id}
                      className="block rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-sky-400 hover:bg-slate-100"
                    >
                      <div className="flex items-center justify-between text-sm text-slate-700">
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="flight"
                            value={flight.id}
                            checked={selectedFlight === flight.id}
                            onChange={() => setSelectedFlight(flight.id)}
                            className="h-4 w-4 text-sky-500 focus:ring-0"
                          />
                          <span className="font-semibold text-slate-900">
                            {flight.segments?.[0]?.origin} → {flight.segments?.slice(-1)[0]?.destination}
                          </span>
                        </div>
                        <span className="font-semibold text-sky-600">
                          {currency.format(flight.price)}
                        </span>
                      </div>
                      <ul className="mt-2 text-xs text-slate-600">
                        {flight.segments?.map((segment, idx) => (
                          <li key={`${flight.id}-seg-${idx}`}>
                            {segment.carrier} {segment.flight_number} • {segment.origin} →{" "}
                            {segment.destination}
                          </li>
                        ))}
                      </ul>
                      {flight.refundable_until && (
                        <p className="mt-2 text-xs text-emerald-600">
                          Refundable until: {new Date(flight.refundable_until).toLocaleString()}
                        </p>
                      )}
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/60">
                <h3 className="text-lg font-semibold text-slate-900">Lodging Suggestions</h3>
                <div className="mt-4 space-y-4">
                  {plan.lodging?.map((stay) => (
                    <label
                      key={stay.id}
                      className="block rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-sky-400 hover:bg-slate-100"
                    >
                      <div className="flex items-center justify-between text-sm text-slate-700">
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="lodging"
                            value={stay.id}
                            checked={selectedLodging === stay.id}
                            onChange={() => setSelectedLodging(stay.id)}
                            className="h-4 w-4 text-sky-500 focus:ring-0"
                          />
                          <span className="font-semibold text-slate-900">{stay.name}</span>
                        </div>
                        <span className="font-semibold text-sky-600">
                          {currency.format(stay.nightly_rate)}/night
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">{stay.address}</p>
                      {stay.distance_to_center_km && (
                        <p className="text-xs text-slate-500">
                          {stay.distance_to_center_km} km from main attractions
                        </p>
                      )}
                      {stay.sustainability_score && (
                        <p className="text-xs text-emerald-600">
                          Sustainability score: {(stay.sustainability_score * 100).toFixed(0)}%
                        </p>
                      )}
                      {stay.refundable_until && (
                        <p className="mt-2 text-xs text-emerald-600">
                          Refundable until: {new Date(stay.refundable_until).toLocaleString()}
                        </p>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/60">
                <h3 className="text-lg font-semibold text-slate-900">Daily Itinerary</h3>
                <div className="mt-4 space-y-4">
                  {plan.itinerary?.map((day, index) => (
                    <div
                      key={`${day.date}-${index}`}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex items-center justify-between text-sm text-slate-700">
                        <span className="font-semibold text-slate-900">{day.date}</span>
                        {day.theme && (
                          <span className="rounded bg-sky-100 px-2 py-1 text-xs text-sky-700">
                            {day.theme}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{day.summary}</p>
                      <ul className="mt-3 space-y-2 text-xs text-slate-600">
                        {day.activities?.map((activity, idx) => (
                          <li key={`${day.date}-activity-${idx}`}>
                            <span className="font-semibold text-sky-700">{activity.time}</span>{" "}
                            {activity.name} — {activity.description}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-6">
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/60">
                  <h3 className="text-lg font-semibold text-slate-900">Weather Outlook</h3>
                  <div className="mt-4 grid gap-2 text-sm text-slate-700">
                    {plan.weather?.map((day, idx) => (
                      <div
                        key={`${day.date}-${idx}`}
                        className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                      >
                        <span>{day.date}</span>
                        <span>{day.summary}</span>
                        <span>
                          {Math.round(day.temperature_low_c)}°C →{" "}
                          {Math.round(day.temperature_high_c)}°C
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/60">
                  <h3 className="text-lg font-semibold text-slate-900">Health & Safety</h3>
                  <ul className="mt-3 space-y-3 text-sm text-slate-700">
                    {plan.health?.map((item, idx) => (
                      <li key={`health-${idx}`}>
                        <p className="font-semibold text-amber-600">{item.title}</p>
                        <p className="text-slate-600">{item.description}</p>
                        <p className="text-xs text-slate-500">
                          Severity: {item.severity.toUpperCase()}{" "}
                          {item.source ? `• Source: ${item.source}` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/60">
                <h3 className="text-lg font-semibold text-slate-900">Must-See Spots</h3>
                <ul className="mt-3 space-y-2 text-sm text-slate-700">
                  {plan.points_of_interest?.map((poi, idx) => (
                    <li key={`poi-${idx}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <span className="font-semibold text-sky-700">{poi.name}</span>{" "}
                      <span className="text-xs uppercase text-slate-500">
                        {poi.category?.split(",")[0]}
                      </span>
                      {poi.description && (
                        <p className="text-xs text-slate-600">{poi.description}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/60">
                <h3 className="text-lg font-semibold text-slate-900">Budget Breakdown</h3>
                <ul className="mt-4 space-y-2 text-sm text-slate-700">
                  <li>
                    Flights:{" "}
                    <span className="font-semibold text-sky-700">
                      {currency.format(plan.budget_breakdown.flights)}
                    </span>
                  </li>
                  <li>
                    Lodging:{" "}
                    <span className="font-semibold text-sky-700">
                      {currency.format(plan.budget_breakdown.lodging)}
                    </span>
                  </li>
                  <li>
                    Experiences/Activities:{" "}
                    <span className="font-semibold text-sky-700">
                      {currency.format(plan.budget_breakdown.activities)}
                    </span>
                  </li>
                  <li>
                    Dining:{" "}
                    <span className="font-semibold text-sky-700">
                      {currency.format(plan.budget_breakdown.dining)}
                    </span>
                  </li>
                  <li>
                    Transit:{" "}
                    <span className="font-semibold text-sky-700">
                      {currency.format(plan.budget_breakdown.transit)}
                    </span>
                  </li>
                  <li>
                    Safety buffer:{" "}
                    <span className="font-semibold text-sky-700">
                      {currency.format(plan.budget_breakdown.emergency_fund)}
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/60">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Ready to Book?</h3>
                  <p className="text-sm text-slate-600">
                    We’ll lock in your chosen flight and stay, then track refund deadlines automatically.
                  </p>
                </div>
                <button
                  onClick={handleBooking}
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400"
                >
                  Book with TripSmith
                </button>
              </div>
              {bookingStatus && (
                <p className="mt-3 text-sm text-slate-600">{bookingStatus}</p>
              )}
              {booking && (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                  <p>Booking ID: {booking.booking_id}</p>
                  {booking.refundable_until && (
                    <p>
                      Refund deadline:{" "}
                      {new Date(booking.refundable_until).toLocaleString()}
                    </p>
                  )}
                  <p className="text-xs text-emerald-600/80">
                    A confirmation email will be sent to {email || "your inbox"} (demo).
                  </p>
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
