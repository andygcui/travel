import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { supabase } from "../lib/supabase";
import Link from "next/link";
import PreferencesChat from "../components/PreferencesChat";
import EditRegistrationPreferencesModal from "../components/EditRegistrationPreferencesModal";

interface SavedTrip {
  id: string;
  trip_name: string;
  destination: string;
  start_date: string | null;
  end_date: string | null;
  num_days: number | null;
  budget: number;
  mode: string;
  itinerary_data: any;
  created_at: string;
  updated_at: string;
  user_id?: string;
  trip_status?: "draft" | "before" | "during" | "after";
  selected_flight_id?: string | null;
  selected_flight_data?: any;
  carbon_emissions_kg?: number | null;
  carbon_credits?: number | null;
}

interface SharedTrip {
  trip_id: string;
  trip_name: string;
  destination: string;
  start_date: string | null;
  end_date: string | null;
  num_days: number | null;
  budget: number;
  mode: string;
  itinerary_data: any;
  created_at: string;
  updated_at: string;
  owner_id: string;
  owner_username?: string;
  can_edit: boolean;
  share_id: string;
  is_shared?: boolean;
}

// Completed Trips List Component
function CompletedTripsList({ userId }: { userId?: string }) {
  const [completedTrips, setCompletedTrips] = useState<SavedTrip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userId) {
      loadCompleted();
    }
  }, [userId]);

  const loadCompleted = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("saved_trips")
        .select("*, trip_status, selected_flight_id, selected_flight_data, carbon_emissions_kg, carbon_credits")
        .eq("user_id", userId)
        .eq("trip_status", "after")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCompletedTrips(data || []);
    } catch (err: any) {
      console.error("Error loading completed trips:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Not set";
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  if (loading) {
    return <div className="text-center text-emerald-700 py-8">Loading completed trips...</div>;
  }

  if (completedTrips.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-4">✈️</div>
        <p className="text-emerald-700">No completed trips yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {completedTrips.map((trip) => (
        <div
          key={trip.id}
          className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-6 shadow-sm"
        >
          <div className="mb-4">
            <h3 className="text-xl font-semibold text-emerald-900">{trip.trip_name}</h3>
            <p className="text-sm text-emerald-600">{trip.destination}</p>
          </div>

          <div className="mb-4 space-y-2 text-sm text-emerald-700">
            {trip.start_date && trip.end_date && (
              <div className="flex items-center gap-2">
                <span className="text-emerald-500">📅</span>
                <span>
                  {formatDate(trip.start_date)} - {formatDate(trip.end_date)}
                </span>
              </div>
            )}
            {trip.num_days && (
              <div className="flex items-center gap-2">
                <span className="text-emerald-500">⏱️</span>
                <span>{trip.num_days} days</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-emerald-500">💰</span>
              <span>Budget: {formatCurrency(trip.budget)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-emerald-500">🎯</span>
              <span className="capitalize">{trip.mode}</span>
            </div>
            {/* Carbon Data */}
            {(trip.carbon_emissions_kg || trip.carbon_credits) && (
              <div className="mt-3 pt-3 border-t border-emerald-200">
                {trip.carbon_emissions_kg && (
                  <div className="flex items-center gap-2 text-emerald-700">
                    <span>🌍</span>
                    <span>Emissions: {trip.carbon_emissions_kg.toFixed(1)} kg</span>
                  </div>
                )}
                {trip.carbon_credits && (
                  <div className="flex items-center gap-2 text-emerald-700">
                    <span>⭐</span>
                    <span>Credits: {trip.carbon_credits.toFixed(1)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Trip Plan Details */}
          {trip.itinerary_data && (
            <div className="mt-4 pt-4 border-t border-emerald-200">
              <h4 className="text-sm font-semibold text-emerald-900 mb-2">Trip Plan:</h4>
              <div className="bg-white rounded-lg p-4 max-h-64 overflow-y-auto">
                {trip.itinerary_data.days && trip.itinerary_data.days.length > 0 ? (
                  <div className="space-y-4">
                    {trip.itinerary_data.days.map((day: any, idx: number) => (
                      <div key={idx} className="border-b border-emerald-100 pb-3 last:border-b-0">
                        <p className="font-semibold text-emerald-800 mb-2">Day {day.day || idx + 1}</p>
                        {day.morning && (
                          <p className="text-xs text-emerald-700 mb-1">
                            <span className="font-medium">Morning:</span> {day.morning}
                          </p>
                        )}
                        {day.afternoon && (
                          <p className="text-xs text-emerald-700 mb-1">
                            <span className="font-medium">Afternoon:</span> {day.afternoon}
                          </p>
                        )}
                        {day.evening && (
                          <p className="text-xs text-emerald-700">
                            <span className="font-medium">Evening:</span> {day.evening}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-emerald-600 italic">No detailed itinerary available</p>
                )}
              </div>
            </div>
          )}

          <div className="mt-4 text-xs text-gray-400">
            Completed {new Date(trip.updated_at || trip.created_at).toLocaleDateString()}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [trips, setTrips] = useState<SavedTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [profileSummary, setProfileSummary] = useState<string>("");
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [preferences, setPreferences] = useState<any>(null);
  const [loadingPreferences, setLoadingPreferences] = useState(false);
  const [registrationPrefs, setRegistrationPrefs] = useState<any>(null);
  const [loadingRegistrationPrefs, setLoadingRegistrationPrefs] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showPreferencesChat, setShowPreferencesChat] = useState(false);
  const [showEditRegistrationPrefs, setShowEditRegistrationPrefs] = useState(false);
  const [editingPreferences, setEditingPreferences] = useState<string[]>([]);
  const [editingLikes, setEditingLikes] = useState<string[]>([]);
  const [editingDislikes, setEditingDislikes] = useState<string[]>([]);
  const [editingDietary, setEditingDietary] = useState<string[]>([]);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [friends, setFriends] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [sharedTrips, setSharedTrips] = useState<SharedTrip[]>([]);
  const [loadingSharedTrips, setLoadingSharedTrips] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState<SavedTrip | null>(null);
  const [sharingTrip, setSharingTrip] = useState(false);
  const [checkingPreferences, setCheckingPreferences] = useState(false);
  const [carbonStats, setCarbonStats] = useState<{
    trips_count: number;
    total_emissions_kg: number;
    total_credits: number;
  } | null>(null);
  const [loadingCarbonStats, setLoadingCarbonStats] = useState(false);
  const [updatingTripStatus, setUpdatingTripStatus] = useState<string | null>(null);
  const [showCompletedTrips, setShowCompletedTrips] = useState(false);
  const [openStatusMenu, setOpenStatusMenu] = useState<string | null>(null);
  const previousPreferencesRef = useRef<string>("");
  const previousRegistrationPrefsRef = useRef<string>("");
  const previousProfileSummaryRef = useRef<string>("");

  // Load cached profile summary from localStorage on mount
  useEffect(() => {
    if (user?.id) {
      const cachedSummary = localStorage.getItem(`profile_summary_${user.id}`);
      const cachedPrefs = localStorage.getItem(`preferences_${user.id}`);
      const cachedRegPrefs = localStorage.getItem(`registration_preferences_${user.id}`);
      
      if (cachedSummary) {
        previousProfileSummaryRef.current = cachedSummary;
        setProfileSummary(cachedSummary);
      }
      if (cachedPrefs) {
        previousPreferencesRef.current = cachedPrefs;
      }
      if (cachedRegPrefs) {
        previousRegistrationPrefsRef.current = cachedRegPrefs;
      }
    }
  }, [user]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        loadTrips(session.user.id);
        // Load preferences first, then profile (profile will check if preferences changed)
        loadPreferences(session.user.id);
        loadRegistrationPreferences(session.user.id);
        loadProfile(session.user.id);
        loadFriends();
        loadPendingRequests();
        loadSharedTrips(session.user.id);
      } else {
        router.push("/");
      }
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        loadTrips(session.user.id);
        // Load preferences first, then profile (profile will check if preferences changed)
        loadPreferences(session.user.id);
        loadRegistrationPreferences(session.user.id);
        loadProfile(session.user.id);
        loadFriends();
        loadPendingRequests();
        loadSharedTrips(session.user.id);
        loadCarbonStats(session.user.id);
      } else {
        router.push("/");
      }
    });
  }, [router]);

  const loadCarbonStats = async (userId: string) => {
    setLoadingCarbonStats(true);
    try {
      const response = await fetch(`http://localhost:8000/trips/carbon-stats?user_id=${userId}`);
      if (response.ok) {
        const data = await response.json();
        setCarbonStats(data);
      }
    } catch (err) {
      console.error("Error loading carbon stats:", err);
    } finally {
      setLoadingCarbonStats(false);
    }
  };


  const handleUpdateTripStatus = async (tripId: string, newStatus: "draft" | "before" | "during" | "after", trip: SavedTrip) => {
    if (!user) return;

    // For 'during' and 'after', require flight selection
    if (newStatus !== "before" && newStatus !== "draft" && !trip.selected_flight_id) {
      alert("Please select a flight option in the trip details before marking as 'during' or 'after'. Click 'View Trip' to select a flight.");
      return;
    }

    setUpdatingTripStatus(tripId);
    try {
      // If we're updating to 'during' or 'after' and don't have carbon data yet, we need to calculate it
      // But since we don't have the flight data here, we'll just update the status
      // The carbon data should already be stored if a flight was selected in the results page
      const response = await fetch("http://localhost:8000/trips/status", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_id: tripId,
          user_id: user.id,
          status: newStatus,
          selected_flight_id: trip.selected_flight_id || null,
          selected_flight_data: trip.selected_flight_data || null,
          carbon_emissions_kg: trip.carbon_emissions_kg || null,
          carbon_credits: trip.carbon_credits || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Failed to update trip status" }));
        throw new Error(errorData.detail || "Failed to update trip status");
      }

      // Reload trips and stats
      await loadTrips(user.id);
      await loadCarbonStats(user.id);
      
      if (newStatus === "after") {
        alert("Trip completed! Carbon emissions and credits have been recorded.");
      } else if (newStatus === "before" && trip.trip_status === "draft") {
        // Draft moved to Plans - no alert needed, it will automatically appear in Plans section
      }
    } catch (err: any) {
      alert(`Failed to update trip status: ${err.message}`);
    } finally {
      setUpdatingTripStatus(null);
    }
  };

  // Poll for new shared trips every 30 seconds and when page becomes visible
  useEffect(() => {
    if (!user?.id) return;

    const intervalId = setInterval(() => {
      loadSharedTrips(user.id);
    }, 30000); // Check every 30 seconds

    // Reload when window regains focus
    const handleFocus = () => {
      loadSharedTrips(user.id);
    };
    window.addEventListener('focus', handleFocus);

    // Reload when page becomes visible (user switches back to tab)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        loadSharedTrips(user.id);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user?.id]);

  const loadFriends = async () => {
    if (!user) {
      console.warn("loadFriends called without user");
      return;
    }
    setLoadingFriends(true);
    try {
      console.log("Loading friends for user:", user.id);
      const response = await fetch(`http://localhost:8000/friends/list?user_id=${user.id}`);
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
    } catch (err) {
      console.error("Error loading friends:", err);
    } finally {
      setLoadingFriends(false);
      console.log("Finished loading friends");
    }
  };

  const loadPendingRequests = async () => {
    if (!user) return;
    try {
      const response = await fetch(`http://localhost:8000/friends/pending?user_id=${user.id}`);
      if (response.ok) {
        const data = await response.json();
        setPendingRequests(data.pending_requests || []);
      }
    } catch (err) {
      console.error("Error loading pending requests:", err);
    }
  };


  const loadProfile = async (userId: string, forceReload: boolean = false) => {
    // Load cached preferences from localStorage
    const cachedPrefs = localStorage.getItem(`preferences_${userId}`);
    const cachedRegPrefs = localStorage.getItem(`registration_preferences_${userId}`);
    const cachedSummary = localStorage.getItem(`profile_summary_${userId}`);
    
    // Update refs from localStorage if available
    if (cachedPrefs && !previousPreferencesRef.current) {
      previousPreferencesRef.current = cachedPrefs;
    }
    if (cachedRegPrefs && !previousRegistrationPrefsRef.current) {
      previousRegistrationPrefsRef.current = cachedRegPrefs;
    }
    if (cachedSummary && !previousProfileSummaryRef.current) {
      previousProfileSummaryRef.current = cachedSummary;
      setProfileSummary(cachedSummary);
    }
    
    // Check if we already have a profile summary and preferences haven't changed
    // Only skip reload if:
    // 1. Not forced to reload
    // 2. We have a cached summary (from localStorage or ref)
    // 3. We have tracked preferences (meaning they've been loaded at least once)
    // 4. Current preferences match cached preferences
    const currentPrefsString = previousPreferencesRef.current || cachedPrefs || "";
    const currentRegPrefsString = previousRegistrationPrefsRef.current || cachedRegPrefs || "";
    const currentSummary = previousProfileSummaryRef.current || cachedSummary || "";
    
    // Only use cache if we have all the data and preferences haven't changed
    // We need to wait for preferences to be loaded first to compare them
    if (!forceReload && 
        currentSummary && 
        currentSummary !== "" &&
        currentPrefsString !== "" &&
        currentRegPrefsString !== "") {
      // Use cached summary immediately for fast UI
      console.log("Using cached profile summary - preferences match cached state");
      if (currentSummary !== profileSummary) {
        setProfileSummary(currentSummary);
      }
      setLoadingProfile(false);
      return;
    }

    setLoadingProfile(true);
    try {
      console.log("Loading profile for user:", userId);
      const response = await fetch(`http://localhost:8000/user/profile?user_id=${userId}`);
      console.log("Profile response status:", response.status);
      if (response.ok) {
        const data = await response.json();
        console.log("Profile data received:", data);
        const summary = data.summary || "";
        console.log("Profile summary:", summary);
        console.log("Summary length:", summary.length);
        console.log("Summary trimmed:", summary.trim());
        // Filter out error messages from backend - show friendly message instead
        if (summary.includes("Unable to load") || summary.includes("Unable to generate")) {
          // Don't show backend error messages to user
          console.warn("Backend returned error message, filtering out:", summary);
          setProfileSummary("");
          previousProfileSummaryRef.current = "";
        } else if (summary && summary.trim() !== "") {
          console.log("Setting profile summary:", summary);
          setProfileSummary(summary);
          previousProfileSummaryRef.current = summary;
          // Save to localStorage for persistence across page reloads
          localStorage.setItem(`profile_summary_${userId}`, summary);
        } else {
          console.warn("Summary is empty or whitespace only");
          setProfileSummary("");
          previousProfileSummaryRef.current = "";
          localStorage.removeItem(`profile_summary_${userId}`);
        }
      } else {
        // If response is not OK, log the error
        const errorText = await response.text().catch(() => "");
        console.error("Error loading profile:", response.status, response.statusText, errorText);
        // Check if it's a 503 (service unavailable) - this means backend config issue
        if (response.status === 503) {
          console.error("Backend database service unavailable - check backend configuration");
        }
        // Set empty summary if profile can't be loaded
        setProfileSummary("");
        previousProfileSummaryRef.current = "";
      }
    } catch (err: any) {
      console.error("Error loading profile (network error):", err);
      // Set empty summary on error
      setProfileSummary("");
      previousProfileSummaryRef.current = "";
    } finally {
      setLoadingProfile(false);
    }
  };

  const loadPreferences = async (userId: string, forceReload: boolean = false) => {
    setLoadingPreferences(true);
    try {
      const response = await fetch(`http://localhost:8000/user/preferences?user_id=${userId}`);
      if (response.ok) {
        const data = await response.json();
        // Create a string representation of preferences to compare
        const preferencesString = JSON.stringify({
          long_term: data.long_term || [],
          frequent_trip_specific: data.frequent_trip_specific || [],
          temporal: data.temporal || [],
        });
        
        // Only update if preferences actually changed or if forced
        if (forceReload || preferencesString !== previousPreferencesRef.current) {
          const preferencesChanged = preferencesString !== previousPreferencesRef.current;
          previousPreferencesRef.current = preferencesString;
          // Save to localStorage for persistence across page reloads
          localStorage.setItem(`preferences_${userId}`, preferencesString);
        setPreferences({
          long_term: data.long_term || [],
          frequent_trip_specific: data.frequent_trip_specific || [],
          temporal: data.temporal || [],
        });
          
          // Reload profile summary if preferences changed
          if (preferencesChanged && user) {
            console.log("Preferences changed, reloading profile summary");
            loadProfile(user.id, true);
          }
        }
      } else {
        // If response is not OK, log the error
        console.error("Error loading preferences:", response.status, response.statusText);
        const errorText = await response.text().catch(() => "");
        console.error("Error details:", errorText);
        // Check if it's a 503 (service unavailable) - this means backend config issue
        if (response.status === 503) {
          console.error("Backend database service unavailable - check backend configuration");
        }
        // Set empty preferences structure
        setPreferences({
          long_term: [],
          frequent_trip_specific: [],
          temporal: [],
        });
      }
    } catch (err: any) {
      console.error("Error loading preferences (network error):", err);
      // Set empty preferences structure on error
      setPreferences({
        long_term: [],
        frequent_trip_specific: [],
        temporal: [],
      });
    } finally {
      setLoadingPreferences(false);
    }
  };

  // Normalize preferences to match exact valid option values
  const normalizePreferences = (prefs: string[]): string[] => {
    const VALID_PREFERENCE_OPTIONS = [
      "Food", "Art", "Outdoors", "History", "Nightlife", "Wellness", "Shopping", "Adventure"
    ];
    const VALID_DIETARY_OPTIONS = [
      "vegetarian", "vegan", "gluten-free", "dairy-free", "halal", "kosher", "pescatarian"
    ];
    
    return prefs.map((pref) => {
      if (!pref || !pref.trim()) return pref;
      const prefTrimmed = pref.trim();
      
      // Match to valid preference options (case-insensitive)
      for (const option of VALID_PREFERENCE_OPTIONS) {
        if (option.toLowerCase() === prefTrimmed.toLowerCase()) {
          return option; // Return exact value
        }
      }
      
      // Match to valid dietary options (case-insensitive)
      for (const option of VALID_DIETARY_OPTIONS) {
        if (option.toLowerCase() === prefTrimmed.toLowerCase()) {
          return option; // Return exact value
        }
      }
      
      // If no match, return trimmed value (for likes/dislikes which are free-form)
      return prefTrimmed;
    }).filter((p) => p && p.trim()); // Remove empty values
  };

  const loadRegistrationPreferences = async (userId: string) => {
    setLoadingRegistrationPrefs(true);
    try {
      console.log("Loading registration preferences for user:", userId);
      const { data, error } = await supabase
        .from("user_preferences")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (error && error.code !== "PGRST116") {
        // PGRST116 = not found, which is OK
        console.error("Error loading registration preferences:", error);
        console.error("Error code:", error.code, "Error message:", error.message);
      } else if (data) {
        console.log("Registration preferences loaded (raw):", data);
        
        // Normalize preferences to match exact valid option values
        const normalizedData = {
          ...data,
          preferences: normalizePreferences(data.preferences || []),
          dietary_restrictions: normalizePreferences(data.dietary_restrictions || []),
          // Likes and dislikes are free-form, just trim them
          likes: (data.likes || []).map((l: string) => l?.trim()).filter((l: string) => l),
          dislikes: (data.dislikes || []).map((d: string) => d?.trim()).filter((d: string) => d),
        };
        
        console.log("Registration preferences loaded (normalized):", normalizedData);
        
        const regPrefsString = JSON.stringify({
          preferences: normalizedData.preferences,
          likes: normalizedData.likes,
          dislikes: normalizedData.dislikes,
          dietary_restrictions: normalizedData.dietary_restrictions,
        });
        
        // Check if registration preferences changed
        const regPrefsChanged = regPrefsString !== previousRegistrationPrefsRef.current;
        previousRegistrationPrefsRef.current = regPrefsString;
        // Save to localStorage for persistence across page reloads
        localStorage.setItem(`registration_preferences_${userId}`, regPrefsString);
        setRegistrationPrefs(normalizedData);
        
        // Reload profile summary if registration preferences changed
        if (regPrefsChanged && user) {
          console.log("Registration preferences changed, reloading profile summary");
          loadProfile(user.id, true);
        }
      } else {
        console.log("No registration preferences found for user:", userId);
        const emptyRegPrefsString = JSON.stringify({
          preferences: [],
          likes: [],
          dislikes: [],
          dietary_restrictions: [],
        });
        const regPrefsChanged = emptyRegPrefsString !== previousRegistrationPrefsRef.current;
        previousRegistrationPrefsRef.current = emptyRegPrefsString;
        // Save to localStorage for persistence across page reloads
        localStorage.setItem(`registration_preferences_${userId}`, emptyRegPrefsString);
        
        // Reload profile summary if registration preferences changed (from something to nothing)
        if (regPrefsChanged && user) {
          console.log("Registration preferences changed (to empty), reloading profile summary");
          loadProfile(user.id, true);
        }
      }
    } catch (err: any) {
      console.error("Error loading registration preferences:", err);
    } finally {
      setLoadingRegistrationPrefs(false);
    }
  };

  const loadTrips = async (userId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("saved_trips")
        .select("*, trip_status, selected_flight_id, selected_flight_data, carbon_emissions_kg, carbon_credits")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Filter out "after" trips from main list
      const activeTrips = (data || []).filter(trip => trip.trip_status !== "after");
      
      setTrips(activeTrips);
    } catch (err: any) {
      console.error("Error loading trips:", err);
      alert(`Failed to load trips: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Get plans (before and during trips) sorted by priority
  const getPlans = () => {
    const plans = trips.filter(trip => trip.trip_status === "before" || trip.trip_status === "during");
    return plans.sort((a, b) => {
      const statusOrder: Record<string, number> = { "during": 1, "before": 2 };
      const aOrder = statusOrder[a.trip_status || ""] || 999;
      const bOrder = statusOrder[b.trip_status || ""] || 999;
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      // If same status, sort by created_at descending
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  };

  // Get drafts
  const getDrafts = () => {
    return trips.filter(trip => trip.trip_status === "draft" || !trip.trip_status).sort((a, b) => {
      // Sort drafts by created_at descending
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  };

  const getCompletedTrips = () => {
    // Get completed trips from all trips (we'll need to load them separately)
    return trips.filter(trip => trip.trip_status === "after");
  };

  const loadCompletedTrips = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("saved_trips")
        .select("*, trip_status, selected_flight_id, selected_flight_data, carbon_emissions_kg, carbon_credits")
        .eq("user_id", userId)
        .eq("trip_status", "after")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (err: any) {
      console.error("Error loading completed trips:", err);
      return [];
    }
  };

  const loadSharedTrips = async (userId: string) => {
    setLoadingSharedTrips(true);
    try {
      const response = await fetch(`http://localhost:8000/trips/shared?user_id=${userId}`);
      if (response.ok) {
        const data = await response.json();
        setSharedTrips(data.shared_trips || []);
      }
    } catch (err: any) {
      console.error("Error loading shared trips:", err);
    } finally {
      setLoadingSharedTrips(false);
    }
  };

  const handleDeleteTrip = async (tripId: string, isShared: boolean = false) => {
    if (isShared) {
      // For shared trips, only remove the share, not the trip itself
      if (!confirm("Are you sure you want to remove this shared trip from your dashboard?")) return;
      
      setDeleting(tripId);
      try {
        const share = sharedTrips.find((t) => t.trip_id === tripId);
        if (!share || !user) return;
        
        const response = await fetch("http://localhost:8000/trips/unshare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trip_id: tripId,
            owner_id: share.owner_id,
            friend_id: user.id,
          }),
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ detail: "Failed to unshare trip" }));
          throw new Error(errorData.detail || "Failed to unshare trip");
        }
        
        setSharedTrips(sharedTrips.filter((t) => t.trip_id !== tripId));
      } catch (err: any) {
        alert(`Failed to remove shared trip: ${err.message}`);
      } finally {
        setDeleting(null);
      }
    } else {
      // For owned trips, delete the trip
    if (!confirm("Are you sure you want to delete this trip?")) return;

    setDeleting(tripId);
    try {
      const { error } = await supabase
        .from("saved_trips")
        .delete()
        .eq("id", tripId);

      if (error) throw error;

      setTrips(trips.filter((t) => t.id !== tripId));
    } catch (err: any) {
      alert(`Failed to delete trip: ${err.message}`);
    } finally {
      setDeleting(null);
      }
    }
  };

  const checkAndReloadPreferences = async () => {
    if (!user) return;
    
    setCheckingPreferences(true);
    try {
      console.log("=== Checking for preference changes ===");
      let preferencesChanged = false;
      
      // Check user's own preferences
      const currentPrefsString = previousPreferencesRef.current || "";
      const currentRegPrefsString = previousRegistrationPrefsRef.current || "";
      
      // Fetch current preferences
      const prefsResponse = await fetch(`http://localhost:8000/user/preferences?user_id=${user.id}`);
      if (prefsResponse.ok) {
        const prefsData = await prefsResponse.json();
        const newPrefsString = JSON.stringify({
          long_term: prefsData.long_term || [],
          frequent_trip_specific: prefsData.frequent_trip_specific || [],
          temporal: prefsData.temporal || [],
        });
        
        if (newPrefsString !== currentPrefsString) {
          console.log("User preferences changed!");
          preferencesChanged = true;
        }
        
        // Check registration preferences (they're in the same endpoint)
        const regPrefsString = JSON.stringify({
          preferences: prefsData.preferences || [],
          likes: prefsData.likes || [],
          dislikes: prefsData.dislikes || [],
          dietary_restrictions: prefsData.dietary_restrictions || [],
        });
        
        if (regPrefsString !== currentRegPrefsString) {
          console.log("User registration preferences changed!");
          preferencesChanged = true;
        }
      }
      
      // Check collaborators' preferences from shared trips
      const sharedTripsResponse = await fetch(`http://localhost:8000/trips/shared?user_id=${user.id}`);
      if (sharedTripsResponse.ok) {
        const sharedTripsData = await sharedTripsResponse.json();
        const sharedTripsList = sharedTripsData.shared_trips || [];
        
        // Also get trips shared by the user (to check collaborators)
        const sharedByResponse = await fetch(`http://localhost:8000/trips/shared-by?user_id=${user.id}`);
        if (sharedByResponse.ok) {
          const sharedByData = await sharedByResponse.json();
          const sharedByList = sharedByData.shared_trips || [];
          
          // Get unique collaborator IDs
          const collaboratorIds = new Set<string>();
          sharedTripsList.forEach((trip: any) => {
            if (trip.owner_id && trip.owner_id !== user.id) {
              collaboratorIds.add(trip.owner_id);
            }
          });
          sharedByList.forEach((trip: any) => {
            if (trip.shared_with_id) {
              collaboratorIds.add(trip.shared_with_id);
            }
          });
          
          // Check each collaborator's preferences
          for (const collaboratorId of Array.from(collaboratorIds)) {
            try {
              const collabPrefsResponse = await fetch(`http://localhost:8000/user/preferences?user_id=${collaboratorId}`);
              if (collabPrefsResponse.ok) {
                const collabPrefsData = await collabPrefsResponse.json();
                const collabPrefsString = JSON.stringify({
                  long_term: collabPrefsData.long_term || [],
                  frequent_trip_specific: collabPrefsData.frequent_trip_specific || [],
                  temporal: collabPrefsData.temporal || [],
                  preferences: collabPrefsData.preferences || [],
                  likes: collabPrefsData.likes || [],
                  dislikes: collabPrefsData.dislikes || [],
                  dietary_restrictions: collabPrefsData.dietary_restrictions || [],
                });
                
                // Check if we have cached preferences for this collaborator
                const cachedCollabPrefs = localStorage.getItem(`preferences_${collaboratorId}`);
                if (cachedCollabPrefs !== collabPrefsString) {
                  console.log(`Collaborator ${collaboratorId} preferences changed!`);
                  preferencesChanged = true;
                  // Update cache
                  localStorage.setItem(`preferences_${collaboratorId}`, collabPrefsString);
                }
              }
            } catch (err) {
              console.warn(`Error checking collaborator ${collaboratorId} preferences:`, err);
            }
          }
        }
      }
      
      if (preferencesChanged) {
        console.log("Preferences changed! Reloading everything...");
        // Reload everything
        await loadPreferences(user.id, true);
        await loadRegistrationPreferences(user.id);
        await loadProfile(user.id, true);
        await loadSharedTrips(user.id);
        await loadFriends();
        await loadTrips(user.id);
        alert("Preferences updated! Your profile has been refreshed.");
      } else {
        console.log("No preference changes detected.");
        alert("No preference changes detected. Everything is up to date!");
      }
    } catch (err: any) {
      console.error("Error checking preferences:", err);
      alert(`Error checking preferences: ${err.message}`);
    } finally {
      setCheckingPreferences(false);
    }
  };

  const handleShareTrip = async (friendId: string, canEdit: boolean = true) => {
    if (!user || !selectedTrip) return;
    
    setSharingTrip(true);
    try {
      const response = await fetch("http://localhost:8000/trips/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_id: selectedTrip.id,
          owner_id: user.id,
          friend_id: friendId,
          can_edit: canEdit,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Failed to share trip" }));
        throw new Error(errorData.detail || "Failed to share trip");
      }
      
      alert("Trip shared successfully!");
      setShowShareModal(false);
      setSelectedTrip(null);
    } catch (err: any) {
      alert(`Failed to share trip: ${err.message}`);
    } finally {
      setSharingTrip(false);
    }
  };

  const handleViewTrip = (trip: SavedTrip | SharedTrip) => {
    sessionStorage.setItem("itinerary", JSON.stringify(trip.itinerary_data));
    // Store trip ID so results page knows it's a saved trip
    const tripId = "trip_id" in trip ? trip.trip_id : trip.id;
    if (tripId) {
      sessionStorage.setItem("savedTripId", tripId);
    }
    // If it's a shared trip, determine the collaborator
    if ("owner_id" in trip) {
      // If user is viewing a trip shared with them (they are not the owner)
      if (trip.owner_id !== user?.id) {
        // Store owner_id as collaborator_id so we combine owner's preferences
        sessionStorage.setItem("collaborator_id", trip.owner_id);
      } else {
        // User is the owner viewing their own trip
        // We need to find who they shared it with to combine preferences
        // For now, we'll need to fetch this from the backend when viewing
        // Clear collaborator_id - it will be set by backend if needed
        sessionStorage.removeItem("collaborator_id");
      }
    } else {
      // Regular trip, clear collaborator_id
      sessionStorage.removeItem("collaborator_id");
    }
    router.push("/results");
  };

  const handleDeleteAccount = async () => {
    if (!user) return;

    // Double confirmation
    const confirmed = confirm(
      "⚠️ WARNING: This will permanently delete your account and all your data.\n\n" +
      "This includes:\n" +
      "• All saved trips\n" +
      "• All preferences\n" +
      "• All chat-learned preferences\n" +
      "• Your account\n\n" +
      "This action CANNOT be undone.\n\n" +
      "Are you absolutely sure?"
    );

    if (!confirmed) {
      return;
    }

    const typed = prompt("Please type 'DELETE' to confirm account deletion:");
    if (typed !== "DELETE") {
      alert("Account deletion cancelled. You must type 'DELETE' exactly.");
      return;
    }

    setDeletingAccount(true);
    try {
      const userId = user.id;

      // Delete all user data (CASCADE should handle this, but we'll do it explicitly for safety)
      // Delete saved trips
      const { error: tripsError } = await supabase
        .from("saved_trips")
        .delete()
        .eq("user_id", userId);

      if (tripsError) {
        console.error("Error deleting trips:", tripsError);
      }

      // Delete user preferences
      const { error: prefsError } = await supabase
        .from("user_preferences")
        .delete()
        .eq("user_id", userId);

      if (prefsError) {
        console.error("Error deleting preferences:", prefsError);
      }

      // Delete chat preferences (if table exists)
      try {
        const { error: chatPrefsError } = await supabase
          .from("chat_preferences")
          .delete()
          .eq("user_id", userId);

        if (chatPrefsError) {
          console.error("Error deleting chat preferences:", chatPrefsError);
        }
      } catch (err) {
        // Table might not exist, that's OK
        console.log("Chat preferences table might not exist:", err);
      }

      // Call backend to delete the auth user (requires service role key)
      try {
        const deleteResponse = await fetch("http://localhost:8000/user/account", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId }),
        });

        if (!deleteResponse.ok) {
          const errorData = await deleteResponse.json().catch(() => ({ detail: "Unknown error" }));
          throw new Error(errorData.detail || "Failed to delete account");
        }

        // Sign out and redirect
        await supabase.auth.signOut();
        alert("Your account has been successfully deleted.");
        router.push("/");
      } catch (deleteErr: any) {
        console.error("Error deleting account via backend:", deleteErr);
        // If backend deletion fails, at least delete the data and sign out
        await supabase.auth.signOut();
        alert(
          `Account data deleted, but there was an error deleting the auth account: ${deleteErr.message}. Please contact support.`
        );
        router.push("/");
      }
    } catch (err: any) {
      console.error("Error deleting account:", err);
      alert(`Failed to delete account: ${err.message}. Please try again or contact support.`);
    } finally {
      setDeletingAccount(false);
      setShowDeleteConfirm(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Not set";
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-amber-100">
        <div className="text-center">
          <div className="mb-4 text-4xl">🌍</div>
          <p className="text-lg font-medium text-emerald-900">Loading your trips...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>My Trips | GreenTrip</title>
        <meta name="description" content="View and manage your saved travel itineraries" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-amber-100">
        {/* Header */}
        <header className="border-b border-gray-200 bg-white/70 backdrop-blur-lg">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 md:px-12">
            <Link href="/" className="text-2xl font-semibold text-gray-900 transition hover:text-gray-700">
              GreenTrip
            </Link>
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
                    href="/emissions"
                    className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50"
                  >
                    Emissions Guide
                  </Link>
                  <button
                    onClick={checkAndReloadPreferences}
                    disabled={checkingPreferences}
                    className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Check for preference changes and reload profile"
                  >
                    {checkingPreferences ? "🔄 Checking..." : "🔄 Refresh Profile"}
                  </button>
                  <span className="text-sm text-emerald-700">
                    {user?.user_metadata?.first_name && user?.user_metadata?.last_name
                      ? `${user.user_metadata.first_name} ${user.user_metadata.last_name}`
                      : user?.user_metadata?.name || user?.email}
                  </span>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 transition hover:border-red-300 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={deletingAccount}
                  >
                    {deletingAccount ? "Deleting..." : "Delete Account"}
                  </button>
                  <button
                    onClick={async () => {
                      await supabase.auth.signOut();
                      router.push("/");
                    }}
                    className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50"
                  >
                    Sign Out
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="mx-auto max-w-7xl px-6 py-12">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-emerald-900">My Saved Trips</h1>
            <p className="mt-2 text-emerald-700">
              View and manage your travel itineraries
            </p>
          </div>

          {/* Carbon Stats */}
          {carbonStats && (
            <div className="mb-8 grid gap-6 md:grid-cols-3">
              <div className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm text-center">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-600/70 mb-2">Trips Completed</p>
                <p className="text-4xl font-bold text-[#0b3d2e]">{carbonStats.trips_count}</p>
                <p className="mt-2 text-sm text-emerald-600/80">Total trips</p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm text-center">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-600/70 mb-2">Carbon Credits</p>
                <p className="text-4xl font-bold text-[#0b3d2e]">{carbonStats.total_credits.toFixed(1)}</p>
                <p className="mt-2 text-sm text-emerald-600/80">Total credits earned</p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm text-center">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-600/70 mb-2">Total Emissions</p>
                <p className="text-4xl font-bold text-[#0b3d2e]">{carbonStats.total_emissions_kg.toFixed(1)} kg</p>
                <p className="mt-2 text-sm text-emerald-600/80">CO₂ emissions</p>
              </div>
            </div>
          )}


          {/* Travel Profile - Combined Preferences */}
          <div className="mb-8 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-emerald-100 p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-emerald-900">Your Travel Profile</h2>
                {loadingProfile ? (
                  <p className="mt-1 text-sm text-emerald-600">Loading profile summary...</p>
                ) : profileSummary && profileSummary.trim() !== "" && !profileSummary.includes("Unable to") ? (
                  <p className="mt-2 text-sm text-emerald-800 leading-relaxed">{profileSummary}</p>
                ) : (
                  <p className="mt-1 text-sm text-emerald-600 italic">
                    No profile summary yet. Start planning trips and using the chat feature to build your travel profile!
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (registrationPrefs &&
                      (registrationPrefs.preferences?.length > 0 ||
                       registrationPrefs.likes?.length > 0 ||
                       registrationPrefs.dislikes?.length > 0 ||
                       registrationPrefs.dietary_restrictions?.length > 0)) {
                      // Load current preferences into editing state
                      setEditingPreferences(registrationPrefs.preferences || []);
                      setEditingLikes(registrationPrefs.likes || []);
                      setEditingDislikes(registrationPrefs.dislikes || []);
                      setEditingDietary(registrationPrefs.dietary_restrictions || []);
                    } else {
                      // Initialize empty preferences for editing
                      setEditingPreferences([]);
                      setEditingLikes([]);
                      setEditingDislikes([]);
                      setEditingDietary([]);
                    }
                    setShowEditRegistrationPrefs(true);
                  }}
                  className="rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50"
                >
                  {registrationPrefs &&
                  (registrationPrefs.preferences?.length > 0 ||
                   registrationPrefs.likes?.length > 0 ||
                   registrationPrefs.dislikes?.length > 0 ||
                   registrationPrefs.dietary_restrictions?.length > 0)
                    ? "Edit Registration Preferences"
                    : "Add Registration Preferences"}
                </button>
                <button
                  onClick={() => setShowPreferencesChat(true)}
                  className="rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-400 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
                >
                  Tell Me About Your Preferences
                </button>
              </div>
            </div>

            {loadingRegistrationPrefs || loadingPreferences ? (
              <p className="text-emerald-700">Loading preferences...</p>
            ) : (
              <div className="space-y-6">
                {/* Registration Preferences */}
                {registrationPrefs &&
                (registrationPrefs.preferences?.length > 0 ||
                 registrationPrefs.likes?.length > 0 ||
                 registrationPrefs.dislikes?.length > 0 ||
                 registrationPrefs.dietary_restrictions?.length > 0) ? (
                  <div>
                    <h3 className="mb-3 text-lg font-semibold text-emerald-800">Registration Preferences</h3>
                    <div className="space-y-4">
                      {registrationPrefs.preferences && registrationPrefs.preferences.length > 0 && (
                        <div>
                          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-emerald-600">
                            Interests
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {registrationPrefs.preferences.map((pref: string, idx: number) => (
                              <span
                                key={idx}
                                className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800"
                              >
                                {pref}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {registrationPrefs.likes && registrationPrefs.likes.length > 0 && (
                        <div>
                          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-emerald-600">
                            Things You Like
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {registrationPrefs.likes.map((like: string, idx: number) => (
                              <span
                                key={idx}
                                className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800"
                              >
                                {like}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {registrationPrefs.dislikes && registrationPrefs.dislikes.length > 0 && (
                        <div>
                          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-emerald-600">
                            Things You Dislike
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {registrationPrefs.dislikes.map((dislike: string, idx: number) => (
                              <span
                                key={idx}
                                className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-800"
                              >
                                {dislike}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {registrationPrefs.dietary_restrictions && registrationPrefs.dietary_restrictions.length > 0 && (
                        <div>
                          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-emerald-600">
                            Dietary Restrictions
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {registrationPrefs.dietary_restrictions.map((diet: string, idx: number) => (
                              <span
                                key={idx}
                                className="rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-800"
                              >
                                {diet}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div>
                    <h3 className="mb-2 text-lg font-semibold text-emerald-800">Registration Preferences</h3>
                    <p className="text-sm text-emerald-600 italic">
                      No registration preferences yet. Click "Add Registration Preferences" to set your travel preferences!
                    </p>
                  </div>
                )}

                {/* Chat-Learned Preferences */}
                {preferences ? (
                  <div>
                    <h3 className="mb-3 text-lg font-semibold text-emerald-800">Chat-Learned Preferences</h3>
                    <div className="space-y-4">
                      {preferences.long_term && preferences.long_term.length > 0 && (
                        <div>
                          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-emerald-600">
                            Long-term Preferences
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {preferences.long_term.map((pref: any, idx: number) => (
                              <span
                                key={idx}
                                className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800"
                              >
                                {pref.preference_value} ({pref.frequency}x)
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {preferences.frequent_trip_specific && preferences.frequent_trip_specific.length > 0 && (
                        <div>
                          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-emerald-600">
                            Frequent Trip Preferences
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {preferences.frequent_trip_specific.map((pref: any, idx: number) => (
                              <span
                                key={idx}
                                className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                              >
                                {pref.preference_value} ({pref.frequency}x)
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {preferences.temporal && preferences.temporal.length > 0 && (
                        <div>
                          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-emerald-600">
                            Temporal Preferences
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {preferences.temporal.map((pref: any, idx: number) => (
                              <span
                                key={idx}
                                className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700"
                              >
                                {pref.preference_value} ({pref.frequency}x)
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {(!preferences.long_term || preferences.long_term.length === 0) &&
                        (!preferences.frequent_trip_specific || preferences.frequent_trip_specific.length === 0) &&
                        (!preferences.temporal || preferences.temporal.length === 0) && (
                          <p className="text-sm text-emerald-600 italic">
                            No chat-learned preferences yet. Click "Tell Me About Your Preferences" to start building your profile!
                          </p>
                        )}
                    </div>
                  </div>
                ) : (
                  <div>
                    <h3 className="mb-2 text-lg font-semibold text-emerald-800">Chat-Learned Preferences</h3>
                    <p className="text-sm text-emerald-600 italic">
                      No chat-learned preferences yet. Click "Tell Me About Your Preferences" to start building your profile!
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Shared Trips Section */}
          {sharedTrips.length > 0 && (
            <div className="mb-8">
              <h2 className="mb-4 text-2xl font-semibold text-emerald-900">Shared with Me</h2>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {sharedTrips.map((trip) => (
                  <div
                    key={trip.share_id}
                    className="group rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm transition hover:shadow-lg"
                  >
                    <div className="mb-4 flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-xl font-semibold text-emerald-900">{trip.trip_name}</h3>
                        <p className="mt-1 text-sm text-emerald-600">{trip.destination}</p>
                        <p className="mt-1 text-xs text-amber-600">
                          Shared by @{trip.owner_username || "unknown"}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteTrip(trip.trip_id, true)}
                        disabled={deleting === trip.trip_id}
                        className="ml-2 rounded-full p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                        title="Remove shared trip"
                      >
                        {deleting === trip.trip_id ? "⏳" : "🗑️"}
                      </button>
                    </div>

                    <div className="mb-4 space-y-2 text-sm text-emerald-700">
                      {trip.start_date && trip.end_date && (
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-500">📅</span>
                          <span>
                            {formatDate(trip.start_date)} - {formatDate(trip.end_date)}
                          </span>
                        </div>
                      )}
                      {trip.num_days && (
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-500">⏱️</span>
                          <span>{trip.num_days} days</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-500">💰</span>
                        <span>Budget: {formatCurrency(trip.budget)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-500">🎯</span>
                        <span className="capitalize">{trip.mode}</span>
                      </div>
                    </div>

                    <div className="mt-4 flex gap-3">
                      <button
                        onClick={() => handleViewTrip(trip)}
                        className="flex-1 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-400 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
                      >
                        {trip.can_edit ? "View & Edit" : "View Trip"}
                      </button>
                    </div>

                    <div className="mt-4 text-xs text-gray-400">
                      Shared {new Date(trip.created_at).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Plans Section (before and during trips) */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold text-emerald-900">Plans</h2>
              <button
                onClick={async () => {
                  if (user) {
                    const completed = await loadCompletedTrips(user.id);
                    if (completed.length > 0) {
                      setShowCompletedTrips(true);
                    } else {
                      alert("No completed trips yet!");
                    }
                  }
                }}
                className="rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50"
              >
                📋 View Completed Trips ({carbonStats?.trips_count || 0})
              </button>
            </div>
          </div>

          {getPlans().length === 0 && getDrafts().length === 0 ? (
            <div className="rounded-2xl border border-emerald-200 bg-white p-12 text-center shadow-sm">
              <div className="mb-4 text-6xl">✈️</div>
              <h2 className="mb-2 text-2xl font-semibold text-emerald-900">No trips saved yet</h2>
              <p className="mb-6 text-emerald-700">
                Start planning your next adventure and save your itineraries here!
              </p>
              <Link
                href="/"
                className="inline-block rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:shadow-xl"
              >
                Plan a Trip
              </Link>
            </div>
          ) : (
            <>
              {getPlans().length > 0 && (
                <div className="mb-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {getPlans().map((trip) => (
                <div
                  key={trip.id}
                  className="group rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm transition hover:shadow-lg"
                >
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold text-emerald-900">{trip.trip_name}</h3>
                      <p className="mt-1 text-sm text-emerald-600">{trip.destination}</p>
                    </div>
                    <div className="flex gap-1">
                    <button
                        onClick={async () => {
                          console.log("=== SHARE BUTTON CLICKED (DASHBOARD) ===");
                          console.log("Current user:", user?.id);
                          console.log("Current friends count before reload:", friends.length);
                          setSelectedTrip(trip);
                          if (user) {
                            // Reload friends when opening share modal to ensure we have latest data
                            console.log("Reloading friends for user:", user.id);
                            await loadFriends();
                            // Wait a moment for state to update
                            setTimeout(() => {
                              console.log("Opening share modal, current friends count after reload:", friends.length);
                              setShowShareModal(true);
                            }, 200);
                          } else {
                            console.warn("No user found when clicking share button");
                            setShowShareModal(true);
                          }
                        }}
                        className="rounded-full p-2 text-gray-400 transition hover:bg-emerald-50 hover:text-emerald-500"
                        title="Share trip"
                      >
                        🔗
                      </button>
                      <button
                        onClick={() => handleDeleteTrip(trip.id, false)}
                      disabled={deleting === trip.id}
                        className="rounded-full p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                      title="Delete trip"
                    >
                      {deleting === trip.id ? "⏳" : "🗑️"}
                    </button>
                    </div>
                  </div>

                  <div className="mb-4 space-y-2 text-sm text-emerald-700">
                    {trip.start_date && trip.end_date && (
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-500">📅</span>
                        <span>
                          {formatDate(trip.start_date)} - {formatDate(trip.end_date)}
                        </span>
                      </div>
                    )}
                    {trip.num_days && (
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-500">⏱️</span>
                        <span>{trip.num_days} days</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-500">💰</span>
                      <span>Budget: {formatCurrency(trip.budget)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-500">🎯</span>
                      <span className="capitalize">{trip.mode}</span>
                    </div>
                    {/* Trip Status Progress Tags */}
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-emerald-100">
                      <span className="text-xs font-medium text-emerald-600">Status:</span>
                      {(trip.trip_status || "draft") === "draft" ? (
                        <span className="text-xs font-medium text-gray-500">📝 Draft</span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className={`text-xs font-medium ${(trip.trip_status || "draft") === "before" ? "text-emerald-700" : (trip.trip_status || "draft") !== "draft" ? "text-emerald-500" : "text-gray-400"}`}>
                            {(trip.trip_status || "draft") === "before" ? "●" : (trip.trip_status || "draft") !== "draft" ? "✓" : "○"} Before
                          </span>
                          <span className="text-emerald-300">|</span>
                          <span className={`text-xs font-medium ${(trip.trip_status || "draft") === "during" ? "text-emerald-700" : (trip.trip_status || "draft") === "after" ? "text-emerald-500" : "text-gray-400"}`}>
                            {(trip.trip_status || "draft") === "during" ? "●" : (trip.trip_status || "draft") === "after" ? "✓" : "○"} During
                          </span>
                          <span className="text-emerald-300">|</span>
                          <span className={`text-xs font-medium ${(trip.trip_status || "draft") === "after" ? "text-emerald-700" : "text-gray-400"}`}>
                            {(trip.trip_status || "draft") === "after" ? "●" : "○"} After
                          </span>
                        </div>
                      )}
                    </div>
                    {/* Carbon Data if completed */}
                    {(trip.trip_status === "after" && (trip.carbon_emissions_kg || trip.carbon_credits)) && (
                      <div className="mt-2 pt-2 border-t border-emerald-100 text-xs">
                        {trip.carbon_emissions_kg && (
                          <div className="flex items-center gap-2 text-emerald-700">
                            <span>🌍</span>
                            <span>Emissions: {trip.carbon_emissions_kg.toFixed(1)} kg</span>
                          </div>
                        )}
                        {trip.carbon_credits && (
                          <div className="flex items-center gap-2 text-emerald-700">
                            <span>⭐</span>
                            <span>Credits: {trip.carbon_credits.toFixed(1)}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex flex-col gap-3">
                    <button
                      onClick={() => handleViewTrip(trip)}
                      className="w-full rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-400 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
                    >
                      View Trip
                    </button>
                    {/* Trip Status Dropdown */}
                    <div className="relative">
                      <button
                        onClick={() => setOpenStatusMenu(openStatusMenu === trip.id ? null : trip.id)}
                        disabled={updatingTripStatus === trip.id}
                        className={`w-full rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                          trip.trip_status === "after"
                            ? "bg-emerald-600 text-white"
                            : (trip.trip_status || "draft") === "draft"
                            ? "border border-gray-300 bg-white text-gray-600 hover:border-emerald-300 hover:text-emerald-700"
                            : "border border-emerald-200 bg-white text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50"
                        }`}
                        title="Change trip status"
                      >
                        {updatingTripStatus === trip.id
                          ? "Updating..."
                          : (trip.trip_status || "draft") === "draft"
                          ? "📝 Draft ▼"
                          : (trip.trip_status || "draft") === "before"
                          ? "✈️ Before ▼"
                          : (trip.trip_status || "draft") === "during"
                          ? "✈️ During ▼"
                          : "✓ After ▼"}
                      </button>
                      
                      {openStatusMenu === trip.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setOpenStatusMenu(null)}
                          />
                          <div className="absolute left-0 top-full z-20 mt-2 w-48 rounded-lg border border-emerald-200 bg-white shadow-lg">
                            <div className="py-1">
                              <button
                                onClick={() => {
                                  handleUpdateTripStatus(trip.id, "draft", trip);
                                  setOpenStatusMenu(null);
                                }}
                                disabled={updatingTripStatus === trip.id}
                                className={`w-full px-4 py-2 text-left text-sm transition hover:bg-emerald-50 disabled:opacity-50 ${
                                  (trip.trip_status || "draft") === "draft" ? "bg-emerald-50 text-emerald-700 font-medium" : "text-gray-700"
                                }`}
                              >
                                📝 Draft {(trip.trip_status || "draft") === "draft" && "●"}
                              </button>
                              <button
                                onClick={() => {
                                  handleUpdateTripStatus(trip.id, "before", trip);
                                  setOpenStatusMenu(null);
                                }}
                                disabled={updatingTripStatus === trip.id}
                                className={`w-full px-4 py-2 text-left text-sm transition hover:bg-emerald-50 disabled:opacity-50 ${
                                  (trip.trip_status || "draft") === "before" ? "bg-emerald-50 text-emerald-700 font-medium" : "text-gray-700"
                                }`}
                              >
                                ✈️ Before {(trip.trip_status || "draft") === "before" && "●"}
                              </button>
                              <button
                                onClick={() => {
                                  handleUpdateTripStatus(trip.id, "during", trip);
                                  setOpenStatusMenu(null);
                                }}
                                disabled={updatingTripStatus === trip.id || !trip.selected_flight_id}
                                className={`w-full px-4 py-2 text-left text-sm transition hover:bg-emerald-50 disabled:opacity-50 ${
                                  (trip.trip_status || "draft") === "during" ? "bg-emerald-50 text-emerald-700 font-medium" : "text-gray-700"
                                }`}
                                title={!trip.selected_flight_id ? "Please select a flight option first" : ""}
                              >
                                ✈️ During {(trip.trip_status || "draft") === "during" && "●"} {!trip.selected_flight_id && "(requires flight)"}
                              </button>
                              <button
                                onClick={() => {
                                  handleUpdateTripStatus(trip.id, "after", trip);
                                  setOpenStatusMenu(null);
                                }}
                                disabled={updatingTripStatus === trip.id || !trip.selected_flight_id}
                                className={`w-full px-4 py-2 text-left text-sm transition hover:bg-emerald-50 disabled:opacity-50 ${
                                  (trip.trip_status || "draft") === "after" ? "bg-emerald-50 text-emerald-700 font-medium" : "text-gray-700"
                                }`}
                                title={!trip.selected_flight_id ? "Please select a flight option first" : ""}
                              >
                                ✓ After {(trip.trip_status || "draft") === "after" && "●"} {!trip.selected_flight_id && "(requires flight)"}
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 text-xs text-gray-400">
                    Saved {new Date(trip.created_at).toLocaleDateString()}
                  </div>
                </div>
                  ))}
                </div>
              )}

              {/* Drafts Section */}
              {getDrafts().length > 0 && (
                <div className="mb-8">
                  <h2 className="mb-4 text-2xl font-semibold text-emerald-900">Drafts</h2>
                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {getDrafts().map((trip) => (
                      <div
                        key={trip.id}
                        className="group rounded-2xl border border-gray-200 bg-gray-50 p-6 shadow-sm transition hover:shadow-lg"
                      >
                        <div className="mb-4 flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="text-xl font-semibold text-emerald-900">{trip.trip_name}</h3>
                            <p className="mt-1 text-sm text-emerald-600">{trip.destination}</p>
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={async () => {
                                console.log("=== SHARE BUTTON CLICKED (DASHBOARD) ===");
                                console.log("Current user:", user?.id);
                                console.log("Current friends count before reload:", friends.length);
                                setSelectedTrip(trip);
                                if (user) {
                                  // Reload friends when opening share modal to ensure we have latest data
                                  console.log("Reloading friends for user:", user.id);
                                  await loadFriends();
                                  // Wait a moment for state to update
                                  setTimeout(() => {
                                    console.log("Opening share modal, current friends count after reload:", friends.length);
                                    setShowShareModal(true);
                                  }, 200);
                                } else {
                                  console.warn("No user found when clicking share button");
                                  setShowShareModal(true);
                                }
                              }}
                              className="rounded-full p-2 text-gray-400 transition hover:bg-emerald-50 hover:text-emerald-500"
                              title="Share trip"
                            >
                              🔗
                            </button>
                            <button
                              onClick={() => handleDeleteTrip(trip.id, false)}
                              disabled={deleting === trip.id}
                              className="rounded-full p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                              title="Delete trip"
                            >
                              {deleting === trip.id ? "⏳" : "🗑️"}
                            </button>
                          </div>
                        </div>

                        <div className="mb-4 space-y-2 text-sm text-emerald-700">
                          {trip.start_date && trip.end_date && (
                            <div className="flex items-center gap-2">
                              <span className="text-emerald-500">📅</span>
                              <span>
                                {formatDate(trip.start_date)} - {formatDate(trip.end_date)}
                              </span>
                            </div>
                          )}
                          {trip.num_days && (
                            <div className="flex items-center gap-2">
                              <span className="text-emerald-500">⏱️</span>
                              <span>{trip.num_days} days</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <span className="text-emerald-500">💰</span>
                            <span>Budget: {formatCurrency(trip.budget)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-emerald-500">🎯</span>
                            <span className="capitalize">{trip.mode}</span>
                          </div>
                          {/* Trip Status Progress Tags */}
                          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-200">
                            <span className="text-xs font-medium text-emerald-600">Status:</span>
                            <span className="text-xs font-medium text-gray-500">📝 Draft</span>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-col gap-3">
                          <button
                            onClick={() => handleViewTrip(trip)}
                            className="w-full rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-400 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
                          >
                            View Trip
                          </button>
                          {/* Trip Status Dropdown */}
                          <div className="relative">
                            <button
                              onClick={() => setOpenStatusMenu(openStatusMenu === trip.id ? null : trip.id)}
                              disabled={updatingTripStatus === trip.id}
                              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition hover:border-emerald-300 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                              title="Change trip status"
                            >
                              {updatingTripStatus === trip.id
                                ? "Updating..."
                                : (trip.trip_status || "draft") === "draft"
                                ? "📝 Draft ▼"
                                : (trip.trip_status || "draft") === "before"
                                ? "✈️ Before ▼"
                                : (trip.trip_status || "draft") === "during"
                                ? "✈️ During ▼"
                                : "✓ After ▼"}
                            </button>
                            
                            {openStatusMenu === trip.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-10"
                                  onClick={() => setOpenStatusMenu(null)}
                                />
                                <div className="absolute left-0 top-full z-20 mt-2 w-48 rounded-lg border border-emerald-200 bg-white shadow-lg">
                                  <div className="py-1">
                                    <button
                                      onClick={() => {
                                        handleUpdateTripStatus(trip.id, "draft", trip);
                                        setOpenStatusMenu(null);
                                      }}
                                      disabled={updatingTripStatus === trip.id}
                                      className={`w-full px-4 py-2 text-left text-sm transition hover:bg-emerald-50 disabled:opacity-50 ${
                                        (trip.trip_status || "draft") === "draft" ? "bg-emerald-50 text-emerald-700 font-medium" : "text-gray-700"
                                      }`}
                                    >
                                      📝 Draft {(trip.trip_status || "draft") === "draft" && "●"}
                                    </button>
                                    <button
                                      onClick={() => {
                                        handleUpdateTripStatus(trip.id, "before", trip);
                                        setOpenStatusMenu(null);
                                      }}
                                      disabled={updatingTripStatus === trip.id}
                                      className={`w-full px-4 py-2 text-left text-sm transition hover:bg-emerald-50 disabled:opacity-50 ${
                                        (trip.trip_status || "draft") === "before" ? "bg-emerald-50 text-emerald-700 font-medium" : "text-gray-700"
                                      }`}
                                    >
                                      ✈️ Before {(trip.trip_status || "draft") === "before" && "●"}
                                    </button>
                                    <button
                                      onClick={() => {
                                        handleUpdateTripStatus(trip.id, "during", trip);
                                        setOpenStatusMenu(null);
                                      }}
                                      disabled={updatingTripStatus === trip.id || !trip.selected_flight_id}
                                      className={`w-full px-4 py-2 text-left text-sm transition hover:bg-emerald-50 disabled:opacity-50 ${
                                        (trip.trip_status || "draft") === "during" ? "bg-emerald-50 text-emerald-700 font-medium" : "text-gray-700"
                                      }`}
                                      title={!trip.selected_flight_id ? "Please select a flight option first" : ""}
                                    >
                                      ✈️ During {(trip.trip_status || "draft") === "during" && "●"} {!trip.selected_flight_id && "(requires flight)"}
                                    </button>
                                    <button
                                      onClick={() => {
                                        handleUpdateTripStatus(trip.id, "after", trip);
                                        setOpenStatusMenu(null);
                                      }}
                                      disabled={updatingTripStatus === trip.id || !trip.selected_flight_id}
                                      className={`w-full px-4 py-2 text-left text-sm transition hover:bg-emerald-50 disabled:opacity-50 ${
                                        (trip.trip_status || "draft") === "after" ? "bg-emerald-50 text-emerald-700 font-medium" : "text-gray-700"
                                      }`}
                                      title={!trip.selected_flight_id ? "Please select a flight option first" : ""}
                                    >
                                      ✓ After {(trip.trip_status || "draft") === "after" && "●"} {!trip.selected_flight_id && "(requires flight)"}
                                    </button>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="mt-4 text-xs text-gray-400">
                          Saved {new Date(trip.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

        </main>
      </div>

      {/* Preferences Chat Modal */}
      {showPreferencesChat && (
        <PreferencesChat
          onPreferencesUpdated={() => {
            // Reload preferences when they're updated
            if (user) {
              loadPreferences(user.id, true);
              // Profile summary will be reloaded automatically when preferences change
            }
          }}
          onClose={() => setShowPreferencesChat(false)}
        />
      )}

      {/* Edit Registration Preferences Modal */}
      {showEditRegistrationPrefs && (
        <EditRegistrationPreferencesModal
          preferences={editingPreferences}
          likes={editingLikes}
          dislikes={editingDislikes}
          dietary={editingDietary}
          onPreferencesChange={setEditingPreferences}
          onLikesChange={setEditingLikes}
          onDislikesChange={setEditingDislikes}
          onDietaryChange={setEditingDietary}
          onSave={async () => {
            if (!user) return;
            setSavingPreferences(true);
            try {
              const response = await fetch('http://localhost:8000/user/preferences/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  user_id: user.id,
                  preferences: editingPreferences,
                  likes: editingLikes,
                  dislikes: editingDislikes,
                  dietary_restrictions: editingDietary,
                }),
              });

              if (!response.ok) {
                throw new Error('Failed to save preferences');
              }

              // Reload preferences and profile summary
              await loadRegistrationPreferences(user.id);
              await loadProfile(user.id, true);
              setShowEditRegistrationPrefs(false);
            } catch (err: any) {
              console.error('Error saving preferences:', err);
              alert(`Failed to save preferences: ${err.message}`);
            } finally {
              setSavingPreferences(false);
            }
          }}
          onClose={() => setShowEditRegistrationPrefs(false)}
          saving={savingPreferences}
        />
      )}

      {/* Delete Account Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl border border-red-200 bg-white p-6 shadow-2xl">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
              disabled={deletingAccount}
            >
              ✕
            </button>

            <h2 className="mb-4 text-2xl font-bold text-red-900">Delete Account</h2>
            <p className="mb-4 text-sm text-gray-700">
              Are you sure you want to delete your account? This action cannot be undone.
            </p>

            <div className="mb-6 rounded-lg border border-red-100 bg-red-50 p-4">
              <p className="mb-2 text-sm font-semibold text-red-900">This will permanently delete:</p>
              <ul className="ml-4 list-disc text-sm text-red-800">
                <li>All your saved trips</li>
                <li>All your preferences</li>
                <li>All chat-learned preferences</li>
                <li>Your account data</li>
              </ul>
            </div>

            <div className="mb-4 rounded-lg border border-amber-100 bg-amber-50 p-3">
              <p className="text-xs text-amber-800">
                <strong>Note:</strong> You will need to type 'DELETE' in the confirmation dialog to proceed.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deletingAccount}
                className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deletingAccount}
                className="flex-1 rounded-lg bg-gradient-to-r from-red-500 to-red-400 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deletingAccount ? "Deleting..." : "Delete Account"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Completed Trips Modal */}
      {showCompletedTrips && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="relative w-full max-w-4xl max-h-[90vh] rounded-2xl border border-emerald-200 bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-emerald-100">
              <h2 className="text-2xl font-bold text-emerald-900">Completed Trips</h2>
              <button
                onClick={() => setShowCompletedTrips(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <CompletedTripsList userId={user?.id} />
            </div>
          </div>
        </div>
      )}

      {/* Share Trip Modal */}
      {showShareModal && selectedTrip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl border border-emerald-200 bg-white p-6 shadow-2xl">
            <button
              onClick={() => {
                setShowShareModal(false);
                setSelectedTrip(null);
              }}
              disabled={sharingTrip}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 disabled:opacity-50"
            >
              ✕
            </button>

            <h2 className="mb-4 text-2xl font-bold text-emerald-900">Share Trip</h2>
            <p className="mb-2 text-sm text-emerald-700">
              Share "{selectedTrip.trip_name}" with a friend
            </p>

            {(() => {
              console.log("=== RENDERING SHARE MODAL (DASHBOARD) ===");
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
                      loadFriends();
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
                setSelectedTrip(null);
              }}
              disabled={sharingTrip}
              className="w-full rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}

