import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { ConversationService, Conversation } from "../services/conversationService";
import { SocketService, MessagePayload, TypingData } from "../services/socketService";
import { useAuth } from "./useAuth";
import { saveMessagesToCache, loadMessagesFromCache } from "../utils/cacheUtils";
import { useScrollToMessage } from "./useScrollToMessage";

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
 * Build a userId → name lookup map.
 *
 * Priority (per user id):
 *  1. userList entry (displayName or name) — authoritative roster from the conversation
 *  2. senderName carried on a message — fallback only for IDs absent from userList
 */
const buildUserMap = (
    messages: MessagePayload[],
    userList?: Array<{ id: string; displayName?: string; name?: string }>
): Record<string, string> => {
    const map: Record<string, string> = {};

    // Seed from messages first (lowest priority)
    for (const msg of messages) {
        if (msg.senderId && msg.senderName && !map[msg.senderId]) {
            map[msg.senderId] = msg.senderName;
        }
    }

    // userList overwrites — displayName takes precedence over name
    if (Array.isArray(userList)) {
        for (const user of userList) {
            if (!user.id) continue;
            const name = user.displayName || user.name;
            if (name) {
                map[user.id] = name;
            }
        }
    }

    return map;
};

/**
 * Build a messageId → MessagePayload lookup map in O(n).
 */
const buildMessageMap = (
    messages: MessagePayload[]
): Record<string, MessagePayload> => {
    const map: Record<string, MessagePayload> = {};
    for (const msg of messages) {
        const id = msg._id || msg.id;
        if (id) {
            map[id] = msg;
        }
    }
    return map;
};

/**
 * Enrich every message that has a quotedMessageId with a fully-resolved
 * `quotedMessage` object.
 *
 * senderName resolution order:
 *  1. msg.quotedMessageSenderName              (field sent by the backend)
 *  2. userMap[msg.quotedMessageSenderId]       (O(1) lookup)
 *  3. userMap[msg.quotedMessageData?.senderId] (fallback via quotedMessageData)
 *  4. messageMap[msg.quotedMessageId]?.senderName (O(1) lookup — may be absent
 *     when the quoted message was sent before the current pagination window)
 *  5. "Unknown"
 *
 * Critical: priorities 1–3 work even when the quoted message is NOT in the
 * current message page (cursor pagination edge-case).
 *
 * Guarantees:
 *  - Immutable: original objects are never mutated.
 *  - O(n): no .find() or nested loops.
 *  - senderName is always a non-empty string.
 */
