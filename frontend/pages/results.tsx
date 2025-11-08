import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/router";
import { Bar } from "react-chartjs-2";
import { supabase } from "../lib/supabase";
import ChatPlanner from "../components/ChatPlanner";
import ItineraryMap from "../components/ItineraryMap";
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

type SlotKey = "morning" | "afternoon" | "evening";

interface SlotShowcase {
  name: string;
  description: string;
  photos: string[];
  reviews: POIReview[];
  rating?: number;
  user_ratings_total?: number;
}

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

interface POIReview {
  author?: string;
  rating?: number;
  relative_time_description?: string;
  text?: string;
}

interface PointOfInterest {
  name: string;
  category: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  rating?: number;
  user_ratings_total?: number;
  photo_urls?: string[];
  reviews?: POIReview[];
}

interface DayAttractionBundle {
  day: number;
  morning?: PointOfInterest;
  afternoon?: PointOfInterest;
  evening?: PointOfInterest;
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
  attractions?: PointOfInterest[];
  day_attractions?: DayAttractionBundle[];
}

function PhotoCarousel({ photos, alt }: { photos: string[]; alt: string }) {
  const [index, setIndex] = useState(0);

  if (!photos || photos.length === 0) {
    return null;
  }

  const prev = () => setIndex((prevIndex) => (prevIndex - 1 + photos.length) % photos.length);
  const next = () => setIndex((prevIndex) => (prevIndex + 1) % photos.length);

  return (
    <div className="group relative mt-4 overflow-hidden rounded-2xl border border-emerald-100 bg-white/80 shadow-inner shadow-emerald-200/40">
      <img
        src={photos[index]}
        alt={alt}
        className="h-56 w-full object-cover transition duration-500 group-hover:scale-[1.02]"
        loading="lazy"
      />
      {photos.length > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/80 px-3 py-2 text-sm text-emerald-700 shadow-md transition hover:bg-white"
            aria-label="Previous photo"
          >
            ‹
          </button>
          <button
            onClick={next}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/80 px-3 py-2 text-sm text-emerald-700 shadow-md transition hover:bg-white"
            aria-label="Next photo"
          >
            ›
          </button>
        </>
      )}
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1">
        {photos.map((_, dotIndex) => (
          <span
            key={dotIndex}
            className={`h-2 w-2 rounded-full ${
              dotIndex === index ? "bg-emerald-500" : "bg-emerald-200"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function POIReviews({ poi }: { poi: PointOfInterest }) {
  if (!poi) return null;

  const { reviews, rating, user_ratings_total } = poi;

  if ((!reviews || reviews.length === 0) && !rating) {
    return null;
  }

  return (
    <div className="mt-4 space-y-3 rounded-2xl border border-emerald-100 bg-white/80 p-4 shadow-inner shadow-emerald-200/30">
      <div className="flex items-center justify-between text-xs text-emerald-700">
        <span className="font-semibold">
          {poi.name} {rating ? `• ${rating.toFixed(1)}★` : ""}
        </span>
        {user_ratings_total !== undefined && (
          <span>{user_ratings_total.toLocaleString()} reviews</span>
        )}
      </div>
      {reviews &&
        reviews.slice(0, 2).map((review, idx) => (
          <div key={idx} className="rounded-xl border border-emerald-50 bg-emerald-50/50 p-3 text-xs text-emerald-800">
            <div className="flex items-center justify-between font-semibold">
              <span>{review.author || "Traveler"}</span>
              {typeof review.rating === "number" && (
                <span className="text-emerald-600">{review.rating.toFixed(1)}★</span>
              )}
            </div>
            {review.text && <p className="mt-2 leading-relaxed">{review.text}</p>}
            {review.relative_time_description && (
              <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-emerald-500">
                {review.relative_time_description}
              </p>
            )}
          </div>
        ))}
    </div>
  );
}

// Extract place names from text descriptions
// MOVED: This function must be defined before the component to be used in useMemo
const extractPlaceNames = (text: string): string[] => {
  if (!text) return [];
  
  // Common patterns for place names in itinerary text:
  // - "Visit [Place Name]"
  // - "[Place Name] (optional description)"
  // - "[Place Name], [description]"
  // - Capitalized phrases that might be place names
  
  const placeNames: string[] = [];
  
  // Pattern 1: "Visit [Place]" or "Explore [Place]"
  const visitPattern = /(?:visit|explore|see|tour|experience|discover|check out|head to|go to|stop at)\s+([A-Z][A-Za-z\s&'-]+?)(?:\.|,|$|and|or|for|with|to|at)/gi;
  let match;
  while ((match = visitPattern.exec(text)) !== null) {
    const name = match[1].trim();
    if (name.length > 3 && name.length < 50) {
      placeNames.push(name);
    }
  }
  
  // Pattern 2: Standalone capitalized phrases (likely place names)
  const capitalizedPattern = /\b([A-Z][A-Za-z\s&'-]{2,30})\b/g;
  const seen = new Set(placeNames);
  while ((match = capitalizedPattern.exec(text)) !== null) {
    const name = match[1].trim();
    // Skip common words and short phrases
    if (
      name.length > 3 &&
      name.length < 50 &&
      !seen.has(name) &&
      !/^(The|A|An|And|Or|But|For|With|From|To|At|In|On|Of|By|This|That|These|Those|You|Your|We|Our|Their|His|Her|Its)$/i.test(name)
    ) {
      placeNames.push(name);
      seen.add(name);
    }
  }
  
  // Remove duplicates and return
  return Array.from(new Set(placeNames)).filter((n) => n.length > 3);
};

export default function Results() {
  const router = useRouter();
  const [itinerary, setItinerary] = useState<ItineraryResponse | null>(null);
  const [currentDayIndex, setCurrentDayIndex] = useState(0);
  const [user, setUser] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedTripId, setSavedTripId] = useState<string | null>(null);
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

  // Regeneration logic removed with mode buttons

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
      const { data, error } = await supabase
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
        })
        .select()
        .single();

      if (error) throw error;

      setSaved(true);
      setSavedTripId(data?.id || null);
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

  // Transform itinerary data into map-friendly format
  // MOVED: This hook must be called before any early returns
  // PRIORITY: Use structured day_attractions from backend if available, otherwise parse text
  const attractions = useMemo(() => {
    if (!itinerary?.days) return [];
    
    const out: { name: string; day: number; lat?: number; lng?: number; when?: string }[] = [];
    
    // FIRST: Try to use structured day_attractions from backend (has lat/lng)
    if (itinerary.day_attractions && itinerary.day_attractions.length > 0) {
      console.log("Using structured day_attractions from backend:", itinerary.day_attractions);
      for (const bundle of itinerary.day_attractions) {
        if (bundle.morning && bundle.morning.latitude && bundle.morning.longitude) {
          out.push({
            name: bundle.morning.name,
            day: bundle.day,
            lat: bundle.morning.latitude,
            lng: bundle.morning.longitude,
            when: "morning",
          });
        }
        if (bundle.afternoon && bundle.afternoon.latitude && bundle.afternoon.longitude) {
          out.push({
            name: bundle.afternoon.name,
            day: bundle.day,
            lat: bundle.afternoon.latitude,
            lng: bundle.afternoon.longitude,
            when: "afternoon",
          });
        }
        if (bundle.evening && bundle.evening.latitude && bundle.evening.longitude) {
          out.push({
            name: bundle.evening.name,
            day: bundle.day,
            lat: bundle.evening.latitude,
            lng: bundle.evening.longitude,
            when: "evening",
          });
        }
      }
      
      // If we got structured data, return it
      if (out.length > 0) {
        console.log(`Found ${out.length} attractions with coordinates from day_attractions`);
        return out;
      }
    } else {
      console.log("No day_attractions found, falling back to text parsing");
    }
    
    // FALLBACK: Parse text descriptions to extract place names
    for (const day of itinerary.days) {
      // Extract places from morning text
      const morningPlaces = extractPlaceNames(day.morning);
      morningPlaces.forEach((name) => {
        out.push({ name, day: day.day, when: "morning" });
      });
      
      // Extract places from afternoon text
      const afternoonPlaces = extractPlaceNames(day.afternoon);
      afternoonPlaces.forEach((name) => {
        out.push({ name, day: day.day, when: "afternoon" });
      });
      
      // Extract places from evening text
      const eveningPlaces = extractPlaceNames(day.evening);
      eveningPlaces.forEach((name) => {
        out.push({ name, day: day.day, when: "evening" });
      });
    }
    
    // Remove duplicates (same name on same day)
    const unique = new Map<string, typeof out[0]>();
    out.forEach((attraction) => {
      const key = `${attraction.name}-${attraction.day}`;
      if (!unique.has(key)) {
        unique.set(key, attraction);
      }
    });
    
    return Array.from(unique.values());
  }, [itinerary]);

const attractionSlots: Record<SlotKey, SlotShowcase> = useMemo(() => {
  const base: Record<SlotKey, SlotShowcase> = {
    morning: {
      name: "Morning highlight",
      description: "",
      photos: [],
      reviews: [],
    },
    afternoon: {
      name: "Afternoon highlight",
      description: "",
      photos: [],
      reviews: [],
    },
    evening: {
      name: "Evening highlight",
      description: "",
      photos: [],
      reviews: [],
    },
  };

  if (!itinerary || !itinerary.days || itinerary.days.length === 0) {
    return base;
  }

  const safeIndex = Math.min(currentDayIndex, itinerary.days.length - 1);
  const day = itinerary.days[safeIndex];
  const bundle = itinerary.day_attractions?.find((item) => item.day === day.day);

  base.morning.description = day.morning;
  base.afternoon.description = day.afternoon;
  base.evening.description = day.evening;

  const poiCandidates: PointOfInterest[] = [];
  if (bundle?.morning) poiCandidates.push(bundle.morning);
  if (bundle?.afternoon) poiCandidates.push(bundle.afternoon);
  if (bundle?.evening) poiCandidates.push(bundle.evening);
  if (itinerary.attractions) {
    poiCandidates.push(...itinerary.attractions);
  }

  (["morning", "afternoon", "evening"] as SlotKey[]).forEach((slot) => {
    const text = day[slot];
    const namesFromText = extractPlaceNames(text);

    let matched: PointOfInterest | undefined = bundle?.[slot] ?? undefined;

    if (!matched && namesFromText.length > 0) {
      const targetName = namesFromText[0].toLowerCase();
      matched = poiCandidates.find((poi) => poi.name?.toLowerCase().includes(targetName));
    }

    if (!matched) {
      matched = poiCandidates.find((poi) =>
        text.toLowerCase().includes((poi.name ?? "").toLowerCase())
      );
    }

    if (matched) {
      base[slot] = {
        name: matched.name || namesFromText[0] || `${slot} experience`,
        description: text,
        photos: matched.photo_urls ?? [],
        reviews: matched.reviews ?? [],
        rating: matched.rating ?? undefined,
        user_ratings_total: matched.user_ratings_total ?? undefined,
      };
    } else if (namesFromText.length > 0) {
      base[slot] = {
        name: namesFromText[0],
        description: text,
        photos: [],
        reviews: [],
      };
    } else {
      base[slot] = {
        name: `${slot} experience`,
        description: text,
        photos: [],
        reviews: [],
      };
    }
  });

  return base;
}, [currentDayIndex, itinerary]);

  // MOVED: Early return check moved to JSX render instead
  // All hooks must be called before any conditional returns
  if (!itinerary) {
    return <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-amber-100 text-emerald-900">Loading your journey...</div>;
  }

  const currentDay = itinerary.days[currentDayIndex];
  const currentWeather = itinerary.day_weather?.[currentDayIndex];
  const dayBundle = itinerary.day_attractions?.find((bundle) => bundle.day === currentDay.day);
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

  // MOVED: comparisonData computed after early return check (not a hook, so safe)
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

  // Build unique key for flight comparison (ignore server-generated id)
  const flightKey = (f: FlightOption) =>
    `${f.carrier}|${f.origin}|${f.destination}|${f.departure}|${f.arrival}|${Math.round((f.price || 0) * 100)}`;

  const getUniqueByKey = (flights: FlightOption[]) => {
    const seen = new Set<string>();
    const out: FlightOption[] = [];
    for (const f of flights) {
      const k = flightKey(f);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(f);
    }
    return out;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-amber-100 text-emerald-950">
      <header className="border-b border-emerald-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-4 md:flex-row md:items-center md:justify-between">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="group flex items-center gap-3 rounded-xl p-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            aria-label="Back to planner"
          >
            <div className="text-left">
              <span className="text-2xl font-bold text-[#3cb371] transition duration-300 group-hover:text-[#2ea55f]">
                GreenTrip
              </span>
              <p className="text-xs uppercase tracking-[0.3em] text-emerald-500 transition group-hover:text-emerald-600">
                TripSmith • Results
              </p>
              <h1 className="text-xl font-medium text-emerald-900 transition duration-300 group-hover:text-emerald-800 md:text-2xl">
                Journey Report
              </h1>
            </div>
          </button>
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
              onClick={() => router.push("/")}
              className="rounded-full border border-emerald-200 px-4 py-2 transition hover:border-emerald-300 hover:text-emerald-900"
            >
              Plan another trip ↗
            </button>
          </div>
        </div>
      </header>

      <main
        className={`mx-auto px-6 py-10 transition-all ${
          showChat ? "max-w-[calc(100%-24rem)] min-w-0" : "max-w-6xl"
        }`}
      >
        <section className="grid gap-10">
          <div className="space-y-6">
            <div className="rounded-[32px] border border-emerald-100 bg-white/95 p-8 shadow-xl shadow-emerald-200/50">
              <p className="text-xs uppercase tracking-[0.3em] text-emerald-500">Your itinerary</p>
              <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-3xl font-medium tracking-tight text-emerald-950">
                    {itinerary.destination}
                  </h2>
                  <p className="text-sm text-emerald-700">
                    {itinerary.num_days} days
                  </p>
                </div>
                <div className="rounded-full bg-emerald-50 px-4 py-2 text-xs font-medium text-emerald-700">
              Budget: {currency.format(itinerary.budget)}
                </div>
              </div>
            </div>

            {/* Optimized Flights Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">
                Eco-Friendly Flights (sorted by lowest CO₂)
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                {itinerary.flights && itinerary.flights.length > 0 ? (
                  getUniqueByKey(
                    [...itinerary.flights].sort(
                      (a, b) => (a.emissions_kg ?? Number.POSITIVE_INFINITY) - (b.emissions_kg ?? Number.POSITIVE_INFINITY)
                    )
                  ).map((flight, index) => (
                      <div
                        key={flight.id || `eco-${index}`}
                        className="relative rounded-2xl border border-emerald-100 bg-white/95 p-5 shadow-lg shadow-emerald-200/40"
                      >
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
                            CO₂: {flight.emissions_kg?.toFixed(1) ?? "N/A"} kg
                          </span>
                        </div>
                        <div className="mt-2 text-xs text-emerald-600">Eco score: {flight.eco_score ?? "N/A"}</div>
                      </div>
                    ))
                ) : (
                  <div className="rounded-2xl border border-emerald-100 bg-white/90 p-6 text-sm text-emerald-700">
                    Flight details will appear here once available.
                  </div>
                )}
              </div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600 mt-8">
                Price-Optimized Flights (sorted by lowest price)
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                {itinerary.flights && itinerary.flights.length > 0 ? (
                  getUniqueByKey(
                    [...itinerary.flights].sort(
                      (a, b) => (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY)
                    )
                  ).map((flight, index) => (
                      <div
                        key={flight.id || `price-${index}`}
                        className="relative rounded-2xl border border-emerald-100 bg-white/95 p-5 shadow-lg shadow-emerald-200/40"
                      >
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
                            Price: {formatPrice(flight.price, flight.currency)}
                          </span>
                        </div>
                        <div className="mt-2 text-xs text-emerald-600">CO₂: {flight.emissions_kg?.toFixed(1) ?? "N/A"} kg • Eco score: {flight.eco_score ?? "N/A"}</div>
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
              Interactive Map
            </h4>
            {attractions.length > 0 ? (
              <ItineraryMap destination={itinerary.destination} attractions={attractions} />
            ) : (
              <div className="flex h-[500px] w-full items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50/80 text-sm text-emerald-600">
                <div className="text-center">
                  <p className="font-medium text-emerald-700">No attractions found</p>
                  <p className="mt-2 text-xs text-emerald-500">
                    The itinerary will be displayed on the map once place names are detected.
                  </p>
                </div>
              </div>
            )}
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
                    <div className="group relative mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-white/80 px-3 py-1.5 text-xs text-emerald-700">
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
                    <div className="group relative mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-white/80 px-3 py-1.5 text-xs text-emerald-700">
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
                    <div className="group relative mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-white/80 px-3 py-1.5 text-xs text-emerald-700">
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

        <section className="mt-12 space-y-6">
          <div className="rounded-[32px] border border-emerald-100 bg-white/95 p-8 shadow-2xl shadow-emerald-200/50">
            <h3 className="mb-6 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">
              Explore more options
            </h3>
            <div className="grid gap-6 md:grid-cols-3">
              {(["morning", "afternoon", "evening"] as SlotKey[]).map((slot) => {
                const showcase = attractionSlots[slot];
                const reviewCount = showcase.reviews.length;
                const averageRating =
                  showcase.rating ??
                  (reviewCount
                    ? showcase.reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviewCount
                    : undefined);

                return (
                  <div
                    key={slot}
                    className="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-6"
                  >
                    <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-emerald-500">
                      <span>{showcase.name}</span>
                    </div>
                    {showcase.photos.length > 0 ? (
                      <PhotoCarousel photos={showcase.photos} alt={showcase.name} />
                    ) : (
                      <div className="rounded-xl border border-dashed border-emerald-200 bg-white/70 p-4 text-xs text-emerald-600">
                        Add this location to your shortlist to unlock photo previews.
                      </div>
                    )}
                    <POIReviews
                      poi={{
                        name: showcase.name,
                        category: "attraction",
                        description: showcase.description,
                        reviews: showcase.reviews,
                        rating: averageRating,
                        user_ratings_total:
                          showcase.user_ratings_total ?? (reviewCount > 0 ? reviewCount : undefined),
                      }}
                    />
                  </div>
                );
              })}
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
              tripId={saved ? savedTripId : undefined}
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

