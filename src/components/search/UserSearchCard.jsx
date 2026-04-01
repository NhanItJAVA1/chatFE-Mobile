import { useState } from "react";
import { sendFriendRequest } from "../../services/friendService";

export const UserSearchCard = ({ user, onRequestSent }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleAddFriend = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await sendFriendRequest(user.id);

      if (response && response.status === "success") {
        setSuccess(true);
        if (onRequestSent) {
          onRequestSent(user.id);
        }
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(response?.msg || "Failed to send friend request");
      }
    } catch (err) {
      setError(err.message || "Failed to send friend request");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 flex items-center justify-between hover:shadow-lg transition-shadow">
      <div className="flex items-center gap-4 flex-1">
        {/* Avatar placeholder */}
        <div className="w-16 h-16 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
          {user.displayName?.charAt(0).toUpperCase() || "?"}
        </div>

        {/* User info */}
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900">{user.displayName}</h3>
          <p className="text-gray-600 text-sm">{user.phone}</p>
          {user.email && <p className="text-gray-500 text-xs">{user.email}</p>}
          <div className="mt-2 flex gap-2 flex-wrap">
            {user.status && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                {user.status}
              </span>
            )}
            {user.verified?.email && (
              <span
                className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                title="Email verified"
              >
                ✓ Email
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action button */}
      <div className="flex flex-col items-end gap-2 ml-4">
        <button
          onClick={handleAddFriend}
          disabled={loading || success}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            success
              ? "bg-green-500 text-white"
              : "bg-blue-500 hover:bg-blue-600 text-white disabled:bg-gray-400 disabled:cursor-not-allowed"
          }`}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
              Sending...
            </span>
          ) : success ? (
            "✓ Sent"
          ) : (
            "Add Friend"
          )}
        </button>
        {error && <p className="text-red-500 text-xs text-right max-w-xs">{error}</p>}
      </div>
    </div>
  );
};
