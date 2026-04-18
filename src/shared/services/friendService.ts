import { api } from "./api";
import type { FriendRequest, Friend, FriendshipStatus, User } from "@/types";

/**
 * Tìm kiếm người dùng theo số điện thoại hoặc tên
 */
export const searchUsers = async (query: string): Promise<User[]> => {
    try {
        const response = await api.get("/users/search", { params: { phone: query } });

        // Extract data from response
        let data = response.data || response;

        // Case 1: data is already an array
        if (Array.isArray(data)) {
            return data;
        }

        // Case 2: data is an object with users/items/list keys
        if (data && typeof data === "object") {
            const arrayField = data.users || data.items || data.list;
            if (Array.isArray(arrayField)) {
                return arrayField;
            }

            // Case 3: data is a single user object (has displayName, phone, etc.)
            // Check if it looks like a user object
            if (data.displayName || data.phone || data._id || data.id) {
                return [data];
            }
        }

        // Case 4: fallback to empty array
        return [];
    } catch (error: any) {
        console.error("[friendService] Search error:", error);
        throw new Error(error.message || "Failed to search users");
    }
};

/**
 * Tìm kiếm người dùng theo số điện thoại (deprecated - use searchUsers)
 */
export const searchUserByPhone = async (phone: string): Promise<any> => {
    try {
        console.log("[friendService] Searching user by phone:", phone);
        const response = await api.get("/users/search", { params: { phone: phone } });

        // Extract data from response
        let data = response.data || response;

        // Case 1: data is already an array
        if (Array.isArray(data)) {
            return data;
        }

        // Case 2: data is an object with users/items/list keys
        if (data && typeof data === "object") {
            const arrayField = data.users || data.items || data.list;
            if (Array.isArray(arrayField)) {
                return arrayField;
            }

            // Case 3: data is a single user object (has displayName, phone, etc.)
            if (data.displayName || data.phone || data._id || data.id) {
                return [data];
            }
        }

        // Case 4: fallback to empty array
        return [];
    } catch (error: any) {
        console.error("[friendService] Search by phone error:", error);
        throw error;
    }
};

/**
 * Gửi lời mời kết bạn
 * @param recipientId - ID của người nhận lời mời (người được tìm kiếm)
 * @returns FriendRequest - Lời mời kết bạn đã được tạo
 * 
 * Note: ID người gửi sẽ được lấy từ token bởi backend
 */
export const sendFriendRequest = async (recipientId: string): Promise<FriendRequest> => {
    try {
        const response = await api.post(`/friend-requests/${recipientId}`, {});

        // Extract data from response
        let data = response.data || response;

        // Ensure we have a FriendRequest object
        if (data && typeof data === "object") {
            return data as FriendRequest;
        }

        return { _id: recipientId } as FriendRequest;
    } catch (error: any) {
        console.error("[friendService] Send request error:", error);
        if (error.message?.includes("409")) {
            throw new Error("Đã là bạn bè hoặc lời mời đã được gửi");
        }
        throw new Error(error.message || "Failed to send friend request");
    }
};

/**
 * Xem lời mời kết bạn đã nhận
 */
export const getReceivedFriendRequests = async (): Promise<FriendRequest[]> => {
    try {
        const response = await api.get("/friend-requests/received");

        // Log full response structure
        console.log("[API] GET /friend-requests/received response:", {
            status: response.status,
            data: response.data,
            rawResponse: response
        });

        // Extract data from response
        let data = response.data || response;

        // Case 1: data is already an array
        if (Array.isArray(data)) {
            return data;
        }

        // Case 2: data is paginated response with items field
        if (data && typeof data === "object") {
            if (Array.isArray(data.items)) {
                return data.items;
            }

            // Case 3: data is an object with other array fields
            const arrayField = data.requests || data.list || data.data;
            if (Array.isArray(arrayField)) {
                return arrayField;
            }
        }

        // Fallback to empty array
        return [];
    } catch (error: any) {
        console.error("[friendService] Load received requests error:", error);
        throw new Error(error.message || "Failed to load received requests");
    }
};

/**
 * Alias for getReceivedFriendRequests
 */
export const getReceivedRequests = getReceivedFriendRequests;

/**
 * Xem lời mời kết bạn đã gửi
 */
export const getSentFriendRequests = async (): Promise<FriendRequest[]> => {
    try {
        const response = await api.get("/friend-requests/sent");

        // Extract data from response
        let data = response.data || response;

        // Case 1: data is already an array
        if (Array.isArray(data)) {
            return data;
        }

        // Case 2: data is paginated response with items field
        if (data && typeof data === "object") {
            if (Array.isArray(data.items)) {
                return data.items;
            }

            // Case 3: data is an object with other array fields
            const arrayField = data.requests || data.list || data.data;
            if (Array.isArray(arrayField)) {
                return arrayField;
            }
        }

        // Fallback to empty array
        return [];
    } catch (error: any) {
        console.error("[friendService] Load sent requests error:", error);
        throw new Error(error.message || "Failed to load sent requests");
    }
};

