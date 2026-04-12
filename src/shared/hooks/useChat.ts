import { useState, useEffect, useCallback, useRef } from "react";
import { ConversationService, Conversation, MessagePage, MessageResponse } from "../services/conversationService";
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
    currentPage: number;
}

export interface UseChatMessageActions {
    sendMessage: (text: string, media?: any[]) => Promise<void>;
    markAsSeen: (messageIds: string[]) => Promise<void>;
    handleTyping: () => void;
    stopTyping: () => void;
    loadMoreMessages: (page: number) => Promise<void>;
    editMessage: (messageId: string, text: string) => Promise<void>;
    deleteMessage: (messageId: string) => Promise<void>;
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
 * Maps conversationId -> { conversation, messages, hasMoreMessages, currentPage }
 */
const conversationCache = new Map<string, {
    conversation: Conversation;
    messages: MessagePayload[];
    hasMoreMessages: boolean;
    currentPage: number;
}>();

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
        currentPage: 1,
    });

    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const messageListenerActiveRef = useRef(false);
    const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    /**
     * Initialize conversation and Socket.IO
     */
    const initializeConversation = useCallback(async () => {
        if (!friendId || !token) {
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
            const socket = SocketService.connect(token);

            // Step 2: Create/get conversation
            const conversation = await ConversationService.getOrCreatePrivateConversation(
                friendId
            );

            // Step 3: Load initial messages
            const messagesResponse = await ConversationService.loadMessages(
                conversation._id || conversation.id,
                1,
                MESSAGE_LIMIT
            );

            console.log('[useChat] Messages loaded from API:', messagesResponse);

            // Clear timeout since loading succeeded
            if (loadingTimeoutRef.current) {
                clearTimeout(loadingTimeoutRef.current);
                loadingTimeoutRef.current = null;
            }

            // Step 4: Join conversation room
            await SocketService.joinConversation(
                conversation._id || conversation.id
            );

            // Update state with initial data
            const conversationId = conversation._id || conversation.id;

            // Step 3a: Load from cache FIRST (for immediate display)
            console.log('[useChat] Loading from cache...');
            let cachedMessages: MessagePayload[] = [];
            try {
                cachedMessages = await loadMessagesFromCache(conversationId);
                console.log('[useChat] ✓ Loaded', cachedMessages.length, 'messages from cache');
            } catch (error) {
                console.error('[useChat] Failed to load from cache:', error);
            }

            // Step 3b: Load from API
            let loadedMessages = messagesResponse?.items || [];
            const hasMore = messagesResponse?.hasMore ?? (loadedMessages.length >= MESSAGE_LIMIT);

            // Step 3c: Merge messages intelligently
            let finalMessages = loadedMessages;
            if (loadedMessages.length === 0 && cachedMessages.length > 0) {
                // API returned nothing, use cache
                console.log('[useChat] API empty, using', cachedMessages.length, 'cached messages');
                finalMessages = cachedMessages;
            } else if (loadedMessages.length > 0 && cachedMessages.length > 0) {
                // Both have data, merge smart
                console.log('[useChat] Merging API + cache messages');
                finalMessages = mergeMessages(loadedMessages, cachedMessages);
            }

            console.log('[useChat] ====== ABOUT TO SET STATE (with cache) ======');
            console.log('[useChat] finalMessages count:', finalMessages.length);
            console.log('[useChat] hasMore:', hasMore);

            setState((prev) => {
                const newState = {
                    ...prev,
                    conversation,
                    messages: finalMessages,
                    isLoading: false,
                    hasMoreMessages: hasMore,
                    currentPage: 1,
                };
                console.log('[useChat] ====== STATE UPDATED ======');
                console.log('[useChat] new messages count:', newState.messages.length);
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
                currentPage: 1,
            });
            console.log('[useChat] Saved to in-memory cache. Size:', conversationCache.size);

            // Step 5: Setup Socket.IO event listeners
            console.log('[useChat] About to call setupSocketListeners...');
            setupSocketListeners(conversationId);
            console.log('[useChat] setupSocketListeners completed');
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
            console.log('[useChat] setupSocketListeners called for conversationId:', conversationId);
            console.log('[useChat] messageListenerActiveRef.current:', messageListenerActiveRef.current);

            if (messageListenerActiveRef.current) {
                console.log('[useChat] Listeners already active, skipping setup');
                return;
            }

            // Incoming messages
            SocketService.onMessage((message: MessagePayload) => {
                console.log('[useChat] Received message:', {
                    text: message.text?.substring(0, 50),
                    hasMedia: !!message.media,
                    mediaCount: message.media?.length,
                    mediaTypes: message.media?.map((m: any) => m.mediaType),
                });
                setState((prev) => {
                    const newState = {
                        ...prev,
                        messages: [message, ...prev.messages],
                    };
                    // Update cache with new message (both in-memory and device storage)
                    if (prev.conversation) {
                        const conversationId = prev.conversation._id || prev.conversation.id;
                        conversationCache.set(conversationId, {
                            conversation: prev.conversation,
                            messages: newState.messages,
                            hasMoreMessages: prev.hasMoreMessages,
                            currentPage: prev.currentPage,
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
                setState((prev) => ({
                    ...prev,
                    messages: prev.messages.map((msg) =>
                        msg._id === data.lastSeenMessageId || msg.createdAt === data.lastSeenMessageId
                            ? { ...msg, status: "seen" }
                            : msg
                    ),
                }));
            });

            // Typing indicators
            SocketService.onTyping((data: TypingData) => {
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

            // Message updates (edit, delete)
            SocketService.onMessageUpdated((message: any) => {
                setState((prev) => {
                    const newState = {
                        ...prev,
                        messages: prev.messages.map((msg) =>
                            msg._id === message._id ? message : msg
                        ),
                    };
                    // Update cache with updated message (both in-memory and device storage)
                    if (prev.conversation) {
                        const conversationId = prev.conversation._id || prev.conversation.id;
                        conversationCache.set(conversationId, {
                            conversation: prev.conversation,
                            messages: newState.messages,
                            hasMoreMessages: prev.hasMoreMessages,
                            currentPage: prev.currentPage,
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
        []
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
                    currentPage: newState.currentPage,
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
                const message = await SocketService.sendMessage(
                    state.conversation._id || state.conversation.id,
                    text.trim(),
                    media
                );

                // Message will be added via onMessage listener
                // But add it immediately for better UX
                updateStateAndCache({
                    messages: [message, ...state.messages],
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
    const markAsSeen = useCallback(
        async (messageIds: string[]) => {
            if (!state.conversation || messageIds.length === 0) {
                return;
            }

            try {
                const lastId = messageIds[messageIds.length - 1];
                await SocketService.markMessagesSeen(
                    state.conversation._id || state.conversation.id,
                    lastId
                );
            } catch (error: any) {
                // Silently fail
            }
        },
        [state.conversation]
    );

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
        async (page: number) => {
            if (!state.conversation || !state.hasMoreMessages) {
                return;
            }

            try {
                const response = await ConversationService.loadMessages(
                    state.conversation._id || state.conversation.id,
                    page,
                    MESSAGE_LIMIT
                );

                setState((prev) => {
                    const newState = {
                        ...prev,
                        messages: [...prev.messages, ...(response.items || [])],
                        hasMoreMessages: response.hasMore || false,
                        currentPage: page,
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
        [state.conversation, state.hasMoreMessages]
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
                        msg._id === messageId ? updated : msg
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

            setState((prev) => ({
                ...prev,
                messages: prev.messages.filter((msg) => msg._id !== messageId),
            }));
        } catch (error: any) {
            setState((prev) => ({
                ...prev,
                error: error.message || "Failed to delete message",
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
                    msg._id === messageId
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
                    msg._id === messageId
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
        initializeConversation();

        return () => {
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
        };
    }, [friendId, token]);

    return {
        state,
        actions: {
            sendMessage,
            markAsSeen,
            handleTyping,
            stopTyping,
            loadMoreMessages,
            editMessage,
            deleteMessage,
            addReaction,
            removeReaction,
            retryLoadConversation,
        },
    };
};

export default useChatMessage;
