import { io, Socket } from "socket.io-client";
import { getApiBaseUrl } from "../runtime";
import { tokenManager } from "./api";
import type { CallType } from "./callService";

const SOCKET_URL = getApiBaseUrl().replace(/\/v1\/?$/, "");
const SOCKET_NAMESPACE = "/v1/calls";

export interface CallSocketPayload {
    callId: string;
    conversationId: string;
    callerId?: string;
    userId?: string;
    type?: CallType;
    conversationType?: "PRIVATE" | "GROUP";
    isGroup?: boolean;
    status?: string;
    roomName?: string;
    livekitProvider?: "self-hosted" | "cloud";
    busyUserIds?: string[];
}

type Handler<T> = (payload: T) => void;

class CallSocketService {
    private socket: Socket | null = null;
    private currentToken: string | null = null;
    private isRefreshingToken = false;

    private isAuthError(error: any): boolean {
        const message = String(error?.message || error || "").toLowerCase();
        return (
            message.includes("authentication") ||
            message.includes("invalid token") ||
            message.includes("jwt") ||
            message.includes("unauthorized")
        );
    }

    private async refreshTokenAndReconnect(): Promise<void> {
        if (this.isRefreshingToken) {
            return;
        }

        this.isRefreshingToken = true;

        try {
            // First check if a newer token is already stored (another refresh may have completed)
            const storedToken = await tokenManager.getAccessToken();
            let nextToken =
                storedToken && storedToken !== this.currentToken
                    ? storedToken
                    : null;

            if (!nextToken) {
                const refreshed = await tokenManager.refreshAccessToken();
                if (!refreshed) {
                    console.error(
                        "[CallSocket] Token refresh failed — cannot reconnect"
                    );
                    return;
                }
                nextToken = await tokenManager.getAccessToken();
            }

            if (!nextToken) {
                console.error(
                    "[CallSocket] No refreshed token available after refresh"
                );
                return;
            }

            console.log("[CallSocket] Token refreshed, reconnecting socket");
            this.currentToken = nextToken;

            if (this.socket) {
                this.socket.auth = { token: nextToken };
                (this.socket.io.opts as any).extraHeaders = {
                    ...((this.socket.io.opts as any).extraHeaders || {}),
                    Authorization: `Bearer ${nextToken}`,
                };
                this.socket.disconnect();
                this.socket.connect();
            }
        } finally {
            this.isRefreshingToken = false;
        }
    }

    async connect() {
        if (this.socket?.connected) {
            return this.socket;
        }

        const token = await tokenManager.getAccessToken();
        this.currentToken = token;

        // Disconnect and clean up any previous socket
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.disconnect();
        }

        this.socket = io(SOCKET_URL + SOCKET_NAMESPACE, {
            auth: { token },
            extraHeaders: token
                ? { Authorization: `Bearer ${token}` }
                : undefined,
            transports: ["websocket", "polling"],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
        });

        this.socket.on("connect_error", (error) => {
            console.error(
                "[CallSocket] Connection error:",
                error?.message || error
            );
            if (this.isAuthError(error)) {
                this.refreshTokenAndReconnect().catch((refreshError) => {
                    console.error(
                        "[CallSocket] Token refresh failed:",
                        refreshError?.message || refreshError
                    );
                });
            }
        });

        return this.socket;
    }

    disconnect() {
        this.socket?.removeAllListeners();
        this.socket?.disconnect();
        this.socket = null;
        this.currentToken = null;
    }

    on<T = CallSocketPayload>(event: string, handler: Handler<T>) {
        this.socket?.on(event, handler as Handler<any>);
        return () => this.socket?.off(event, handler as Handler<any>);
    }

    joinCallRoom(callId: string) {
        this.socket?.emit("call:join", { callId });
    }

    leaveCallRoom(callId: string) {
        this.socket?.emit("call:leave", { callId });
    }
}

export const callSocket = new CallSocketService();
