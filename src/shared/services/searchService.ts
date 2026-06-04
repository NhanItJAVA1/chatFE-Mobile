import { api } from "./api";
import type { Conversation } from "./conversationService";

export type SearchTabKey = "Chats" | "Groups" | "Messages" | "Media" | "Links" | "Files" | "Voice";

export interface GlobalSearchUser {
    id?: string;
    _id?: string;
    displayName?: string;
    name?: string;
    username?: string;
    avatar?: string;
    avatarUrl?: string;
    phone?: string;
    phoneNumber?: string;
    [key: string]: any;
}

export interface GlobalSearchMessage {
    id?: string;
    _id?: string;
    messageId?: string;
    conversationId: string;
    conversationType?: "PRIVATE" | "GROUP" | string;
    conversation?: Conversation;
    text?: string;
    senderId?: string;
    senderName?: string;
    createdAt?: string;
    context?: any[];
    [key: string]: any;
}

export interface GlobalSearchMedia {
    id?: string;
    _id?: string;
    messageId?: string;
    conversationId: string;
    type?: string;
    mediaType?: string;
    mimetype?: string;
    mimeType?: string;
    url?: string;
    name?: string;
    fileName?: string;
    text?: string;
    createdAt?: string;
    [key: string]: any;
}

export interface GlobalSearchLink {
    id?: string;
    _id?: string;
    messageId?: string;
    conversationId: string;
    url: string;
    title?: string;
    description?: string;
    text?: string;
    createdAt?: string;
    [key: string]: any;
}

export interface GlobalSearchResult {
    users: GlobalSearchUser[];
    conversations: Conversation[];
    groups: Conversation[];
    messages: GlobalSearchMessage[];
    media: GlobalSearchMedia[];
    links: GlobalSearchLink[];
    hasMore: boolean;
    nextCursor?: string;
}

export interface GlobalSearchParams {
    query: string;
    type?: "ALL";
    limit?: number;
    contextLimit?: number;
    cursor?: string;
}

const asArray = <T>(value: any): T[] => Array.isArray(value) ? value : [];

export const searchService = {
    async globalSearch(params: GlobalSearchParams): Promise<GlobalSearchResult> {
        const response = await api.get("/search", {
            params: {
                type: "ALL",
                limit: 10,
                contextLimit: 1,
                ...params,
            },
        });

        const payload = response?.data?.data || response?.data || response;

        return {
            users: asArray<GlobalSearchUser>(payload?.users),
            conversations: asArray<Conversation>(payload?.conversations),
            groups: asArray<Conversation>(payload?.groups),
            messages: asArray<GlobalSearchMessage>(payload?.messages),
            media: asArray<GlobalSearchMedia>(payload?.media),
            links: asArray<GlobalSearchLink>(payload?.links),
            hasMore: !!payload?.hasMore,
            nextCursor: payload?.nextCursor,
        };
    },
};

export default searchService;
