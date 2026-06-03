import { io, Socket } from "socket.io-client";
import { getApiBaseUrl } from "../runtime";
import { apiCall, tokenManager } from "./api";
import type { Poll, PollSocketEvent } from "@/types";

// Remove /v1 suffix from API URL to get base socket URL
const SOCKET_URL = getApiBaseUrl().replace("/v1", "");
const SOCKET_NAMESPACE = "/messages";

export interface QuotedMessage {
    _id?: string;
    id?: string;
    text?: string;
    senderId: string;
    senderName?: string;
    type?: string;
    media?: any[];
}

export interface MessagePayload {
    _id?: string;
    id?: string;
    conversationId: string;
    senderId: string;
    senderName: string;
    senderAvatar: string;
    text: string;
    media?: any[];
    reactions?: any[];
    replyTo?: any;
    status: "sending" | "sent" | "delivered" | "seen" | "failed";
    createdAt: string;
    updatedAt: string;
    type?: "text" | "image" | "file" | "link" | "system" | "poll" | "profile_card";
    messageType?: string;
    profileCardUserId?: string;
    profileCard?: {
        id: string;
        displayName?: string;
        name?: string;
        avatar?: string;
        avatarUrl?: string;
        phone?: string;
        phoneNumber?: string;
        relationship?: string;
        [key: string]: any;
    };
    pollId?: string;
    poll?: Poll;
    links?: string[];
    deletedForUserIds?: string[];
    deletedBy?: string;
    deletedAt?: string;
    isForwarded?: boolean;
    forwarded?: boolean;
    forwardedFrom?: any;
    forwardedFromMessageId?: string;
    originalMessageId?: string;
    sourceMessageId?: string;

    // Reply/Quote fields
    quotedMessageId?: string;
    quotedMessage?: QuotedMessage;
    quotedMessagePreview?: string;
    quotedMessageSenderId?: string; // NEW - ID of user who sent original message
    quotedMessageSenderName?: string; // NEW - Cache-resolved sender name

    // Pin fields
    pinned?: boolean;
    pinnedAt?: Date;
    pinnedBy?: string;
    pinnedByName?: string;

    // Client-only optimistic messaging fields
    clientMessageId?: string;
    optimistic?: boolean;
    sendError?: string;
}

export interface TypingData {
    userId: string;
    conversationId: string;
    toUserId?: string;
    groupId?: string;
    isTyping: boolean;
}

export interface SeenData {
    conversationId: string;
    userId: string;
    lastSeenMessageId: string;
}

// ============================================================================
// GROUP CHAT EVENT TYPES
// ============================================================================

export interface GroupEventData {
    conversationId: string;
    [key: string]: any;
}

export interface GroupMemberEvent extends GroupEventData {
    userId: string;
    member?: any;
    newMembers?: any[];
    removedUserId?: string;
}

export interface GroupAdminEvent extends GroupEventData {
    targetUserId: string;
    isAdmin: boolean;
}

export interface GroupOwnerTransferEvent extends GroupEventData {
    oldOwnerId: string;
    newOwnerId: string;
}

/**
 * Socket Service - Manages Socket.IO real-time communication
 */
export class SocketService {
    private static socket: Socket | null = null;
    private static typingTimeout: ReturnType<typeof setTimeout> | null = null;
    private static currentToken: string | null = null;
    private static isRefreshingSocketToken = false;
    private static joinedConversationIds = new Set<string>();
    private static registeredListeners = new Map<string, Set<(...args: any[]) => void>>();

    private static addRegisteredListener(eventName: string, handler: (...args: any[]) => void): void {
        if (!this.socket) return;

        this.socket.on(eventName, handler);

        const handlers = this.registeredListeners.get(eventName) || new Set();
        handlers.add(handler);
        this.registeredListeners.set(eventName, handlers);
    }

    private static offRegisteredListeners(eventName: string): void {
        if (!this.socket) return;

        const handlers = this.registeredListeners.get(eventName);
        if (!handlers) return;

        handlers.forEach((handler) => {
            this.socket?.off(eventName, handler);
        });
        this.registeredListeners.delete(eventName);
    }

    private static isAuthError(error: any): boolean {
        const message = String(error?.message || error || "").toLowerCase();
        return message.includes("authentication") || message.includes("invalid token") || message.includes("jwt") || message.includes("unauthorized");
    }