const enrichMessagesWithQuotedData = (
    messages: MessagePayload[],
    userList?: Array<{ id: string; displayName?: string; name?: string }>,
    fetchedCache?: Record<string, MessagePayload>
): MessagePayload[] => {
    const userMap = buildUserMap(messages, userList);
    const messageMap = buildMessageMap(messages);

    return messages.map((msg): MessagePayload => {
        if (msg.type === "system") {
            return {
                ...msg,
                senderName: "System",
                quotedMessage: undefined
            };
        }

        if (!msg.quotedMessageId) {
            return msg;
        }

        // --- Resolve quoted text ---
        // Use || (not ??) so that empty-string values also fall through
        const quotedText: string =
            msg.quotedMessagePreview ||
            (msg as any).quotedMessageData?.text ||
            messageMap[msg.quotedMessageId]?.text ||
            "";

        // --- Resolve sender name (priority chain) ---
        // Priority 3 covers the cursor-pagination edge-case where the quoted
        // message itself is not present in the current page.
        const quotedDataSenderId: string | undefined = (msg as any).quotedMessageData?.senderId;
        const quotedSenderId = msg.quotedMessageSenderId || quotedDataSenderId;

        let msgSenderName = msg.quotedMessageSenderName;
        if (msgSenderName === "Unknown") msgSenderName = undefined;

        let quotedDataSenderName = (msg as any).quotedMessageData?.senderName;
        if (quotedDataSenderName === "Unknown") quotedDataSenderName = undefined;

        const resolvedSenderName: string | undefined =
            msgSenderName ||
            quotedDataSenderName ||
            (quotedSenderId ? userMap[quotedSenderId] : undefined) ||
            messageMap[msg.quotedMessageId]?.senderName ||
            fetchedCache?.[msg.quotedMessageId]?.senderName;

        const resolvedSenderId: string =
            quotedSenderId ||
            messageMap[msg.quotedMessageId]?.senderId ||
            fetchedCache?.[msg.quotedMessageId]?.senderId ||
            "";

        const textFromCache = fetchedCache?.[msg.quotedMessageId]?.text || (fetchedCache?.[msg.quotedMessageId]?.media?.length ? "[Media]" : "");
        const finalQuotedText = msg.quotedMessage?.text || quotedText || textFromCache || "Tin nhắn đã bị xóa";

        // Build a fresh quotedMessage — never mutate existing object.
        const enrichedQuotedMessage = {
            ...(msg.quotedMessage ?? {}),
            text: finalQuotedText,
            senderId: msg.quotedMessage?.senderId || resolvedSenderId,
            media: msg.quotedMessage?.media || fetchedCache?.[msg.quotedMessageId]?.media || [],
        };

        // Always overwrite stale data: If senderName is missing, or is "Unknown" (from a previous bad enrich), overwrite it.
        const currentSenderName = msg.quotedMessage?.senderName;
        if (!currentSenderName || currentSenderName === "Unknown" || resolvedSenderName) {
            // Assign resolvedSenderName (which might be undefined, allowing UI to fallback)
            enrichedQuotedMessage.senderName = resolvedSenderName;
        }

        console.log("RESOLVE NAME", {
            senderId: quotedSenderId,
            fromUserMap: quotedSenderId ? userMap[quotedSenderId] : undefined,
            final: resolvedSenderName
        });

        // Debug: verify senderName is populated after enrich
        console.log("ENRICHED MESSAGE", {
            quotedMessageId: msg.quotedMessageId,
            quotedMessage: enrichedQuotedMessage,
        });

        return {
            ...msg,
            quotedMessage: enrichedQuotedMessage,
        };
    });
};

export interface UseChatMessageState {
    conversation: Conversation | null;
    messages: MessagePayload[];
    isLoading: boolean;
    /** True while older pages are being fetched (pagination) */
    loadingMore: boolean;
    isSending: boolean;
    error: string | null;
    typingUsers: Set<string>;
    hasMoreMessages: boolean;
    nextCursor: string | null;
    pinnedMessages: MessagePayload[];
    pinnedMessageIndex: number;
    replyingTo: MessagePayload | null;
    /** ID of the message currently lit up after a scroll-to, or null */
    highlightedMessageId: string | null;
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
    /** Scroll the FlatList to the given message and briefly highlight it */
    scrollToMessage: (messageId: string) => Promise<boolean>;
}

