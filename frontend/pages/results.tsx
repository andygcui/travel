"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { supabase } from "../lib/supabase";
import ChatPlanner from "../components/ChatPlanner";
import ItineraryMap from "../components/ItineraryMap";
import tokyoHotels from "../data/hotels/tokyo.json";

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
  place_id?: string;
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
  latitude?: number;
  longitude?: number;
  rating?: number;
  user_ratings_total?: number;
  photo_urls?: string[];
  reviews?: POIReview[];
  description?: string;
  place_id?: string;
}

interface HotelCard {
  id?: string;
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
  hotels?: LodgingOption[];
  preferences?: string[]; // User's selected preferences
}

const HOTEL_IMAGE_DEFAULT =
  "https://images.unsplash.com/photo-1512914890250-353c67b3939d?auto=format&fit=crop&w=900&q=80";

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
  const [flightSort, setFlightSort] = useState<"priceAsc" | "priceDesc">("priceAsc");
  const [expandedFlightId, setExpandedFlightId] = useState<string | null>(null);
  const [selectedCabinId, setSelectedCabinId] = useState<string | null>(null);
  const [confirmedCabinId, setConfirmedCabinId] = useState<string | null>(null);
  const [selectedHotelId, setSelectedHotelId] = useState<string | null>(null);
  const [confirmedHotelId, setConfirmedHotelId] = useState<string | null>(null);
  const [friends, setFriends] = useState<any[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [checkingPreferences, setCheckingPreferences] = useState(false);

  // Log friends count whenever it changes
  useEffect(() => {
    console.log("Friends state changed - current count:", friends.length);
    if (friends.length > 0) {
      console.log("Current friends list:", friends);
    }
  }, [friends]);

  // Load trip status when savedTripId changes
  // Only verify if saved=true is already set (meaning it was saved in this session)
  // Don't auto-verify for new trips from home page
  useEffect(() => {
    if (savedTripId && user) {
      // Only verify if we already think it's saved (from clicking save button)
      // This prevents auto-saving new trips from home page
      if (saved) {
        verifyTripIsSaved(savedTripId, user.id).then((isSaved) => {
          if (!isSaved) {
            // If verification fails, reset saved state
            setSaved(false);
          }
        });
      }
      loadTripStatus(savedTripId);
    }
  }, [savedTripId, user, saved]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharingTrip, setSharingTrip] = useState(false);
  const [hotelReviewStates, setHotelReviewStates] = useState<
    Record<string, { open: boolean; index: number }>
  >({});
  const [exploreReviewStates, setExploreReviewStates] = useState<
    Record<string, { open: boolean; index: number }>
  >({});
  const [tripStatus, setTripStatus] = useState<"draft" | "before" | "during" | "after">("draft");
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const normalizedHotelKey = useCallback((name: string) => normalizePlaceName(name) || name, []);
  const normalizedExploreKey = useCallback((name: string) => normalizePlaceName(name) || name, []);

  const toggleHotelReviews = useCallback(
    (name: string, reviewCount: number) => {
      setHotelReviewStates((prev) => {
        const key = normalizedHotelKey(name);
        const current = prev[key] ?? { open: false, index: 0 };
        const isOpening = !current.open;
        return {
          ...prev,
          [key]: {
            open: isOpening,
            index: isOpening ? 0 : current.index % Math.max(1, reviewCount || 1),
          },
        };
      });
    },
    [normalizedHotelKey],
  );

  const cycleHotelReview = useCallback((name: string, total: number, delta: number) => {
    if (!total) return;
    setHotelReviewStates((prev) => {
      const key = normalizedHotelKey(name);
      const current = prev[key] ?? { open: true, index: 0 };
      const nextIndex = (current.index + delta + total) % total;
      return {
        ...prev,
        [key]: { open: true, index: nextIndex },
      };
    });
  }, [normalizedHotelKey]);

  const toggleExploreReviews = useCallback(
    (name: string, reviewCount: number) => {
      setExploreReviewStates((prev) => {
        const key = normalizedExploreKey(name);
        const current = prev[key] ?? { open: false, index: 0 };
        const isOpening = !current.open;
        return {
          ...prev,
          [key]: {
            open: isOpening,
            index: isOpening ? 0 : current.index % Math.max(1, reviewCount || 1),
          },
        };
      });
    },
    [normalizedExploreKey],
  );

  const cycleExploreReview = useCallback(
    (name: string, total: number, delta: number) => {
      if (!total) return;
      setExploreReviewStates((prev) => {
        const key = normalizedExploreKey(name);
        const current = prev[key] ?? { open: true, index: 0 };
        const nextIndex = (current.index + delta + total) % total;
        return {
          ...prev,
          [key]: { open: true, index: nextIndex },
        };
      });
    },
    [normalizedExploreKey],
  );

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
      // Only set savedTripId if it exists, but don't set saved=true automatically
      // The saved state will be verified later when user is loaded
      if (storedTripId || (parsed as any).trip_id || (parsed as any).id) {
        const tripId = storedTripId || (parsed as any).trip_id || (parsed as any).id;
        setSavedTripId(tripId);
        // Don't set saved=true here - it will be verified when user loads
      }
      
      setItinerary(parsed);
      setCurrentDayIndex(0);
      setTripName(`${parsed.destination} - ${parsed.start_date || new Date().toLocaleDateString()}`);
    } else {
      router.push("/");
    }

    let isMounted = true;

    const handleSessionChange = async (session: any) => {
      if (!isMounted) return;

      setUser(session?.user ?? null);
      if (session?.user) {
        loadFriends(session.user.id);
        const storedTripId = sessionStorage.getItem("savedTripId");
        const tripId = savedTripId || storedTripId || (stored ? (() => {
          try {
            const parsed: ItineraryResponse = JSON.parse(stored);
            return (parsed as any)?.trip_id || (parsed as any)?.id;
          } catch {
            return null;
          }
        })() : null);
        
        if (tripId) {
          if (storedTripId) {
            const isSaved = await verifyTripIsSaved(tripId, session.user.id);
            if (isSaved) {
              setSaved(true);
              setSavedTripId(tripId);
            } else {
              setSaved(false);
            }
          } else {
            setSaved(false);
            setSavedTripId(null);
          }
          loadTripStatus(tripId);
        }
      }
    };

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      handleSessionChange(session);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      handleSessionChange(session);
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [router, savedTripId]);

  const loadFriends = async (userId: string) => {
    if (!userId) {
      console.warn("loadFriends called without userId");
      return;
    }
    setLoadingFriends(true);
    try {
      console.log("Loading friends for user:", userId);
      const response = await fetch(`http://localhost:8000/friends/list?user_id=${userId}`);
      console.log("Friends list response status:", response.status);
      if (response.ok) {
        const data = await response.json();
        console.log("Friends loaded - full response:", data);
        console.log("Friends array:", data.friends);
        console.log("Number of friends:", data.friends?.length || 0);
        const friendsList = data.friends || [];
        console.log("Setting friends state to:", friendsList);
        setFriends(friendsList);
        console.log("Friends state updated, current friends count:", friendsList.length);
      } else {
        const errorText = await response.text();
        console.error("Error loading friends:", response.status, errorText);
      }
    } catch (err: any) {
      console.error("Error loading friends:", err);
    } finally {
      setLoadingFriends(false);
      console.log("Finished loading friends");
    }
  };

  const loadTripStatus = async (tripId: string) => {
    if (!tripId) return;
    try {
      const { data, error } = await supabase
        .from("saved_trips")
        .select("trip_status")
        .eq("id", tripId)
        .single();

      if (error) throw error;
      if (data?.trip_status) {
        setTripStatus(data.trip_status as "draft" | "before" | "during" | "after");
      }
    } catch (err: any) {
      console.error("Error loading trip status:", err);
    }
  };

  const verifyTripIsSaved = async (tripId: string, userId: string) => {
    if (!tripId || !userId) return false;
    try {
      const { data, error } = await supabase
        .from("saved_trips")
        .select("id, user_id")
        .eq("id", tripId)
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("Error verifying trip:", error);
        return false;
      }

      // If trip exists and belongs to user, it's saved
      if (data && data.id) {
        console.log("Trip verified as saved:", tripId);
        return true;
      }

      return false;
    } catch (err: any) {
      console.error("Error verifying trip:", err);
      return false;
    }
  };

  const handleUpdateTripStatus = async (newStatus: "draft" | "before" | "during" | "after") => {
    if (!user || !savedTripId) {
      alert("Please save the trip first before updating its status.");
      return;
    }

    if (!user.id) {
      alert("User ID is missing. Please log in again.");
      return;
    }

    // For 'during' and 'after' status, require flight selection
    if (newStatus === "during" || newStatus === "after") {
      if (!confirmedCabinId) {
        alert("Please select a flight option before marking as 'during' or 'after'.");
        return;
      }
    }

    setUpdatingStatus(true);
    try {
      // First, verify the trip exists and belongs to the current user
      const { data: tripData, error: tripError } = await supabase
        .from("saved_trips")
        .select("user_id, id")
        .eq("id", savedTripId)
        .maybeSingle();

      if (tripError) {
        console.error("Error verifying trip:", tripError);
        // Continue anyway - backend will verify
      } else if (tripData) {
        const tripUserId = String(tripData.user_id).trim().toLowerCase();
        const currentUserId = String(user.id).trim().toLowerCase();
        
        console.log("Trip ownership check (frontend):", {
          trip_id: savedTripId,
          trip_user_id: tripData.user_id,
          trip_user_id_str: tripUserId,
          current_user_id: user.id,
          current_user_id_str: currentUserId,
          match: tripUserId === currentUserId,
          trip_user_id_type: typeof tripData.user_id,
          current_user_id_type: typeof user.id,
        });

        if (tripUserId !== currentUserId) {
          console.error("OWNERSHIP MISMATCH DETECTED:", {
            trip_user_id: tripUserId,
            current_user_id: currentUserId,
            trip_user_id_raw: tripData.user_id,
            current_user_id_raw: user.id,
          });
          throw new Error(`You don't have permission to update this trip. Trip belongs to ${tripUserId}, but you are ${currentUserId}`);
        }
      } else {
        console.warn("Trip not found in frontend verification, but proceeding - backend will verify");
      }

      // Get confirmed cabin data
      const confirmedCabin = confirmedCabinId ? findCabinById.get(confirmedCabinId) : null;
      
      // Calculate carbon emissions and credits if we have flight data
      let carbonEmissions: number | null = null;
      let carbonCredits: number | null = null;
      
      if (confirmedCabin && (newStatus === "during" || newStatus === "after")) {
        carbonEmissions = confirmedCabin.cabin.emissionsKg || null;
        
        // Calculate carbon credits: find max emissions in the same flight group, then calculate credits
        if (carbonEmissions && confirmedCabin.maxEmission > 0) {
          // Carbon credits = max emissions - actual emissions
          carbonCredits = confirmedCabin.maxEmission - carbonEmissions;
        }
      }

      // Ensure user_id and trip_id are strings for consistency
      const userId = String(user.id).trim();
      const tripId = String(savedTripId).trim();

      console.log("Updating trip status:", {
        trip_id: tripId,
        trip_id_type: typeof tripId,
        user_id: userId,
        user_id_type: typeof userId,
        user_id_raw: user.id,
        user_id_raw_type: typeof user.id,
        savedTripId_original: savedTripId,
        savedTripId_type: typeof savedTripId,
        status: newStatus,
      });

      if (!tripId || tripId === "null" || tripId === "undefined") {
        throw new Error("Invalid trip ID. Please save the trip first.");
      }

      const response = await fetch("http://localhost:8000/trips/status", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_id: tripId,
          user_id: userId,
          status: newStatus,
          selected_flight_id: confirmedCabinId || null,
          selected_flight_data: confirmedCabin?.cabin || null,
          carbon_emissions_kg: carbonEmissions,
          carbon_credits: carbonCredits,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Failed to update trip status" }));
        console.error("Error updating trip status:", errorData);
        throw new Error(errorData.detail || "Failed to update trip status");
      }

      setTripStatus(newStatus);
      if (newStatus === "after") {
        alert("Trip completed! Carbon emissions and credits have been recorded.");
      }
    } catch (err: any) {
      console.error("Error updating trip status:", err);
      alert(`Failed to update trip status: ${err.message}`);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const regenerateItinerary = async () => {
    if (!user || !itinerary) return;
    
    setCheckingPreferences(true);
    try {
      console.log("=== Regenerating itinerary with all collaborators' preferences ===");
      
      // Get all collaborators for this trip
      const collaboratorIds = new Set<string>();
      
      // Get collaborator from itinerary if it's a shared trip
      const collaboratorId = (itinerary as any)?.collaborator_id;
      if (collaboratorId) {
        collaboratorIds.add(collaboratorId);
      }
      
      // Get all collaborators from shared trips (trips shared with user and trips shared by user)
      if (savedTripId) {
        try {
          // Get trips shared with the user
          const sharedWithResponse = await fetch(`http://localhost:8000/trips/shared?user_id=${user.id}`);
          if (sharedWithResponse.ok) {
            const sharedWithData = await sharedWithResponse.json();
            const sharedTrips = sharedWithData.shared_trips || [];
            for (const trip of sharedTrips) {
              if (trip.trip_id === savedTripId || trip.id === savedTripId) {
                if (trip.owner_id && trip.owner_id !== user.id) {
                  collaboratorIds.add(trip.owner_id);
                }
              }
            }
          }
          
          // Get trips shared by the user
          const sharedByResponse = await fetch(`http://localhost:8000/trips/shared-by?user_id=${user.id}`);
          if (sharedByResponse.ok) {
            const sharedByData = await sharedByResponse.json();
            const sharedByTrips = sharedByData.shared_trips || [];
            for (const trip of sharedByTrips) {
              if (trip.trip_id === savedTripId || trip.id === savedTripId) {
                if (trip.shared_with_id) {
                  collaboratorIds.add(trip.shared_with_id);
                }
              }
            }
          }
        } catch (err) {
          console.warn("Error getting shared trips:", err);
        }
      }
      
      console.log(`Found ${collaboratorIds.size} collaborator(s):`, Array.from(collaboratorIds));
      
      // Get user's registration preferences
      let combinedPreferences: string[] = [];
      let combinedLikes: string[] = [];
      let combinedDislikes: string[] = [];
      let combinedDietary: string[] = [];
      
      try {
        const userPrefsResponse = await fetch(`http://localhost:8000/user/preferences?user_id=${user.id}`);
        if (userPrefsResponse.ok) {
          const userPrefsData = await userPrefsResponse.json();
          // Get registration preferences from user_preferences table
          const userRegPrefsResponse = await supabase
            .from("user_preferences")
            .select("preferences, likes, dislikes, dietary_restrictions")
            .eq("user_id", user.id)
            .single();
          
          if (userRegPrefsResponse.data) {
            combinedPreferences = userRegPrefsResponse.data.preferences || [];
            combinedLikes = userRegPrefsResponse.data.likes || [];
            combinedDislikes = userRegPrefsResponse.data.dislikes || [];
            combinedDietary = userRegPrefsResponse.data.dietary_restrictions || [];
          }
        }
      } catch (err) {
        console.warn("Error getting user preferences:", err);
      }
      
      // Get all collaborators' preferences and combine them
      for (const collabId of Array.from(collaboratorIds)) {
        try {
          const collabRegPrefsResponse = await supabase
            .from("user_preferences")
            .select("preferences, likes, dislikes, dietary_restrictions")
            .eq("user_id", collabId)
            .single();
          
          if (collabRegPrefsResponse.data) {
            const collabPrefs = collabRegPrefsResponse.data.preferences || [];
            const collabLikes = collabRegPrefsResponse.data.likes || [];
            const collabDislikes = collabRegPrefsResponse.data.dislikes || [];
            const collabDietary = collabRegPrefsResponse.data.dietary_restrictions || [];
            
            // Combine preferences (union, no duplicates)
            combinedPreferences = Array.from(new Set([...combinedPreferences, ...collabPrefs]));
            combinedLikes = Array.from(new Set([...combinedLikes, ...collabLikes]));
            combinedDislikes = Array.from(new Set([...combinedDislikes, ...collabDislikes]));
            combinedDietary = Array.from(new Set([...combinedDietary, ...collabDietary]));
            
            console.log(`Combined preferences from collaborator ${collabId}`);
          }
        } catch (err) {
          console.warn(`Error getting collaborator ${collabId} preferences:`, err);
        }
      }
      
      console.log("Combined preferences:", {
        preferences: combinedPreferences,
        likes: combinedLikes,
        dislikes: combinedDislikes,
        dietary_restrictions: combinedDietary,
      });
      
      // Regenerate itinerary with combined preferences
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout
      
      const response = await fetch("http://localhost:8000/generate_itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination: itinerary.destination,
          origin: (itinerary as any).origin || undefined,
          start_date: itinerary.start_date || undefined,
          end_date: itinerary.end_date || undefined,
          num_days: itinerary.num_days,
          budget: itinerary.budget,
          preferences: combinedPreferences,
          likes: combinedLikes,
          dislikes: combinedDislikes,
          dietary_restrictions: combinedDietary,
          mode: itinerary.mode || "balanced",
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Failed to regenerate itinerary" }));
        throw new Error(errorData.detail || "Failed to regenerate itinerary");
      }
      
      const newItinerary = await response.json();
      
      // Update itinerary with new data, preserving collaborator info
      const updatedItinerary = {
        ...newItinerary,
        collaborator_id: collaboratorId || (itinerary as any)?.collaborator_id,
        trip_id: savedTripId || (itinerary as any)?.trip_id || (itinerary as any)?.id,
      };
      
      // Update sessionStorage
      sessionStorage.setItem("itinerary", JSON.stringify(updatedItinerary));
      
      // Update state
      setItinerary(updatedItinerary as ItineraryResponse);
      setCurrentDayIndex(0);
      
      // Reload friends list
      await loadFriends(user.id);
      
      alert("Itinerary regenerated successfully with all collaborators' preferences!");
    } catch (err: any) {
      console.error("Error regenerating itinerary:", err);
      if (err.name === 'AbortError') {
        alert("Request timed out. The itinerary regeneration is taking longer than expected. Please try again.");
      } else {
        alert(`Error regenerating itinerary: ${err.message}`);
      }
    } finally {
      setCheckingPreferences(false);
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
    setSelectedHotelId(null);
    setConfirmedHotelId(null);
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
      // Ensure user_id is a string for consistency
      const userId = String(user.id).trim();
      
      console.log("Saving trip with user_id:", userId, "type:", typeof user.id, "raw:", user.id);
      
      let data: any;
      let error: any;
      
      // If trip already has an ID, update it instead of inserting
      if (savedTripId) {
        console.log("Updating existing trip:", savedTripId);
        const result = await supabase
          .from("saved_trips")
          .update({
            trip_name: tripName.trim(),
            destination: itinerary.destination,
            start_date: itinerary.start_date || null,
            end_date: itinerary.end_date || null,
            num_days: itinerary.num_days,
            budget: itinerary.budget,
            mode: itinerary.mode,
            itinerary_data: itinerary,
          })
          .eq("id", savedTripId)
          .eq("user_id", userId) // Ensure user owns the trip
          .select();
        
        // Check if update found any rows
        if (result.error) {
          error = result.error;
        } else if (!result.data || result.data.length === 0) {
          // Trip not found or doesn't belong to user - treat as new trip
          console.log("Trip not found or doesn't belong to user, creating new trip");
          const insertResult = await supabase
            .from("saved_trips")
            .insert({
              user_id: userId,
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
          
          data = insertResult.data;
          error = insertResult.error;
        } else {
          // Update successful
          data = result.data[0];
          error = null;
        }
      } else {
        // New trip - insert
        console.log("Creating new trip");
        const result = await supabase
          .from("saved_trips")
          .insert({
            user_id: userId,
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
        
        data = result.data;
        error = result.error;
      }

      if (error) throw error;

      console.log("Trip saved successfully:", {
        trip_id: data?.id,
        saved_user_id: data?.user_id,
        current_user_id: userId,
        match: String(data?.user_id) === userId,
        was_update: !!savedTripId,
      });

      setSaved(true);
      const newTripId = data?.id || savedTripId;
      setSavedTripId(newTripId);
      
      // Store trip ID in sessionStorage so it persists
      if (newTripId) {
        sessionStorage.setItem("savedTripId", newTripId);
      }
      
      setShowSaveModal(false);
      // Load trip status after saving
      if (newTripId) {
        loadTripStatus(newTripId);
      }
      // Don't reset saved state - keep it saved permanently after clicking save
    } catch (err: any) {
      alert(`Failed to save trip: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleUnsaveTrip = async () => {
    if (!user || !savedTripId) {
      return;
    }

    const confirmUnsave = window.confirm("Remove this trip from your saved plans?");
    if (!confirmUnsave) return;

    try {
      const { error } = await supabase
        .from("saved_trips")
        .delete()
        .eq("id", savedTripId)
        .eq("user_id", user.id);

      if (error) throw error;

      setSaved(false);
      setSavedTripId(null);
      sessionStorage.removeItem("savedTripId");
      alert("Trip removed from saved plans.");
    } catch (err: any) {
      alert(`Failed to remove trip: ${err.message}`);
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

    const normalizedDestination = normalizePlaceName(itinerary.destination);

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
      if (!card.image) return;
      const key = normalizePlaceName(card.name);
      if (!key || seen.has(key)) return;
      seen.add(key);
      if (!card.id) {
        card.id = `${key}-${cards.length}`;
      }
      cards.push(card);
    };

    const combinedHotels: LodgingOption[] = normalizedDestination.includes("tokyo")
      ? ((tokyoHotels as unknown as LodgingOption[]) || []).map((hotel, idx) => {
          const image = (hotel as any).image as string | undefined;
          const nightlyRateOverride = (hotel as any).nightlyRate as number | undefined;
          const reviewCountOverride = (hotel as any).reviewCount as number | undefined;
          return {
            id: hotel.id ?? `tokyo-hotel-${idx}`,
            currency: hotel.currency ?? "USD",
            photo_urls:
              hotel.photo_urls && hotel.photo_urls.length > 0
                ? hotel.photo_urls
                : image
                  ? [image]
                  : [],
            nightly_rate: hotel.nightly_rate ?? nightlyRateOverride,
            user_ratings_total: hotel.user_ratings_total ?? reviewCountOverride,
            ...hotel,
          };
        })
      : itinerary.hotels ?? [];

    combinedHotels.forEach((hotel) => {
      if (!hotel.name) return;
      const poi = findPoiForHotel(hotel.name);
      const image =
        hotel.photo_urls && hotel.photo_urls.length > 0
          ? hotel.photo_urls[0]
          : poi?.photo_urls && poi.photo_urls.length > 0
            ? poi.photo_urls[0]
            : undefined;
      const hasAddress =
        hotel.address && hotel.address.trim().length > 0 && hotel.address.toLowerCase() !== "address not available";
      const address = hasAddress
        ? hotel.address
        : poi?.description && poi.description.trim().length > 0
          ? poi.description
          : poi?.latitude !== undefined && poi.longitude !== undefined
            ? `${poi.latitude?.toFixed(3)}, ${poi.longitude?.toFixed(3)}`
            : undefined;
      const description =
        hotel.description && hotel.description.trim().length > 0
          ? hotel.description
          : poi?.description;
      const rating =
        typeof hotel.rating === "number" && !Number.isNaN(hotel.rating)
          ? hotel.rating
          : typeof poi?.rating === "number"
            ? poi.rating
            : undefined;
      const reviewCount =
        typeof hotel.user_ratings_total === "number"
          ? hotel.user_ratings_total
          : poi?.user_ratings_total ?? (poi?.reviews ? poi.reviews.length : undefined);
      const latitude =
        typeof hotel.latitude === "number" ? hotel.latitude : poi?.latitude;
      const longitude =
        typeof hotel.longitude === "number" ? hotel.longitude : poi?.longitude;
      const reviews =
        hotel.reviews && hotel.reviews.length > 0
          ? hotel.reviews
          : poi?.reviews;
      pushCard({
        id: hotel.id ?? `${normalizePlaceName(hotel.name)}-${cards.length}`,
        name: hotel.name,
        image,
        address,
        description,
        nightlyRate: hotel.nightly_rate,
        currency: hotel.currency ?? "USD",
        rating,
        reviewCount,
        latitude,
        longitude,
        sustainabilityScore: hotel.sustainability_score ?? undefined,
        emissionsKg: hotel.emissions_kg ?? undefined,
        bookingUrl: hotel.booking_url ?? undefined,
        reviews,
        source: "lodging",
      });
    });

    if (cards.length < 6) {
      const keywords = ["hotel", "lodging", "hostel", "resort", "stay", "guesthouse", "bnb"];
      const isHotelLike = (poi: PointOfInterest) => {
        const haystack = `${poi.category ?? ""} ${poi.description ?? ""}`.toLowerCase();
        return keywords.some((keyword) => haystack.includes(keyword));
      };

      attractionList.forEach((poi, idx) => {
        if (!poi.name || !isHotelLike(poi)) return;
        pushCard({
          id: `${normalizePlaceName(poi.name)}-${idx}`,
          name: poi.name,
          image:
            poi.photo_urls && poi.photo_urls.length > 0
              ? poi.photo_urls[0]
              : undefined,
          address:
            poi.description && poi.description.trim().length > 0
              ? poi.description
              : poi.latitude !== undefined && poi.longitude !== undefined
                ? `${poi.latitude.toFixed(3)}, ${poi.longitude.toFixed(3)}`
                : undefined,
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
          reviews: poi.reviews,
        });
      });
    }

    return cards.slice(0, 6);
  }, [itinerary]);

  // Get non-selected preference categories for "Explore More Options"
  const exploreMoreOptions = useMemo(() => {
    if (!itinerary || !itinerary.attractions || !itinerary.days || !itinerary.day_attractions) return [];
    // Get the current day number safely
    const currentDayNumber = itinerary.days[currentDayIndex]?.day;
    if (currentDayNumber === undefined) return itinerary.attractions.slice(0, 6);
    // Get names of planned POIs for the current day
    const plannedNames = new Set<string>();
    const bundle = itinerary.day_attractions.find((b) => b.day === currentDayNumber);
    if (bundle) {
      [bundle.morning, bundle.afternoon, bundle.evening].forEach((poi) => {
        if (poi && poi.name) plannedNames.add(normalizePlaceName(poi.name));
      });
    }
    // Filter out planned POIs
    const unplanned = itinerary.attractions.filter(
      (poi) => poi.name && !plannedNames.has(normalizePlaceName(poi.name))
    );
    return unplanned.slice(0, 6);
  }, [itinerary, currentDayIndex]);

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
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    });
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
      if (flightSort === "priceAsc") {
        return a.lowestPrice - b.lowestPrice;
      }
      return b.lowestPrice - a.lowestPrice;
    });
    return clone;
  }, [groupedFlights, flightSort]);

  const flightsToRender = sortedFlightGroups;

  const expandedFlight = useMemo(() => {
    if (!expandedFlightId) return null;
    return sortedFlightGroups.find((flight) => flight.groupId === expandedFlightId) ?? null;
  }, [expandedFlightId, sortedFlightGroups]);

  const expandedFlightMaxEmission = useMemo(() => {
    if (!expandedFlight) return 0;
    return (
      expandedFlight.cabins.reduce((max, cabin) => {
        if (cabin.emissionsKg === undefined || cabin.emissionsKg === null) return max;
        return Math.max(max, cabin.emissionsKg);
      }, 0) || 0
    );
  }, [expandedFlight]);

  useEffect(() => {
    if (!expandedFlight || expandedFlight.cabins.length === 0) return;
    setSelectedCabinId((prev) => {
      if (prev && expandedFlight.cabins.some((cabin) => cabin.id === prev)) {
        return prev;
      }
      return expandedFlight.cabins[0].id;
    });
  }, [expandedFlight]);

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

  const hotelById = useMemo(() => {
    const map = new Map<string, HotelCard>();
    hotelOptions.forEach((hotel) => {
      if (hotel.id) {
        map.set(hotel.id, hotel);
      }
    });
    return map;
  }, [hotelOptions]);

  const selectedHotel = useMemo(() => {
    if (!selectedHotelId) return null;
    return hotelById.get(selectedHotelId) ?? null;
  }, [selectedHotelId, hotelById]);

  const confirmedHotel = useMemo(() => {
    if (!confirmedHotelId) return null;
    return hotelById.get(confirmedHotelId) ?? null;
  }, [confirmedHotelId, hotelById]);

  const tripNights = useMemo(() => {
    const startStr = itinerary?.start_date;
    const endStr = itinerary?.end_date;
    if (startStr && endStr) {
      const start = new Date(startStr);
      const end = new Date(endStr);
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
        const diffMs = end.getTime() - start.getTime();
        const nights = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
        return nights;
      }
    }
    const numDays = itinerary?.num_days ?? 1;
    return Math.max(1, numDays > 0 ? numDays - 1 : 1);
  }, [itinerary?.start_date, itinerary?.end_date, itinerary?.num_days]);

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
  const confirmedFlightCost = hasConfirmedFlight ? confirmedCabinData!.cabin.price ?? 0 : null;
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

  const hasConfirmedHotel = Boolean(confirmedHotel && typeof confirmedHotel.nightlyRate === "number");
  const confirmedHotelCost =
    hasConfirmedHotel && confirmedHotel?.nightlyRate !== undefined && confirmedHotel?.nightlyRate !== null
      ? confirmedHotel.nightlyRate * tripNights
      : null;

  const combinedSpend =
    (hasConfirmedFlight || hasConfirmedHotel)
      ? (confirmedFlightCost ?? 0) + (confirmedHotelCost ?? 0)
      : null;

  return (
    <>
      <Head>
        <title>Itinerary | GreenTrip</title>
        <meta name="description" content="View your personalized travel itinerary" />
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-emerald-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/70 backdrop-blur-lg">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 md:px-12">
          <button
            onClick={() => router.push("/")}
            className="text-2xl font-semibold text-gray-900 transition hover:text-gray-700"
          >
            GreenTrip
          </button>
          <div className="flex items-center gap-3">
            {user && (
              <>
                <Link
                  href="/friends"
                  className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50"
                >
                  Leaderboard
                </Link>
                <Link
                  href="/dashboard"
                  className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50"
                >
                  Profile
                </Link>
                <button
                  onClick={regenerateItinerary}
                  disabled={checkingPreferences}
                  className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Regenerate itinerary with all collaborators' preferences"
                >
                  {checkingPreferences ? "🔄 Regenerating..." : "🔄 Refresh"}
                </button>
                {savedTripId && (
                  <>
                    {/* Trip Status Progress Tags */}
                    <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-white/60 px-3 py-1.5">
                      {tripStatus === "draft" ? (
                        <span className="text-xs font-medium text-gray-500">📝 Draft</span>
                      ) : (
                        <>
                          <span className={`text-xs font-medium ${tripStatus === "before" ? "text-emerald-700" : "text-emerald-500"}`}>
                            {tripStatus === "before" ? "●" : "✓"} Before
                          </span>
                          <span className="text-emerald-300">|</span>
                          <span className={`text-xs font-medium ${tripStatus === "during" ? "text-emerald-700" : tripStatus === "after" ? "text-emerald-500" : "text-gray-400"}`}>
                            {tripStatus === "during" ? "●" : tripStatus === "after" ? "✓" : "○"} During
                          </span>
                          <span className="text-emerald-300">|</span>
                          <span className={`text-xs font-medium ${tripStatus === "after" ? "text-emerald-700" : "text-gray-400"}`}>
                            {tripStatus === "after" ? "●" : "○"} After
                          </span>
                        </>
                      )}
                    </div>

                    {/* Trip Status Dropdown */}
                    <div className="relative">
                      <button
                        onClick={() => setShowStatusMenu(!showStatusMenu)}
                        disabled={updatingStatus}
                        className={`rounded-full px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                          tripStatus === "after"
                            ? "bg-emerald-600 text-white"
                            : tripStatus === "draft"
                            ? "border border-gray-300 bg-white/60 text-gray-600 hover:border-emerald-300 hover:text-emerald-700"
                            : "border border-emerald-200 bg-white/60 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50"
                        }`}
                        title="Change trip status"
                      >
                        {updatingStatus
                          ? "Updating..."
                          : tripStatus === "draft"
                          ? "📝 Draft ▼"
                          : tripStatus === "before"
                          ? "✈️ Before ▼"
                          : tripStatus === "during"
                          ? "✈️ During ▼"
                          : "✓ After ▼"}
                      </button>

                      {showStatusMenu && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setShowStatusMenu(false)}
                          />
                          <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-lg border border-emerald-200 bg-white shadow-lg">
                            <div className="py-1">
                              <button
                                onClick={() => {
                                  handleUpdateTripStatus("draft");
                                  setShowStatusMenu(false);
                                }}
                                disabled={updatingStatus}
                                className={`w-full px-4 py-2 text-left text-sm transition hover:bg-emerald-50 disabled:opacity-50 ${
                                  tripStatus === "draft" ? "bg-emerald-50 text-emerald-700 font-medium" : "text-gray-700"
                                }`}
                              >
                                📝 Draft {tripStatus === "draft" && "●"}
                              </button>
                              <button
                                onClick={() => {
                                  handleUpdateTripStatus("before");
                                  setShowStatusMenu(false);
                                }}
                                disabled={updatingStatus}
                                className={`w-full px-4 py-2 text-left text-sm transition hover:bg-emerald-50 disabled:opacity-50 ${
                                  tripStatus === "before" ? "bg-emerald-50 text-emerald-700 font-medium" : "text-gray-700"
                                }`}
                              >
                                ✈️ Before {tripStatus === "before" && "●"}
                              </button>
                              <button
                                onClick={() => {
                                  handleUpdateTripStatus("during");
                                  setShowStatusMenu(false);
                                }}
                                disabled={updatingStatus || !confirmedCabinId}
                                className={`w-full px-4 py-2 text-left text-sm transition hover:bg-emerald-50 disabled:opacity-50 ${
                                  tripStatus === "during" ? "bg-emerald-50 text-emerald-700 font-medium" : "text-gray-700"
                                }`}
                                title={!confirmedCabinId ? "Please select a flight option first" : ""}
                              >
                                ✈️ During {tripStatus === "during" && "●"} {!confirmedCabinId && "(requires flight)"}
                              </button>
                              <button
                                onClick={() => {
                                  handleUpdateTripStatus("after");
                                  setShowStatusMenu(false);
                                }}
                                disabled={updatingStatus || !confirmedCabinId}
                                className={`w-full px-4 py-2 text-left text-sm transition hover:bg-emerald-50 disabled:opacity-50 ${
                                  tripStatus === "after" ? "bg-emerald-50 text-emerald-700 font-medium" : "text-gray-700"
                                }`}
                                title={!confirmedCabinId ? "Please select a flight option first" : ""}
                              >
                                ✓ After {tripStatus === "after" && "●"} {!confirmedCabinId && "(requires flight)"}
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    <button
                      onClick={async () => {
                        console.log("=== SHARE BUTTON CLICKED ===");
                        console.log("Current user:", user?.id);
                        console.log("Current friends count before reload:", friends.length);
                        if (user) {
                          console.log("Reloading friends for user:", user.id);
                          await loadFriends(user.id);
                          setTimeout(() => {
                            console.log("Opening share modal, current friends count after reload:", friends.length);
                            setShowShareModal(true);
                          }, 200);
                        } else {
                          console.warn("No user found when clicking share button");
                          setShowShareModal(true);
                        }
                      }}
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
                  </>
                )}
                {saved ? (
                  <button
                    onClick={handleUnsaveTrip}
                    disabled={saving}
                    className="rounded-full px-4 py-2 text-sm font-medium transition bg-emerald-500 text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? "Removing…" : "Saved ✓"}
                  </button>
                ) : (
                  <button
                    onClick={handleSaveTrip}
                    disabled={saving}
                    className="rounded-full px-4 py-2 text-sm font-medium transition border border-emerald-200 bg-white/60 text-emerald-700 hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-12 md:px-12">
        {/* Page Header */}
        <section className="mb-10">
          <p className="text-sm font-medium text-gray-500">Trip Overview</p>
          <h1 className="mt-1 text-4xl font-semibold text-gray-900 md:text-5xl">
            {itinerary.destination}
          </h1>
        </section>

        {/* Summary Row */}
        <section className="mb-10 flex flex-wrap items-center gap-x-12 gap-y-6 text-sm text-gray-700">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-500">Total Spend</span>
            <span className="text-xl font-semibold text-gray-900">
              {combinedSpend !== null ? currency.format(combinedSpend) : "--"}
            </span>
            <div className="text-xs text-gray-500">
              <p>Budget: {currency.format(itinerary.budget)}</p>
              {hasConfirmedFlight && confirmedFlightCost !== null && (
                <p>Flight: {currency.format(confirmedFlightCost)}</p>
              )}
              {hasConfirmedHotel && confirmedHotelCost !== null && (
                <p>Hotel: {currency.format(confirmedHotelCost)}</p>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-500">Estimated CO₂</span>
            <span className="text-xl font-semibold text-gray-900">
              {hasConfirmedFlight && confirmedEmissions !== null ? `${confirmedEmissions.toFixed(1)} kg` : "--"}
            </span>
            <span className="text-xs text-gray-500">+ eco points</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-500">Duration</span>
            <span className="text-xl font-semibold text-gray-900">{itinerary.num_days} days</span>
            <span className="text-xs text-gray-500">
              {itinerary.start_date && itinerary.end_date
                ? `${formatDate(itinerary.start_date)} – ${formatDate(itinerary.end_date)}`
                : "Dates TBD"}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-500">Carbon Credits</span>
            <span className="text-xl font-semibold text-emerald-700">
              {confirmedCarbonCredits !== null ? `+${confirmedCarbonCredits.toFixed(1)}` : "--"}
            </span>
            <span className="text-xs text-gray-500">Saved vs highest-impact cabin</span>
          </div>
        </section>

        {confirmedCabinData && (
          <div className="mx-auto mb-16 max-w-3xl rounded-2xl border border-gray-200 bg-white p-6 shadow-md">
            <div className="flex flex-wrap items-start justify-between gap-6 border-b border-gray-200 pb-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Selected Flight</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {confirmedCabinData.group.origin} → {confirmedCabinData.group.destination}
                </p>
                <p className="text-sm font-medium text-gray-800">
                  {formatDateTime(confirmedCabinData.group.departure)} —{" "}
                  {formatDateTime(confirmedCabinData.group.arrival)} ·{" "}
                  {formatDurationLabel(confirmedCabinData.group.departure, confirmedCabinData.group.arrival)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Cabin</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {formatCabinLabel(confirmedCabinData.cabin.cabin)}
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Flight Cost</p>
                <p className="mt-2 text-lg font-semibold text-gray-900">
                  {currency.format(confirmedCabinData.cabin.price)}
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Flight Emissions</p>
                <p className="mt-2 text-lg font-semibold text-gray-900">
                  {confirmedCabinData.cabin.emissionsKg !== undefined && confirmedCabinData.cabin.emissionsKg !== null
                    ? `${confirmedCabinData.cabin.emissionsKg.toFixed(1)} kg`
                    : "N/A"}
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Carbon Credits</p>
                <p className="mt-2 text-lg font-semibold text-emerald-700">
                  {confirmedCarbonCredits !== null ? `+${confirmedCarbonCredits.toFixed(1)}` : "--"}
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
                className="rounded-md border border-gray-300 px-5 py-2 text-sm font-semibold text-gray-700 transition hover:border-gray-400 hover:text-gray-900"
              >
                Remove flight
              </button>
            </div>
          </div>
        )}

        {/* Flight Options */}
        <section className="flight-section mb-20">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-[#0b3d2e]">Flight Options</h2>
          </div>

          <div className="relative md:flex md:items-start md:gap-6">
            {sortedFlightGroups.length > 3 && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    const container = e.currentTarget.parentElement?.querySelector<HTMLDivElement>(".flight-scroll");
                    container?.scrollBy({ left: -320, behavior: "smooth" });
                  }}
                  className="absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow-md transition hover:bg-white"
                  aria-label="Scroll flights left"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    const container = e.currentTarget.parentElement?.querySelector<HTMLDivElement>(".flight-scroll");
                    container?.scrollBy({ left: 320, behavior: "smooth" });
                  }}
                  className="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow-md transition hover:bg-white"
                  aria-label="Scroll flights right"
                >
                  ›
                </button>
              </>
            )}

            <div className="flight-scroll flex gap-4 overflow-x-auto pb-4 pr-8 scroll-smooth">
              {sortedFlightGroups.length > 0 ? (
                flightsToRender.map((flight) => {
        const isExpanded = expandedFlightId === flight.groupId;
        const isHidden = Boolean(expandedFlightId && expandedFlightId !== flight.groupId);
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
                    className={`flight-card flex flex-shrink-0 flex-col overflow-hidden rounded-xl border border-emerald-100 bg-white shadow-md transition-all duration-300 ${
                      isExpanded
                        ? "ring-2 ring-emerald-200 shadow-lg"
                        : expandedFlightId && !isExpanded
                          ? "pointer-events-none -translate-x-4 scale-95 opacity-0"
                          : "hover:shadow-lg"
                    } ${isExpanded ? "p-6" : expandedFlightId && !isExpanded ? "p-0" : "p-6"}`}
                    style={{
                      width:
                        expandedFlightId && !isExpanded
                          ? 0
                          : 320,
                    }}
                  >
            <button
              onClick={() => setExpandedFlightId(isExpanded ? null : flight.groupId)}
              className="w-full text-left"
            >
              <div className="flex items-start justify-between gap-6">
                <div className="space-y-2">
                  <p className="text-lg font-semibold text-gray-900">
                    {flight.origin} → {flight.destination}
                  </p>
                  <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                    <span>
                      {flight.cabins.length} cabin{flight.cabins.length > 1 ? "s" : ""}
                    </span>
                    <span className="text-gray-400">•</span>
                    <span>Operated by {flight.carrier}</span>
                  </div>
                  <p className="text-sm text-gray-900">
                    {formatDateTime(flight.departure)} — {formatDateTime(flight.arrival)} · {durationText}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-[0.2em] text-emerald-500">From</p>
                  <p className="text-xl font-semibold text-gray-900">
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: flight.cabins[0]?.currency ?? "USD",
                    }).format(flight.lowestPrice)}
                  </p>
                  {flight.lowestEmissions !== undefined && flight.lowestEmissions !== null && (
                    <p className="text-xs text-gray-700">
                      {flight.lowestEmissions.toFixed(1)} kg CO₂ (best cabin)
                    </p>
                  )}
                </div>
              </div>
            </button>
                  </div>
        );
      })
    ) : (
              <div className="rounded-2xl border border-white/10 bg-white/60 p-6 text-sm text-emerald-600/80 backdrop-blur-xl">
        Flight details coming soon
      </div>
    )}
            </div>

            {expandedFlight && (
              <div className="mt-6 w-full max-w-md shrink-0 rounded-2xl border border-emerald-100 bg-white p-5 shadow-md md:mt-0">
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
                  Choose your cabin
                </h4>
                <div className="flex flex-col gap-3">
                  {expandedFlight.cabins.map((cabin) => {
                    const carbonCredits =
                      cabin.emissionsKg !== undefined && cabin.emissionsKg !== null
                        ? Math.max(0, expandedFlightMaxEmission - cabin.emissionsKg)
                        : null;
                    const isSelected = selectedCabinId === cabin.id;
                    const showCredits =
                      cabin.cabin.toLowerCase() !== "first" &&
                      carbonCredits !== null &&
                      carbonCredits > 0.05;
                    const cabinLower = cabin.cabin.toLowerCase();
                    const usesGreenTriangle =
                      cabinLower === "economy" || cabinLower === "premium economy";
                    const triangle = usesGreenTriangle ? "▲" : "▼";
                    const triangleClass = usesGreenTriangle ? "text-emerald-600" : "text-red-500";
                    return (
                      <button
                        key={cabin.id}
                        type="button"
                        onClick={() => setSelectedCabinId(cabin.id)}
                        className={`flex w-full items-center gap-3 rounded-lg border px-4 py-2.5 text-left text-sm shadow-sm transition ${
                          isSelected
                            ? "border-gray-400 bg-gray-100 ring-2 ring-gray-200"
                            : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex flex-1 flex-col gap-1">
                          <p className="text-sm font-semibold text-gray-900">
                            {formatCabinLabel(cabin.cabin)}
                          </p>
                          <p className="flex items-center gap-1 text-xs text-gray-700">
                            {cabin.emissionsKg !== undefined && cabin.emissionsKg !== null ? (
                              <>
                                <span className={`${triangleClass} text-[10px] leading-none`}>{triangle}</span>
                                {`${cabin.emissionsKg.toFixed(1)} kg CO₂`}
                              </>
                            ) : (
                              "Emission estimate unavailable"
                            )}
                          </p>
                        </div>
                        <div className="flex flex-1 justify-center">
                          {showCredits ? (
                            <span className="text-sm font-semibold text-emerald-700">
                              +{carbonCredits!.toFixed(1)} credits
                            </span>
                          ) : (
                            <span className="text-xs text-gray-500">No credits</span>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-gray-900">
                            {new Intl.NumberFormat("en-US", {
                              style: "currency",
                              currency: cabin.currency ?? "USD",
                            }).format(cabin.price)}
                          </p>
                          {isSelected && (
                            <span className="text-[11px] font-medium text-emerald-600">Selected</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {(() => {
                  const selectionInGroup = expandedFlight.cabins.some((cabin) => cabin.id === selectedCabinId);
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
        </section>

        {/* Accommodations */}
        <section className="accommodation-section mb-12">
          <h2 className="mb-6 text-2xl font-bold text-[#0b3d2e]">Where You'll Stay</h2>
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
            {hotelOptions.length > 0 ? (
              hotelOptions.map((hotel, idx) => {
                const normalizedKey = normalizePlaceName(hotel.name);
                const hotelId = hotel.id ?? `${normalizedKey || "hotel"}-${idx}`;
                if (!hotel.id) {
                  hotel.id = hotelId;
                }
                const isSelectedHotel = selectedHotelId === hotelId;
                const isConfirmedHotel = confirmedHotelId === hotelId;
                return (
                  <div
                    key={hotelId}
                    onClick={() => setSelectedHotelId(hotelId)}
                    className={`accommodation-card flex-shrink-0 w-80 cursor-pointer overflow-hidden rounded-2xl border bg-white/60 backdrop-blur-xl shadow-sm transition-all hover:scale-[1.03] hover:shadow-xl ${
                      isConfirmedHotel
                        ? "border-emerald-400 ring-2 ring-emerald-200"
                        : isSelectedHotel
                          ? "border-emerald-200"
                          : "border-white/10"
                    }`}
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
                    {(() => {
                      const rawAddress = hotel.address?.trim();
                      const displayAddress =
                        rawAddress && rawAddress.length > 0 && rawAddress.toLowerCase() !== "address not available"
                          ? rawAddress
                          : undefined;
                      const addressText = displayAddress ?? "Address not available";
                      const trimmedDescription = hotel.description?.trim();
                      const displayDescription =
                        trimmedDescription && trimmedDescription.length > 0 && trimmedDescription !== displayAddress
                          ? trimmedDescription
                          : undefined;
                      const stateKey = normalizedHotelKey(hotel.name);
                      const reviewCount = hotel.reviews?.length ?? 0;
                      const reviewState = hotelReviewStates[stateKey] ?? { open: false, index: 0 };
                      const currentReview =
                        reviewCount > 0 ? hotel.reviews![reviewState.index % reviewCount] : null;

                      return (
                        <>
                          <p className="text-sm text-emerald-700/80">{addressText}</p>
                          {displayDescription && (
                            <p className="text-sm text-emerald-800/80 leading-relaxed line-clamp-4">
                              {displayDescription}
                            </p>
                          )}
                          {reviewCount > 0 && (
                            <div className="space-y-2 text-xs text-emerald-800/80">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleHotelReviews(hotel.name, reviewCount);
                                }}
                                className="rounded-full border border-emerald-200 px-3 py-1 text-emerald-700 transition hover:border-emerald-300 hover:text-emerald-800"
                              >
                                {reviewState.open ? "Hide reviews" : "Show reviews"}
                              </button>
                              {reviewState.open && currentReview && (
                                <div className="rounded-xl border border-emerald-50 bg-emerald-50/60 p-3">
                                  <div className="mb-1 flex items-center justify-between font-semibold text-emerald-700">
                                    <span>{currentReview.author || "Traveler"}</span>
                                    {typeof currentReview.rating === "number" && (
                                      <span className="text-emerald-600">
                                        {currentReview.rating.toFixed(1)}★
                                      </span>
                                    )}
                                  </div>
                                  {currentReview.text && (
                                    <p className="text-[13px] leading-relaxed text-emerald-700">
                                      {currentReview.text}
                                    </p>
                                  )}
                                  {currentReview.relative_time_description && (
                                    <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-emerald-500">
                                      {currentReview.relative_time_description}
                                    </p>
                                  )}
                                  <div className="mt-3 flex items-center justify-between text-[11px] font-medium text-emerald-600">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        cycleHotelReview(hotel.name, reviewCount, -1);
                                      }}
                                      className="rounded-full border border-emerald-200 px-2 py-1 transition hover:border-emerald-300"
                                    >
                                      ‹ Prev
                                    </button>
                                    <span>
                                      Review {reviewState.index + 1}/{reviewCount}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        cycleHotelReview(hotel.name, reviewCount, 1);
                                      }}
                                      className="rounded-full border border-emerald-200 px-2 py-1 transition hover:border-emerald-300"
                                    >
                                      Next ›
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      );
                    })()}
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
                          onClick={(e) => e.stopPropagation()}
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
                          onClick={(e) => e.stopPropagation()}
                          className="rounded-full border border-emerald-200 px-3 py-1 text-emerald-700 transition hover:border-emerald-300"
                        >
                          View offer
                        </Link>
                      )}
                    </div>
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (hotelId) {
                            setSelectedHotelId(hotelId);
                            setConfirmedHotelId(hotelId);
                          }
                        }}
                        className={`w-full rounded-full px-4 py-2 text-sm font-semibold transition ${
                          isConfirmedHotel
                            ? "bg-emerald-600 text-white"
                            : "border border-emerald-200 text-emerald-700 hover:border-emerald-300 hover:text-emerald-800"
                        }`}
                      >
                        {isConfirmedHotel ? "Hotel selected" : "Select hotel"}
                      </button>
                    </div>
                  </div>
                </div>
                );
              })
            ) : (
              <div className="w-80 flex-shrink-0 bg-white/60 backdrop-blur-xl rounded-2xl p-6 border border-white/10 text-sm text-emerald-600/80">
                Hotel recommendations will appear here once available.
              </div>
            )}
          </div>
        </section>

        {/* Interactive Map */}
        <section className="map-section mb-12">
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
                  className="scroll-fade bg-white/60 backdrop-blur-xl rounded-2xl p-6 border border-white/10 shadow-sm flex h-full flex-col"
                >
                  <div className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
                    {slot}
                  </div>
                  <h4 className="mb-2 text-lg font-semibold text-[#0b3d2e]">{poi?.name || extractPlaceNames(text)[0] || `${slot} Activity`}</h4>
                  <p className="mb-4 text-sm text-emerald-800/80 leading-relaxed">{text}</p>
                  <div className="mt-auto flex flex-col gap-3">
                    {poi?.photo_urls && poi.photo_urls[0] && (
                      <img
                        src={poi.photo_urls[0]}
                        alt={poi.name}
                        className="h-48 w-full rounded-xl object-cover"
                      />
                    )}
                    {poi?.rating && (
                      <p className="text-sm text-emerald-600/80">
                        ⭐ {typeof poi.rating === "number" ? poi.rating.toFixed(1) : poi.rating} / 5.0
                      </p>
                    )}
                  </div>
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
                  const stateKey = normalizedExploreKey(attraction.name);
                  const reviewState = exploreReviewStates[stateKey] ?? { open: false, index: 0 };
                  const currentReview =
                    reviewCount > 0 ? attraction.reviews![reviewState.index % reviewCount] : null;

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
                      {reviewCount > 0 && (
                        <div className="space-y-2 text-xs text-emerald-800/80">
                          <button
                            type="button"
                            onClick={() => toggleExploreReviews(attraction.name, reviewCount)}
                            className="rounded-full border border-emerald-200 px-3 py-1 text-emerald-700 transition hover:border-emerald-300 hover:text-emerald-800"
                          >
                            {reviewState.open ? "Hide reviews" : "Show reviews"}
                          </button>
                          {reviewState.open && currentReview && (
                            <div className="rounded-xl border border-emerald-50 bg-emerald-50/60 p-3">
                              <div className="mb-1 flex items-center justify-between font-semibold text-emerald-700">
                                <span>{currentReview.author || "Traveler"}</span>
                                {typeof currentReview.rating === "number" && (
                                  <span className="text-emerald-600">{currentReview.rating.toFixed(1)}★</span>
                                )}
                              </div>
                              {currentReview.text && (
                                <p className="text-[13px] leading-relaxed text-emerald-700">{currentReview.text}</p>
                              )}
                              {currentReview.relative_time_description && (
                                <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-emerald-500">
                                  {currentReview.relative_time_description}
                                </p>
                              )}
                              <div className="mt-3 flex items-center justify-between text-[11px] font-medium text-emerald-600">
                                <button
                                  type="button"
                                  onClick={() => cycleExploreReview(attraction.name, reviewCount, -1)}
                                  className="rounded-full border border-emerald-200 px-2 py-1 transition hover:border-emerald-300"
                                >
                                  ‹ Prev
                                </button>
                                <span>
                                  Review {reviewState.index + 1}/{reviewCount}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => cycleExploreReview(attraction.name, reviewCount, 1)}
                                  className="rounded-full border border-emerald-200 px-2 py-1 transition hover:border-emerald-300"
                                >
                                  Next ›
                                </button>
                              </div>
                            </div>
                          )}
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

            {(() => {
              console.log("=== RENDERING SHARE MODAL ===");
              console.log("loadingFriends:", loadingFriends);
              console.log("friends.length:", friends.length);
              console.log("friends array:", friends);
              return null;
            })()}
            {loadingFriends ? (
              <p className="mb-4 text-sm text-emerald-600 italic">Loading friends...</p>
            ) : friends.length === 0 ? (
              <div className="mb-4">
                <p className="mb-2 text-sm text-emerald-600 italic">
                  You need to have friends to share trips. Go to the Friends page to add friends.
                </p>
                <p className="mb-2 text-xs text-gray-500">
                  Debug: friends.length = {friends.length}, loadingFriends = {loadingFriends ? 'true' : 'false'}
                </p>
                <p className="mb-2 text-xs text-gray-500">
                  User ID: {user?.id || 'none'}
                </p>
                <button
                  onClick={() => {
                    console.log("Refresh button clicked, user:", user);
                    if (user) {
                      console.log("Reloading friends for user:", user.id);
                      loadFriends(user.id);
                    } else {
                      console.warn("No user found when trying to refresh friends");
                    }
                  }}
                  className="rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50"
                >
                  Refresh Friends List
                </button>
              </div>
            ) : (
              <div className="mb-6 max-h-64 space-y-2 overflow-y-auto">
                {friends.map((friend) => {
                  console.log("Rendering friend:", friend);
                  return (
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
                  );
                })}
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
    </>
  );
};