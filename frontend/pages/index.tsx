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
  const [origin, setOrigin] = useState("");
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
          origin: origin || undefined,
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
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-amber-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-24 h-72 w-72 rounded-full bg-emerald-200/40 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-amber-200/40 blur-3xl" />
      </div>

      <header className="relative border-b border-emerald-100 bg-white/75 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500">
            </div>
            <div>
              <h1 className="text-xl font-medium tracking-tight text-emerald-900 md:text-2xl">
                GreenTrip
              </h1>
              <p className="text-xs text-emerald-600 md:text-sm">
                Purposeful journeys, curated with eco-luxury in mind
              </p>
            </div>
          </div>

          <nav className="flex items-center gap-4 text-xs text-emerald-700 md:text-sm">
            <span className="hidden md:inline">Experiences</span>
            <span className="hidden md:inline">Sustainability</span>
            <span className="hidden md:inline">Membership</span>
            <button className="rounded-full border border-emerald-200 px-4 py-2 text-sm font-medium text-emerald-800 transition hover:border-emerald-400 hover:text-emerald-900">
              Speak with a curator
            </button>
          </nav>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-6 py-16">
        <section className="grid gap-12 lg:grid-cols-[0.9fr,1.1fr] lg:items-start">
          <div className="space-y-10">
            <div className="space-y-6">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/70 px-4 py-1 text-sm font-medium text-emerald-700 shadow-sm">
                <span className="text-lg">🌿</span>
                Carbon-aware itineraries in seconds
              </span>

            <h2 className="text-4xl font-medium leading-tight text-emerald-950 md:text-5xl">
                Discover a smarter way to plan <br className="hidden md:block" />
                <span className="bg-gradient-to-r from-emerald-500 to-amber-500 bg-clip-text text-transparent">
                  tailor-made, sustainable escapes
                </span>
              </h2>

              <p className="max-w-2xl text-lg text-emerald-800">
                GreenTrip fuses live travel intelligence with a sustainability-first mindset to deliver
                bespoke itineraries that feel attentive, intuitive, and indulgent — without the footprint.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">
                Modern trip intelligence
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  "Seamlessly planned day-by-day journeys",
                  "Real-time weather and sustainability insights",
                  "Curated boutique stays and experiences",
                  "Dining, culture, and wellness to match your taste",
                ].map((feature) => (
                  <div
                    key={feature}
                    className="flex items-start gap-3 rounded-xl border border-white/50 bg-white/80 p-4 shadow-sm shadow-emerald-100/30"
                  >
                    <span className="mt-1 text-lg text-emerald-500">◆</span>
                    <p className="text-sm font-medium text-emerald-800">{feature}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="relative rounded-[32px] border border-emerald-100 bg-white/95 p-10 shadow-2xl shadow-emerald-200/40 backdrop-blur transition-transform duration-300 ease-out focus-within:scale-[1.04] hover:scale-[1.02]"
          >
            <div className="absolute -top-12 right-6 hidden flex-col items-end rounded-2xl bg-white/90 px-4 py-3 text-right shadow-lg shadow-emerald-100/50 md:flex">
              <p className="text-xs uppercase tracking-[0.3em] text-emerald-500">Planner note</p>
              <p className="mt-1 text-sm text-emerald-800">
                Share your dream destination — we handle the rest.
              </p>
            </div>

            <div className="grid gap-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-emerald-900">
                    Traveling from
                  </label>
                  <input
                    type="text"
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                    placeholder="e.g. New York or JFK"
                    className="w-full rounded-xl border border-emerald-100 bg-white px-4 py-3 text-emerald-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                  <p className="mt-1 text-xs text-emerald-500">Leave blank if you’re already on location.</p>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-emerald-900">
                    Destination*
                  </label>
                  <input
                    type="text"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="e.g. Kyoto, Japan"
                    className="w-full rounded-xl border border-emerald-100 bg-white px-4 py-3 text-emerald-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-emerald-900">
                    Number of days
                  </label>
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="1"
                        max="30"
                        value={numDays}
                        onChange={(e) => setNumDays(Number(e.target.value))}
                        className="flex-1 accent-emerald-500"
                      />
                      <span className="w-12 text-center text-xl font-semibold text-emerald-900">
                        {numDays}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-emerald-600">Tip: 7-10 days unlock richer immersion.</p>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-emerald-900">
                    Budget (USD)
                  </label>
                  <input
                    type="number"
                    min="100"
                    step="100"
                    value={budget}
                    onChange={(e) => setBudget(Number(e.target.value))}
                    className="w-full rounded-xl border border-emerald-100 bg-white px-4 py-3 text-emerald-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                    required
                  />
                  <p className="mt-1 text-xs text-emerald-500">We’ll balance spend across every experience.</p>
                </div>
              </div>

              <div>
                <label className="mb-3 block text-sm font-semibold text-emerald-900">
                  Signature experiences (select all that resonate)
                </label>
                <div className="flex flex-wrap gap-2">
                  {preferenceOptions.map((pref) => (
                    <button
                      key={pref}
                      type="button"
                      onClick={() => togglePreference(pref)}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                        preferences.includes(pref)
                          ? "bg-gradient-to-r from-emerald-500 to-emerald-400 text-white shadow-lg shadow-emerald-200"
                          : "border border-emerald-100 bg-white text-emerald-700 hover:border-emerald-300 hover:text-emerald-900"
                      }`}
                    >
                      {pref.charAt(0).toUpperCase() + pref.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-3 block text-sm font-semibold text-emerald-900">
                  Optimisation focus
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 transition hover:border-emerald-300">
                    <input
                      type="radio"
                      name="mode"
                      value="price-optimal"
                      checked={mode === "price-optimal"}
                      onChange={() => setMode("price-optimal")}
                      className="h-4 w-4 text-emerald-500 focus:ring-0"
                    />
                    <div>
                      <p className="text-sm font-semibold text-emerald-900">Price-forward</p>
                      <p className="text-xs text-emerald-600">
                        Maximise value while preserving eco standards.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-white p-4 transition hover:border-emerald-300">
                    <input
                      type="radio"
                      name="mode"
                      value="balanced"
                      checked={mode === "balanced"}
                      onChange={() => setMode("balanced")}
                      className="h-4 w-4 text-emerald-500 focus:ring-0"
                    />
                    <div>
                      <p className="text-sm font-semibold text-emerald-900">Balanced</p>
                      <p className="text-xs text-emerald-600">
                        Harmonise indulgence, culture, and footprint.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !destination}
                className="group mt-2 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-amber-400 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-emerald-200 transition hover:shadow-xl hover:shadow-emerald-200/70 disabled:cursor-wait disabled:bg-gray-300 disabled:shadow-none"
              >
                {loading ? "Crafting your journey..." : "Design my eco-luxe itinerary"}
                <span className="ml-2 transition group-hover:translate-x-1">↗</span>
              </button>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 shadow-sm shadow-red-100/30">
                  {error}
                </div>
              )}

              <p className="text-xs text-emerald-500">
                By requesting an itinerary, you’ll receive a personalised plan with refundable options,
                sustainability scores, and local partners aligned to your tastes.
              </p>
            </div>
          </form>
        </section>

        <section className="mt-20 rounded-3xl border border-emerald-100/70 bg-white/90 p-10 shadow-2xl shadow-emerald-200/50">
          <div className="grid gap-8 lg:grid-cols-[1.2fr,0.8fr] lg:items-center">
            <div className="space-y-4">
              <h3 className="text-2xl font-semibold text-emerald-950">
                We obsess over every detail, so you can simply arrive.
              </h3>
              <p className="max-w-2xl text-emerald-700">
                From carbon tracking to curated gastronomy, our team keeps every detail intentional.
                Your itinerary pairs smart data with human taste to feel effortless, indulgent, and grounded.
              </p>
              <div className="flex flex-wrap gap-3 text-sm text-emerald-700">
                <span className="rounded-full border border-emerald-200 px-3 py-1">• Climate-ready pacing</span>
                <span className="rounded-full border border-emerald-200 px-3 py-1">• Refund windows managed</span>
                <span className="rounded-full border border-emerald-200 px-3 py-1">• Bespoke immersions</span>
              </div>
            </div>

            <div className="rounded-3xl border border-emerald-100 bg-emerald-50/80 p-6">
              <blockquote className="space-y-3 text-emerald-800">
                <p className="text-lg leading-relaxed">
                  “GreenTrip mapped out a Kyoto journey that felt effortlessly elegant.
                  Michelin-level vegan dining, private tea ceremony, boutique ryokan —
                  all within our footprint goals. Exceptional.”
                </p>
                <footer className="text-sm font-medium text-emerald-600">
                  — Bob Bob, founder • Princeton University
                </footer>
              </blockquote>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