    private static createSocket(token: string): Socket {
        this.currentToken = token;

        if (this.socket) {
            this.registeredListeners.clear();
            this.socket.removeAllListeners();
            this.socket.disconnect();
        }

        const socket = io(SOCKET_URL + SOCKET_NAMESPACE, {
            extraHeaders: {
                Authorization: `Bearer ${token}`,
            },
            auth: {
                token,
            },
            transports: ["websocket"],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
        });

        this.socket = socket;

        socket.on("connect", () => {            this.rejoinKnownConversations();
        });

        socket.on("disconnect", (reason: string) => {
            console.warn("[SocketService] Socket disconnected:", reason);
        });

        socket.on("connect_error", (error: any) => {
            console.error("[SocketService] Socket connection error:", error?.message || error);
            if (this.isAuthError(error)) {
                this.refreshTokenAndReconnect().catch((refreshError) => {
                    console.error("[SocketService] Socket token refresh failed:", refreshError?.message || refreshError);
                });
            }
        });

        const originalOn = socket.on;
        socket.on = function (eventName: string, callback: any) {
            const wrappedCallback = (...args: any[]) => {
                if (eventName !== "receiveMessage" && eventName !== "messageSeen" && !eventName.includes("reconnect")) {                }
                callback(...args);
            };
            return originalOn.call(this, eventName, wrappedCallback);
        } as any;

        return socket;
    }

    private static async refreshTokenAndReconnect(): Promise<void> {
        if (this.isRefreshingSocketToken) {
            return;
        }

        this.isRefreshingSocketToken = true;

        try {
            const storedToken = await tokenManager.getAccessToken();
            let nextToken = storedToken && storedToken !== this.currentToken ? storedToken : null;

            if (!nextToken) {
                const refreshed = await tokenManager.refreshAccessToken();
                if (!refreshed) {
                    throw new Error("Unable to refresh socket token");
                }
                nextToken = await tokenManager.getAccessToken();
            }

            if (!nextToken) {
                throw new Error("No refreshed socket token available");
            }            this.currentToken = nextToken;
            if (this.socket) {
                this.socket.auth = { token: nextToken };
                (this.socket.io.opts as any).extraHeaders = {
                    ...((this.socket.io.opts as any).extraHeaders || {}),
                    Authorization: `Bearer ${nextToken}`,
                };
                this.socket.disconnect();
                this.socket.connect();
            } else {
                this.createSocket(nextToken);
            }
        } finally {
            this.isRefreshingSocketToken = false;
        }
    }

    private static rejoinKnownConversations(): void {
        if (!this.socket?.connected || this.joinedConversationIds.size === 0) {
            return;
        }

        this.joinedConversationIds.forEach((conversationId) => {
            this.socket?.emit("joinGroup", { conversationId }, (response: any) => {
                if (response?.success) {                } else {
                    console.warn("[SocketService] Failed to rejoin conversation:", conversationId, response?.error);
                }
            });
        });
    }

    /**
     * Connect to Socket.IO server
     */
    static connect(token: string): Socket {
        if (this.socket?.connected) {            return this.socket;
        }

        return this.createSocket(token);
    }

