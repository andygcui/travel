"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/router";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { supabase } from "../lib/supabase";
import ChatPlanner from "../components/ChatPlanner";
import ItineraryMap from "../components/ItineraryMap";

// Register GSAP plugin
if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

// Types
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
  preferences?: string[]; // User's selected preferences
}

// Helper: Extract place names from text
const extractPlaceNames = (text: string): string[] => {
  if (!text) return [];
  const placeNames: string[] = [];
  const visitPattern = /(?:visit|explore|see|tour|experience|discover|check out|head to|go to|stop at)\s+([A-Z][A-Za-z\s&'-]+?)(?:\.|,|$|and|or|for|with|to|at)/gi;
  let match;
  while ((match = visitPattern.exec(text)) !== null) {
    const name = match[1].trim();
    if (name.length > 3 && name.length < 50) {
      placeNames.push(name);
    }
  }
  return Array.from(new Set(placeNames)).filter((n) => n.length > 3);
};

// Helper: Generate outfit suggestions
const generateOutfitSuggestions = (day: ItineraryDay, weather?: DayWeather): string => {
  const activities = `${day.morning} ${day.afternoon} ${day.evening}`.toLowerCase();
  const avgTemp = weather
    ? (weather.morning.temperature_c + weather.afternoon.temperature_c + weather.evening.temperature_c) / 3
    : 20;

  if (activities.includes("beach") || activities.includes("swim")) {
    return "Swimsuit, cover-up, sandals, and sun hat";
  }
  if (activities.includes("hiking") || activities.includes("outdoor") || activities.includes("walk")) {
    return avgTemp > 15 ? "Light layers, comfortable walking shoes, and a hat" : "Warm layers, hiking boots, and a jacket";
  }
  if (activities.includes("museum") || activities.includes("gallery") || activities.includes("indoor")) {
    return "Smart casual attire - comfortable shoes for walking";
  }
  if (activities.includes("restaurant") || activities.includes("dining") || activities.includes("dinner")) {
    return "Smart casual to semi-formal depending on venue";
  }
  if (avgTemp > 25) {
    return "Light, breathable clothing, sun protection, and comfortable shoes";
  }
  if (avgTemp < 10) {
    return "Warm layers, jacket, and closed-toe shoes";
  }
  return "Comfortable layers and walking shoes";
};

// Helper: Generate packing suggestions
const generatePackingSuggestions = (day: ItineraryDay): string[] => {
  const activities = `${day.morning} ${day.afternoon} ${day.evening}`.toLowerCase();
  const items: string[] = [];

  if (activities.includes("outdoor") || activities.includes("hiking") || activities.includes("walk")) {
    items.push("Sunscreen", "Hat", "Walking shoes", "Water bottle");
  }
  if (activities.includes("beach") || activities.includes("swim")) {
    items.push("Swimsuit", "Towel", "Sunglasses", "Beach bag");
  }
  if (activities.includes("museum") || activities.includes("gallery")) {
    items.push("Notebook", "Camera", "Comfortable shoes");
  }
  if (activities.includes("restaurant") || activities.includes("dining")) {
    items.push("Smart casual attire");
  }
  if (activities.includes("nightlife") || activities.includes("bar")) {
    items.push("Evening wear", "ID");
  }

  return items.length > 0 ? items : ["Comfortable clothing", "Walking shoes", "Water bottle"];
};

// Helper: Weather glyph
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

// Helper: Format date
const formatDate = (dateStr?: string) => {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

// Helper: Get average temperature for day
const getDayTemperature = (weather?: DayWeather): number => {
  if (!weather) return 20;
  return Math.round((weather.morning.temperature_c + weather.afternoon.temperature_c + weather.evening.temperature_c) / 3);
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
    const storedRequest = sessionStorage.getItem("tripRequest"); // Get preferences from request
    if (stored) {
      const parsed: ItineraryResponse = JSON.parse(stored);
      
      // If preferences aren't in itinerary, try to get them from stored request
      if (!parsed.preferences && storedRequest) {
        try {
          const requestData = JSON.parse(storedRequest);
          parsed.preferences = requestData.preferences || [];
        } catch (e) {
          // Ignore parse errors
        }
      }
      
      setItinerary(parsed);
      setCurrentDayIndex(0);
      setTripName(`${parsed.destination} - ${parsed.start_date || new Date().toLocaleDateString()}`);
    } else {
      router.push("/");
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
  }, [router]);

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

  // Map preference names to category keywords for filtering (moved outside to avoid hook order issues)
  const preferenceToCategoryMap: Record<string, string[]> = {
    food: ["restaurant", "cafe", "food", "dining", "bakery", "bar"],
    art: ["art", "gallery", "museum", "exhibition", "cultural"],
    outdoors: ["park", "hiking", "outdoor", "nature", "trail", "beach"],
    history: ["museum", "historic", "monument", "heritage", "landmark"],
    nightlife: ["bar", "club", "nightlife", "entertainment"],
    wellness: ["spa", "wellness", "yoga", "fitness", "health"],
    shopping: ["shopping", "market", "mall", "boutique", "store"],
    adventure: ["adventure", "sports", "activity", "outdoor"],
  };

  // Get attractions for current day only (max 3)
  const currentDayAttractions = useMemo(() => {
    if (!itinerary?.day_attractions) return [];
    const bundle = itinerary.day_attractions.find((b) => b.day === itinerary.days[currentDayIndex]?.day);
    if (!bundle) return [];

    const attractions: { name: string; day: number; lat?: number; lng?: number; when?: string }[] = [];
    if (bundle.morning && bundle.morning.latitude && bundle.morning.longitude) {
      attractions.push({
        name: bundle.morning.name,
        day: bundle.day,
        lat: bundle.morning.latitude,
        lng: bundle.morning.longitude,
        when: "morning",
      });
    }
    if (bundle.afternoon && bundle.afternoon.latitude && bundle.afternoon.longitude) {
      attractions.push({
        name: bundle.afternoon.name,
        day: bundle.day,
        lat: bundle.afternoon.latitude,
        lng: bundle.afternoon.longitude,
        when: "afternoon",
      });
    }
    if (bundle.evening && bundle.evening.latitude && bundle.evening.longitude) {
      attractions.push({
        name: bundle.evening.name,
        day: bundle.day,
        lat: bundle.evening.latitude,
        lng: bundle.evening.longitude,
        when: "evening",
      });
    }
    return attractions.slice(0, 3); // Max 3 markers
  }, [itinerary, currentDayIndex]);

  // Get non-selected preference categories for "Explore More Options"
  const exploreMoreOptions = useMemo(() => {
    if (!itinerary || !itinerary.attractions || itinerary.attractions.length === 0) return [];
    
    const selectedPrefs = (itinerary.preferences || []).map((p) => p.toLowerCase());
    const allPrefs = Object.keys(preferenceToCategoryMap);
    const nonSelectedPrefs = allPrefs.filter((p) => !selectedPrefs.includes(p.toLowerCase()));

    // Helper to normalize name for comparison (remove extra spaces, lowercase, trim)
    const normalizeName = (name: string): string => {
      return (name || "").toLowerCase().trim().replace(/\s+/g, " ");
    };

    // STEP 1: Collect ALL place names already in the day-to-day itinerary
    const placesInItinerary = new Set<string>();
    
    // From day_attractions (structured POI data)
    if (itinerary.day_attractions) {
      itinerary.day_attractions.forEach((bundle) => {
        if (bundle.morning?.name) placesInItinerary.add(normalizeName(bundle.morning.name));
        if (bundle.afternoon?.name) placesInItinerary.add(normalizeName(bundle.afternoon.name));
        if (bundle.evening?.name) placesInItinerary.add(normalizeName(bundle.evening.name));
      });
    }
    
    // From days text (extract place names from morning/afternoon/evening text)
    if (itinerary.days) {
      itinerary.days.forEach((day) => {
        if (day.morning) {
          const names = extractPlaceNames(day.morning);
          names.forEach((name) => placesInItinerary.add(normalizeName(name)));
        }
        if (day.afternoon) {
          const names = extractPlaceNames(day.afternoon);
          names.forEach((name) => placesInItinerary.add(normalizeName(name)));
        }
        if (day.evening) {
          const names = extractPlaceNames(day.evening);
          names.forEach((name) => placesInItinerary.add(normalizeName(name)));
        }
      });
    }

    // STEP 2: Get all attractions and filter out:
    // - Attractions that match selected preferences
    // - Attractions already in the day-to-day itinerary
    const allAttractions = itinerary.attractions || [];
    
    const filteredAttractions = allAttractions.filter((attraction) => {
      const normalizedAttName = normalizeName(attraction.name);
      
      // Exclude if already in itinerary
      if (placesInItinerary.has(normalizedAttName)) {
        return false;
      }
      
      // Exclude if matches selected preferences
      const category = (attraction.category || "").toLowerCase();
      const name = (attraction.name || "").toLowerCase();
      const description = (attraction.description || "").toLowerCase();
      const searchText = `${category} ${name} ${description}`;

      const matchesSelected = selectedPrefs.some((pref) => {
        const keywords = preferenceToCategoryMap[pref] || [];
        return keywords.some((keyword) => searchText.includes(keyword));
      });

      return !matchesSelected;
    });

    // STEP 3: STRICT deduplication
    const uniqueAttractions = new Map<string, PointOfInterest>();
    const seenNames = new Set<string>();
    
    filteredAttractions.forEach((att) => {
      const normalizedName = normalizeName(att.name);
      // Double-check: not in itinerary and not already seen
      if (!placesInItinerary.has(normalizedName) && !seenNames.has(normalizedName)) {
        seenNames.add(normalizedName);
        uniqueAttractions.set(normalizedName, att);
      }
    });

    let result = Array.from(uniqueAttractions.values());

    // STEP 4: If we don't have enough, try to get from non-selected preference categories
    if (result.length < 6 && nonSelectedPrefs.length > 0) {
      const nonSelectedAttractions = allAttractions.filter((attraction) => {
        const normalizedAttName = normalizeName(attraction.name);
        
        // Exclude if already in itinerary or already seen
        if (placesInItinerary.has(normalizedAttName) || seenNames.has(normalizedAttName)) {
          return false;
        }
        
        const category = (attraction.category || "").toLowerCase();
        const name = (attraction.name || "").toLowerCase();
        const description = (attraction.description || "").toLowerCase();
        const searchText = `${category} ${name} ${description}`;

        const matchesNonSelected = nonSelectedPrefs.some((pref) => {
          const keywords = preferenceToCategoryMap[pref] || [];
          return keywords.some((keyword) => searchText.includes(keyword));
        });

        return matchesNonSelected;
      });

      // Add non-selected attractions, STRICTLY avoiding duplicates and itinerary places
      nonSelectedAttractions.forEach((att) => {
        const normalizedName = normalizeName(att.name);
        if (!placesInItinerary.has(normalizedName) && !seenNames.has(normalizedName)) {
          seenNames.add(normalizedName);
          uniqueAttractions.set(normalizedName, att);
        }
      });

      result = Array.from(uniqueAttractions.values());
    }

    // STEP 5: Ensure variety: try to get attractions from different categories
    const categorized: Record<string, PointOfInterest[]> = {};
    result.forEach((att) => {
      const category = (att.category || "other").toLowerCase();
      if (!categorized[category]) {
        categorized[category] = [];
      }
      categorized[category].push(att);
    });

    // STEP 6: Prioritize variety: take max 2 from each category
    const varied: PointOfInterest[] = [];
    const seenInVaried = new Set<string>();
    const categoryKeys = Object.keys(categorized);
    let categoryIndex = 0;
    
    while (varied.length < 6 && categoryKeys.length > 0) {
      const category = categoryKeys[categoryIndex % categoryKeys.length];
      if (categorized[category] && categorized[category].length > 0) {
        const taken = varied.filter((a) => (a.category || "").toLowerCase() === category).length;
        if (taken < 2) {
          const nextAtt = categorized[category].shift()!;
          const normalizedName = normalizeName(nextAtt.name);
          // Triple-check: not in itinerary, not already in varied
          if (!placesInItinerary.has(normalizedName) && !seenInVaried.has(normalizedName)) {
            seenInVaried.add(normalizedName);
            varied.push(nextAtt);
          }
        } else {
          delete categorized[category];
          categoryKeys.splice(categoryKeys.indexOf(category), 1);
          if (categoryKeys.length === 0) break;
        }
      }
      categoryIndex++;
      if (categoryIndex > 100) break; // Safety break
    }

    // STEP 7: Fill remaining slots if needed - STRICTLY check for duplicates and itinerary places
    if (varied.length < 6) {
      const remaining = result.filter((att) => {
        const normalizedName = normalizeName(att.name);
        return !placesInItinerary.has(normalizedName) && !seenInVaried.has(normalizedName);
      });
      remaining.slice(0, 6 - varied.length).forEach((att) => {
        const normalizedName = normalizeName(att.name);
        if (!placesInItinerary.has(normalizedName) && !seenInVaried.has(normalizedName)) {
          seenInVaried.add(normalizedName);
          varied.push(att);
        }
      });
    }

    // STEP 8: FALLBACK - If we still don't have enough (at least 3), be less strict
    // Allow selected preferences, but still exclude itinerary places and duplicates
    if (varied.length < 3) {
      const fallbackAttractions = allAttractions.filter((attraction) => {
        const normalizedAttName = normalizeName(attraction.name);
        // Only exclude if in itinerary or already seen
        return !placesInItinerary.has(normalizedAttName) && !seenInVaried.has(normalizedAttName);
      });

      // Deduplicate fallback
      const fallbackUnique = new Map<string, PointOfInterest>();
      fallbackAttractions.forEach((att) => {
        const normalizedName = normalizeName(att.name);
        if (!fallbackUnique.has(normalizedName)) {
          fallbackUnique.set(normalizedName, att);
        }
      });

      const fallbackList = Array.from(fallbackUnique.values());
      
      // Add up to 6 total (fill remaining slots)
      fallbackList.slice(0, 6 - varied.length).forEach((att) => {
        const normalizedName = normalizeName(att.name);
        if (!placesInItinerary.has(normalizedName) && !seenInVaried.has(normalizedName)) {
          seenInVaried.add(normalizedName);
          varied.push(att);
        }
      });
    }

    // STEP 9: Final fallback - if still less than 3, just get any unique attractions not in itinerary
    if (varied.length < 3) {
      const finalFallback = allAttractions.filter((attraction) => {
        const normalizedAttName = normalizeName(attraction.name);
        return !placesInItinerary.has(normalizedAttName);
      });

      const finalUnique = new Map<string, PointOfInterest>();
      finalFallback.forEach((att) => {
        const normalizedName = normalizeName(att.name);
        if (!finalUnique.has(normalizedName) && !seenInVaried.has(normalizedName)) {
          finalUnique.set(normalizedName, att);
        }
      });

      const finalList = Array.from(finalUnique.values());
      finalList.slice(0, Math.max(3, 6 - varied.length)).forEach((att) => {
        const normalizedName = normalizeName(att.name);
        if (!seenInVaried.has(normalizedName)) {
          seenInVaried.add(normalizedName);
          varied.push(att);
        }
      });
    }

    // Ensure we return at least what we have (up to 6), but try to get at least 3
    // If we have less than 3, return what we have (could be 0-2)
    // If we have 3 or more, return up to 6
    if (varied.length === 0 && allAttractions.length > 0) {
      // Last resort: return first 3-6 unique attractions (excluding itinerary only)
      const lastResort = allAttractions
        .filter((att) => !placesInItinerary.has(normalizeName(att.name)))
        .slice(0, 6);
      const lastResortUnique = new Map<string, PointOfInterest>();
      lastResort.forEach((att) => {
        const normalizedName = normalizeName(att.name);
        if (!lastResortUnique.has(normalizedName)) {
          lastResortUnique.set(normalizedName, att);
        }
      });
      return Array.from(lastResortUnique.values()).slice(0, 6);
    }
    
    return varied.slice(0, Math.min(6, varied.length));
  }, [itinerary]);

  // GSAP Animations
  useEffect(() => {
    if (typeof window === "undefined" || !itinerary) return;

    const fadeUp = (target: string, delay = 0, y = 60) => {
      gsap.from(target, {
        opacity: 0,
        y,
        duration: 1,
        delay,
        ease: "power2.out",
        scrollTrigger: {
          trigger: target,
          start: "top 80%",
          end: "bottom 60%",
          toggleActions: "play none none reverse",
        },
      });
    };

    fadeUp(".summary-card", 0.1);
    fadeUp(".flight-section", 0.2);
    fadeUp(".accommodation-section", 0.3);
    fadeUp(".map-section", 0.4, 40);
    fadeUp(".day-itinerary", 0.4, 40); // Same delay as map-section
    fadeUp(".outfit-section", 0.6, 40);

    gsap.utils.toArray(".scroll-fade").forEach((el: any, i: number) => {
      gsap.from(el, {
        opacity: 0,
        y: 40,
        duration: 1.2,
        delay: i * 0.1,
        scrollTrigger: {
          trigger: el,
          start: "top 90%",
          toggleActions: "play none none reverse",
        },
      });
    });

    // Horizontal scroll fade for flight cards
    gsap.utils.toArray(".flight-card").forEach((el: any, i: number) => {
      gsap.from(el, {
        opacity: 0,
        x: 80,
        duration: 1,
        delay: i * 0.1,
        scrollTrigger: {
          trigger: el,
          start: "top 85%",
          toggleActions: "play none none reverse",
        },
      });
    });

    // Staggered accommodation cards
    gsap.utils.toArray(".accommodation-card").forEach((el: any, i: number) => {
      gsap.from(el, {
        opacity: 0,
        y: 60,
        duration: 1.2,
        delay: i * 0.15,
        scrollTrigger: {
          trigger: el,
          start: "top 85%",
          toggleActions: "play none none reverse",
        },
      });
    });

    return () => {
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    };
  }, [itinerary]);

  if (!itinerary) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-emerald-50 via-white to-emerald-50 text-emerald-900">
        Loading your journey...
      </div>
    );
  }

  const currentDay = itinerary.days[currentDayIndex];
  const currentWeather = itinerary.day_weather?.[currentDayIndex];
  const dayTemperature = getDayTemperature(currentWeather);
  const dayWeatherGlyph = currentWeather ? weatherGlyph(currentWeather.afternoon.summary) : "☀️";

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

  // Get unique flights
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

  const ecoFlights = itinerary.flights
    ? getUniqueByKey([...itinerary.flights].sort((a, b) => (a.emissions_kg ?? Infinity) - (b.emissions_kg ?? Infinity)))
    : [];

  const priceFlights = itinerary.flights
    ? getUniqueByKey([...itinerary.flights].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity)))
    : [];

  const goPrevDay = () => setCurrentDayIndex((prev) => Math.max(0, prev - 1));
  const goNextDay = () => setCurrentDayIndex((prev) => Math.min(itinerary.days.length - 1, prev + 1));

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-emerald-50">
      {/* Header */}
      <header className="border-b border-emerald-100/50 bg-white/60 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-6 py-4 md:px-12">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.push("/")}
              className="text-2xl font-bold text-[#0b3d2e] transition hover:text-[#2d6a4f]"
            >
              GreenTrip
            </button>
            <div className="flex items-center gap-3">
              {user && (
                <button
                  onClick={handleSaveTrip}
                  disabled={saving || saved}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    saved
                      ? "bg-emerald-500 text-white"
                      : "border border-emerald-200 bg-white/60 text-emerald-700 hover:border-emerald-300"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {saved ? "✓ Saved!" : saving ? "Saving..." : "💾 Save"}
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-12 md:px-12">
        {/* Page Header */}
        <section className="mb-16 text-center">
          <p className="text-sm uppercase tracking-[0.3em] text-emerald-600/70">Your Trip To</p>
          <h1 className="mt-2 text-5xl font-bold uppercase tracking-tight text-[#0b3d2e] md:text-6xl">
            {itinerary.destination.toUpperCase()}
          </h1>
        </section>

        {/* Summary Row */}
        <section className="mb-20 grid gap-6 md:grid-cols-3">
          <div className="summary-card bg-white/60 backdrop-blur-xl rounded-2xl p-6 shadow-sm text-center border border-white/10">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-600/70 mb-2">Total Spend</p>
            <p className="text-4xl font-bold text-[#0b3d2e]">{currency.format(itinerary.totals.cost)}</p>
            <p className="mt-2 text-sm text-emerald-600/80">Budget: {currency.format(itinerary.budget)}</p>
          </div>
          <div className="summary-card bg-white/60 backdrop-blur-xl rounded-2xl p-6 shadow-sm text-center border border-white/10">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-600/70 mb-2">Estimated CO₂</p>
            <p className="text-4xl font-bold text-[#0b3d2e]">{itinerary.totals.emissions_kg.toFixed(1)} kg</p>
            <p className="mt-2 text-sm text-emerald-600/80">+ eco points</p>
          </div>
          <div className="summary-card bg-white/60 backdrop-blur-xl rounded-2xl p-6 shadow-sm text-center border border-white/10">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-600/70 mb-2">Duration</p>
            <p className="text-4xl font-bold text-[#0b3d2e]">{itinerary.num_days} days</p>
            <p className="mt-2 text-sm text-emerald-600/80">
              {itinerary.start_date && itinerary.end_date
                ? `${formatDate(itinerary.start_date)} – ${formatDate(itinerary.end_date)}`
                : "Dates TBD"}
            </p>
          </div>
        </section>

        {/* Flight Options */}
        <section className="flight-section mb-20">
          <h2 className="mb-6 text-2xl font-bold text-[#0b3d2e]">Flight Options</h2>
          
          {/* Eco-Optimized */}
          <div className="mb-8">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">Eco-Optimized</h3>
            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
              {ecoFlights.length > 0 ? (
                ecoFlights.map((flight, idx) => (
                  <div
                    key={flight.id || `eco-${idx}`}
                    className="flight-card flex-shrink-0 w-80 bg-white/60 backdrop-blur-xl rounded-2xl p-6 border border-white/10 shadow-sm hover:shadow-lg hover:scale-[1.02] transition-all"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-[#0b3d2e]">
                        {flight.origin} → {flight.destination}
                      </span>
                      <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-700">
                        Eco
                      </span>
                    </div>
                    <p className="text-xs text-emerald-600/80 mb-3">{formatDateTime(flight.departure)}</p>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-emerald-700">{flight.carrier}</span>
                      <span className="font-bold text-[#0b3d2e]">{formatPrice(flight.price, flight.currency)}</span>
                    </div>
                    <p className="mt-2 text-xs text-emerald-600/80">
                      CO₂: {flight.emissions_kg?.toFixed(1) ?? "N/A"} kg
                    </p>
                  </div>
                ))
              ) : (
                <div className="w-80 flex-shrink-0 bg-white/60 backdrop-blur-xl rounded-2xl p-6 border border-white/10 text-sm text-emerald-600/80">
                  Flight details coming soon
                </div>
              )}
            </div>
          </div>

          {/* Price-Optimized */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">Price-Optimized</h3>
            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
              {priceFlights.length > 0 ? (
                priceFlights.map((flight, idx) => (
                  <div
                    key={flight.id || `price-${idx}`}
                    className="flight-card flex-shrink-0 w-80 bg-white/60 backdrop-blur-xl rounded-2xl p-6 border border-white/10 shadow-sm hover:shadow-lg hover:scale-[1.02] transition-all"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-[#0b3d2e]">
                        {flight.origin} → {flight.destination}
                      </span>
                      <span className="rounded-full bg-gray-200/50 px-3 py-1 text-xs font-medium text-gray-700">
                        Price
                      </span>
                    </div>
                    <p className="text-xs text-emerald-600/80 mb-3">{formatDateTime(flight.departure)}</p>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-emerald-700">{flight.carrier}</span>
                      <span className="font-bold text-[#0b3d2e]">{formatPrice(flight.price, flight.currency)}</span>
                    </div>
                    <p className="mt-2 text-xs text-emerald-600/80">
                      CO₂: {flight.emissions_kg?.toFixed(1) ?? "N/A"} kg
                    </p>
                  </div>
                ))
              ) : (
                <div className="w-80 flex-shrink-0 bg-white/60 backdrop-blur-xl rounded-2xl p-6 border border-white/10 text-sm text-emerald-600/80">
                  Flight details coming soon
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Accommodations */}
        <section className="accommodation-section mb-20">
          <h2 className="mb-6 text-2xl font-bold text-[#0b3d2e]">Where You'll Stay</h2>
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
            {itinerary.attractions && itinerary.attractions.length > 0 ? (
              itinerary.attractions
                .filter((a) => a.category?.toLowerCase().includes("lodging") || a.category?.toLowerCase().includes("hotel"))
                .slice(0, 5)
                .map((attraction, idx) => (
                  <div
                    key={idx}
                    className="accommodation-card flex-shrink-0 w-72 bg-white/60 backdrop-blur-xl rounded-2xl overflow-hidden border border-white/10 shadow-sm hover:shadow-xl hover:scale-[1.03] transition-all"
                  >
                    {attraction.photo_urls && attraction.photo_urls[0] && (
                      <img
                        src={attraction.photo_urls[0]}
                        alt={attraction.name}
                        className="w-full h-40 object-cover"
                      />
                    )}
                    <div className="p-4">
                      <h3 className="font-semibold text-[#0b3d2e] mb-1">{attraction.name}</h3>
                      {attraction.rating && (
                        <p className="text-sm text-emerald-600/80 mb-2">⭐ {attraction.rating.toFixed(1)}</p>
                      )}
                      <p className="text-xs text-emerald-600/70">{attraction.description || "Accommodation details"}</p>
                    </div>
                  </div>
                ))
            ) : (
              <div className="w-72 flex-shrink-0 bg-white/60 backdrop-blur-xl rounded-2xl p-6 border border-white/10 text-sm text-emerald-600/80">
                Accommodation details coming soon
              </div>
            )}
          </div>
        </section>

        {/* Interactive Map */}
        <section className="map-section mb-20">
          <div className="bg-white/60 backdrop-blur-xl rounded-2xl p-6 border border-white/10 shadow-sm">
            {currentDayAttractions.length > 0 ? (
              <ItineraryMap destination={itinerary.destination} attractions={currentDayAttractions} />
            ) : (
              <div className="flex h-[500px] items-center justify-center rounded-xl bg-emerald-50/50 text-emerald-600/80">
                <p>Map will display when attractions are available</p>
              </div>
            )}
          </div>
        </section>

        {/* Day-by-Day Itinerary */}
        <section className="mb-20">
          <h2 className="mb-8 text-2xl font-bold text-[#0b3d2e]">Day-by-Day Plans</h2>

          {/* Day Selector */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-[#0b3d2e]">
                Day {currentDay.day} · {itinerary.start_date ? formatDate(itinerary.start_date) : `Day ${currentDay.day}`}
              </h3>
            </div>
            {currentWeather && (
              <div className="flex items-center gap-2 rounded-full bg-white/60 backdrop-blur-xl px-4 py-2 border border-white/10">
                <span className="text-xl">{dayWeatherGlyph}</span>
                <span className="text-sm font-medium text-[#0b3d2e]">{dayTemperature}°C</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={goPrevDay}
                disabled={currentDayIndex === 0}
                className="rounded-full border border-emerald-200 bg-white/60 px-4 py-2 text-emerald-700 transition hover:border-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ‹
              </button>
              <span className="text-sm text-emerald-600/80">
                {currentDayIndex + 1} / {itinerary.days.length}
              </span>
              <button
                onClick={goNextDay}
                disabled={currentDayIndex === itinerary.days.length - 1}
                className="rounded-full border border-emerald-200 bg-white/60 px-4 py-2 text-emerald-700 transition hover:border-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ›
              </button>
            </div>
          </div>

          {/* Day Activities - Horizontal Layout */}
          <div className="day-itinerary grid gap-6 md:grid-cols-3">
            {(["morning", "afternoon", "evening"] as const).map((slot) => {
              const bundle = itinerary.day_attractions?.find((b) => b.day === currentDay.day);
              const poi = bundle?.[slot];
              const text = currentDay[slot];

              return (
                <div
                  key={slot}
                  className="scroll-fade bg-white/60 backdrop-blur-xl rounded-2xl p-6 border border-white/10 shadow-sm"
                >
                  <div className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
                    {slot}
                  </div>
                  <h4 className="mb-2 text-lg font-semibold text-[#0b3d2e]">{poi?.name || extractPlaceNames(text)[0] || `${slot} Activity`}</h4>
                  <p className="mb-4 text-sm text-emerald-800/80 leading-relaxed">{text}</p>
                  {poi?.photo_urls && poi.photo_urls[0] && (
                    <img
                      src={poi.photo_urls[0]}
                      alt={poi.name}
                      className="mb-4 h-48 w-full rounded-xl object-cover"
                    />
                  )}
                  {poi?.rating && (
                    <p className="text-sm text-emerald-600/80">⭐ {poi.rating.toFixed(1)} / 5.0</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* What to Bring + Outfit Suggestions */}
          <div className="outfit-section mt-8 grid gap-6 md:grid-cols-2">
            <div className="bg-white/60 backdrop-blur-xl rounded-2xl p-6 border border-white/10 shadow-sm">
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">What to Bring</h4>
              <ul className="space-y-2">
                {generatePackingSuggestions(currentDay).map((item, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-sm text-emerald-800/80">
                    <span>✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white/60 backdrop-blur-xl rounded-2xl p-6 border border-white/10 shadow-sm">
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">Suggested Outfit</h4>
              <p className="text-sm text-emerald-800/80 leading-relaxed">
                {generateOutfitSuggestions(currentDay, currentWeather)}
              </p>
            </div>
          </div>
        </section>

        {/* Explore More Options */}
        <section className="mb-20">
          <h2 className="mb-8 text-2xl font-bold text-[#0b3d2e]">Explore More Options</h2>
          <div className="relative">
            {/* Scroll Buttons */}
            <button
              onClick={(e) => {
                const container = e.currentTarget.parentElement?.querySelector('.scroll-container');
                if (container) {
                  container.scrollBy({ left: -320, behavior: 'smooth' });
                }
              }}
              className="absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/80 backdrop-blur-sm p-3 shadow-lg transition hover:bg-white hover:shadow-xl"
              aria-label="Scroll left"
            >
              ‹
            </button>
            <button
              onClick={(e) => {
                const container = e.currentTarget.parentElement?.querySelector('.scroll-container');
                if (container) {
                  container.scrollBy({ left: 320, behavior: 'smooth' });
                }
              }}
              className="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/80 backdrop-blur-sm p-3 shadow-lg transition hover:bg-white hover:shadow-xl"
              aria-label="Scroll right"
            >
              ›
            </button>
            
            <div className="scroll-container flex gap-6 overflow-x-auto pb-4 scrollbar-hide scroll-smooth px-12">
              {exploreMoreOptions && exploreMoreOptions.length > 0 ? (
                exploreMoreOptions.map((attraction, idx) => {
                  const reviewCount = attraction.reviews?.length || 0;
                  const averageRating =
                    attraction.rating ??
                    (reviewCount
                      ? (attraction.reviews || []).reduce((sum, r) => sum + (r.rating || 0), 0) / reviewCount
                      : undefined);

                  return (
                    <div
                      key={idx}
                      className="scroll-fade flex-shrink-0 w-80 bg-white/60 backdrop-blur-xl rounded-2xl p-6 border border-white/10 shadow-sm"
                    >
                      <div className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
                        {attraction.name}
                      </div>
                      {attraction.photo_urls && attraction.photo_urls[0] ? (
                        <img
                          src={attraction.photo_urls[0]}
                          alt={attraction.name}
                          className="mb-4 h-48 w-full rounded-xl object-cover"
                        />
                      ) : (
                        <div className="mb-4 flex h-48 w-full items-center justify-center rounded-xl border border-dashed border-emerald-200 bg-emerald-50/50 text-xs text-emerald-600/80">
                          Photo preview available
                        </div>
                      )}
                      {averageRating && (
                        <div className="mb-3 flex items-center justify-between text-sm">
                          <span className="font-medium text-emerald-700">
                            {attraction.name} {averageRating ? `• ${averageRating.toFixed(1)}★` : ""}
                          </span>
                          {attraction.user_ratings_total !== undefined && (
                            <span className="text-xs text-emerald-600/80">
                              {attraction.user_ratings_total.toLocaleString()} reviews
                            </span>
                          )}
                        </div>
                      )}
                      {attraction.description && (
                        <p className="mb-3 text-xs text-emerald-800/80 leading-relaxed">{attraction.description}</p>
                      )}
                      {attraction.reviews && attraction.reviews.length > 0 && (
                        <div className="space-y-2">
                          {attraction.reviews.slice(0, 2).map((review, reviewIdx) => (
                            <div
                              key={reviewIdx}
                              className="rounded-xl border border-emerald-50 bg-emerald-50/50 p-3 text-xs text-emerald-800"
                            >
                              <div className="mb-1 flex items-center justify-between font-semibold">
                                <span>{review.author || "Traveler"}</span>
                                {typeof review.rating === "number" && (
                                  <span className="text-emerald-600">{review.rating.toFixed(1)}★</span>
                                )}
                              </div>
                              {review.text && <p className="mt-1 leading-relaxed">{review.text}</p>}
                              {review.relative_time_description && (
                                <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-emerald-500">
                                  {review.relative_time_description}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="w-80 flex-shrink-0 bg-white/60 backdrop-blur-xl rounded-2xl p-6 border border-white/10 text-sm text-emerald-600/80">
                  More options coming soon
                </div>
              )}
            </div>
          </div>
        </section>

      </main>

      {/* Chat Sidebar */}
      {showChat && (
        <div className="fixed right-0 top-0 z-50 h-full w-96 border-l border-emerald-200 bg-white shadow-2xl transition-transform">
          <ChatPlanner
            itinerary={itinerary}
            onItineraryUpdate={handleItineraryUpdate}
            onClose={() => setShowChat(false)}
            tripId={saved ? savedTripId : undefined}
          />
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

      {/* Save Modal */}
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
                <p className="text-sm text-emerald-700">Please sign in to save your trips.</p>
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
                  <label className="mb-1.5 block text-sm font-medium text-emerald-900">Trip Name</label>
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
