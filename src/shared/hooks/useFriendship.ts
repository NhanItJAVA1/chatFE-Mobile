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
import { FriendSocketService, FriendRequestNotification } from "../services/friendSocket";
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
        if (!user?.id) {
            console.warn("[useFriendship] No user ID available");
            setFriendsError("User not authenticated");
            return;
        }

        setFriendsLoading(true);
        setFriendsError(null);
        try {
            const data = await getFriendsWithEnrichment(user.id);
            setFriends(data);
        } catch (error: any) {
            console.error("[useFriendship] Load friends error:", error);
            setFriendsError(error.message);
        } finally {
            setFriendsLoading(false);
        }
    }, [user?.id]);

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
            console.log('[useFriendship] loadSentRequests result:', JSON.stringify(data, null, 2));
            console.log('[useFriendship] Loaded sent requests:', data.map(r => ({ _id: r._id, receiverId: r.receiverId, senderId: r.senderId })));
            setSentRequests(data);
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
            const request = await sendFriendRequest(userId);
            console.log('[useFriendship] Sent request returned:', JSON.stringify(request, null, 2));
            setSentRequests([...sentRequests, request]);
            setFriendshipStatuses(
                new Map(friendshipStatuses).set(userId, {
                    isFriend: false,
                    status: "PENDING",
                })
            );
            return request;
        } catch (error: any) {
            console.error("[useFriendship] Send request error:", error);
            throw error;
        }
    }, [sentRequests, friendshipStatuses]);

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
        try {
            console.log('[useFriendship] Canceling request:', requestId);
            await cancelFriendRequest(requestId);
            console.log('[useFriendship] Cancel API succeeded');
        } catch (error: any) {
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
    const resetFriendshipStatus = useCallback((userId: string) => {
        console.log('[useFriendship] Resetting friendship status to NONE for userId:', userId);
        setFriendshipStatuses((prevStatus) => {
            const updated = new Map(prevStatus);
            updated.set(userId, {
                isFriend: false,
                status: "NONE",
            });
            console.log('[useFriendship] Friendship status reset to NONE for:', userId);
            return updated;
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
        if (!user?.id || !token) {
            return;
        }

        try {
            // Connect socket
            FriendSocketService.connect(token);

            // Handle request rejected by receiver
            const handleRejectedRequest = (
                notification: FriendRequestNotification
            ): void => {
                console.log('[useFriendship] Friend request rejected - Full notification:', JSON.stringify(notification, null, 2));
                console.log('[useFriendship] Looking for requestId:', notification.data?.requestId);

                setSentRequests((prev) => {
                    console.log('[useFriendship] Current sentRequests count:', prev.length);

                    // Log full request objects
                    if (prev.length > 0) {
                        console.log('[useFriendship] Full sentRequests[0]:', JSON.stringify(prev[0], null, 2));
                    }

                    // Try to find by _id first
                    let rejectedRequest = prev.find(
                        (r) => r._id === notification.data.requestId
                    );

                    // If not found, try by id field
                    if (!rejectedRequest) {
                        console.log('[useFriendship] Try matching by id field...');
                        rejectedRequest = prev.find(
                            (r) => (r as any).id === notification.data.requestId
                        );
                    }

                    // If still not found, try partial match
                    if (!rejectedRequest && prev.length > 0) {
                        console.log('[useFriendship] Try partial match with first request...');
                        const first = prev[0];
                        console.log('[useFriendship] First request keys:', Object.keys(first));
                        rejectedRequest = first;
                    }

                    console.log('[useFriendship] Found request:', !!rejectedRequest);
                    if (rejectedRequest) {
                        console.log('[useFriendship] Request receiverId:', rejectedRequest.receiverId);
                    }

                    if (rejectedRequest?.receiverId) {
                        console.log('[useFriendship] Updating friendship status for receiverId:', rejectedRequest.receiverId);

                        // Update friendship status to NONE
                        setFriendshipStatuses((prevStatus) => {
                            const updated = new Map(prevStatus);
                            updated.set(rejectedRequest.receiverId, {
                                isFriend: false,
                                status: "NONE",
                            });
                            console.log('[useFriendship] Updated friendship status to NONE for:', rejectedRequest.receiverId);
                            return updated;
                        });
                    } else {
                        console.warn('[useFriendship] Could not find request in sentRequests:', {
                            requestId: notification.data.requestId,
                            sentRequestsCount: prev.length,
                            firstRequestStructure: prev.length > 0 ? Object.keys(prev[0]) : 'empty'
                        });
                    }

                    // Remove from sent requests
                    const filtered = prev.filter((r) => r._id !== notification.data.requestId && (r as any).id !== notification.data.requestId);
                    console.log('[useFriendship] After filtering, sentRequests count:', filtered.length);
                    return filtered;
                });
            };

            // Handle request accepted by receiver (someone accepts your sent request)
            const handleAcceptedRequest = (
                notification: FriendRequestNotification
            ): void => {
                console.log('[useFriendship] Friend request accepted - Full notification:', JSON.stringify(notification, null, 2));
                console.log('[useFriendship] Looking for requestId:', notification.data?.requestId);

                setSentRequests((prev) => {
                    console.log('[useFriendship] Current sentRequests count:', prev.length);

                    // Log full request objects
                    if (prev.length > 0) {
                        console.log('[useFriendship] Full sentRequests[0]:', JSON.stringify(prev[0], null, 2));
                    }

                    // Try to find by _id first
                    let acceptedRequest = prev.find(
                        (r) => r._id === notification.data.requestId
                    );

                    // If not found, try by id field
                    if (!acceptedRequest) {
                        console.log('[useFriendship] Try matching by id field...');
                        acceptedRequest = prev.find(
                            (r) => (r as any).id === notification.data.requestId
                        );
                    }

                    // If still not found, try to find by fromUserId or senderId matching current user
                    if (!acceptedRequest && prev.length > 0) {
                        console.log('[useFriendship] Try finding by sender (current user)...');
                        acceptedRequest = prev[0];
                        console.log('[useFriendship] Using first request as fallback');
                    }

                    console.log('[useFriendship] Found request:', !!acceptedRequest);
                    if (acceptedRequest) {
                        console.log('[useFriendship] Request details - receiverId:', acceptedRequest.receiverId, 'senderId:', acceptedRequest.senderId);
                    }

                    if (acceptedRequest?.receiverId) {
                        console.log('[useFriendship] Updating friendship status to ACCEPTED for receiverId:', acceptedRequest.receiverId);

                        // Update friendship status to ACCEPTED
                        setFriendshipStatuses((prevStatus) => {
                            const updated = new Map(prevStatus);
                            updated.set(acceptedRequest.receiverId, {
                                isFriend: true,
                                status: "ACCEPTED",
                            });
                            console.log('[useFriendship] Updated friendship status to ACCEPTED for:', acceptedRequest.receiverId);
                            return updated;
                        });

                        // Reload friends list
                        console.log('[useFriendship] Reloading friends list...');
                        loadFriends();
                    } else if (acceptedRequest) {
                        console.log('[useFriendship] Request found but receiverId missing, trying alternative fields...');
                        const receiverId = (acceptedRequest as any).toUserId || (acceptedRequest as any).fromUserId;
                        console.log('[useFriendship] Alternative receiverId:', receiverId);

                        if (receiverId) {
                            setFriendshipStatuses((prevStatus) => {
                                const updated = new Map(prevStatus);
                                updated.set(receiverId, {
                                    isFriend: true,
                                    status: "ACCEPTED",
                                });
                                console.log('[useFriendship] Updated friendship status to ACCEPTED for:', receiverId);
                                return updated;
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
                    const filtered = prev.filter((r) => r._id !== notification.data.requestId && (r as any).id !== notification.data.requestId);
                    console.log('[useFriendship] After filtering, sentRequests count:', filtered.length);
                    return filtered;
                });
            };

            // Handle sender's own request being canceled
            const handleSenderCanceledRequest = (
                notification: FriendRequestNotification
            ): void => {
                console.log('[useFriendship] Own request canceled - Full notification:', JSON.stringify(notification, null, 2));
                console.log('[useFriendship] Looking for requestId:', notification.data?.requestId);

                setSentRequests((prev) => {
                    console.log('[useFriendship] Current sentRequests count for cancel:', prev.length);

                    // Try to find by _id first
                    let canceledRequest = prev.find(r => r._id === notification.data?.requestId);

                    // If not found, try by id field (API uses 'id' not '_id')
                    if (!canceledRequest) {
                        console.log('[useFriendship] Try matching by id field...');
                        canceledRequest = prev.find(
                            (r) => (r as any).id === notification.data?.requestId
                        );
                    }

                    console.log('[useFriendship] Found canceled request:', !!canceledRequest);

                    if (canceledRequest?.receiverId) {
                        console.log('[useFriendship] Resetting status to NONE for:', canceledRequest.receiverId);
                        // Reset the friendship status back to NONE
                        setFriendshipStatuses((prevStatus) => {
                            const updated = new Map(prevStatus);
                            updated.set(canceledRequest.receiverId, {
                                isFriend: false,
                                status: "NONE",
                            });
                            console.log('[useFriendship] Status updated to NONE for:', canceledRequest.receiverId);
                            return updated;
                        });
                    }

                    // Remove from sent requests (try both _id and id fields)
                    console.log('[useFriendship] Removing canceled request:', notification.data?.requestId);
                    const filtered = prev.filter((r) => r._id !== notification.data?.requestId && (r as any).id !== notification.data?.requestId);
                    console.log('[useFriendship] After cancel, sentRequests count:', filtered.length);
                    return filtered;
                });
            };

            FriendSocketService.onFriendRequestRejected(handleRejectedRequest);
            FriendSocketService.onFriendRequestAccepted(handleAcceptedRequest);
            FriendSocketService.onFriendRequestCanceled(handleSenderCanceledRequest);

            // Cleanup
            return (): void => {
                FriendSocketService.offFriendRequestRejected();
                FriendSocketService.offFriendRequestAccepted();
                FriendSocketService.offFriendRequestCanceled();
            };
        } catch (err: unknown) {
            // Socket connection error - will retry automatically
        }
    }, [user?.id, token, loadFriends]);

    // Auto load on mount
    useEffect(() => {
        if (autoLoad) {
            loadFriends();
            loadReceivedRequests();
            loadSentRequests();
        }
    }, [autoLoad, loadFriends, loadReceivedRequests, loadSentRequests]);

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
