import { useState, useEffect, useCallback, useRef } from "react";
import { ConversationService, Conversation } from "../services/conversationService";
import { SocketService, MessagePayload, TypingData } from "../services/socketService";
import { useAuth } from "./useAuth";
import { saveMessagesToCache, loadMessagesFromCache, mergeMessages } from "../utils/cacheUtils";

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
 * Maps conversationId -> { conversation, messages, hasMoreMessages, nextCursor }
 */
const conversationCache = new Map<string, {
    conversation: Conversation;
    messages: MessagePayload[];
    hasMoreMessages: boolean;
    nextCursor: string | null;
}>();

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

/**
 * Custom hook for managing chat messages and real-time communication
 * @param friendId - ID of the friend/user to chat with
 * @param token - JWT auth token
 * @returns {UseChatMessageReturn} State and actions for chat management
 */
export const useChatMessage = (friendId: string, token: string): UseChatMessageReturn => {
    const { user } = useAuth();

    // State
    const [state, setState] = useState<UseChatMessageState>({
        conversation: null,
        messages: [],
        isLoading: false,
        isSending: false,
        error: null,
        typingUsers: new Set(),
        hasMoreMessages: true,
        nextCursor: null,
    });

    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const messageListenerActiveRef = useRef(false);
    const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    /**
     * Initialize conversation and Socket.IO
     */
    const initializeConversation = useCallback(async () => {
        console.log('[useChat] ===== initializeConversation CALLED =====');
        console.log('[useChat] friendId:', friendId);

        if (!friendId || !token) {
            console.warn('[useChat] Missing friendId or token:', {
                friendIdPresent: !!friendId,
                tokenPresent: !!token,
                tokenValue: token ? `${token.substring(0, 20)}...` : 'MISSING',
            });
            setState((prev) => ({
                ...prev,
                error: "Missing friendId or token",
            }));
            return;
        }

        setState((prev) => ({
            ...prev,
            isLoading: true,
            error: null,
        }));

        // Set timeout to ensure loading always stops (5 seconds max)
        const timeoutId = setTimeout(() => {
            console.warn('[useChat] Loading timeout after 5s');
            setState((prev) => ({
                ...prev,
                isLoading: false,
                error: prev.error || "Tải tin nhắn lâu quá - vui lòng thử lại",
            }));
        }, 5000);

        loadingTimeoutRef.current = timeoutId;

        try {
            // Step 1: Connect Socket.IO
            console.log('[useChat] Step 1: Connecting socket with token...');
            console.log('[useChat] Token to pass:', token ? `${token.substring(0, 20)}...` : 'MISSING');
            SocketService.connect(token);

            // Wait for actual connection
            console.log('[useChat] Step 1b: Waiting for socket connection...');
            await SocketService.waitForConnection(5000);
            console.log('[useChat] Step 1b: Socket connected!');

            // Step 2: Create/get conversation
            console.log('[useChat] Step 2: Getting/creating conversation...');
            const conversation = await ConversationService.getOrCreatePrivateConversation(
                friendId
            );
            const conversationId = conversation._id || conversation.id;
            console.log('[useChat] Step 2: Got conversation:', {
                id: conversationId,
                type: conversation.type,
                friendIdParam: friendId,
                pairKey: conversation.pairKey,
            });

            // Step 3: Load initial messages
            console.log('[useChat] Step 3: Loading messages from API...');
            const messagesResponse = await ConversationService.loadMessages(
                conversation._id || conversation.id,
                null,
                MESSAGE_LIMIT
            );

            console.log('[useChat] Step 3: API Messages loaded:', {
                itemsCount: messagesResponse?.items?.length || 0,
                hasMore: messagesResponse?.hasMore,
                nextCursor: !!messagesResponse?.nextCursor,
                firstMessageSender: messagesResponse?.items?.[0]?.senderId,
                firstMessageText: messagesResponse?.items?.[0]?.text?.substring(0, 30),
                apiConversationId: conversation._id || conversation.id,
                requestedFriendId: friendId,
            });

            // Clear timeout since loading succeeded
            if (loadingTimeoutRef.current) {
                clearTimeout(loadingTimeoutRef.current);
                loadingTimeoutRef.current = null;
            }

            // Step 4: Join conversation room
            console.log('[useChat] Step 4: Joining conversation...');
            await SocketService.joinConversation(
                conversation._id || conversation.id
            );
            console.log('[useChat] Step 4: Joined conversation');

            // Step 3a: Load from cache FIRST (for immediate display)
            console.log('[useChat] Step 3a: Loading from cache...');
            let cachedMessages: MessagePayload[] = [];
            try {
                cachedMessages = await loadMessagesFromCache(conversationId);
                console.log('[useChat] ✓ Step 3a: Loaded', cachedMessages.length, 'messages from cache');
                if (cachedMessages.length > 0) {
                    console.log('[useChat] Cache first message sender:', cachedMessages[0].senderId);
                    console.log('[useChat] Cache first message text:', cachedMessages[0].text?.substring(0, 30));
                }
            } catch (error) {
                console.error('[useChat] Failed to load from cache:', error);
            }

            // Step 3b: Load from API
            const loadedMessages: MessagePayload[] = (messagesResponse?.items || []) as MessagePayload[];
            const hasMore = messagesResponse?.hasMore ?? (loadedMessages.length >= MESSAGE_LIMIT);
            const nextCursor = messagesResponse?.nextCursor ?? null;

            // Step 3c: Merge messages intelligently
            let finalMessages: MessagePayload[] = loadedMessages;
            console.log('[useChat] Step 3c: Before merge:');
            console.log('[useChat]   loadedMessages.length:', loadedMessages.length);
            console.log('[useChat]   cachedMessages.length:', cachedMessages.length);

            if (loadedMessages.length === 0 && cachedMessages.length > 0) {
                // API returned nothing, use cache
                console.log('[useChat] API empty, using cached messages');
                finalMessages = cachedMessages;
            } else if (loadedMessages.length > 0 && cachedMessages.length > 0) {
                // Both have data, merge smart
                console.log('[useChat] Merging API + cache messages');
                finalMessages = mergeMessages(loadedMessages, cachedMessages);
                console.log('[useChat] After merge, count:', finalMessages.length);
            }

            console.log('[useChat] Step 3c: After merge, finalMessages.length:', finalMessages.length);

            console.log('[useChat] ====== ABOUT TO SET STATE ======');
            console.log('[useChat] conversationId:', conversationId);
            console.log('[useChat] friendId:', friendId);
            console.log('[useChat] finalMessages count:', finalMessages.length);
            console.log('[useChat] hasMore:', hasMore);
            if (finalMessages.length > 0) {
                console.log('[useChat] FINAL first message sender:', finalMessages[0].senderId);
                console.log('[useChat] FINAL first message text:', finalMessages[0].text?.substring(0, 30));
            }

            setState((prev) => {
                const newState = {
                    ...prev,
                    conversation,
                    messages: finalMessages,
                    isLoading: false,
                    hasMoreMessages: hasMore,
                    nextCursor,
                };
                console.log('[useChat] ====== STATE UPDATED ======');
                console.log('[useChat] new conversationId:', newState.conversation?._id || newState.conversation?.id);
                console.log('[useChat] new messages count:', newState.messages.length);
                if (newState.messages.length > 0) {
                    console.log('[useChat] STATE first message sender:', newState.messages[0].senderId);
                    console.log('[useChat] STATE first message text:', newState.messages[0].text?.substring(0, 30));
                }
                return newState;
            });

            // Step 3d: Save final messages to cache
            try {
                await saveMessagesToCache(conversationId, finalMessages);
            } catch (error) {
                console.error('[useChat] Failed to save to cache:', error);
            }

            // Save to in-memory cache too
            conversationCache.set(conversationId, {
                conversation,
                messages: finalMessages,
                hasMoreMessages: hasMore,
                nextCursor,
            });
            console.log('[useChat] Saved to in-memory cache. Size:', conversationCache.size);

            // Step 5: Setup Socket.IO event listeners
            console.log('[useChat] Step 5: Setting up socket listeners...');
            setupSocketListeners(conversationId);
            console.log('[useChat] Step 5: Socket listeners ready');
        } catch (error: any) {
            console.error('[useChat] Initialize error:', error);

            // Clear timeout on error
            if (loadingTimeoutRef.current) {
                clearTimeout(loadingTimeoutRef.current);
                loadingTimeoutRef.current = null;
            }

            console.log('[useChat] ====== ERROR - SETTING isLoading to FALSE ======');
            setState((prev) => {
                const newState = {
                    ...prev,
                    error: error.message || "Failed to initialize chat",
                    isLoading: false,
                };
                console.log('[useChat] new isLoading:', newState.isLoading);
                console.log('[useChat] new error:', newState.error);
                return newState;
            });
        }
    }, [friendId, token]);

    /**
     * Setup Socket.IO event listeners
     */
    const setupSocketListeners = useCallback(
        (conversationId: string) => {
            console.log('[useChat] ===== setupSocketListeners CALLED =====');
            console.log('[useChat] conversationId:', conversationId);
            console.log('[useChat] messageListenerActiveRef.current:', messageListenerActiveRef.current);

            if (messageListenerActiveRef.current) {
                console.log('[useChat] ⚠️ Listeners already active, skipping setup - THIS IS WRONG!');
                return;
            }

            // Incoming messages
            SocketService.onMessage((message: MessagePayload) => {
                const incomingConversationId = message.conversationId || (message as any)?.conversationId;
                console.log('[useChat] !!!!! RECEIVED MESSAGE LISTENER FIRED !!!!!', {
                    incomingConversationId,
                    currentConversationId: conversationId,
                    messageText: message.text?.substring(0, 50),
                    matches: incomingConversationId === conversationId,
                });

                if (incomingConversationId && incomingConversationId !== conversationId) {
                    console.log('[useChat] ⚠️ Message from DIFFERENT conversation! Ignoring.');
                    console.log('[useChat]   Expected:', conversationId);
                    console.log('[useChat]   Got:', incomingConversationId);
                    return;
                }

                console.log('[useChat] ✓ Message is for current conversation, adding to state');
                setState((prev) => {
                    const newState = {
                        ...prev,
                        messages: mergeUniqueMessages([message], prev.messages),
                    };
                    // Update cache with new message (both in-memory and device storage)
                    if (prev.conversation) {
                        const conversationId = prev.conversation._id || prev.conversation.id;
                        conversationCache.set(conversationId, {
                            conversation: prev.conversation,
                            messages: newState.messages,
                            hasMoreMessages: prev.hasMoreMessages,
                            nextCursor: prev.nextCursor,
                        });

                        // Also save to AsyncStorage
                        saveMessagesToCache(conversationId, newState.messages).catch((error) => {
                            console.error('[useChat] Failed to save message to cache:', error);
                        });
                    }
                    return newState;
                });
            });

            // Message seen events
            SocketService.onMessageSeen((data) => {
                if (data.conversationId !== conversationId) {
                    return;
                }

                setState((prev) => ({
                    ...prev,
                    messages: prev.messages.map((msg) => {
                        const msgId = getMessageId(msg);
                        const seenMsgId = data.lastSeenMessageId;

                        // Mark the specific message and all messages from the same sender before it as seen
                        if (msgId === seenMsgId) {
                            return { ...msg, status: "seen" };
                        }

                        // Also mark earlier messages from same sender as seen
                        const msgIndex = prev.messages.findIndex((m) => getMessageId(m) === seenMsgId);
                        const currentIndex = prev.messages.findIndex((m) => getMessageId(m) === msgId);

                        if (
                            msg.senderId === data.userId &&
                            msgIndex !== -1 &&
                            currentIndex < msgIndex
                        ) {
                            return { ...msg, status: "seen" };
                        }

                        return msg;
                    }),
                }));
            });

            // Typing indicators
            SocketService.onTyping((data: TypingData) => {
                if (data.conversationId !== conversationId) {
                    return;
                }

                setState((prev) => {
                    const newTypingUsers = new Set(prev.typingUsers);
                    if (data.isTyping) {
                        newTypingUsers.add(data.userId);
                    } else {
                        newTypingUsers.delete(data.userId);
                    }
                    return { ...prev, typingUsers: newTypingUsers };
                });
            });

            // Message updates (edit, delete, revoke)
            SocketService.onMessageUpdated((message: any) => {
                if (message.conversationId && message.conversationId !== conversationId) {
                    return;
                }

                console.log('[useChat] Socket message:updated event:', {
                    messageId: getMessageId(message),
                    text: message.text?.substring(0, 50),
                    conversationId: message.conversationId
                });

                setState((prev) => {
                    const messageId = getMessageId(message);
                    const currentUserId = user?.id || (user as any)?._id;
                    const deletedForMe =
                        Array.isArray((message as any).deletedForUserIds) &&
                        !!currentUserId &&
                        (message as any).deletedForUserIds.includes(currentUserId);

                    const mergedMessages = prev.messages.map((msg) => {
                        if (getMessageId(msg) !== messageId) {
                            return msg;
                        }

                        // Keep original message fields if socket payload is minimal
                        return {
                            ...msg,
                            ...message,
                        };
                    });

                    const newState = {
                        ...prev,
                        messages: deletedForMe
                            ? prev.messages.filter((msg) => getMessageId(msg) !== messageId)
                            : mergedMessages,
                    };
                    // Update cache with updated message (both in-memory and device storage)
                    if (prev.conversation) {
                        const conversationId = prev.conversation._id || prev.conversation.id;
                        conversationCache.set(conversationId, {
                            conversation: prev.conversation,
                            messages: newState.messages,
                            hasMoreMessages: prev.hasMoreMessages,
                            nextCursor: prev.nextCursor,
                        });

                        // Also save to AsyncStorage
                        saveMessagesToCache(conversationId, newState.messages).catch((error) => {
                            console.error('[useChat] Failed to save updated message to cache:', error);
                        });
                    }
                    return newState;
                });
            });

            console.log('[useChat] ====== ALL LISTENERS SET UP ======');
            messageListenerActiveRef.current = true;
            console.log('[useChat] messageListenerActiveRef set to true');
        },
        [user]
    );

    /**
     * Update both state and cache
     */
    const updateStateAndCache = useCallback((updates: Partial<UseChatMessageState>) => {
        setState((prev) => {
            const newState = { ...prev, ...updates };
            // Update cache if conversation exists
            if (newState.conversation) {
                const conversationId = newState.conversation._id || newState.conversation.id;
                conversationCache.set(conversationId, {
                    conversation: newState.conversation,
                    messages: newState.messages,
                    hasMoreMessages: newState.hasMoreMessages,
                    nextCursor: newState.nextCursor,
                });
            }
            return newState;
        });
    }, []);

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
                    console.error('[useChat] Failed to save messages after direct add:', error);
                });
            }

            return newState;
        });
    }, []);

    /**
     * Send message
     */
    const sendMessage = useCallback(
        async (text: string, media?: any[]) => {
            if (!state.conversation || !text.trim()) {
                return;
            }

            setState((prev) => ({ ...prev, isSending: true, error: null }));

            try {
                // Stop typing indicator
                stopTyping();

                // Send message via Socket.IO
                const messages = await SocketService.sendMessage(
                    state.conversation._id || state.conversation.id,
                    text.trim(),
                    media
                );

                // Optimistically merge sent messages. If socket echo arrives, dedupe prevents duplicates.
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
    // Track last marked message ID to avoid duplicate calls
    const lastMarkedMessageId = useRef<string>("");
    const markAsSeenTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    const markAsSeen = useCallback(
        async (messageIds: string[]) => {
            if (!state.conversation || messageIds.length === 0) {
                return;
            }

            const conversationId = state.conversation._id || state.conversation.id;
            const lastId = messageIds[messageIds.length - 1];

            // Skip if same message already marked
            if (lastMarkedMessageId.current === lastId) {
                return;
            }

            // Debounce: clear previous timeout and set new one
            if (markAsSeenTimeout.current) {
                clearTimeout(markAsSeenTimeout.current);
            }

            markAsSeenTimeout.current = setTimeout(async () => {
                try {
                    // Only use Socket for marking as seen (no double HTTP call)
                    // Socket is realtime and 2-way, so HTTP is redundant
                    await SocketService.markMessagesSeen(conversationId, lastId);
                    lastMarkedMessageId.current = lastId;
                } catch (error: any) {
                    console.error('[useChat] Error marking messages as seen:', error);
                    // Silently fail
                }
            }, 500);
        },
        [state.conversation]
    );

    // Cleanup timeouts on unmount
    useEffect(() => {
        return () => {
            if (markAsSeenTimeout.current) {
                clearTimeout(markAsSeenTimeout.current);
            }
        };
    }, []);

    /**
     * Handle typing (with debounce)
     */
    const handleTyping = useCallback(() => {
        if (!state.conversation) return;

        SocketService.startTyping(state.conversation._id || state.conversation.id);

        // Auto-stop after TYPING_DEBOUNCE_TIME
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }

        typingTimeoutRef.current = setTimeout(() => {
            SocketService.stopTyping(state.conversation!._id || state.conversation!.id);
        }, TYPING_DEBOUNCE_TIME);
    }, [state.conversation]);

    /**
     * Stop typing
     */
    const stopTyping = useCallback(() => {
        if (!state.conversation) return;

        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }

        SocketService.stopTyping(state.conversation._id || state.conversation.id);
    }, [state.conversation]);

    /**
     * Load more messages (pagination)
     */
    const loadMoreMessages = useCallback(
        async () => {
            if (!state.conversation || !state.hasMoreMessages) {
                return;
            }

            try {
                const response = await ConversationService.loadMessages(
                    state.conversation._id || state.conversation.id,
                    state.nextCursor,
                    MESSAGE_LIMIT
                );

                setState((prev) => {
                    const newState = {
                        ...prev,
                        messages: mergeUniqueMessages(prev.messages, response.items || []),
                        hasMoreMessages: response.hasMore || false,
                        nextCursor: response.nextCursor || null,
                    };

                    // Save updated messages to cache
                    if (prev.conversation) {
                        const conversationId = prev.conversation._id || prev.conversation.id;
                        saveMessagesToCache(conversationId, newState.messages).catch((error) => {
                            console.error('[useChat] Failed to save loaded messages to cache:', error);
                        });
                    }

                    return newState;
                });
            } catch (error: any) {
                setState((prev) => ({
                    ...prev,
                    error: error.message || "Failed to load more messages",
                }));
            }
        },
        [state.conversation, state.hasMoreMessages, state.nextCursor]
    );

    /**
     * Edit message
     */
    const editMessage = useCallback(
        async (messageId: string, text: string) => {
            try {
                if (!text.trim()) {
                    throw new Error("Message cannot be empty");
                }

                const updated = await SocketService.editMessage(messageId, text.trim());

                setState((prev) => ({
                    ...prev,
                    messages: prev.messages.map((msg) =>
                        getMessageId(msg) === messageId
                            ? { ...msg, ...updated, updatedAt: new Date().toISOString() }
                            : msg
                    ),
                }));
            } catch (error: any) {
                setState((prev) => ({
                    ...prev,
                    error: error.message || "Failed to edit message",
                }));
            }
        },
        []
    );

    /**
     * Delete message
     */
    const deleteMessage = useCallback(async (messageId: string) => {
        try {
            await SocketService.deleteMessage(messageId);

            setState((prev) => {
                const newMessages = prev.messages.filter((msg) => getMessageId(msg) !== messageId);

                // Update cache to persist deletion
                if (prev.conversation) {
                    const conversationId = prev.conversation._id || prev.conversation.id;
                    conversationCache.set(conversationId, {
                        conversation: prev.conversation,
                        messages: newMessages,
                        hasMoreMessages: prev.hasMoreMessages,
                        nextCursor: prev.nextCursor,
                    });

                    saveMessagesToCache(conversationId, newMessages).catch((error) => {
                        console.error('[useChat] Failed to save cache after delete:', error);
                    });
                }

                return {
                    ...prev,
                    messages: newMessages,
                };
            });
        } catch (error: any) {
            setState((prev) => ({
                ...prev,
                error: error.message || "Failed to delete message",
            }));
        }
    }, []);

    /**
     * Revoke message (delete for everyone)
     */
    const revokeMessage = useCallback(async (messageId: string) => {
        try {
            await SocketService.revokeMessage(messageId);

            setState((prev) => {
                const newMessages = prev.messages.map((msg) =>
                    getMessageId(msg) === messageId
                        ? {
                            ...msg,
                            text: "Đã thu hồi",
                            media: null,
                            type: "system" as const,
                            deletedAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                        }
                        : msg
                );

                // Update cache to persist revoke
                if (prev.conversation) {
                    const conversationId = prev.conversation._id || prev.conversation.id;
                    conversationCache.set(conversationId, {
                        conversation: prev.conversation,
                        messages: newMessages,
                        hasMoreMessages: prev.hasMoreMessages,
                        nextCursor: prev.nextCursor,
                    });

                    saveMessagesToCache(conversationId, newMessages).catch((error) => {
                        console.error('[useChat] Failed to save cache after revoke:', error);
                    });
                }

                return {
                    ...prev,
                    messages: newMessages,
                };
            });
        } catch (error: any) {
            setState((prev) => ({
                ...prev,
                error: error.message || "Failed to revoke message",
            }));
        }
    }, []);

    /**
     * Add reaction to message
     */
    const addReaction = useCallback(async (messageId: string, emoji: string) => {
        try {
            const reaction = await SocketService.addReaction(messageId, emoji);

            setState((prev) => ({
                ...prev,
                messages: prev.messages.map((msg) =>
                    getMessageId(msg) === messageId
                        ? {
                            ...msg,
                            reactions: [...(msg.reactions || []), reaction],
                        }
                        : msg
                ),
            }));
        } catch (error: any) {
            // Silently fail
        }
    }, []);

    /**
     * Remove reaction from message
     */
    const removeReaction = useCallback(async (messageId: string, emoji: string) => {
        try {
            await SocketService.removeReaction(messageId, emoji);

            setState((prev) => ({
                ...prev,
                messages: prev.messages.map((msg) =>
                    getMessageId(msg) === messageId
                        ? {
                            ...msg,
                            reactions: (msg.reactions || []).filter(
                                (r: any) => r.emoji !== emoji
                            ),
                        }
                        : msg
                ),
            }));
        } catch (error: any) {
            // Silently fail
        }
    }, []);

    /**
     * Retry loading conversation
     */
    const retryLoadConversation = useCallback(async () => {
        await initializeConversation();
    }, [initializeConversation]);

    /**
     * Initialize on mount
     */
    useEffect(() => {
        console.log('[useChat] ===== useEffect TRIGGERED =====');
        console.log('[useChat] Dependencies changed - friendId:', friendId, 'token:', !!token);

        initializeConversation();

        return () => {
            console.log('[useChat] ===== CLEANUP RUNNING =====');
            console.log('[useChat] Cleaning up for conversationId:', state.conversation?._id || state.conversation?.id);

            // Cleanup timeouts
            if (loadingTimeoutRef.current) {
                clearTimeout(loadingTimeoutRef.current);
                loadingTimeoutRef.current = null;
            }
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }

            // Cleanup socket
            if (state.conversation) {
                SocketService.leaveConversation(
                    state.conversation._id || state.conversation.id
                ).catch(() => { });
            }
            SocketService.offMessage();
            SocketService.offMessageSeen();
            SocketService.offTyping();
            SocketService.offMessageUpdated();

            messageListenerActiveRef.current = false;
            console.log('[useChat] messageListenerActiveRef.current set to FALSE');
        };
    }, [friendId, token]);

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

export default useChatMessage;
