import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Bar } from "react-chartjs-2";
import { supabase } from "../lib/supabase";
import ChatPlanner from "../components/ChatPlanner";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface ItineraryDay {
  day: number;
  morning: string;
  afternoon: string;
  evening: string;
}

interface FlightOption {
  id?: string;
  carrier: string;
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  price: number;
  currency?: string;
  eco_score?: number;
  emissions_kg?: number;
}

interface DaypartWeather {
  summary: string;
  temperature_c: number;
  precipitation_probability: number;
}

interface DayWeather {
  date: string;
  morning: DaypartWeather;
  afternoon: DaypartWeather;
  evening: DaypartWeather;
}

interface ItineraryResponse {
  destination: string;
  start_date?: string;
  end_date?: string;
  num_days: number;
  budget: number;
  mode: string;
  days: ItineraryDay[];
  totals: {
    cost: number;
    emissions_kg: number;
  };
  rationale: string;
  eco_score?: number;
  flights?: FlightOption[];
  day_weather?: DayWeather[];
}

export default function Results() {
  const router = useRouter();
  const [itinerary, setItinerary] = useState<ItineraryResponse | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [currentDayIndex, setCurrentDayIndex] = useState(0);
  const [user, setUser] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tripName, setTripName] = useState("");
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showChat, setShowChat] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("itinerary");
    if (stored) {
      const parsed: ItineraryResponse = JSON.parse(stored);
      setItinerary(parsed);
      setCurrentDayIndex(0);
      // Set default trip name
      setTripName(`${parsed.destination} - ${parsed.start_date || new Date().toLocaleDateString()}`);
    } else {
      router.push("/");
    }

    // Check for authenticated user
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
  }, [router]);

  const handleRegenerate = async (newMode: "price-optimal" | "balanced") => {
    if (!itinerary) return;

    setRegenerating(true);
    try {
      const response = await fetch("http://localhost:8000/generate_itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination: itinerary.destination,
          origin: (itinerary as any).origin || undefined,
          start_date: itinerary.start_date,
          end_date: itinerary.end_date,
          num_days: itinerary.num_days,
          budget: itinerary.budget,
          preferences: [],
          mode: newMode,
        }),
      });

      if (!response.ok) throw new Error("Failed to regenerate");

      const data: ItineraryResponse = await response.json();
      sessionStorage.setItem("itinerary", JSON.stringify(data));
      setItinerary(data);
    } catch (err) {
      alert("Failed to regenerate itinerary");
    } finally {
      setRegenerating(false);
    }
  };

  const handleSaveTrip = async () => {
    if (!user || !itinerary) {
      setShowSaveModal(true);
      return;
    }

    if (!tripName.trim()) {
      alert("Please enter a trip name");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("saved_trips")
        .insert({
          user_id: user.id,
          trip_name: tripName.trim(),
          destination: itinerary.destination,
          start_date: itinerary.start_date || null,
          end_date: itinerary.end_date || null,
          num_days: itinerary.num_days,
          budget: itinerary.budget,
          mode: itinerary.mode,
          itinerary_data: itinerary,
        });

      if (error) throw error;

      setSaved(true);
      setShowSaveModal(false);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      alert(`Failed to save trip: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleItineraryUpdate = (updatedItinerary: any) => {
    setItinerary(updatedItinerary);
    sessionStorage.setItem("itinerary", JSON.stringify(updatedItinerary));
    setCurrentDayIndex(0);
  };

  if (!itinerary) {
    return <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-amber-100 text-emerald-900">Loading your journey...</div>;
  }

  const currentDay = itinerary.days[currentDayIndex];
  const currentWeather = itinerary.day_weather?.[currentDayIndex];
  const goPrevDay = () => setCurrentDayIndex((prev) => Math.max(0, prev - 1));
  const goNextDay = () => setCurrentDayIndex((prev) => Math.min(itinerary.days.length - 1, prev + 1));

  const currency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });

const formatPrice = (amount: number, currencyCode?: string) => {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode || "USD",
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
};

const formatDateTime = (value?: string) => {
  if (!value) return "Schedule pending";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const weatherGlyph = (summary: string) => {
  const text = summary.toLowerCase();
  if (text.includes("thunder")) return "⛈️";
  if (text.includes("snow")) return "❄️";
  if (text.includes("rain") || text.includes("drizzle")) return "🌧️";
  if (text.includes("cloud")) return "☁️";
  if (text.includes("storm")) return "🌩️";
  if (text.includes("wind")) return "💨";
  if (text.includes("fog") || text.includes("mist")) return "🌫️";
  return "☀️";
};

const buildWeatherTooltip = (weather?: DaypartWeather) => {
  if (!weather) return "";
  return `${weather.summary} • ${Math.round(weather.temperature_c)}°C • ${Math.round(
    weather.precipitation_probability * 100
  )}% chance of precipitation`;
};


  const comparisonData = {
    labels: ["Cost (x100)", "Emissions (kg CO₂)", "Eco Score"],
    datasets: [
      {
        label: itinerary.mode === "price-optimal" ? "Price-Optimal" : "Balanced",
        data: [itinerary.totals.cost / 100, itinerary.totals.emissions_kg, itinerary.eco_score || 0],
        backgroundColor: "rgba(16, 185, 129, 0.55)",
        borderColor: "rgba(5, 150, 105, 1)",
        borderWidth: 2,
      },
    ],
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-amber-100 text-emerald-950">
      <header className="border-b border-emerald-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500" />
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-emerald-500">TripSmith • Results</p>
              <h1 className="text-xl font-medium text-emerald-900 md:text-2xl">GreenTrip Journey Report</h1>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm text-emerald-700">
            {user && (
              <button
                onClick={handleSaveTrip}
                disabled={saving || saved}
                className={`rounded-full px-4 py-2 font-medium transition ${
                  saved
                    ? "bg-emerald-500 text-white"
                    : "border border-emerald-200 hover:border-emerald-300 hover:text-emerald-900"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {saved ? "✓ Saved!" : saving ? "Saving..." : "💾 Save Trip"}
              </button>
            )}
            {!user && (
              <button
                onClick={() => setShowSaveModal(true)}
                className="rounded-full border border-emerald-200 px-4 py-2 transition hover:border-emerald-300 hover:text-emerald-900"
              >
                💾 Save Trip
              </button>
            )}
            <button
              onClick={() => handleRegenerate("price-optimal")}
              disabled={regenerating || itinerary.mode === "price-optimal"}
              className="rounded-full border border-emerald-200 px-4 py-2 transition hover:border-emerald-300 hover:text-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              💸 Price Mode
            </button>
            <button
              onClick={() => handleRegenerate("balanced")}
              disabled={regenerating || itinerary.mode === "balanced"}
              className="rounded-full border border-emerald-200 px-4 py-2 transition hover:border-emerald-300 hover:text-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              🌱 Balanced Mode
            </button>
            <button
              onClick={() => router.push("/")}
              className="rounded-full border border-emerald-200 px-4 py-2 transition hover:border-emerald-300 hover:text-emerald-900"
            >
              Plan another trip ↗
            </button>
          </div>
        </div>
      </header>

      <main className={`mx-auto px-6 py-10 transition-all ${
        showChat 
          ? "max-w-[calc(100%-24rem)] min-w-0" 
          : "max-w-6xl"
      }`}>
        <section className="grid gap-10 lg:grid-cols-[1.05fr,0.95fr] lg:items-start">
          <div className="space-y-6">
            <div className="rounded-[32px] border border-emerald-100 bg-white/95 p-8 shadow-xl shadow-emerald-200/50">
              <p className="text-xs uppercase tracking-[0.3em] text-emerald-500">Your itinerary</p>
              <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-3xl font-medium tracking-tight text-emerald-950">
                    {itinerary.destination}
                  </h2>
                  <p className="text-sm text-emerald-700">
                    {itinerary.num_days} days • {itinerary.mode === "price-optimal" ? "Price-optimal" : "Balanced"} mode
                  </p>
                </div>
                <div className="rounded-full bg-emerald-50 px-4 py-2 text-xs font-medium text-emerald-700">
                  Budget: {currency.format(itinerary.budget)}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">
                Flight options curated for you
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                {itinerary.flights && itinerary.flights.length > 0 ? (
                  itinerary.flights
                    .slice()
                    .sort((a, b) => (b.eco_score || 0) - (a.eco_score || 0))
                    .map((flight, index) => (
                      <div
                        key={flight.id || index}
                        className="relative rounded-2xl border border-emerald-100 bg-white/95 p-5 shadow-lg shadow-emerald-200/40"
                      >
                        {index === 0 && (
                          <span className="absolute -top-3 right-4 rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white shadow-md">
                            Eco leader • +100 carbon credits
                          </span>
                        )}
                        <div className="flex items-center justify-between text-sm text-emerald-800">
                          <span className="font-semibold">
                            {flight.origin} → {flight.destination}
                          </span>
                          <span>{formatPrice(flight.price, flight.currency)}</span>
                        </div>
                        <p className="mt-2 text-xs text-emerald-600">
                          {formatDateTime(flight.departure)} — {formatDateTime(flight.arrival)}
                        </p>
                        <div className="mt-3 flex items-center justify-between text-xs">
                          <span className="font-medium text-emerald-700">{flight.carrier}</span>
                          <span className="rounded-full border border-emerald-200 px-2 py-1 text-emerald-600">
                            Eco score: {flight.eco_score ?? "N/A"}
                          </span>
                        </div>
                      </div>
                    ))
                ) : (
                  <div className="rounded-2xl border border-emerald-100 bg-white/90 p-6 text-sm text-emerald-700">
                    Flight details will appear here once available.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-emerald-100 bg-white/95 p-6 shadow-lg shadow-emerald-200/40">
                <p className="text-xs uppercase tracking-[0.3em] text-emerald-500">Total spend</p>
                <p className="mt-3 text-3xl font-medium text-emerald-900">
                  {currency.format(itinerary.totals.cost)}
                </p>
                <p className="mt-2 text-xs text-emerald-600">Includes flights, lodging, and curated experiences.</p>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-white/95 p-6 shadow-lg shadow-emerald-200/40">
                <p className="text-xs uppercase tracking-[0.3em] text-emerald-500">Estimated CO₂</p>
                <p className="mt-3 text-3xl font-medium text-orange-600">
                  {itinerary.totals.emissions_kg.toFixed(1)} kg
                </p>
                <p className="mt-2 text-xs text-emerald-600">Offset options available via Climatiq partners.</p>
              </div>
            </div>

            <div className="rounded-3xl border border-emerald-100 bg-white/95 p-6 shadow-lg shadow-emerald-200/40">
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">
                Footprint overview
              </h3>
              <div className="mt-4">
                <Bar
                  data={comparisonData}
                  options={{
                    responsive: true,
                    plugins: {
                      legend: { display: false },
                      title: { display: false },
                    },
                    scales: {
                      y: { beginAtZero: true },
                    },
                  }}
                />
              </div>
            </div>

            <div className="rounded-3xl border border-emerald-100 bg-white/95 p-6 shadow-lg shadow-emerald-200/40">
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">
                Concierge rationale
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-emerald-800">{itinerary.rationale}</p>
            </div>
          </div>
        </section>

        <section className="mt-12 rounded-[32px] border border-emerald-100 bg-white/95 p-8 shadow-2xl shadow-emerald-200/50">
          <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600 mb-6">
            Your day-by-day immersion
          </h3>
          <div className="mb-6 rounded-2xl border border-emerald-100 bg-white/95 p-6 shadow-md shadow-emerald-200/40">
            <h4 className="text-xs uppercase tracking-[0.3em] text-emerald-500 mb-3">
              Map preview
            </h4>
            <div className="flex h-72 w-full items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50/80 text-sm text-emerald-600">
              <div className="text-center">
                <p className="font-medium text-emerald-700">Interactive map placeholder</p>
                <p className="mt-2 text-xs text-emerald-500">
                  A Mapbox embed will showcase flight paths and key points of interest here.
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-emerald-500">Day selector</p>
              <h4 className="mt-1 text-lg font-medium text-emerald-900">
                Day {currentDay.day} of {itinerary.days.length}
              </h4>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={goPrevDay}
                disabled={currentDayIndex === 0}
                className="rounded-full border border-emerald-200 px-3 py-2 text-sm text-emerald-700 transition hover:border-emerald-300 hover:text-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Previous day"
              >
                ‹
              </button>
              <button
                onClick={goNextDay}
                disabled={currentDayIndex === itinerary.days.length - 1}
                className="rounded-full border border-emerald-200 px-3 py-2 text-sm text-emerald-700 transition hover:border-emerald-300 hover:text-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Next day"
              >
                ›
              </button>
            </div>
          </div>
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-6 shadow-sm shadow-emerald-200/30">
              <div className="grid gap-6 md:grid-cols-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-500">Morning</p>
                  <p className="mt-2 text-sm text-emerald-800">{currentDay.morning}</p>
                  {currentWeather?.morning && (
                    <div className="group relative mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-white/80 px-3 py-2 text-sm text-emerald-700">
                      <span className="text-lg">{weatherGlyph(currentWeather.morning.summary)}</span>
                      <span>{Math.round(currentWeather.morning.temperature_c)}°C</span>
                      <div className="pointer-events-none absolute bottom-full left-1/2 hidden -translate-x-1/2 -translate-y-2 whitespace-nowrap rounded-md bg-emerald-900 px-3 py-2 text-xs text-white shadow-lg group-hover:flex">
                        {buildWeatherTooltip(currentWeather.morning)}
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-500">Afternoon</p>
                  <p className="mt-2 text-sm text-emerald-800">{currentDay.afternoon}</p>
                  {currentWeather?.afternoon && (
                    <div className="group relative mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-white/80 px-3 py-2 text-sm text-emerald-700">
                      <span className="text-lg">
                        {weatherGlyph(currentWeather.afternoon.summary)}
                      </span>
                      <span>{Math.round(currentWeather.afternoon.temperature_c)}°C</span>
                      <div className="pointer-events-none absolute bottom-full left-1/2 hidden -translate-x-1/2 -translate-y-2 whitespace-nowrap rounded-md bg-emerald-900 px-3 py-2 text-xs text-white shadow-lg group-hover:flex">
                        {buildWeatherTooltip(currentWeather.afternoon)}
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-500">Evening</p>
                  <p className="mt-2 text-sm text-emerald-800">{currentDay.evening}</p>
                  {currentWeather?.evening && (
                    <div className="group relative mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-white/80 px-3 py-2 text-sm text-emerald-700">
                      <span className="text-lg">{weatherGlyph(currentWeather.evening.summary)}</span>
                      <span>{Math.round(currentWeather.evening.temperature_c)}°C</span>
                      <div className="pointer-events-none absolute bottom-full left-1/2 hidden -translate-x-1/2 -translate-y-2 whitespace-nowrap rounded-md bg-emerald-900 px-3 py-2 text-xs text-white shadow-lg group-hover:flex">
                        {buildWeatherTooltip(currentWeather.evening)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Chat Planner Sidebar */}
      {showChat && (
        <div className="fixed right-0 top-0 z-50 h-full w-96 border-l border-emerald-200 bg-white shadow-2xl transition-transform">
          <div className="h-full">
            <ChatPlanner
              itinerary={itinerary}
              onItineraryUpdate={handleItineraryUpdate}
              onClose={() => setShowChat(false)}
            />
          </div>
        </div>
      )}

      {/* Floating Chat Button */}
      <button
        onClick={() => setShowChat(!showChat)}
        className={`fixed bottom-6 right-6 z-50 flex h-16 w-16 items-center justify-center rounded-full shadow-lg transition-all ${
          showChat
            ? "bg-emerald-500 text-white"
            : "bg-gradient-to-r from-emerald-500 to-emerald-400 text-white hover:from-emerald-600 hover:to-emerald-500"
        }`}
        title={showChat ? "Close chat" : "Open chat planner"}
      >
        {showChat ? "✕" : "💬"}
      </button>

      {/* Save Trip Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl border border-emerald-200 bg-white p-6 shadow-2xl">
            <button
              onClick={() => setShowSaveModal(false)}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
            
            <h2 className="mb-4 text-2xl font-bold text-emerald-900">
              {user ? "Save Trip" : "Sign In to Save Trip"}
            </h2>

            {!user ? (
              <div className="space-y-4">
                <p className="text-sm text-emerald-700">
                  Please sign in to save your trips and access them from your dashboard.
                </p>
                <button
                  onClick={() => {
                    setShowSaveModal(false);
                    router.push("/");
                  }}
                  className="w-full rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-400 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:shadow-xl"
                >
                  Go to Sign In
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-emerald-900">
                    Trip Name
                  </label>
                  <input
                    type="text"
                    value={tripName}
                    onChange={(e) => setTripName(e.target.value)}
                    placeholder="e.g. Paris Summer 2025"
                    className="w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm text-emerald-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowSaveModal(false)}
                    className="flex-1 rounded-lg border border-emerald-200 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveTrip}
                    disabled={saving || !tripName.trim()}
                    className="flex-1 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-400 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save Trip"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

