import { useState, useCallback, useEffect, useRef } from "react";
import {
    searchUsers,
    sendFriendRequest,
    getReceivedFriendRequests,
    getSentFriendRequests,
    acceptFriendRequest,
    rejectFriendRequest,
    cancelFriendRequest,
    getFriends,
    getFriendsWithEnrichment,
    checkFriendshipStatus,
    getMutualFriends,
    removeFriend,
} from "../services/friendService";
import { FriendSocketService, FriendRequestNotification, FriendshipNotification } from "../services/friendSocket";
import { useAuth } from "./useAuth";
import type { Friend, FriendRequest, FriendshipStatus, User } from "@/types";

interface UseFriendshipOptions {
    autoLoad?: boolean;
}

export interface UseFriendshipState {
    // Friends list
    friends: Friend[];
    friendsLoading: boolean;
    friendsError: string | null;

    // Received requests
    receivedRequests: FriendRequest[];
    receivedLoading: boolean;
    receivedError: string | null;

    // Sent requests
    sentRequests: FriendRequest[];
    sentLoading: boolean;
    sentError: string | null;

    // Search results
    searchResults: User[];
    searchLoading: boolean;
    searchError: string | null;

    // Friendship status cache
    friendshipStatuses: Map<string, FriendshipStatus>;
    statusLoading: Map<string, boolean>;

    // Mutual friends
    mutualFriends: User[];
    mutualFriendsLoading: boolean;
    mutualFriendsError: string | null;
}

export interface UseFriendshipActions {
    // Friends list
    loadFriends: () => Promise<void>;
    addFriend: (friend: Friend) => void;
    removeFriendFromList: (friendId: string) => void;

    // Requests
    loadReceivedRequests: () => Promise<void>;
    loadSentRequests: () => Promise<void>;
    removeSentRequest: (requestId: string) => void;
    removeReceivedRequest: (requestId: string) => void;

    // Friend actions
    sendRequest: (userId: string) => Promise<FriendRequest>;
    acceptRequest: (requestId: string) => Promise<void>;
    rejectRequest: (requestId: string) => Promise<void>;
    cancelRequest: (requestId: string) => Promise<void>;
    resetFriendshipStatus: (userId: string) => void;
    unfriend: (friendId: string) => Promise<void>;

    // Search and status
    searchUsersQuery: (query: string) => Promise<void>;
    checkStatus: (userId: string) => Promise<FriendshipStatus | null>;
    loadMutualFriends: (userId: string) => Promise<void>;
}

interface UseFriendshipReturn {
    state: UseFriendshipState;
    actions: UseFriendshipActions;
}

/**
 * Hook for managing friendship state and actions
 *
 * @param options Configuration options
 * @returns State and actions for friendship management
 */
