import { useState, useEffect, useCallback, useRef } from "react";
import { ConversationService, Conversation, MessagePage, MessageResponse } from "../services/conversationService";
import { SocketService, MessagePayload, TypingData } from "../services/socketService";
import { useAuth } from "./useAuth";

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

            // Step 4: Join conversation room
            await SocketService.joinConversation(
                conversation._id || conversation.id
            );

            // Update state with initial data
            setState((prev) => ({
                ...prev,
                conversation,
                messages: messagesResponse.items || [],
                isLoading: false,
                hasMoreMessages: messagesResponse.hasMore || false,
                currentPage: 1,
            }));

            // Step 5: Setup Socket.IO event listeners
            setupSocketListeners(conversation._id || conversation.id);
        } catch (error: any) {
            setState((prev) => ({
                ...prev,
                error: error.message || "Failed to initialize chat",
                isLoading: false,
            }));
        }
    }, [friendId, token]);

    /**
     * Setup Socket.IO event listeners
     */
    const setupSocketListeners = useCallback(
        (conversationId: string) => {
            if (messageListenerActiveRef.current) {
                return;
            }

            // Incoming messages
            SocketService.onMessage((message: MessagePayload) => {
                setState((prev) => ({
                    ...prev,
                    messages: [message, ...prev.messages],
                }));
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
                setState((prev) => ({
                    ...prev,
                    messages: prev.messages.map((msg) =>
                        msg._id === message._id ? message : msg
                    ),
                }));
            });

            messageListenerActiveRef.current = true;
        },
        []
    );

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
                setState((prev) => ({
                    ...prev,
                    messages: [message, ...prev.messages],
                    isSending: false,
                }));
            } catch (error: any) {
                setState((prev) => ({
                    ...prev,
                    error: error.message || "Failed to send message",
                    isSending: false,
                }));
            }
        },
        [state.conversation]
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

                setState((prev) => ({
                    ...prev,
                    messages: [...prev.messages, ...(response.items || [])],
                    hasMoreMessages: response.hasMore || false,
                    currentPage: page,
                }));
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
            // Cleanup
            if (state.conversation) {
                SocketService.leaveConversation(
                    state.conversation._id || state.conversation.id
                ).catch(() => { });
            }
            SocketService.offMessage();
            SocketService.offMessageSeen();
            SocketService.offTyping();
            SocketService.offMessageUpdated();

            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }

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
