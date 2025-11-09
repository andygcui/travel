import { useState, useRef, useEffect } from "react";
import { supabase } from "../lib/supabase";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  extractedPreferences?: any[];
}

interface PreferencesChatProps {
  onPreferencesUpdated?: () => void;
  onClose?: () => void;
}

export default function PreferencesChat({ onPreferencesUpdated, onClose }: PreferencesChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "Hi! I'm here to help you build your travel profile. Tell me about your travel preferences!\n\nFor example, you can share:\n- \"I love museums and art galleries\"\n- \"I prefer vegetarian restaurants\"\n- \"I don't like crowded tourist spots\"\n- \"I prefer morning flights\"\n- \"I enjoy hiking and outdoor activities\"\n\nWhat are your travel preferences?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      // Use chat_planner endpoint but without an itinerary - just for preference extraction
      const response = await fetch("http://localhost:8000/chat_planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage.content,
          itinerary: {
            destination: "General",
            start_date: new Date().toISOString().split("T")[0],
            end_date: new Date().toISOString().split("T")[0],
            num_days: 1,
            budget: 1000,
            mode: "balanced",
          },
          user_id: user?.id || null,
          trip_id: null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const data = await response.json();

      // Build response message with preference extraction feedback
      let responseContent = data.response;
      if (data.extracted_preferences && data.extracted_preferences.length > 0) {
        const prefs = data.extracted_preferences.map((p: any) => p.preference_value).join(", ");
        responseContent += `\n\n✓ I've noted your preferences: ${prefs}`;
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: responseContent,
        timestamp: new Date(),
        extractedPreferences: data.extracted_preferences || [],
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Notify parent that preferences were updated
      if (data.extracted_preferences && data.extracted_preferences.length > 0 && onPreferencesUpdated) {
        onPreferencesUpdated();
      }
    } catch (error: any) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `Sorry, I encountered an error: ${error.message}. Please try again.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative flex h-[80vh] w-full max-w-2xl flex-col rounded-2xl border border-emerald-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-emerald-200 bg-gradient-to-r from-emerald-50 to-emerald-100 px-6 py-4">
          <h2 className="text-xl font-semibold text-emerald-900">Tell Me About Your Preferences</h2>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-full p-2 text-gray-400 transition hover:bg-emerald-100 hover:text-emerald-700"
            >
              ✕
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    message.role === "user"
                      ? "bg-gradient-to-r from-emerald-500 to-emerald-400 text-white"
                      : "bg-emerald-50 text-emerald-900"
                  }`}
                >
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
                  {message.extractedPreferences && message.extractedPreferences.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {message.extractedPreferences.map((pref: any, idx: number) => (
                        <span
                          key={idx}
                          className="rounded-full bg-emerald-200/50 px-2 py-1 text-xs font-medium text-emerald-800"
                        >
                          {pref.preference_value}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-emerald-50 px-4 py-3">
                  <div className="flex space-x-2">
                    <div className="h-2 w-2 animate-bounce rounded-full bg-emerald-500"></div>
                    <div className="h-2 w-2 animate-bounce rounded-full bg-emerald-500" style={{ animationDelay: "0.2s" }}></div>
                    <div className="h-2 w-2 animate-bounce rounded-full bg-emerald-500" style={{ animationDelay: "0.4s" }}></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-emerald-200 bg-white p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex gap-3"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tell me about your travel preferences..."
              className="flex-1 rounded-lg border border-emerald-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-400 px-6 py-2 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

