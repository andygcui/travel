import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Image, { StaticImageData } from "next/image";
import { supabase } from "../lib/supabase";
import Link from "next/link";

import elonMuskImg from "../../public/images/elon_musk.jpg";
import taylorSwiftImg from "../../public/images/taylor_swift.jpg";
import drakeImg from "../../public/images/drake.jpg";
import kimKardashianImg from "../../public/images/kim_kardashian.webp";
import celebrityProfiles from "../data/celebrityProfiles.json";

interface LeaderboardEntry {
  rank: number;
  name: string;
  handle: string;
  credits: string;
  emissionsSaved: string;
  image: StaticImageData;
}

const leaderboard: LeaderboardEntry[] = [
  {
    rank: 1,
    name: "Elon Musk",
    handle: "@elonmusk",
    credits: "2,697.8",
    emissionsSaved: "11,262.7 kg CO₂",
    image: elonMuskImg,
  },
];

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
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [showSentModal, setShowSentModal] = useState(false);
  const [carbonRanking, setCarbonRanking] = useState<any[]>([]);
  const [loadingCarbonRanking, setLoadingCarbonRanking] = useState(false);
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

  const loadCarbonRanking = useCallback(async (userId: string) => {
    if (!userId) return;
    setLoadingCarbonRanking(true);
    try {
      const response = await fetch(`http://localhost:8000/trips/carbon-ranking?user_id=${userId}`);
      if (response.ok) {
        const data = await response.json();
        const friendsRanking = data.ranking || [];
        
        // Add celebrities to the ranking
        const celebrities = [
          {
            user_id: "celebrity_drake",
            username: "Drake",
            trips_count: 0,
            total_credits: -3437000, // -3,437 * 10^3
            total_emissions_kg: 0,
            is_celebrity: true,
            image: drakeImg,
          },
          {
            user_id: "celebrity_elon",
            username: "Elon Musk",
            trips_count: 0,
            total_credits: -5443000, // -5,443 * 10^3
            total_emissions_kg: 0,
            is_celebrity: true,
            image: elonMuskImg,
          },
          {
            user_id: "celebrity_kim",
            username: "Kim Kardashian",
            trips_count: 0,
            total_credits: -4800000, // -4,800 * 10^3
            total_emissions_kg: 0,
            is_celebrity: true,
            image: kimKardashianImg,
          },
          {
            user_id: "celebrity_taylor",
            username: "Taylor Swift",
            trips_count: 0,
            total_credits: -1753000, // -1,753 * 10^3 (assuming 10^3, not 10^-3)
            total_emissions_kg: 0,
            is_celebrity: true,
            image: taylorSwiftImg,
          },
        ];
        
        // Combine friends and celebrities, then sort by total_credits (descending)
        const combinedRanking = [...friendsRanking, ...celebrities].sort((a, b) => {
          return b.total_credits - a.total_credits;
        });
        
        // Add rank to each entry
        combinedRanking.forEach((entry, index) => {
          entry.rank = index + 1;
        });
        
        setCarbonRanking(combinedRanking);
      }
    } catch (err) {
      console.error("Error loading carbon ranking:", err);
    } finally {
      setLoadingCarbonRanking(false);
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
        loadCarbonRanking(userId),
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
        <title>Friends | GreenTrip</title>
        <meta name="description" content="Manage your friends and friend requests" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-amber-100">
        {/* Header */}
        <header className="border-b border-gray-200 bg-white/70 backdrop-blur-lg">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 md:px-12">
            <Link href="/" className="text-2xl font-semibold text-gray-900 transition hover:text-gray-700">
              GreenTrip
            </Link>
            <div className="flex items-center gap-4">
              {user && (
                <>
                  <Link
                    href="/dashboard"
                    className="text-sm font-medium text-emerald-700 transition hover:text-emerald-500"
                  >
                    Profile
                  </Link>
                  <Link
                    href="/emissions"
                    className="text-sm font-medium text-emerald-700 transition hover:text-emerald-500"
                  >
                    Emissions Guide
                  </Link>
                  <span className="text-sm font-medium text-emerald-900">
                    {user?.user_metadata?.first_name && user?.user_metadata?.last_name
                      ? `${user.user_metadata.first_name} ${user.user_metadata.last_name}`
                      : user?.user_metadata?.name || user?.email}
                  </span>
                  <button
                    onClick={async () => {
                      await supabase.auth.signOut();
                      router.push("/");
                    }}
                    className="text-sm font-medium text-emerald-700 transition hover:text-emerald-500"
                  >
                    Sign Out
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="mx-auto max-w-7xl px-6 py-12">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-emerald-900">Friends</h1>
            <p className="mt-2 text-emerald-700">Manage your friends and friend requests</p>
          </div>

          {/* Header with Action Buttons */}
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-emerald-900">Your Friends</h2>
            <div className="flex items-center gap-2">
              {/* Friend Requests Button */}
              <button
                onClick={() => setShowPendingModal(true)}
                className="relative rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50"
              >
                Requests
                {pendingRequests.length > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-xs font-semibold text-white">
                    {pendingRequests.length}
                  </span>
                )}
              </button>
              {/* Sent Requests Button */}
              <button
                onClick={() => setShowSentModal(true)}
                className="relative rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50"
              >
                Sent
                {sentRequests.length > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-xs font-semibold text-white">
                    {sentRequests.length}
                  </span>
                )}
              </button>
              {/* Add Friend Button */}
              <button
                onClick={() => setShowAddFriend(true)}
                className="rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50"
              >
                + Add
              </button>
            </div>
          </div>

          {/* Carbon Credits Leaderboard */}
          {carbonRanking.length > 0 && (
            <div className="mb-8 rounded-2xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 via-white to-emerald-50 p-6 shadow-lg">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="mb-1 text-2xl font-bold text-emerald-900">🏆 Carbon Credits Leaderboard</h2>
                  <p className="text-sm text-emerald-600">Compete with friends to earn the most carbon credits!</p>
                </div>
              </div>
              
              <div className="space-y-3">
                {carbonRanking.map((entry, idx) => {
                  const isCurrentUser = entry.user_id === user?.id;
                  const isCelebrity = entry.is_celebrity || entry.user_id?.startsWith("celebrity_");
                  const isTopThree = entry.rank <= 3;
                  
                  // Medal emojis for top 3
                  const medalEmoji = entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : "";
                  
                  // Format credits for display (handle large negative numbers)
                  const formatCredits = (credits: number) => {
                    if (Math.abs(credits) >= 1000000) {
                      return `${(credits / 1000000).toFixed(1)}M`;
                    } else if (Math.abs(credits) >= 1000) {
                      return `${(credits / 1000).toFixed(1)}K`;
                    }
                    return credits.toFixed(1);
                  };
                  
                  // Determine color based on credits (negative = red, positive = green)
                  const creditsColor = entry.total_credits < 0 ? "text-red-600" : "text-emerald-700";

                  const normalizedUsername = (entry.username || "").toLowerCase().replace(/[^a-z0-9_]/gi, "");
                  const celebrityPhoto = isCelebrity
                    ? entry.image || (celebrityProfiles as Record<string, string>)[normalizedUsername]
                    : undefined;
                  
                  return (
                    <div
                      key={entry.user_id}
                      className={`relative flex items-center justify-between rounded-xl p-4 transition-all ${
                        isCurrentUser
                          ? "bg-gradient-to-r from-emerald-100 to-emerald-50 border-2 border-emerald-400 shadow-md"
                          : isCelebrity
                          ? "bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-300 shadow-sm"
                          : isTopThree
                          ? "bg-gradient-to-r from-yellow-50 to-amber-50 border-2 border-yellow-300 shadow-sm"
                          : "bg-white border border-emerald-200 shadow-sm hover:shadow-md"
                      }`}
                    >
                      {/* Rank Badge */}
                      <div className="flex items-center gap-4">
                        {isCelebrity && celebrityPhoto ? (
                          <div className="flex h-12 w-12 items-center justify-center">
                            <div className="h-12 w-12 overflow-hidden rounded-full ring-2 ring-purple-300">
                              <Image
                                src={celebrityPhoto}
                                alt={`${entry.username} profile`}
                                width={48}
                                height={48}
                                className="h-full w-full object-cover"
                                unoptimized={typeof celebrityPhoto === "string"}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className={`flex h-12 w-12 items-center justify-center rounded-full font-bold ${
                            entry.rank === 1
                              ? "bg-gradient-to-br from-yellow-400 to-yellow-600 text-white text-lg shadow-lg"
                              : entry.rank === 2
                              ? "bg-gradient-to-br from-gray-300 to-gray-400 text-white text-lg shadow-md"
                              : entry.rank === 3
                              ? "bg-gradient-to-br from-amber-600 to-amber-800 text-white text-lg shadow-md"
                              : "bg-emerald-100 text-emerald-700"
                          }`}>
                            {medalEmoji || `#${entry.rank}`}
                          </div>
                        )}
                        
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`font-semibold ${
                              isCurrentUser ? "text-emerald-900" : isCelebrity ? "text-purple-900" : "text-gray-900"
                            }`}>
                              {isCelebrity ? entry.username : `@${entry.username}`}
                            </span>
                            {isCurrentUser && (
                              <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-medium text-white">
                                You
                              </span>
                            )}
                            {isCelebrity && (
                              <span className="rounded-full bg-purple-500 px-2 py-0.5 text-xs font-medium text-white">
                                ⭐ Celebrity
                              </span>
                            )}
                            {isTopThree && !isCurrentUser && !isCelebrity && (
                              <span className="text-lg">{medalEmoji}</span>
                            )}
                          </div>
                          {!isCelebrity && (
                            <p className="text-xs text-emerald-600">
                              {entry.trips_count} {entry.trips_count === 1 ? "trip" : "trips"} completed
                            </p>
                          )}
                          {isCelebrity && (
                            <p className="text-xs text-purple-600">
                              Celebrity carbon footprint
                            </p>
                          )}
                        </div>
                      </div>
                      
                      {/* Credits Display */}
                      <div className="text-right">
                        <div className="flex items-baseline gap-1">
                          <span className={`text-2xl font-bold ${creditsColor}`}>
                            {formatCredits(entry.total_credits)}
                          </span>
                          <span className={`text-sm font-medium ${creditsColor}`}>credits</span>
                        </div>
                        {entry.total_emissions_kg > 0 && (
                          <p className="text-xs text-gray-500 mt-1">
                            {entry.total_emissions_kg.toFixed(1)} kg CO₂ saved
                          </p>
                        )}
                        {entry.total_credits < 0 && (
                          <p className="text-xs text-red-500 mt-1">
                            High carbon footprint
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {carbonRanking.length === 1 && (
                <div className="mt-4 rounded-lg bg-emerald-100 p-4 text-center">
                  <p className="text-sm text-emerald-700">
                    🌱 You're the only one on the leaderboard! Add friends to compete!
                  </p>
                </div>
              )}
            </div>
          )}
          
          {loadingCarbonRanking && (
            <div className="mb-8 rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-sm">
              <div className="text-center py-8">
                <p className="text-emerald-700">Loading leaderboard...</p>
              </div>
            </div>
          )}
          
          {!loadingCarbonRanking && carbonRanking.length === 0 && (
            <div className="mb-8 rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-sm">
              <div className="text-center py-8">
                <div className="mb-4 text-6xl">🏆</div>
                <h2 className="mb-2 text-xl font-semibold text-emerald-900">Carbon Credits Leaderboard</h2>
                <p className="mb-4 text-sm text-emerald-600">
                  Complete trips to earn carbon credits and compete with friends!
                </p>
                <p className="text-xs text-gray-500">
                  Complete at least one trip to appear on the leaderboard.
                </p>
              </div>
            </div>
          )}

          {/* Friends List */}
          <div className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
            {loadingFriends ? (
              <p className="text-emerald-700">Loading friends...</p>
            ) : friends.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {friends.map((friend) => (
                  <div
                    key={friend.friendship_id}
                    className="flex items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50 p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-emerald-900 truncate">
                        @{friend.username || friend.email || "unknown"}
                      </p>
                      <p className="text-xs text-emerald-600">
                        Since {new Date(friend.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemoveFriend(friend.friend_id)}
                      className="ml-2 rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-700 transition hover:bg-red-50 flex-shrink-0"
                      title="Remove friend"
                    >
                      ✕
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

      {/* Friend Requests Modal */}
      {showPendingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl border border-emerald-200 bg-white shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-emerald-100 p-4">
              <h2 className="text-xl font-bold text-emerald-900">Friend Requests</h2>
              <button
                onClick={() => setShowPendingModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {pendingRequests.length > 0 ? (
                <div className="space-y-2">
                  {pendingRequests.map((request) => (
                    <div
                      key={request.friendship_id}
                      className="flex items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50 p-3"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-emerald-900">
                          @{request.username || request.email || "unknown"}
                        </p>
                        <p className="text-xs text-emerald-600">
                          {new Date(request.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => {
                            handleAcceptRequest(request.friendship_id);
                            if (pendingRequests.length === 1) {
                              setShowPendingModal(false);
                            }
                          }}
                          className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-600"
                          title="Accept"
                        >
                          ✓
                        </button>
                        <button
                          onClick={() => {
                            handleRemoveFriend(request.requester_id);
                            if (pendingRequests.length === 1) {
                              setShowPendingModal(false);
                            }
                          }}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50"
                          title="Decline"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-emerald-700 italic py-8">
                  No pending friend requests. When someone sends you a friend request, it will appear here.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sent Requests Modal */}
      {showSentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl border border-emerald-200 bg-white shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-emerald-100 p-4">
              <h2 className="text-xl font-bold text-emerald-900">Sent Requests</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (user) {
                      console.log("Manually refreshing sent requests...");
                      loadSentRequests(user.id);
                    }
                  }}
                  className="rounded-lg border border-emerald-200 px-3 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50"
                >
                  🔄
                </button>
                <button
                  onClick={() => setShowSentModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {sentRequests.length > 0 ? (
                <div className="space-y-2">
                  {sentRequests.map((request) => (
                    <div
                      key={request.friendship_id}
                      className="flex items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50 p-3"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-emerald-900">
                          @{request.username || request.email || "unknown"}
                        </p>
                        <p className="text-xs text-emerald-600">
                          {new Date(request.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-emerald-600 italic">Pending</span>
                        <button
                          onClick={() => {
                            handleRemoveFriend(request.recipient_id);
                            if (sentRequests.length === 1) {
                              setShowSentModal(false);
                            }
                          }}
                          className="rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-700 transition hover:bg-red-50"
                          title="Cancel"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-emerald-700 italic py-8">
                  No sent friend requests. When you send a friend request, it will appear here.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

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

