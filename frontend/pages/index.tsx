import { useState } from "react";
import { useRouter } from "next/router";

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

export default function Home() {
  const router = useRouter();
  const [destination, setDestination] = useState("");
  const [numDays, setNumDays] = useState(5);
  const [budget, setBudget] = useState(2000);
  const [preferences, setPreferences] = useState<string[]>([]);
  const [mode, setMode] = useState<"price-optimal" | "balanced">("balanced");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const preferenceOptions = ["food", "art", "outdoors", "history", "nightlife", "shopping", "wellness", "adventure"];

  const togglePreference = (pref: string) => {
    setPreferences((prev) =>
      prev.includes(pref) ? prev.filter((p) => p !== pref) : [...prev, pref]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("http://localhost:8000/generate_itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination,
          num_days: numDays,
          budget,
          preferences,
          mode,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Failed to generate itinerary" }));
        throw new Error(errorData.detail || "Failed to generate itinerary");
      }

      const data: ItineraryResponse = await response.json();
      // Store in sessionStorage and navigate to results
      sessionStorage.setItem("itinerary", JSON.stringify(data));
      router.push("/results");
    } catch (err: any) {
      setError(err.message || "Unable to reach GreenTrip backend. Make sure it is running.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
      <header className="border-b border-green-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-green-800">🌱 GreenTrip</h1>
            <p className="text-sm text-green-600">
              AI-powered sustainable travel planner
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">
            Plan Your Eco-Friendly Adventure
          </h2>
          <p className="text-gray-600">
            Get an optimized travel itinerary that balances cost, sustainability, and your preferences
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-green-200 bg-white p-8 shadow-xl"
        >
          <div className="grid gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Destination
              </label>
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="e.g. Paris, France"
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 outline-none focus:border-green-500"
                required
              />
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Number of Days
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="1"
                    max="30"
                    value={numDays}
                    onChange={(e) => setNumDays(Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-lg font-semibold text-gray-900 w-12 text-center">
                    {numDays}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Budget (USD)
                </label>
                <input
                  type="number"
                  min="100"
                  step="100"
                  value={budget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 outline-none focus:border-green-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Preferences (select all that apply)
              </label>
              <div className="flex flex-wrap gap-2">
                {preferenceOptions.map((pref) => (
                  <button
                    key={pref}
                    type="button"
                    onClick={() => togglePreference(pref)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                      preferences.includes(pref)
                        ? "bg-green-500 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {pref}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Optimization Mode
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="mode"
                    value="price-optimal"
                    checked={mode === "price-optimal"}
                    onChange={() => setMode("price-optimal")}
                    className="h-4 w-4 text-green-500 focus:ring-0"
                  />
                  <span className="text-gray-700">💸 Price-Optimal</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="mode"
                    value="balanced"
                    checked={mode === "balanced"}
                    onChange={() => setMode("balanced")}
                    className="h-4 w-4 text-green-500 focus:ring-0"
                  />
                  <span className="text-gray-700">🌱 Balanced (Eco + Price)</span>
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !destination}
              className="mt-4 inline-flex items-center justify-center rounded-lg bg-green-600 px-6 py-3 text-base font-semibold text-white transition hover:bg-green-500 disabled:cursor-wait disabled:bg-gray-300"
            >
              {loading ? "Generating your itinerary..." : "Generate Itinerary"}
            </button>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}

