import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../shared/hooks";
import { SearchFriendForm } from "../components/search/SearchFriendForm";
import { UserSearchCard } from "../components/search/UserSearchCard";

export const SearchFriendsPage = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [searchResult, setSearchResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    navigate("/login");
    return null;
  }

  const handleSearch = (result) => {
    setSearchResult(result);
  };

  const handleRequestSent = (userId) => {
    // Could update state here to show user was already sent a request
    // or refetch data
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate(-1)}
            className="text-blue-500 hover:text-blue-700 font-medium mb-4 flex items-center gap-1"
          >
            ← Back
          </button>
        </div>

        {/* Search Form */}
        <SearchFriendForm onSearch={handleSearch} onLoading={setIsLoading} />

        {/* Search Results */}
        <div className="mt-8">
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <div className="flex flex-col items-center gap-3">
                <div className="animate-spin inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
                <p className="text-gray-600">Searching...</p>
              </div>
            </div>
          ) : searchResult ? (
            <UserSearchCard user={searchResult} onRequestSent={handleRequestSent} />
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">Search for friends by phone number</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
