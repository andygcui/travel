import Head from "next/head";
import Link from "next/link";
import { useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

interface EmissionCategory {
  name: string;
  icon: string;
  items: {
    activity: string;
    co2_kg: number;
    description: string;
    comparison?: string;
  }[];
}

export default function Emissions() {
  // Register GSAP plugin
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      gsap.registerPlugin(ScrollTrigger);
    } catch (error) {
      console.error("Error registering GSAP plugins:", error);
      return;
    }

    // Hero section fade in
    gsap.from(".hero-section", {
      opacity: 0,
      y: 60,
      duration: 1.2,
      ease: "power2.out",
    });

    // Staggered reveal for baseline cards
    gsap.utils.toArray<HTMLElement>(".baseline-card").forEach((el, i) => {
      gsap.from(el, {
        scrollTrigger: {
          trigger: el,
          start: "top 85%",
          toggleActions: "play none none reverse",
        },
        opacity: 0,
        y: 60,
        scale: 0.9,
        duration: 1,
        delay: i * 0.15,
        ease: "power2.out",
      });
    });

    // Category sections fade up
    gsap.utils.toArray<HTMLElement>(".category-section").forEach((el, i) => {
      gsap.from(el, {
        scrollTrigger: {
          trigger: el,
          start: "top 85%",
          toggleActions: "play none none reverse",
        },
        opacity: 0,
        y: 80,
        duration: 1.2,
        delay: i * 0.1,
        ease: "power2.out",
      });
    });

    // Staggered item cards within categories
    gsap.utils.toArray<HTMLElement>(".emission-item").forEach((el, i) => {
      gsap.from(el, {
        scrollTrigger: {
          trigger: el,
          start: "top 90%",
          toggleActions: "play none none reverse",
        },
        opacity: 0,
        y: 40,
        scale: 0.95,
        duration: 0.8,
        delay: (i % 6) * 0.08,
        ease: "power2.out",
      });
    });

    // Fun facts cards - alternate from left/right
    gsap.utils.toArray<HTMLElement>(".fun-fact-card").forEach((el, i) => {
      const direction = i % 2 === 0 ? -60 : 60;
      gsap.from(el, {
        scrollTrigger: {
          trigger: el,
          start: "top 85%",
          toggleActions: "play none none reverse",
        },
        opacity: 0,
        x: direction,
        y: 40,
        duration: 1,
        delay: (i % 3) * 0.1,
        ease: "power2.out",
      });
    });

    // Benefits section cards
    gsap.utils.toArray<HTMLElement>(".benefit-card").forEach((el, i) => {
      gsap.from(el, {
        scrollTrigger: {
          trigger: el,
          start: "top 85%",
          toggleActions: "play none none reverse",
        },
        opacity: 0,
        y: 60,
        scale: 0.95,
        duration: 1,
        delay: (i % 2) * 0.1,
        ease: "power2.out",
      });
    });

    // Tips section cards
    gsap.utils.toArray<HTMLElement>(".tip-card").forEach((el, i) => {
      gsap.from(el, {
        scrollTrigger: {
          trigger: el,
          start: "top 85%",
          toggleActions: "play none none reverse",
        },
        opacity: 0,
        x: i % 2 === 0 ? -50 : 50,
        duration: 1,
        delay: (i % 2) * 0.1,
        ease: "power2.out",
      });
    });

    // CTA section fade in
    gsap.from(".cta-section", {
      scrollTrigger: {
        trigger: ".cta-section",
        start: "top 85%",
        toggleActions: "play none none reverse",
      },
      opacity: 0,
      y: 60,
      scale: 0.95,
      duration: 1.2,
      ease: "power2.out",
    });

    // Cleanup
    return () => {
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    };
  }, []);

  const emissionCategories: EmissionCategory[] = [
    {
      name: "Transportation",
      icon: "✈️",
      items: [
        {
          activity: "Short-haul flight (500 km)",
          co2_kg: 90,
          description: "Domestic or regional flights",
          comparison: "Equivalent to driving 360 km in a car",
        },
        {
          activity: "Medium-haul flight (1,500 km)",
          co2_kg: 270,
          description: "Intercontinental regional flights",
          comparison: "Equivalent to driving 1,080 km in a car",
        },
        {
          activity: "Long-haul flight (6,000 km)",
          co2_kg: 1080,
          description: "Transcontinental flights",
          comparison: "Equivalent to driving 4,320 km in a car",
        },
        {
          activity: "Car (gasoline, per 100 km)",
          co2_kg: 20,
          description: "Average passenger car",
          comparison: "About 0.2 kg CO₂ per km",
        },
        {
          activity: "Train (per 100 km)",
          co2_kg: 1.4,
          description: "Electric train (average)",
          comparison: "Much lower than flying or driving",
        },
        {
          activity: "Bus (per 100 km)",
          co2_kg: 8.9,
          description: "Intercity bus",
          comparison: "More efficient than cars per passenger",
        },
      ],
    },
    {
      name: "Accommodation",
      icon: "🏨",
      items: [
        {
          activity: "Hotel (per night, budget)",
          co2_kg: 8,
          description: "Basic accommodations",
          comparison: "Lower energy consumption",
        },
        {
          activity: "Hotel (per night, mid-range)",
          co2_kg: 15,
          description: "Standard hotel",
          comparison: "Average energy and water usage",
        },
        {
          activity: "Hotel (per night, luxury)",
          co2_kg: 30,
          description: "High-end hotels",
          comparison: "Higher energy consumption, amenities",
        },
        {
          activity: "Hostel (per night)",
          co2_kg: 5,
          description: "Shared accommodations",
          comparison: "Most efficient option",
        },
        {
          activity: "Airbnb/Apartment (per night)",
          co2_kg: 12,
          description: "Private rental",
          comparison: "Similar to mid-range hotel",
        },
      ],
    },
    {
      name: "Activities & Food",
      icon: "🍽️",
      items: [
        {
          activity: "Restaurant meal (per meal)",
          co2_kg: 2.5,
          description: "Average restaurant meal",
          comparison: "Includes food production and preparation",
        },
        {
          activity: "Fast food meal (per meal)",
          co2_kg: 1.2,
          description: "Quick service restaurant",
          comparison: "Lower than sit-down restaurants",
        },
        {
          activity: "Museum visit",
          co2_kg: 0.5,
          description: "Entry and facility energy",
          comparison: "Very low impact activity",
        },
        {
          activity: "Theme park (per day)",
          co2_kg: 15,
          description: "Large theme parks",
          comparison: "High energy consumption",
        },
        {
          activity: "Shopping (per $100 spent)",
          co2_kg: 5,
          description: "Retail shopping",
          comparison: "Includes production and transport",
        },
      ],
    },
    {
      name: "Daily Baselines",
      icon: "📊",
      items: [
        {
          activity: "Average person (daily)",
          co2_kg: 16.4,
          description: "Global average daily emissions",
          comparison: "Includes all activities",
        },
        {
          activity: "US person (daily)",
          co2_kg: 45,
          description: "US average daily emissions",
          comparison: "Higher than global average",
        },
        {
          activity: "Sustainable target (daily)",
          co2_kg: 5.5,
          description: "Target for climate goals",
          comparison: "2 tons CO₂ per year per person",
        },
        {
          activity: "One tree (per year)",
          co2_kg: -22,
          description: "CO₂ absorbed by one tree",
          comparison: "Trees help offset emissions",
        },
      ],
    },
  ];

  return (
    <>
      <Head>
        <title>Carbon Emissions Guide | GreenTrip</title>
        <meta name="description" content="Learn about carbon emissions from travel and how to reduce your footprint" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-amber-50">
        {/* Header */}
        <header className="sticky top-0 z-50 border-b border-emerald-100/50 bg-white/90 backdrop-blur-md shadow-sm">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <Link href="/" className="text-2xl font-bold text-[#34d399] transition hover:text-[#3cb371]">
                GreenTrip
              </Link>
              <span className="text-sm font-medium text-emerald-600">Carbon Emissions Guide</span>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-sm"
              >
                Plan a Trip
              </Link>
              <Link
                href="/dashboard"
                className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-sm"
              >
                Profile
              </Link>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="mx-auto max-w-7xl px-6 py-16">
          {/* Hero Section */}
          <div className="hero-section mb-16 text-center">
            <h1 className="mb-6 text-6xl font-bold tracking-tight text-emerald-900 md:text-7xl">
              Understanding Travel Carbon Emissions
            </h1>
            <p className="mx-auto max-w-3xl text-xl text-emerald-700/90 leading-relaxed">
              Learn about carbon emissions from different travel activities and how to make more sustainable choices.
              All values are approximate and can vary based on specific circumstances.
            </p>
          </div>

          {/* Key Baselines */}
          <div className="mb-20 rounded-3xl border border-emerald-200/50 bg-gradient-to-br from-emerald-50 via-white to-emerald-50 p-10 shadow-lg backdrop-blur-sm">
            <h2 className="mb-8 text-center text-4xl font-bold text-emerald-900">Key Baselines</h2>
            <div className="grid gap-8 md:grid-cols-3">
              <div className="baseline-card group rounded-2xl border border-emerald-200/50 bg-gradient-to-br from-white to-emerald-50/30 p-8 shadow-md transition-all duration-300 hover:shadow-xl hover:scale-105">
                <div className="mb-4 text-5xl transition-transform duration-300 group-hover:scale-110">🌍</div>
                <h3 className="mb-3 text-xl font-bold text-emerald-900">Global Average</h3>
                <p className="mb-2 text-4xl font-bold text-emerald-600">16.4 kg</p>
                <p className="text-sm font-medium text-emerald-700/80">CO₂ per person per day</p>
              </div>
              <div className="baseline-card group rounded-2xl border border-emerald-200/50 bg-gradient-to-br from-white to-emerald-50/30 p-8 shadow-md transition-all duration-300 hover:shadow-xl hover:scale-105">
                <div className="mb-4 text-5xl transition-transform duration-300 group-hover:scale-110">🇺🇸</div>
                <h3 className="mb-3 text-xl font-bold text-emerald-900">US Average</h3>
                <p className="mb-2 text-4xl font-bold text-emerald-600">45 kg</p>
                <p className="text-sm font-medium text-emerald-700/80">CO₂ per person per day</p>
              </div>
              <div className="baseline-card group rounded-2xl border border-emerald-200/50 bg-gradient-to-br from-white to-emerald-50/30 p-8 shadow-md transition-all duration-300 hover:shadow-xl hover:scale-105">
                <div className="mb-4 text-5xl transition-transform duration-300 group-hover:scale-110">🎯</div>
                <h3 className="mb-3 text-xl font-bold text-emerald-900">Climate Target</h3>
                <p className="mb-2 text-4xl font-bold text-emerald-600">5.5 kg</p>
                <p className="text-sm font-medium text-emerald-700/80">CO₂ per person per day</p>
              </div>
            </div>
          </div>

          {/* Emission Categories */}
          <div className="space-y-16">
            {emissionCategories.map((category, categoryIdx) => (
              <div
                key={categoryIdx}
                className="category-section rounded-3xl border border-emerald-200/50 bg-gradient-to-br from-white via-emerald-50/20 to-white p-8 shadow-lg backdrop-blur-sm"
              >
                <div className="mb-8 flex items-center gap-4">
                  <span className="text-5xl transition-transform duration-300 hover:scale-110">{category.icon}</span>
                  <h2 className="text-3xl font-bold text-emerald-900">{category.name}</h2>
                </div>
                <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                  {category.items.map((item, itemIdx) => (
                    <div
                      key={itemIdx}
                      className="emission-item group rounded-2xl border border-emerald-200/50 bg-gradient-to-br from-white to-emerald-50/40 p-6 shadow-md transition-all duration-300 hover:border-emerald-300 hover:shadow-xl hover:scale-[1.02]"
                    >
                      <div className="mb-3 flex items-start justify-between">
                        <h3 className="flex-1 text-base font-bold text-emerald-900 leading-tight">{item.activity}</h3>
                        <div className="ml-3 text-right">
                          <div className="text-3xl font-bold text-emerald-600">{item.co2_kg}</div>
                          <div className="text-xs font-medium text-emerald-500">kg CO₂</div>
                        </div>
                      </div>
                      <p className="mb-2 text-sm text-emerald-700/90 leading-relaxed">{item.description}</p>
                      {item.comparison && (
                        <p className="text-xs italic text-emerald-600/80 border-t border-emerald-100 pt-2 mt-2">{item.comparison}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Fun Facts Section */}
          <div className="mt-20 rounded-3xl border border-blue-200/50 bg-gradient-to-br from-blue-50 via-emerald-50/50 to-blue-50 p-10 shadow-lg backdrop-blur-sm">
            <h2 className="mb-10 text-center text-4xl font-bold text-emerald-900">🌍 Fun Facts About Travel & Carbon Emissions</h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <div className="fun-fact-card group rounded-2xl border border-blue-200/50 bg-gradient-to-br from-white to-blue-50/30 p-7 shadow-md transition-all duration-300 hover:shadow-xl hover:scale-105">
                <div className="mb-4 text-5xl transition-transform duration-300 group-hover:scale-110">✈️</div>
                <h3 className="mb-3 text-lg font-bold text-emerald-900">Aviation Impact</h3>
                <p className="text-sm leading-relaxed text-emerald-700/90">
                  Aviation accounts for about 2.5% of global CO₂ emissions, but this number is growing rapidly as more people travel.
                </p>
              </div>
              <div className="fun-fact-card group rounded-2xl border border-blue-200/50 bg-gradient-to-br from-white to-blue-50/30 p-7 shadow-md transition-all duration-300 hover:shadow-xl hover:scale-105">
                <div className="mb-4 text-5xl transition-transform duration-300 group-hover:scale-110">🌳</div>
                <h3 className="mb-3 text-lg font-bold text-emerald-900">Tree Power</h3>
                <p className="text-sm leading-relaxed text-emerald-700/90">
                  One mature tree can absorb about 22 kg of CO₂ per year. To offset a round-trip flight from NYC to London, you'd need to plant about 50 trees!
                </p>
              </div>
              <div className="fun-fact-card group rounded-2xl border border-blue-200/50 bg-gradient-to-br from-white to-blue-50/30 p-7 shadow-md transition-all duration-300 hover:shadow-xl hover:scale-105">
                <div className="mb-4 text-5xl transition-transform duration-300 group-hover:scale-110">🚂</div>
                <h3 className="mb-3 text-lg font-bold text-emerald-900">Train vs Plane</h3>
                <p className="text-sm leading-relaxed text-emerald-700/90">
                  Taking a train instead of a plane for a 500 km journey can reduce your carbon footprint by up to 90%!
                </p>
              </div>
              <div className="fun-fact-card group rounded-2xl border border-blue-200/50 bg-gradient-to-br from-white to-blue-50/30 p-7 shadow-md transition-all duration-300 hover:shadow-xl hover:scale-105">
                <div className="mb-4 text-5xl transition-transform duration-300 group-hover:scale-110">🍔</div>
                <h3 className="mb-3 text-lg font-bold text-emerald-900">Food Footprint</h3>
                <p className="text-sm leading-relaxed text-emerald-700/90">
                  A single hamburger has a carbon footprint of about 2.5 kg CO₂ - that's more than driving 10 km in a car!
                </p>
              </div>
              <div className="fun-fact-card group rounded-2xl border border-blue-200/50 bg-gradient-to-br from-white to-blue-50/30 p-7 shadow-md transition-all duration-300 hover:shadow-xl hover:scale-105">
                <div className="mb-4 text-5xl transition-transform duration-300 group-hover:scale-110">🌊</div>
                <h3 className="mb-3 text-lg font-bold text-emerald-900">Cruise Ships</h3>
                <p className="text-sm leading-relaxed text-emerald-700/90">
                  A large cruise ship can emit as much CO₂ as 12,000 cars in a single day. That's equivalent to a small city!
                </p>
              </div>
              <div className="fun-fact-card group rounded-2xl border border-blue-200/50 bg-gradient-to-br from-white to-blue-50/30 p-7 shadow-md transition-all duration-300 hover:shadow-xl hover:scale-105">
                <div className="mb-4 text-5xl transition-transform duration-300 group-hover:scale-110">💡</div>
                <h3 className="mb-3 text-lg font-bold text-emerald-900">Small Changes, Big Impact</h3>
                <p className="text-sm leading-relaxed text-emerald-700/90">
                  If everyone chose one train journey instead of a short flight per year, we could save millions of tons of CO₂!
                </p>
              </div>
            </div>
          </div>

          {/* Incentives Section */}
          <div className="mt-20 rounded-3xl border border-emerald-200/50 bg-gradient-to-br from-emerald-50 via-green-50/50 to-emerald-50 p-10 shadow-lg backdrop-blur-sm">
            <h2 className="mb-10 text-center text-4xl font-bold text-emerald-900">🎁 Why Use GreenTrip for Sustainable Travel?</h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <div className="benefit-card group rounded-2xl border border-emerald-200/50 bg-gradient-to-br from-white to-emerald-50/30 p-7 shadow-md transition-all duration-300 hover:shadow-xl hover:scale-105">
              <div className="mb-4 flex items-center gap-3">
                <div className="text-5xl transition-transform duration-300 group-hover:scale-110">💰</div>
                <h3 className="text-xl font-bold text-emerald-900">Save Money & Emissions</h3>
              </div>
              <p className="leading-relaxed text-emerald-700/90">
                Our platform finds the best balance between cost and carbon footprint. You can often save money while reducing your environmental impact by choosing more efficient transportation options.
              </p>
            </div>
            <div className="benefit-card group rounded-2xl border border-emerald-200/50 bg-gradient-to-br from-white to-emerald-50/30 p-7 shadow-md transition-all duration-300 hover:shadow-xl hover:scale-105">
              <div className="mb-4 flex items-center gap-3">
                <div className="text-5xl transition-transform duration-300 group-hover:scale-110">🌱</div>
                <h3 className="text-xl font-bold text-emerald-900">Make Informed Choices</h3>
              </div>
              <p className="leading-relaxed text-emerald-700/90">
                See the carbon footprint of every trip option before you book. Knowledge is power - make decisions that align with your values.
              </p>
            </div>
            <div className="benefit-card group rounded-2xl border border-emerald-200/50 bg-gradient-to-br from-white to-emerald-50/30 p-7 shadow-md transition-all duration-300 hover:shadow-xl hover:scale-105">
              <div className="mb-4 flex items-center gap-3">
                <div className="text-5xl transition-transform duration-300 group-hover:scale-110">🏆</div>
                <h3 className="text-xl font-bold text-emerald-900">Build Your Green Profile</h3>
              </div>
              <p className="leading-relaxed text-emerald-700/90">
                Track your travel carbon footprint over time. Watch your impact decrease as you make more sustainable choices and feel good about your contribution to the planet.
              </p>
            </div>
            <div className="benefit-card group rounded-2xl border border-emerald-200/50 bg-gradient-to-br from-white to-emerald-50/30 p-7 shadow-md transition-all duration-300 hover:shadow-xl hover:scale-105">
              <div className="mb-4 flex items-center gap-3">
                <div className="text-5xl transition-transform duration-300 group-hover:scale-110">🎯</div>
                <h3 className="text-xl font-bold text-emerald-900">Personalized Recommendations</h3>
              </div>
              <p className="leading-relaxed text-emerald-700/90">
                Get itinerary suggestions that match your preferences while prioritizing lower-emission options. You don't have to sacrifice your travel experience to be sustainable.
              </p>
            </div>
            <div className="benefit-card group rounded-2xl border border-emerald-200/50 bg-gradient-to-br from-white to-emerald-50/30 p-7 shadow-md transition-all duration-300 hover:shadow-xl hover:scale-105">
              <div className="mb-4 flex items-center gap-3">
                <div className="text-5xl transition-transform duration-300 group-hover:scale-110">🌍</div>
                <h3 className="text-xl font-bold text-emerald-900">Join the Movement</h3>
              </div>
              <p className="leading-relaxed text-emerald-700/90">
                Be part of a growing community of conscious travelers. Every sustainable trip you take inspires others and creates a positive ripple effect.
              </p>
            </div>
            <div className="benefit-card group rounded-2xl border border-emerald-200/50 bg-gradient-to-br from-white to-emerald-50/30 p-7 shadow-md transition-all duration-300 hover:shadow-xl hover:scale-105">
              <div className="mb-4 flex items-center gap-3">
                <div className="text-5xl transition-transform duration-300 group-hover:scale-110">✨</div>
                <h3 className="text-xl font-bold text-emerald-900">Discover Hidden Gems</h3>
              </div>
              <p className="leading-relaxed text-emerald-700/90">
                Lower-emission travel often means exploring local destinations and authentic experiences you might have missed. Sometimes the best trips are closer than you think!
              </p>
            </div>
          </div>
          </div>

          {/* Tips Section */}
          <div className="mt-20 rounded-3xl border border-amber-200/50 bg-gradient-to-br from-amber-50 via-emerald-50/50 to-amber-50 p-10 shadow-lg backdrop-blur-sm">
            <h2 className="mb-10 text-center text-4xl font-bold text-emerald-900">Tips to Reduce Your Travel Carbon Footprint</h2>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="tip-card group rounded-2xl border border-emerald-200/50 bg-gradient-to-br from-white to-amber-50/30 p-7 shadow-md transition-all duration-300 hover:shadow-xl hover:scale-[1.02]">
                <h3 className="mb-4 text-xl font-bold text-emerald-900 flex items-center gap-2">
                  <span className="text-3xl">✈️</span>
                  Choose Lower-Emissions Transportation
                </h3>
                <ul className="space-y-2.5 text-sm leading-relaxed text-emerald-700/90">
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-500 mt-1">•</span>
                    <span>Take trains instead of short flights when possible</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-500 mt-1">•</span>
                    <span>Choose direct flights over connecting flights</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-500 mt-1">•</span>
                    <span>Consider economy class (more efficient per passenger)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-500 mt-1">•</span>
                    <span>Use public transportation at your destination</span>
                  </li>
                </ul>
              </div>
              <div className="tip-card group rounded-2xl border border-emerald-200/50 bg-gradient-to-br from-white to-amber-50/30 p-7 shadow-md transition-all duration-300 hover:shadow-xl hover:scale-[1.02]">
                <h3 className="mb-4 text-xl font-bold text-emerald-900 flex items-center gap-2">
                  <span className="text-3xl">🏨</span>
                  Choose Sustainable Accommodations
                </h3>
                <ul className="space-y-2.5 text-sm leading-relaxed text-emerald-700/90">
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-500 mt-1">•</span>
                    <span>Stay in eco-certified hotels</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-500 mt-1">•</span>
                    <span>Choose smaller, locally-owned accommodations</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-500 mt-1">•</span>
                    <span>Reuse towels and linens</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-500 mt-1">•</span>
                    <span>Turn off lights and AC when leaving</span>
                  </li>
                </ul>
              </div>
              <div className="tip-card group rounded-2xl border border-emerald-200/50 bg-gradient-to-br from-white to-amber-50/30 p-7 shadow-md transition-all duration-300 hover:shadow-xl hover:scale-[1.02]">
                <h3 className="mb-4 text-xl font-bold text-emerald-900 flex items-center gap-2">
                  <span className="text-3xl">🍽️</span>
                  Make Sustainable Food Choices
                </h3>
                <ul className="space-y-2.5 text-sm leading-relaxed text-emerald-700/90">
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-500 mt-1">•</span>
                    <span>Eat local and seasonal foods</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-500 mt-1">•</span>
                    <span>Choose plant-based options when possible</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-500 mt-1">•</span>
                    <span>Avoid food waste</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-500 mt-1">•</span>
                    <span>Support local restaurants</span>
                  </li>
                </ul>
              </div>
              <div className="tip-card group rounded-2xl border border-emerald-200/50 bg-gradient-to-br from-white to-amber-50/30 p-7 shadow-md transition-all duration-300 hover:shadow-xl hover:scale-[1.02]">
                <h3 className="mb-4 text-xl font-bold text-emerald-900 flex items-center gap-2">
                  <span className="text-3xl">🌱</span>
                  Offset Your Emissions
                </h3>
                <ul className="space-y-2.5 text-sm leading-relaxed text-emerald-700/90">
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-500 mt-1">•</span>
                    <span>Support carbon offset programs</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-500 mt-1">•</span>
                    <span>Plant trees or support reforestation</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-500 mt-1">•</span>
                    <span>Choose eco-friendly tour operators</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-500 mt-1">•</span>
                    <span>Travel less frequently but for longer periods</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Call to Action */}
          <div className="cta-section mt-20 text-center">
            <div className="rounded-3xl border border-emerald-200/50 bg-gradient-to-br from-emerald-50 via-white to-emerald-50 p-12 shadow-xl backdrop-blur-sm">
              <h2 className="mb-5 text-4xl font-bold text-emerald-900">Plan Your Next Sustainable Trip</h2>
              <p className="mb-8 text-lg leading-relaxed text-emerald-700/90 max-w-2xl mx-auto">
                Use GreenTrip to plan eco-friendly trips that consider carbon emissions alongside price and preferences.
              </p>
              <Link
                href="/"
                className="inline-block rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 px-10 py-4 text-base font-bold text-white shadow-lg transition-all duration-300 hover:shadow-2xl hover:scale-105 hover:from-emerald-600 hover:to-emerald-500"
              >
                Plan a Green Trip →
              </Link>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}

