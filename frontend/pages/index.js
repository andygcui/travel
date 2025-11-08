import { useState } from "react";

export default function Home() {
  const [destination, setDestination] = useState("");
  const [budget, setBudget] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setResult(null);

    try {
      const res = await fetch("http://localhost:8000/plan");
      if (!res.ok) {
        throw new Error("Request failed");
      }
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError("Unable to reach backend. Make sure FastAPI server is running.");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 px-4">
      <div className="max-w-md w-full rounded-lg bg-white p-8 shadow-lg">
        <h1 className="text-3xl font-bold mb-4 text-center">TripSmith AI 🌍</h1>
        <p className="text-gray-600 text-center mb-6">
          Built at HackPrinceton 2025
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="text"
            placeholder="Destination"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className="p-3 border border-gray-300 rounded focus:border-blue-500 focus:outline-none"
            required
          />
          <input
            type="number"
            placeholder="Budget"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className="p-3 border border-gray-300 rounded focus:border-blue-500 focus:outline-none"
            min="0"
            required
          />
          <button
            type="submit"
            className="p-3 bg-blue-500 text-white rounded font-semibold hover:bg-blue-600 transition"
          >
            Generate Plan
          </button>
        </form>

        {error && <p className="mt-4 text-red-500 text-center">{error}</p>}

        {result && (
          <div className="mt-6 bg-gray-50 p-4 rounded border border-gray-200">
            <p className="text-gray-800">{result.message}</p>
          </div>
        )}
      </div>
    </div>
  );
}

