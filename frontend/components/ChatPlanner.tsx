import { useState, useRef, useEffect } from "react";
import { supabase } from "../lib/supabase";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  extractedPreferences?: any[];
}

interface ChatPlannerProps {
  itinerary: any;
  onItineraryUpdate: (updatedItinerary: any) => void;
  onClose?: () => void;
  tripId?: string;
}

export default function ChatPlanner({ itinerary, onItineraryUpdate, onClose, tripId }: ChatPlannerProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "Hi! I'm your travel planner assistant. I can help you modify your itinerary. For example, you can say:\n- \"This flight time doesn't work for me\"\n- \"I don't want to go to places too crowded\"\n- \"Can we add more museums?\"\n- \"Change the hotel to something cheaper\"\n\nWhat would you like to adjust?",
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
      const response = await fetch("http://localhost:8000/chat_planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage.content,
          itinerary: itinerary,
          user_id: user?.id || null,
          trip_id: tripId || null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response from planner");
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

      // If the itinerary was updated, notify parent
      if (data.updated_itinerary) {
        onItineraryUpdate(data.updated_itinerary);
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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-full flex-col bg-white shadow-lg">
      {/* Header */}
      <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-emerald-100 px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white">
              💬
            </div>
            <div>
              <h3 className="font-semibold text-emerald-900">Travel Planner Assistant</h3>
              <p className="text-xs text-emerald-600">Ask me to adjust your itinerary</p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
              title="Close chat"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
              <p className="whitespace-pre-wrap text-sm">{message.content}</p>
              <p className={`mt-1 text-xs ${
                message.role === "user" ? "text-emerald-100" : "text-emerald-500"
              }`}>
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-emerald-50 px-4 py-3">
              <div className="flex gap-1">
                <div className="h-2 w-2 animate-bounce rounded-full bg-emerald-400" style={{ animationDelay: '0ms' }}></div>
                <div className="h-2 w-2 animate-bounce rounded-full bg-emerald-400" style={{ animationDelay: '150ms' }}></div>
                <div className="h-2 w-2 animate-bounce rounded-full bg-emerald-400" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-emerald-100 p-4">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your request... (e.g., 'Change flight time', 'Avoid crowded places')"
            className="flex-1 rounded-lg border border-emerald-200 px-4 py-2 text-sm text-emerald-900 placeholder-emerald-400 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 resize-none"
            rows={2}
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-400 px-6 py-2 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </div>
        <p className="mt-2 text-xs text-emerald-600">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

