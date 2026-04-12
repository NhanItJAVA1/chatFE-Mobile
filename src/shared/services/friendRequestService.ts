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
    status: "PENDING" | "ACCEPTED" | "DECLINED";
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
    /**
     * Get user info để lấy senderInfo
     * Calls: GET /v1/users/{userId}
     */
    private async getUserInfo(userId: string): Promise<User> {
        try {
            const response = await api.get(`/users/${userId}`);
            // Extract data từ response wrapper
            return response.data || response;
        } catch (error) {
            console.error(`[friendRequestService] Error fetching user ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Transform single friend request item
     * API trả về: { id, senderId, status: "pending", createdAt }
     * Expected: { _id, senderId, senderInfo, status: "PENDING", createdAt }
     */
    private async transformRequestItem(item: any): Promise<FriendRequestTransformed> {
        try {
            // Fetch sender user info
            const sender = await this.getUserInfo(item.senderId);

            return {
                _id: item.id || item._id,  // Transform: id → _id hoặc keep _id
                senderId: item.senderId,
                senderInfo: {
                    displayName: sender.displayName || "Unknown User",
                    phoneNumber: sender.phone || sender.phoneNumber || "",
                    avatar: sender.avatar || "",
                    status: (sender.status || "offline") as "online" | "offline",
                },
                status: (item.status?.toUpperCase() || "PENDING") as "PENDING" | "ACCEPTED" | "DECLINED",
                createdAt: item.createdAt,
            };
        } catch (error) {
            console.error(
                `[friendRequestService] Error transforming request for ${item.senderId}:`,
                error
            );

            // Fallback nếu fetch user info fail
            return {
                _id: item.id || item._id,
                senderId: item.senderId,
                senderInfo: {
                    displayName: "Unknown User",
                    phoneNumber: item.senderId,
                    avatar: "",
                    status: "offline",
                },
                status: (item.status?.toUpperCase() || "PENDING") as "PENDING" | "ACCEPTED" | "DECLINED",
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
            console.log("[friendRequestService] Getting received requests...");

            // Call API
            const response = await api.get("/friend-requests/received", {
                params: { page, limit },
            });

            console.log("[friendRequestService] Raw API response:", response);

            // Extract paginated data
            const resData = response.data || response;
            const items = resData.items || resData.data || [];
            const resPage = resData.page || page;
            const resLimit = resData.limit || limit;
            const total = resData.total || 0;
            const hasMore = resData.hasMore || false;

            console.log("[friendRequestService] Extracted items:", items.length);

            // Transform each item (includes fetching senderInfo)
            const transformedItems = await Promise.all(
                items.map((item: any) => this.transformRequestItem(item))
            );

            console.log("[friendRequestService] Transformed items:", transformedItems.length);

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
     * Fallback: If specific endpoint doesn't exist, reload all received requests
     */
    async getSingleReceivedRequest(requestId: string): Promise<FriendRequestTransformed> {
        try {
            // Try the specific endpoint first
            const response = await api.get(`/friend-requests/received/${requestId}`);
            const item = response.data || response;
            return await this.transformRequestItem(item);
        } catch (error: any) {
            // If single-request endpoint doesn't exist, reload all requests
            // This ensures we get the newly arrived request with all details
            console.warn(
                `[friendRequestService] Single request endpoint not available, reloading all requests for ${requestId}`
            );

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
    }

    /**
     * Chấp nhận lời mời kết bạn
     * Calls: PATCH /v1/friend-requests/{requestId} with status: accepted
     */
    async acceptFriendRequest(requestId: string): Promise<FriendRequest> {
        if (!requestId) {
            throw new Error("requestId is required");
        }

        try {
            console.log(`[friendRequestService] Accepting request ${requestId}...`);
            const response = await api.patch(`/friend-requests/${requestId}`, {
                status: "accepted",
            });
            console.log("[friendRequestService] Request accepted successfully");
            return response.data || response;
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

        try {
            console.log(`[friendRequestService] Declining request ${requestId}...`);
            const response = await api.patch(`/friend-requests/${requestId}`, {
                status: "rejected",
            });
            console.log("[friendRequestService] Request declined successfully");
            return response.data || response;
        } catch (error: any) {
            console.error("[friendRequestService] Decline error:", error);
            throw new Error(error.message || "Failed to decline friend request");
        }
    }
}

export const friendRequestService = new FriendRequestService();
