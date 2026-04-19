import { useState, useEffect, useCallback, useRef } from "react";
import { ConversationService, Conversation } from "../services/conversationService";
import { SocketService, MessagePayload, TypingData } from "../services/socketService";
import { useAuth } from "./useAuth";
import { saveMessagesToCache, loadMessagesFromCache } from "../utils/cacheUtils";

const getMessageId = (message: MessagePayload): string => {
    return message._id || message.id || `${message.senderId}-${message.createdAt}`;
};

const getMessageTimestamp = (message: MessagePayload): number => {
    const parsedTime = Date.parse(message.updatedAt || message.createdAt || "");
    return Number.isFinite(parsedTime) ? parsedTime : 0;
};

const mergeUniqueMessages = (
    incoming: MessagePayload[],
    existing: MessagePayload[]
): MessagePayload[] => {
    const merged = [...incoming, ...existing];
    const unique = new Map<string, { message: MessagePayload; index: number }>();
    merged.forEach((message, index) => {
        unique.set(getMessageId(message), { message, index });
    });

    return Array.from(unique.values())
        .sort((left, right) => {
            const timeDiff = getMessageTimestamp(right.message) - getMessageTimestamp(left.message);
            if (timeDiff !== 0) {
                return timeDiff;
            }

            return left.index - right.index;
        })
        .map((entry) => entry.message);
};

/**
 * Build user map from messages for lookup by senderId
 */
const buildUserMap = (messages: MessagePayload[]): Record<string, string> => {
    const userMap: Record<string, string> = {};
    messages.forEach(msg => {
        if (msg.senderId && msg.senderName && !userMap[msg.senderId]) {
            userMap[msg.senderId] = msg.senderName;
        }
    });
    return userMap;
};

/**
 * Enrich messages by populating quotedMessage with BE data or user map lookup
 * Priority: quotedMessageSenderName (BE) → userMap lookup by quotedMessageSenderId → message lookup
 */
const enrichMessagesWithQuotedData = (messages: MessagePayload[]): MessagePayload[] => {
    // Build user map from all messages for quick lookup by senderId
    const userMap = buildUserMap(messages);

    return messages.map(msg => {
        // If message has quotedMessageId, ensure quotedMessage object exists and has proper data
        if (msg.quotedMessageId) {
            // Try multiple sources for sender name, in priority order
            let quotedSenderName = msg.quotedMessageSenderName;  // 1. From BE response
            let quotedText = msg.quotedMessagePreview;

            // 2. Lookup by quotedMessageSenderId in user map
            if (!quotedSenderName && msg.quotedMessageSenderId) {
                quotedSenderName = userMap[msg.quotedMessageSenderId];
                console.log('[enrichMessagesWithQuotedData] Lookup user by senderId:', {
                    quotedMessageSenderId: msg.quotedMessageSenderId,
                    foundName: quotedSenderName,
                });
            }

            // 3. Fallback to lookup original message by ID
            if (!quotedSenderName) {
                const quotedMsg = messages.find(m => (m._id || m.id) === msg.quotedMessageId);
                if (quotedMsg) {
                    quotedSenderName = quotedMsg.senderName;
                    quotedText = quotedText || quotedMsg.text;
                }
            }

            if (!msg.quotedMessage) {
                // Build quotedMessage from available data
                msg.quotedMessage = {
                    text: quotedText || "",
                    senderName: quotedSenderName || "Unknown",
                    senderId: msg.quotedMessageSenderId,
                    media: [],
                } as any;
            } else {
                // Update existing quotedMessage with resolved data
                if (quotedSenderName && !msg.quotedMessage.senderName) {
                    msg.quotedMessage.senderName = quotedSenderName;
                } else if (!msg.quotedMessage.senderName) {
                    msg.quotedMessage.senderName = "Unknown";
                }

                if (msg.quotedMessageSenderId && !msg.quotedMessage.senderId) {
                    msg.quotedMessage.senderId = msg.quotedMessageSenderId;
                }

                if (quotedText && !msg.quotedMessage.text) {
                    msg.quotedMessage.text = quotedText;
                }
            }

            console.log('[enrichMessagesWithQuotedData] Enriched quoted message:', {
                quotedMessageId: msg.quotedMessageId,
                senderName: msg.quotedMessage.senderName,
                fromBE: msg.quotedMessageSenderName,
                fromUserMap: msg.quotedMessageSenderId ? userMap[msg.quotedMessageSenderId] : 'N/A',
                senderId: msg.quotedMessageSenderId,
            });
        }
        return msg;
    });
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
    pinnedMessages: MessagePayload[];
    pinnedMessageIndex: number;
    replyingTo: MessagePayload | null;
}

