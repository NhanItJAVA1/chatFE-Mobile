import { io, Socket } from "socket.io-client";
import { getApiBaseUrl } from "../runtime";

const SOCKET_URL = getApiBaseUrl().replace("/v1", "") || "http://192.168.1.6:3000";
const SOCKET_NAMESPACE = "/messages";

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

        console.log('[SocketService] Connecting to socket:', SOCKET_URL + SOCKET_NAMESPACE);
        console.log('[SocketService] Token provided:', token ? `${token.substring(0, 20)}...` : 'NO TOKEN!');

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
            console.log('[SocketService] ✓ Socket connected successfully');
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
     * Listen for incoming messages
     */
    static onMessage(callback: (message: MessagePayload) => void): void {
        if (!this.socket) {
            console.warn('[SocketService] Cannot setup onMessage listener - socket not initialized');
            return;
        }

        console.log('[SocketService] Setting up "receiveMessage" listener');
        this.socket.on("receiveMessage", (data: any) => {
            console.log('[SocketService] EVENT FIRED: receiveMessage', {
                hasMessage: !!data.message,
                hasData: !!data,
                dataKeys: Object.keys(data || {}),
            });
            callback(data.message || data);
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
    static addReaction(messageId: string, emoji: string): Promise<any> {
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
    }

    /**
     * Remove reaction from message
     */
    static removeReaction(messageId: string, emoji?: string): Promise<any> {
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
    }

    /**
     * Edit message
     */
    static editMessage(messageId: string, text: string): Promise<any> {
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
    }

    /**
     * Delete message (for self only)
     */
    static deleteMessage(messageId: string): Promise<any> {
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
    }

    /**
     * Revoke message (delete for everyone)
     */
    static revokeMessage(messageId: string): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this.socket) {
                reject(new Error("Socket not connected"));
                return;
            }

            this.socket.emit("revokeMessage", { messageId }, (response: any) => {
                if (response?.success) {
                    resolve(response);
                } else {
                    reject(new Error(response?.error || "Failed to revoke message"));
                }
            });
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
            this.socket.off("message:revoked");
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
    }

}

export default SocketService;
