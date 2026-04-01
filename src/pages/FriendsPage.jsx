import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "../components/layout/Header";
import { getFriendsList, unfriend } from "../services/friendService";

export const FriendsPage = () => {
  const navigate = useNavigate();
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(20);

  useEffect(() => {
    fetchFriends();
  }, [page]);

  const fetchFriends = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await getFriendsList(page, limit);

      if (response && response.data) {
        setFriends(response.data.items || []);
        setTotal(response.data.total || 0);
      }
    } catch (err) {
      setError(err.message || "Failed to load friends");
    } finally {
      setLoading(false);
    }
  };

  const handleUnfriend = async (friendId) => {
    if (!window.confirm("Are you sure you want to unfriend this person?")) {
      return;
    }

    try {
      await unfriend(friendId);
      setFriends(friends.filter((f) => f.id !== friendId));
      alert("Unfriended successfully");
    } catch (err) {
      alert(err.message || "Failed to unfriend");
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-3xl font-bold text-gray-800">My Friends ({total})</h2>
          <button
            onClick={() => navigate(-1)}
            className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition"
          >
            Back
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="text-gray-600 mt-2">Loading...</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-4">{error}</div>
        )}

        {/* Friends List */}
        <div className="space-y-4">
          {friends.length === 0 ? (
            <div className="bg-white p-8 rounded-lg shadow text-center text-gray-600">
              <p className="text-lg">No friends yet</p>
              <p className="text-sm mt-2">
                Find friends{" "}
                <button
                  onClick={() => navigate("/search-friends")}
                  className="text-blue-600 hover:text-blue-700 font-semibold"
                >
                  here
                </button>
              </p>
            </div>
          ) : (
            friends.map((friend) => (
              <div
                key={friend.id}
                className="bg-white p-4 rounded-lg shadow-md hover:shadow-lg transition flex items-center justify-between"
              >
                <div className="flex-1">
                  <div className="text-sm text-gray-600">
                    <p className="font-semibold text-gray-800">
                      Friend ID: {friend.userA === friend.userB ? friend.userA : friend.userA}
                    </p>
                    <p>Connected since: {new Date(friend.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => navigate(`/chat/${friend.id}`)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition text-sm"
                  >
                    💬 Chat
                  </button>
                  <button
                    onClick={() => handleUnfriend(friend.id)}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition text-sm"
                  >
                    Unfriend
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-8">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <div className="flex items-center gap-2">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`px-3 py-2 rounded-lg ${
                    page === p ? "bg-blue-600 text-white" : "bg-gray-300 hover:bg-gray-400 text-gray-800"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}
      </main>
    </div>
  );
};
