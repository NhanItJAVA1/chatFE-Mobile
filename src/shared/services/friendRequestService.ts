import { api } from "./api";
import type { FriendRequest, User } from "@/types";

export interface SenderInfo {
    displayName: string;
    phoneNumber?: string;
    avatar?: string;
    status: "online" | "offline";
}

export interface FriendRequestTransformed {
    _id: string;
    senderId: string;
    senderInfo: SenderInfo;
    status: "pending" | "accepted" | "rejected" | "canceled";
    createdAt: string;
}

export interface PaginationInfo {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
}

export interface ReceivedRequestsResponse {
    items: FriendRequestTransformed[];
    pagination: PaginationInfo;
}

/**
 * Service để xử lý friend requests với transform API response
 */
class FriendRequestService {
    private normalizeRequestStatus(
        status?: string
    ): "pending" | "accepted" | "rejected" | "canceled" {
        const normalized = (status || "pending").toLowerCase();
        if (normalized === "accepted") return "accepted";
        if (normalized === "rejected") return "rejected";
        if (normalized === "canceled") return "canceled";
        return "pending";
    }

    /**
     * Get user info để lấy senderInfo
     * Calls: GET /v1/users/{userId}/public
     */
    private async getUserInfo(userId: string): Promise<User> {
        if (!userId || userId === "undefined" || userId === "null") {
            return { id: "", email: "", displayName: "Unknown User", avatar: "" };
        }

        try {
            const response = await api.get(`/users/${userId}/public`);
            // Extract data từ response wrapper
            return response.data?.data || response.data || response;
        } catch (error) {
            console.error(`[friendRequestService] Error fetching user ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Transform single friend request item
     * API trả về: { id, fromUserId, status: "pending", createdAt }
     * Expected: { _id, senderId, senderInfo, status: "PENDING", createdAt }
     */
    private async transformRequestItem(item: any): Promise<FriendRequestTransformed> {
        const senderId = item.senderId || item.fromUserId || item.requesterId || "";

        try {
            // Fetch sender user info
            const sender = await this.getUserInfo(senderId);

            return {
                _id: item.id || item._id,  // Transform: id → _id hoặc keep _id
                senderId,
                senderInfo: {
                    displayName: sender.displayName || "Unknown User",
                    phoneNumber: sender.phone || sender.phoneNumber || "",
                    avatar: sender.avatar || sender.avatarUrl || "",
                    status: (sender.status || "offline") as "online" | "offline",
                },
                status: this.normalizeRequestStatus(item.status),
                createdAt: item.createdAt,
            };
        } catch (error) {
            console.error(
                `[friendRequestService] Error transforming request for ${senderId}:`,
                error
            );

            // Fallback nếu fetch user info fail
            return {
                _id: item.id || item._id,
                senderId,
                senderInfo: {
                    displayName: "Unknown User",
                    phoneNumber: senderId,
                    avatar: "",
                    status: "offline",
                },
                status: this.normalizeRequestStatus(item.status),
                createdAt: item.createdAt,
            };
        }
    }

    /**
     * Lấy danh sách lời mời nhận được
     * Transforms API response to match expected format
     * API returns: { data: { items: [...], limit, page, total, hasMore } }
     */
    async getReceivedRequests(page: number = 1, limit: number = 20): Promise<ReceivedRequestsResponse> {
        try {
            // Call API
            const response = await api.get("/friend-requests/received", {
                params: { page, limit },
            });

            // Extract paginated data
            const resData = response.data || response;
            const items = resData.items || resData.data || [];
            const resPage = resData.page || page;
            const resLimit = resData.limit || limit;
            const total = resData.total || 0;
            const hasMore = resData.hasMore || false;

            // Transform each item (includes fetching senderInfo)
            const transformedItems = await Promise.all(
                items.map((item: any) => this.transformRequestItem(item))
            );

            return {
                items: transformedItems,
                pagination: {
                    page: resPage,
                    limit: resLimit,
                    total,
                    hasMore,
                },
            };
        } catch (error: any) {
            console.error("[friendRequestService] Get received requests error:", error);
            throw new Error(error.message || "Failed to load received requests");
        }
    }

    /**
     * Get a single received request by ID with full sender info
     */
    async getSingleReceivedRequest(requestId: string): Promise<FriendRequestTransformed> {
        try {
            const result = await this.getReceivedRequests(1, 50);
            const foundRequest = result.items.find((req) => req._id === requestId);

            if (foundRequest) {
                return foundRequest;
            }

            throw new Error(`Request ${requestId} not found in received requests`);
        } catch (reloadError: any) {
            throw new Error(
                reloadError.message || "Failed to load request details"
            );
        }
    }

    /**
     * Chấp nhận lời mời kết bạn
     * Calls: PATCH /v1/friend-requests/{requestId} with status: accepted
     */
    async acceptFriendRequest(requestId: string): Promise<FriendRequest> {
        if (!requestId) {
            throw new Error("requestId is required");
        }

        try {            const response = await api.patch(`/friend-requests/${requestId}`, {
                status: "accepted",
            });            return response.data || response;
        } catch (error: any) {
            console.error("[friendRequestService] Accept error:", error);
            throw new Error(error.message || "Failed to accept friend request");
        }
    }

    /**
     * Từ chối lời mời kết bạn
     * Calls: PATCH /v1/friend-requests/{requestId} with status: rejected
     */
    async declineFriendRequest(requestId: string): Promise<FriendRequest> {
        if (!requestId) {
            throw new Error("requestId is required");
        }

        try {            const response = await api.patch(`/friend-requests/${requestId}`, {
                status: "rejected",
            });            return response.data || response;
        } catch (error: any) {
            console.error("[friendRequestService] Decline error:", error);
            throw new Error(error.message || "Failed to decline friend request");
        }
    }
}

export const friendRequestService = new FriendRequestService();
