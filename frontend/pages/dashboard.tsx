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
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [friendEmail, setFriendEmail] = useState("");
  const [addingFriend, setAddingFriend] = useState(false);
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
      } else {
        router.push("/");
      }
    });
  }, [router]);

  const loadFriends = async () => {
    if (!user) return;
    setLoadingFriends(true);
    try {
      const response = await fetch(`http://localhost:8000/friends/list?user_id=${user.id}`);
      if (response.ok) {
        const data = await response.json();
        setFriends(data.friends || []);
      }
    } catch (err) {
      console.error("Error loading friends:", err);
    } finally {
      setLoadingFriends(false);
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

  const handleAddFriend = async () => {
    if (!user || !friendEmail.trim()) return;
    setAddingFriend(true);
    try {
      const response = await fetch("http://localhost:8000/friends/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          friend_email: friendEmail.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Failed to add friend" }));
        throw new Error(errorData.detail || "Failed to add friend");
      }

      setFriendEmail("");
      setShowAddFriend(false);
      alert("Friend request sent!");
      loadPendingRequests();
    } catch (err: any) {
      console.error("Error adding friend:", err);
      alert(`Failed to add friend: ${err.message}`);
    } finally {
      setAddingFriend(false);
    }
  };

  const handleAcceptRequest = async (friendshipId: string) => {
    if (!user) return;
    try {
      const response = await fetch("http://localhost:8000/friends/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          friendship_id: friendshipId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to accept friend request");
      }

      loadFriends();
      loadPendingRequests();
    } catch (err) {
      console.error("Error accepting friend request:", err);
      alert("Failed to accept friend request");
    }
  };

  const handleRemoveFriend = async (friendId: string) => {
    if (!user) return;
    if (!confirm("Are you sure you want to remove this friend?")) return;

    try {
      const response = await fetch("http://localhost:8000/friends/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          friend_id: friendId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to remove friend");
      }

      loadFriends();
      loadPendingRequests();
    } catch (err) {
      console.error("Error removing friend:", err);
      alert("Failed to remove friend");
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
        console.log("Registration preferences loaded:", data);
        const regPrefsString = JSON.stringify({
          preferences: data.preferences || [],
          likes: data.likes || [],
          dislikes: data.dislikes || [],
          dietary_restrictions: data.dietary_restrictions || [],
        });
        
        // Check if registration preferences changed
        const regPrefsChanged = regPrefsString !== previousRegistrationPrefsRef.current;
        previousRegistrationPrefsRef.current = regPrefsString;
        // Save to localStorage for persistence across page reloads
        localStorage.setItem(`registration_preferences_${userId}`, regPrefsString);
        setRegistrationPrefs(data);
        
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
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTrips(data || []);
    } catch (err: any) {
      console.error("Error loading trips:", err);
      alert(`Failed to load trips: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTrip = async (tripId: string) => {
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
  };

  const handleViewTrip = (trip: SavedTrip) => {
    sessionStorage.setItem("itinerary", JSON.stringify(trip.itinerary_data));
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
        <title>My Trips | TripSmith</title>
        <meta name="description" content="View and manage your saved travel itineraries" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-amber-100">
        {/* Header */}
        <header className="border-b border-emerald-100 bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <Link href="/" className="text-2xl font-bold text-[#34d399]">
                TripSmith
              </Link>
              <span className="text-sm text-emerald-600">Dashboard</span>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/emissions"
                className="rounded-full border border-emerald-200 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50"
              >
                🌍 Emissions Guide
              </Link>
              <span className="text-sm text-emerald-700">{user?.email}</span>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="rounded-full border border-red-200 px-4 py-2 text-sm font-medium text-red-700 transition hover:border-red-300 hover:bg-red-50 hover:text-red-900"
                disabled={deletingAccount}
              >
                {deletingAccount ? "Deleting..." : "Delete Account"}
              </button>
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  router.push("/");
                }}
                className="rounded-full border border-emerald-200 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:border-emerald-300 hover:text-emerald-900"
              >
                Sign Out
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="mx-auto max-w-6xl px-6 py-12">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-emerald-900">My Saved Trips</h1>
            <p className="mt-2 text-emerald-700">
              View and manage your travel itineraries
            </p>
          </div>

          {/* Travel Profile Summary */}
          <div className="mb-8 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-emerald-100 p-6 shadow-sm">
            <h2 className="mb-3 text-xl font-semibold text-emerald-900">Your Travel Profile</h2>
            {loadingProfile ? (
              <p className="text-emerald-700">Loading your profile...</p>
            ) : profileSummary && profileSummary.trim() !== "" && !profileSummary.includes("Unable to") ? (
              <p className="text-emerald-800 leading-relaxed">{profileSummary}</p>
            ) : (
              <p className="text-emerald-700 italic">
                No profile summary yet. Start planning trips and using the chat feature to build your travel profile!
              </p>
            )}
          </div>

          {/* Registration Preferences */}
          {loadingRegistrationPrefs ? (
            <div className="mb-8 rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
              <p className="text-emerald-700">Loading registration preferences...</p>
            </div>
          ) : (
            (registrationPrefs &&
              (registrationPrefs.preferences?.length > 0 ||
                registrationPrefs.likes?.length > 0 ||
                registrationPrefs.dislikes?.length > 0 ||
                registrationPrefs.dietary_restrictions?.length > 0)) ? (
              <div className="mb-8 rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-emerald-900">Registration Preferences</h2>
                  <button
                    onClick={() => {
                      // Load current preferences into editing state
                      setEditingPreferences(registrationPrefs.preferences || []);
                      setEditingLikes(registrationPrefs.likes || []);
                      setEditingDislikes(registrationPrefs.dislikes || []);
                      setEditingDietary(registrationPrefs.dietary_restrictions || []);
                      setShowEditRegistrationPrefs(true);
                    }}
                    className="rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50"
                  >
                    Edit
                  </button>
                </div>
                <div className="space-y-4">
                  {registrationPrefs.preferences && registrationPrefs.preferences.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-emerald-600">
                        Interests
                      </h3>
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
                      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-emerald-600">
                        Things You Like
                      </h3>
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
                      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-emerald-600">
                        Things You Dislike
                      </h3>
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
                      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-emerald-600">
                        Dietary Restrictions
                      </h3>
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
              <div className="mb-8 rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-emerald-900">Registration Preferences</h2>
                  <button
                    onClick={() => {
                      // Initialize empty preferences for editing
                      setEditingPreferences([]);
                      setEditingLikes([]);
                      setEditingDislikes([]);
                      setEditingDietary([]);
                      setShowEditRegistrationPrefs(true);
                    }}
                    className="rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50"
                  >
                    Add Preferences
                  </button>
                </div>
                <p className="text-emerald-700 italic">
                  No registration preferences yet. Click "Add Preferences" to set your travel preferences!
                </p>
              </div>
            )
          )}

          {/* Chat-Learned Preferences */}
          <div className="mb-8 rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-emerald-900">Chat-Learned Preferences</h2>
              <button
                onClick={() => setShowPreferencesChat(true)}
                className="rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-400 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
              >
                Tell Me More About Your Preferences
              </button>
            </div>
            {loadingPreferences ? (
              <p className="text-emerald-700">Loading preferences...</p>
            ) : preferences ? (
              <div className="space-y-4">
                {preferences.long_term && preferences.long_term.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-emerald-600">
                      Long-term Preferences
                    </h3>
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
                    <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-emerald-600">
                      Frequent Trip Preferences
                    </h3>
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
                    <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-emerald-600">
                      Temporal Preferences
                    </h3>
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
                    <p className="text-emerald-700 italic">
                      No chat-learned preferences yet. Use the chat feature when planning trips to start building your profile!
                    </p>
                  )}
              </div>
            ) : (
              <p className="text-emerald-700 italic">
                No chat-learned preferences yet. Use the chat feature when planning trips to start building your profile!
              </p>
            )}
          </div>

          {trips.length === 0 ? (
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
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {trips.map((trip) => (
                <div
                  key={trip.id}
                  className="group rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm transition hover:shadow-lg"
                >
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold text-emerald-900">{trip.trip_name}</h3>
                      <p className="mt-1 text-sm text-emerald-600">{trip.destination}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteTrip(trip.id)}
                      disabled={deleting === trip.id}
                      className="ml-2 rounded-full p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                      title="Delete trip"
                    >
                      {deleting === trip.id ? "⏳" : "🗑️"}
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
                      View Trip
                    </button>
                    <Link
                      href="/"
                      className="rounded-lg border border-emerald-200 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
                    >
                      Plan New
                    </Link>
                  </div>

                  <div className="mt-4 text-xs text-gray-400">
                    Saved {new Date(trip.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Friends Section */}
          <div className="mb-8 rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-emerald-900">Friends</h2>
              <button
                onClick={() => setShowAddFriend(true)}
                className="rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50"
              >
                + Add Friend
              </button>
            </div>

            {/* Pending Friend Requests */}
            {pendingRequests.length > 0 && (
              <div className="mb-6">
                <h3 className="mb-3 text-sm font-semibold text-emerald-700">Pending Requests</h3>
                <div className="space-y-2">
                  {pendingRequests.map((request) => (
                    <div
                      key={request.friendship_id}
                      className="flex items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50 p-3"
                    >
                      <div>
                        <p className="font-medium text-emerald-900">{request.email}</p>
                        <p className="text-xs text-emerald-600">
                          Sent {new Date(request.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAcceptRequest(request.friendship_id)}
                          className="rounded-lg bg-emerald-500 px-3 py-1 text-xs font-medium text-white transition hover:bg-emerald-600"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleRemoveFriend(request.requester_id)}
                          className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-700 transition hover:bg-red-50"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Friends List */}
            {loadingFriends ? (
              <p className="text-emerald-700">Loading friends...</p>
            ) : friends.length > 0 ? (
              <div>
                <h3 className="mb-3 text-sm font-semibold text-emerald-700">Your Friends ({friends.length})</h3>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {friends.map((friend) => (
                    <div
                      key={friend.friendship_id}
                      className="flex items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50 p-3"
                    >
                      <div>
                        <p className="font-medium text-emerald-900">{friend.email}</p>
                        <p className="text-xs text-emerald-600">
                          Friends since {new Date(friend.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRemoveFriend(friend.friend_id)}
                        className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-700 transition hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-emerald-700 italic">No friends yet. Add friends by email to get started!</p>
            )}
          </div>
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

      {/* Add Friend Modal */}
      {showAddFriend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl border border-emerald-200 bg-white p-6 shadow-2xl">
            <button
              onClick={() => {
                setShowAddFriend(false);
                setFriendEmail("");
              }}
              disabled={addingFriend}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 disabled:opacity-50"
            >
              ✕
            </button>

            <h2 className="mb-4 text-2xl font-bold text-emerald-900">Add Friend</h2>
            <p className="mb-6 text-sm text-emerald-700">
              Enter your friend's email address to send them a friend request.
            </p>

            <div className="mb-6">
              <label className="mb-2 block text-sm font-semibold text-emerald-900">Email Address</label>
              <input
                type="email"
                value={friendEmail}
                onChange={(e) => setFriendEmail(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === "Enter" && friendEmail.trim()) {
                    handleAddFriend();
                  }
                }}
                placeholder="friend@example.com"
                disabled={addingFriend}
                className="w-full rounded-lg border border-emerald-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:opacity-50"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowAddFriend(false);
                  setFriendEmail("");
                }}
                disabled={addingFriend}
                className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddFriend}
                disabled={addingFriend || !friendEmail.trim()}
                className="flex-1 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-400 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
              >
                {addingFriend ? "Sending..." : "Send Request"}
              </button>
            </div>
          </div>
        </div>
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
    </>
  );
}

