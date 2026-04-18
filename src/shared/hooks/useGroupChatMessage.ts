import { useState, useEffect, useCallback, useRef } from "react";
import { ConversationService, Conversation } from "../services/conversationService";
import { SocketService, MessagePayload, TypingData } from "../services/socketService";
import { useAuth } from "./useAuth";
import { saveMessagesToCache, loadMessagesFromCache } from "../utils/cacheUtils";

const getMessageId = (message: MessagePayload): string => {
    return message._id || message.id || `${message.senderId}-${message.createdAt}`;
};

const mergeUniqueMessages = (
    incoming: MessagePayload[],
    existing: MessagePayload[]
): MessagePayload[] => {
    const merged = [...incoming, ...existing];
    const unique = new Map<string, MessagePayload>();
    merged.forEach((message) => {
        unique.set(getMessageId(message), message);
    });
    return Array.from(unique.values());
};

export interface UseChatMessageState {
    conversation: Conversation | null;
    messages: MessagePayload[];
    isLoading: boolean;
    isSending: boolean;
    error: string | null;
    typingUsers: Set<string>;
    hasMoreMessages: boolean;
    nextCursor: string | null;
}

export interface UseChatMessageActions {
    sendMessage: (text: string, media?: any[]) => Promise<void>;
    addMessages: (messages: MessagePayload[]) => void;
    markAsSeen: (messageIds: string[]) => Promise<void>;
    handleTyping: () => void;
    stopTyping: () => void;
    loadMoreMessages: () => Promise<void>;
    editMessage: (messageId: string, text: string) => Promise<void>;
    deleteMessage: (messageId: string) => Promise<void>;
    revokeMessage: (messageId: string) => Promise<void>;
    addReaction: (messageId: string, emoji: string) => Promise<void>;
    removeReaction: (messageId: string, emoji: string) => Promise<void>;
    retryLoadConversation: () => Promise<void>;
}

export interface UseChatMessageReturn {
    state: UseChatMessageState;
    actions: UseChatMessageActions;
}

const MESSAGE_LIMIT = 30;
const TYPING_DEBOUNCE_TIME = 3000;

/**
 * Persistent cache for conversations to prevent message loss on exit/re-entry
 */
const conversationCache = new Map<string, {
    conversation: Conversation;
    messages: MessagePayload[];
    hasMoreMessages: boolean;
    nextCursor: string | null;
}>();

/**
 * Custom hook for managing group chat messages
 * @param groupId - The group/conversation ID
 * @param token - Auth token
 */
