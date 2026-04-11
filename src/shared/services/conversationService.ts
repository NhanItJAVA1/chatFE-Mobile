import { api } from "./api";
import type { MessagePayload } from "./socketService";

export interface Conversation {
    _id: string;
    id?: string;
    type: "PRIVATE" | "GROUP";
    name?: string;
    members: string[];
    ownerId?: string;
    adminIds?: string[];
    lastMessage?: MessagePayload;
    unreadCount?: number;
    createdAt: string;
    updatedAt: string;
}

export interface MessageResponse {
    _id: string;
    conversationId: string;
    senderId: string;
    senderName: string;
    senderAvatar: string;
    text: string;
    media?: any[];
    reactions?: any[];
    replyTo?: any;
    status: "sent" | "delivered" | "seen";
    createdAt: string;
    updatedAt: string;
    type?: "TEXT" | "MEDIA" | "FILE" | "SYSTEM";
}

export interface MessagePage {
    items: MessageResponse[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
}

interface PaginationResponse {
    data: MessagePage;
}

/**
 * Conversation Service - Manages conversation and message API calls
 */
export class ConversationService {
    /**
     * Get or create private conversation with another user
     */
    static async getOrCreatePrivateConversation(
        targetUserId: string
    ): Promise<Conversation> {
        try {
            const response = await api.post("/conversations/private", {
                targetUserId,
            });

            const data = response.data || response;

            return data.data || data;
        } catch (error: any) {
            throw new Error(error.message || "Failed to get/create conversation");
        }
    }

    /**
     * Get conversation details
     */
    static async getConversationDetail(conversationId: string): Promise<Conversation> {
        try {
            const response = await api.get(`/conversations/${conversationId}`);

            const data = response.data || response;
            return data.data || data;
        } catch (error: any) {
            throw error;
        }
    }

    /**
     * Get conversation list (paginated)
     */
    static async getConversations(
        page: number = 1,
        limit: number = 20
    ): Promise<Conversation[]> {
        try {
            const response = await api.get("/conversations", {
                params: { page, limit },
            });

            const data = response.data || response;
            const items = data.data?.items || data.items || data.data || [];

            return Array.isArray(items) ? items : [];
        } catch (error: any) {
            throw error;
        }
    }

    /**
     * Load messages from conversation (paginated)
     * @param conversationId - ID of conversation
     * @param page - Page number (1-based)
     * @param limit - Messages per page
     */
    static async loadMessages(
        conversationId: string,
        page: number = 1,
        limit: number = 30
    ): Promise<MessagePage> {
        try {
            const response = await api.get(
                `/conversations/${conversationId}/messages`,
                {
                    params: { page, limit },
                }
            );

            const data = response.data || response;

            // Handle different response formats
            if (data?.data) {
                return data.data;
            }

            // If response is already wrapped in items
            if (data?.items) {
                return {
                    items: data.items,
                    total: data.total || data.items.length,
                    page: data.page || page,
                    limit: data.limit || limit,
                    hasMore: data.hasMore || false,
                };
            }

            // If response is an array
            if (Array.isArray(data)) {
                return {
                    items: data,
                    total: data.length,
                    page,
                    limit,
                    hasMore: false,
                };
            }

            return {
                items: [],
                total: 0,
                page,
                limit,
                hasMore: false,
            };
        } catch (error: any) {
            // Return empty page instead of throwing
            return {
                items: [],
                total: 0,
                page,
                limit,
                hasMore: false,
            };
        }
    }

    /**
     * Search messages in conversation
     */
    static async searchMessages(
        conversationId: string,
        query: string,
        page: number = 1
    ): Promise<MessagePage> {
        try {
            const response = await api.get(
                `/conversations/${conversationId}/messages/search`,
                {
                    params: { q: query, page },
                }
            );

            const data = response.data || response;

            if (data?.data) {
                return data.data;
            }

            return {
                items: [],
                total: 0,
                page,
                limit: 20,
                hasMore: false,
            };
        } catch (error: any) {
            return {
                items: [],
                total: 0,
                page,
                limit: 20,
                hasMore: false,
            };
        }
    }

    /**
     * Get unread message count
     */
    static async getUnreadCount(): Promise<number> {
        try {
            const response = await api.get("/conversations/unread/count");
            const data = response.data || response;
            return data.data?.count || data.count || 0;
        } catch (error: any) {
            return 0;
        }
    }

    /**
     * Mark conversation as read
     */
    static async markConversationAsRead(conversationId: string): Promise<void> {
        try {
            await api.post(`/conversations/${conversationId}/mark-read`);
        } catch (error: any) {
            // Silently fail
        }
    }

    /**
     * Update conversation (name, description, etc.)
     */
    static async updateConversation(
        conversationId: string,
        updates: any
    ): Promise<Conversation> {
        try {
            const response = await api.patch(`/conversations/${conversationId}`, updates);
            const data = response.data || response;
            return data.data || data;
        } catch (error: any) {
            throw error;
        }
    }

    /**
     * Add members to group conversation
     */
    static async addMembers(conversationId: string, memberIds: string[]): Promise<any> {
        try {
            const response = await api.post(
                `/conversations/${conversationId}/members`,
                { memberIds }
            );
            return response.data || response;
        } catch (error: any) {
            throw error;
        }
    }

    /**
     * Remove member from conversation
     */
    static async removeMember(
        conversationId: string,
        memberId: string
    ): Promise<any> {
        try {
            const response = await api.delete(
                `/conversations/${conversationId}/members/${memberId}`
            );
            return response.data || response;
        } catch (error: any) {
            throw error;
        }
    }

    /**
     * Delete conversation
     */
    static async deleteConversation(conversationId: string): Promise<void> {
        try {
            await api.delete(`/conversations/${conversationId}`);
        } catch (error: any) {
            console.error("[ConversationService] Error deleting conversation:", error);
            throw error;
        }
    }

    /**
     * Mute/unmute conversation
     */
    static async muteConversation(
        conversationId: string,
        mute: boolean
    ): Promise<any> {
        try {
            const response = await api.post(
                `/conversations/${conversationId}/mute`,
                { mute }
            );
            return response.data || response;
        } catch (error: any) {

            throw error;
        }
    }
}

export default ConversationService;
