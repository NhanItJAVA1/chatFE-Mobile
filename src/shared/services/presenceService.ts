import { io, Socket } from "socket.io-client";
import { getApiBaseUrl } from "../runtime";
import { api } from "./api";

const SOCKET_URL = getApiBaseUrl().replace("/v1", "");

export type PresenceStatus = {
    userId: string;
    online?: boolean;
    isOnline?: boolean;
    lastSeen?: string | null;
    visibility?: string;
    visible?: boolean;
};

export class PresenceService {
    private static socket: Socket | null = null;

    static connect(token: string): Socket {
        if (this.socket?.connected) {
            return this.socket;
        }

        if (this.socket) {
            this.socket.disconnect();
        }

        this.socket = io(SOCKET_URL, {
            auth: { token },
            extraHeaders: {
                Authorization: `Bearer ${token}`,
            },
            transports: ["websocket"],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
        });

        return this.socket;
    }

    static disconnect(): void {
        this.socket?.disconnect();
        this.socket = null;
    }

    static onOnline(callback: (status: PresenceStatus) => void): void {
        this.socket?.on("user:online", callback);
    }

    static onOffline(callback: (status: PresenceStatus) => void): void {
        this.socket?.on("user:offline", callback);
    }

    static offPresenceEvents(): void {
        this.socket?.off("user:online");
        this.socket?.off("user:offline");
    }

    static getBatchOnlineStatus(userIds: string[]): Promise<Record<string, PresenceStatus>> {
        const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
        if (uniqueIds.length === 0) {
            return Promise.resolve({});
        }

        return new Promise((resolve) => {
            if (!this.socket) {
                resolve({});
                return;
            }

            this.socket.emit("getBatchOnlineStatus", { userIds: uniqueIds }, (response: any) => {
                const payload = response?.data || response?.statuses || response || {};
                const entries = Array.isArray(payload)
                    ? payload.map((item) => [String(item.userId || item.id), item])
                    : Object.entries(payload);

                resolve(
                    entries.reduce<Record<string, PresenceStatus>>((acc, [userId, status]: any) => {
                        if (userId) {
                            acc[String(userId)] = { userId: String(userId), ...(status || {}) };
                        }
                        return acc;
                    }, {})
                );
            });
        });
    }

    static async getUserPresence(userId: string): Promise<PresenceStatus | null> {
        const response = await api.get(`/users/${userId}/presence`);
        return response?.data?.data || response?.data || response || null;
    }
}

export const presenceService = PresenceService;
