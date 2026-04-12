import { useCallback, useEffect, useState } from "react";
import {
    friendRequestService,
    FriendRequestTransformed,
    PaginationInfo,
} from "@/shared/services/friendRequestService";
import {
    FriendSocketService,
    FriendRequestNotification,
} from "../services/friendSocket";
import { useAuth } from "./useAuth";

/**
 * Hook return type with proper TypeScript types
 */
interface UseFriendRequestsReturn {
    // State
    requests: FriendRequestTransformed[];
    loading: boolean;
    error: string | null;
    pagination: PaginationInfo;
    pendingCount: number;

    // Actions
    acceptRequest: (requestId: string) => Promise<boolean>;
    declineRequest: (requestId: string) => Promise<boolean>;
    refresh: () => Promise<void>;
    loadMore: () => Promise<void>;
    loadReceivedRequests: (page: number) => Promise<void>;
}

/**
 * Custom hook for managing friend requests with real-time updates
 * Features:
 * - Load friend requests from API with pagination
 * - Real-time Socket.IO updates via FriendSocketService
 * - Accept/Decline friend requests
 * - Automatic state syncing
 *
 * @returns {UseFriendRequestsReturn} Hook state and actions with full types
 */
export const useFriendRequests = (): UseFriendRequestsReturn => {
    const { user, token } = useAuth();

    // State with proper TypeScript types
    const [requests, setRequests] = useState<FriendRequestTransformed[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
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
    const loadReceivedRequests = useCallback(
        async (page: number = 1): Promise<void> => {
            setLoading(true);
            setError(null);

            try {
                const result =
                    await friendRequestService.getReceivedRequests(page, 20);

                setRequests(result.items);
                setPagination(result.pagination);
            } catch (err: unknown) {
                const errorMessage =
                    err instanceof Error ? err.message : "Failed to load requests";
                setError(errorMessage);
            } finally {
                setLoading(false);
            }
        },
        []
    );

    /**
     * Accept friend request with return type Promise<boolean>
     */
    const acceptRequest = useCallback(
        async (requestId: string): Promise<boolean> => {
            try {
                await friendRequestService.acceptFriendRequest(requestId);

                // Remove from list
                setRequests((prev) => prev.filter((r) => r._id !== requestId));
                setPagination((prev) => ({
                    ...prev,
                    total: Math.max(0, prev.total - 1),
                }));

                return true;
            } catch (err: unknown) {
                const errorMessage =
                    err instanceof Error
                        ? err.message
                        : "Failed to accept request";
                setError(errorMessage);
                return false;
            }
        },
        []
    );

    /**
     * Decline friend request with return type Promise<boolean>
     */
    const declineRequest = useCallback(
        async (requestId: string): Promise<boolean> => {
            try {
                await friendRequestService.declineFriendRequest(requestId);

                // Remove from list
                setRequests((prev) => prev.filter((r) => r._id !== requestId));
                setPagination((prev) => ({
                    ...prev,
                    total: Math.max(0, prev.total - 1),
                }));

                return true;
            } catch (err: unknown) {
                const errorMessage =
                    err instanceof Error
                        ? err.message
                        : "Failed to decline request";
                setError(errorMessage);
                return false;
            }
        },
        []
    );

    /**
     * Refresh requests (go back to page 1) with Promise<void> return type
     */
    const refresh = useCallback(async (): Promise<void> => {
        await loadReceivedRequests(1);
    }, [loadReceivedRequests]);

    /**
     * Load next page with Promise<void> return type
     */
    const loadMore = useCallback(async (): Promise<void> => {
        if (pagination.hasMore && !loading) {
            await loadReceivedRequests(pagination.page + 1);
        }
    }, [pagination.hasMore, pagination.page, loading, loadReceivedRequests]);

    /**
     * Setup Socket.IO real-time listeners
     */
    useEffect((): (() => void) | void => {
        if (!user?.id || !token) {
            return;
        }

        try {
            // Connect socket
            FriendSocketService.connect(token);

            // Handle new friend request - reload all requests to get full details
            const handleNewRequest = async (
                notification: FriendRequestNotification
            ): Promise<void> => {
                try {
                    // Reload all received requests (page 1)
                    // This ensures we get the new request with complete sender info
                    const result = await friendRequestService.getReceivedRequests(1, 20);

                    setRequests(result.items);
                    setPagination(result.pagination);
                } catch (err: unknown) {
                    // If reload fails, add a placeholder
                    const newRequest: FriendRequestTransformed = {
                        _id: notification.data.requestId,
                        senderId: notification.data.fromUserId || "",
                        senderInfo: {
                            displayName: "Unknown User",
                            phoneNumber: "",
                            avatar: "",
                            status: "offline",
                        },
                        status: "PENDING",
                        createdAt: notification.timestamp,
                    };

                    setRequests((prev) => [newRequest, ...prev]);
                    setPagination((prev) => ({
                        ...prev,
                        total: prev.total + 1,
                    }));
                }
            };

            // Handle canceled request (sender cancels their request)
            const handleCanceledRequest = (
                notification: FriendRequestNotification
            ): void => {
                setRequests((prev) =>
                    prev.filter((req) => req._id !== notification.data.requestId)
                );
                setPagination((prev) => ({
                    ...prev,
                    total: Math.max(0, prev.total - 1),
                }));
            };

            // Handle rejected request (when you reject a request)
            const handleRejectedRequest = (
                notification: FriendRequestNotification
            ): void => {
                setRequests((prev) =>
                    prev.filter((req) => req._id !== notification.data.requestId)
                );
                setPagination((prev) => ({
                    ...prev,
                    total: Math.max(0, prev.total - 1),
                }));
            };

            // Handle accepted request (when someone accepts a request you sent)
            const handleAcceptedRequest = (
                notification: FriendRequestNotification
            ): void => {
                // Remove from requests if present (shouldn't be in received requests, but just in case)
                setRequests((prev) =>
                    prev.filter((req) => req._id !== notification.data.requestId)
                );
                setPagination((prev) => ({
                    ...prev,
                    total: Math.max(0, prev.total - 1),
                }));
            };

            FriendSocketService.onFriendRequestReceived(handleNewRequest);
            FriendSocketService.onFriendRequestCanceled(handleCanceledRequest);
            FriendSocketService.onFriendRequestRejected(handleRejectedRequest);
            FriendSocketService.onFriendRequestAccepted(handleAcceptedRequest);

            // Cleanup function with explicit return type
            return (): void => {
                FriendSocketService.offFriendRequestReceived();
                FriendSocketService.offFriendRequestCanceled();
                FriendSocketService.offFriendRequestRejected();
                FriendSocketService.offFriendRequestAccepted();
            };
        } catch (err: unknown) {
            // Socket connection error - will retry automatically
        }
    }, [user?.id, token]);

    /**
     * Load requests on mount
     */
    useEffect((): void => {
        if (user?.id) {
            loadReceivedRequests(1);
        }
    }, [user?.id, loadReceivedRequests]);

    // Return with explicit type annotation
    const returnValue: UseFriendRequestsReturn = {
        // State
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

    return returnValue;
};
