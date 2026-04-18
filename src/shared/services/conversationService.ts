import { api } from "./api";
import type { MessagePayload } from "./socketService";

export interface ConversationLastMessageSummary {
    messageId: string;
    senderId: string;
    type: string;
    textPreview?: string;
    createdAt: string;
}

export interface Conversation {
    _id: string;
    id?: string;
    type: "PRIVATE" | "GROUP";
    name?: string;
    members?: string[];
    pairKey?: string;
    avatarUrl?: string;
    ownerId?: string;
    adminIds?: string[];
    lastMessage?: MessagePayload | ConversationLastMessageSummary;
    lastMessageAt?: string;
    lastMessageStatus?: "sent" | "delivered" | "read";
    lastMessageTimeFormatted?: string;
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
    id?: string;
    type?: "text" | "image" | "file" | "link" | "system";
    links?: string[];
}

export interface MessagePage {
    items: MessageResponse[];
    nextCursor: string | null;
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
     * Get conversation details (private chat)
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
     * Get group conversation details
     * @param groupId - ID of group
     */
    static async getGroupDetail(groupId: string): Promise<Conversation> {
        try {
            const response = await api.get(`/groups/${groupId}/info`);

            // Log comprehensive response structure
            console.log('[ConversationService] getGroupDetail response:', {
                type: typeof response,
                isObject: typeof response === 'object',
                keys: Array.isArray(response) ? 'array' : Object.keys(response || {}),
                hasData: 'data' in response,
                dataType: response?.data ? typeof response.data : 'missing',
                dataKeys: response?.data ? Object.keys(response.data) : 'N/A',
                fullResponse: JSON.stringify(response).substring(0, 2000),
            });

            // If response.data doesn't exist, check if entire response IS the data
            if (!response?.data && response?.conversation) {
                return response.conversation;
            }

            if (response?.data?.conversation) {
                return response.data.conversation;
            }

            console.error('[ConversationService] Conversation not found. Response:', response);
            throw new Error('Conversation not found in group detail response');
        } catch (error: any) {
            console.error('[ConversationService] getGroupDetail error:', error);
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
            const items = Array.isArray(data)
                ? data
                : data.data?.items || data.items || data.data || [];

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
        cursor: string | null = null,
        limit: number = 30
    ): Promise<MessagePage> {
        try {
            console.log('[ConversationService] loadMessages called:', {
                conversationId,
                cursor,
                limit,
            });

            const response = await api.get(
                `/conversations/${conversationId}/messages`,
                {
                    params: {
                        ...(cursor ? { cursor } : {}),
                        limit,
                    },
                }
            );

            console.log('[ConversationService] loadMessages response:', {
                status: response.status,
                hasData: !!response.data,
                dataKeys: Object.keys(response.data || {}),
                dataDataKeys: Object.keys(response.data?.data || {}),
            });

            const data = response.data || response;

            // Current backend shape: { data: { messages, nextCursor, hasMore } }
            const payload = data?.data || data;
            const messages = payload?.messages || payload?.items || [];

            console.log('[ConversationService] Messages parsed:', {
                count: messages.length,
                messagePreview: messages.slice(0, 2).map((m: any) => ({
                    id: m._id || m.id,
                    text: m.text?.substring(0, 30),
                    senderId: m.senderId,
                })),
            });

            if (Array.isArray(messages)) {
                return {
                    items: messages,
                    nextCursor: payload?.nextCursor ?? null,
                    limit: payload?.limit || limit,
                    hasMore: !!payload?.hasMore,
                };
            }

            console.warn('[ConversationService] Messages is not array:', typeof messages);
            return {
                items: [],
                nextCursor: null,
                limit,
                hasMore: false,
            };
        } catch (error: any) {
            // Log the error instead of silently failing
            console.error('[ConversationService] loadMessages ERROR:', {
                message: error.message,
                response: error.response?.status,
                data: error.response?.data,
            });

            // Return empty page instead of throwing
            return {
                items: [],
                nextCursor: null,
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
            const response = await api.get("/conversations/unread-count");
            const data = response.data || response;
            return data.data?.totalUnread || data.totalUnread || data.data?.count || data.count || 0;
        } catch (error: any) {
            try {
                const fallbackResponse = await api.get("/conversations/unread/count");
                const fallbackData = fallbackResponse.data || fallbackResponse;
                return fallbackData.data?.count || fallbackData.count || 0;
            } catch {
                return 0;
            }
        }
    }

    /**
     * Mark conversation as read
     */
    static async markConversationAsRead(
        conversationId: string,
        lastSeenMessageId?: string
    ): Promise<void> {
        try {
            await api.post(`/conversations/${conversationId}/seen`, {
                ...(lastSeenMessageId && { lastSeenMessageId }),
            });
        } catch (error: any) {
            try {
                await api.post(`/conversations/${conversationId}/mark-read`);
            } catch {
                // Silently fail
            }
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
