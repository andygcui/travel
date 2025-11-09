"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
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
  cabin?: string;
}

interface FlightCabinOption {
  id: string;
  cabin: string;
  price: number;
  currency: string;
  emissionsKg?: number | null;
  ecoScore?: number | null;
}

interface FlightGroup {
  groupId: string;
  carrier: string;
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  cabins: FlightCabinOption[];
  lowestPrice: number;
  lowestEmissions?: number | null;
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

interface LodgingOption {
  id?: string;
  name: string;
  address?: string;
  nightly_rate?: number;
  currency?: string;
  distance_to_center_km?: number;
  sustainability_score?: number;
  booking_url?: string;
  refundable_until?: string;
  emissions_kg?: number;
}

interface HotelCard {
  name: string;
  image?: string;
  address?: string;
  description?: string;
  nightlyRate?: number;
  currency?: string;
  rating?: number;
  reviewCount?: number;
  latitude?: number;
  longitude?: number;
  sustainabilityScore?: number;
  emissionsKg?: number;
  bookingUrl?: string;
  source: "lodging" | "poi";
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
  hotels?: LodgingOption[];
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

const normalizePlaceName = (name: string): string =>
  (name || "").toLowerCase().trim().replace(/\s+/g, " ");

const formatCabinLabel = (value: string) =>
  value.replace(/\b\w/g, (char) => char.toUpperCase());

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
  const [flightSort, setFlightSort] = useState<"price" | "emissions">("emissions");
  const [expandedFlightId, setExpandedFlightId] = useState<string | null>(null);
  const [selectedCabinId, setSelectedCabinId] = useState<string | null>(null);
  const [confirmedCabinId, setConfirmedCabinId] = useState<string | null>(null);
  const [friends, setFriends] = useState<any[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharingTrip, setSharingTrip] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("itinerary");
    const storedRequest = sessionStorage.getItem("tripRequest"); // Get preferences from request
    const collaboratorId = sessionStorage.getItem("collaborator_id"); // Get collaborator ID for shared trips
    const storedTripId = sessionStorage.getItem("savedTripId"); // Check if trip ID is stored
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
      
      // Store collaborator_id in itinerary for ChatPlanner to use
      if (collaboratorId) {
        (parsed as any).collaborator_id = collaboratorId;
      }
      
      // Check if trip has an ID (from saved trip) or if storedTripId exists
      if (storedTripId || (parsed as any).trip_id || (parsed as any).id) {
        const tripId = storedTripId || (parsed as any).trip_id || (parsed as any).id;
        setSavedTripId(tripId);
        setSaved(true);
      }
      
