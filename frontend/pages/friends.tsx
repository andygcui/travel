import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { supabase } from "../lib/supabase";
import Link from "next/link";

export default function Friends() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [sentRequests, setSentRequests] = useState<any[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [friendEmail, setFriendEmail] = useState("");
  const [friendUsername, setFriendUsername] = useState("");
  const [addingFriend, setAddingFriend] = useState(false);
  const [searchBy, setSearchBy] = useState<"email" | "username">("email");
  const [requestsExpanded, setRequestsExpanded] = useState(true);
  const hasLoadedRef = useRef(false);

  const loadFriends = useCallback(async (userId: string) => {
    if (!userId) return;
    setLoadingFriends(true);
    try {
      const response = await fetch(`http://localhost:8000/friends/list?user_id=${userId}`);
      if (response.ok) {
        const data = await response.json();
        setFriends(data.friends || []);
      }
    } catch (err) {
      console.error("Error loading friends:", err);
    } finally {
      setLoadingFriends(false);
    }
  }, []);

  const loadPendingRequests = useCallback(async (userId: string) => {
    if (!userId) return;
    try {
      console.log("Loading pending requests for user:", userId);
      const response = await fetch(`http://localhost:8000/friends/pending?user_id=${userId}`);
      console.log("Pending requests response status:", response.status);
      if (response.ok) {
        const data = await response.json();
        console.log("Pending requests data:", data);
        setPendingRequests(data.pending_requests || []);
      } else {
        const errorText = await response.text();
        console.error("Error loading pending requests:", response.status, errorText);
      }
    } catch (err) {
      console.error("Error loading pending requests:", err);
    }
  }, []);

  const loadSentRequests = useCallback(async (userId: string) => {
    if (!userId) return;
    try {
      console.log("Loading sent requests for user:", userId);
      const response = await fetch(`http://localhost:8000/friends/sent?user_id=${userId}`);
      console.log("Sent requests response status:", response.status);
      if (response.ok) {
        const data = await response.json();
        console.log("Sent requests data:", data);
        setSentRequests(data.sent_requests || []);
      } else {
        const errorText = await response.text();
        console.error("Error loading sent requests:", response.status, errorText);
      }
    } catch (err) {
      console.error("Error loading sent requests:", err);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    let subscription: any = null;

    const loadData = async (userId: string) => {
      if (!mounted) return;
      console.log("Loading friends data for user:", userId);
      await Promise.all([
        loadFriends(userId),
        loadPendingRequests(userId),
        loadSentRequests(userId),
      ]);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user) {
        setUser(session.user);
        setLoading(false);
        // Load friends after user is set
        loadData(session.user.id);
      } else {
        setLoading(false);
        router.push("/");
      }
    });

    const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (session?.user) {
        setUser(session.user);
        loadData(session.user.id);
      } else {
        router.push("/");
      }
    });
    subscription = authSubscription;

    return () => {
      mounted = false;
      if (subscription) {
        subscription.unsubscribe();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const handleAddFriend = async () => {
    if (!user) return;
    if (!friendEmail.trim() && !friendUsername.trim()) {
      alert("Please enter either an email or username");
      return;
    }

    setAddingFriend(true);
    try {
      console.log("Adding friend with:", {
        user_id: user.id,
        friend_email: friendEmail.trim() || null,
        friend_username: friendUsername.trim() || null,
      });

      const response = await fetch("http://localhost:8000/friends/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          friend_email: friendEmail.trim() || null,
          friend_username: friendUsername.trim() || null,
        }),
      });

      console.log("Add friend response status:", response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Failed to add friend" }));
        console.error("Add friend error:", errorData);
        throw new Error(errorData.detail || "Failed to add friend");
      }

      const result = await response.json();
      console.log("Add friend success:", result);

      setFriendEmail("");
      setFriendUsername("");
      setShowAddFriend(false);
      alert("Friend request sent!");
      // Reload all friend data after adding
      if (user) {
        await Promise.all([
          loadFriends(user.id),
          loadPendingRequests(user.id),
          loadSentRequests(user.id),
        ]);
      }
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

      if (user) {
        loadFriends(user.id);
        loadPendingRequests(user.id);
        loadSentRequests(user.id);
      }
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

      if (user) {
        loadFriends(user.id);
        loadPendingRequests(user.id);
        loadSentRequests(user.id);
      }
    } catch (err) {
      console.error("Error removing friend:", err);
      alert("Failed to remove friend");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-amber-100">
        <div className="text-center">
          <div className="mb-4 text-4xl">👥</div>
          <p className="text-lg font-medium text-emerald-900">Loading friends...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Friends | TripSmith</title>
        <meta name="description" content="Manage your friends and friend requests" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-amber-100">
        {/* Header */}
        <header className="border-b border-emerald-100 bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <Link href="/" className="text-2xl font-bold text-[#34d399]">
                TripSmith
              </Link>
              <span className="text-sm text-emerald-600">Friends</span>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="rounded-full border border-emerald-200 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50"
              >
                Dashboard
              </Link>
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
            <h1 className="text-4xl font-bold text-emerald-900">Friends</h1>
            <p className="mt-2 text-emerald-700">Manage your friends and friend requests</p>
          </div>

          {/* Add Friend Button */}
          <div className="mb-8">
            <button
              onClick={() => setShowAddFriend(true)}
              className="rounded-lg border border-emerald-200 bg-white px-6 py-3 text-sm font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50"
            >
              + Add Friend
            </button>
          </div>

          {/* Received Friend Requests - Collapsible */}
          <div className="mb-8 rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
            <button
              onClick={() => setRequestsExpanded(!requestsExpanded)}
              className="mb-4 flex w-full items-center justify-between text-left"
            >
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold text-emerald-900">Friend Requests</h2>
                {pendingRequests.length > 0 && (
                  <span className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white">
                    {pendingRequests.length} new
                  </span>
                )}
              </div>
              <span className="text-2xl text-emerald-600 transition-transform">
                {requestsExpanded ? "▼" : "▶"}
              </span>
            </button>
            {requestsExpanded && (
              <>
                {pendingRequests.length > 0 ? (
                  <div className="space-y-3">
                    {pendingRequests.map((request) => (
                      <div
                        key={request.friendship_id}
                        className="flex items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50 p-4"
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
                            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => handleRemoveFriend(request.requester_id)}
                            className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-emerald-700 italic">
                    No pending friend requests. When someone sends you a friend request, it will appear here.
                  </p>
                )}
              </>
            )}
          </div>

          {/* Sent Friend Requests - Always Visible */}
          <div className="mb-8 rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-emerald-900">Sent Requests</h2>
              <button
                onClick={() => {
                  if (user) {
                    console.log("Manually refreshing sent requests...");
                    loadSentRequests(user.id);
                  }
                }}
                className="rounded-lg border border-emerald-200 px-3 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50"
              >
                🔄 Refresh
              </button>
            </div>
            {sentRequests.length > 0 ? (
              <div className="space-y-3">
                {sentRequests.map((request) => (
                  <div
                    key={request.friendship_id}
                    className="flex items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50 p-4"
                  >
                    <div>
                      <p className="font-medium text-emerald-900">{request.email}</p>
                      <p className="text-xs text-emerald-600">
                        Sent {new Date(request.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-emerald-600 italic">Pending...</span>
                      <button
                        onClick={() => handleRemoveFriend(request.recipient_id)}
                        className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-700 transition hover:bg-red-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div>
                <p className="text-emerald-700 italic">
                  No sent friend requests. When you send a friend request, it will appear here.
                </p>
                <p className="mt-2 text-xs text-gray-500">
                  Debug: sentRequests.length = {sentRequests.length}, user.id = {user?.id || "none"}
                </p>
              </div>
            )}
          </div>

          {/* Friends List */}
          <div className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold text-emerald-900">Your Friends</h2>
            {loadingFriends ? (
              <p className="text-emerald-700">Loading friends...</p>
            ) : friends.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {friends.map((friend) => (
                  <div
                    key={friend.friendship_id}
                    className="flex items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50 p-4"
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
            ) : (
              <p className="text-emerald-700 italic">
                No friends yet. Add friends by email or username to get started!
              </p>
            )}
          </div>
        </main>
      </div>

      {/* Add Friend Modal */}
      {showAddFriend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl border border-emerald-200 bg-white p-6 shadow-2xl">
            <button
              onClick={() => {
                setShowAddFriend(false);
                setFriendEmail("");
                setFriendUsername("");
              }}
              disabled={addingFriend}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 disabled:opacity-50"
            >
              ✕
            </button>

            <h2 className="mb-4 text-2xl font-bold text-emerald-900">Add Friend</h2>
            <p className="mb-6 text-sm text-emerald-700">
              Enter your friend's email address or username to send them a friend request.
            </p>

            {/* Search Method Toggle */}
            <div className="mb-4 flex gap-2">
              <button
                onClick={() => {
                  setSearchBy("email");
                  setFriendUsername("");
                }}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition ${
                  searchBy === "email"
                    ? "bg-emerald-500 text-white"
                    : "border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
                }`}
              >
                By Email
              </button>
              <button
                onClick={() => {
                  setSearchBy("username");
                  setFriendEmail("");
                }}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition ${
                  searchBy === "username"
                    ? "bg-emerald-500 text-white"
                    : "border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
                }`}
              >
                By Username
              </button>
            </div>

            <div className="mb-6">
              <label className="mb-2 block text-sm font-semibold text-emerald-900">
                {searchBy === "email" ? "Email Address" : "Username"}
              </label>
              {searchBy === "email" ? (
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
              ) : (
                <input
                  type="text"
                  value={friendUsername}
                  onChange={(e) => setFriendUsername(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === "Enter" && friendUsername.trim()) {
                      handleAddFriend();
                    }
                  }}
                  placeholder="username"
                  disabled={addingFriend}
                  className="w-full rounded-lg border border-emerald-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:opacity-50"
                />
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowAddFriend(false);
                  setFriendEmail("");
                  setFriendUsername("");
                }}
                disabled={addingFriend}
                className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddFriend}
                disabled={addingFriend || (!friendEmail.trim() && !friendUsername.trim())}
                className="flex-1 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-400 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
              >
                {addingFriend ? "Sending..." : "Send Request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

