import { io, Socket } from "socket.io-client";
import { getApiBaseUrl } from "../runtime";

const SOCKET_URL = getApiBaseUrl().replace("/v1", "") || "http://192.168.1.6:3000";
const SOCKET_NAMESPACE = "/friends";

/**
 * Friend Socket Service - Manages real-time friend events
 */
export class FriendSocketService {
    private static socket: Socket | null = null;

    /**
     * Connect to Friend Socket
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
     * Listen for friend request received
     */
    static onFriendRequestReceived(
        callback: (notification: FriendRequestNotification) => void | Promise<void>
    ): void {
        if (!this.socket) {
            return;
        }

        this.socket.on("friend_request:received", (data: any) => {
            callback(data);
        });
    }

    /**
     * Remove friend request received listener
     */
    static offFriendRequestReceived(): void {
        if (this.socket) {
            this.socket.off("friend_request:received");
        }
    }

    /**
     * Listen for friend request canceled
     */
    static onFriendRequestCanceled(
        callback: (notification: FriendRequestNotification) => void | Promise<void>
    ): void {
        if (!this.socket) {
            return;
        }

        this.socket.on("friend_request:canceled", (data: any) => {
            callback(data);
        });
    }

    /**
     * Remove friend request canceled listener
     */
    static offFriendRequestCanceled(): void {
        if (this.socket) {
            this.socket.off("friend_request:canceled");
        }
    }

    /**
     * Listen for friend request accepted
     */
    static onFriendRequestAccepted(
        callback: (notification: FriendRequestNotification) => void | Promise<void>
    ): void {
        if (!this.socket) {
            return;
        }

        this.socket.on("friend_request:accepted", (data: any) => {
            callback(data);
        });
    }

    /**
     * Remove friend request accepted listener
     */
    static offFriendRequestAccepted(): void {
        if (this.socket) {
            this.socket.off("friend_request:accepted");
        }
    }

    /**
     * Listen for friend request rejected
     */
    static onFriendRequestRejected(
        callback: (notification: FriendRequestNotification) => void | Promise<void>
    ): void {
        if (!this.socket) {
            return;
        }

        this.socket.on("friend_request:rejected", (data: any) => {
            callback(data);
        });
    }

    /**
     * Remove friend request rejected listener
     */
    static offFriendRequestRejected(): void {
        if (this.socket) {
            this.socket.off("friend_request:rejected");
        }
    }
}

export interface FriendRequestNotification {
    type: "FRIEND_REQUEST_RECEIVED" | "FRIEND_REQUEST_CANCELED" | "FRIEND_REQUEST_ACCEPTED" | "FRIEND_REQUEST_REJECTED";
    data: {
        requestId: string;
        fromUserId?: string;
        toUserId?: string;
        canceledBy?: string;
        acceptedBy?: string;
        rejectedBy?: string;
    };
    timestamp: string;
}
