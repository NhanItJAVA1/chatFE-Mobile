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

    async connect() {
        if (this.socket?.connected) {
            return this.socket;
        }

        const token = await tokenManager.getAccessToken();
        this.socket = io(SOCKET_URL + SOCKET_NAMESPACE, {
            auth: { token },
            extraHeaders: token ? { Authorization: `Bearer ${token}` } : undefined,
            transports: ["websocket", "polling"],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
        });

        this.socket.on("connect_error", (error) => {
            console.error("[CallSocket] Connection error:", error?.message || error);
        });

        return this.socket;
    }

    disconnect() {
        this.socket?.removeAllListeners();
        this.socket?.disconnect();
        this.socket = null;
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
