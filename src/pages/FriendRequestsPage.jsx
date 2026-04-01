import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "../components/layout/Header";
import {
  getReceivedFriendRequests,
  getSentFriendRequests,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
} from "../services/friendService";

export const FriendRequestsPage = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("received"); // received | sent
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [processingId, setProcessingId] = useState(null);

  useEffect(() => {
    fetchRequests();
  }, [activeTab, page]);

  const fetchRequests = async () => {
    setLoading(true);
    setError("");
    try {
      const response = activeTab === "received" ? await getReceivedFriendRequests() : await getSentFriendRequests();

      if (response && response.data) {
        setRequests(response.data.items || []);
      }
    } catch (err) {
      setError(err.message || "Failed to load friend requests");
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (requestId) => {
    try {
      setProcessingId(requestId);
      await acceptFriendRequest(requestId);
      setRequests(requests.map((r) => (r.id === requestId ? { ...r, status: "accepted" } : r)));
      alert("Friend request accepted!");
    } catch (err) {
      alert(err.message || "Failed to accept request");
    } finally {
      setProcessingId(null);
    }
  };

  const handleDecline = async (requestId) => {
    try {
      setProcessingId(requestId);
      await declineFriendRequest(requestId);
      setRequests(requests.map((r) => (r.id === requestId ? { ...r, status: "declined" } : r)));
      alert("Friend request declined!");
    } catch (err) {
      alert(err.message || "Failed to decline request");
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancel = async (requestId) => {
    try {
      setProcessingId(requestId);
      await cancelFriendRequest(requestId);
      setRequests(requests.filter((r) => r.id !== requestId));
      alert("Friend request cancelled!");
    } catch (err) {
      alert(err.message || "Failed to cancel request");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-3xl font-bold text-gray-800">Friend Requests</h2>
          <button
            onClick={() => navigate(-1)}
            className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition"
          >
            Back
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => {
              setActiveTab("received");
              setPage(1);
            }}
            className={`px-6 py-2 rounded-lg font-semibold transition ${
              activeTab === "received"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
            }`}
          >
            📥 Received ({requests.length})
          </button>
          <button
            onClick={() => {
              setActiveTab("sent");
              setPage(1);
            }}
            className={`px-6 py-2 rounded-lg font-semibold transition ${
              activeTab === "sent"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
            }`}
          >
            📤 Sent ({requests.length})
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

        {/* Requests List */}
        <div className="space-y-4">
          {requests.length === 0 ? (
            <div className="bg-white p-8 rounded-lg shadow text-center text-gray-600">
              <p className="text-lg">
                {activeTab === "received" ? "No received friend requests" : "No sent friend requests"}
              </p>
            </div>
          ) : (
            requests.map((request) => (
              <div
                key={request.id}
                className="bg-white p-4 rounded-lg shadow-md hover:shadow-lg transition flex items-center justify-between"
              >
                <div className="flex-1">
                  <div className="text-sm text-gray-600">
                    {activeTab === "received" ? (
                      <>
                        <p className="font-semibold text-gray-800">User ID: {request.fromUserId}</p>
                        <p>Sent on: {new Date(request.createdAt).toLocaleDateString()}</p>
                      </>
                    ) : (
                      <>
                        <p className="font-semibold text-gray-800">User ID: {request.toUserId}</p>
                        <p>Sent on: {new Date(request.createdAt).toLocaleDateString()}</p>
                      </>
                    )}
                  </div>
                  <p className="mt-1 text-sm">
                    <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold">
                      {request.status}
                    </span>
                  </p>
                </div>

                {/* Actions */}
                {activeTab === "received" && request.status === "pending" && (
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handleAccept(request.id)}
                      disabled={processingId === request.id}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {processingId === request.id ? "..." : "Accept"}
                    </button>
                    <button
                      onClick={() => handleDecline(request.id)}
                      disabled={processingId === request.id}
                      className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {processingId === request.id ? "..." : "Decline"}
                    </button>
                  </div>
                )}

                {activeTab === "sent" && request.status === "pending" && (
                  <button
                    onClick={() => handleCancel(request.id)}
                    disabled={processingId === request.id}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition text-sm ml-4 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {processingId === request.id ? "..." : "Cancel"}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
};
