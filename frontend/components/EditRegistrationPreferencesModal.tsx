import { useState } from "react";

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

interface EditRegistrationPreferencesModalProps {
  preferences: string[];
  likes: string[];
  dislikes: string[];
  dietary: string[];
  onPreferencesChange: (preferences: string[]) => void;
  onLikesChange: (likes: string[]) => void;
  onDislikesChange: (dislikes: string[]) => void;
  onDietaryChange: (dietary: string[]) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
}

export default function EditRegistrationPreferencesModal({
  preferences,
  likes,
  dislikes,
  dietary,
  onPreferencesChange,
  onLikesChange,
  onDislikesChange,
  onDietaryChange,
  onSave,
  onClose,
  saving,
}: EditRegistrationPreferencesModalProps) {
  const [likeInput, setLikeInput] = useState("");
  const [dislikeInput, setDislikeInput] = useState("");

  const togglePreference = (pref: string, type: "preferences" | "likes" | "dislikes" | "dietary") => {
    if (type === "preferences") {
      // Case-insensitive check and remove, then add the normalized value
      const normalizedPref = pref.trim();
      const isSelected = preferences.some(
        (p) => p && p.trim().toLowerCase() === normalizedPref.toLowerCase()
      );
      if (isSelected) {
        // Remove all case variations
        onPreferencesChange(
          preferences.filter((p) => p && p.trim().toLowerCase() !== normalizedPref.toLowerCase())
        );
      } else {
        // Add the normalized value (exact match from preferenceOptions)
        onPreferencesChange([...preferences.filter((p) => p && p.trim().toLowerCase() !== normalizedPref.toLowerCase()), normalizedPref]);
      }
    } else if (type === "likes") {
      const normalizedPref = pref.trim();
      const isSelected = likes.some((l) => l && l.trim().toLowerCase() === normalizedPref.toLowerCase());
      onLikesChange(isSelected ? likes.filter((l) => l && l.trim().toLowerCase() !== normalizedPref.toLowerCase()) : [...likes.filter((l) => l && l.trim().toLowerCase() !== normalizedPref.toLowerCase()), normalizedPref]);
    } else if (type === "dislikes") {
      const normalizedPref = pref.trim();
      const isSelected = dislikes.some((d) => d && d.trim().toLowerCase() === normalizedPref.toLowerCase());
      onDislikesChange(isSelected ? dislikes.filter((d) => d && d.trim().toLowerCase() !== normalizedPref.toLowerCase()) : [...dislikes.filter((d) => d && d.trim().toLowerCase() !== normalizedPref.toLowerCase()), normalizedPref]);
    } else if (type === "dietary") {
      const normalizedPref = pref.trim();
      const isSelected = dietary.some((d) => d && d.trim().toLowerCase() === normalizedPref.toLowerCase());
      onDietaryChange(isSelected ? dietary.filter((d) => d && d.trim().toLowerCase() !== normalizedPref.toLowerCase()) : [...dietary.filter((d) => d && d.trim().toLowerCase() !== normalizedPref.toLowerCase()), normalizedPref]);
    }
  };

  const addLike = () => {
    if (likeInput.trim() && !likes.includes(likeInput.trim())) {
      onLikesChange([...likes, likeInput.trim()]);
      setLikeInput("");
    }
  };

  const addDislike = () => {
    if (dislikeInput.trim() && !dislikes.includes(dislikeInput.trim())) {
      onDislikesChange([...dislikes, dislikeInput.trim()]);
      setDislikeInput("");
    }
  };

  const removeLike = (like: string) => {
    onLikesChange(likes.filter((l) => l !== like));
  };

  const removeDislike = (dislike: string) => {
    onDislikesChange(dislikes.filter((d) => d !== dislike));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-2xl border border-emerald-200 bg-white p-6 shadow-2xl my-8">
        <button
          onClick={onClose}
          disabled={saving}
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 disabled:opacity-50"
        >
          ✕
        </button>

        <h2 className="mb-4 text-2xl font-bold text-emerald-900">Edit Registration Preferences</h2>
        <p className="mb-6 text-sm text-emerald-700">Update your travel preferences below.</p>

        <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
          {/* Interests */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-emerald-900">Interests</label>
            <div className="flex flex-wrap gap-2">
              {preferenceOptions.map((pref) => {
                // Case-insensitive comparison to match preferences from database
                const isSelected = preferences.some(
                  (p) => p && p.trim().toLowerCase() === pref.toLowerCase()
                );
                return (
                  <button
                    key={pref}
                    type="button"
                    onClick={() => togglePreference(pref, "preferences")}
                    disabled={saving}
                    className={`rounded-full px-4 py-2 text-xs font-medium transition ${
                      isSelected
                        ? "bg-emerald-500 text-white"
                        : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    } disabled:opacity-50`}
                  >
                    {pref}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dietary Restrictions */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-emerald-900">Dietary Restrictions</label>
            <div className="flex flex-wrap gap-2">
              {dietaryOptions.map((diet) => (
                <button
                  key={diet}
                  type="button"
                  onClick={() => togglePreference(diet, "dietary")}
                  disabled={saving}
                  className={`rounded-full px-4 py-2 text-xs font-medium transition ${
                    dietary.includes(diet)
                      ? "bg-emerald-500 text-white"
                      : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  } disabled:opacity-50`}
                >
                  {diet}
                </button>
              ))}
            </div>
          </div>

          {/* Things You Like */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-emerald-900">Things You Like</label>
            <div className="mb-2 flex gap-2">
              <input
                type="text"
                value={likeInput}
                onChange={(e) => setLikeInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addLike();
                  }
                }}
                placeholder="Add something you like..."
                disabled={saving}
                className="flex-1 rounded-lg border border-emerald-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={addLike}
                disabled={saving || !likeInput.trim()}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {likes.map((like, idx) => (
                <span
                  key={idx}
                  className="flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800"
                >
                  {like}
                  <button
                    type="button"
                    onClick={() => removeLike(like)}
                    disabled={saving}
                    className="text-green-600 hover:text-green-800 disabled:opacity-50"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Things You Dislike */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-emerald-900">Things You Dislike</label>
            <div className="mb-2 flex gap-2">
              <input
                type="text"
                value={dislikeInput}
                onChange={(e) => setDislikeInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addDislike();
                  }
                }}
                placeholder="Add something you dislike..."
                disabled={saving}
                className="flex-1 rounded-lg border border-emerald-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={addDislike}
                disabled={saving || !dislikeInput.trim()}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {dislikes.map((dislike, idx) => (
                <span
                  key={idx}
                  className="flex items-center gap-2 rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-800"
                >
                  {dislike}
                  <button
                    type="button"
                    onClick={() => removeDislike(dislike)}
                    disabled={saving}
                    className="text-red-600 hover:text-red-800 disabled:opacity-50"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="flex-1 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-400 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Preferences"}
          </button>
        </div>
      </div>
    </div>
  );
}