/**
 * Alias for getSentFriendRequests
 */
export const getSentRequests = getSentFriendRequests;

/**
 * Chấp nhận lời mời kết bạn
 */
export const acceptFriendRequest = async (requestId: string): Promise<FriendRequest> => {
    try {
        const response = await api.patch(`/friend-requests/${requestId}`, {
            status: "accepted",
        });

        // Extract data from response
        let data = response.data || response;

        // Ensure we have a FriendRequest object
        if (data && typeof data === "object") {
            return data as FriendRequest;
        }

        return { _id: requestId } as FriendRequest;
    } catch (error: any) {
        console.error("[friendService] Accept request error:", error);
        throw new Error(error.message || "Failed to accept friend request");
    }
};

/**
 * Từ chối lời mời kết bạn
 */
export const rejectFriendRequest = async (requestId: string): Promise<FriendRequest> => {
    try {
        const response = await api.patch(`/friend-requests/${requestId}`, {
            status: "rejected",
        });

        // Extract data from response
        let data = response.data || response;

        // Ensure we have a FriendRequest object
        if (data && typeof data === "object") {
            return data as FriendRequest;
        }

        return { _id: requestId } as FriendRequest;
    } catch (error: any) {
        console.error("[friendService] Reject request error:", error);
        throw new Error(error.message || "Failed to reject friend request");
    }
};

/**
 * Alias for rejectFriendRequest
 */
export const declineFriendRequest = rejectFriendRequest;

/**
 * Hủy lời mời đã gửi
 */
export const cancelFriendRequest = async (requestId: string): Promise<boolean> => {
    try {
        const response = await api.patch(`/friend-requests/${requestId}`, {
            status: "canceled",
        });
        console.log('[friendService] cancelFriendRequest response:', response);

        // Handle null/undefined response (204 No Content)
        if (!response) {
            console.log('[friendService] Delete returned null/undefined - treating as success');
            return true;
        }

        // Extract data from response
        let data = response.data;

        // If response.data is undefined, use response itself
        if (data === undefined) {
            data = response;
        }

        console.log('[friendService] Extracted data:', data);

        // Handle null response
        if (data === null) {
            console.log('[friendService] Data is null - treating as success');
            return true;
        }

        // Check if it's a success response
        if (typeof data === "boolean") {
            return data;
        }

        // If it's an object with status, check the status
        if (data && typeof data === "object") {
            const isSuccess = !!(data.success || data.status === "success" || data !== false);
            console.log('[friendService] Response is object, isSuccess:', isSuccess);
            return isSuccess;
        }

        console.log('[friendService] Default return - data !== false:', data !== false);
        return data !== false;
    } catch (error: any) {
        console.error("[friendService] Cancel request error:", error);
        throw new Error(error.message || "Failed to cancel friend request");
    }
};

/**
 * Get user info by ID
 * Calls: GET /users/{userId}
 */
const getUserInfo = async (userId: string): Promise<User> => {
    try {
        const response = await api.get(`/users/${userId}`);
        return response.data || response;
    } catch (error: any) {
        console.error(`[friendService] Error fetching user ${userId}:`, error);
        // Return minimal user object on error
        return { id: userId, email: "", displayName: "Unknown User", avatar: "" };
    }
};

/**
 * Transform raw friendship into enriched Friend object
 * API returns: { id, userA, userB, createdAt }
 * Expected: { _id, friendId, friendInfo, status, createdAt }
 */
const enrichFriendship = async (friendship: any, currentUserId: string): Promise<Friend | null> => {
    try {
        // Determine which user is the friend (not the current user)
        const friendId = friendship.userA === currentUserId ? friendship.userB : friendship.userA;

        console.log(
            `[friendService] Enriching friendship: current=${currentUserId}, friend=${friendId}`
        );

        // Fetch friend's user info
        const friendUser = await getUserInfo(friendId);

        return {
            _id: friendship.id || friendship._id,
            friendId: friendId,
            friendInfo: {
                displayName: friendUser.displayName || "Unknown User",
                phoneNumber: friendUser.phone || friendUser.phoneNumber || "",
                avatar: friendUser.avatar || friendUser.avatarUrl || "",
                status: (friendUser.status || "offline") as "online" | "offline",
            },
            status: "accepted",
            createdAt: friendship.createdAt,
        };
    } catch (error: any) {
        console.error("[friendService] Error enriching friendship:", error);
        return null;
    }
};

/**
 * Xem danh sách bạn bè
 * Transforms raw friendship data into enriched Friend objects with user profiles
 * @param currentUserId - Current user's ID (required to determine which ID is the friend)
 */
