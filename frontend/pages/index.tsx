import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { supabase } from "../lib/supabase";
import AuthModal from "../components/AuthModal";

export default function Home() {
  const router = useRouter();
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [numDays, setNumDays] = useState(5);
  const [budget, setBudget] = useState(2000);
  const [preferences, setPreferences] = useState<string[]>([]);
  const [likes, setLikes] = useState<string[]>([]);
  const [dislikes, setDislikes] = useState<string[]>([]);
  const [dietaryRestrictions, setDietaryRestrictions] = useState<string[]>([]);
  const [mode, setMode] = useState<"price-optimal" | "balanced">("balanced");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isScrolled, setIsScrolled] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [loadingPrefs, setLoadingPrefs] = useState(false);

  const preferenceOptions = [
    "Food",
    "Art",
    "Outdoors",
    "History",
    "Nightlife",
    "Wellness",
    "Shopping",
    "Adventure",
  ];

  const dietaryOptions = ["vegetarian", "vegan", "gluten-free", "dairy-free", "halal", "kosher", "pescatarian"];

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end >= start) {
        const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        setNumDays(Math.max(1, diff));
      }
    }
  }, [startDate, endDate]);

  // Check for authenticated user and load preferences
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserPreferences(session.user.id);
      }
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserPreferences(session.user.id);
      } else {
        setLikes([]);
        setDislikes([]);
        setDietaryRestrictions([]);
        setPreferences([]);
      }
    });
  }, []);

  const loadUserPreferences = async (userId: string) => {
    setLoadingPrefs(true);
    try {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = not found
        console.error('Error loading preferences:', error);
      } else if (data) {
        setLikes(data.likes || []);
        setDislikes(data.dislikes || []);
        setDietaryRestrictions(data.dietary_restrictions || []);
        setPreferences(data.preferences || []);
      }
    } catch (err) {
      console.error('Error loading preferences:', err);
    } finally {
      setLoadingPrefs(false);
    }
  };

  const saveUserPreferences = async () => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('user_preferences')
        .upsert({
          user_id: user.id,
          likes,
          dislikes,
          dietary_restrictions: dietaryRestrictions,
          preferences,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;
    } catch (err) {
      console.error('Error saving preferences:', err);
    }
  };

  const handleAuthSuccess = async () => {
    // Get the current session after authentication
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setUser(session.user);
      await loadUserPreferences(session.user.id);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setLikes([]);
    setDislikes([]);
    setDietaryRestrictions([]);
    setPreferences([]);
  };

  const togglePreference = (pref: string) => {
    setPreferences((prev) => {
      const newPrefs = prev.includes(pref) 
        ? prev.filter((p) => p !== pref) 
        : [...prev, pref];
      // Save preferences if user is logged in
      if (user) {
        setTimeout(() => saveUserPreferences(), 100);
      }
      return newPrefs;
    });
  };

  const handlePlanTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
          throw new Error("Please provide valid travel dates.");
        }
        if (end < start) {
          throw new Error("End date must be after start date.");
        }
      }

      const response = await fetch("http://localhost:8000/generate_itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination,
          origin: origin || undefined,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          num_days: numDays,
          budget,
          preferences,
          likes,
          dislikes,
          dietary_restrictions: dietaryRestrictions,
          mode,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Failed to generate itinerary" }));
        throw new Error(errorData.detail || "Failed to generate itinerary");
      }

      const data = await response.json();
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
    <>
      <Head>
        <title>GreenTrip | Sustainable + Value Travel</title>
        <meta
          name="description"
          content="Discover smarter, greener journeys curated to balance cost, experience, and sustainability."
        />
      </Head>

      <div className="min-h-screen bg-white">
        {/* Header / Navbar */}
        <header
          className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
            isScrolled
              ? "bg-[#0a1929]/95 backdrop-blur-md shadow-lg"
              : "bg-transparent"
          }`}
        >
          <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
            <div className="text-2xl font-bold text-[#34d399]">TripSmith</div>
            <div className="hidden items-center gap-8 md:flex">
              <a
                href="#experiences"
                className="text-sm font-medium text-white transition hover:text-[#34d399]"
              >
                Experiences
              </a>
              <a
                href="#sustainability"
                className="text-sm font-medium text-white transition hover:text-[#34d399]"
              >
                Sustainability
              </a>
              <a
                href="#membership"
                className="text-sm font-medium text-white transition hover:text-[#34d399]"
              >
                Membership
              </a>
            </div>
            <div className="flex items-center gap-4">
              {user ? (
                <>
                  <span className="text-sm text-white/80">{user.email}</span>
                  <button
                    onClick={handleSignOut}
                    className="rounded-full px-4 py-2 text-sm font-medium text-white transition hover:text-[#34d399]"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="rounded-full px-4 py-2 text-sm font-medium text-white transition hover:text-[#34d399]"
                >
                  Sign In / Sign Up
                </button>
              )}
            </div>
          </nav>
        </header>

        {/* Hero Section */}
        <section className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a1929] via-[#1e3a5f] via-[#2d5a4f] to-[#1b5e20] px-6 pt-24 pb-32">
          <div className="mx-auto max-w-4xl text-center">
            <div className="animate-fade-in-up space-y-6">
              <div className="mb-4 text-5xl">🌍</div>
              <h1 className="text-5xl font-bold leading-tight text-white md:text-7xl">
                Smarter Trips. Smaller Footprints.
              </h1>
              <p className="mx-auto max-w-2xl text-lg text-green-100 md:text-xl">
                Discover smarter, greener journeys curated to balance cost,
                experience, and sustainability.
              </p>
            </div>
          </div>
        </section>

        {/* Trip Search Bar */}
        <section className="relative -mt-20 px-6">
          <div className="mx-auto max-w-6xl">
            <form
              onSubmit={handlePlanTrip}
              className="rounded-2xl bg-gradient-to-br from-[#e0f2fe] to-[#d1fae5] p-8 shadow-2xl"
            >
              {/* First Row: 5 Fields */}
              <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-5">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-[#0a1929]">
                    Traveling from
                  </label>
                  <input
                    type="text"
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                    placeholder="e.g. New York"
                    className="w-full rounded-lg border border-blue-200 bg-white px-4 py-3 text-[#0a1929] outline-none transition focus:border-[#34d399] focus:ring-2 focus:ring-[#34d399]"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-[#0a1929]">
                    Destination to
                  </label>
                  <input
                    type="text"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="e.g. Paris"
                    className="w-full rounded-lg border border-blue-200 bg-white px-4 py-3 text-[#0a1929] outline-none transition focus:border-[#34d399] focus:ring-2 focus:ring-[#34d399]"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-[#0a1929]">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-lg border border-blue-200 bg-white px-4 py-3 text-[#0a1929] outline-none transition focus:border-[#34d399] focus:ring-2 focus:ring-[#34d399]"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-[#0a1929]">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    min={startDate || undefined}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-lg border border-blue-200 bg-white px-4 py-3 text-[#0a1929] outline-none transition focus:border-[#34d399] focus:ring-2 focus:ring-[#34d399]"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-[#0a1929]">
                    Budget (USD)
                  </label>
                  <input
                    type="number"
                    min="100"
                    step="100"
                    value={budget}
                    onChange={(e) => setBudget(Number(e.target.value))}
                    placeholder="2000"
                    className="w-full rounded-lg border border-blue-200 bg-white px-4 py-3 text-[#0a1929] outline-none transition focus:border-[#34d399] focus:ring-2 focus:ring-[#34d399]"
                    required
                  />
                </div>
              </div>

              {/* Second Row: Activity Chips */}
              <div className="mb-6">
                <label className="mb-3 block text-sm font-semibold text-[#0a1929]">
                  Select Activities
                </label>
                <div className="flex flex-wrap gap-2">
                  {preferenceOptions.map((pref) => (
                    <button
                      key={pref}
                      type="button"
                      onClick={() => togglePreference(pref.toLowerCase())}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                        preferences.includes(pref.toLowerCase())
                          ? "bg-gradient-to-r from-[#1e3a5f] to-[#1b5e20] text-white shadow-md"
                          : "bg-white text-[#0a1929] hover:bg-blue-50"
                      }`}
                    >
                      {pref}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dietary Restrictions - Only shown when logged in */}
              {user && (
                <div className="mb-6">
                  <label className="mb-3 block text-sm font-semibold text-[#0a1929]">
                    Dietary Restrictions
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {dietaryOptions.map((diet) => (
                      <button
                        key={diet}
                        type="button"
                        onClick={() => {
                          const newRestrictions = dietaryRestrictions.includes(diet)
                            ? dietaryRestrictions.filter((d) => d !== diet)
                            : [...dietaryRestrictions, diet];
                          setDietaryRestrictions(newRestrictions);
                          saveUserPreferences();
                        }}
                        className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                          dietaryRestrictions.includes(diet)
                            ? "bg-gradient-to-r from-amber-500 to-amber-400 text-white shadow-md"
                            : "bg-white text-[#0a1929] hover:bg-blue-50 border border-blue-200"
                        }`}
                      >
                        {diet.charAt(0).toUpperCase() + diet.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Likes and Dislikes - Only shown when logged in */}
              {user && (
                <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-[#0a1929]">
                      Likes
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. museums, hiking, local cuisine"
                      value={likes.join(", ")}
                      onChange={(e) => {
                        const newLikes = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                        setLikes(newLikes);
                        saveUserPreferences();
                      }}
                      className="w-full rounded-lg border border-blue-200 bg-white px-4 py-3 text-sm text-[#0a1929] outline-none transition focus:border-[#34d399] focus:ring-2 focus:ring-[#34d399]"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-[#0a1929]">
                      Dislikes
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. crowds, nightlife, fast food"
                      value={dislikes.join(", ")}
                      onChange={(e) => {
                        const newDislikes = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                        setDislikes(newDislikes);
                        saveUserPreferences();
                      }}
                      className="w-full rounded-lg border border-blue-200 bg-white px-4 py-3 text-sm text-[#0a1929] outline-none transition focus:border-[#34d399] focus:ring-2 focus:ring-[#34d399]"
                    />
                  </div>
                </div>
              )}

              {/* Optimization Mode */}
              <div className="mb-6">
                <label className="mb-3 block text-sm font-semibold text-[#0a1929]">
                  Optimization Focus
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50/70 p-4 transition hover:border-blue-300 cursor-pointer">
                    <input
                      type="radio"
                      name="mode"
                      value="price-optimal"
                      checked={mode === "price-optimal"}
                      onChange={() => setMode("price-optimal")}
                      className="h-4 w-4 text-blue-600 focus:ring-0"
                    />
                    <div>
                      <p className="text-sm font-semibold text-[#0a1929]">Price-Optimal</p>
                      <p className="text-xs text-[#1e3a5f]">
                        Maximize value while preserving eco standards.
                      </p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 rounded-xl border border-blue-200 bg-white p-4 transition hover:border-blue-300 cursor-pointer">
                    <input
                      type="radio"
                      name="mode"
                      value="balanced"
                      checked={mode === "balanced"}
                      onChange={() => setMode("balanced")}
                      className="h-4 w-4 text-blue-600 focus:ring-0"
                    />
                    <div>
                      <p className="text-sm font-semibold text-[#0a1929]">Balanced</p>
                      <p className="text-xs text-[#1e3a5f]">
                        Harmonize indulgence, culture, and footprint.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Plan My Trip Button */}
              <button
                type="submit"
                disabled={loading || !destination}
                className="w-full rounded-full bg-gradient-to-r from-blue-600 via-teal-500 to-green-600 px-8 py-4 text-lg font-semibold text-white shadow-lg transition hover:from-blue-700 hover:via-teal-600 hover:to-green-700 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Crafting your journey..." : "Plan My Trip"}
              </button>

              {error && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 shadow-sm">
                  {error}
                </div>
              )}
            </form>
          </div>
        </section>

        {/* Mission Section */}
        <section className="bg-white px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <h2 className="mb-6 text-center text-4xl font-bold text-[#0a1929]">
              Our Mission
            </h2>
            <p className="mx-auto max-w-3xl text-center text-lg text-[#1e3a5f]">
              We're building the future of sustainable, data-driven travel
              optimization. Our platform creates carbon-aware itineraries that
              balance adventure, value, and environmental responsibility—helping
              you explore the world while protecting it.
            </p>

            {/* Icon Cards */}
            <div className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-3">
              <div className="group rounded-2xl border border-blue-100 bg-white p-8 text-center shadow-sm transition hover:shadow-lg">
                <div className="mb-4 text-5xl">🌍</div>
                <h3 className="mb-2 text-xl font-semibold text-[#0a1929]">
                  Eco Optimization
                </h3>
                <p className="text-[#1e3a5f]">
                  Every trip is optimized for minimal carbon footprint while
                  maximizing your experience.
                </p>
              </div>
              <div className="group rounded-2xl border border-blue-100 bg-white p-8 text-center shadow-sm transition hover:shadow-lg">
                <div className="mb-4 text-5xl">💸</div>
                <h3 className="mb-2 text-xl font-semibold text-[#0a1929]">
                  Value Transparency
                </h3>
                <p className="text-[#1e3a5f]">
                  Clear pricing and cost breakdowns so you know exactly what
                  you're paying for.
                </p>
              </div>
              <div className="group rounded-2xl border border-blue-100 bg-white p-8 text-center shadow-sm transition hover:shadow-lg">
                <div className="mb-4 text-5xl">✈️</div>
                <h3 className="mb-2 text-xl font-semibold text-[#0a1929]">
                  Personalized Planning
                </h3>
                <p className="text-[#1e3a5f]">
                  AI-powered itineraries tailored to your preferences, budget,
                  and travel style.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Testimonials Section */}
        <section className="bg-gradient-to-br from-[#e0f2fe] to-[#d1fae5] px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <h2 className="mb-12 text-center text-4xl font-bold text-[#0a1929]">
              Traveler Stories
            </h2>
            <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
              {[
                {
                  name: "Sarah Chen",
                  quote:
                    "GreenTrip planned my perfect 10-day Japan trip. Every detail was thoughtful, sustainable, and within budget. Best travel experience ever!",
                  rating: 5,
                },
                {
                  name: "Marcus Johnson",
                  quote:
                    "As someone who cares about the environment, I love how GreenTrip balances adventure with carbon awareness. The itinerary was spot-on.",
                  rating: 5,
                },
                {
                  name: "Emma Rodriguez",
                  quote:
                    "The personalized recommendations were incredible. Found hidden gems I never would have discovered on my own. Highly recommend!",
                  rating: 5,
                },
              ].map((testimonial, idx) => (
                <div
                  key={idx}
                  className="group rounded-2xl bg-white p-8 shadow-md transition hover:shadow-xl"
                >
                  <div className="mb-4 flex">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <span key={i} className="text-yellow-400">
                        ★
                      </span>
                    ))}
                  </div>
                  <p className="mb-4 text-[#1e3a5f] italic">
                    "{testimonial.quote}"
                  </p>
                  <p className="font-semibold text-[#0a1929]">
                    — {testimonial.name}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-gradient-to-br from-[#0a1929] via-[#1e3a5f] to-[#1b5e20] px-6 py-16 text-white">
          <div className="mx-auto max-w-6xl">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
              <div>
                <h3 className="mb-4 text-lg font-semibold">Company</h3>
                <ul className="space-y-2 text-sm text-blue-200">
                  <li>
                    <a href="#" className="hover:text-white transition">
                      About Us
                    </a>
                  </li>
                  <li>
                    <a href="#" className="hover:text-white transition">
                      Careers
                    </a>
                  </li>
                  <li>
                    <a href="#" className="hover:text-white transition">
                      Press
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="mb-4 text-lg font-semibold">Contact</h3>
                <ul className="space-y-2 text-sm text-blue-200">
                  <li>
                    <a href="#" className="hover:text-white transition">
                      Support
                    </a>
                  </li>
                  <li>
                    <a href="#" className="hover:text-white transition">
                      hello@greentrip.com
                    </a>
                  </li>
                  <li>
                    <a href="#" className="hover:text-white transition">
                      FAQ
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="mb-4 text-lg font-semibold">Socials</h3>
                <ul className="space-y-2 text-sm text-blue-200">
                  <li>
                    <a href="#" className="hover:text-white transition">
                      Twitter
                    </a>
                  </li>
                  <li>
                    <a href="#" className="hover:text-white transition">
                      Instagram
                    </a>
                  </li>
                  <li>
                    <a href="#" className="hover:text-white transition">
                      LinkedIn
                    </a>
                  </li>
                </ul>
              </div>
            </div>
            <div className="mt-12 border-t border-blue-800 pt-8 text-center text-sm text-blue-200">
              © 2025 GreenTrip. All rights reserved.
            </div>
          </div>
        </footer>
      </div>

      <style jsx global>{`
        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.8s ease-out;
        }
      `}</style>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onAuthSuccess={handleAuthSuccess}
      />
    </>
  );
}
