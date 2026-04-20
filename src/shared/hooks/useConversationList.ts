import { useState, useEffect, useCallback } from "react";
import { Conversation } from "../services/conversationService";
import { SocketService } from "../services/socketService";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Raw payload emitted by the backend on "conversation:created" */
interface ConversationCreatedPayload {
    conversation?: Conversation & Record<string, any>;
    // Some backends wrap the object directly at the top level
    _id?: string;
    id?: string;
    type?: string;
    [key: string]: any;
}

export interface UseConversationListState {
    conversations: Conversation[];
    isLoading: boolean;
    error: string | null;
}

export interface UseConversationListActions {
    /** Replace the full list (e.g. after an API fetch) */
    setConversations: (conversations: Conversation[]) => void;
    /** Prepend a single conversation, skipping it when already present */
    addConversation: (conversation: Conversation) => void;
}

export interface UseConversationListReturn {
    state: UseConversationListState;
    actions: UseConversationListActions;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Canonical ID for a Conversation object */
const getConversationId = (c: Conversation): string => c._id || c.id || "";

/**
 * Normalise the raw socket payload into a `Conversation` shape.
 * The backend may send the object nested under `payload.conversation` or
 * directly as the payload root.
 */
const normalisePayload = (
    raw: ConversationCreatedPayload
): Conversation | null => {
    const src: Record<string, any> =
        raw?.conversation ?? raw;

    const id = src._id || src.id;
    if (!id) {
        console.warn(
            "[useConversationList] conversation:created payload missing id:",
            raw
        );
        return null;
    }

    return {
        _id: id,
        id,
        type: (src.type as "PRIVATE" | "GROUP") ?? "GROUP",
        name: src.name,
        members: src.members,
        pairKey: src.pairKey,
        avatarUrl: src.avatarUrl ?? src.avatar ?? "",
        ownerId: src.ownerId,
        adminIds: src.adminIds ?? src.admins ?? [],
        lastMessage: src.lastMessage,
        lastMessageAt: src.lastMessageAt,
        lastMessageStatus: src.lastMessageStatus,
        unreadCount: src.unreadCount ?? 0,
        createdAt: src.createdAt ?? new Date().toISOString(),
        updatedAt: src.updatedAt ?? new Date().toISOString(),
    };
};

/**
 * Prepend `next` to `prev`, skipping it when a conversation with the same id
 * already exists. Returns the same array reference when nothing changes.
 */
const prependUnique = (
    prev: Conversation[],
    next: Conversation
): Conversation[] => {
    const id = getConversationId(next);
    if (!id) return prev;

    const alreadyExists = prev.some((c) => getConversationId(c) === id);
    if (alreadyExists) return prev;

    // Immutable: spread into a new array
    return [next, ...prev];
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manages the conversation list state and subscribes to the
 * `"conversation:created"` socket event to add new conversations in real time.
 *
 * Usage
 * -----
 * ```tsx
 * const { state, actions } = useConversationList();
 *
 * // Seed from an API call:
 * useEffect(() => {
 *   ConversationService.getConversations().then(actions.setConversations);
 * }, []);
 *
 * // Render:
 * <FlatList data={state.conversations} ... />
 * ```
 */
export const useConversationList = (): UseConversationListReturn => {
    const [state, setState] = useState<UseConversationListState>({
        conversations: [],
        isLoading: false,
        error: null,
    });


    // -------------------------------------------------------------------------
    // Actions
    // -------------------------------------------------------------------------

    const setConversations = useCallback((conversations: Conversation[]): void => {
        setState((prev) => ({ ...prev, conversations, error: null }));
    }, []);

    const addConversation = useCallback((conversation: Conversation): void => {
        setState((prev) => ({
            ...prev,
            conversations: prependUnique(prev.conversations, conversation),
        }));
    }, []);

    // -------------------------------------------------------------------------
    // Socket listener: "conversation:created"
    // -------------------------------------------------------------------------

    useEffect(() => {
        const handleConversationCreated = (
            raw: ConversationCreatedPayload
        ): void => {
            console.log("[useConversationList] conversation:created received:", raw);

            const conversation = normalisePayload(raw);
            if (!conversation) return;

            setState((prev) => ({
                ...prev,
                // prependUnique guarantees immutability + no duplicates
                conversations: prependUnique(prev.conversations, conversation),
            }));
        };

        SocketService.onGroupCreated(handleConversationCreated);

        return () => {
            SocketService.offGroupCreated();
        };
    }, []);

    // -------------------------------------------------------------------------
    // Return
    // -------------------------------------------------------------------------

    return {
        state,
        actions: {
            setConversations,
            addConversation,
        },
    };
};