export const useFriendship = (
    options: UseFriendshipOptions = {}
): UseFriendshipReturn => {
    const { autoLoad = true } = options;
    const { user, token } = useAuth();
    const currentUserId = user?.id || (user as any)?._id;

    // Store mapping of requestId -> userId for socket event handling
    const requestIdToUserIdRef = useRef<Map<string, string>>(new Map());

    // Friends list
    const [friends, setFriends] = useState<Friend[]>([]);
    const [friendsLoading, setFriendsLoading] = useState(false);
    const [friendsError, setFriendsError] = useState<string | null>(null);

    // Received requests
    const [receivedRequests, setReceivedRequests] = useState<FriendRequest[]>([]);
    const [receivedLoading, setReceivedLoading] = useState(false);
    const [receivedError, setReceivedError] = useState<string | null>(null);

    // Sent requests
    const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
    const [sentLoading, setSentLoading] = useState(false);
    const [sentError, setSentError] = useState<string | null>(null);

    // Search
    const [searchResults, setSearchResults] = useState<User[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);

    // Friendship status
    const [friendshipStatuses, setFriendshipStatuses] = useState<
        Map<string, FriendshipStatus>
    >(new Map());
    const [statusLoading, setStatusLoading] = useState<Map<string, boolean>>(
        new Map()
    );

    // Mutual friends
    const [mutualFriends, setMutualFriends] = useState<User[]>([]);
    const [mutualFriendsLoading, setMutualFriendsLoading] = useState(false);
    const [mutualFriendsError, setMutualFriendsError] = useState<string | null>(
        null
    );

    // Load friends
    const loadFriends = useCallback(async () => {
        if (!currentUserId) {
            console.warn("[useFriendship] No user ID available");
            setFriendsError("User not authenticated");
            return;
        }

        setFriendsLoading(true);
        setFriendsError(null);
        try {
            const data = await getFriendsWithEnrichment(currentUserId);
            setFriends(data);
        } catch (error: any) {
            console.error("[useFriendship] Load friends error:", error);
            setFriendsError(error.message);
        } finally {
            setFriendsLoading(false);
        }
    }, [currentUserId]);

    // Load received requests
    const loadReceivedRequests = useCallback(async () => {
        setReceivedLoading(true);
        setReceivedError(null);
        try {
            const data = await getReceivedFriendRequests();
            setReceivedRequests(data);
        } catch (error: any) {
            console.error("[useFriendship] Load received error:", error);
            setReceivedError(error.message);
        } finally {
            setReceivedLoading(false);
        }
    }, []);

    // Load sent requests
    const loadSentRequests = useCallback(async () => {
        setSentLoading(true);
        setSentError(null);
        try {
            const data = await getSentFriendRequests();
            setSentRequests(data);

            // Refresh requestId -> receiverId map for robust socket reconciliation
            const nextMap = new Map<string, string>();
            data.forEach((req: any) => {
                const reqId = req?._id || req?.id;
                const receiverId = req?.receiverId || req?.toUserId;
                if (reqId && receiverId) {
                    nextMap.set(String(reqId), String(receiverId));
                }
            });
            requestIdToUserIdRef.current = nextMap;

            // Reconcile cached friendship status with the latest sent requests from server.
            // This fixes stale "pending" state when realtime events are missed on web.
            const latestPendingUserIds = new Set<string>(
                data
                    .map((req: any) => String(req?.receiverId || req?.toUserId || ""))
                    .filter(Boolean)
            );

            setFriendshipStatuses((prevStatus) => {
                const updated = new Map(prevStatus);

                // Ensure users that still have outgoing requests stay pending.
                latestPendingUserIds.forEach((userId) => {
                    const current = updated.get(userId);
                    if (!current || current.status !== "pending") {
                        updated.set(userId, {
                            isFriend: false,
                            status: "pending",
                        });
                    }
                });

                // Reset stale pending entries that are no longer present in sent requests.
                updated.forEach((status, userId) => {
                    if (status.status === "pending" && !latestPendingUserIds.has(userId)) {
                        updated.set(userId, {
                            isFriend: false,
                            status: "none",
                        });
                    }
                });

                return updated;
            });
        } catch (error: any) {
            console.error("[useFriendship] Load sent error:", error);
            setSentError(error.message);
        } finally {
            setSentLoading(false);
        }
    }, []);

    // Send friend request
    const sendRequest = useCallback(async (userId: string): Promise<FriendRequest> => {
        try {
            const request = await sendFriendRequest(userId);            setSentRequests((prev) => [...prev, request]);

            const requestId = (request as any)?._id || (request as any)?.id;
            if (requestId) {
                requestIdToUserIdRef.current.set(String(requestId), userId);
            }

            setFriendshipStatuses(
                new Map(friendshipStatuses).set(userId, {
                    isFriend: false,
                    status: "pending",
                })
            );
            return request;
        } catch (error: any) {
            console.error("[useFriendship] Send request error:", error);
            throw error;
        }
    }, [friendshipStatuses]);

    // Accept friend request
    const acceptRequest = useCallback(async (requestId: string) => {
        try {
            await acceptFriendRequest(requestId);
            removeReceivedRequest(requestId);
            await loadFriends();
        } catch (error: any) {
            console.error("[useFriendship] Accept error:", error);
            throw error;
        }
    }, []);

    // Reject friend request
    const rejectRequest = useCallback(async (requestId: string) => {
        try {
            await rejectFriendRequest(requestId);
            removeReceivedRequest(requestId);
        } catch (error: any) {
            console.error("[useFriendship] Reject error:", error);
            throw error;
        }
    }, []);

    // Cancel sent request
    const cancelRequest = useCallback(async (requestId: string) => {
        try {            await cancelFriendRequest(requestId);        } catch (error: any) {
            console.error("[useFriendship] Cancel error:", error);
            throw error;
        }
    }, []);

    // Unfriend
    const unfriend = useCallback(async (friendId: string) => {
        try {
            await removeFriend(friendId);
            removeFriendFromList(friendId);
        } catch (error: any) {
            console.error("[useFriendship] Unfriend error:", error);
            throw error;
        }
    }, []);

    // Reset friendship status to NONE for a user
    const resetFriendshipStatus = useCallback((userId: string) => {        setFriendshipStatuses((prevStatus) => {
            const updated = new Map(prevStatus);
            updated.set(userId, {
                isFriend: false,
                status: "none",
            });            return updated;
        });
    }, []);

    // Search users
    const searchUsersQuery = useCallback(async (query: string) => {
        if (!query.trim()) {
            setSearchResults([]);
            return;
        }

        setSearchLoading(true);
        setSearchError(null);
        try {
            const data = await searchUsers(query);
            setSearchResults(data);
        } catch (error: any) {
            console.error("[useFriendship] Search error:", error);
            setSearchError(error.message);
        } finally {
            setSearchLoading(false);
        }
    }, []);

    // Check friendship status
    const checkStatus = useCallback(
        async (userId: string): Promise<FriendshipStatus | null> => {
            // Check cache first
            if (friendshipStatuses.has(userId)) {
                return friendshipStatuses.get(userId) || null;
            }

            setStatusLoading(
                new Map(statusLoading).set(userId, true)
            );
            try {
                const status = await checkFriendshipStatus(userId);
                setFriendshipStatuses(
                    new Map(friendshipStatuses).set(userId, status)
                );
                return status;
            } catch (error: any) {
                console.error("[useFriendship] Check status error:", error);
                return null;
            } finally {
                setStatusLoading(
                    new Map(statusLoading).set(userId, false)
                );
            }
        },
        [friendshipStatuses, statusLoading]
    );

    // Load mutual friends
    const loadMutualFriends = useCallback(async (userId: string) => {
        setMutualFriendsLoading(true);
        setMutualFriendsError(null);
        try {
            const data = await getMutualFriends(userId);
            setMutualFriends(data);
        } catch (error: any) {
            console.error("[useFriendship] Load mutual friends error:", error);
            setMutualFriendsError(error.message);
        } finally {
            setMutualFriendsLoading(false);
        }
    }, []);

    // Helper: Add friend to list
    const addFriend = useCallback((friend: Friend) => {
        setFriends((prev) =>
            prev.some((f) => f._id === friend._id)
                ? prev
                : [...prev, friend]
        );
    }, []);

    // Helper: Remove friend from list
    const removeFriendFromList = useCallback((friendId: string) => {
        setFriends((prev) => prev.filter((f) => f.friendId !== friendId));
    }, []);

    // Helper: Remove sent request
    const removeSentRequest = useCallback((requestId: string) => {
        setSentRequests((prev) => prev.filter((r) => r._id !== requestId && (r as any).id !== requestId));
    }, []);

    // Helper: Remove received request
    const removeReceivedRequest = useCallback((requestId: string) => {
        setReceivedRequests((prev) => prev.filter((r) => r._id !== requestId));
    }, []);

    // Setup Socket.IO listeners to sync sent requests
    useEffect(() => {
        if (!currentUserId || !token) {
            return;
        }

        try {
            // Connect socket
            FriendSocketService.connect(token);

            // Handle request rejected by receiver
            const handleRejectedRequest = (
                notification: FriendRequestNotification
            ): void => {                setSentRequests((prev) => {
                    // Log full request objects
                    if (prev.length > 0) {                    }

                    // Try to find by _id first
                    let rejectedRequest = prev.find(
                        (r) => r._id === notification.data.requestId
                    );

                    // If not found, try by id field
                    if (!rejectedRequest) {                        rejectedRequest = prev.find(
                            (r) => (r as any).id === notification.data.requestId
                        );
                    }

                    // Fallback by receiverId from socket payload when requestId mapping is missing
                    if (!rejectedRequest && notification.data?.rejectedBy) {
                        rejectedRequest = prev.find(
                            (r) => r.receiverId === notification.data.rejectedBy
                        );
                    }

                    // Fallback by requestId -> receiverId map
                    let mappedReceiverId: string | undefined;
                    if (!rejectedRequest && notification.data?.requestId) {
                        mappedReceiverId = requestIdToUserIdRef.current.get(
                            String(notification.data.requestId)
                        );
                    }                    if (rejectedRequest) {                    }

                    const receiverIdForReset =
                        rejectedRequest?.receiverId ||
                        mappedReceiverId ||
                        notification.data?.rejectedBy ||
                        notification.data?.fromUserId;

                    if (receiverIdForReset) {
                        // Update friendship status to NONE
                        setFriendshipStatuses((prevStatus) => {
                            const updated = new Map(prevStatus);
                            updated.set(receiverIdForReset, {
                                isFriend: false,
                                status: "none",
                            });                            return updated;
                        });
                    } else {
                        console.warn('[useFriendship] Could not find request in sentRequests:', {
                            requestId: notification.data.requestId,
                            sentRequestsCount: prev.length,
                            firstRequestStructure: prev.length > 0 ? Object.keys(prev[0]) : 'empty'
                        });
                    }

                    // Remove from sent requests
                    const filtered = prev.filter((r) => {
                        const sameRequestId = r._id === notification.data.requestId || (r as any).id === notification.data.requestId;
                        const sameReceiver = receiverIdForReset && (r.receiverId === receiverIdForReset || (r as any).toUserId === receiverIdForReset);
                        return !(sameRequestId || sameReceiver);
                    });

                    if (notification.data?.requestId) {
                        requestIdToUserIdRef.current.delete(String(notification.data.requestId));
                    }                    return filtered;
                });
            };

            // Handle request accepted by receiver (someone accepts your sent request)
            const handleAcceptedRequest = (
                notification: FriendRequestNotification
            ): void => {                setSentRequests((prev) => {
                    // Log full request objects
                    if (prev.length > 0) {                    }

                    // Try to find by _id first
                    let acceptedRequest = prev.find(
                        (r) => r._id === notification.data.requestId
                    );

                    // If not found, try by id field
                    if (!acceptedRequest) {                        acceptedRequest = prev.find(
                            (r) => (r as any).id === notification.data.requestId
                        );
                    }

                    // If still not found, try to find by fromUserId or senderId matching current user
                    if (!acceptedRequest && prev.length > 0) {                        acceptedRequest = prev[0];                    }                    if (acceptedRequest) {                    }

                    if (acceptedRequest?.receiverId) {
                        // Update friendship status to ACCEPTED
                        setFriendshipStatuses((prevStatus) => {
                            const updated = new Map(prevStatus);
                            updated.set(acceptedRequest.receiverId, {
                                isFriend: true,
                                status: "accepted",
                            });                            return updated;
                        });                        loadFriends();
                    } else if (acceptedRequest) {                        const receiverId = (acceptedRequest as any).toUserId || (acceptedRequest as any).fromUserId;
                        if (receiverId) {
                            setFriendshipStatuses((prevStatus) => {
                                const updated = new Map(prevStatus);
                                updated.set(receiverId, {
                                    isFriend: true,
                                    status: "accepted",
                                });                                return updated;
                            });
                            loadFriends();
                        }
                    } else {
                        console.warn('[useFriendship] Could not find request in sentRequests:', {
                            requestId: notification.data.requestId,
                            sentRequestsCount: prev.length,
                            firstRequestStructure: prev.length > 0 ? Object.keys(prev[0]) : 'empty'
                        });
                    }

                    // Remove from sent requests
                    const filtered = prev.filter((r) => r._id !== notification.data.requestId && (r as any).id !== notification.data.requestId);                    return filtered;
                });
            };

            // Handle sender's own request being canceled
            const handleSenderCanceledRequest = (
                notification: FriendRequestNotification
            ): void => {                setSentRequests((prev) => {
                    // Try to find by _id first
                    let canceledRequest = prev.find(r => r._id === notification.data?.requestId);

                    // If not found, try by id field (API uses 'id' not '_id')
                    if (!canceledRequest) {                        canceledRequest = prev.find(
                            (r) => (r as any).id === notification.data?.requestId
                        );
                    }
                    if (canceledRequest?.receiverId) {                        // Reset the friendship status back to NONE
                        setFriendshipStatuses((prevStatus) => {
                            const updated = new Map(prevStatus);
                            updated.set(canceledRequest.receiverId, {
                                isFriend: false,
                                status: "none",
                            });                            return updated;
                        });
                    }                    const filtered = prev.filter((r) => r._id !== notification.data?.requestId && (r as any).id !== notification.data?.requestId);                    return filtered;
                });
            };

            const handleUnfriended = (notification: FriendshipNotification): void => {
                const unfriendedUserId = notification.data.friendId || notification.data.userId;
                if (!unfriendedUserId) {
                    return;
                }

                setFriends((prev) => prev.filter((f) => f.friendId !== unfriendedUserId));
                setFriendshipStatuses((prevStatus) => {
                    const updated = new Map(prevStatus);
                    updated.set(unfriendedUserId, {
                        isFriend: false,
                        status: "none",
                    });
                    return updated;
                });
            };

            FriendSocketService.onFriendRequestRejected(handleRejectedRequest);
            FriendSocketService.onFriendRequestAccepted(handleAcceptedRequest);
            FriendSocketService.onFriendRequestCanceled(handleSenderCanceledRequest);
            FriendSocketService.onFriendshipUnfriended(handleUnfriended);

            // Cleanup
            return (): void => {
                FriendSocketService.offFriendRequestRejected();
                FriendSocketService.offFriendRequestAccepted();
                FriendSocketService.offFriendRequestCanceled();
                FriendSocketService.offFriendshipUnfriended();
            };
        } catch (err: unknown) {
            // Socket connection error - will retry automatically
        }
    }, [currentUserId, token, loadFriends]);

    // Auto load on mount
    useEffect(() => {
        if (autoLoad) {
            loadFriends();
            loadReceivedRequests();
            // Removed: loadSentRequests() - fetch only when user uses add friend feature
        }
    }, [autoLoad, loadFriends, loadReceivedRequests]);

    // Note: Removed 5-second polling interval for sent requests
    // Socket events handle real-time updates; no need for periodic fallback polling
    // This reduces API spam from ~48 calls/minute to just initial load on mount

    const state: UseFriendshipState = {
        friends,
        friendsLoading,
        friendsError,
        receivedRequests,
        receivedLoading,
        receivedError,
        sentRequests,
        sentLoading,
        sentError,
        searchResults,
        searchLoading,
        searchError,
        friendshipStatuses,
        statusLoading,
        mutualFriends,
        mutualFriendsLoading,
        mutualFriendsError,
    };

    const actions: UseFriendshipActions = {
        loadFriends,
        addFriend,
        removeFriendFromList,
        loadReceivedRequests,
        loadSentRequests,
        removeSentRequest,
        removeReceivedRequest,
        sendRequest,
        acceptRequest,
        rejectRequest,
        cancelRequest,
        resetFriendshipStatus,
        unfriend,
        searchUsersQuery,
        checkStatus,
        loadMutualFriends,
    };

    return { state, actions };
};
