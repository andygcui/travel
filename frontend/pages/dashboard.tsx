import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { supabase } from "../lib/supabase";
import Link from "next/link";

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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        loadTrips(session.user.id);
        loadProfile(session.user.id);
        loadPreferences(session.user.id);
      } else {
        router.push("/");
      }
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        loadTrips(session.user.id);
        loadProfile(session.user.id);
        loadPreferences(session.user.id);
      } else {
        router.push("/");
      }
    });
  }, [router]);

  const loadProfile = async (userId: string) => {
    setLoadingProfile(true);
    try {
      const response = await fetch(`http://localhost:8000/user/profile?user_id=${userId}`);
      if (response.ok) {
        const data = await response.json();
        setProfileSummary(data.summary || "");
      }
    } catch (err: any) {
      console.error("Error loading profile:", err);
    } finally {
      setLoadingProfile(false);
    }
  };

  const loadPreferences = async (userId: string) => {
    setLoadingPreferences(true);
    try {
      const response = await fetch(`http://localhost:8000/user/preferences?user_id=${userId}`);
      if (response.ok) {
        const data = await response.json();
        setPreferences(data);
      }
    } catch (err: any) {
      console.error("Error loading preferences:", err);
    } finally {
      setLoadingPreferences(false);
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
              <span className="text-sm text-emerald-700">{user?.email}</span>
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
            ) : profileSummary ? (
              <p className="text-emerald-800 leading-relaxed">{profileSummary}</p>
            ) : (
              <p className="text-emerald-700 italic">
                No profile summary yet. Start planning trips and using the chat feature to build your travel profile!
              </p>
            )}
          </div>

          {/* Detailed Preferences */}
          <div className="mb-8 rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold text-emerald-900">Your Preferences</h2>
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
                      No preferences saved yet. Use the chat feature when planning trips to start building your profile!
                    </p>
                  )}
              </div>
            ) : (
              <p className="text-emerald-700 italic">Unable to load preferences at this time.</p>
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
        </main>
      </div>
    </>
  );
}

