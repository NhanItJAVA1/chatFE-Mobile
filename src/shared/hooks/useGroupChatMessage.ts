import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { ConversationService, Conversation } from "../services/conversationService";
import { SocketService, MessagePayload, TypingData, type GroupReminder } from "../services/socketService";
import { PollService } from "../services/pollService";
import { useAuth } from "./useAuth";
import { saveMessagesToCache, loadMessagesFromCache } from "../utils/cacheUtils";
import { useScrollToMessage } from "./useScrollToMessage";
import { playReminderDueSound } from "../services/messageSoundService";
import type { AddPollOptionRequest, CreatePollRequest, Poll, VotePollRequest } from "@/types";

const getMessageId = (message: MessagePayload): string => {
    return message._id || message.id || message.clientMessageId || `${message.senderId}-${message.createdAt}`;
};

const makeClientMessageId = (): string => `client-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const hasRealMessageId = (message: MessagePayload): boolean => {
    return !!(message._id || message.id);
};

const isOptimisticMessage = (message: MessagePayload): boolean => {
    return !!message.optimistic || message.status === "sending" || message.status === "failed";
};

const isLikelyServerAckForOptimisticMessage = (
    optimistic: MessagePayload,
    incoming: MessagePayload
): boolean => {
    if (!isOptimisticMessage(optimistic)) return false;
    if (optimistic.clientMessageId && optimistic.clientMessageId === incoming.clientMessageId) return true;
    if (!hasRealMessageId(incoming)) return false;
    if (optimistic.senderId !== incoming.senderId) return false;
    if (optimistic.conversationId !== incoming.conversationId) return false;
    if ((optimistic.text || "").trim() !== (incoming.text || "").trim()) return false;

    const optimisticMediaCount = optimistic.media?.length || 0;
    const incomingMediaCount = incoming.media?.length || 0;
    if (optimisticMediaCount !== incomingMediaCount) return false;

    const optimisticTime = Date.parse(optimistic.createdAt || "");
    const incomingTime = Date.parse(incoming.createdAt || "");
    if (!Number.isFinite(optimisticTime) || !Number.isFinite(incomingTime)) return true;

    return Math.abs(incomingTime - optimisticTime) < 30000;
};

const mergeServerMessages = (
    incoming: MessagePayload[],
    existing: MessagePayload[]
): MessagePayload[] => {
    const matchedIncomingIndexes = new Set<number>();
    const withoutMatchedOptimistic = existing.filter((message) => {
        const matchIndex = incoming.findIndex((incomingMessage, index) =>
            !matchedIncomingIndexes.has(index) &&
            isLikelyServerAckForOptimisticMessage(message, incomingMessage)
        );

        if (matchIndex === -1) return true;
        matchedIncomingIndexes.add(matchIndex);
        return false;
    });

    return mergeUniqueMessages(incoming, withoutMatchedOptimistic);
};

const getMessageTimestamp = (message: MessagePayload): number => {
    const parsedTime = Date.parse(message.updatedAt || message.createdAt || "");
    return Number.isFinite(parsedTime) ? parsedTime : 0;
};

const getPollId = (poll?: Poll | null): string => {
    return poll?.id || "";
};

const isPollMessage = (message: MessagePayload): boolean => {
    return message.type === "poll" || String(message.messageType || "").toLowerCase() === "poll" || !!message.pollId || !!message.poll;
};

const getMessagePollId = (message: MessagePayload): string => {
    return message.poll?.id || message.pollId || (message as any).poll?._id || "";
};

const getSocketPollId = (event: any): string => {
    return event?.pollId || event?.id || event?.poll?.id || event?.poll?._id || event?.data?.pollId || event?.data?.poll?.id || "";
};

const mergePolls = (incoming: Poll[], existing: Poll[]): Poll[] => {
    const byId = new Map<string, Poll>();
    existing.forEach((poll) => {
        const id = getPollId(poll);
        if (id) byId.set(id, poll);
    });
    incoming.forEach((poll) => {
        const id = getPollId(poll);
        if (id) byId.set(id, { ...(byId.get(id) || {}), ...poll });
    });

    return Array.from(byId.values()).sort((left, right) => {
        const leftTime = Date.parse(left.updatedAt || left.createdAt || "");
        const rightTime = Date.parse(right.updatedAt || right.createdAt || "");
        return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
    });
};

const attachPollsToMessages = (messages: MessagePayload[], polls: Poll[]): MessagePayload[] => {
    if (!messages.length || !polls.length) return messages;

    const pollsById = new Map<string, Poll>();
    polls.forEach((poll) => {
        if (poll.id) pollsById.set(poll.id, poll);
    });

    return messages.map((message) => {
        if (!isPollMessage(message)) return message;

        const pollId = getMessagePollId(message);
        const poll = pollId ? pollsById.get(pollId) : message.poll;
        if (!poll) return message;

        return {
            ...message,
            type: "poll",
            messageType: "poll",
            pollId: poll.id,
            poll,
        };
    });
};

const mergePollMessagesIntoFeed = (
    messages: MessagePayload[],
    polls: Poll[],
    conversationId: string
): MessagePayload[] => {
    const activePollIds = new Set(polls.map((poll) => poll.id).filter(Boolean));
    const messagesWithoutStalePolls = messages.filter((message) => {
        const pollId = getMessagePollId(message);
        return !pollId || activePollIds.has(pollId);
    });
    const attached = attachPollsToMessages(messagesWithoutStalePolls, polls);
    const existingPollIds = new Set(attached.map(getMessagePollId).filter(Boolean));
    const missingPollMessages = polls
        .filter((poll) => poll.id && !existingPollIds.has(poll.id))
        .map((poll) => createPollMessage(poll, conversationId));

    return missingPollMessages.length > 0
        ? mergeUniqueMessages(missingPollMessages, attached)
        : attached;
};

const collapsePollMessages = (messages: MessagePayload[]): MessagePayload[] => {
    const seenPollIds = new Set<string>();

    return messages.filter((message) => {
        const pollId = getMessagePollId(message);
        if (!pollId) return true;

        if (seenPollIds.has(pollId)) {
            return false;
        }

        seenPollIds.add(pollId);
        return true;
    });
};

const upsertMessage = (messages: MessagePayload[], incoming: MessagePayload): MessagePayload[] => {
    const incomingId = getMessageId(incoming);
    const exists = messages.some((message) => getMessageId(message) === incomingId);

    return exists
        ? messages.map((message) => getMessageId(message) === incomingId ? { ...message, ...incoming } : message)
        : mergeUniqueMessages([incoming], messages);
};

const createPollMessage = (poll: Poll, conversationId: string): MessagePayload => {
    const createdAt = poll.createdAt || new Date().toISOString();
    const messageId = `poll-${poll.id}`;

    return {
        _id: messageId,
        id: messageId,
        conversationId: poll.conversationId || poll.groupId || conversationId,
        senderId: poll.creatorId || poll.createdBy || "system",
        senderName: poll.creatorName || "Bình chọn",
        senderAvatar: "",
        text: poll.question,
        status: "sent",
        createdAt,
        updatedAt: poll.updatedAt || createdAt,
        type: "poll",
        messageType: "poll",
        pollId: poll.id,
        poll,
    };
};

const getPinnedPollId = (pin: any): string => {
    const msg = pin?.message || pin;
    return msg?.poll?.id
        || msg?.pollId
        || msg?.poll?._id
        || pin?.poll?.id
        || pin?.pollId
        || pin?.poll?._id
        || "";
};

const upsertPinnedPollMessage = (
    pinnedMessages: MessagePayload[],
    poll: Poll,
    conversationId: string
): MessagePayload[] => {
    if (!poll?.id) return pinnedMessages;

    const pinnedPollMessage = {
        ...createPollMessage(poll, conversationId),
        poll: { ...poll, pinned: true, isPinned: true },
        pinned: true,
        pinnedAt: (poll as any).pinnedAt || new Date().toISOString(),
    } as MessagePayload;

    const existingIndex = pinnedMessages.findIndex((message) => getPinnedPollId(message) === poll.id);
    if (existingIndex >= 0) {
        return pinnedMessages.map((message, index) => index === existingIndex ? { ...message, ...pinnedPollMessage } : message);
    }

    return [pinnedPollMessage, ...pinnedMessages];
};

const removePinnedPollMessage = (pinnedMessages: MessagePayload[], pollId: string): MessagePayload[] => {
    if (!pollId) return pinnedMessages;
    return pinnedMessages.filter((message) => getPinnedPollId(message) !== pollId);
};

const normalizePollActivityMessage = (event: any, conversationId: string): MessagePayload | null => {
    const raw = event?.systemMessage || event?.activityMessage || event?.message;
    if (!raw) return null;

    const messageId = raw._id || raw.id || raw.messageId;
    const text = raw.text || raw.content || raw.message || raw.textPreview || "";
    if (!messageId && !text) return null;

    const createdAt = raw.createdAt || event?.createdAt || new Date().toISOString();

    return {
        ...raw,
        _id: messageId || `poll-activity-${event?.pollId || event?.poll?.id || "unknown"}-${createdAt}`,
        id: messageId || `poll-activity-${event?.pollId || event?.poll?.id || "unknown"}-${createdAt}`,
        conversationId: raw.conversationId || event?.conversationId || conversationId,
        senderId: raw.senderId || raw.userId || event?.userId || "system",
        senderName: raw.senderName || raw.userName || event?.userName || "System",
        senderAvatar: raw.senderAvatar || "",
        text,
        status: raw.status || "sent",
        createdAt,
        updatedAt: raw.updatedAt || createdAt,
        type: "system" as const,
    };
};

const upsertActivityMessage = (
    messages: MessagePayload[],
    message: MessagePayload
): MessagePayload[] => {
    return collapsePollMessages(enrichMessagesWithQuotedData(upsertMessage(messages, {
        ...message,
        type: (message.type || "system") as any,
        text: message.text || (message as any).content || (message as any).message || "",
    })));
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
        }        return {
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
    polls: Poll[];
    pollsLoading: boolean;
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
    removeReaction: (messageId: string, emoji?: string) => Promise<void>;
    pinMessage: (messageId: string) => Promise<void>;
    unpinMessage: (messageId: string) => Promise<void>;
    navigatePinnedMessages: (direction: "prev" | "next") => void;
    setReplyingTo: (message: MessagePayload | null) => void;
    updateReminderBubble: (reminder: GroupReminder) => void;
    loadPolls: () => Promise<void>;
    createPoll: (payload: CreatePollRequest) => Promise<Poll>;
    votePoll: (pollId: string, payload: VotePollRequest) => Promise<void>;
    lockPoll: (pollId: string) => Promise<void>;
    pinPoll: (pollId: string) => Promise<void>;
    unpinPoll: (pollId: string) => Promise<void>;
    deletePoll: (pollId: string) => Promise<void>;
    addPollOption: (pollId: string, payload: AddPollOptionRequest) => Promise<void>;
    retryLoadConversation: () => Promise<void>;
    /** Scroll the FlatList to the given message and briefly highlight it */
    scrollToMessage: (messageId: string) => Promise<boolean>;
}

export interface UseChatMessageReturn {
    state: UseChatMessageState;
    actions: UseChatMessageActions;
    /** Ref to attach to the <FlatList> so scrollToMessage can control it */
    flatListRef: ReturnType<typeof useScrollToMessage>["flatListRef"];
    /** ID of the message currently lit up after a scroll-to, or null */
    highlightedMessageId: string | null;
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
        const poll = msg.poll || pin.poll;
        const pollId = getPinnedPollId(pin);
        if (pollId) {
            return {
                ...msg,
                _id: `poll-${pollId}`,
                id: `poll-${pollId}`,
                text: poll?.question || msg.text || msg.content || "Bình chọn",
                senderId: poll?.creatorId || poll?.createdBy || msg.senderId || "system",
                senderName: poll?.creatorName || msg.senderName || "Bình chọn",
                createdAt: poll?.createdAt || msg.createdAt || pin.createdAt,
                media: msg.media || [],
                type: "poll",
                messageType: "poll",
                pollId,
                poll,
                pinnedAt: pin.pinnedAt || msg.pinnedAt,
                pinnedByName: pin.pinnedByName || msg.pinnedByName,
            } as any;
        }

        const senderId = msg.senderId;
        
        const resolvedName = (senderId ? userMap[senderId] : undefined) || "Unknown";

        return {
            ...msg,
            _id: msg._id || msg.id || "",
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
        polls: [],
        pollsLoading: false,
    });

    const fetchMissingMessage = useCallback(async (messageId: string): Promise<boolean> => {
        if (messageId.startsWith("poll-")) {
            const pollId = messageId.slice("poll-".length);
            if (!pollId) return false;

            try {
                const poll = await PollService.getPoll(groupId, pollId);
                if (!poll?.id) return false;

                setState((prev) => {
                    const conversationId = prev.conversation?._id || prev.conversation?.id || groupId;
                    const nextPolls = mergePolls([poll], prev.polls);
                    return {
                        ...prev,
                        polls: nextPolls,
                        messages: collapsePollMessages(mergePollMessagesIntoFeed(prev.messages, nextPolls, conversationId)),
                    };
                });
                return true;
            } catch (error) {
                console.error("Failed to fetch target poll:", error);
                return false;
            }
        }

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
    }, [groupId]);

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
    const userRef = useRef(user);

    const getMessageId = useCallback((message: MessagePayload): string => {
        return message._id || message.id || message.clientMessageId || `${message.senderId}-${message.createdAt}`;
    }, []);

    // Update ref when state changes
    useEffect(() => {
        messagesStateRef.current = state;
    }, [state]);

    useEffect(() => {
        userRef.current = user;
    }, [user]);

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

    const updateReminderBubble = useCallback((reminder: GroupReminder) => {
        if (!reminder?.id) {
            return;
        }

        setState((prev) => {
            const messages = prev.messages.map((message) => {
                const sameReminder =
                    message.reminderId === reminder.id ||
                    message.reminder?.id === reminder.id ||
                    message.id === reminder.messageId ||
                    message._id === reminder.messageId;

                if (!sameReminder) {
                    return message;
                }

                return {
                    ...message,
                    reminderId: message.reminderId || reminder.id,
                    reminder: {
                        ...(message.reminder || {}),
                        ...reminder,
                    },
                };
            });

            const newState = {
                ...prev,
                messages,
            };

            if (prev.conversation) {
                const conversationId = prev.conversation._id || prev.conversation.id;
                conversationCache.set(conversationId, {
                    conversation: prev.conversation,
                    messages,
                    hasMoreMessages: prev.hasMoreMessages,
                    nextCursor: prev.nextCursor,
                });

                saveMessagesToCache(conversationId, messages).catch((error) => {
                    console.error("[useGroupChatMessage] Failed to save messages after reminder update:", error);
                });
            }

            return newState;
        });
    }, []);

    const upsertPollInState = useCallback((poll: Poll, conversationId?: string) => {
        if (!poll?.id) return;

        setState((prev) => {
            const convId = conversationId || prev.conversation?._id || prev.conversation?.id || groupId;
            const nextPolls = mergePolls([poll], prev.polls);
            const hasPollMessage = prev.messages.some((message) => getMessagePollId(message) === poll.id);
            const updatedMessages: MessagePayload[] = prev.messages.map((message): MessagePayload => {
                if (getMessagePollId(message) !== poll.id) return message;
                return {
                    ...message,
                    type: "poll" as const,
                    messageType: "poll",
                    pollId: poll.id,
                    poll,
                    text: poll.question,
                    updatedAt: poll.updatedAt || message.updatedAt,
                };
            });

            const nextMessages = hasPollMessage
                ? collapsePollMessages(mergeUniqueMessages([], updatedMessages))
                : collapsePollMessages(mergeUniqueMessages([createPollMessage(poll, convId)], updatedMessages));

            return {
                ...prev,
                polls: nextPolls,
                messages: nextMessages,
            };
        });
    }, []);

    const removePollFromState = useCallback((pollId: string) => {
        if (!pollId) return;

        setState((prev) => {
            const nextPinnedMessages = removePinnedPollMessage(prev.pinnedMessages, pollId);
            return {
                ...prev,
                polls: prev.polls.filter((poll) => poll.id !== pollId),
                messages: prev.messages.filter((message) => getMessagePollId(message) !== pollId),
                pinnedMessages: nextPinnedMessages,
                pinnedMessageIndex: Math.min(prev.pinnedMessageIndex, Math.max(0, nextPinnedMessages.length - 1)),
            };
        });
    }, []);

    const loadPolls = useCallback(async () => {
        setState((prev) => ({ ...prev, pollsLoading: true }));
        try {
            const polls = await PollService.getPolls(groupId);
            setState((prev) => {
                const nextPolls = mergePolls(polls, prev.polls);
                const conversationId = prev.conversation?._id || prev.conversation?.id || groupId;
                return {
                    ...prev,
                    polls: nextPolls,
                    messages: collapsePollMessages(mergePollMessagesIntoFeed(prev.messages, nextPolls, conversationId)),
                    pollsLoading: false,
                };
            });
        } catch (error: any) {
            console.warn("[useGroupChatMessage] Failed to load polls:", error?.message);
            setState((prev) => ({ ...prev, pollsLoading: false }));
        }
    }, [groupId]);

    const createPoll = useCallback(async (payload: CreatePollRequest): Promise<Poll> => {
        const poll = await PollService.createPoll(groupId, payload);
        upsertPollInState(poll);
        return poll;
    }, [groupId, upsertPollInState]);

    const votePoll = useCallback(async (pollId: string, payload: VotePollRequest) => {
        const poll = await PollService.vote(groupId, pollId, payload);
        upsertPollInState(poll);
    }, [groupId, upsertPollInState]);

    const lockPoll = useCallback(async (pollId: string) => {
        const poll = await PollService.lock(groupId, pollId);
        upsertPollInState(poll);
    }, [groupId, upsertPollInState]);

    const pinPoll = useCallback(async (pollId: string) => {
        setState((prev) => {
            const poll = prev.polls.find((candidate) => candidate.id === pollId);
            const conversationId = prev.conversation?._id || prev.conversation?.id || groupId;
            return poll ? {
                ...prev,
                polls: mergePolls([{ ...poll, pinned: true, isPinned: true }], prev.polls),
                messages: prev.messages.map((message) =>
                    getMessagePollId(message) === pollId && message.poll
                        ? { ...message, poll: { ...message.poll, pinned: true, isPinned: true } }
                        : message
                ),
                pinnedMessages: upsertPinnedPollMessage(prev.pinnedMessages, { ...poll, pinned: true, isPinned: true }, conversationId),
                pinnedMessageIndex: 0,
            } : prev;
        });
        const poll = await PollService.pin(groupId, pollId);
        setState((prev) => ({
            ...prev,
            pinnedMessages: upsertPinnedPollMessage(
                prev.pinnedMessages,
                { ...poll, pinned: true, isPinned: true },
                prev.conversation?._id || prev.conversation?.id || groupId
            ),
            pinnedMessageIndex: 0,
        }));
        upsertPollInState({ ...poll, pinned: true, isPinned: true });
    }, [groupId, upsertPollInState]);

    const unpinPoll = useCallback(async (pollId: string) => {
        setState((prev) => {
            const poll = prev.polls.find((candidate) => candidate.id === pollId);
            return poll ? {
                ...prev,
                polls: mergePolls([{ ...poll, pinned: false, isPinned: false }], prev.polls),
                messages: prev.messages.map((message) =>
                    getMessagePollId(message) === pollId && message.poll
                        ? { ...message, poll: { ...message.poll, pinned: false, isPinned: false } }
                        : message
                ),
                pinnedMessages: removePinnedPollMessage(prev.pinnedMessages, pollId),
                pinnedMessageIndex: 0,
            } : prev;
        });
        const poll = await PollService.unpin(groupId, pollId);
        setState((prev) => {
            const nextPinnedMessages = removePinnedPollMessage(prev.pinnedMessages, pollId);
            return {
                ...prev,
                pinnedMessages: nextPinnedMessages,
                pinnedMessageIndex: Math.min(prev.pinnedMessageIndex, Math.max(0, nextPinnedMessages.length - 1)),
            };
        });
        upsertPollInState({ ...poll, pinned: false, isPinned: false });
    }, [groupId, upsertPollInState]);

    const deletePoll = useCallback(async (pollId: string) => {
        try {
            await PollService.delete(groupId, pollId);
            removePollFromState(pollId);
        } catch (error: any) {
            const message = String(error?.message || "").toLowerCase();
            if (message.includes("404") || message.includes("not found")) {
                removePollFromState(pollId);
                return;
            }
            throw error;
        }
    }, [groupId, removePollFromState]);

    const addPollOption = useCallback(async (pollId: string, payload: AddPollOptionRequest) => {
        const poll = await PollService.addOption(groupId, pollId, payload);
        upsertPollInState(poll);
    }, [groupId, upsertPollInState]);

    // Keep scroll-index map fresh whenever messages change
    useEffect(() => {
        buildMessageIndexMap(state.messages);
    }, [state.messages, buildMessageIndexMap]);

    /**
     * Send message to group
     */
    const sendMessage = useCallback(
        async (text: string, media?: any[]) => {
            const trimmedText = text.trim();
            if (!state.conversation || (!trimmedText && (!media || media.length === 0))) {
                return;
            }

            const conversationId = state.conversation._id || state.conversation.id;
            const clientMessageId = makeClientMessageId();
            const now = new Date().toISOString();
            const currentUserId = String(user?.id || (user as any)?._id || (user as any)?.userId || "");
            const optimisticMessage: MessagePayload = {
                id: clientMessageId,
                clientMessageId,
                conversationId,
                senderId: currentUserId,
                senderName: user?.displayName || (user as any)?.name || "Bạn",
                senderAvatar: (user as any)?.avatarUrl || (user as any)?.avatar || "",
                text: trimmedText,
                media: media || [],
                reactions: [],
                status: "sending",
                createdAt: now,
                updatedAt: now,
                type: media?.length ? "image" : "text",
                optimistic: true,
            };

            setState((prev) => {
                const newMessages = collapsePollMessages(attachPollsToMessages(
                    enrichMessagesWithQuotedData(mergeUniqueMessages([optimisticMessage], prev.messages)),
                    prev.polls
                ));

                if (prev.conversation) {
                    const convId = prev.conversation._id || prev.conversation.id;
                    conversationCache.set(convId, {
                        conversation: prev.conversation,
                        messages: newMessages,
                        hasMoreMessages: prev.hasMoreMessages,
                        nextCursor: prev.nextCursor,
                    });
                    saveMessagesToCache(convId, newMessages).catch((cacheError) => {
                        console.error("[useGroupChatMessage] Failed to save optimistic message to cache:", cacheError);
                    });
                }

                return {
                    ...prev,
                    messages: newMessages,
                    isSending: false,
                    error: null,
                };
            });

            try {
                stopTyping();

                const messages = await SocketService.sendMessage(
                    conversationId,
                    trimmedText,
                    media
                );

                setState((prev) => {
                    const acknowledgedMessages = messages.length > 0
                        ? messages.map((message) => ({ ...message, clientMessageId, optimistic: false }))
                        : [{ ...optimisticMessage, status: "sent" as const, optimistic: false }];
                    const merged = mergeServerMessages(acknowledgedMessages, prev.messages);
                    const newMessages = collapsePollMessages(attachPollsToMessages(
                        enrichMessagesWithQuotedData(merged),
                        prev.polls
                    ));

                    if (prev.conversation) {
                        const convId = prev.conversation._id || prev.conversation.id;
                        conversationCache.set(convId, {
                            conversation: prev.conversation,
                            messages: newMessages,
                            hasMoreMessages: prev.hasMoreMessages,
                            nextCursor: prev.nextCursor,
                        });
                        saveMessagesToCache(convId, newMessages).catch((cacheError) => {
                            console.error("[useGroupChatMessage] Failed to save sent message to cache:", cacheError);
                        });
                    }

                    return {
                        ...prev,
                        messages: newMessages,
                        isSending: false,
                    };
                });
            } catch (error: any) {
                setState((prev) => {
                    const newMessages = prev.messages.map((message) =>
                        message.clientMessageId === clientMessageId
                            ? {
                                ...message,
                                status: "failed" as const,
                                optimistic: true,
                                sendError: error.message || "Failed to send message",
                                updatedAt: new Date().toISOString(),
                            }
                            : message
                    );

                    if (prev.conversation) {
                        const convId = prev.conversation._id || prev.conversation.id;
                        conversationCache.set(convId, {
                            conversation: prev.conversation,
                            messages: newMessages,
                            hasMoreMessages: prev.hasMoreMessages,
                            nextCursor: prev.nextCursor,
                        });
                        saveMessagesToCache(convId, newMessages).catch((cacheError) => {
                            console.error("[useGroupChatMessage] Failed to save failed message to cache:", cacheError);
                        });
                    }

                    return {
                        ...prev,
                        messages: newMessages,
                        error: error.message || "Failed to send message",
                        isSending: false,
                    };
                });
            }
        },
        [state.conversation, state.messages, state.polls, updateStateAndCache, user]
    );

    /**
     * Mark messages as seen
     */
    const lastMarkedMessageId = useRef<string>("");
    const markAsSeenTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isStaleSeenError = (error: any): boolean => {
        const text = String(error?.message || error?.code || "").toLowerCase();
        return text.includes("message not found") || error?.status === 404;
    };

    const markAsSeen = useCallback(
        async (messageIds: string[]) => {
            if (!state.conversation || !messageIds.length) return;

            const conversationId = state.conversation._id || state.conversation.id;
            const visibleIdSet = new Set(messageIds);
            const newestVisibleMessage = state.messages
                .filter((message) => visibleIdSet.has(getMessageId(message)))
                .sort((a, b) => {
                    const aTime = new Date(a.createdAt || "").getTime() || 0;
                    const bTime = new Date(b.createdAt || "").getTime() || 0;
                    return bTime - aTime;
                })[0];
            const lastId = newestVisibleMessage ? getMessageId(newestVisibleMessage) : messageIds[messageIds.length - 1];

            if (lastMarkedMessageId.current === lastId) return;

            lastMarkedMessageId.current = lastId;

            if (markAsSeenTimeout.current) {
                clearTimeout(markAsSeenTimeout.current);
            }

            markAsSeenTimeout.current = setTimeout(async () => {
                try {
                    await SocketService.markMessagesSeen(conversationId, lastId);
                } catch (error: any) {
                    if (isStaleSeenError(error)) {
                        return;
                    }
                    console.error("[useGroupChatMessage] Failed to mark as seen:", error);
                }
            }, 500);
        },
        [getMessageId, state.conversation, state.messages]
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
                const reaction = await SocketService.addReaction(messageId, emoji);
                const currentUserId = user?.id || (user as any)?._id || (user as any)?.userId;
                const reactionId = reaction?._id || reaction?.id;
                setState((prev) => ({
                    ...prev,
                    messages: prev.messages.map((msg) =>
                        getMessageId(msg) === messageId
                            ? {
                                ...msg,
                                reactions: [
                                    ...(msg.reactions || []).filter((item: any) =>
                                        reactionId ? (item._id || item.id) !== reactionId : true
                                    ),
                                    reaction || { emoji, userId: currentUserId },
                                ],
                            }
                            : msg
                    ),
                }));
            } catch (error) {
                console.error("[useGroupChatMessage] Add reaction error:", error);
                throw error;
            }
        },
        [state.conversation, user?.id, (user as any)?._id, (user as any)?.userId]
    );

    const removeReaction = useCallback(
        async (messageId: string, emoji?: string) => {
            if (!state.conversation) return;
            if (messageId.startsWith("temp-")) throw new Error("Vui lòng đợi tin nhắn được gửi thành công");

            try {
                await SocketService.removeReaction(messageId, emoji);
                const currentUserId = user?.id || (user as any)?._id || (user as any)?.userId;
                setState((prev) => ({
                    ...prev,
                    messages: prev.messages.map((msg) =>
                        getMessageId(msg) === messageId
                            ? {
                                ...msg,
                                reactions: (msg.reactions || []).filter((reaction: any) =>
                                    currentUserId
                                        ? reaction.userId !== currentUserId || (!!emoji && reaction.emoji !== emoji)
                                        : !!emoji && reaction.emoji !== emoji
                                ),
                            }
                            : msg
                    ),
                }));
            } catch (error) {
                console.error("[useGroupChatMessage] Remove reaction error:", error);
                throw error;
            }
        },
        [state.conversation, user?.id, (user as any)?._id, (user as any)?.userId]
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

            await SocketService.pinMessage(conversationId, messageId);        } catch (error: any) {
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

            await SocketService.unpinMessage(conversationId, messageId);        } catch (error: any) {
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
            }        }
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
        const trimmedText = text.trim();
        const clientMessageId = makeClientMessageId();

        try {
            if (quotedMessageId.startsWith("temp-") || quotedMessageId.startsWith("client-")) {
                throw new Error("Vui lòng đợi tin nhắn được gửi thành công");
            }
            if (!state.conversation) {
                throw new Error("No conversation loaded");
            }

            if (!trimmedText && (!media || media.length === 0)) {
                throw new Error("Message cannot be empty");
            }

            const conversationId = state.conversation._id || state.conversation.id;
            const now = new Date().toISOString();
            const currentUserId = String(user?.id || (user as any)?._id || (user as any)?.userId || "");
            const quotedMessage = state.messages.find((message) => getMessageId(message) === quotedMessageId);
            const optimisticMessage: MessagePayload = {
                id: clientMessageId,
                clientMessageId,
                conversationId,
                senderId: currentUserId,
                senderName: user?.displayName || (user as any)?.name || "Bạn",
                senderAvatar: (user as any)?.avatarUrl || (user as any)?.avatar || "",
                text: trimmedText,
                media: media || [],
                reactions: [],
                status: "sending",
                createdAt: now,
                updatedAt: now,
                type: media?.length ? "image" : "text",
                quotedMessageId,
                quotedMessage: quotedMessage
                    ? {
                        _id: quotedMessage._id,
                        id: quotedMessage.id,
                        text: quotedMessage.text,
                        senderId: quotedMessage.senderId,
                        senderName: quotedMessage.senderName,
                        type: quotedMessage.type,
                        media: quotedMessage.media,
                    }
                    : undefined,
                quotedMessagePreview: quotedMessage?.text,
                quotedMessageSenderId: quotedMessage?.senderId,
                quotedMessageSenderName: quotedMessage?.senderName,
                optimistic: true,
            };

            setState((prev) => {
                const merged = mergeUniqueMessages([optimisticMessage], prev.messages);
                const newMessages = collapsePollMessages(attachPollsToMessages(
                    enrichMessagesWithQuotedData(merged),
                    prev.polls
                ));

                if (prev.conversation) {
                    const convId = prev.conversation._id || prev.conversation.id;
                    conversationCache.set(convId, {
                        conversation: prev.conversation,
                        messages: newMessages,
                        hasMoreMessages: prev.hasMoreMessages,
                        nextCursor: prev.nextCursor,
                    });
                    saveMessagesToCache(convId, newMessages).catch((error) => {
                        console.error('[useGroupChatMessage] Failed to save optimistic quoted message to cache:', error);
                    });
                }

                return {
                    ...prev,
                    messages: newMessages,
                    isSending: false,
                    replyingTo: null,
                    error: null,
                };
            });

            const messages = await SocketService.sendQuotedMessage(
                conversationId,
                quotedMessageId,
                trimmedText,
                media
            );

            setState((prev) => {
                const acknowledgedMessages = (messages?.length ? messages : [{ ...optimisticMessage, status: "sent" as const }])
                    .map((message) => ({ ...message, clientMessageId, optimistic: false }));
                const merged = mergeServerMessages(acknowledgedMessages, prev.messages);
                const newMessages = collapsePollMessages(attachPollsToMessages(
                    enrichMessagesWithQuotedData(merged),
                    prev.polls
                ));

                // Save to cache
                if (prev.conversation) {
                    const convId = prev.conversation._id || prev.conversation.id;
                    conversationCache.set(convId, {
                        conversation: prev.conversation,
                        messages: newMessages,
                        hasMoreMessages: prev.hasMoreMessages,
                        nextCursor: prev.nextCursor,
                    });
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
            setState((prev) => {
                const newMessages = prev.messages.map((message) =>
                    message.clientMessageId === clientMessageId
                        ? {
                            ...message,
                            status: "failed" as const,
                            optimistic: true,
                            sendError: error.message || "Failed to send quoted message",
                            updatedAt: new Date().toISOString(),
                        }
                        : message
                );

                if (prev.conversation) {
                    const convId = prev.conversation._id || prev.conversation.id;
                    conversationCache.set(convId, {
                        conversation: prev.conversation,
                        messages: newMessages,
                        hasMoreMessages: prev.hasMoreMessages,
                        nextCursor: prev.nextCursor,
                    });
                    saveMessagesToCache(convId, newMessages).catch((cacheError) => {
                        console.error('[useGroupChatMessage] Failed to save failed quoted message to cache:', cacheError);
                    });
                }

                return {
                    ...prev,
                    messages: newMessages,
                    isSending: false,
                    error: error.message || "Failed to send quoted message",
                };
            });
        }
    }, [getMessageId, state.conversation, state.messages, user]);

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

                PollService.getPolls(groupId).then((polls) => {
                    setState((prev) => {
                        const nextPolls = mergePolls(polls, prev.polls);
                        return {
                            ...prev,
                            polls: nextPolls,
                            messages: collapsePollMessages(mergePollMessagesIntoFeed(prev.messages, nextPolls, conversationId)),
                            pollsLoading: false,
                        };
                    });
                }).catch((error: any) => {
                    console.warn("[useGroupChatMessage] Failed to load polls:", error?.message);
                });

                // Setup socket listeners for group messages
                SocketService.onMessage((message: MessagePayload) => {
                    if ((message.conversationId === conversationId || message.conversationId === groupId) && messagesStateRef.current) {
                        const merged = mergeServerMessages([message], messagesStateRef.current.messages);
                        const enriched = collapsePollMessages(attachPollsToMessages(
                            enrichMessagesWithQuotedData(merged),
                            messagesStateRef.current.polls
                        ));
                        updateStateAndCache({ messages: enriched });
                    }
                });

                SocketService.onMessageUpdated((message: MessagePayload) => {
                    if ((message.conversationId && message.conversationId !== conversationId && message.conversationId !== groupId) || !messagesStateRef.current) {
                        return;
                    }

                    const messageId = getMessageId(message);
                    const currentUser = userRef.current as any;
                    const currentUserId = currentUser?.id || currentUser?._id || currentUser?.userId;
                    const deletedForMe =
                        Array.isArray((message as any).deletedForUserIds) &&
                        !!currentUserId &&
                        (message as any).deletedForUserIds.includes(currentUserId);

                    const messageExists = messagesStateRef.current.messages.some((msg) => getMessageId(msg) === messageId);
                    const isDeletedEvent = (message as any).status === "deleted" || !!(message as any).deletedAt;
                    const updatedMessages = deletedForMe
                        ? messagesStateRef.current.messages.filter((msg) => getMessageId(msg) !== messageId)
                        : messageExists
                            ? messagesStateRef.current.messages.map((msg) =>
                                getMessageId(msg) !== messageId ? msg : { ...msg, ...message }
                            )
                            : isDeletedEvent
                                ? messagesStateRef.current.messages
                                : mergeServerMessages([message], messagesStateRef.current.messages);

                    // Re-enrich in case quoted data was updated
                    const enriched = collapsePollMessages(attachPollsToMessages(
                        enrichMessagesWithQuotedData(updatedMessages),
                        messagesStateRef.current.polls
                    ));

                    updateStateAndCache({ messages: enriched });
                });

                SocketService.onMessageSeen((data) => {
                    const incomingConvId = data.conversationId;
                    if (
                        (incomingConvId && incomingConvId !== conversationId && incomingConvId !== groupId) ||
                        !messagesStateRef.current
                    ) {
                        return;
                    }

                    const viewerId = String(data.userId || "");
                    const currentUser = userRef.current as any;
                    const currentUserId = String(currentUser?.id || currentUser?._id || currentUser?.userId || "");
                    if (!viewerId || viewerId === currentUserId) {
                        return;
                    }

                    const seenMessageId = data.lastSeenMessageId;
                    const seenMessageIndex = messagesStateRef.current.messages.findIndex((message) => getMessageId(message) === seenMessageId);
                    if (seenMessageIndex === -1) {
                        return;
                    }

                    const messages = messagesStateRef.current.messages.map((message, index) => {
                        if (String(message.senderId || "") === currentUserId && index >= seenMessageIndex) {
                            return { ...message, status: "seen" as const };
                        }
                        return message;
                    });
                    const enriched = collapsePollMessages(attachPollsToMessages(
                        enrichMessagesWithQuotedData(messages),
                        messagesStateRef.current.polls
                    ));

                    updateStateAndCache({ messages: enriched });
                });

                SocketService.onMessageReaction((data: any) => {
                    const incomingConvId = data.conversationId || data.reaction?.conversationId;
                    if (incomingConvId && incomingConvId !== conversationId && incomingConvId !== groupId) {
                        return;
                    }

                    const messageId = data.messageId || data.reaction?.messageId;
                    const reaction = data.reaction || data;
                    const reactionUserId = reaction?.userId || data.userId;
                    if (!messageId || !reaction?.emoji || !reactionUserId || !messagesStateRef.current) {
                        return;
                    }
                    const reactionId = reaction?._id || reaction?.id;

                    const messages = messagesStateRef.current.messages.map((msg) =>
                        getMessageId(msg) === messageId
                            ? {
                                ...msg,
                                reactions: [
                                    ...(msg.reactions || []).filter((item: any) =>
                                        reactionId ? (item._id || item.id) !== reactionId : true
                                    ),
                                    { ...reaction, userId: reactionUserId },
                                ],
                            }
                            : msg
                    );
                    const enriched = collapsePollMessages(attachPollsToMessages(
                        enrichMessagesWithQuotedData(messages),
                        messagesStateRef.current.polls
                    ));

                    updateStateAndCache({ messages: enriched });
                });

                SocketService.onMessageReactionRemove((data: any) => {
                    const incomingConvId = data.conversationId || data.reaction?.conversationId;
                    if (incomingConvId && incomingConvId !== conversationId && incomingConvId !== groupId) {
                        return;
                    }

                    const messageId = data.messageId || data.reaction?.messageId;
                    const reactionUserId = data.userId || data.reaction?.userId;
                    const emoji = data.emoji || data.reaction?.emoji;
                    if (!messageId || !reactionUserId || !messagesStateRef.current) {
                        return;
                    }

                    const messages = messagesStateRef.current.messages.map((msg) =>
                        getMessageId(msg) === messageId
                            ? {
                                ...msg,
                                reactions: (msg.reactions || []).filter(
                                    (reaction: any) =>
                                        reaction.userId !== reactionUserId ||
                                        (!!emoji && reaction.emoji !== emoji)
                                ),
                            }
                            : msg
                    );
                    const enriched = collapsePollMessages(attachPollsToMessages(
                        enrichMessagesWithQuotedData(messages),
                        messagesStateRef.current.polls
                    ));

                    updateStateAndCache({ messages: enriched });
                });

                // Quoted (Reply) messages - specific event from BE
                SocketService.onMessageQuoted((data) => {
                    const { conversationId: incomingConvId, message } = data;
                    if (incomingConvId && incomingConvId !== conversationId && incomingConvId !== groupId) {
                        return;
                    }

                    if (messagesStateRef.current) {
                        const merged = mergeServerMessages([message], messagesStateRef.current.messages);
                        const enriched = collapsePollMessages(attachPollsToMessages(
                            enrichMessagesWithQuotedData(merged),
                            messagesStateRef.current.polls
                        ));
                        updateStateAndCache({ messages: enriched });
                    }
                });

                SocketService.onReminderEvents((eventName, data) => {
                    const incomingConvId = String(
                        data?.conversationId ||
                        data?.reminder?.conversationId ||
                        data?.message?.conversationId ||
                        data?.systemMessage?.conversationId ||
                        data?.groupId ||
                        ""
                    );
                    if (incomingConvId && incomingConvId !== String(conversationId) && incomingConvId !== String(groupId)) {
                        return;
                    }

                    const reminder = data?.reminder;
                    if (reminder) {
                        updateReminderBubble(reminder);
                    }

                    const eventKey = eventName.toLowerCase();
                    if (eventKey.includes("reminder_due") || eventKey.includes("reminder:due")) {
                        playReminderDueSound().catch(() => { });
                    }
                });

                SocketService.onTyping((data: TypingData) => {
                    const currentUser = userRef.current as any;
                    const currentUserId = String(currentUser?._id || currentUser?.id || currentUser?.userId || "");
                    if (data.conversationId === conversationId && String(data.userId) !== currentUserId) {
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
                    const incomingConvId = data.conversationId || data.pinnedMessage?.conversationId;
                    if (incomingConvId && incomingConvId !== conversationId && incomingConvId !== groupId) {
                        return;
                    }
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

                SocketService.onPollEvent((event) => {
                    const incomingConvId = String(event.conversationId || event.groupId || event.poll?.conversationId || event.poll?.groupId || "");
                    if (incomingConvId && incomingConvId !== String(conversationId) && incomingConvId !== String(groupId)) {
                        return;
                    }

                    const pollId = getSocketPollId(event);
                    if (event.type === "poll:deleted") {
                        if (pollId) {
                            removePollFromState(pollId);
                        }
                        return;
                    }

                    if (event.poll) {
                        if (event.type === "poll:pinned") {
                            setState((prev) => ({
                                ...prev,
                                pinnedMessages: upsertPinnedPollMessage(
                                    prev.pinnedMessages,
                                    { ...event.poll, pinned: true, isPinned: true },
                                    conversationId
                                ),
                                pinnedMessageIndex: 0,
                            }));
                        } else if (event.type === "poll:unpinned") {
                            const eventPollId = getSocketPollId(event);
                            setState((prev) => {
                                const nextPinnedMessages = removePinnedPollMessage(prev.pinnedMessages, eventPollId);
                                return {
                                    ...prev,
                                    pinnedMessages: nextPinnedMessages,
                                    pinnedMessageIndex: Math.min(prev.pinnedMessageIndex, Math.max(0, nextPinnedMessages.length - 1)),
                                };
                            });
                        }
                        upsertPollInState({
                            ...event.poll,
                            pinned: event.type === "poll:unpinned" ? false : event.type === "poll:pinned" ? true : event.poll.pinned,
                            isPinned: event.type === "poll:unpinned" ? false : event.type === "poll:pinned" ? true : event.poll.isPinned,
                        }, conversationId);
                    } else if (pollId) {
                        PollService.getPoll(groupId, pollId)
                            .then((poll) => {
                                if (event.type === "poll:pinned") {
                                    setState((prev) => ({
                                        ...prev,
                                        pinnedMessages: upsertPinnedPollMessage(
                                            prev.pinnedMessages,
                                            { ...poll, pinned: true, isPinned: true },
                                            conversationId
                                        ),
                                        pinnedMessageIndex: 0,
                                    }));
                                } else if (event.type === "poll:unpinned") {
                                    setState((prev) => {
                                        const nextPinnedMessages = removePinnedPollMessage(prev.pinnedMessages, pollId);
                                        return {
                                            ...prev,
                                            pinnedMessages: nextPinnedMessages,
                                            pinnedMessageIndex: Math.min(prev.pinnedMessageIndex, Math.max(0, nextPinnedMessages.length - 1)),
                                        };
                                    });
                                }
                                upsertPollInState(poll, conversationId);
                            })
                            .catch((error: any) => {
                                console.warn("[useGroupChatMessage] Failed to refresh poll event:", error?.message);
                            });
                    }
                });

                // Load pinned messages
                try {
                    const pinnedMsgs = await SocketService.getPinnedMessages(conversationId);
                    setState((prev) => ({
                        ...prev,
                        pinnedMessages: pinnedMsgs || [],
                        pinnedMessageIndex: 0,
                    }));                } catch (error: any) {
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
            SocketService.offMessageReaction();
            SocketService.offMessageReactionRemove();
            SocketService.offMessageSeen();
            SocketService.offTyping();
            SocketService.offPinnedMessage();
            SocketService.offMessageQuoted();
            SocketService.offPollEvent();
            SocketService.offReminderEvents();
        };
    }, [groupId, token]);

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
        highlightedMessageId,
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
            updateReminderBubble,
            loadPolls,
            createPoll,
            votePoll,
            lockPoll,
            pinPoll,
            unpinPoll,
            deletePoll,
            addPollOption,
            retryLoadConversation,
            scrollToMessage,
        },
    };
};
