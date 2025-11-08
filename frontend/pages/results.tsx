import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Bar, Radar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  RadialLinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  RadialLinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface ItineraryDay {
  day: number;
  morning: string;
  afternoon: string;
  evening: string;
}

interface ItineraryResponse {
  destination: string;
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
          origin: (itinerary as any).origin || undefined, // Preserve origin if available
          num_days: itinerary.num_days,
          budget: itinerary.budget,
          preferences: [], // Could extract from original request
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
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">Loading...</div>;
  }

  const currency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });

  // Chart data for comparison
  const comparisonData = {
    labels: ["Cost", "Emissions (kg CO₂)", "Eco Score"],
    datasets: [
      {
        label: itinerary.mode === "price-optimal" ? "Price-Optimal" : "Balanced",
        data: [
          itinerary.totals.cost / 100, // Normalize for display
          itinerary.totals.emissions_kg,
          itinerary.eco_score || 0,
        ],
        backgroundColor: "rgba(34, 197, 94, 0.6)",
        borderColor: "rgba(34, 197, 94, 1)",
        borderWidth: 2,
      },
    ],
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
      <header className="border-b border-green-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <h1 className="text-2xl font-bold text-green-800">🌱 GreenTrip</h1>
          <button
            onClick={() => router.push("/")}
            className="text-sm text-green-600 hover:text-green-800"
          >
            ← New Trip
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 rounded-2xl border border-green-200 bg-white p-6 shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{itinerary.destination}</h2>
              <p className="text-gray-600">
                {itinerary.num_days} days • Mode: {itinerary.mode === "price-optimal" ? "💸 Price-Optimal" : "🌱 Balanced"}
              </p>
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => handleRegenerate("price-optimal")}
                disabled={regenerating || itinerary.mode === "price-optimal"}
                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                💸 Price Mode
              </button>
              <button
                onClick={() => handleRegenerate("balanced")}
                disabled={regenerating || itinerary.mode === "balanced"}
                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                🌱 Balanced Mode
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3 mb-8">
          <div className="rounded-xl border border-green-200 bg-white p-6 shadow-lg">
            <h3 className="text-sm font-semibold text-gray-600 mb-2">Total Cost</h3>
            <p className="text-3xl font-bold text-green-600">
              {currency.format(itinerary.totals.cost)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Budget: {currency.format(itinerary.budget)}
            </p>
          </div>

          <div className="rounded-xl border border-green-200 bg-white p-6 shadow-lg">
            <h3 className="text-sm font-semibold text-gray-600 mb-2">CO₂ Emissions</h3>
            <p className="text-3xl font-bold text-orange-600">
              {itinerary.totals.emissions_kg.toFixed(1)} kg
            </p>
            <p className="text-xs text-gray-500 mt-1">Carbon footprint</p>
          </div>

          <div className="rounded-xl border border-green-200 bg-white p-6 shadow-lg">
            <h3 className="text-sm font-semibold text-gray-600 mb-2">Eco Score</h3>
            <p className="text-3xl font-bold text-emerald-600">
              {itinerary.eco_score?.toFixed(0) || "N/A"}
            </p>
            <p className="text-xs text-gray-500 mt-1">0-100 sustainability rating</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2 mb-8">
          <div className="rounded-xl border border-green-200 bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Comparison Chart</h3>
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

          <div className="rounded-xl border border-green-200 bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Rationale</h3>
            <p className="text-sm text-gray-700 leading-relaxed">{itinerary.rationale}</p>
          </div>
        </div>

        <div className="rounded-xl border border-green-200 bg-white p-6 shadow-lg">
          <h3 className="text-xl font-semibold text-gray-900 mb-6">Daily Itinerary</h3>
          <div className="space-y-6">
            {itinerary.days.map((day) => (
              <div
                key={day.day}
                className="rounded-lg border border-gray-200 bg-gray-50 p-6"
              >
                <h4 className="text-lg font-semibold text-gray-900 mb-4">
                  Day {day.day}
                </h4>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Morning</p>
                    <p className="text-sm text-gray-700">{day.morning}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Afternoon</p>
                    <p className="text-sm text-gray-700">{day.afternoon}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Evening</p>
                    <p className="text-sm text-gray-700">{day.evening}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

