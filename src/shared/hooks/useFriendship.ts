import { useState, useCallback, useEffect } from "react";
import {
    searchUsers,
    sendFriendRequest,
    getReceivedFriendRequests,
    getSentFriendRequests,
    acceptFriendRequest,
    rejectFriendRequest,
    cancelFriendRequest,
    getFriends,
    checkFriendshipStatus,
    getMutualFriends,
    removeFriend,
} from "../services/friendService";
import type { Friend, FriendRequest, FriendshipStatus, User } from "@/types";

interface UseFriendshipOptions {
    autoLoad?: boolean;
}

interface UseFriendshipState {
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

interface UseFriendshipActions {
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
    sendRequest: (userId: string) => Promise<void>;
    acceptRequest: (requestId: string) => Promise<void>;
    rejectRequest: (requestId: string) => Promise<void>;
    cancelRequest: (requestId: string) => Promise<void>;
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
        setFriendsLoading(true);
        setFriendsError(null);
        try {
            const data = await getFriends();
            setFriends(data);
        } catch (error: any) {
            console.error("[useFriendship] Load friends error:", error);
            setFriendsError(error.message);
        } finally {
            setFriendsLoading(false);
        }
    }, []);

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
        } catch (error: any) {
            console.error("[useFriendship] Load sent error:", error);
            setSentError(error.message);
        } finally {
            setSentLoading(false);
        }
    }, []);

    // Send friend request
    const sendRequest = useCallback(async (userId: string) => {
        try {
            const request = await sendFriendRequest(userId);
            setSentRequests([...sentRequests, request]);
            setFriendshipStatuses(
                new Map(friendshipStatuses).set(userId, {
                    isFriend: false,
                    status: "PENDING",
                })
            );
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
            await cancelFriendRequest(requestId);
            removeSentRequest(requestId);
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
        setSentRequests((prev) => prev.filter((r) => r._id !== requestId));
    }, []);

    // Helper: Remove received request
    const removeReceivedRequest = useCallback((requestId: string) => {
        setReceivedRequests((prev) => prev.filter((r) => r._id !== requestId));
    }, []);

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
        unfriend,
        searchUsersQuery,
        checkStatus,
        loadMutualFriends,
    };

    return { state, actions };
};
