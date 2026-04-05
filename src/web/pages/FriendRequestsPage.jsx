import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "../components/layout/Header";
import {
  getReceivedFriendRequests,
  getSentFriendRequests,
  acceptFriendRequest,
  rejectFriendRequest,
} from "../../shared/services";

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

  const handleReject = async (requestId) => {
    try {
      setProcessingId(requestId);
      await rejectFriendRequest(requestId);
      setRequests(requests.filter((r) => r.id !== requestId));
      alert("Friend request rejected");
    } catch (err) {
      alert(err.message || "Failed to reject request");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-4xl mx-auto py-8 px-4">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">Friend Requests</h1>

        {/* Tabs */}
        <div className="flex gap-4 mb-8 border-b">
          <button
            onClick={() => {
              setActiveTab("received");
              setPage(1);
            }}
            className={`px-6 py-3 font-medium ${
              activeTab === "received"
                ? "border-b-2 border-blue-500 text-blue-600"
                : "text-gray-600 hover:text-gray-800"
            }`}
          >
            Received
          </button>
          <button
            onClick={() => {
              setActiveTab("sent");
              setPage(1);
            }}
            className={`px-6 py-3 font-medium ${
              activeTab === "sent" ? "border-b-2 border-blue-500 text-blue-600" : "text-gray-600 hover:text-gray-800"
            }`}
          >
            Sent
          </button>
        </div>

        {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">{error}</div>}

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 text-lg">No {activeTab} friend requests</p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((request) => (
              <div key={request.id} className="bg-white rounded-lg shadow p-4 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-800">{request.sender?.name || request.receiver?.name}</h3>
                  <p className="text-gray-600 text-sm">{request.sender?.phone || request.receiver?.phone}</p>
                </div>

                {activeTab === "received" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAccept(request.id)}
                      disabled={processingId === request.id}
                      className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded disabled:bg-gray-300"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleReject(request.id)}
                      disabled={processingId === request.id}
                      className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded disabled:bg-gray-300"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
