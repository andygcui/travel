import Head from "next/head";
import Link from "next/link";

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
        <title>Carbon Emissions Guide | TripSmith</title>
        <meta name="description" content="Learn about carbon emissions from travel and how to reduce your footprint" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-amber-100">
        {/* Header */}
        <header className="border-b border-emerald-100 bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <Link href="/" className="text-2xl font-bold text-[#34d399]">
                TripSmith
              </Link>
              <span className="text-sm text-emerald-600">Carbon Emissions Guide</span>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="rounded-full border border-emerald-200 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50"
              >
                Plan a Trip
              </Link>
              <Link
                href="/dashboard"
                className="rounded-full border border-emerald-200 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50"
              >
                Dashboard
              </Link>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="mx-auto max-w-6xl px-6 py-12">
          {/* Hero Section */}
          <div className="mb-12 text-center">
            <h1 className="mb-4 text-5xl font-bold text-emerald-900">Understanding Travel Carbon Emissions</h1>
            <p className="mx-auto max-w-3xl text-lg text-emerald-700">
              Learn about carbon emissions from different travel activities and how to make more sustainable choices.
              All values are approximate and can vary based on specific circumstances.
            </p>
          </div>

          {/* Key Baselines */}
          <div className="mb-12 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-emerald-100 p-8 shadow-sm">
            <h2 className="mb-6 text-3xl font-bold text-emerald-900">Key Baselines</h2>
            <div className="grid gap-6 md:grid-cols-3">
              <div className="rounded-xl border border-emerald-200 bg-white p-6 shadow-sm">
                <div className="mb-2 text-4xl">🌍</div>
                <h3 className="mb-2 text-lg font-semibold text-emerald-900">Global Average</h3>
                <p className="mb-2 text-3xl font-bold text-emerald-600">16.4 kg</p>
                <p className="text-sm text-emerald-700">CO₂ per person per day</p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-white p-6 shadow-sm">
                <div className="mb-2 text-4xl">🇺🇸</div>
                <h3 className="mb-2 text-lg font-semibold text-emerald-900">US Average</h3>
                <p className="mb-2 text-3xl font-bold text-emerald-600">45 kg</p>
                <p className="text-sm text-emerald-700">CO₂ per person per day</p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-white p-6 shadow-sm">
                <div className="mb-2 text-4xl">🎯</div>
                <h3 className="mb-2 text-lg font-semibold text-emerald-900">Climate Target</h3>
                <p className="mb-2 text-3xl font-bold text-emerald-600">5.5 kg</p>
                <p className="text-sm text-emerald-700">CO₂ per person per day</p>
              </div>
            </div>
          </div>

          {/* Emission Categories */}
          <div className="space-y-8">
            {emissionCategories.map((category, categoryIdx) => (
              <div
                key={categoryIdx}
                className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm"
              >
                <div className="mb-6 flex items-center gap-3">
                  <span className="text-4xl">{category.icon}</span>
                  <h2 className="text-2xl font-bold text-emerald-900">{category.name}</h2>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {category.items.map((item, itemIdx) => (
                    <div
                      key={itemIdx}
                      className="group rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-5 transition hover:border-emerald-300 hover:shadow-md"
                    >
                      <div className="mb-2 flex items-start justify-between">
                        <h3 className="flex-1 text-sm font-semibold text-emerald-900">{item.activity}</h3>
                        <div className="ml-2 text-right">
                          <div className="text-2xl font-bold text-emerald-600">{item.co2_kg}</div>
                          <div className="text-xs text-emerald-500">kg CO₂</div>
                        </div>
                      </div>
                      <p className="mb-2 text-xs text-emerald-700">{item.description}</p>
                      {item.comparison && (
                        <p className="text-xs italic text-emerald-600">{item.comparison}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Fun Facts Section */}
          <div className="mt-12 rounded-2xl border border-emerald-200 bg-gradient-to-r from-blue-50 to-emerald-50 p-8 shadow-sm">
            <h2 className="mb-6 text-3xl font-bold text-emerald-900">🌍 Fun Facts About Travel & Carbon Emissions</h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl border border-blue-200 bg-white p-6 shadow-sm">
                <div className="mb-3 text-4xl">✈️</div>
                <h3 className="mb-2 font-semibold text-emerald-900">Aviation Impact</h3>
                <p className="text-sm text-emerald-700">
                  Aviation accounts for about 2.5% of global CO₂ emissions, but this number is growing rapidly as more people travel.
                </p>
              </div>
              <div className="rounded-xl border border-blue-200 bg-white p-6 shadow-sm">
                <div className="mb-3 text-4xl">🌳</div>
                <h3 className="mb-2 font-semibold text-emerald-900">Tree Power</h3>
                <p className="text-sm text-emerald-700">
                  One mature tree can absorb about 22 kg of CO₂ per year. To offset a round-trip flight from NYC to London, you'd need to plant about 50 trees!
                </p>
              </div>
              <div className="rounded-xl border border-blue-200 bg-white p-6 shadow-sm">
                <div className="mb-3 text-4xl">🚂</div>
                <h3 className="mb-2 font-semibold text-emerald-900">Train vs Plane</h3>
                <p className="text-sm text-emerald-700">
                  Taking a train instead of a plane for a 500 km journey can reduce your carbon footprint by up to 90%!
                </p>
              </div>
              <div className="rounded-xl border border-blue-200 bg-white p-6 shadow-sm">
                <div className="mb-3 text-4xl">🍔</div>
                <h3 className="mb-2 font-semibold text-emerald-900">Food Footprint</h3>
                <p className="text-sm text-emerald-700">
                  A single hamburger has a carbon footprint of about 2.5 kg CO₂ - that's more than driving 10 km in a car!
                </p>
              </div>
              <div className="rounded-xl border border-blue-200 bg-white p-6 shadow-sm">
                <div className="mb-3 text-4xl">🌊</div>
                <h3 className="mb-2 font-semibold text-emerald-900">Cruise Ships</h3>
                <p className="text-sm text-emerald-700">
                  A large cruise ship can emit as much CO₂ as 12,000 cars in a single day. That's equivalent to a small city!
                </p>
              </div>
              <div className="rounded-xl border border-blue-200 bg-white p-6 shadow-sm">
                <div className="mb-3 text-4xl">💡</div>
                <h3 className="mb-2 font-semibold text-emerald-900">Small Changes, Big Impact</h3>
                <p className="text-sm text-emerald-700">
                  If everyone chose one train journey instead of a short flight per year, we could save millions of tons of CO₂!
                </p>
              </div>
            </div>
          </div>

          {/* Incentives Section */}
          <div className="mt-12 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-green-50 p-8 shadow-sm">
            <h2 className="mb-6 text-3xl font-bold text-emerald-900">🎁 Why Use TripSmith for Sustainable Travel?</h2>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-xl border border-emerald-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-3">
                  <div className="text-4xl">💰</div>
                  <h3 className="text-xl font-bold text-emerald-900">Save Money & Emissions</h3>
                </div>
                <p className="text-emerald-700">
                  Our platform finds the best balance between cost and carbon footprint. You can often save money while reducing your environmental impact by choosing more efficient transportation options.
                </p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-3">
                  <div className="text-4xl">🌱</div>
                  <h3 className="text-xl font-bold text-emerald-900">Make Informed Choices</h3>
                </div>
                <p className="text-emerald-700">
                  See the carbon footprint of every trip option before you book. Knowledge is power - make decisions that align with your values.
                </p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-3">
                  <div className="text-4xl">🏆</div>
                  <h3 className="text-xl font-bold text-emerald-900">Build Your Green Profile</h3>
                </div>
                <p className="text-emerald-700">
                  Track your travel carbon footprint over time. Watch your impact decrease as you make more sustainable choices and feel good about your contribution to the planet.
                </p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-3">
                  <div className="text-4xl">🎯</div>
                  <h3 className="text-xl font-bold text-emerald-900">Personalized Recommendations</h3>
                </div>
                <p className="text-emerald-700">
                  Get itinerary suggestions that match your preferences while prioritizing lower-emission options. You don't have to sacrifice your travel experience to be sustainable.
                </p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-3">
                  <div className="text-4xl">🌍</div>
                  <h3 className="text-xl font-bold text-emerald-900">Join the Movement</h3>
                </div>
                <p className="text-emerald-700">
                  Be part of a growing community of conscious travelers. Every sustainable trip you take inspires others and creates a positive ripple effect.
                </p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-3">
                  <div className="text-4xl">✨</div>
                  <h3 className="text-xl font-bold text-emerald-900">Discover Hidden Gems</h3>
                </div>
                <p className="text-emerald-700">
                  Lower-emission travel often means exploring local destinations and authentic experiences you might have missed. Sometimes the best trips are closer than you think!
                </p>
              </div>
            </div>
          </div>

          {/* Tips Section */}
          <div className="mt-12 rounded-2xl border border-emerald-200 bg-gradient-to-r from-amber-50 to-emerald-50 p-8 shadow-sm">
            <h2 className="mb-6 text-3xl font-bold text-emerald-900">Tips to Reduce Your Travel Carbon Footprint</h2>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-xl border border-emerald-100 bg-white p-6">
                <h3 className="mb-3 text-lg font-semibold text-emerald-900">✈️ Choose Lower-Emissions Transportation</h3>
                <ul className="space-y-2 text-sm text-emerald-700">
                  <li>• Take trains instead of short flights when possible</li>
                  <li>• Choose direct flights over connecting flights</li>
                  <li>• Consider economy class (more efficient per passenger)</li>
                  <li>• Use public transportation at your destination</li>
                </ul>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-white p-6">
                <h3 className="mb-3 text-lg font-semibold text-emerald-900">🏨 Choose Sustainable Accommodations</h3>
                <ul className="space-y-2 text-sm text-emerald-700">
                  <li>• Stay in eco-certified hotels</li>
                  <li>• Choose smaller, locally-owned accommodations</li>
                  <li>• Reuse towels and linens</li>
                  <li>• Turn off lights and AC when leaving</li>
                </ul>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-white p-6">
                <h3 className="mb-3 text-lg font-semibold text-emerald-900">🍽️ Make Sustainable Food Choices</h3>
                <ul className="space-y-2 text-sm text-emerald-700">
                  <li>• Eat local and seasonal foods</li>
                  <li>• Choose plant-based options when possible</li>
                  <li>• Avoid food waste</li>
                  <li>• Support local restaurants</li>
                </ul>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-white p-6">
                <h3 className="mb-3 text-lg font-semibold text-emerald-900">🌱 Offset Your Emissions</h3>
                <ul className="space-y-2 text-sm text-emerald-700">
                  <li>• Support carbon offset programs</li>
                  <li>• Plant trees or support reforestation</li>
                  <li>• Choose eco-friendly tour operators</li>
                  <li>• Travel less frequently but for longer periods</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Call to Action */}
          <div className="mt-12 text-center">
            <div className="rounded-2xl border border-emerald-200 bg-white p-8 shadow-sm">
              <h2 className="mb-4 text-2xl font-bold text-emerald-900">Plan Your Next Sustainable Trip</h2>
              <p className="mb-6 text-emerald-700">
                Use TripSmith to plan eco-friendly trips that consider carbon emissions alongside price and preferences.
              </p>
              <Link
                href="/"
                className="inline-block rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 px-8 py-3 text-sm font-semibold text-white shadow-lg transition hover:shadow-xl"
              >
                Plan a Green Trip
              </Link>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}

