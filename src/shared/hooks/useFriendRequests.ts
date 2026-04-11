import { useCallback, useEffect, useState } from "react";
import { friendRequestService, FriendRequestTransformed, PaginationInfo } from "@/shared/services/friendRequestService";

/**
 * Hook để manage friend requests state
 * Handles loading, pagination, accept/decline actions
 */
export const useFriendRequests = () => {
    const [requests, setRequests] = useState<FriendRequestTransformed[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pagination, setPagination] = useState<PaginationInfo>({
        page: 1,
        limit: 20,
        total: 0,
        hasMore: false,
    });

    /**
     * Load received requests with pagination
     */
    const loadReceivedRequests = useCallback(async (page: number = 1) => {
        setLoading(true);
        setError(null);
        try {
            console.log("[useFriendRequests] Loading page", page);
            const result = await friendRequestService.getReceivedRequests(page, 20);

            setRequests(result.items);
            setPagination(result.pagination);

            console.log("[useFriendRequests] Loaded requests:", result.items.length);
        } catch (err: any) {
            const errorMessage = err.message || "Failed to load requests";
            setError(errorMessage);
            console.error("[useFriendRequests] Load error:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Accept friend request
     */
    const acceptRequest = useCallback(
        async (requestId: string) => {
            try {
                console.log("[useFriendRequests] Accepting request:", requestId);
                await friendRequestService.acceptFriendRequest(requestId);

                // Remove from list
                setRequests((prev) => prev.filter((r) => r._id !== requestId));
                setPagination((prev) => ({
                    ...prev,
                    total: Math.max(0, prev.total - 1),
                }));

                console.log("[useFriendRequests] Request accepted and removed from list");
                return true;
            } catch (err: any) {
                const errorMessage = err.message || "Failed to accept request";
                setError(errorMessage);
                console.error("[useFriendRequests] Accept error:", err);
                return false;
            }
        },
        []
    );

    /**
     * Decline friend request
     */
    const declineRequest = useCallback(
        async (requestId: string) => {
            try {
                console.log("[useFriendRequests] Declining request:", requestId);
                await friendRequestService.declineFriendRequest(requestId);

                // Remove from list
                setRequests((prev) => prev.filter((r) => r._id !== requestId));
                setPagination((prev) => ({
                    ...prev,
                    total: Math.max(0, prev.total - 1),
                }));

                console.log("[useFriendRequests] Request declined and removed from list");
                return true;
            } catch (err: any) {
                const errorMessage = err.message || "Failed to decline request";
                setError(errorMessage);
                console.error("[useFriendRequests] Decline error:", err);
                return false;
            }
        },
        []
    );

    /**
     * Refresh all requests (go back to page 1)
     */
    const refresh = useCallback(async () => {
        console.log("[useFriendRequests] Refreshing requests");
        await loadReceivedRequests(1);
    }, [loadReceivedRequests]);

    /**
     * Load next page
     */
    const loadMore = useCallback(async () => {
        if (pagination.hasMore && !loading) {
            console.log("[useFriendRequests] Loading next page:", pagination.page + 1);
            await loadReceivedRequests(pagination.page + 1);
        }
    }, [pagination.hasMore, pagination.page, loading, loadReceivedRequests]);

    /**
     * Load on mount
     */
    useEffect(() => {
        console.log("[useFriendRequests] Mount - loading requests...");
        loadReceivedRequests(1);
    }, [loadReceivedRequests]);

    return {
        // Data
        requests,
        loading,
        error,
        pagination,
        pendingCount: requests.length,

        // Actions
        acceptRequest,
        declineRequest,
        refresh,
        loadMore,
        loadReceivedRequests,
    };
};
