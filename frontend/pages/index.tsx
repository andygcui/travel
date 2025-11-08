import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { supabase } from "../lib/supabase";
import AuthModal from "../components/AuthModal";
import useGsapScrollAnimations from "../hooks/useGsapScrollAnimations";

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

  // Initialize GSAP scroll animations
  useGsapScrollAnimations();

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
      // Load manual preferences from user_preferences table
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

      // Also load chat-learned preferences
      try {
        const response = await fetch(`http://localhost:8000/user/preferences?user_id=${userId}`);
        if (response.ok) {
          const chatPrefs = await response.json();
          
          // Merge long-term chat preferences with manual preferences
          if (chatPrefs.long_term && chatPrefs.long_term.length > 0) {
            const chatLikes = chatPrefs.long_term
              .filter((p: any) => p.preference_category === 'activity' && !p.preference_value.startsWith('avoid'))
              .map((p: any) => p.preference_value);
            const chatDislikes = chatPrefs.long_term
              .filter((p: any) => p.preference_category === 'activity' && p.preference_value.startsWith('avoid'))
              .map((p: any) => p.preference_value.replace('avoid ', ''));
            const chatDietary = chatPrefs.long_term
              .filter((p: any) => p.preference_category === 'dietary')
              .map((p: any) => p.preference_value);
            
            // Merge with existing preferences (avoid duplicates)
            setLikes((prev) => Array.from(new Set([...prev, ...chatLikes])));
            setDislikes((prev) => Array.from(new Set([...prev, ...chatDislikes])));
            setDietaryRestrictions((prev) => Array.from(new Set([...prev, ...chatDietary])));
          }
        }
      } catch (err) {
        console.error('Error loading chat-learned preferences:', err);
        // Continue even if chat preferences fail to load
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
      
      // Try to save any pending preferences that might not have been saved during signup
      // This handles the case where preferences were selected but couldn't be saved due to RLS
      const pendingPrefs = sessionStorage.getItem('pending_preferences');
      if (pendingPrefs) {
        try {
          const prefs = JSON.parse(pendingPrefs);
          await supabase
            .from('user_preferences')
            .upsert({
              user_id: session.user.id,
              preferences: prefs.preferences || [],
              likes: prefs.likes || [],
              dislikes: prefs.dislikes || [],
              dietary_restrictions: prefs.dietary || [],
              updated_at: new Date().toISOString(),
            }, {
              onConflict: 'user_id'
            });
          sessionStorage.removeItem('pending_preferences');
          // Reload preferences to show the newly saved ones
          await loadUserPreferences(session.user.id);
        } catch (err) {
          console.error('Error saving pending preferences:', err);
        }
      }
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
              ? "bg-[#0f3d2e]/80 backdrop-blur-md shadow-lg"
              : "bg-transparent"
          }`}
        >
          <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
            <div className="text-2xl font-bold text-[#3cb371]">GreenTrip</div>
            <div className="flex items-center gap-4">
              {user ? (
                <>
                  <a
                    href="/dashboard"
                    className="rounded-full px-4 py-2 text-sm font-medium text-white transition hover:text-[#3cb371]"
                  >
                    📊 Dashboard
                  </a>
                  <span className="text-sm text-white/80">{user.email}</span>
                  <button
                    onClick={handleSignOut}
                    className="rounded-full px-4 py-2 text-sm font-medium text-white transition hover:text-[#3cb371]"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="rounded-full px-4 py-2 text-sm font-medium text-white transition hover:text-[#3cb371]"
                >
                  Login
                </button>
              )}
            </div>
          </nav>
        </header>

        {/* Hero Section */}
        <section className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f3d2e] via-[#1b5e20] to-[#0f3d2e] px-6 pt-24 pb-32 overflow-hidden">
          {/* Parallax background layer */}
          <div className="parallax-bg absolute inset-0 bg-gradient-to-br from-[#0f3d2e] via-[#1b5e20] to-[#0f3d2e]" />
          <div className="absolute inset-0 bg-black/50" />
          <div className="mx-auto max-w-4xl text-center relative z-10">
            <div className="hero-text space-y-6">
              <div className="reveal mb-4 text-5xl">🌍</div>
              <h1 className="reveal text-6xl md:text-7xl font-semibold text-white tracking-tight drop-shadow-lg">
                Smarter Trips. Smaller Footprints.
              </h1>
              <p className="reveal mx-auto max-w-2xl text-lg md:text-xl text-[#eaf6ee] mt-4">
                Discover smarter, greener journeys curated to balance cost,
                experience, and sustainability.
              </p>
            </div>
          </div>
        </section>

        {/* Trip Search Bar */}
        <section className="relative -mt-32 px-6 pb-12">
          <div className="mx-auto max-w-6xl">
            <form
              onSubmit={handlePlanTrip}
              className="reveal rounded-2xl bg-white/95 backdrop-blur-sm p-8 shadow-2xl border border-green-100"
            >
              {/* First Row: 5 Fields */}
              <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-5">
                <div className="form-field">
                  <label className="mb-2 block text-sm font-semibold text-[#0f3d2e]">
                    Traveling from
                  </label>
                  <input
                    type="text"
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                    placeholder="e.g. New York"
                    className="w-full rounded-lg border border-green-200 bg-white px-4 py-3 text-[#0f3d2e] outline-none transition focus:border-[#3cb371] focus:ring-2 focus:ring-[#3cb371]"
                  />
                </div>
                <div className="form-field">
                  <label className="mb-2 block text-sm font-semibold text-[#0f3d2e]">
                    Destination to
                  </label>
                  <input
                    type="text"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="e.g. Paris"
                    className="w-full rounded-lg border border-green-200 bg-white px-4 py-3 text-[#0f3d2e] outline-none transition focus:border-[#3cb371] focus:ring-2 focus:ring-[#3cb371]"
                  />
                </div>
                <div className="form-field">
                  <label className="mb-2 block text-sm font-semibold text-[#0f3d2e]">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-lg border border-green-200 bg-white px-4 py-3 text-[#0f3d2e] outline-none transition focus:border-[#3cb371] focus:ring-2 focus:ring-[#3cb371]"
                  />
                </div>
                <div className="form-field">
                  <label className="mb-2 block text-sm font-semibold text-[#0f3d2e]">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    min={startDate || undefined}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-lg border border-green-200 bg-white px-4 py-3 text-[#0f3d2e] outline-none transition focus:border-[#3cb371] focus:ring-2 focus:ring-[#3cb371]"
                  />
                </div>
                <div className="form-field">
                  <label className="mb-2 block text-sm font-semibold text-[#0f3d2e]">
                    Budget (USD)
                  </label>
                  <input
                    type="number"
                    min="100"
                    step="100"
                    value={budget}
                    onChange={(e) => setBudget(Number(e.target.value))}
                    placeholder="2000"
                    className="w-full rounded-lg border border-green-200 bg-white px-4 py-3 text-[#0f3d2e] outline-none transition focus:border-[#3cb371] focus:ring-2 focus:ring-[#3cb371]"
                    required
                  />
                </div>
              </div>

              {/* Second Row: Activity Chips */}
              <div className="mb-6">
                <label className="mb-3 block text-sm font-semibold text-[#0f3d2e]">
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
                          ? "bg-gradient-to-r from-[#3cb371] to-[#1b5e20] text-white shadow-md"
                          : "bg-white text-[#0f3d2e] hover:bg-[#eaf6ee] border border-green-200"
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
                  <label className="mb-3 block text-sm font-semibold text-[#0f3d2e]">
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
                            ? "bg-gradient-to-r from-[#3cb371] to-[#1b5e20] text-white shadow-md"
                            : "bg-white text-[#0f3d2e] hover:bg-[#eaf6ee] border border-green-200"
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
                    <label className="mb-2 block text-sm font-semibold text-[#0f3d2e]">
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
                      className="w-full rounded-lg border border-green-200 bg-white px-4 py-3 text-sm text-[#0f3d2e] outline-none transition focus:border-[#3cb371] focus:ring-2 focus:ring-[#3cb371]"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-[#0f3d2e]">
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
                      className="w-full rounded-lg border border-green-200 bg-white px-4 py-3 text-sm text-[#0f3d2e] outline-none transition focus:border-[#3cb371] focus:ring-2 focus:ring-[#3cb371]"
                    />
                  </div>
                </div>
              )}

              {/* Optimization Mode removed per request */}

              {/* Plan My Trip Button */}
              <button
                type="submit"
                disabled={loading || !destination}
                className="relative w-full rounded-full bg-gradient-to-r from-[#3cb371] to-[#1b5e20] px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-[#3cb371]/30 transition hover:from-[#2ea55f] hover:to-[#155d1a] hover:shadow-xl hover:shadow-[#3cb371]/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="relative z-10">
                  {loading ? "Crafting your journey..." : "Plan My Trip"}
                </span>
                {/* Glow effect */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-[#3cb371] to-[#1b5e20] opacity-50 blur-xl" />
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
        <section className="bg-white px-6 pt-12 pb-12">
          <div className="mx-auto max-w-6xl">
            <h2 className="reveal mb-6 text-center text-4xl font-bold text-[#0f3d2e]">
              Our Mission
            </h2>
            <p className="reveal mx-auto max-w-3xl text-center text-lg text-[#1b5e20]">
              We're building the future of sustainable, data-driven travel
              optimization. Our platform creates carbon-aware itineraries that
              balance adventure, value, and environmental responsibility—helping
              you explore the world while protecting it.
            </p>

            {/* Icon Cards */}
            <div className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-3">
              <div className="mission-card group rounded-2xl border border-green-100 bg-white p-8 text-center shadow-sm transition hover:shadow-lg">
                <div className="mb-4 text-5xl">🌍</div>
                <h3 className="mb-2 text-xl font-semibold text-[#0f3d2e]">
                  Eco Optimization
                </h3>
                <p className="text-[#1b5e20]">
                  Every trip is optimized for minimal carbon footprint while
                  maximizing your experience.
                </p>
              </div>
              <div className="mission-card group rounded-2xl border border-green-100 bg-white p-8 text-center shadow-sm transition hover:shadow-lg">
                <div className="mb-4 text-5xl">💸</div>
                <h3 className="mb-2 text-xl font-semibold text-[#0f3d2e]">
                  Value Transparency
                </h3>
                <p className="text-[#1b5e20]">
                  Clear pricing and cost breakdowns so you know exactly what
                  you're paying for.
                </p>
              </div>
              <div className="mission-card group rounded-2xl border border-green-100 bg-white p-8 text-center shadow-sm transition hover:shadow-lg">
                <div className="mb-4 text-5xl">✈️</div>
                <h3 className="mb-2 text-xl font-semibold text-[#0f3d2e]">
                  Personalized Planning
                </h3>
                <p className="text-[#1b5e20]">
                  AI-powered itineraries tailored to your preferences, budget,
                  and travel style.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Testimonials Section */}
        <section className="bg-[#eaf6ee] px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <h2 className="reveal mb-12 text-center text-4xl font-bold text-[#0f3d2e]">
              Traveler Stories
            </h2>
            <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
              {[
                {
                  name: "Brooke Xu",
                  quote:
                    "GreenTrip planned my perfect 10-day Japan trip. Every detail was thoughtful, sustainable, and within budget. Best travel experience ever!",
                  rating: 5,
                },
                {
                  name: "Tian Pu",
                  quote:
                    "As someone who cares about the environment, I love how GreenTrip balances adventure with carbon awareness. The itinerary was spot-on.",
                  rating: 5,
                },
                {
                  name: "Arya Paliwal",
                  quote:
                    "The personalized recommendations were incredible. Found hidden gems I never would have discovered on my own. Highly recommend!",
                  rating: 5,
                },
              ].map((testimonial, idx) => (
                <div
                  key={idx}
                  className="testimonial-card group rounded-2xl bg-white p-8 shadow-md transition hover:shadow-xl"
                >
                  <div className="mb-4 flex">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <span key={i} className="text-yellow-400">
                        ★
                      </span>
                    ))}
                  </div>
                  <p className="mb-4 text-[#1b5e20] italic">
                    "{testimonial.quote}"
                  </p>
                  <p className="font-semibold text-[#0f3d2e]">
                    — {testimonial.name}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-[#0f3d2e] px-6 py-16 text-white">
          <div className="mx-auto max-w-6xl">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
              <div>
                <h3 className="mb-4 text-lg font-semibold">Company</h3>
                <ul className="space-y-2 text-sm text-[#eaf6ee]">
                  <li>
                    <a href="#" className="hover:text-[#3cb371] transition">
                      About Us
                    </a>
                  </li>
                  <li>
                    <a href="#" className="hover:text-[#3cb371] transition">
                      Careers
                    </a>
                  </li>
                  <li>
                    <a href="#" className="hover:text-[#3cb371] transition">
                      Press
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="mb-4 text-lg font-semibold">Contact</h3>
                <ul className="space-y-2 text-sm text-[#eaf6ee]">
                  <li>
                    <a href="#" className="hover:text-[#3cb371] transition">
                      Support
                    </a>
                  </li>
                  <li>
                    <a href="#" className="hover:text-[#3cb371] transition">
                      hello@greentrip.com
                    </a>
                  </li>
                  <li>
                    <a href="#" className="hover:text-[#3cb371] transition">
                      FAQ
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="mb-4 text-lg font-semibold">Socials</h3>
                <ul className="space-y-2 text-sm text-[#eaf6ee]">
                  <li>
                    <a href="#" className="hover:text-[#3cb371] transition">
                      Twitter
                    </a>
                  </li>
                  <li>
                    <a href="#" className="hover:text-[#3cb371] transition">
                      Instagram
                    </a>
                  </li>
                  <li>
                    <a href="#" className="hover:text-[#3cb371] transition">
                      LinkedIn
                    </a>
                  </li>
                </ul>
              </div>
            </div>
            <div className="mt-12 border-t border-green-800 pt-8 text-center text-sm text-[#eaf6ee]">
              © 2025 GreenTrip. All rights reserved.
            </div>
          </div>
        </footer>
      </div>


      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onAuthSuccess={handleAuthSuccess}
      />
    </>
  );
}