export interface UseChatMessageReturn {
    state: UseChatMessageState;
    actions: UseChatMessageActions;
    /** Ref to attach to the <FlatList> so scrollToMessage can control it */
    flatListRef: ReturnType<typeof useScrollToMessage>["flatListRef"];
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

export interface NormalizedPinnedMessage {
    id: string;
    text: string;
    senderId: string;
    senderName: string;
    createdAt: string;
    media: any[];
}

export const normalizePinnedMessages = (
    rawPinnedMessages: Array<any>,
    conversationMembers?: Array<any>
): NormalizedPinnedMessage[] => {
    const userMap: Record<string, string> = {};
    if (Array.isArray(conversationMembers)) {
        for (const member of conversationMembers) {
            const uid = member.id || member.userId;
            if (uid) {
                userMap[uid] = member.displayName || member.name || "Unknown";
            }
        }
    }

    return rawPinnedMessages.map((pin) => {
        // Handle BE format {conversationId, message: {...}} vs raw message payload
        const msg = pin.message || pin;
        const senderId = msg.senderId;
        
        const resolvedName = (senderId ? userMap[senderId] : undefined) || "Unknown";

        return {
            id: msg._id || msg.id || "",
            text: msg.text || "",
            senderId: senderId,
            senderName: resolvedName,
            createdAt: msg.createdAt,
            media: msg.media || [],
        };
    });
};

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
        loadingMore: false,
        isSending: false,
        error: null,
        typingUsers: new Set(),
        hasMoreMessages: false,
        nextCursor: null,
        pinnedMessages: [],
        pinnedMessageIndex: 0,
        replyingTo: null,
        highlightedMessageId: null,
    });

    const fetchMissingMessage = useCallback(async (messageId: string): Promise<boolean> => {
        try {
            const message = await ConversationService.getMessageById(messageId);
            if (message && message._id) {
                // Ensure message gets to state directly
                setState((prev) => {
                    const merged = mergeUniqueMessages([message], prev.messages);
                    return {
                        ...prev,
                        messages: enrichMessagesWithQuotedData(merged, prev.conversation?.members as any)
                    };
                });
                return true;
            }
            return false;
        } catch (error) {
            console.error("Failed to fetch target reply message:", error);
            return false;
        }
    }, []);

    const {
        flatListRef,
        highlightedMessageId,
        scrollToMessage,
        buildMessageIndexMap,
    } = useScrollToMessage({
        fetchMissingMessage
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

                // Persist to in-memory + async cache
                if (newState.conversation) {
                    const conversationId = newState.conversation._id || newState.conversation.id;
                    conversationCache.set(conversationId, {
                        conversation: newState.conversation,
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

    const fetchedMissingMessagesCache = useRef<Record<string, MessagePayload>>({});
    const fetchingIds = useRef<Set<string>>(new Set());

    useEffect(() => {
        const messages = state.messages;
        if (!messages.length) return;

        const localMap = buildMessageMap(messages);
        const missingIds = new Set<string>();

        for (const msg of messages) {
            if (
                msg.quotedMessageId &&
                !localMap[msg.quotedMessageId] &&
                !fetchedMissingMessagesCache.current[msg.quotedMessageId] &&
                !fetchingIds.current.has(msg.quotedMessageId)
            ) {
                missingIds.add(msg.quotedMessageId);
            }
        }

        if (missingIds.size > 0) {
            const idsToFetch = Array.from(missingIds);
            idsToFetch.forEach(id => fetchingIds.current.add(id));

            Promise.all(
                idsToFetch.map(id =>
                    ConversationService.getMessageById(id).catch(() => null)
                )
            ).then(responses => {
                let hasNew = false;
                responses.forEach(res => {
                    if (res) {
                        const id = res._id || res.id;
                        if (id) {
                            fetchedMissingMessagesCache.current[id] = res;
                            hasNew = true;
                        }
                    }
                });

                if (hasNew) {
                    setState(prev => {
                        const members: any[] = (prev.conversation as any)?.members ?? [];
                        const reEnriched = enrichMessagesWithQuotedData(
                            prev.messages,
                            members,
                            fetchedMissingMessagesCache.current
                        );
                        return { ...prev, messages: reEnriched };
                    });
                }
            });
        }
    }, [state.messages]);

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

            // Keep scroll-index map fresh after every addMessages call
            buildMessageIndexMap(newMessages);

            return newState;
        });
    }, [buildMessageIndexMap]);

    // Keep scroll-index map fresh whenever messages change
    useEffect(() => {
        buildMessageIndexMap(state.messages);
    }, [state.messages, buildMessageIndexMap]);

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
        if (
            !state.conversation ||
            state.isLoading ||
            state.loadingMore ||
            !state.hasMoreMessages
        ) {
            return;
        }

        setState((prev) => ({ ...prev, loadingMore: true }));

        try {
            const conversationId = state.conversation._id || state.conversation.id;
            if (!conversationId) {
                throw new Error("No conversation ID available");
            }

            const response = await ConversationService.loadMessages(
                conversationId,
                state.nextCursor,
                MESSAGE_LIMIT
            );

            const fetchedMessages = Array.isArray(response.items) ? response.items : [];

            setState((prev) => {
                // Enrich new page using the combined userList from the conversation members
                const members: Array<{ id: string; displayName?: string; name?: string }> =
                    (prev.conversation as any)?.members ?? [];

                // Older messages prepended in front so they appear above the existing ones
                // (FlatList is inverted, newest = index-0)
                const combined = [...fetchedMessages, ...prev.messages];
                const deduped = mergeUniqueMessages(fetchedMessages, prev.messages);
                const enriched = enrichMessagesWithQuotedData(deduped, members);

                const newState = {
                    ...prev,
                    messages: enriched,
                    hasMoreMessages: response.hasMore ?? false,
                    nextCursor: response.nextCursor ?? null,
                    loadingMore: false,
                };

                // Persist to in-memory + async cache
                if (prev.conversation) {
                    const convId = prev.conversation._id || prev.conversation.id;
                    conversationCache.set(convId, {
                        conversation: prev.conversation,
                        messages: enriched,
                        hasMoreMessages: newState.hasMoreMessages,
                        nextCursor: newState.nextCursor,
                    });
                    saveMessagesToCache(convId, enriched).catch((err) =>
                        console.error("[useGroupChatMessage] loadMore cache error:", err)
                    );
                }

                return newState;
            });
        } catch (error: any) {
            console.error("[useGroupChatMessage] loadMoreMessages error:", error);
            setState((prev) => ({ ...prev, loadingMore: false }));
        }
    }, [
        state.conversation,
        state.isLoading,
        state.loadingMore,
        state.hasMoreMessages,
        state.nextCursor,
        updateStateAndCache,
    ]);

    const editMessage = useCallback(
        async (messageId: string, text: string) => {
            if (!state.conversation) return;
            if (messageId.startsWith("temp-")) throw new Error("Vui lòng đợi tin nhắn được gửi thành công");

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
            if (messageId.startsWith("temp-")) throw new Error("Vui lòng đợi tin nhắn được gửi thành công");

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
            if (messageId.startsWith("temp-")) throw new Error("Vui lòng đợi tin nhắn được gửi thành công");

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
            if (messageId.startsWith("temp-")) throw new Error("Vui lòng đợi tin nhắn được gửi thành công");

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
            if (messageId.startsWith("temp-")) throw new Error("Vui lòng đợi tin nhắn được gửi thành công");

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
            if (messageId.startsWith("temp-")) throw new Error("Vui lòng đợi tin nhắn được gửi thành công");
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
            if (messageId.startsWith("temp-")) throw new Error("Vui lòng đợi tin nhắn được gửi thành công");
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
            if (quotedMessageId.startsWith("temp-")) throw new Error("Vui lòng đợi tin nhắn được gửi thành công");
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

                // Load messages (cursor = null → newest page)
                const response = await ConversationService.loadMessages(
                    conversationId,
                    null,
                    MESSAGE_LIMIT
                );
                const newMessages = Array.isArray(response.items) ? response.items : [];
                const mergedMessages = mergeUniqueMessages(newMessages, cachedMessages);

                // Extract member roster for authoritative senderName resolution.
                // Members may carry displayName (profile) or name (legacy).
                const members: Array<{ id: string; displayName?: string; name?: string }> =
                    (conversation as any)?.members ?? [];

                const enrichedMessages = enrichMessagesWithQuotedData(mergedMessages, members);

                clearTimeout(timeoutId);

                updateStateAndCache({
                    conversation,
                    messages: enrichedMessages,
                    hasMoreMessages: response.hasMore ?? false,
                    nextCursor: response.nextCursor ?? null,
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

    // Keep the scroll-index map in sync whenever messages change
    useEffect(() => {
        buildMessageIndexMap(state.messages);
    }, [state.messages, buildMessageIndexMap]);

    // Mirror the external highlight state back into the shared state shape
    useEffect(() => {
        setState((prev) => ({ ...prev, highlightedMessageId }));
    }, [highlightedMessageId]);

    const returnState = useMemo(() => {
        const normalizedPins = normalizePinnedMessages(
            state.pinnedMessages,
            (state.conversation as any)?.members
        );

        return {
            ...state,
            pinnedMessages: normalizedPins as any, // Cast as we're overriding to the normalized type
        };
    }, [state]);

    return {
        state: returnState,
        flatListRef,
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
            scrollToMessage,
        },
    };
};
