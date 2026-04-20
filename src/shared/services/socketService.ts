import { io, Socket } from "socket.io-client";
import { getApiBaseUrl } from "../runtime";
import { apiCall } from "./api";

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
    status: "sent" | "delivered" | "seen";
    createdAt: string;
    updatedAt: string;
    type?: "text" | "image" | "file" | "link" | "system";
    links?: string[];
    deletedForUserIds?: string[];
    deletedBy?: string;
    deletedAt?: string;

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
}

export interface TypingData {
    userId: string;
    conversationId: string;
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

    /**
     * Connect to Socket.IO server
     */
    static connect(token: string): Socket {
        if (this.socket?.connected) {
            console.log('[SocketService] Socket already connected');
            return this.socket;
        }

        this.socket = io(SOCKET_URL + SOCKET_NAMESPACE, {
            // Try Authorization header format first
            extraHeaders: {
                Authorization: `Bearer ${token}`,
            },
            // Also try auth object as fallback
            auth: {
                token,
            },
            transports: ["websocket"],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
        });

        // Connection events
        this.socket.on("connect", () => {
            // Connected
        });
        this.socket.on("disconnect", (reason: string) => {
            console.warn('[SocketService] Socket disconnected:', reason);
        });
        this.socket.on("connect_error", (error: any) => {
            console.error('[SocketService] Socket connection error:', error?.message || error);
        });

        // Debug: Log all events received
        const originalEmit = this.socket.on;
        const self = this;
        this.socket.on = function (eventName: string, callback: any) {
            const wrappedCallback = (...args: any[]) => {
                if (eventName !== "receiveMessage" && eventName !== "messageSeen" && !eventName.includes("reconnect")) {
                    console.log('[SocketService] EVENT RECEIVED:', eventName, {
                        argsCount: args.length,
                        firstArg: typeof args[0] === 'object' ? Object.keys(args[0]).slice(0, 3) : typeof args[0],
                    });
                }
                callback(...args);
            };
            return originalEmit.call(this, eventName, wrappedCallback);
        } as any;

        return this.socket;
    }