export interface UseChatMessageActions {
    sendMessage: (text: string, media?: any[]) => Promise<void>;
    sendQuotedMessage: (quotedMessageId: string, text: string, media?: any[]) => Promise<void>;
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
    pinMessage: (messageId: string) => Promise<void>;
    unpinMessage: (messageId: string) => Promise<void>;
    navigatePinnedMessages: (direction: "prev" | "next") => void;
    setReplyingTo: (message: MessagePayload | null) => void;
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
        pinnedMessages: [],
        pinnedMessageIndex: 0,
        replyingTo: null,
    });

    const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const messagesStateRef = useRef(state);

    const getMessageId = useCallback((message: MessagePayload): string => {
        return message._id || message.id || `${message.senderId}-${message.createdAt}`;
    }, []);

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
            const merged = mergeUniqueMessages(messages, prev.messages);
            const newMessages = enrichMessagesWithQuotedData(merged);
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
                const updated = await SocketService.editMessage(messageId, text);

                updateStateAndCache({
                    messages: state.messages.map((msg) =>
                        getMessageId(msg) === messageId
                            ? { ...msg, ...(updated || {}), text, updatedAt: new Date().toISOString() }
                            : msg
                    ),
                });
            } catch (error) {
                console.error("[useGroupChatMessage] Edit error:", error);
                throw error;
            }
        },
        [state.conversation, state.messages, updateStateAndCache, getMessageId]
    );

    const deleteMessage = useCallback(
        async (messageId: string) => {
            if (!state.conversation) return;

            try {
                await SocketService.deleteMessage(messageId);
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
                await SocketService.revokeMessage(messageId);
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
                await SocketService.addReaction(messageId, emoji);
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
                await SocketService.removeReaction(messageId, emoji);
            } catch (error) {
                console.error("[useGroupChatMessage] Remove reaction error:", error);
                throw error;
            }
        },
        [state.conversation]
    );

    /**
     * Pin message (admin only for groups)
     */
    const pinMessage = useCallback(async (messageId: string) => {
        try {
            if (!state.conversation) {
                throw new Error("No conversation loaded");
            }
            const conversationId = state.conversation._id || state.conversation.id;

            await SocketService.pinMessage(conversationId, messageId);
            console.log('[useGroupChatMessage] Pin message action completed');
        } catch (error: any) {
            setState((prev) => ({
                ...prev,
                error: error.message || "Failed to pin message",
            }));
        }
    }, [state.conversation]);

    /**
     * Unpin message (admin only for groups)
     */
    const unpinMessage = useCallback(async (messageId: string) => {
        let previousPinnedMessages = [...state.pinnedMessages];
        let previousIndex = state.pinnedMessageIndex;

        try {
            if (!state.conversation) {
                throw new Error("No conversation loaded");
            }
            const conversationId = state.conversation._id || state.conversation.id;

            // Optimistically remove from pinned messages
            setState((prev) => {
                const filtered = prev.pinnedMessages.filter(
                    (m) => (m._id || m.id) !== messageId
                );
                return {
                    ...prev,
                    pinnedMessages: filtered,
                    pinnedMessageIndex: Math.min(
                        prev.pinnedMessageIndex,
                        Math.max(0, filtered.length - 1)
                    ),
                };
            });

            await SocketService.unpinMessage(conversationId, messageId);
            console.log('[useGroupChatMessage] Unpin message action completed');
        } catch (error: any) {
            const errorMsg = error?.message || "Failed to unpin message";
            const isNotPinnedError = errorMsg.includes("not pinned") || error?.status === 400;

            // If "not pinned" error, it's fine - message was already unpinned elsewhere
            if (!isNotPinnedError) {
                // Rollback optimistic update for other errors
                setState((prev) => ({
                    ...prev,
                    pinnedMessages: previousPinnedMessages,
                    pinnedMessageIndex: previousIndex,
                    error: errorMsg,
                }));
                throw new Error(errorMsg);
            }

            // For "not pinned" error, keep the removal (message wasn't pinned anyway)
            console.log('[useGroupChatMessage] Message was not pinned on backend, but removal succeeded');
        }
    }, [state.conversation, state.pinnedMessages, state.pinnedMessageIndex]);

    /**
     * Navigate between pinned messages
     */
    const navigatePinnedMessages = useCallback((direction: "prev" | "next") => {
        setState((prev) => {
            const pinnedCount = prev.pinnedMessages.length;
            if (pinnedCount <= 1) return prev;

            let newIndex = prev.pinnedMessageIndex;
            if (direction === "next") {
                newIndex = (newIndex + 1) % pinnedCount;
            } else {
                newIndex = newIndex === 0 ? pinnedCount - 1 : newIndex - 1;
            }

            return {
                ...prev,
                pinnedMessageIndex: newIndex,
            };
        });
    }, []);

    /**
     * Send quoted/reply message
     */
    const sendQuotedMessage = useCallback(async (quotedMessageId: string, text: string, media?: any[]) => {
        try {
            if (!state.conversation) {
                throw new Error("No conversation loaded");
            }

            if (!text.trim() && (!media || media.length === 0)) {
                throw new Error("Message cannot be empty");
            }

            const conversationId = state.conversation._id || state.conversation.id;
            setState((prev) => ({ ...prev, isSending: true }));

            console.log('[useGroupChatMessage] sendQuotedMessage:', {
                conversationId,
                quotedMessageId,
                textLength: text.length,
            });

            const messages = await SocketService.sendQuotedMessage(
                conversationId,
                quotedMessageId,
                text.trim(),
                media
            );

            setState((prev) => {
                const merged = mergeUniqueMessages(messages || [], prev.messages);
                const newMessages = enrichMessagesWithQuotedData(merged);

                // Save to cache
                if (prev.conversation) {
                    const convId = prev.conversation._id || prev.conversation.id;
                    saveMessagesToCache(convId, newMessages).catch((error) => {
                        console.error('[useGroupChatMessage] Failed to save quoted message to cache:', error);
                    });
                }

                return {
                    ...prev,
                    messages: newMessages,
                    isSending: false,
                    replyingTo: null,
                };
            });
        } catch (error: any) {
            setState((prev) => ({
                ...prev,
                isSending: false,
                error: error.message || "Failed to send quoted message",
            }));
        }
    }, [state.conversation]);

    /**
     * Set message to reply to
     */
    const setReplyingTo = useCallback((message: MessagePayload | null) => {
        setState((prev) => ({
            ...prev,
            replyingTo: message,
        }));
    }, []);

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

                // Join conversation room to receive edit/revoke/delete group events reliably.
                await SocketService.joinConversation(conversationId);

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
                        const enriched = enrichMessagesWithQuotedData(merged);
                        console.log('[useGroupChatMessage] onMessage - enriched quoted fields:', {
                            quotedMessageId: message.quotedMessageId,
                            quotedMessageSenderName: message.quotedMessageSenderName,
                        });
                        updateStateAndCache({ messages: enriched });
                    }
                });

                SocketService.onMessageUpdated((message: MessagePayload) => {
                    if ((message.conversationId && message.conversationId !== conversationId && message.conversationId !== groupId) || !messagesStateRef.current) {
                        return;
                    }

                    const messageId = getMessageId(message);
                    const currentUserId = user?.id || (user as any)?._id;
                    const deletedForMe =
                        Array.isArray((message as any).deletedForUserIds) &&
                        !!currentUserId &&
                        (message as any).deletedForUserIds.includes(currentUserId);

                    const updatedMessages = deletedForMe
                        ? messagesStateRef.current.messages.filter((msg) => getMessageId(msg) !== messageId)
                        : messagesStateRef.current.messages.map((msg) =>
                            getMessageId(msg) !== messageId ? msg : { ...msg, ...message }
                        );

                    updateStateAndCache({ messages: updatedMessages });
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

                // Pinned message listener
                SocketService.onPinnedMessage((data: any) => {
                    console.log('[useGroupChatMessage] Pinned message event:', data);

                    setState((prev) => {
                        if (data.type === "pinned") {
                            const pinnedMsg = data.pinnedMessage?.message || data.pinnedMessage;
                            // Add to pinned messages if not already there
                            const exists = prev.pinnedMessages.some(
                                (m) => getMessageId(m) === getMessageId(pinnedMsg)
                            );
                            if (!exists) {
                                return {
                                    ...prev,
                                    pinnedMessages: [pinnedMsg, ...prev.pinnedMessages],
                                    pinnedMessageIndex: 0,
                                };
                            }
                        } else if (data.type === "unpinned") {
                            const unpinnedMsgId = data.pinnedMessage?.id || data.pinnedMessage?._id;
                            const filtered = prev.pinnedMessages.filter(
                                (m) => (m._id || m.id) !== unpinnedMsgId
                            );
                            return {
                                ...prev,
                                pinnedMessages: filtered,
                                pinnedMessageIndex: Math.min(
                                    prev.pinnedMessageIndex,
                                    Math.max(0, filtered.length - 1)
                                ),
                            };
                        }
                        return prev;
                    });
                });

                // Load pinned messages
                try {
                    const pinnedMsgs = await SocketService.getPinnedMessages(conversationId);
                    setState((prev) => ({
                        ...prev,
                        pinnedMessages: pinnedMsgs || [],
                        pinnedMessageIndex: 0,
                    }));
                    console.log('[useGroupChatMessage] Loaded', pinnedMsgs?.length || 0, 'pinned messages');
                } catch (error: any) {
                    console.warn('[useGroupChatMessage] Failed to load pinned messages:', error.message);
                }
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
            SocketService.offMessageUpdated();
            SocketService.offTyping();
            SocketService.offPinnedMessage();
        };
    }, [groupId, token, user?._id, updateStateAndCache]);

    return {
        state,
        actions: {
            sendMessage,
            sendQuotedMessage,
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
            pinMessage,
            unpinMessage,
            navigatePinnedMessages,
            setReplyingTo,
            retryLoadConversation,
        },
    };
};