export const getFriendsWithEnrichment = async (currentUserId: string): Promise<Friend[]> => {
    try {
        console.log("[friendService] Loading friends for user:", currentUserId);
        const response = await api.get("/friendships");

        // Extract data from response
        let data = response.data || response;

        // Extract friendships array
        let friendships: any[] = [];
        if (Array.isArray(data)) {
            friendships = data;
        } else if (data?.data?.items && Array.isArray(data.data.items)) {
            friendships = data.data.items;
        } else if (data?.items && Array.isArray(data.items)) {
            friendships = data.items;
        } else if (data?.data && Array.isArray(data.data)) {
            friendships = data.data;
        }

        console.log("[friendService] Loaded friendships:", friendships.length);

        if (friendships.length === 0) {
            return [];
        }

        // Enrich each friendship with user profile data
        const enrichedFriends = await Promise.all(
            friendships.map((f) => enrichFriendship(f, currentUserId))
        );

        // Filter out null values (enrichment failures)
        return enrichedFriends.filter((f) => f !== null) as Friend[];
    } catch (error: any) {
        console.error("[friendService] Load friends error:", error);
        throw new Error(error.message || "Failed to load friends");
    }
};

/**
 * Xem danh sách bạn bè (fallback - returns raw data, should use getFriendsWithEnrichment)
 */
export const getFriends = async (): Promise<Friend[]> => {
    try {
        console.log("[friendService] Loading friends...");
        const response = await api.get("/friendships");

        let data = response.data || response;

        // Extract friendships array
        let friendships: any[] = [];
        if (Array.isArray(data)) {
            friendships = data;
        } else if (data?.data?.items && Array.isArray(data.data.items)) {
            friendships = data.data.items;
        } else if (data?.items && Array.isArray(data.items)) {
            friendships = data.items;
        }

        console.log("[friendService] Loaded raw friendships:", friendships);
        return friendships || [];
    } catch (error: any) {
        console.error("[friendService] Load friends error:", error);
        throw new Error(error.message || "Failed to load friends");
    }
};

/**
 * Kiểm tra trạng thái bạn bè
 */
export const checkFriendshipStatus = async (friendId: string): Promise<FriendshipStatus> => {
    try {
        const response = await api.get(`/friend-requests/check/${friendId}`);

        // Extract data from response
        let data = response.data || response;

        // If data is an object (not already status), ensure it has the right structure
        // FriendshipStatus should have: status, isFriend, isPending, isBlocked fields
        if (data && typeof data === "object") {
            return {
                ...data,
                status: String(data.status || "none").toLowerCase(),
            } as FriendshipStatus;
        }

        return { isFriend: false, status: "none" } as FriendshipStatus;
    } catch (error: any) {
        console.error("[friendService] Check status error:", error);
        throw new Error(error.message || "Failed to check friendship status");
    }
};

/**
 * Xem bạn chung
 */
export const getMutualFriends = async (userId: string): Promise<User[]> => {
    try {
        const response = await api.get(`/users/${userId}/mutual-friends`);

        // Extract data from response
        let data = response.data || response;

        // Case 1: data is already an array
        if (Array.isArray(data)) {
            return data;
        }

        // Case 2: data is an object with array fields
        if (data && typeof data === "object") {
            const arrayField = data.mutualFriends || data.friends || data.items || data.list;
            if (Array.isArray(arrayField)) {
                return arrayField;
            }
        }

        // Fallback to empty array
        return [];
    } catch (error: any) {
        console.error("[friendService] Load mutual friends error:", error);
        throw new Error(error.message || "Failed to load mutual friends");
    }
};

/**
 * Xem gợi ý kết bạn
 */
export const getFriendSuggestions = async (): Promise<User[]> => {
    try {
        console.log("[friendService] Loading friend suggestions...");
        const response = await api.get("/users/suggestions");
        console.log("[friendService] Friend suggestions:", response);

        // Extract data from response
        let data = response.data || response;

        // Case 1: data is already an array
        if (Array.isArray(data)) {
            return data;
        }

        // Case 2: data is an object with array fields
        if (data && typeof data === "object") {
            const arrayField = data.suggestions || data.users || data.items || data.list;
            if (Array.isArray(arrayField)) {
                return arrayField;
            }
        }

        // Fallback to empty array
        return [];
    } catch (error: any) {
        console.error("[friendService] Load suggestions error:", error);
        throw new Error(error.message || "Failed to load friend suggestions");
    }
};

/**
 * Hủy kết bạn (Unfriend)
 */
export const removeFriend = async (friendId: string): Promise<boolean> => {
    try {
        console.log("[friendService] Unfriending user:", friendId);
        const response = await api.delete(`/friendships/${friendId}`);
        console.log("[friendService] Unfriend successful:", response);

        // Handle null response
        if (!response) {
            return true; // Treat null as success (some APIs return 204 No Content)
        }

        // Extract data from response
        let data = response.data !== undefined ? response.data : response;

        // Check if it's a success response
        if (typeof data === "boolean") {
            return data;
        }

        // If it's an object with status, check the status
        if (data && typeof data === "object") {
            return !!(data.success || data.status === "success" || data !== false);
        }

        return data !== false;
    } catch (error: any) {
        console.error("[friendService] Unfriend error:", error);
        throw new Error(error?.message || "Failed to unfriend user");
    }
};

/**
 * Alias for removeFriend
 */
export const unfriend = removeFriend;

