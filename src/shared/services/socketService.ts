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
            return this.socket;
        }

        this.socket = io(SOCKET_URL + SOCKET_NAMESPACE, {
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
        this.socket.on("connect", () => { });
        this.socket.on("disconnect", () => { });
        this.socket.on("connect_error", () => { });

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
     * Join conversation room
     */
    static joinConversation(conversationId: string): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this.socket) {
                reject(new Error("Socket not connected"));
                return;
            }

            this.socket.emit("joinGroup", { conversationId }, (response: any) => {
                if (response?.success) {
                    resolve(response);
                } else {
                    reject(new Error(response?.error || "Failed to join"));
                }
            });
        });
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
        return new Promise((resolve, reject) => {
            if (!this.socket) {
                reject(new Error("Socket not connected"));
                return;
            }

            const payload = {
                conversationId,
                text,
                media: media || [],
            };

            this.socket.emit("sendMessage", payload, (response: any) => {
                if (response?.success) {
                    const messages = response?.messages || response?.data || response?.message;
                    if (Array.isArray(messages)) {
                        resolve(messages);
                        return;
                    }
                    if (messages) {
                        resolve([messages]);
                        return;
                    }
                    resolve([]);
                } else {
                    reject(new Error(response?.error || "Failed to send message"));
                }
            });
        });
    }

    /**
     * Listen for incoming messages
     */
    static onMessage(callback: (message: MessagePayload) => void): void {
        if (!this.socket) {
            return;
        }

        this.socket.on("receiveMessage", (data: any) => {
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
        return new Promise((resolve, reject) => {
            if (!this.socket) {
                reject(new Error("Socket not connected"));
                return;
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
}

export default SocketService;