export const useGroupChatMessage = (groupId: string, token: string): UseChatMessageReturn => {
    const { user } = useAuth();
    const [state, setState] = useState<UseChatMessageState>({
        conversation: null,
        messages: [],
        isLoading: true,
        isSending: false,
        error: null,
        typingUsers: new Set(),
        hasMoreMessages: false,
        nextCursor: null,
    });

    const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const messagesStateRef = useRef(state);

    // Update ref when state changes
    useEffect(() => {
        messagesStateRef.current = state;
    }, [state]);

    const updateStateAndCache = useCallback(
        (updates: Partial<UseChatMessageState>) => {
            setState((prev) => {
                const newState = { ...prev, ...updates };

                // Save to cache
                if (prev.conversation) {
                    const conversationId = prev.conversation._id || prev.conversation.id;
                    conversationCache.set(conversationId, {
                        conversation: prev.conversation,
                        messages: newState.messages,
                        hasMoreMessages: newState.hasMoreMessages,
                        nextCursor: newState.nextCursor,
                    });

                    saveMessagesToCache(conversationId, newState.messages).catch((error) => {
                        console.error("[useGroupChatMessage] Failed to save messages to cache:", error);
                    });
                }

                return newState;
            });
        },
        []
    );

    // Use mergeUniqueMessages to merge new and existing messages

    /**
     * Add messages directly to state
     */
    const addMessages = useCallback((messages: MessagePayload[]) => {
        if (!messages.length) {
            return;
        }

        setState((prev) => {
            const newMessages = mergeUniqueMessages(messages, prev.messages);
            const newState = {
                ...prev,
                messages: newMessages,
            };

            if (prev.conversation) {
                const conversationId = prev.conversation._id || prev.conversation.id;
                conversationCache.set(conversationId, {
                    conversation: prev.conversation,
                    messages: newMessages,
                    hasMoreMessages: prev.hasMoreMessages,
                    nextCursor: prev.nextCursor,
                });

                saveMessagesToCache(conversationId, newMessages).catch((error) => {
                    console.error("[useGroupChatMessage] Failed to save messages after direct add:", error);
                });
            }

            return newState;
        });
    }, []);

    /**
     * Send message to group
     */
    const sendMessage = useCallback(
        async (text: string, media?: any[]) => {
            if (!state.conversation || !text.trim()) {
                return;
            }

            setState((prev) => ({ ...prev, isSending: true, error: null }));

            try {
                stopTyping();

                const messages = await SocketService.sendMessage(
                    state.conversation._id || state.conversation.id,
                    text.trim(),
                    media
                );

                updateStateAndCache({
                    messages: mergeUniqueMessages(messages, state.messages),
                    isSending: false,
                });
            } catch (error: any) {
                setState((prev) => ({
                    ...prev,
                    error: error.message || "Failed to send message",
                    isSending: false,
                }));
            }
        },
        [state.conversation, state.messages, updateStateAndCache]
    );

    /**
     * Mark messages as seen
     */
    const lastMarkedMessageId = useRef<string>("");
    const markAsSeenTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    const markAsSeen = useCallback(
        async (messageIds: string[]) => {
            if (!state.conversation || !messageIds.length) return;

            const conversationId = state.conversation._id || state.conversation.id;
            const lastId = messageIds[messageIds.length - 1];

            if (lastMarkedMessageId.current === lastId) return;

            lastMarkedMessageId.current = lastId;

            if (markAsSeenTimeout.current) {
                clearTimeout(markAsSeenTimeout.current);
            }

            markAsSeenTimeout.current = setTimeout(async () => {
                try {
                    await SocketService.markMessagesSeen(conversationId, lastId);
                } catch (error) {
                    console.error("[useGroupChatMessage] Failed to mark as seen:", error);
                }
            }, 500);
        },
        [state.conversation]
    );

    const stopTyping = useCallback(() => {
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = null;
        }

        if (state.conversation) {
            SocketService.stopTyping(
                state.conversation._id || state.conversation.id
            );
        }
    }, [state.conversation]);

    const handleTyping = useCallback(() => {
        if (!state.conversation) return;

        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }

        SocketService.startTyping(
            state.conversation._id || state.conversation.id
        );

        typingTimeoutRef.current = setTimeout(() => {
            stopTyping();
        }, TYPING_DEBOUNCE_TIME);
    }, [state.conversation, stopTyping]);

    const loadMoreMessages = useCallback(async () => {
        if (!state.conversation || state.isLoading || !state.hasMoreMessages) {
            return;
        }

        setState((prev) => ({ ...prev, isLoading: true }));

        try {
            const conversationId = state.conversation._id || state.conversation.id;
            if (!conversationId) {
                throw new Error("No conversation ID available");
            }
            const response = await ConversationService.loadMessages(
                conversationId,
                state.nextCursor || undefined,
                MESSAGE_LIMIT
            );

            const newMessages = Array.isArray(response.items) ? response.items : [];
            const mergedMessages = mergeUniqueMessages(newMessages, state.messages);

            updateStateAndCache({
                messages: mergedMessages,
                hasMoreMessages: response.hasMore ?? false,
                nextCursor: response.nextCursor || null,
                isLoading: false,
            });
        } catch (error: any) {
            console.error("[useGroupChatMessage] Load more error:", error);
            setState((prev) => ({ ...prev, isLoading: false }));
        }
    }, [state.conversation, state.isLoading, state.hasMoreMessages, state.nextCursor, state.messages, updateStateAndCache]);

    const editMessage = useCallback(
        async (messageId: string, text: string) => {
            if (!state.conversation) return;

            try {
                await SocketService.editMessage(
                    state.conversation._id || state.conversation.id,
                    messageId,
                    text
                );
            } catch (error) {
                console.error("[useGroupChatMessage] Edit error:", error);
                throw error;
            }
        },
        [state.conversation]
    );

    const deleteMessage = useCallback(
        async (messageId: string) => {
            if (!state.conversation) return;

            try {
                await SocketService.deleteMessage(
                    state.conversation._id || state.conversation.id,
                    messageId
                );
            } catch (error) {
                console.error("[useGroupChatMessage] Delete error:", error);
                throw error;
            }
        },
        [state.conversation]
    );

    const revokeMessage = useCallback(
        async (messageId: string) => {
            if (!state.conversation) return;

            try {
                await SocketService.revokeMessage(
                    state.conversation._id || state.conversation.id,
                    messageId
                );
            } catch (error) {
                console.error("[useGroupChatMessage] Revoke error:", error);
                throw error;
            }
        },
        [state.conversation]
    );

    const addReaction = useCallback(
        async (messageId: string, emoji: string) => {
            if (!state.conversation) return;

            try {
                await SocketService.addReaction(
                    state.conversation._id || state.conversation.id,
                    messageId,
                    emoji
                );
            } catch (error) {
                console.error("[useGroupChatMessage] Add reaction error:", error);
                throw error;
            }
        },
        [state.conversation]
    );

    const removeReaction = useCallback(
        async (messageId: string, emoji: string) => {
            if (!state.conversation) return;

            try {
                await SocketService.removeReaction(
                    state.conversation._id || state.conversation.id,
                    messageId,
                    emoji
                );
            } catch (error) {
                console.error("[useGroupChatMessage] Remove reaction error:", error);
                throw error;
            }
        },
        [state.conversation]
    );

    const retryLoadConversation = useCallback(async () => {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        try {
            const conversation = await ConversationService.getGroupDetail(groupId);
            const conversationId = conversation._id || conversation.id;

            // Try to load from cache
            let cachedMessages = await loadMessagesFromCache(conversationId);

            const response = await ConversationService.loadMessages(conversationId, undefined, MESSAGE_LIMIT);
            const newMessages = Array.isArray(response.items) ? response.items : [];

            const mergedMessages = mergeUniqueMessages(newMessages, cachedMessages);

            updateStateAndCache({
                conversation,
                messages: mergedMessages,
                hasMoreMessages: response.hasMore ?? false,
                nextCursor: response.nextCursor || null,
                isLoading: false,
            });
        } catch (error: any) {
            console.error("[useGroupChatMessage] Retry load conversation error:", error);
            setState((prev) => ({
                ...prev,
                error: error.message || "Failed to load conversation",
                isLoading: false,
            }));
        }
    }, [groupId, updateStateAndCache]);

    // Load conversation on mount
    useEffect(() => {
        if (!groupId || !token) {
            const errorMsg = `Missing ${!groupId ? "groupId" : "token"}`;
            console.error("[useGroupChatMessage]", errorMsg);
            setState((prev) => ({
                ...prev,
                error: errorMsg,
                isLoading: false,
            }));
            return;
        }

        const timeoutId = setTimeout(() => {
            console.warn("[useGroupChatMessage] Loading timeout after 5s");
            setState((prev) => ({
                ...prev,
                isLoading: false,
                error: prev.error || "Tải tin nhắn lâu quá - vui lòng thử lại",
            }));
        }, 5000);

        loadingTimeoutRef.current = timeoutId;

        (async () => {
            try {
                // Connect socket if not already connected
                SocketService.connect(token);
                await SocketService.waitForConnection(5000);

                // Load group conversation using group endpoint
                const conversation = await ConversationService.getGroupDetail(groupId);
                const conversationId = conversation._id || conversation.id;

                if (!conversationId) {
                    const errorMsg = `Failed to get conversation ID from response: ${JSON.stringify(conversation)}`;
                    console.error("[useGroupChatMessage]", errorMsg);
                    throw new Error(errorMsg);
                }

                // Try cache first
                let cachedMessages = await loadMessagesFromCache(conversationId);

                // Load messages from server
                const response = await ConversationService.loadMessages(conversationId, undefined, MESSAGE_LIMIT);
                const newMessages = Array.isArray(response.items) ? response.items : [];

                const mergedMessages = mergeUniqueMessages(newMessages, cachedMessages);

                clearTimeout(timeoutId);

                updateStateAndCache({
                    conversation,
                    messages: mergedMessages,
                    hasMoreMessages: response.hasMore ?? false,
                    nextCursor: response.nextCursor || null,
                    isLoading: false,
                });

                // Setup socket listeners for group messages
                SocketService.onMessage((message: MessagePayload) => {
                    if ((message.conversationId === conversationId || message.conversationId === groupId) && messagesStateRef.current) {
                        const merged = mergeUniqueMessages([message], messagesStateRef.current.messages);
                        updateStateAndCache({ messages: merged });
                    }
                });

                SocketService.onTyping((data: TypingData) => {
                    if (data.conversationId === conversationId && data.userId !== user?._id) {
                        setState((prev) => {
                            const newTypingUsers = new Set(prev.typingUsers);
                            if (data.isTyping) {
                                newTypingUsers.add(data.userId);
                            } else {
                                newTypingUsers.delete(data.userId);
                            }
                            return { ...prev, typingUsers: newTypingUsers };
                        });
                    }
                });
            } catch (error: any) {
                console.error("[useGroupChatMessage] Error loading conversation:", error);
                clearTimeout(timeoutId);
                setState((prev) => ({
                    ...prev,
                    error: error.message || "Failed to load conversation",
                    isLoading: false,
                }));
            }
        })();

        return () => {
            clearTimeout(timeoutId);
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }
            SocketService.offMessage();
            SocketService.offTyping();
        };
    }, [groupId, token, user?._id, updateStateAndCache]);

    return {
        state,
        actions: {
            sendMessage,
            addMessages,
            markAsSeen,
            handleTyping,
            stopTyping,
            loadMoreMessages,
            editMessage,
            deleteMessage,
            revokeMessage,
            addReaction,
            removeReaction,
            retryLoadConversation,
        },
    };
};
