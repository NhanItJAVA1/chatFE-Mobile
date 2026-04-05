import { useEffect, useState } from "react";
import { searchUserByPhone, sendFriendRequest, getFriends, removeFriend } from "../../../shared/services";
import { useAuth } from "../../../shared/hooks";

export const Contacts = () => {
  const { user } = useAuth();
  const [friends, setFriends] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [addingFriend, setAddingFriend] = useState(false);
  const [activeTab, setActiveTab] = useState("friends"); // friends or add
  const [error, setError] = useState("");

  useEffect(() => {
    loadFriends();
  }, [user]);

  const loadFriends = async () => {
    try {
      setLoading(true);
      if (!user?.id) {
        setFriends([]);
        return;
      }
      const response = await getFriends();
      setFriends(response.data?.items || []);
    } catch (error) {
      console.error("Error loading friends:", error);
      setError("Failed to load friends");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setError("Please enter a phone number");
      return;
    }

    try {
      setSearching(true);
      setError("");
      const response = await searchUserByPhone(searchQuery);

      if (response && response.data) {
        setSearchResult(response.data);
        setActiveTab("add");
      }
    } catch (err) {
      setError(err.message || "User not found");
      setSearchResult(null);
    } finally {
      setSearching(false);
    }
  };

  const handleAddFriend = async (userId) => {
    try {
      setAddingFriend(true);
      await sendFriendRequest(userId);
      setSearchResult(null);
      setSearchQuery("");
      setActiveTab("friends");
      alert("Friend request sent successfully!");
    } catch (err) {
      alert(err.message || "Failed to send friend request");
    } finally {
      setAddingFriend(false);
    }
  };

  const handleUnfriend = async (friendId) => {
    if (!window.confirm("Remove this friend?")) return;

    try {
      await removeFriend(friendId);
      setFriends(friends.filter((f) => f.id !== friendId));
    } catch (err) {
      alert(err.message || "Failed to unfriend");
    }
  };

  const filteredFriends = friends.filter(
    (friend) =>
      friend.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) || friend.phone?.includes(searchQuery),
  );

  return (
    <div className="flex h-full flex-col bg-white dark:bg-slate-900">
      {/* Header */}
      <div className="sticky top-0 p-4 bg-white dark:bg-slate-900 border-b dark:border-slate-700 space-y-3">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Contacts</h2>

        {/* Tabs */}
        <div className="flex gap-2 border-b dark:border-slate-700">
          <button
            onClick={() => {
              setActiveTab("friends");
              setSearchResult(null);
              setError("");
            }}
            className={`px-4 py-2 font-medium text-sm transition ${
              activeTab === "friends"
                ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
            }`}
          >
            My Friends ({friends.length})
          </button>
          <button
            onClick={() => setActiveTab("add")}
            className={`px-4 py-2 font-medium text-sm transition ${
              activeTab === "add"
                ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
            }`}
          >
            Add Friend
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "friends" ? (
          // Friends List Tab
          <>
            {/* Search Box */}
            <div className="p-4 border-b dark:border-slate-700">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search friends..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-100 dark:bg-slate-700 text-gray-900 dark:text-white rounded-full focus:outline-none placeholder-gray-500 dark:placeholder-gray-400 text-sm"
                />
                <svg
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
            </div>

            {/* Friends List */}
            {loading ? (
              <div className="flex items-center justify-center h-32 text-gray-500 dark:text-gray-400">
                <p>Loading...</p>
              </div>
            ) : filteredFriends.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-gray-500 dark:text-gray-400 text-center p-4">
                {friends.length === 0 ? (
                  <div>
                    <p className="text-lg font-semibold mb-2">No contacts yet</p>
                    <p className="text-sm">Go to "Add Friend" tab to add friends</p>
                  </div>
                ) : (
                  <p>No contacts matching "{searchQuery}"</p>
                )}
              </div>
            ) : (
              <div>
                {filteredFriends.map((friend) => (
                  <div
                    key={friend.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-100 dark:hover:bg-slate-700 border-b dark:border-slate-700 transition group"
                  >
                    {/* Avatar */}
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                      {friend.displayName?.charAt(0) || "?"}
                    </div>

                    {/* Contact Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-white truncate">{friend.displayName}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{friend.phone}</p>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      <button
                        className="opacity-0 group-hover:opacity-100 transition text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                        title="Chat"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleUnfriend(friend.id)}
                        className="opacity-0 group-hover:opacity-100 transition text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                        title="Remove Friend"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          // Add Friend Tab
          <div className="p-4 space-y-4">
            {/* Search Form */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Search by Phone Number
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter phone number (e.g., 0912345678)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                  className="flex-1 px-4 py-2 bg-gray-100 dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm"
                />
                <button
                  onClick={handleSearch}
                  disabled={searching}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition font-medium text-sm flex items-center gap-2"
                >
                  {searching ? "..." : "🔍"}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 p-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Search Result */}
            {searchResult && (
              <div className="bg-gray-100 dark:bg-slate-800 p-4 rounded-lg space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-2xl flex-shrink-0">
                    {searchResult.displayName?.charAt(0) || "?"}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-lg text-gray-900 dark:text-white">{searchResult.displayName}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{searchResult.phone}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{searchResult.email}</p>
                  </div>
                </div>

                {/* Status Badges */}
                <div className="flex gap-2 flex-wrap">
                  <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 text-xs rounded-full font-medium">
                    {searchResult.status}
                  </span>
                  {searchResult.verified?.email && (
                    <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200 text-xs rounded-full font-medium flex items-center gap-1">
                      ✓ Email Verified
                    </span>
                  )}
                </div>

                {/* Add Friend Button */}
                <button
                  onClick={() => handleAddFriend(searchResult.id)}
                  disabled={addingFriend}
                  className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg transition font-medium text-sm flex items-center justify-center gap-2"
                >
                  {addingFriend ? "Sending..." : "➕ Add Friend"}
                </button>
              </div>
            )}

            {/* Empty State */}
            {!searchResult && !error && (
              <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400 text-center">
                <div>
                  <div className="text-5xl mb-3">🔍</div>
                  <p className="font-semibold">Enter a phone number</p>
                  <p className="text-sm mt-1">to search for friends</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
