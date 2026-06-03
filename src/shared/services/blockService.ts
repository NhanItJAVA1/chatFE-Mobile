import { io, Socket } from "socket.io-client";
import { getApiBaseUrl } from "../runtime";
import { api } from "./api";

const SOCKET_URL = getApiBaseUrl().replace("/v1", "");
const SOCKET_NAMESPACE = "/blocks";

export type BlockedUserSummary = {
    id?: string;
    _id?: string;
    displayName?: string;
    username?: string;
    avatarUrl?: string;
    avatar?: string;
    bio?: string;
    status?: string;
};

export type BlockItem = {
    id: string;
    blockerId?: string;
    blockedUserId: string;
    blockedUser?: BlockedUserSummary | null;
    blockedUserUnavailable?: boolean;
    createdAt?: string;
};

export class BlockService {
    private static socket: Socket | null = null;

    static async blockUser(userId: string): Promise<any> {
        const response = await api.post(`/blocks/${userId}`);
        return response?.data?.data || response?.data || response;
    }

    static async unblockUser(userId: string): Promise<void> {
        await api.delete(`/blocks/${userId}`);
    }

    static async checkBlockStatus(userId: string): Promise<{ isBlocked: boolean }> {
        const response = await api.get(`/blocks/${userId}/check`);
        const data = response?.data?.data || response?.data || response;
        return { isBlocked: !!data?.isBlocked };
    }

    static async listBlocked(params: { page?: number; limit?: number } = {}): Promise<{
        items: BlockItem[];
        total?: number;
        page?: number;
        limit?: number;
        hasMore?: boolean;
    }> {
        const response = await api.get("/blocks", { params: { page: 1, limit: 20, ...params } });
        const data = response?.data?.data || response?.data || response;
        return {
            items: Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [],
            total: data?.total,
            page: data?.page,
            limit: data?.limit,
            hasMore: data?.hasMore,
        };
    }

    static connect(token: string): Socket {
        if (this.socket?.connected) {
            return this.socket;
        }

        if (this.socket) {
            this.socket.disconnect();
        }

        this.socket = io(SOCKET_URL + SOCKET_NAMESPACE, {
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

    static onBlocked(callback: (data: any) => void): void {
        this.socket?.on("block:blocked", callback);
    }

    static onUnblocked(callback: (data: any) => void): void {
        this.socket?.on("block:unblocked", callback);
    }

    static offBlockEvents(): void {
        this.socket?.off("block:blocked");
        this.socket?.off("block:unblocked");
    }
}

export const blockService = BlockService;
