import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Bar } from "react-chartjs-2";
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
}

export default function Results() {
  const router = useRouter();
  const [itinerary, setItinerary] = useState<ItineraryResponse | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("itinerary");
    if (stored) {
      setItinerary(JSON.parse(stored));
    } else {
      router.push("/");
    }
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

  if (!itinerary) {
    return <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-amber-100 text-emerald-900">Loading your journey...</div>;
  }

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

      <main className="mx-auto max-w-6xl px-6 py-10">
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
          <div className="space-y-6">
            {itinerary.days.map((day) => (
              <div
                key={day.day}
                className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-6 shadow-sm shadow-emerald-200/30"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h4 className="text-lg font-medium text-emerald-900">Day {day.day}</h4>
                </div>
                <div className="mt-4 grid gap-6 md:grid-cols-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-500">Morning</p>
                    <p className="mt-2 text-sm text-emerald-800">{day.morning}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-500">Afternoon</p>
                    <p className="mt-2 text-sm text-emerald-800">{day.afternoon}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-500">Evening</p>
                    <p className="mt-2 text-sm text-emerald-800">{day.evening}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

