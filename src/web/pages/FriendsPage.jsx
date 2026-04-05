import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "../components/layout/Header";
import { getFriends, removeFriend } from "../../shared/services";

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
      const response = await getFriends();

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
      await removeFriend(friendId);
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
      <div className="max-w-4xl mx-auto py-8 px-4">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">My Friends</h1>

        {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">{error}</div>}

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        ) : friends.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 text-lg">You don't have any friends yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {friends.map((friend) => (
              <div key={friend.id} className="bg-white rounded-lg shadow p-4 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-800">{friend.name}</h3>
                  <p className="text-gray-600 text-sm">{friend.phone}</p>
                </div>
                <button
                  onClick={() => handleUnfriend(friend.id)}
                  className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm"
                >
                  Unfriend
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-8">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-3 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300"
            >
              Previous
            </button>
            <span className="px-3 py-2">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="px-3 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