    /**
     * Disconnect socket
     */
    static disconnect(): void {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
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
            if (!this.socket) {
                reject(new Error("Socket not initialized"));
                return;
            }

            const timeout = setTimeout(() => {
                reject(new Error("Socket connection timeout"));
            }, timeoutMs);

            this.socket.once("connect", () => {
                clearTimeout(timeout);
                console.log('[SocketService] Resolved connection promise');
                resolve();
            });

            // Also reject on connection error
            const onError = (error: any) => {
                clearTimeout(timeout);
                this.socket?.removeListener("connect_error", onError);
                reject(new Error(`Socket connection error: ${error?.message || error}`));
            };

            this.socket.on("connect_error", onError);
        });
    }

    /**
     * Join conversation room
     */
    static async joinConversation(conversationId: string): Promise<any> {
        try {
            // Wait for socket to be connected before joining
            if (!this.socket?.connected) {
                console.log('[SocketService] Socket not connected yet, waiting...');
                await this.waitForConnection(5000);
            }

            return new Promise((resolve, reject) => {
                if (!this.socket) {
                    reject(new Error("Socket not connected"));
                    return;
                }

                console.log('[SocketService] Emitting joinGroup for conversationId:', conversationId);
                this.socket.emit("joinGroup", { conversationId }, (response: any) => {
                    if (response?.success) {
                        console.log('[SocketService] ✓ Joined conversation:', conversationId);
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
                if (!this.socket.connected) {
                    console.log('[SocketService] Socket not connected, waiting before sending message...');
                    await this.waitForConnection(5000);
                }

                const payload = {
                    conversationId,
                    text,
                    media: media || [],
                };

                console.log('[SocketService] Emitting sendMessage:', {
                    conversationId,
                    textLength: text.length,
                    mediaCount: media?.length || 0,
                });

                this.socket.emit("sendMessage", payload, (response: any) => {
                    console.log('[SocketService] sendMessage callback received:', {
                        success: response?.success,
                        hasMessages: !!response?.messages,
                        messagesCount: response?.messages?.length,
                        responseKeys: Object.keys(response || {}),
                        responseSample: {
                            success: response?.success,
                            error: response?.error,
                            firstMsg: response?.messages?.[0] ? {
                                _id: response.messages[0]._id || response.messages[0].id,
                                text: response.messages[0].text?.substring(0, 30),
                                senderId: response.messages[0].senderId,
                            } : null,
                        },
                    });
                    if (response?.success) {
                        const messages = response?.messages || response?.data || response?.message;
                        if (Array.isArray(messages)) {
                            console.log('[SocketService] ✓ Message sent, received', messages.length, 'messages back');
                            resolve(messages);
                            return;
                        }
                        if (messages) {
                            console.log('[SocketService] ✓ Message sent');
                            resolve([messages]);
                            return;
                        }
                        console.log('[SocketService] ✓ Message sent (empty response)');
                        resolve([]);
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
                if (!this.socket.connected) {
                    console.log('[SocketService] Socket not connected, waiting before sending quoted message...');
                    await this.waitForConnection(5000);
                }

                const payload = {
                    conversationId,
                    quotedMessageId,
                    text,
                    media: media || [],
                };

                console.log('[SocketService] Emitting sendQuotedMessage (quoteMessage event):', {
                    conversationId,
                    quotedMessageId,
                    textLength: text.length,
                    mediaCount: media?.length || 0,
                });

                this.socket.emit("quoteMessage", payload, (response: any) => {
                    console.log('[SocketService] quoteMessage callback received:', {
                        success: response?.success,
                        hasMessages: !!response?.messages,
                        messagesCount: response?.messages?.length,
                    });
                    if (response?.success) {
                        const messages = response?.messages || response?.data || response?.message;
                        if (Array.isArray(messages)) {
                            // Debug: log first message to check fields
                            if (messages.length > 0) {
                                console.log('[SocketService] First quoted message from BE:', {
                                    text: messages[0].text?.substring(0, 30),
                                    quotedMessageId: messages[0].quotedMessageId,
                                    quotedMessageSenderId: messages[0].quotedMessageSenderId,
                                    quotedMessageSenderName: messages[0].quotedMessageSenderName,
                                    quotedMessagePreview: messages[0].quotedMessagePreview?.substring(0, 30),
                                });
                            }
                            console.log('[SocketService] ✓ Quoted message sent, received', messages.length, 'messages back');
                            resolve(messages);
                            return;
                        }
                        if (messages) {
                            console.log('[SocketService] ✓ Quoted message sent');
                            resolve([messages]);
                            return;
                        }
                        console.log('[SocketService] ✓ Quoted message sent (empty response)');
                        resolve([]);
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
        }

        console.log('[SocketService] Setting up "receiveMessage" listener');
        this.socket.on("receiveMessage", (data: any) => {
            const message = data.message || data;
            console.log('[SocketService] EVENT FIRED: receiveMessage', {
                hasMessage: !!data.message,
                hasData: !!data,
                dataKeys: Object.keys(data || {}),
            });
            // Debug: check if quoted message fields present
            if (message?.quotedMessageId) {
                console.log('[SocketService] Received quoted message:', {
                    quotedMessageId: message.quotedMessageId,
                    quotedMessageSenderId: message.quotedMessageSenderId,
                    quotedMessageSenderName: message.quotedMessageSenderName,
                    quotedMessagePreview: message.quotedMessagePreview?.substring(0, 30),
                });
            }
            callback(message);
        });
    }

    /**
     * Remove message listener
     */
    static offMessage(): void {
        if (this.socket) {
            this.socket.off("receiveMessage");
        }
    }

    /**
     * Listen for quoted (reply) message events
     */
    static onMessageQuoted(callback: (data: { conversationId: string; message: MessagePayload; quotedMessageId: string }) => void): void {
        if (!this.socket) {
            console.warn("[SocketService] Socket not available for onMessageQuoted");
            return;
        }

        console.log("[SocketService] Setting up message:quoted listener");

        this.socket.on("message:quoted", (data: any) => {
            console.log("[SocketService] 🔔 RECEIVED message:quoted event:", {
                conversationId: data.conversationId,
                messageId: data.message?._id || data.message?.id,
                quotedMessageId: data.quotedMessageId,
            });
            callback(data);
        });
    }

    /**
     * Remove quoted message listener
     */
    static offMessageQuoted(): void {
        if (this.socket) {
            this.socket.off("message:quoted");
        }
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

        this.socket.on("messageSeen", (data: SeenData) => {
            callback(data);
        });
    }

    /**
     * Remove message seen listener
     */
    static offMessageSeen(): void {
        if (this.socket) {
            this.socket.off("messageSeen");
        }
    }

    /**
     * Start typing indicator
     */
    static startTyping(conversationId: string): void {
        if (!this.socket) return;
        this.socket.emit("typing:start", { groupId: conversationId });

        // Clear previous timeout
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }

        // Stop typing after 3 seconds
        this.typingTimeout = setTimeout(() => {
            this.stopTyping(conversationId);
        }, 3000);
    }

    /**
     * Stop typing indicator
     */
    static stopTyping(conversationId: string): void {
        if (!this.socket) return;
        this.socket.emit("typing:stop", { groupId: conversationId });

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

        this.socket.on("typing:start", (data: any) => {
            console.log("[SocketService] User typing:", data);
            callback({
                userId: data.userId,
                conversationId: data.groupId,
                isTyping: true,
            });
        });

        this.socket.on("typing:stop", (data: any) => {
            console.log("[SocketService] User stopped typing:", data);
            callback({
                userId: data.userId,
                conversationId: data.groupId,
                isTyping: false,
            });
        });
    }

    /**
     * Remove typing listener
     */
    static offTyping(): void {
        if (this.socket) {
            this.socket.off("typing:start");
            this.socket.off("typing:stop");
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
                if (!this.socket.connected) {
                    console.log('[SocketService] Socket not connected, waiting 10s for connection before quoting message...', {
                        socketExists: !!this.socket,
                        socketConnected: this.socket?.connected,
                        socketState: this.socket?.io?.engine?.readyState,
                    });
                    await this.waitForConnection(10000);
                    console.log('[SocketService] Socket reconnected, proceeding with quoteMessage');
                }

                const payload: any = {
                    conversationId,
                    quotedMessageId,
                };
                if (text) payload.text = text;
                if (media) payload.media = media;

                console.log('[SocketService] Emitting quoteMessage:', {
                    conversationId,
                    quotedMessageId,
                    textLength: text?.length || 0,
                    mediaCount: media?.length || 0,
                });

                this.socket.emit("quoteMessage", payload, (response: any) => {
                    console.log('[SocketService] quoteMessage callback received:', {
                        success: response?.success,
                        hasMessages: !!response?.messages,
                        messagesCount: response?.messages?.length,
                        responseKeys: Object.keys(response || {}),
                    });

                    if (response?.success) {
                        const messages = response?.messages || response?.data || response?.message;
                        if (Array.isArray(messages)) {
                            console.log('[SocketService] ✓ Message quoted, received', messages.length, 'messages back');
                            resolve(messages);
                            return;
                        }
                        if (messages) {
                            console.log('[SocketService] ✓ Message quoted');
                            resolve([messages]);
                            return;
                        }
                        console.log('[SocketService] ✓ Message quoted (empty response)');
                        resolve([]);
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

        this.socket.on("message:edited", (data: any) => {
            console.log("[SocketService] Message edited:", data);
            callback(data.message || data);
        });

        this.socket.on("message:deleted", (data: any) => {
            console.log("[SocketService] Message deleted:", data);
            const messageId = data?.messageId || data?.message?.id || data?.message?._id;
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

        this.socket.on("message:deleted_for_everyone", (data: any) => {
            console.log("[SocketService] Message deleted for everyone:", data);
            const messageId = data?.messageId || data?.message?.id || data?.message?._id;
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

        this.socket.on("message:revoked", (data: any) => {
            console.log("[SocketService] Message revoked:", data);
            const messageId = data?.messageId || data?.message?.id || data?.message?._id;
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
        if (this.socket) {
            this.socket.off("message:edited");
            this.socket.off("message:deleted");
            this.socket.off("message:deleted_for_everyone");
            this.socket.off("message:revoked");
        }
    }

    /**
     * Listen for message reactions
     */
    static onMessageReaction(callback: (data: { messageId: string; reaction: any }) => void): void {
        if (!this.socket) return;

        this.socket.on("message:reaction", (data: any) => {
            console.log("[SocketService] Message reaction:", data);
            callback(data);
        });
    }

    /**
     * Remove message reaction listener
     */
    static offMessageReaction(): void {
        if (this.socket) {
            this.socket.off("message:reaction");
        }
    }

    /**
     * Listen for message reaction removal
     */
    static onMessageReactionRemove(callback: (data: { messageId: string; userId: string; emoji?: string }) => void): void {
        if (!this.socket) return;

        this.socket.on("message:reaction:remove", (data: any) => {
            console.log("[SocketService] Message reaction removed:", data);
            callback(data);
        });
    }

    /**
     * Remove message reaction removal listener
     */
    static offMessageReactionRemove(): void {
        if (this.socket) {
            this.socket.off("message:reaction:remove");
        }
    }

    /**
     * Listen for message delivered notifications
     */
    static onMessageDelivered(callback: (data: { conversationId: string; userId: string; lastDeliveredMessageId: string }) => void): void {
        if (!this.socket) return;

        this.socket.on("messageDelivered", (data: any) => {
            console.log("[SocketService] Message delivered:", data);
            callback(data);
        });
    }

    /**
     * Remove message delivered listener
     */
    static offMessageDelivered(): void {
        if (this.socket) {
            this.socket.off("messageDelivered");
        }
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

        this.socket.on("conversation:created", (data: any) => {
            console.log("[SocketService] Group created:", data);
            callback(data);
        });
    }

    /**
     * Remove group created listener
     */
    static offGroupCreated(): void {
        if (this.socket) {
            this.socket.off("conversation:created");
        }
    }

    /**
     * Listen for members added to group
     */
    static onGroupMembersAdded(
        callback: (data: GroupMemberEvent) => void
    ): void {
        if (!this.socket) return;

        this.socket.on("conversation:members_added", (data: any) => {
            console.log("[SocketService] Members added to group:", data);
            callback(data);
        });
    }

    /**
     * Remove members added listener
     */
    static offGroupMembersAdded(): void {
        if (this.socket) {
            this.socket.off("conversation:members_added");
        }
    }

    /**
     * Listen for member removed from group
     */
    static onGroupMemberRemoved(
        callback: (data: GroupMemberEvent) => void
    ): void {
        if (!this.socket) return;

        this.socket.on("conversation:member_removed", (data: any) => {
            console.log("[SocketService] Member removed from group:", data);
            callback(data);
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

        const handler = (data: any) => {
            console.log("[SocketService] Member removed from group:", data);
            callback(data);
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
        if (this.socket) {
            this.socket.off("conversation:member_removed");
        }
    }

    /**
     * Listen for group info updated
     */
    static onGroupUpdated(
        callback: (data: GroupEventData) => void
    ): void {
        if (!this.socket) return;

        this.socket.on("conversation:updated", (data: any) => {
            console.log("[SocketService] Group updated:", data);
            callback(data);
        });
    }

    /**
     * Remove group updated listener
     */
    static offGroupUpdated(): void {
        if (this.socket) {
            this.socket.off("conversation:updated");
        }
    }

    /**
     * Listen for admin status changed
     */
    static onGroupAdminChanged(
        callback: (data: GroupAdminEvent) => void
    ): void {
        if (!this.socket) return;

        this.socket.on("group:admin_changed", (data: any) => {
            console.log("[SocketService] Admin status changed:", data);
            callback(data);
        });
    }

    /**
     * Remove admin changed listener
     */
    static offGroupAdminChanged(): void {
        if (this.socket) {
            this.socket.off("group:admin_changed");
        }
    }

    /**
     * Listen for owner transferred
     */
    static onGroupOwnerTransferred(
        callback: (data: GroupOwnerTransferEvent) => void
    ): void {
        if (!this.socket) return;

        this.socket.on("group:owner_transferred", (data: any) => {
            console.log("[SocketService] Owner transferred:", data);
            callback(data);
        });
    }

    /**
     * Remove owner transferred listener
     */
    static offGroupOwnerTransferred(): void {
        if (this.socket) {
            this.socket.off("group:owner_transferred");
        }
    }

    /**
     * Listen for pending member approved
     */
    static onGroupMemberApproved(
        callback: (data: GroupMemberEvent) => void
    ): void {
        if (!this.socket) return;

        this.socket.on("group:member_approved", (data: any) => {
            console.log("[SocketService] Member approved:", data);
            callback(data);
        });
    }

    /**
     * Remove member approved listener
     */
    static offGroupMemberApproved(): void {
        if (this.socket) {
            this.socket.off("group:member_approved");
        }
    }

    /**
     * Listen for pending member rejected
     */
    static onGroupMemberRejected(
        callback: (data: GroupMemberEvent) => void
    ): void {
        if (!this.socket) return;

        this.socket.on("group:member_rejected", (data: any) => {
            console.log("[SocketService] Member rejected:", data);
            callback(data);
        });
    }

    /**
     * Remove member rejected listener
     */
    static offGroupMemberRejected(): void {
        if (this.socket) {
            this.socket.off("group:member_rejected");
        }
    }

    /**
     * Listen for group settings updated
     */
    static onGroupSettingsUpdated(
        callback: (data: GroupEventData) => void
    ): void {
        if (!this.socket) return;

        this.socket.on("group:settings_updated", (data: any) => {
            console.log("[SocketService] Settings updated:", data);
            callback(data);
        });
    }

    /**
     * Remove settings updated listener
     */
    static offGroupSettingsUpdated(): void {
        if (this.socket) {
            this.socket.off("group:settings_updated");
        }
    }

    /**
     * Listen for group dissolved
     */
    static onGroupDissolved(
        callback: (data: GroupEventData) => void
    ): void {
        if (!this.socket) return;

        this.socket.on("group:dissolved", (data: any) => {
            console.log("[SocketService] Group dissolved:", data);
            callback(data);
        });
    }

    /**
     * Remove group dissolved listener
     */
    static offGroupDissolved(): void {
        if (this.socket) {
            this.socket.off("group:dissolved");
        }
    }

    /**
     * Listen for new poll
     */
    static onPollNew(
        callback: (data: { conversationId: string; poll: any }) => void
    ): void {
        if (!this.socket) return;

        this.socket.on("poll:new", (data: any) => {
            console.log("[SocketService] Poll created:", data);
            callback(data);
        });
    }

    /**
     * Remove poll new listener
     */
    static offPollNew(): void {
        if (this.socket) {
            this.socket.off("poll:new");
        }
    }

    /**
     * Listen for poll vote
     */
    static onPollVote(
        callback: (data: { conversationId: string; pollId: string; userId: string; poll: any }) => void
    ): void {
        if (!this.socket) return;

        this.socket.on("poll:vote", (data: any) => {
            console.log("[SocketService] Poll voted:", data);
            callback(data);
        });
    }

    /**
     * Remove poll vote listener
     */
    static offPollVote(): void {
        if (this.socket) {
            this.socket.off("poll:vote");
        }
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
            console.log('[SocketService] 📌 Pinning message via HTTP POST:', { messageId, conversationId });

            const response = await apiCall(`/messages/${messageId}/pin`, {
                method: "POST",
                body: JSON.stringify({ conversationId }),
            });

            console.log('[SocketService] ✓ Message pinned successfully (HTTP POST)', {
                messageId,
                pinned: response?.data?.pinned,
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
            console.log('[SocketService] 📌 Unpinning message via HTTP DELETE:', { messageId, conversationId });

            const response = await apiCall(`/messages/${messageId}/pin`, {
                method: "DELETE",
                body: JSON.stringify({ conversationId }),
            });

            console.log('[SocketService] ✓ Message unpinned successfully (HTTP DELETE)', {
                pinned: response?.data?.pinned,
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

        console.log("[SocketService] Setting up onPinnedMessage listener");

        // New message pinned
        this.socket.on("message:pinned", (data: any) => {
            console.log("[SocketService] 🔔 RECEIVED message:pinned event:", data);
            callback({ type: "pinned", pinnedMessage: data });
        });

        // Message unpinned
        this.socket.on("message:unpinned", (data: any) => {
            console.log("[SocketService] 🔔 RECEIVED message:unpinned event:", data);
            callback({ type: "unpinned", pinnedMessage: data });
        });

        // Debug: Log all socket events
        this.socket.onAny((event: string, ...args: any[]) => {
            if (event.includes("pin")) {
                console.log(`[SocketService] Socket event: ${event}`, args);
            }
        });
    }

    /**
     * Remove pinned message listeners
     */
    static offPinnedMessage(): void {
        if (this.socket) {
            this.socket.off("message:pinned");
            this.socket.off("message:unpinned");
        }
    }

    /**
     * Get pinned messages for conversation (HTTP GET)
     */
    static async getPinnedMessages(conversationId: string): Promise<any[]> {
        try {
            console.log('[SocketService] Fetching pinned messages via HTTP GET:', { conversationId });

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

            console.log('[SocketService] ✓ Pinned messages loaded and normalized:', normalized.length);

            return normalized;
        } catch (error: any) {
            console.error('[SocketService] ❌ Failed to load pinned messages:', error?.message);
            // Return empty array on error instead of throwing, so chat still loads
            return [];
        }
    }
}

export default SocketService;