      setItinerary(parsed);
      setCurrentDayIndex(0);
      setTripName(`${parsed.destination} - ${parsed.start_date || new Date().toLocaleDateString()}`);
    } else {
      router.push("/");
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadFriends(session.user.id);
      }
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadFriends(session.user.id);
      }
    });
  }, [router]);

  const loadFriends = async (userId: string) => {
    if (!userId) return;
    setLoadingFriends(true);
    try {
      const response = await fetch(`http://localhost:8000/friends/list?user_id=${userId}`);
      if (response.ok) {
        const data = await response.json();
        setFriends(data.friends || []);
      }
    } catch (err: any) {
      console.error("Error loading friends:", err);
    } finally {
      setLoadingFriends(false);
    }
  };

  const handleShareTrip = async (friendId: string, canEdit: boolean = true) => {
    if (!user || !savedTripId) {
      alert("Please save the trip first before sharing");
      return;
    }
    
    setSharingTrip(true);
    try {
      const response = await fetch("http://localhost:8000/trips/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_id: savedTripId,
          owner_id: user.id,
          friend_id: friendId,
          can_edit: canEdit,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Failed to share trip" }));
        throw new Error(errorData.detail || "Failed to share trip");
      }
      
      // Update itinerary to reflect it's shared - this triggers a re-render
      if (itinerary) {
        setItinerary({
          ...itinerary,
          shared: true,
          shared_with: friendId,
        } as any);
      }
      
      // Reload friends list to get updated data
      if (user) {
        await loadFriends(user.id);
      }
      
      alert("Trip shared successfully!");
      setShowShareModal(false);
    } catch (err: any) {
      alert(`Failed to share trip: ${err.message}`);
    } finally {
      setSharingTrip(false);
    }
  };

  useEffect(() => {
    setSelectedCabinId(null);
    setConfirmedCabinId(null);
    setExpandedFlightId(null);
  }, [itinerary?.destination, itinerary?.start_date, itinerary?.end_date]);

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

  const hotelOptions = useMemo<HotelCard[]>(() => {
    if (!itinerary) return [];

    const attractionList = itinerary.attractions ?? [];

    const findPoiForHotel = (name: string): PointOfInterest | undefined => {
      if (!name) return;
      const normalized = normalizePlaceName(name);
      if (!normalized) return;

      let best: PointOfInterest | undefined;
      let bestScore = 0;

      for (const poi of attractionList) {
        if (!poi.name) continue;
        const poiNormalized = normalizePlaceName(poi.name);
        if (!poiNormalized) continue;

        if (poiNormalized === normalized) {
          return poi;
        }

        if (normalized.includes(poiNormalized) || poiNormalized.includes(normalized)) {
          const score =
            Math.min(normalized.length, poiNormalized.length) /
            Math.max(normalized.length, poiNormalized.length);
          if (score > bestScore) {
            bestScore = score;
            best = poi;
          }
        }
      }

      return best;
    };

    const cards: HotelCard[] = [];
    const seen = new Set<string>();

    const pushCard = (card: HotelCard) => {
      const key = normalizePlaceName(card.name);
      if (!key || seen.has(key)) return;
      seen.add(key);
      cards.push(card);
    };

    (itinerary.hotels ?? []).forEach((hotel) => {
      if (!hotel.name) return;
      const poi = findPoiForHotel(hotel.name);
      pushCard({
        name: hotel.name,
        image: poi?.photo_urls?.[0],
        address: hotel.address ?? poi?.description,
        description: poi?.description,
        nightlyRate: hotel.nightly_rate,
        currency: hotel.currency ?? "USD",
        rating: poi?.rating,
        reviewCount:
          poi?.user_ratings_total ?? (poi?.reviews ? poi.reviews.length : undefined),
        latitude: poi?.latitude,
        longitude: poi?.longitude,
        sustainabilityScore: hotel.sustainability_score ?? undefined,
        emissionsKg: hotel.emissions_kg ?? undefined,
        bookingUrl: hotel.booking_url ?? undefined,
        source: "lodging",
      });
    });

    if (cards.length < 6) {
      const keywords = ["hotel", "lodging", "hostel", "resort", "stay", "guesthouse", "bnb"];
      const isHotelLike = (poi: PointOfInterest) => {
        const haystack = `${poi.category ?? ""} ${poi.description ?? ""}`.toLowerCase();
        return keywords.some((keyword) => haystack.includes(keyword));
      };

      attractionList.forEach((poi) => {
        if (!poi.name || !isHotelLike(poi)) return;
        pushCard({
          name: poi.name,
          image: poi.photo_urls?.[0],
          address: poi.description,
          description: poi.description,
          nightlyRate: undefined,
          currency: undefined,
          rating: poi.rating,
          reviewCount:
            poi.user_ratings_total ?? (poi.reviews ? poi.reviews.length : undefined),
          latitude: poi.latitude,
          longitude: poi.longitude,
          sustainabilityScore: undefined,
          emissionsKg: undefined,
          bookingUrl: undefined,
          source: "poi",
        });
      });
    }

    return cards.slice(0, 6);
  }, [itinerary]);

  // Get non-selected preference categories for "Explore More Options"
  const exploreMoreOptions = useMemo(() => {
    if (!itinerary || !itinerary.attractions) return [];
    return itinerary.attractions.slice(0, 6);
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

  const formatDateTime = (value?: string) => {
    if (!value) return "Schedule pending";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  };

  const formatDurationLabel = (departure?: string, arrival?: string) => {
    if (!departure || !arrival) return "";
    const depart = new Date(departure);
    const arrive = new Date(arrival);
    const diffMs = arrive.getTime() - depart.getTime();
    if (Number.isNaN(diffMs) || diffMs <= 0) return "";
    const diffMinutes = Math.round(diffMs / 60000);
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return `${hours}h ${minutes}m`;
  };

  // Get unique flights
  const groupedFlights = useMemo<FlightGroup[]>(() => {
    if (!itinerary?.flights) return [];

    const groups = new Map<string, FlightGroup>();

    itinerary.flights.forEach((flight) => {
      const key = [
        flight.carrier,
        flight.origin,
        flight.destination,
        flight.departure,
        flight.arrival,
      ]
        .map((part) => (typeof part === "string" ? part : String(part)))
        .join("|");

      const cabinName = flight.cabin ? flight.cabin.toLowerCase() : "economy";
      const cabinOption: FlightCabinOption = {
        id: `${flight.id}-${cabinName}`,
        cabin: cabinName,
        price: flight.price,
        currency: flight.currency || "USD",
        emissionsKg: flight.emissions_kg ?? null,
        ecoScore: flight.eco_score ?? null,
      };

      if (!groups.has(key)) {
        groups.set(key, {
          groupId: key,
          carrier: flight.carrier,
          origin: flight.origin,
          destination: flight.destination,
          departure: flight.departure,
          arrival: flight.arrival,
          cabins: [cabinOption],
          lowestPrice: flight.price,
          lowestEmissions: flight.emissions_kg ?? null,
        });
      } else {
        const group = groups.get(key)!;
        group.cabins.push(cabinOption);
        group.lowestPrice = Math.min(group.lowestPrice, flight.price);
        if (flight.emissions_kg !== undefined && flight.emissions_kg !== null) {
          if (
            group.lowestEmissions === undefined ||
            group.lowestEmissions === null ||
            flight.emissions_kg < group.lowestEmissions
          ) {
            group.lowestEmissions = flight.emissions_kg;
          }
        }
      }
    });

    return Array.from(groups.values()).map((group) => ({
      ...group,
      cabins: group.cabins.sort((a, b) => a.price - b.price),
    }));
  }, [itinerary?.flights]);

  const sortedFlightGroups = useMemo(() => {
    const clone = [...groupedFlights];
    clone.sort((a, b) => {
      if (flightSort === "price") {
        return a.lowestPrice - b.lowestPrice;
      }
      const aEmissions = a.lowestEmissions ?? Infinity;
      const bEmissions = b.lowestEmissions ?? Infinity;
      return aEmissions - bEmissions;
    });
    return clone;
  }, [groupedFlights, flightSort]);

  const findCabinById = useMemo(() => {
    const map = new Map<string, { cabin: FlightCabinOption; group: FlightGroup; maxEmission: number }>();
    groupedFlights.forEach((group) => {
      const maxEmission = group.cabins.reduce((max, cabin) => {
        if (cabin.emissionsKg === undefined || cabin.emissionsKg === null) return max;
        return Math.max(max, cabin.emissionsKg);
      }, 0);
      group.cabins.forEach((cabin) => {
        map.set(cabin.id, { cabin, group, maxEmission });
      });
    });
    return map;
  }, [groupedFlights]);

  const selectedCabinData = useMemo(() => {
    if (!selectedCabinId) return null;
    return findCabinById.get(selectedCabinId) || null;
  }, [selectedCabinId, findCabinById]);

  const confirmedCabinData = useMemo(() => {
    if (!confirmedCabinId) return null;
    return findCabinById.get(confirmedCabinId) || null;
  }, [confirmedCabinId, findCabinById]);

  const currentDayDateLabel = useMemo(() => {
    if (!itinerary || !itinerary.start_date || !itinerary.days || itinerary.days.length === 0) {
      return null;
    }
    const dayEntry = itinerary.days[currentDayIndex];
    if (!dayEntry) return null;
    const baseDate = new Date(itinerary.start_date);
    if (Number.isNaN(baseDate.getTime())) return null;
    const dayNumber = typeof dayEntry.day === "number" ? dayEntry.day : currentDayIndex + 1;
    const offset = Math.max(0, dayNumber - 1);
    baseDate.setDate(baseDate.getDate() + offset);
    return baseDate.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }, [itinerary, currentDayIndex]);

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

  const goPrevDay = () => setCurrentDayIndex((prev) => Math.max(0, prev - 1));
  const goNextDay = () => setCurrentDayIndex((prev) => Math.min(itinerary.days.length - 1, prev + 1));

  const baseCost = typeof itinerary.totals?.cost === "number" ? itinerary.totals.cost : 0;
  const baseEmissions =
    typeof itinerary.totals?.emissions_kg === "number" ? itinerary.totals.emissions_kg : 0;

  const hasConfirmedFlight = Boolean(confirmedCabinData);
  const confirmedSpend = hasConfirmedFlight
    ? confirmedCabinData!.cabin.price ?? 0
    : null;
  const confirmedEmissions =
    hasConfirmedFlight && confirmedCabinData!.cabin.emissionsKg !== undefined && confirmedCabinData!.cabin.emissionsKg !== null
      ? confirmedCabinData!.cabin.emissionsKg
      : null;

  const rawConfirmedCredits =
    hasConfirmedFlight &&
    confirmedCabinData!.cabin.emissionsKg !== undefined &&
    confirmedCabinData!.cabin.emissionsKg !== null &&
    confirmedCabinData!.maxEmission > 0 &&
    confirmedCabinData!.cabin.cabin.toLowerCase() !== "first"
      ? Math.max(0, confirmedCabinData!.maxEmission - confirmedCabinData!.cabin.emissionsKg)
      : null;
  const confirmedCarbonCredits =
    rawConfirmedCredits !== null && rawConfirmedCredits > 0.05 ? rawConfirmedCredits : null;

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
                <>
                  {savedTripId && (
                    <button
                      onClick={() => setShowShareModal(true)}
                      disabled={sharingTrip}
                      className={`rounded-full border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        (itinerary as any)?.shared
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                          : "border-emerald-200 bg-white/60 text-emerald-700 hover:border-emerald-300"
                      }`}
                      title="Share trip"
                    >
                      {sharingTrip ? "Sharing..." : (itinerary as any)?.shared ? "✓ Shared" : "🔗 Share"}
                    </button>
                  )}
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
                </>
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
        <section className="mb-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          <div className="summary-card bg-white/60 backdrop-blur-xl rounded-2xl p-6 shadow-sm text-center border border-white/10">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-600/70 mb-2">Total Spend</p>
            <p className="text-4xl font-bold text-[#0b3d2e]">
              {hasConfirmedFlight && confirmedSpend !== null ? currency.format(confirmedSpend) : "--"}
            </p>
            <p className="mt-2 text-sm text-emerald-600/80">Budget: {currency.format(itinerary.budget)}</p>
          </div>
          <div className="summary-card bg-white/60 backdrop-blur-xl rounded-2xl p-6 shadow-sm text-center border border-white/10">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-600/70 mb-2">Estimated CO₂</p>
            <p className="text-4xl font-bold text-[#0b3d2e]">
              {hasConfirmedFlight && confirmedEmissions !== null ? `${confirmedEmissions.toFixed(1)} kg` : "--"}
            </p>
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
          <div className="summary-card bg-white/60 backdrop-blur-xl rounded-2xl p-6 shadow-sm text-center border border-white/10">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-600/70 mb-2">Carbon Credits</p>
            <p className="text-4xl font-bold text-[#0b3d2e]">
              {confirmedCarbonCredits !== null ? `+ ${confirmedCarbonCredits.toFixed(1)}` : "--"}
            </p>
            <p className="mt-2 text-sm text-emerald-600/80">Saved vs highest-impact cabin</p>
          </div>
        </section>

        {confirmedCabinData && (
          <div className="mb-20 rounded-2xl border border-white/10 bg-white/70 p-6 shadow-sm backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-emerald-500">Selected Flight</p>
                <p className="mt-1 text-xl font-semibold text-[#0b3d2e]">
                  {confirmedCabinData.group.origin} → {confirmedCabinData.group.destination}
                </p>
                <p className="text-sm text-emerald-600/80">
                  {formatDateTime(confirmedCabinData.group.departure)} —{" "}
                  {formatDateTime(confirmedCabinData.group.arrival)} ·{" "}
                  {formatDurationLabel(confirmedCabinData.group.departure, confirmedCabinData.group.arrival)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-[0.3em] text-emerald-500">Cabin</p>
                <p className="mt-1 text-lg font-semibold text-[#0b3d2e]">
                  {formatCabinLabel(confirmedCabinData.cabin.cabin)}
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="rounded-xl bg-emerald-50/50 p-4 text-sm text-emerald-700">
                <p className="text-xs uppercase tracking-[0.25em] text-emerald-500">Flight Cost</p>
                <p className="mt-1 text-lg font-semibold text-[#0b3d2e]">
                  {currency.format(confirmedCabinData.cabin.price)}
                </p>
              </div>
              <div className="rounded-xl bg-emerald-50/50 p-4 text-sm text-emerald-700">
                <p className="text-xs uppercase tracking-[0.25em] text-emerald-500">Flight Emissions</p>
                <p className="mt-1 text-lg font-semibold text-[#0b3d2e]">
                  {confirmedCabinData.cabin.emissionsKg !== undefined && confirmedCabinData.cabin.emissionsKg !== null
                    ? `${confirmedCabinData.cabin.emissionsKg.toFixed(1)} kg`
                    : "N/A"}
                </p>
              </div>
              <div className="rounded-xl bg-emerald-50/50 p-4 text-sm text-emerald-700">
                <p className="text-xs uppercase tracking-[0.25em] text-emerald-500">Carbon Credits</p>
                <p className="mt-1 text-lg font-semibold text-[#0b3d2e]">
                  {confirmedCarbonCredits !== null ? `+ ${confirmedCarbonCredits.toFixed(1)}` : "--"}
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setConfirmedCabinId(null);
                  setSelectedCabinId(null);
                  setExpandedFlightId(null);
                }}
                className="rounded-full border border-emerald-200 bg-white px-5 py-2 text-sm font-medium text-emerald-600 shadow-sm transition hover:border-emerald-300 hover:text-emerald-700"
              >
                Remove flight
              </button>
            </div>
          </div>
        )}

        {/* Flight Options */}
        <section className="flight-section mb-20">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-2xl font-bold text-[#0b3d2e]">Flight Options</h2>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex flex-col text-emerald-700">
                <span className="mb-1 text-xs uppercase tracking-[0.2em] text-emerald-500">Sort by</span>
                <select
                  value={flightSort}
                  onChange={(e) => setFlightSort(e.target.value as "price" | "emissions")}
                  className="rounded-full border border-emerald-200 bg-white/70 px-4 py-2 text-sm text-[#0b3d2e] shadow-sm focus:border-emerald-400 focus:outline-none"
                >
                  <option value="price">Lowest price</option>
                  <option value="emissions">Lowest emissions</option>
                </select>
              </label>
            </div>
          </div>

  <div className="space-y-4">
    {sortedFlightGroups.length > 0 ? (
      sortedFlightGroups.map((flight) => {
        const isExpanded = expandedFlightId === flight.groupId;
        const durationText = (() => {
          const depart = new Date(flight.departure);
          const arrive = new Date(flight.arrival);
          const diffMs = arrive.getTime() - depart.getTime();
          if (Number.isNaN(diffMs) || diffMs <= 0) return "Duration unavailable";
          const diffMinutes = Math.round(diffMs / 60000);
          const hours = Math.floor(diffMinutes / 60);
          const minutes = diffMinutes % 60;
          return `${hours}h ${minutes}m`;
        })();

        const maxEmission =
          flight.cabins.reduce((max, cabin) => {
            if (cabin.emissionsKg === undefined || cabin.emissionsKg === null) return max;
            return Math.max(max, cabin.emissionsKg);
          }, 0) || 0;

        return (
          <div
            key={flight.groupId}
            className="flight-card rounded-2xl border border-white/10 bg-white/60 p-6 shadow-sm backdrop-blur-xl transition-all hover:shadow-lg"
          >
            <button
              onClick={() => setExpandedFlightId(isExpanded ? null : flight.groupId)}
              className="w-full text-left"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 text-sm text-emerald-700">
                    <span className="font-semibold text-[#0b3d2e] text-lg">
                      {flight.origin} → {flight.destination}
                    </span>
                    <span className="rounded-full border border-emerald-200 px-2 py-0.5 text-xs">
                      {flight.cabins.length} cabin{flight.cabins.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-emerald-600/80">
                    {formatDateTime(flight.departure)} — {formatDateTime(flight.arrival)} · {durationText}
                  </p>
                  <p className="mt-1 text-xs text-emerald-600/80">
                    Operated by {flight.carrier}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm uppercase tracking-[0.2em] text-emerald-500">From</p>
                  <p className="text-xl font-semibold text-[#0b3d2e]">
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: flight.cabins[0]?.currency ?? "USD",
                    }).format(flight.lowestPrice)}
                  </p>
                  {flight.lowestEmissions !== undefined && flight.lowestEmissions !== null && (
                    <p className="text-xs text-emerald-600/80">
                      {flight.lowestEmissions.toFixed(1)} kg CO₂ (best cabin)
                    </p>
                  )}
                </div>
              </div>
            </button>

            {isExpanded && (
              <div className="mt-5 rounded-2xl border border-emerald-100 bg-white/80 p-4">
                <h4 className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">
                  Choose your cabin
                </h4>
                <div className="space-y-3">
                  {flight.cabins.map((cabin) => {
                    const carbonCredits =
                      cabin.emissionsKg !== undefined && cabin.emissionsKg !== null
                        ? Math.max(0, maxEmission - cabin.emissionsKg)
                        : null;
                    const isSelected = selectedCabinId === cabin.id;
                    const showCredits =
                      cabin.cabin.toLowerCase() !== "first" &&
                      carbonCredits !== null &&
                      carbonCredits > 0.05;
                    return (
                      <button
                        key={cabin.id}
                        type="button"
                        onClick={() => setSelectedCabinId(cabin.id)}
                        className={`flex w-full flex-wrap items-center gap-4 rounded-xl border px-4 py-3 text-left text-sm shadow-sm transition ${
                          isSelected
                            ? "border-emerald-400 bg-emerald-50/80 ring-2 ring-emerald-200"
                            : "border-emerald-100 bg-white/90 hover:border-emerald-200 hover:bg-emerald-50/40"
                        }`}
                      >
                        <div className="flex-1">
                          <p className="font-semibold text-[#0b3d2e]">
                            {formatCabinLabel(cabin.cabin)}
                          </p>
                          <p className="text-xs text-emerald-600/80">
                            {cabin.emissionsKg !== undefined && cabin.emissionsKg !== null
                              ? `${cabin.emissionsKg.toFixed(1)} kg CO₂`
                              : "Emission estimate unavailable"}
                          </p>
                        </div>
                        <div className="flex flex-col items-start justify-center text-emerald-700">
                          {showCredits ? (
                            <>
                              <span className="text-lg font-semibold text-emerald-600">
                                + {carbonCredits!.toFixed(1)}
                              </span>
                              <span className="text-[10px] uppercase tracking-[0.3em] text-emerald-500">
                                Carbon Credits
                              </span>
                            </>
                          ) : (
                            <span className="text-xs text-emerald-500/60">No credits</span>
                          )}
                        </div>
                        <div className="flex flex-col items-end">
                          <p className="font-semibold text-[#0b3d2e]">
                            {new Intl.NumberFormat("en-US", {
                              style: "currency",
                              currency: cabin.currency ?? "USD",
                            }).format(cabin.price)}
                          </p>
                          {isSelected && (
                            <span className="text-xs font-medium text-emerald-600">Selected</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {(() => {
                  const selectionInGroup = flight.cabins.some((cabin) => cabin.id === selectedCabinId);
                  if (!selectionInGroup) return null;
                  const selectionConfirmed =
                    selectedCabinId !== null && selectedCabinId === confirmedCabinId;
                  return (
                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedCabinId) {
                            setConfirmedCabinId(selectedCabinId);
                          }
                        }}
                        disabled={!selectedCabinId || selectionConfirmed}
                        className={`rounded-full px-6 py-2 text-sm font-semibold shadow-md transition ${
                          selectionConfirmed
                            ? "cursor-default bg-emerald-200 text-emerald-800"
                            : "bg-emerald-600 text-white hover:bg-emerald-500"
                        }`}
                      >
                        {selectionConfirmed ? "Flight selected" : "Select flight"}
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        );
      })
    ) : (
      <div className="rounded-2xl border border-white/10 bg-white/60 p-6 text-sm text-emerald-600/80 backdrop-blur-xl">
        Flight details coming soon
      </div>
    )}
  </div>
        </section>

        {/* Accommodations */}
        <section className="accommodation-section mb-20">
          <h2 className="mb-6 text-2xl font-bold text-[#0b3d2e]">Where You'll Stay</h2>
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
            {hotelOptions.length > 0 ? (
              hotelOptions.map((hotel, idx) => (
                <div
                  key={`${hotel.name}-${idx}`}
                  className="accommodation-card flex-shrink-0 w-80 bg-white/60 backdrop-blur-xl rounded-2xl overflow-hidden border border-white/10 shadow-sm transition-all hover:scale-[1.03] hover:shadow-xl"
                >
                  {hotel.image ? (
                    <img
                      src={hotel.image}
                      alt={`${hotel.name} exterior`}
                      className="h-44 w-full object-cover"
                      loading={idx < 2 ? "eager" : "lazy"}
                    />
                  ) : (
                    <div className="flex h-44 w-full items-center justify-center bg-emerald-50/40 text-xs text-emerald-600/80">
                      Imagery available soon
                    </div>
                  )}
                  <div className="p-5 space-y-3">
                    <div>
                      <h3 className="text-lg font-semibold text-[#0b3d2e]">{hotel.name}</h3>
                      {hotel.rating !== undefined && hotel.rating !== null && typeof hotel.rating === 'number' && (
                        <p className="text-sm text-emerald-600/80">
                          ⭐ {hotel.rating.toFixed(1)}
                          {hotel.reviewCount !== undefined && hotel.reviewCount !== null && (
                            <span className="ml-2 text-xs text-emerald-500/80">
                              ({hotel.reviewCount.toLocaleString()} reviews)
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    {hotel.address && (
                      <p className="text-sm text-emerald-700/80">{hotel.address}</p>
                    )}
                    {hotel.description && (
                      <p className="text-sm text-emerald-800/80 leading-relaxed line-clamp-4">
                        {hotel.description}
                      </p>
                    )}
                    <div className="space-y-2 text-sm text-emerald-700/80">
                      {hotel.nightlyRate !== undefined && (
                        <p>
                          Nightly rate:{" "}
                          <span className="font-semibold text-[#0b3d2e]">
                            {new Intl.NumberFormat("en-US", {
                              style: "currency",
                              currency: hotel.currency ?? "USD",
                            }).format(hotel.nightlyRate)}
                          </span>
                        </p>
                      )}
                      {hotel.sustainabilityScore !== undefined && (
                        <p>Sustainability score: {(hotel.sustainabilityScore * 100).toFixed(0)}%</p>
                      )}
                      {hotel.emissionsKg !== undefined && (
                        <p>Estimated emissions: {hotel.emissionsKg.toFixed(1)} kg / night</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {hotel.latitude !== undefined && hotel.longitude !== undefined && (
                        <Link
                          href={`https://www.google.com/maps?q=${hotel.latitude},${hotel.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-full border border-emerald-200 px-3 py-1 text-emerald-700 transition hover:border-emerald-300"
                        >
                          Open in Maps
                        </Link>
                      )}
                      {hotel.bookingUrl && (
                        <Link
                          href={hotel.bookingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-full border border-emerald-200 px-3 py-1 text-emerald-700 transition hover:border-emerald-300"
                        >
                          View offer
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="w-80 flex-shrink-0 bg-white/60 backdrop-blur-xl rounded-2xl p-6 border border-white/10 text-sm text-emerald-600/80">
                Hotel recommendations will appear here once available.
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

          {/* Day Selector */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-semibold text-[#0b3d2e]">
                {currentDayDateLabel ?? `Day ${currentDay.day}`}
                {currentDayDateLabel && (
                  <span className="ml-3 text-sm font-medium text-emerald-500/80">
                    Day {currentDay.day} of {itinerary.days.length}
                  </span>
                )}
              </h3>
            </div>
            {currentWeather && (
              <div className="flex items-center gap-4 overflow-x-auto rounded-2xl bg-white/70 backdrop-blur-xl px-5 py-3 border border-white/10 shadow-sm text-sm text-emerald-700">
                {(() => {
                  const slots: { label: string; weather?: DaypartWeather }[] = [
                    { label: "6:00 AM", weather: currentWeather.morning },
                    {
                      label: "9:00 AM",
                      weather: currentWeather.morning
                        ? {
                            ...currentWeather.morning,
                            temperature_c: currentWeather.morning.temperature_c + 1,
                          }
                        : undefined,
                    },
                    { label: "12:00 PM", weather: currentWeather.afternoon },
                    {
                      label: "3:00 PM",
                      weather: currentWeather.afternoon
                        ? {
                            ...currentWeather.afternoon,
                            temperature_c: currentWeather.afternoon.temperature_c + 1,
                          }
                        : undefined,
                    },
                    { label: "6:00 PM", weather: currentWeather.evening },
                  ];

                  return slots.map(({ label, weather }) => {
                    const tempF = weather ? (weather.temperature_c * 9) / 5 + 32 : null;
                    const emoji = weatherGlyph(weather?.summary ?? "");
                    return (
                      <div key={label} className="flex flex-col items-center min-w-[72px]">
                        <span className="text-[11px] font-medium text-emerald-500">{label}</span>
                        <span className="text-xl leading-none">{emoji}</span>
                        <span className="text-sm font-semibold text-[#0b3d2e]">
                          {tempF !== null ? `${Math.round(tempF)}°F` : "--"}
                        </span>
                      </div>
                    );
                  });
                })()}
                <div className="ml-4 flex flex-col text-xs text-emerald-600/80">
                  <span className="font-medium text-[#0b3d2e]">Precipitation</span>
                  <span>
                    {(() => {
                      const precip = Math.max(
                        currentWeather.morning.precipitation_probability,
                        currentWeather.afternoon.precipitation_probability,
                        currentWeather.evening.precipitation_probability,
                      );
                      return `${Math.round(precip * 100)}% chance`;
                    })()}
                  </span>
                </div>
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
                    <p className="text-sm text-emerald-600/80">⭐ {typeof poi.rating === 'number' ? poi.rating.toFixed(1) : poi.rating} / 5.0</p>
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
                const container = e.currentTarget.parentElement?.querySelector<HTMLDivElement>(".scroll-container");
                container?.scrollBy({ left: -320, behavior: "smooth" });
              }}
              className="absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/80 backdrop-blur-sm p-3 shadow-lg transition hover:bg-white hover:shadow-xl"
              aria-label="Scroll left"
            >
              ‹
            </button>
            <button
              onClick={(e) => {
                const container = e.currentTarget.parentElement?.querySelector<HTMLDivElement>(".scroll-container");
                container?.scrollBy({ left: 320, behavior: "smooth" });
              }}
              className="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/80 backdrop-blur-sm p-3 shadow-lg transition hover:bg-white hover:shadow-xl"
              aria-label="Scroll right"
            >
              ›
            </button>

            <div className="scroll-container flex gap-6 overflow-x-auto scroll-smooth px-12 pb-4 scrollbar-hide">
              {exploreMoreOptions.length > 0 ? (
                exploreMoreOptions.map((attraction, idx) => {
                  const reviewCount = attraction.reviews?.length ?? 0;
                  const averageRating =
                    attraction.rating ??
                    (reviewCount
                      ? (attraction.reviews || []).reduce((sum, r) => sum + (r.rating || 0), 0) / reviewCount
                      : undefined);

                  return (
                    <div
                      key={idx}
                      className="scroll-fade flex-shrink-0 w-80 rounded-2xl border border-white/10 bg-white/60 p-6 shadow-sm backdrop-blur-xl"
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
                      {averageRating !== undefined && (
                        <div className="mb-3 flex items-center justify-between text-sm">
                          <span className="font-medium text-emerald-700">
                            {attraction.name} • {averageRating.toFixed(1)}★
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
                <div className="w-80 flex-shrink-0 rounded-2xl border border-white/10 bg-white/60 p-6 text-sm text-emerald-600/80 backdrop-blur-xl">
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
            collaboratorId={(itinerary as any)?.collaborator_id}
          />
        </div>
      )}

      {/* Share Trip Modal */}
      {showShareModal && savedTripId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl border border-emerald-200 bg-white p-6 shadow-2xl">
            <button
              onClick={() => {
                setShowShareModal(false);
              }}
              disabled={sharingTrip}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 disabled:opacity-50"
            >
              ✕
            </button>

            <h2 className="mb-4 text-2xl font-bold text-emerald-900">Share Trip</h2>
            <p className="mb-2 text-sm text-emerald-700">
              Share "{tripName || itinerary?.destination || 'this trip'}" with a friend
            </p>

            {friends.length === 0 ? (
              <p className="mb-4 text-sm text-emerald-600 italic">
                You need to have friends to share trips. Go to the Friends page to add friends.
              </p>
            ) : (
              <div className="mb-6 max-h-64 space-y-2 overflow-y-auto">
                {friends.map((friend) => (
                  <div
                    key={friend.friendship_id}
                    className="flex items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50 p-3"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-emerald-900">
                        @{friend.username || friend.email || "unknown"}
                      </p>
                    </div>
                    <button
                      onClick={() => handleShareTrip(friend.friend_id, true)}
                      disabled={sharingTrip}
                      className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-medium text-white transition hover:bg-emerald-600 disabled:opacity-50"
                    >
                      Share
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => {
                setShowShareModal(false);
              }}
              disabled={sharingTrip}
              className="w-full rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
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
      >
        <span className="text-2xl">{showChat ? "×" : "💬"}</span>
      </button>
    </div>
  );
};