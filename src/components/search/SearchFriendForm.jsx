import { useState } from "react";
import { searchUserByPhone } from "../../services/friendService";

export const SearchFriendForm = ({ onSearch, onLoading }) => {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!phone.trim()) {
      setError("Please enter a phone number");
      return;
    }

    // Validate phone format
    if (!/^0\d{9}$/.test(phone)) {
      setError("Phone number must be 10 digits (0xxxxxxxxx)");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      onLoading(true);

      const result = await searchUserByPhone(phone);
      console.log("Search result:", result);

      if (result && result.data) {
        onSearch(result.data);
      } else {
        setError("User not found");
        onSearch(null);
      }
    } catch (err) {
      const errorMsg = err.response?.data?.msg || err.message || "Search failed";
      setError(errorMsg);
      onSearch(null);
    } finally {
      setLoading(false);
      onLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Search Friends</h2>

      <div className="flex gap-3">
        <input
          type="tel"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            setError(null);
          }}
          placeholder="Enter phone number (e.g., 0910101010)"
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
              Searching...
            </span>
          ) : (
            "Search"
          )}
        </button>
      </div>

      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}
    </form>
  );
};