    /**
     * Disconnect socket
     */
    static disconnect(): void {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.currentToken = null;
            this.registeredListeners.clear();
            if (this.typingTimeout) {
                clearTimeout(this.typingTimeout);
            }
        }
    }

    /**
     * Get socket instance
     */
    static getSocket(): Socket | null {
        return this.socket;
    }

    /**
     * Check if connected
     */
    static isConnected(): boolean {
        return !!this.socket?.connected;
    }

    /**
     * Wait for socket to be connected (with timeout)
     */
    static async waitForConnection(timeoutMs: number = 5000): Promise<void> {
        if (this.socket?.connected) {
            return;
        }

        return new Promise((resolve, reject) => {
            const startingSocket = this.socket;
            if (!startingSocket) {
                reject(new Error("Socket not initialized"));
                return;
            }

            let settled = false;
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error("Socket connection timeout"));
            }, Math.max(timeoutMs, 10000));

            const cleanup = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                startingSocket.off("connect", onConnect);
                startingSocket.off("connect_error", onError);
                clearInterval(pollInterval);
            };

            const onConnect = () => {
                cleanup();                resolve();
            };

            const onError = (error: any) => {
                if (this.isAuthError(error)) {
                    return;
                }
                cleanup();
                reject(new Error(`Socket connection error: ${error?.message || error}`));
            };

            const pollInterval = setInterval(() => {
                if (this.socket?.connected) {
                    cleanup();
                    resolve();
                }
            }, 100);

            startingSocket.once("connect", onConnect);
            startingSocket.on("connect_error", onError);
        });
    }

    /**
     * Join conversation room
     */
    static async joinConversation(conversationId: string): Promise<any> {
        try {
            // Wait for socket to be connected before joining
            if (!this.socket?.connected) {                await this.waitForConnection(5000);
            }

            return new Promise((resolve, reject) => {
                if (!this.socket) {
                    reject(new Error("Socket not connected"));
                    return;
                }                this.socket.emit("joinGroup", { conversationId }, (response: any) => {
                    if (response?.success) {                        this.joinedConversationIds.add(conversationId);
                        resolve(response);
                    } else {
                        console.error('[SocketService] Failed to join conversation:', response?.error);
                        reject(new Error(response?.error || "Failed to join"));
                    }
                });
            });
        } catch (error: any) {
            console.error('[SocketService] joinConversation error:', error);
            throw error;
        }
    }

    /**
     * Leave conversation room
     */
    static leaveConversation(conversationId: string): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this.socket) {
                reject(new Error("Socket not connected"));
                return;
            }

            this.socket.emit("leaveGroup", { conversationId }, (response: any) => {
            if (response?.success) {
                this.joinedConversationIds.delete(conversationId);
                resolve(response);
                } else {
                    reject(new Error(response?.error || "Failed to leave"));
                }
            });
        });
    }

    /**
     * Send message via Socket.IO
     */
    static sendMessage(
        conversationId: string,
        text: string,
        media?: any[]
    ): Promise<MessagePayload[]> {
        return new Promise(async (resolve, reject) => {
            try {
                if (!this.socket) {
                    throw new Error("Socket not connected");
                }

                // Wait for connection if not connected
                if (!this.socket.connected) {                    await this.waitForConnection(5000);
                }

                const payload = {
                    conversationId,
                    text,
                    media: media || [],
                };
                this.socket.emit("sendMessage", payload, (response: any) => {                    if (response?.success) {
                        const messages = response?.messages || response?.data || response?.message;
                        if (Array.isArray(messages)) {                            resolve(messages);
                            return;
                        }
                        if (messages) {                            resolve([messages]);
                            return;
                        }                        resolve([]);
                    } else {
                        console.error('[SocketService] Send message failed:', response?.error);
                        reject(new Error(response?.error || "Failed to send message"));
                    }
                });
            } catch (error: any) {
                console.error('[SocketService] sendMessage error:', error);
                reject(error);
            }
        });
    }

    /**
     * Send quoted message (reply) via Socket.IO
     * Emits "quoteMessage" event which backend converts to receiveMessage
     * BE handles quotedMessageSenderId and quotedMessagePreview lookup
     */
    static sendQuotedMessage(
        conversationId: string,
        quotedMessageId: string,
        text: string,
        media?: any[]
    ): Promise<MessagePayload[]> {
        return new Promise(async (resolve, reject) => {
            try {
                if (!this.socket) {
                    throw new Error("Socket not connected");
                }

                // Wait for connection if not connected
                if (!this.socket.connected) {                    await this.waitForConnection(5000);
                }

                const payload = {
                    conversationId,
                    quotedMessageId,
                    text,
                    media: media || [],
                };
                this.socket.emit("quoteMessage", payload, (response: any) => {                    if (response?.success) {
                        const messages = response?.messages || response?.data || response?.message;
                        if (Array.isArray(messages)) {
                            // Debug: log first message to check fields
                            if (messages.length > 0) {                            }                            resolve(messages);
                            return;
                        }
                        if (messages) {                            resolve([messages]);
                            return;
                        }                        resolve([]);
                    } else {
                        console.error('[SocketService] Send quoted message failed:', response?.error);
                        reject(new Error(response?.error || "Failed to send quoted message"));
                    }
                });
            } catch (error: any) {
                console.error('[SocketService] sendQuotedMessage error:', error);
                reject(error);
            }
        });
    }

    /**
     * Listen for incoming messages
     */
    static onMessage(callback: (message: MessagePayload) => void): void {
        if (!this.socket) {
            console.warn('[SocketService] Cannot setup onMessage listener - socket not initialized');
            return;
        }        this.addRegisteredListener("receiveMessage", (data: any) => {
            const message = data.message || data.systemMessage || data.activityMessage || data;            // Debug: check if quoted message fields present
            if (message?.quotedMessageId) {            }
            callback(message);
        });
    }

    /**
     * Remove message listener
     */
    static offMessage(): void {
        this.offRegisteredListeners("receiveMessage");
    }

    /**
     * Listen for quoted (reply) message events
     */
    static onMessageQuoted(callback: (data: { conversationId: string; message: MessagePayload; quotedMessageId: string }) => void): void {
        if (!this.socket) {
            console.warn("[SocketService] Socket not available for onMessageQuoted");
            return;
        }
        this.addRegisteredListener("message:quoted", (data: any) => {            callback(data);
        });
    }

    /**
     * Remove quoted message listener
     */
    static offMessageQuoted(): void {
        this.offRegisteredListeners("message:quoted");
    }

    /**
     * Mark messages as seen
     */
    static markMessagesSeen(
        conversationId: string,
        lastSeenMessageId: string
    ): Promise<any> {
        return new Promise(async (resolve, reject) => {
            try {
                if (!this.socket) {
                    throw new Error("Socket not connected");
                }

                // Wait for connection if not connected
                if (!this.socket.connected) {
                    await this.waitForConnection(5000);
                }

                const payload = {
                    conversationId,
                    lastSeenMessageId,
                };

                this.socket.emit("messageSeen", payload, (response: any) => {
                    if (response?.success) {
                        resolve(response);
                    } else {
                        reject(new Error(response?.error || "Failed to mark as seen"));
                    }
                });
            } catch (error: any) {
                reject(error);
            }
        });
    }

    /**
     * Listen for message seen events
     */
    static onMessageSeen(callback: (data: SeenData) => void): void {
        if (!this.socket) return;

        this.addRegisteredListener("messageSeen", (data: SeenData) => {
            callback(data);
        });
    }

    /**
     * Remove message seen listener
     */
    static offMessageSeen(): void {
        this.offRegisteredListeners("messageSeen");
    }

    /**
     * Start typing indicator
     */
    static startTyping(conversationId: string, target?: { toUserId?: string; groupId?: string }): void {
        if (!this.socket) return;
        this.socket.emit("typing:start", target || { groupId: conversationId });

        // Clear previous timeout
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }

        // Stop typing after 3 seconds
        this.typingTimeout = setTimeout(() => {
            this.stopTyping(conversationId, target);
        }, 3000);
    }

    /**
     * Stop typing indicator
     */
    static stopTyping(conversationId: string, target?: { toUserId?: string; groupId?: string }): void {
        if (!this.socket) return;
        this.socket.emit("typing:stop", target || { groupId: conversationId });

        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
            this.typingTimeout = null;
        }
    }

    /**
     * Listen for typing events
     */
    static onTyping(callback: (data: TypingData) => void): void {
        if (!this.socket) return;

        this.addRegisteredListener("typing:start", (data: any) => {            callback({
                userId: data.userId,
                conversationId: data.conversationId || data.groupId || data.toUserId,
                toUserId: data.toUserId,
                groupId: data.groupId,
                isTyping: true,
            });
        });

        this.addRegisteredListener("typing:stop", (data: any) => {            callback({
                userId: data.userId,
                conversationId: data.conversationId || data.groupId || data.toUserId,
                toUserId: data.toUserId,
                groupId: data.groupId,
                isTyping: false,
            });
        });
    }

    /**
     * Remove typing listener
     */
    static offTyping(): void {
        if (this.socket) {
            this.offRegisteredListeners("typing:start");
            this.offRegisteredListeners("typing:stop");
        }
    }

    /**
     * Add reaction to message
     */
    static async addReaction(messageId: string, emoji: string): Promise<any> {
        try {
            if (!this.socket?.connected) {
                await this.waitForConnection(5000);
            }

            return new Promise((resolve, reject) => {
                if (!this.socket) {
                    reject(new Error("Socket not connected"));
                    return;
                }

                this.socket.emit("addReaction", { messageId, emoji }, (response: any) => {
                    if (response?.success) {
                        resolve(response.reaction);
                    } else {
                        reject(new Error(response?.error || "Failed to add reaction"));
                    }
                });
            });
        } catch (error: any) {
            throw error;
        }
    }

    /**
     * Remove reaction from message
     */
    static async removeReaction(messageId: string, emoji?: string): Promise<any> {
        try {
            if (!this.socket?.connected) {
                await this.waitForConnection(5000);
            }

            return new Promise((resolve, reject) => {
                if (!this.socket) {
                    reject(new Error("Socket not connected"));
                    return;
                }

                const payload = emoji ? { messageId, emoji } : { messageId };

                this.socket.emit("removeReaction", payload, (response: any) => {
                    if (response?.success) {
                        resolve(response);
                    } else {
                        reject(new Error(response?.error || "Failed to remove reaction"));
                    }
                });
            });
        } catch (error: any) {
            throw error;
        }
    }

    /**
     * Edit message
     */
    static async editMessage(messageId: string, text: string): Promise<any> {
        try {
            if (!this.socket?.connected) {
                await this.waitForConnection(5000);
            }

            return new Promise((resolve, reject) => {
                if (!this.socket) {
                    reject(new Error("Socket not connected"));
                    return;
                }

                this.socket.emit("editMessage", { messageId, text }, (response: any) => {
                    if (response?.success) {
                        resolve(response.message);
                    } else {
                        reject(new Error(response?.error || "Failed to edit message"));
                    }
                });
            });
        } catch (error: any) {
            throw error;
        }
    }

    /**
     * Delete message (for self only)
     */
    static async deleteMessage(messageId: string): Promise<any> {
        try {
            if (!this.socket?.connected) {
                await this.waitForConnection(5000);
            }

            return new Promise((resolve, reject) => {
                if (!this.socket) {
                    reject(new Error("Socket not connected"));
                    return;
                }

                this.socket.emit("deleteMessage", { messageId }, (response: any) => {
                    if (response?.success) {
                        resolve(response);
                    } else {
                        reject(new Error(response?.error || "Failed to delete message"));
                    }
                });
            });
        } catch (error: any) {
            throw error;
        }
    }

    /**
     * Revoke message (delete for everyone)
     */
    static async revokeMessage(messageId: string): Promise<any> {
        try {
            const response = await apiCall(`/messages/${messageId}/revoke`, {
                method: "POST",
            });

            return response?.data || response;
        } catch (error: any) {
            throw error;
        }
    }

    /**
     * Delete message for everyone
     */
    static async deleteMessageForEveryone(messageId: string): Promise<any> {
        try {
            if (!this.socket?.connected) {
                await this.waitForConnection(5000);
            }

            return new Promise((resolve, reject) => {
                if (!this.socket) {
                    reject(new Error("Socket not connected"));
                    return;
                }

                this.socket.emit("deleteMessageForEveryone", { messageId }, (response: any) => {
                    if (response?.success) {
                        resolve(response);
                    } else {
                        reject(new Error(response?.error || "Failed to delete message for everyone"));
                    }
                });
            });
        } catch (error: any) {
            throw error;
        }
    }

    /**
     * Mark message as delivered
     */
    static async markMessageDelivered(
        conversationId: string,
        lastDeliveredMessageId: string
    ): Promise<any> {
        try {
            if (!this.socket?.connected) {
                await this.waitForConnection(5000);
            }

            return new Promise((resolve, reject) => {
                if (!this.socket) {
                    reject(new Error("Socket not connected"));
                    return;
                }

                const payload = {
                    conversationId,
                    lastDeliveredMessageId,
                };

                this.socket.emit("messageDelivered", payload, (response: any) => {
                    if (response?.success) {
                        resolve(response);
                    } else {
                        reject(new Error(response?.error || "Failed to mark as delivered"));
                    }
                });
            });
        } catch (error: any) {
            throw error;
        }
    }

    /**
     * Mark all messages as seen
     */
    static markAllSeen(conversationId: string): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this.socket) {
                reject(new Error("Socket not connected"));
                return;
            }

            this.socket.emit("markAllSeen", { conversationId }, (response: any) => {
                if (response?.success) {
                    resolve(response);
                } else {
                    reject(new Error(response?.error || "Failed to mark all as seen"));
                }
            });
        });
    }

    /**
     * Forward messages to other conversations
     */
    static forwardMessages(
        messageIds: string[],
        targetConversationIds: string[]
    ): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this.socket) {
                reject(new Error("Socket not connected"));
                return;
            }

            this.socket.emit(
                "forwardMessages",
                { messageIds, targetConversationIds },
                (response: any) => {
                    if (response?.success) {
                        resolve(response);
                    } else {
                        reject(new Error(response?.error || "Failed to forward messages"));
                    }
                }
            );
        });
    }

    /**
     * Quote (reply to) a message
     */
    static quoteMessage(
        conversationId: string,
        quotedMessageId: string,
        text?: string,
        media?: any[]
    ): Promise<MessagePayload[]> {
        return new Promise(async (resolve, reject) => {
            try {
                if (!this.socket) {
                    throw new Error("Socket not initialized");
                }

                // Wait for connection if not connected (increase timeout to 10s for reliability)
                if (!this.socket.connected) {                    await this.waitForConnection(10000);                }

                const payload: any = {
                    conversationId,
                    quotedMessageId,
                };
                if (text) payload.text = text;
                if (media) payload.media = media;
                this.socket.emit("quoteMessage", payload, (response: any) => {
                    if (response?.success) {
                        const messages = response?.messages || response?.data || response?.message;
                        if (Array.isArray(messages)) {                            resolve(messages);
                            return;
                        }
                        if (messages) {                            resolve([messages]);
                            return;
                        }                        resolve([]);
                    } else {
                        console.error('[SocketService] Quote message failed:', response?.error);
                        reject(new Error(response?.error || "Failed to quote message"));
                    }
                });
            } catch (error: any) {
                console.error('[SocketService] quoteMessage error:', {
                    errorMessage: error?.message,
                    socketExists: !!this.socket,
                    socketConnected: this.socket?.connected,
                });
                reject(error);
            }
        });
    }

    /**
     * Listen for message updates
     */
    static onMessageUpdated(callback: (message: MessagePayload) => void): void {
        if (!this.socket) return;

        this.addRegisteredListener("message:edited", (data: any) => {            callback(data.message || data);
        });

        this.addRegisteredListener("message:deleted", (data: any) => {            const messageId = data?.messageId || data?.message?.id || data?.message?._id;
            callback({
                ...(data.message || {}),
                id: messageId,
                _id: messageId,
                conversationId: data?.conversationId || data?.message?.conversationId,
                status: "deleted",
                deletedBy: data?.deletedBy,
                deletedForUserIds: data?.deletedForUserIds || (data?.deletedBy ? [data.deletedBy] : []),
                deletedAt: new Date().toISOString(),
            } as any);
        });

        this.addRegisteredListener("message:deleted_for_everyone", (data: any) => {            const messageId = data?.messageId || data?.message?.id || data?.message?._id;
            callback({
                ...(data.message || {}),
                id: messageId,
                _id: messageId,
                conversationId: data?.conversationId || data?.message?.conversationId,
                status: "deleted",
                deletedBy: data?.deletedBy,
                deletedAt: new Date().toISOString(),
            } as any);
        });

        this.addRegisteredListener("message:revoked", (data: any) => {            const messageId = data?.messageId || data?.message?.id || data?.message?._id;
            callback({
                ...(data.message || data),
                id: messageId,
                _id: messageId,
                conversationId: data?.conversationId || data?.message?.conversationId,
                deletedBy: data?.revokedBy,
                text: "Đã thu hồi",
                media: null,
                type: "system",
                deletedAt: new Date().toISOString(),
            } as any);
        });
    }

    /**
     * Remove message update listener
     */
    static offMessageUpdated(): void {
        this.offRegisteredListeners("message:edited");
        this.offRegisteredListeners("message:deleted");
        this.offRegisteredListeners("message:deleted_for_everyone");
        this.offRegisteredListeners("message:revoked");
    }

    /**
     * Listen for message reactions
     */
    static onMessageReaction(callback: (data: { messageId: string; reaction: any }) => void): void {
        if (!this.socket) return;

        this.addRegisteredListener("message:reaction", (data: any) => {            callback(data);
        });
    }

    /**
     * Remove message reaction listener
     */
    static offMessageReaction(): void {
        this.offRegisteredListeners("message:reaction");
    }

    /**
     * Listen for message reaction removal
     */
    static onMessageReactionRemove(callback: (data: { messageId: string; userId: string; emoji?: string }) => void): void {
        if (!this.socket) return;

        this.addRegisteredListener("message:reaction:remove", (data: any) => {            callback(data);
        });
    }

    /**
     * Remove message reaction removal listener
     */
    static offMessageReactionRemove(): void {
        this.offRegisteredListeners("message:reaction:remove");
    }

    /**
     * Listen for message delivered notifications
     */
    static onMessageDelivered(callback: (data: { conversationId: string; userId: string; lastDeliveredMessageId: string }) => void): void {
        if (!this.socket) return;

        this.addRegisteredListener("messageDelivered", (data: any) => {            callback(data);
        });
    }

    /**
     * Remove message delivered listener
     */
    static offMessageDelivered(): void {
        this.offRegisteredListeners("messageDelivered");
    }

    // ========================================================================
    // GROUP CHAT EVENT HANDLERS
    // ========================================================================

    /**
     * Listen for group creation event
     */
    static onGroupCreated(
        callback: (data: { conversation: any; systemMessage: any }) => void
    ): void {
        if (!this.socket) return;

        this.addRegisteredListener("conversation:created", (data: any) => {            callback(data);
        });
    }

    /**
     * Remove group created listener
     */
    static offGroupCreated(): void {
        this.offRegisteredListeners("conversation:created");
    }

    /**
     * Listen for members added to group
     */
    static onGroupMembersAdded(
        callback: (data: GroupMemberEvent) => void
    ): void {
        if (!this.socket) return;

        this.addRegisteredListener("conversation:members_added", (data: any) => {            callback(data);
        });
    }

    /**
     * Remove members added listener
     */
    static offGroupMembersAdded(): void {
        this.offRegisteredListeners("conversation:members_added");
    }

    /**
     * Listen for member removed from group
     */
    static onGroupMemberRemoved(
        callback: (data: GroupMemberEvent) => void
    ): void {
        if (!this.socket) return;

        this.addRegisteredListener("conversation:member_removed", (data: any) => {            callback(data);
        });
    }

    /**
     * Subscribe to member removed event with callback-scoped cleanup.
     * This avoids removing unrelated listeners that may be registered elsewhere.
     */
    static subscribeGroupMemberRemoved(
        callback: (data: GroupMemberEvent) => void
    ): () => void {
        if (!this.socket) {
            return () => { };
        }

        const handler = (data: any) => {            callback(data);
        };

        this.socket.on("conversation:member_removed", handler);

        return () => {
            this.socket?.off("conversation:member_removed", handler);
        };
    }

    /**
     * Remove member removed listener
     */
    static offGroupMemberRemoved(): void {
        this.offRegisteredListeners("conversation:member_removed");
    }

    /**
     * Listen for group info updated
     */
    static onGroupUpdated(
        callback: (data: GroupEventData) => void
    ): void {
        if (!this.socket) return;

        this.addRegisteredListener("conversation:updated", (data: any) => {            callback(data);
        });
    }

    /**
     * Remove group updated listener
     */
    static offGroupUpdated(): void {
        this.offRegisteredListeners("conversation:updated");
    }

    /**
     * Listen for admin status changed
     */
    static onGroupAdminChanged(
        callback: (data: GroupAdminEvent) => void
    ): void {
        if (!this.socket) return;

        this.addRegisteredListener("group:admin_changed", (data: any) => {            callback(data);
        });
    }

    /**
     * Remove admin changed listener
     */
    static offGroupAdminChanged(): void {
        this.offRegisteredListeners("group:admin_changed");
    }

    /**
     * Listen for owner transferred
     */
    static onGroupOwnerTransferred(
        callback: (data: GroupOwnerTransferEvent) => void
    ): void {
        if (!this.socket) return;

        this.addRegisteredListener("group:owner_transferred", (data: any) => {            callback(data);
        });
    }

    /**
     * Remove owner transferred listener
     */
    static offGroupOwnerTransferred(): void {
        this.offRegisteredListeners("group:owner_transferred");
    }

    /**
     * Listen for pending member approved
     */
    static onGroupMemberApproved(
        callback: (data: GroupMemberEvent) => void
    ): void {
        if (!this.socket) return;

        this.addRegisteredListener("group:member_approved", (data: any) => {            callback(data);
        });
    }

    /**
     * Remove member approved listener
     */
    static offGroupMemberApproved(): void {
        this.offRegisteredListeners("group:member_approved");
    }

    /**
     * Listen for pending member rejected
     */
    static onGroupMemberRejected(
        callback: (data: GroupMemberEvent) => void
    ): void {
        if (!this.socket) return;

        this.addRegisteredListener("group:member_rejected", (data: any) => {            callback(data);
        });
    }

    /**
     * Remove member rejected listener
     */
    static offGroupMemberRejected(): void {
        this.offRegisteredListeners("group:member_rejected");
    }

    /**
     * Listen for group settings updated
     */
    static onGroupSettingsUpdated(
        callback: (data: GroupEventData) => void
    ): void {
        if (!this.socket) return;

        this.addRegisteredListener("group:settings_updated", (data: any) => {            callback(data);
        });
    }

    /**
     * Remove settings updated listener
     */
    static offGroupSettingsUpdated(): void {
        this.offRegisteredListeners("group:settings_updated");
    }

    /**
     * Listen for group dissolved
     */
    static onGroupDissolved(
        callback: (data: GroupEventData) => void
    ): void {
        if (!this.socket) return;

        this.addRegisteredListener("group:dissolved", (data: any) => {            callback(data);
        });
    }

    /**
     * Remove group dissolved listener
     */
    static offGroupDissolved(): void {
        this.offRegisteredListeners("group:dissolved");
    }

    /**
     * Listen for new poll
     */
    static onPollNew(
        callback: (data: { conversationId: string; poll: any }) => void
    ): void {
        if (!this.socket) return;

        this.addRegisteredListener("poll:new", (data: any) => {            callback(data);
        });
    }

    /**
     * Remove poll new listener
     */
    static offPollNew(): void {
        this.offRegisteredListeners("poll:new");
    }

    /**
     * Listen for poll vote
     */
    static onPollVote(
        callback: (data: { conversationId: string; pollId: string; userId: string; poll: any }) => void
    ): void {
        if (!this.socket) return;

        this.addRegisteredListener("poll:vote", (data: any) => {            callback(data);
        });
    }

    /**
     * Remove poll vote listener
     */
    static offPollVote(): void {
        this.offRegisteredListeners("poll:vote");
    }

    /**
     * Clean up all group event listeners
     */
    static offAllGroupEvents(): void {
        this.offGroupCreated();
        this.offGroupMembersAdded();
        this.offGroupMemberRemoved();
        this.offGroupUpdated();
        this.offGroupAdminChanged();
        this.offGroupOwnerTransferred();
        this.offGroupMemberApproved();
        this.offGroupMemberRejected();
        this.offGroupSettingsUpdated();
        this.offGroupDissolved();
        this.offPollNew();
        this.offPollVote();
    }

    /**
     * Clean up all message event listeners
     */
    static offAllMessageEvents(): void {
        this.offMessage();
        this.offMessageUpdated();
        this.offMessageSeen();
        this.offMessageDelivered();
        this.offMessageReaction();
        this.offMessageReactionRemove();
        this.offTyping();
    }

    // ========================================================================
    // PIN MESSAGE EVENTS (HTTP-based + Socket broadcast)
    // ========================================================================

    /**
     * Pin a message (HTTP POST)
     * BE will broadcast message:pinned event after pinning
     */
    static async pinMessage(
        conversationId: string,
        messageId: string
    ): Promise<any> {
        try {
            const response = await apiCall(`/messages/${messageId}/pin`, {
                method: "POST",
                body: JSON.stringify({ conversationId }),
            });
            return response;
        } catch (error: any) {
            console.error('[SocketService] ❌ Pin message HTTP error:', {
                message: error?.message,
                status: error?.status,
            });
            throw error;
        }
    }

    /**
     * Unpin a message (HTTP DELETE)
     * BE will broadcast message:unpinned event after unpinning
     */
    static async unpinMessage(
        conversationId: string,
        messageId: string
    ): Promise<any> {
        try {
            const response = await apiCall(`/messages/${messageId}/pin`, {
                method: "DELETE",
                body: JSON.stringify({ conversationId }),
            });
            return response;
        } catch (error: any) {
            console.error('[SocketService] ❌ Unpin message HTTP error:', {
                message: error?.message,
                status: error?.status,
            });
            throw error;
        }
    }

    /**
     * Listen for pinned message events
     */
    static onPinnedMessage(callback: (data: any) => void): void {
        if (!this.socket) {
            console.warn("[SocketService] Socket not available for onPinnedMessage");
            return;
        }
        // New message pinned
        this.addRegisteredListener("message:pinned", (data: any) => {            callback({ type: "pinned", pinnedMessage: data });
        });

        // Message unpinned
        this.addRegisteredListener("message:unpinned", (data: any) => {            callback({ type: "unpinned", pinnedMessage: data });
        });

        // Debug: Log all socket events
        this.socket.onAny((event: string, ...args: any[]) => {
            if (event.includes("pin")) {            }
        });
    }

    /**
     * Remove pinned message listeners
     */
    static offPinnedMessage(): void {
        if (this.socket) {
            this.offRegisteredListeners("message:pinned");
            this.offRegisteredListeners("message:unpinned");
        }
    }

    /**
     * Listen for group poll events
     */
    static onPollEvent(callback: (event: PollSocketEvent & { type: string }) => void): void {
        if (!this.socket) {
            console.warn("[SocketService] Socket not available for onPollEvent");
            return;
        }

        const eventNames = [
            "poll:new",
            "poll:vote",
            "poll:closed",
            "poll:locked",
            "poll:pinned",
            "poll:unpinned",
            "poll:deleted",
            "poll:option_added",
        ];

        eventNames.forEach((eventName) => {
            this.addRegisteredListener(eventName, (data: PollSocketEvent) => {                callback({ ...data, type: eventName });
            });
        });
    }

    /**
     * Remove group poll listeners
     */
    static offPollEvent(): void {
        if (this.socket) {
            this.offRegisteredListeners("poll:new");
            this.offRegisteredListeners("poll:vote");
            this.offRegisteredListeners("poll:closed");
            this.offRegisteredListeners("poll:locked");
            this.offRegisteredListeners("poll:pinned");
            this.offRegisteredListeners("poll:unpinned");
            this.offRegisteredListeners("poll:deleted");
            this.offRegisteredListeners("poll:option_added");
        }
    }

    /**
     * Get pinned messages for conversation (HTTP GET)
     */
    static async getPinnedMessages(conversationId: string): Promise<any[]> {
        try {
            const response = await apiCall(`/conversations/${conversationId}/pinned-messages`, {
                method: "GET",
            });

            // Handle various response formats
            const messages = response?.data?.pinnedMessages
                || response?.data?.messages
                || response?.pinnedMessages
                || response?.messages
                || response?.data
                || [];

            const pinnedArray = Array.isArray(messages) ? messages : [];

            // Normalize pinned messages to ensure required fields exist
            const normalized = pinnedArray.map((pin: any) => {
                const msg = pin.message || pin;

                // Extract pinnedByName from various possible locations
                let pinnedByName = pin.pinnedByName;
                if (!pinnedByName && pin.pinnedBy) {
                    if (typeof pin.pinnedBy === 'string') {
                        pinnedByName = pin.pinnedBy; // If pinnedBy is just a string ID, use it
                    } else if (pin.pinnedBy.displayName) {
                        pinnedByName = pin.pinnedBy.displayName;
                    } else if (pin.pinnedBy.name) {
                        pinnedByName = pin.pinnedBy.name;
                    } else if (pin.pinnedBy.username) {
                        pinnedByName = pin.pinnedBy.username;
                    }
                }

                // Try to get from message sender if still missing (fallback)
                if (!pinnedByName && msg.senderName) {
                    pinnedByName = msg.senderName;
                }

                return {
                    ...pin,
                    message: {
                        ...msg,
                        // Ensure these fields exist with fallbacks
                        senderName: msg.senderName || msg.senderDisplayName || "Unknown",
                        senderAvatar: msg.senderAvatar || msg.senderProfilePicture || "https://via.placeholder.com/40",
                        text: msg.text || "",
                        senderId: msg.senderId || msg.sender?.id || "unknown",
                    },
                    pinnedByName: pinnedByName || "Unknown",
                    pinnedAt: pin.pinnedAt || new Date().toISOString(),
                };
            });
            return normalized;
        } catch (error: any) {
            console.error('[SocketService] ❌ Failed to load pinned messages:', error?.message);
            // Return empty array on error instead of throwing, so chat still loads
            return [];
        }
    }
}

export default SocketService;
