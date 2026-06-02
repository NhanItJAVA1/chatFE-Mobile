import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
    ActivityIndicator,
    Alert,
    AppState,
    Dimensions,
    Image,
    Linking,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { useAuth, useFriendship } from "../../../shared/hooks";
import { ConversationService, type Conversation, type ConversationLastMessageSummary } from "../../../shared/services/conversationService";
import { SocketService } from "../../../shared/services/socketService";
import { PresenceService, type PresenceStatus } from "../../../shared/services/presenceService";
import searchService, {
    type GlobalSearchLink,
    type GlobalSearchMedia,
    type GlobalSearchMessage,
    type GlobalSearchResult,
    type GlobalSearchUser,
    type SearchTabKey,
} from "../../../shared/services/searchService";
import { Avatar, Card, SectionTitle } from "../components";
import { colors } from "../theme";
import type { Friend } from "@/types";

interface HomeScreenProps {
    onFriendPress?: (friend: any) => void;
    onGroupPress?: (conversation: Conversation) => void;
    onCreateGroupPress?: () => void;
    createdGroupId?: string | null;
    createdGroupData?: any;
    onGroupCreatedAck?: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Normalize pinned boolean from varying backend shapes */
const getIsPinned = (c: Conversation): boolean =>
    !!(c.pinned || (c as any).isPinned);

/** Normalize archived boolean from varying backend shapes */
const getIsArchived = (c: Conversation): boolean =>
    !!(c.archived || (c as any).isArchived);

/** Detect Saved Messages / self-chat conversations */
const getIsSavedMessages = (c: Conversation): boolean =>
    (c as any).type === "saved_messages" ||
    !!(c as any).isSavedMessages ||
    !!(c as any).isSelfChat;

/** Pinned-first sorting comparator */
const sortConversations = (a: Conversation, b: Conversation): number => {
    const pinnedA = getIsPinned(a);
    const pinnedB = getIsPinned(b);

    // Pinned conversations always appear first
    if (pinnedA !== pinnedB) return pinnedA ? -1 : 1;

    // Both pinned → newer pinnedAt first
    if (pinnedA && pinnedB) {
        const pa = new Date((a as any).pinnedAt || 0).getTime() || 0;
        const pb = new Date((b as any).pinnedAt || 0).getTime() || 0;
        if (pa !== pb) return pb - pa;
    }

    // Both unpinned (or same pin time) → newer activity first
    const ta = new Date(
        (a as any).lastMessageAt || (a as any).updatedAt || 0
    ).getTime() || 0;
    const tb = new Date(
        (b as any).lastMessageAt || (b as any).updatedAt || 0
    ).getTime() || 0;
    return tb - ta;
};

export const HomeScreen: React.FC<HomeScreenProps> = ({
    onFriendPress,
    onGroupPress,
    onCreateGroupPress,
    createdGroupId,
    createdGroupData,
    onGroupCreatedAck,
}) => {
    const { user, token } = useAuth();
    const { state, actions } = useFriendship();
    const [query, setQuery] = useState("");
    const [isSearchMode, setIsSearchMode] = useState(false);
    const [activeSearchTab, setActiveSearchTab] = useState<SearchTabKey>("Chats");
    const [globalSearchResult, setGlobalSearchResult] = useState<GlobalSearchResult>({
        users: [],
        conversations: [],
        groups: [],
        messages: [],
        media: [],
        links: [],
        hasMore: false,
    });
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [conversationsLoading, setConversationsLoading] = useState(false);
    const [presenceByUserId, setPresenceByUserId] = useState<Record<string, PresenceStatus>>({});

    // ── Pagination state ─────────────────────────────────────────────
    const PAGE_SIZE = 50;
    const currentPageRef = useRef(1);
    const [hasMorePages, setHasMorePages] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    // ── Pin / Archive state ──────────────────────────────────────────
    const [showArchivedView, setShowArchivedView] = useState(false);
    const [contextMenuConversation, setContextMenuConversation] = useState<Conversation | null>(null);

    const getConversationIdentity = useCallback((conversation: Conversation): string => {
        const id = (conversation as any)?.id || (conversation as any)?._id;
        if (id) {
            return String(id);
        }

        if ((conversation as any)?.pairKey) {
            return String((conversation as any).pairKey);
        }

        return `${conversation?.type || "UNKNOWN"}::${conversation?.name || "unknown"}`;
    }, []);

    const dedupeConversations = useCallback((items: Conversation[]): Conversation[] => {
        const map = new Map<string, Conversation>();

        items.forEach((conversation) => {
            if (!conversation) return;

            const identity = getConversationIdentity(conversation);
            const existing = map.get(identity);

            if (!existing) {
                map.set(identity, conversation);
                return;
            }

            const existingTs = new Date(
                (existing as any)?.lastMessageAt || (existing as any)?.updatedAt || 0
            ).getTime() || 0;
            const nextTs = new Date(
                (conversation as any)?.lastMessageAt || (conversation as any)?.updatedAt || 0
            ).getTime() || 0;

            // Keep the newer conversation snapshot when duplicates happen.
            map.set(identity, nextTs >= existingTs ? conversation : existing);
        });

        return Array.from(map.values());
    }, [getConversationIdentity]);

    // ── Load more conversations (next page) ──────────────────────────
    const loadMoreConversations = useCallback(async () => {
        if (loadingMore || !hasMorePages) return;
        setLoadingMore(true);
        try {
            const nextPage = currentPageRef.current + 1;
            const items = await ConversationService.getConversations(nextPage, PAGE_SIZE);
            if (items.length < PAGE_SIZE) {
                setHasMorePages(false);
            }
            if (items.length > 0) {
                currentPageRef.current = nextPage;
                setConversations((prev) => dedupeConversations([...prev, ...items]));
            }
        } catch {
            // Silent – user can scroll again to retry
        } finally {
            setLoadingMore(false);
        }
    }, [loadingMore, hasMorePages, dedupeConversations]);

    // ── Scroll handler – load more when near bottom ──────────────────
    const handleScrollEnd = useCallback(
        (event: any) => {
            const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
            const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
            if (distanceFromBottom < 200) {
                loadMoreConversations();
            }
        },
        [loadMoreConversations]
    );

    // Load friends on mount
    useEffect(() => {
        const loadHomeData = async () => {
            setConversationsLoading(true);
            try {
                await Promise.all([
                    actions.loadFriends(),
                    ConversationService.getConversations(1, PAGE_SIZE).then((items) => {
                        currentPageRef.current = 1;
                        setHasMorePages(items.length >= PAGE_SIZE);
                        setConversations(dedupeConversations(items));
                    }),
                ]);
            } finally {
                setConversationsLoading(false);
            }
        };

        loadHomeData();
    }, []);

    // Reload conversations when new group is created
    useEffect(() => {
        if (createdGroupId || createdGroupData) {
            const reloadConversations = async () => {
                try {
                    // If we have the group data, add it directly
                    if (createdGroupData) {
                        setConversations((prev) => {
                            // Ensure the group has required fields for Conversation type
                            const groupAsConversation: any = {
                                _id: createdGroupData._id || createdGroupData.id,
                                id: createdGroupData._id || createdGroupData.id,
                                type: "GROUP",
                                name: createdGroupData.name,
                                ownerId: createdGroupData.ownerId,
                                adminIds: createdGroupData.admins || [],
                                members: createdGroupData.members || [],
                                avatarUrl: createdGroupData.avatarUrl || "",
                                createdAt: createdGroupData.createdAt || new Date().toISOString(),
                                updatedAt: createdGroupData.updatedAt || new Date().toISOString(),
                            };
                            return dedupeConversations([groupAsConversation, ...prev]);
                        });
                    } else {
                        // Fallback: reload all conversations
                        const updated = await ConversationService.getConversations(1, 50);
                        setConversations(dedupeConversations(updated));
                    }
                } catch (err) {
                    console.error("Failed to reload conversations:", err);
                }
            };

            // Small delay to ensure backend has processed the group creation
            const timeout = setTimeout(() => {
                reloadConversations();
                onGroupCreatedAck?.();
            }, 300);

            return () => clearTimeout(timeout);
        }
    }, [createdGroupId, createdGroupData, onGroupCreatedAck, dedupeConversations]);

    const truncateName = (name: string | undefined, maxLength = 20) => {
        if (!name || name.length <= maxLength) {
            return name;
        }
        return name.slice(0, Math.floor(maxLength / 2)) + "...";
    };

    const getConversationId = (conversation: Conversation): string => {
        return conversation.id || conversation._id;
    };

    const currentUserId = String(user?.id || (user as any)?._id || (user as any)?.userId || "");

    const getConversationType = (conversation: Conversation): string => {
        return String(conversation.type || "").toUpperCase();
    };

    const getAnyId = (value: any): string => String(value?.id || value?._id || value?.userId || value?.messageId || "");

    const isSelfConversation = useCallback(
        (conversation: Conversation): boolean => {
            // Check Saved Messages detection from guide
            if (getIsSavedMessages(conversation)) return true;

            const pairKey = String(conversation.pairKey || "");

            if (currentUserId && pairKey === `self_${currentUserId}`) {
                return true;
            }

            return (
                getConversationType(conversation) === "PRIVATE" &&
                String(conversation.name || "").toLowerCase() === "my document"
            );
        },
        [currentUserId]
    );

    const getOtherMemberId = useCallback(
        (conversation: Conversation): string | undefined => {
            if (isSelfConversation(conversation)) {
                return currentUserId || undefined;
            }

            const explicitOtherUserId =
                (conversation as any)?.otherUser?.id ||
                (conversation as any)?.otherUser?._id ||
                (conversation as any)?.targetUserId;

            if (explicitOtherUserId) {
                return String(explicitOtherUserId);
            }

            if (conversation.pairKey && currentUserId) {
                const ids = conversation.pairKey.split("_");
                const otherId = ids.find((id) => id && id !== currentUserId && id !== "self");
                if (otherId) {
                    return otherId;
                }
            }

            return conversation.members?.find((memberId) => String(memberId) !== currentUserId);
        },
        [currentUserId, isSelfConversation]
    );

    const getConversationDisplayInfo = useCallback(
        (conversation: Conversation) => {
            const conversationType = getConversationType(conversation);
            const otherMemberId = getOtherMemberId(conversation);
            const otherUser =
                (conversation as any)?.otherUser ||
                (conversation as any)?.targetUser ||
                (conversation as any)?.user;
            const friend = otherMemberId
                ? state?.friends?.find((f) => f.friendId === otherMemberId)
                : undefined;

            if (isSelfConversation(conversation)) {
                return {
                    displayName: "My Document",
                    displayAvatar: conversation.avatarUrl,
                    otherMemberId: currentUserId,
                    searchText: "my document tài liệu lưu trữ",
                };
            }

            if (conversationType === "GROUP") {
                const displayName = conversation.name || "Nhóm";
                return {
                    displayName,
                    displayAvatar: conversation.avatarUrl,
                    otherMemberId: undefined,
                    searchText: displayName,
                };
            }

            const displayName =
                friend?.friendInfo?.displayName ||
                otherUser?.displayName ||
                otherUser?.name ||
                conversation.name ||
                "Người dùng";
            const displayAvatar =
                friend?.friendInfo?.avatar ||
                otherUser?.avatarUrl ||
                otherUser?.avatar ||
                conversation.avatarUrl;

            return {
                displayName,
                displayAvatar,
                otherMemberId,
                searchText: [
                    displayName,
                    friend?.friendInfo?.phoneNumber,
                    otherUser?.phoneNumber,
                    otherUser?.phone,
                    otherMemberId,
                ]
                    .filter(Boolean)
                    .join(" "),
            };
        },
        [currentUserId, getOtherMemberId, isSelfConversation, state?.friends]
    );

    const getLastMessageId = (conversation?: Conversation): string | undefined => {
        if (!conversation?.lastMessage) return undefined;
        const lastMessage = conversation.lastMessage as any;
        return lastMessage.messageId || lastMessage.id || lastMessage._id;
    };

    const updateConversationLastMessage = useCallback(
        (conversationId: string, updater: (conversation: Conversation) => Conversation | null) => {
            if (!conversationId) return;

            setConversations((prev) => {
                const next = prev
                    .map((conversation) => {
                        const id = conversation.id || conversation._id;
                        if (id !== conversationId) return conversation;

                        const updated = updater(conversation);
                        return updated || conversation;
                    })
                    .filter(Boolean) as Conversation[];

                return [...next].sort(sortConversations);
            });
        },
        []
    );

    const getPreviewFromMessageType = (messageType: string): string => {
        const upperType = String(messageType || "").toUpperCase();
        if (upperType === "IMAGE") return "📷 Image";
        if (upperType === "VIDEO") return "🎬 Video";
        if (upperType === "AUDIO") return "🎤 Audio";
        if (upperType === "FILE" || upperType === "DOCUMENT") return "📎 File";
        return "Tin nhắn";
    };

    const getLastMessageCreatedAt = (conversation?: Conversation): string | undefined => {
        if (!conversation?.lastMessage) return conversation?.lastMessageAt;
        const lastMessage = conversation.lastMessage as any;
        return conversation.lastMessageAt || lastMessage.createdAt;
    };

    const formatChatTime = (iso?: string): string => {
        if (!iso) return "";
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return "";

        const now = new Date();
        const isSameDay =
            d.getFullYear() === now.getFullYear() &&
            d.getMonth() === now.getMonth() &&
            d.getDate() === now.getDate();

        if (isSameDay) {
            return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
        }

        return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
    };

    const getLastMessagePreview = (conversation?: Conversation, fallbackStatus?: string): string => {
        if (!conversation?.lastMessage) {
            return fallbackStatus === "online" ? "Online" : "Offline";
        }

        const lastMessage = conversation.lastMessage as ConversationLastMessageSummary & { text?: string; media?: any[] };

        if (lastMessage.textPreview) return lastMessage.textPreview;
        if (lastMessage.text) return lastMessage.text;

        const messageType = String(lastMessage.type || "").toUpperCase();
        if (messageType === "IMAGE") return "📷 Image";
        if (messageType === "VIDEO") return "🎬 Video";
        if (messageType === "AUDIO") return "🎤 Audio";
        if (messageType === "FILE" || messageType === "DOCUMENT") return "📎 File";

        if (Array.isArray(lastMessage.media) && lastMessage.media.length > 0) {
            const mediaType = String(lastMessage.media[0]?.mediaType || "").toLowerCase();
            if (mediaType === "image") return "📷 Image";
            if (mediaType === "video") return "🎬 Video";
            if (mediaType === "audio") return "🎤 Audio";
            return "📎 File";
        }

        return "Tin nhắn";
    };

    const normalizeConversationFromSocket = useCallback((raw: any): Conversation | null => {
        const source = raw?.conversation || raw?.data?.conversation || raw?.data || raw;
        const id = source?._id || source?.id || source?.conversationId;

        if (!id) {
            return null;
        }

        return {
            ...source,
            _id: String(id),
            id: String(id),
            type: String(source?.type || "GROUP").toUpperCase() === "PRIVATE" ? "PRIVATE" : "GROUP",
            name: source?.name,
            members: source?.members || [],
            avatarUrl: source?.avatarUrl || source?.avatar || "",
            ownerId: source?.ownerId,
            adminIds: source?.adminIds || source?.admins || [],
            lastMessage: source?.lastMessage,
            lastMessageAt: source?.lastMessageAt,
            unreadCount: source?.unreadCount || 0,
            createdAt: source?.createdAt || new Date().toISOString(),
            updatedAt: source?.updatedAt || new Date().toISOString(),
        } as Conversation;
    }, []);

    // ── Delete conversation ──────────────────────────────────────────
    const handleDeleteConversation = useCallback((conversation: Conversation) => {
        const conversationId = getConversationId(conversation);
        if (!conversationId) return;

        Alert.alert(
            "Xóa cuộc trò chuyện",
            "Thao tác này chỉ xóa cuộc trò chuyện ở phía bạn.",
            [
                { text: "Hủy", style: "cancel" },
                {
                    text: "Xóa",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await ConversationService.deleteConversation(conversationId);
                            setConversations((prev) =>
                                prev.filter((item) => getConversationId(item) !== conversationId)
                            );
                        } catch (error: any) {
                            Alert.alert("Lỗi", error?.message || "Không thể xóa cuộc trò chuyện");
                        }
                    },
                },
            ]
        );
    }, []);

    // ── Pin / Unpin with optimistic update ───────────────────────────
    const handlePinConversation = useCallback((conversation: Conversation) => {
        const conversationId = getConversationId(conversation);
        if (!conversationId) return;

        const wasPinned = getIsPinned(conversation);
        const prevPinnedAt = (conversation as any).pinnedAt;

        // Optimistic update
        setConversations((prev) => {
            const next = prev.map((c) => {
                const id = c.id || c._id;
                if (id !== conversationId) return c;
                if (wasPinned) {
                    // Unpin
                    return { ...c, pinned: false, isPinned: false, pinnedAt: undefined } as Conversation;
                } else {
                    // Pin
                    return { ...c, pinned: true, isPinned: true, pinnedAt: new Date().toISOString() } as Conversation;
                }
            });
            return [...next].sort(sortConversations);
        });

        // Call API
        const apiCall = wasPinned
            ? ConversationService.unpinConversation(conversationId)
            : ConversationService.pinConversation(conversationId);

        apiCall.catch(() => {
            // Rollback
            setConversations((prev) => {
                const next = prev.map((c) => {
                    const id = c.id || c._id;
                    if (id !== conversationId) return c;
                    return { ...c, pinned: wasPinned, isPinned: wasPinned, pinnedAt: prevPinnedAt } as Conversation;
                });
                return [...next].sort(sortConversations);
            });
            Alert.alert("Lỗi", wasPinned ? "Không thể bỏ ghim" : "Không thể ghim cuộc trò chuyện");
        });
    }, []);

    // ── Archive / Unarchive with optimistic update ───────────────────
    const handleArchiveConversation = useCallback((conversation: Conversation) => {
        const conversationId = getConversationId(conversation);
        if (!conversationId) return;

        // Guard: do not archive Saved Messages
        if (isSelfConversation(conversation)) return;

        const wasArchived = getIsArchived(conversation);

        // Optimistic update
        setConversations((prev) => {
            const next = prev.map((c) => {
                const id = c.id || c._id;
                if (id !== conversationId) return c;
                if (wasArchived) {
                    return { ...c, archived: false, isArchived: false } as Conversation;
                } else {
                    return { ...c, archived: true, isArchived: true } as Conversation;
                }
            });
            return [...next].sort(sortConversations);
        });

        // Call API
        const apiCall = wasArchived
            ? ConversationService.unarchiveConversation(conversationId)
            : ConversationService.archiveConversation(conversationId);

        apiCall.catch(() => {
            // Rollback
            setConversations((prev) => {
                const next = prev.map((c) => {
                    const id = c.id || c._id;
                    if (id !== conversationId) return c;
                    return { ...c, archived: wasArchived, isArchived: wasArchived } as Conversation;
                });
                return [...next].sort(sortConversations);
            });
            Alert.alert("Lỗi", wasArchived ? "Không thể bỏ lưu trữ" : "Không thể lưu trữ cuộc trò chuyện");
        });
    }, [isSelfConversation]);

    // ── Context menu handler ─────────────────────────────────────────
    const handleLongPress = useCallback((conversation: Conversation) => {
        setContextMenuConversation(conversation);
    }, []);

    const closeContextMenu = useCallback(() => {
        setContextMenuConversation(null);
    }, []);

    useEffect(() => {
        if (!token) {
            return;
        }

        PresenceService.connect(token);

        const privateUserIds = conversations
            .filter((conversation) => getConversationType(conversation) !== "GROUP")
            .map((conversation) => getConversationDisplayInfo(conversation).otherMemberId)
            .filter(Boolean) as string[];

        PresenceService.getBatchOnlineStatus(privateUserIds)
            .then((statuses) => {
                setPresenceByUserId((prev) => ({ ...prev, ...statuses }));
            })
            .catch(() => { });

        const updatePresence = (status: PresenceStatus) => {
            const userId = String(status?.userId || (status as any)?.id || "");
            if (!userId) return;
            setPresenceByUserId((prev) => ({
                ...prev,
                [userId]: {
                    ...prev[userId],
                    ...status,
                    userId,
                },
            }));
        };

        PresenceService.onOnline((status) => updatePresence({ ...status, online: true, isOnline: true }));
        PresenceService.onOffline((status) => updatePresence({ ...status, online: false, isOnline: false }));

        return () => {
            PresenceService.offPresenceEvents();
        };
    }, [token, conversations, getConversationDisplayInfo]);

    useEffect(() => {
        if (!token) {
            return;
        }

        try {
            if (!SocketService.isConnected()) {
                SocketService.connect(token);
            }
        } catch {
            return;
        }

        const socket = SocketService.getSocket();
        if (!socket) {
            return;
        }

        const userCandidateIds = [user?.id, (user as any)?._id, (user as any)?.userId]
            .filter(Boolean)
            .map((id) => String(id));
        const currentUserId = userCandidateIds[0] || "";

        const handleReceiveMessage = (data: any) => {
            const message = data?.message || data?.systemMessage || data?.activityMessage || data;
            const conversationId = String(message?.conversationId || data?.conversationId || "");
            if (!conversationId) return;

            setConversations((prev) => {
                const next = prev.map((conversation) => {
                    const id = conversation.id || conversation._id;
                    if (id !== conversationId) return conversation;

                    const textPreview = message?.text?.trim()
                        ? message.text
                        : message?.content?.trim()
                            ? message.content
                            : message?.message?.trim()
                                ? message.message
                        : getPreviewFromMessageType(message?.type || "");

                    const nextUnread =
                        message?.senderId && currentUserId && message.senderId !== currentUserId
                            ? (conversation.unreadCount || 0) + 1
                            : (conversation.unreadCount || 0);

                    return {
                        ...conversation,
                        lastMessage: {
                            messageId: message?._id || message?.id || "",
                            senderId: message?.senderId || "",
                            type: String(message?.type || "TEXT").toUpperCase(),
                            textPreview,
                            createdAt: message?.createdAt || new Date().toISOString(),
                        },
                        lastMessageAt: message?.createdAt || new Date().toISOString(),
                        unreadCount: nextUnread,
                        lastMessageStatus:
                            message?.senderId && currentUserId && message.senderId === currentUserId
                                ? "sent"
                                : conversation.lastMessageStatus,
                    } as Conversation;
                });

                // Use pinned-first sort instead of simple time sort
                return [...next].sort(sortConversations);
            });
        };

        const handleMessageSeen = (data: any) => {
            const conversationId = data?.conversationId;
            if (!conversationId) return;

            setConversations((prev) =>
                prev.map((conversation) => {
                    const id = conversation.id || conversation._id;
                    if (id !== conversationId) return conversation;

                    const lastMessageId = getLastMessageId(conversation);
                    const isLastSeen = !!lastMessageId && lastMessageId === data?.lastSeenMessageId;

                    return {
                        ...conversation,
                        lastMessageStatus: isLastSeen ? "read" : conversation.lastMessageStatus,
                    };
                })
            );
        };

        const handleMessageEdited = (data: any) => {
            const message = data?.message || data;
            const conversationId = String(message?.conversationId || data?.conversationId || "");
            const messageId = String(message?._id || message?.id || data?.messageId || "");

            if (!conversationId || !messageId) return;

            updateConversationLastMessage(conversationId, (conversation) => {
                const lastMessageId = getLastMessageId(conversation);
                if (lastMessageId !== messageId) return conversation;

                return {
                    ...conversation,
                    lastMessage: {
                        ...(conversation.lastMessage as any),
                        messageId,
                        senderId: message?.senderId || (conversation.lastMessage as any)?.senderId || "",
                        type: String(message?.type || (conversation.lastMessage as any)?.type || "TEXT").toUpperCase(),
                        textPreview: message?.text?.trim()
                            ? message.text
                            : (conversation.lastMessage as any)?.textPreview || getPreviewFromMessageType(message?.type || ""),
                        createdAt: message?.createdAt || (conversation.lastMessage as any)?.createdAt || conversation.lastMessageAt,
                    },
                    lastMessageAt: message?.createdAt || conversation.lastMessageAt,
                } as Conversation;
            });
        };

        const handleMessageRevoked = (data: any) => {
            const message = data?.message || data;
            const conversationId = String(message?.conversationId || data?.conversationId || "");
            const messageId = String(message?._id || message?.id || data?.messageId || "");

            if (!conversationId || !messageId) return;

            updateConversationLastMessage(conversationId, (conversation) => {
                const lastMessageId = getLastMessageId(conversation);
                if (lastMessageId !== messageId) return conversation;

                return {
                    ...conversation,
                    lastMessage: {
                        ...(conversation.lastMessage as any),
                        messageId,
                        senderId: message?.senderId || (conversation.lastMessage as any)?.senderId || "",
                        type: "SYSTEM",
                        textPreview: "Đã thu hồi",
                        createdAt: message?.createdAt || (conversation.lastMessage as any)?.createdAt || conversation.lastMessageAt,
                    },
                    lastMessageAt: message?.createdAt || conversation.lastMessageAt,
                } as Conversation;
            });
        };

        const handleMessageDeletedForEveryone = (data: any) => {
            const message = data?.message || data;
            const conversationId = String(message?.conversationId || data?.conversationId || "");
            const messageId = String(message?._id || message?.id || data?.messageId || "");

            if (!conversationId || !messageId) return;

            updateConversationLastMessage(conversationId, (conversation) => {
                const lastMessageId = getLastMessageId(conversation);
                if (lastMessageId !== messageId) return conversation;

                return {
                    ...conversation,
                    lastMessage: {
                        ...(conversation.lastMessage as any),
                        messageId,
                        senderId: message?.senderId || (conversation.lastMessage as any)?.senderId || "",
                        type: "SYSTEM",
                        textPreview: "Tin nhắn đã bị xóa",
                        createdAt: message?.createdAt || (conversation.lastMessage as any)?.createdAt || conversation.lastMessageAt,
                    },
                    lastMessageAt: message?.createdAt || conversation.lastMessageAt,
                } as Conversation;
            });
        };

        const handleGroupCreated = (data: any) => {
            const conversation = normalizeConversationFromSocket(data);
            if (conversation) {
                setConversations((prev) => dedupeConversations([conversation, ...prev]).sort(sortConversations));
            }

            // Reload conversations when a new group is created or approved for current user.
            ConversationService.getConversations(1, PAGE_SIZE).then((updated) => {
                setConversations(dedupeConversations(updated));
            });
        };

        const handleGroupMembersAdded = (data: any) => {
            const conversationId = String(
                data?.conversationId || data?.groupId || data?.conversation?._id || data?.conversation?.id || ""
            );
            const newMembers = Array.isArray(data?.newMembers) ? data.newMembers : [];

            if (!conversationId || newMembers.length === 0 || userCandidateIds.length === 0) {
                return;
            }

            const isCurrentUserAdded = newMembers.some((member: any) =>
                userCandidateIds.includes(String(member?.userId || member?.id || ""))
            );

            if (!isCurrentUserAdded) {
                return;
            }

            ConversationService.getConversations(1, PAGE_SIZE).then((updated) => {
                setConversations(dedupeConversations(updated));
            });
        };

        const handleGroupMemberRemoved = (data: any) => {
            const conversationId = String(
                data?.conversationId ||
                data?.groupId ||
                data?.conversation?._id ||
                data?.conversation?.id ||
                ""
            );
            const removedUserId = String(
                data?.removedUserId ||
                data?.userId ||
                data?.member?.userId ||
                ""
            );

            if (!conversationId || !removedUserId || userCandidateIds.length === 0) {
                return;
            }

            if (!userCandidateIds.includes(removedUserId)) {
                return;
            }

            setConversations((prev) =>
                prev.filter((conversation) => {
                    const id = conversation.id || conversation._id;
                    return id !== conversationId;
                })
            );
        };

        const handleConversationUpdated = (data: any) => {
            const conversationId = String(
                data?.conversationId || data?.conversation?._id || data?.conversation?.id || ""
            );
            if (!conversationId || userCandidateIds.length === 0) {
                return;
            }

            const members: string[] = (data?.data?.members || data?.conversation?.members || [])
                .filter(Boolean)
                .map((id: any) => String(id));

            if (members.length > 0 && !userCandidateIds.some((id) => members.includes(id))) {
                setConversations((prev) =>
                    prev.filter((conversation) => {
                        const id = conversation.id || conversation._id;
                        return id !== conversationId;
                    })
                );
            }
        };

        // ── Pin socket event ─────────────────────────────────────────
        const handlePinToggled = (data: any) => {
            const conversationId = String(data?.conversationId || "");
            if (!conversationId) return;

            const pinned = !!data?.pinned;
            const pinnedAt = data?.pinnedAt || (pinned ? new Date().toISOString() : undefined);

            setConversations((prev) => {
                const next = prev.map((c) => {
                    const id = c.id || c._id;
                    if (id !== conversationId) return c;
                    return {
                        ...c,
                        pinned,
                        isPinned: pinned,
                        pinnedAt: pinned ? pinnedAt : undefined,
                    } as Conversation;
                });
                return [...next].sort(sortConversations);
            });
        };

        // ── Archive socket event ─────────────────────────────────────
        const handleArchivedToggled = (data: any) => {
            const conversationId = String(data?.conversationId || "");
            if (!conversationId) return;

            const archived = !!data?.archived;

            setConversations((prev) => {
                const next = prev.map((c) => {
                    const id = c.id || c._id;
                    if (id !== conversationId) return c;
                    return {
                        ...c,
                        archived,
                        isArchived: archived,
                    } as Conversation;
                });
                return [...next].sort(sortConversations);
            });
        };

        socket.on("receiveMessage", handleReceiveMessage);
        socket.on("messageSeen", handleMessageSeen);
        socket.on("message:edited", handleMessageEdited);
        socket.on("message:revoked", handleMessageRevoked);
        socket.on("message:deleted_for_everyone", handleMessageDeletedForEveryone);
        socket.on("conversation:created", handleGroupCreated);
        socket.on("conversation:members_added", handleGroupMembersAdded);
        socket.on("conversation:member_removed", handleGroupMemberRemoved);
        socket.on("conversation:updated", handleConversationUpdated);
        socket.on("conversation:pin_toggled", handlePinToggled);
        socket.on("conversation:archived_toggled", handleArchivedToggled);

        return () => {
            socket.off("receiveMessage", handleReceiveMessage);
            socket.off("messageSeen", handleMessageSeen);
            socket.off("message:edited", handleMessageEdited);
            socket.off("message:revoked", handleMessageRevoked);
            socket.off("message:deleted_for_everyone", handleMessageDeletedForEveryone);
            socket.off("conversation:created", handleGroupCreated);
            socket.off("conversation:members_added", handleGroupMembersAdded);
            socket.off("conversation:member_removed", handleGroupMemberRemoved);
            socket.off("conversation:updated", handleConversationUpdated);
            socket.off("conversation:pin_toggled", handlePinToggled);
            socket.off("conversation:archived_toggled", handleArchivedToggled);
        };
    }, [token, user?.id, (user as any)?._id, dedupeConversations, updateConversationLastMessage, normalizeConversationFromSocket]);

    // Refresh conversations when app returns to foreground
    useEffect(() => {
        if (!token) {
            return;
        }

        let isMounted = true;

        const refreshConversations = async () => {
            try {
                // Reload all pages that were previously loaded
                const totalLoaded = currentPageRef.current * PAGE_SIZE;
                const updated = await ConversationService.getConversations(1, Math.max(totalLoaded, PAGE_SIZE));
                if (isMounted) {
                    setConversations(dedupeConversations(updated));
                }
            } catch {
                // Silent fallback; socket path is still primary source.
            }
        };

        // Only refresh when app returns to foreground, no polling interval
        const appStateSub = AppState.addEventListener("change", (nextState) => {
            if (nextState === "active") {
                refreshConversations();
            }
        });

        return () => {
            isMounted = false;
            appStateSub.remove();
        };
    }, [token, dedupeConversations]);

    // ── Derived lists ────────────────────────────────────────────────

    const normalConversations = useMemo(() => {
        const needle = query.trim().toLowerCase();
        const nonArchived = conversations
            .filter((c) => !getIsArchived(c))
            .sort(sortConversations);

        if (!needle) return nonArchived;

        return nonArchived.filter((conv) => {
            const displayInfo = getConversationDisplayInfo(conv);
            return displayInfo.searchText.toLowerCase().includes(needle);
        });
    }, [conversations, query, getConversationDisplayInfo]);

    const archivedConversations = useMemo(() => {
        return conversations.filter((c) => getIsArchived(c)).sort(sortConversations);
    }, [conversations]);

    const archivedUnreadCount = useMemo(() => {
        return archivedConversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
    }, [archivedConversations]);

    const archivedPreviewNames = useMemo(() => {
        return archivedConversations
            .map((c) => getConversationDisplayInfo(c).displayName)
            .filter(Boolean)
            .join(", ");
    }, [archivedConversations, getConversationDisplayInfo]);

    // Use whichever list the current view requires
    const displayConversations = showArchivedView ? archivedConversations : normalConversations;

    useEffect(() => {
        if (!isSearchMode) return;

        const trimmed = query.trim();
        if (!trimmed) {
            setGlobalSearchResult({
                users: [],
                conversations: [],
                groups: [],
                messages: [],
                media: [],
                links: [],
                hasMore: false,
            });
            setSearchLoading(false);
            setSearchError(null);
            return;
        }

        let active = true;
        const timeout = setTimeout(() => {
            setSearchLoading(true);
            setSearchError(null);
            searchService.globalSearch({ query: trimmed, type: "ALL", limit: 10, contextLimit: 1 })
                .then((result) => {
                    if (active) setGlobalSearchResult(result);
                })
                .catch((error: any) => {
                    if (!active) return;
                    setSearchError(error?.message || "Không thể tìm kiếm");
                    setGlobalSearchResult({
                        users: [],
                        conversations: [],
                        groups: [],
                        messages: [],
                        media: [],
                        links: [],
                        hasMore: false,
                    });
                })
                .finally(() => {
                    if (active) setSearchLoading(false);
                });
        }, 350);

        return () => {
            active = false;
            clearTimeout(timeout);
        };
    }, [isSearchMode, query]);

    const searchTabs: SearchTabKey[] = ["Chats", "Groups", "Messages", "Media", "Links", "Files", "Voice"];

    const localPrivateSearchResults = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return [];
        return conversations
            .filter((conversation) => getConversationType(conversation) !== "GROUP" && !getIsArchived(conversation))
            .filter((conversation) => getConversationDisplayInfo(conversation).searchText.toLowerCase().includes(needle))
            .sort(sortConversations);
    }, [conversations, query, getConversationDisplayInfo]);

    const localGroupSearchResults = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return [];
        return conversations
            .filter((conversation) => getConversationType(conversation) === "GROUP" && !getIsArchived(conversation))
            .filter((conversation) => getConversationDisplayInfo(conversation).searchText.toLowerCase().includes(needle))
            .sort(sortConversations);
    }, [conversations, query, getConversationDisplayInfo]);

    const dedupedGlobalGroups = useMemo(() => {
        const map = new Map<string, Conversation>();
        [...globalSearchResult.groups, ...globalSearchResult.conversations]
            .filter((conversation) => getConversationType(conversation) === "GROUP")
            .forEach((conversation) => {
                const id = getAnyId(conversation);
                if (id && !map.has(id)) map.set(id, conversation);
            });
        return Array.from(map.values());
    }, [globalSearchResult.groups, globalSearchResult.conversations]);

    const mergeUniqueConversations = (items: Conversation[]): Conversation[] => {
        const map = new Map<string, Conversation>();
        items.forEach((conversation) => {
            const id = getAnyId(conversation) || getConversationIdentity(conversation);
            if (id && !map.has(id)) {
                map.set(id, conversation);
            }
        });
        return Array.from(map.values());
    };

    const getMediaKind = (media: GlobalSearchMedia): string => {
        return String(media.type || media.mediaType || media.mimeType || media.mimetype || "").toLowerCase();
    };

    const tabMediaResults = useMemo(() => {
        return globalSearchResult.media.filter((media) => {
            const kind = getMediaKind(media);
            if (activeSearchTab === "Media") {
                return kind.includes("image") || kind.includes("video");
            }
            if (activeSearchTab === "Files") {
                return kind.includes("file") || kind.includes("document") || kind.includes("audio") || kind.includes("music");
            }
            if (activeSearchTab === "Voice") {
                return kind.includes("voice");
            }
            return false;
        });
    }, [globalSearchResult.media, activeSearchTab]);

    /**
     * Handle friend press - navigate to chat
     */
    const handleFriendPress = (friend: Friend) => {
        if (onFriendPress) {
            const chatUserData = {
                id: friend.friendId,
                displayName: friend.friendInfo?.displayName,
                avatar: friend.friendInfo?.avatar,
                avatarUrl: friend.friendInfo?.avatar,
                phone: friend.friendInfo?.phoneNumber,
                status: friend.friendInfo?.status,
                _id: friend._id,
            }; onFriendPress(chatUserData);
        }
    };

    const handleConversationPress = (conversation: Conversation) => {
        const conversationType = getConversationType(conversation);
        if (conversationType === "GROUP") {
            if (onGroupPress) {
                onGroupPress(conversation);
            }
            return;
        }

        const displayInfo = getConversationDisplayInfo(conversation);
        const otherMemberId = displayInfo.otherMemberId;
        const friend = otherMemberId
            ? state?.friends?.find((f) => f.friendId === otherMemberId)
            : undefined;
        if (friend) {
            handleFriendPress(friend);
            return;
        }

        if (!otherMemberId) {
            console.warn("[HomeScreen] Cannot open private conversation without target user id:", {
                conversationId: conversation._id || conversation.id,
                pairKey: conversation.pairKey,
            });
            return;
        }

        onFriendPress?.({
            id: otherMemberId,
            displayName: displayInfo.displayName,
            avatar: displayInfo.displayAvatar,
            avatarUrl: displayInfo.displayAvatar,
            conversationId: conversation._id || conversation.id,
            conversationType: "PRIVATE",
            isSelfChat: isSelfConversation(conversation),
            relationship: isSelfConversation(conversation) ? "self" : "stranger",
        });
    };

    const closeSearchMode = () => {
        setIsSearchMode(false);
        setQuery("");
        setActiveSearchTab("Chats");
        setSearchError(null);
    };

    const openConversationFromSearchPayload = (payload: any) => {
        const conversation = payload?.conversation || payload;
        const conversationId = String(payload?.conversationId || conversation?._id || conversation?.id || "");
        const conversationType = String(payload?.conversationType || conversation?.type || "").toUpperCase();
        const messageId = String(payload?.messageId || payload?.id || payload?._id || "");
        const searchTarget = {
            searchTargetMessageId: messageId,
            searchTargetMessage: payload,
            searchContextMessages: Array.isArray(payload?.context) ? payload.context : [],
        };

        if (conversationType === "GROUP" || getConversationType(conversation) === "GROUP") {
            onGroupPress?.({
                ...(conversation || {}),
                _id: conversationId || conversation?._id,
                id: conversationId || conversation?.id,
                type: "GROUP",
                ...searchTarget,
            } as Conversation);
            return;
        }

        const members = Array.isArray(conversation?.members) ? conversation.members : [];
        const otherMemberId = members.find((memberId: string) => String(memberId) !== currentUserId);
        const targetUserId = String(payload?.targetUserId || payload?.userId || otherMemberId || payload?.senderId || "");
        if (!targetUserId && !conversationId) return;

        onFriendPress?.({
            id: targetUserId,
            displayName: payload?.senderName || conversation?.name || "Người dùng",
            conversationId,
            conversationType: "PRIVATE",
            relationship: targetUserId === currentUserId ? "self" : "stranger",
            ...searchTarget,
        });
    };

    const openGlobalUser = (userItem: GlobalSearchUser) => {
        const userId = getAnyId(userItem);
        if (!userId) return;
        onFriendPress?.({
            id: userId,
            displayName: userItem.displayName || userItem.name || userItem.username || "Người dùng",
            avatar: userItem.avatar || userItem.avatarUrl,
            avatarUrl: userItem.avatarUrl || userItem.avatar,
            phone: userItem.phone || userItem.phoneNumber,
            conversationType: "PRIVATE",
            relationship: "stranger",
        });
    };

    const openSearchItemMenu = (item: GlobalSearchMedia | GlobalSearchLink) => {
        const isLink = !!(item as GlobalSearchLink).url && activeSearchTab === "Links";
        Alert.alert(
            isLink ? "Tùy chọn liên kết" : "Tùy chọn tệp",
            isLink ? (item as GlobalSearchLink).url : ((item as GlobalSearchMedia).name || (item as GlobalSearchMedia).fileName || "Nội dung"),
            [
                ...(isLink
                    ? [{
                        text: "Mở liên kết",
                        onPress: () => Linking.openURL((item as GlobalSearchLink).url).catch(() => Alert.alert("Lỗi", "Không mở được liên kết")),
                    }]
                    : []),
                {
                    text: "Hiện trong chat",
                    onPress: () => openConversationFromSearchPayload(item),
                },
                { text: "Hủy", style: "cancel" },
            ],
        );
    };

    const renderSearchPersonRow = (item: GlobalSearchUser | Conversation, source: "user" | "conversation") => {
        const isConversation = source === "conversation";
        const displayInfo = isConversation
            ? getConversationDisplayInfo(item as Conversation)
            : {
                displayName: (item as GlobalSearchUser).displayName || (item as GlobalSearchUser).name || (item as GlobalSearchUser).username || "Người dùng",
                displayAvatar: (item as GlobalSearchUser).avatarUrl || (item as GlobalSearchUser).avatar,
            };
        const key = `${source}-${getAnyId(item)}-${displayInfo.displayName}`;
        return (
            <Pressable
                key={key}
                style={({ pressed }) => [styles.searchResultRow, pressed && styles.chatRowPressed]}
                onPress={() => isConversation ? handleConversationPress(item as Conversation) : openGlobalUser(item as GlobalSearchUser)}
            >
                {displayInfo.displayAvatar ? (
                    <Image source={{ uri: displayInfo.displayAvatar }} style={styles.searchAvatar} />
                ) : (
                    <Avatar label={displayInfo.displayName.slice(0, 1).toUpperCase()} size={46} backgroundColor={colors.accentStrong} />
                )}
                <View style={styles.searchResultMeta}>
                    <Text style={styles.searchResultTitle} numberOfLines={1}>{displayInfo.displayName}</Text>
                    <Text style={styles.searchResultSubtitle} numberOfLines={1}>
                        {isConversation && getConversationType(item as Conversation) === "GROUP" ? "Nhóm chat" : "Cuộc trò chuyện"}
                    </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
        );
    };

    const renderSearchMessageRow = (message: GlobalSearchMessage) => {
        const messageId = String(message.messageId || message.id || message._id || "");
        return (
            <Pressable
                key={`message-${messageId}-${message.conversationId}`}
                style={({ pressed }) => [styles.searchResultRow, pressed && styles.chatRowPressed]}
                onPress={() => openConversationFromSearchPayload(message)}
            >
                <View style={styles.searchIconWrap}>
                    <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.accent} />
                </View>
                <View style={styles.searchResultMeta}>
                    <Text style={styles.searchResultTitle} numberOfLines={1}>
                        {message.senderName || "Tin nhắn"}
                    </Text>
                    <Text style={styles.searchResultSubtitle} numberOfLines={2}>
                        {message.text || "Không có nội dung văn bản"}
                    </Text>
                </View>
            </Pressable>
        );
    };

    const renderSearchMediaRow = (media: GlobalSearchMedia) => (
        <Pressable
            key={`media-${media.messageId || media.id || media._id || media.url}`}
            style={({ pressed }) => [styles.searchResultRow, pressed && styles.chatRowPressed]}
            onPress={() => media.url ? Linking.openURL(media.url).catch(() => { }) : openConversationFromSearchPayload(media)}
            onLongPress={() => openSearchItemMenu(media)}
        >
            <View style={styles.searchIconWrap}>
                <Ionicons
                    name={getMediaKind(media).includes("image") ? "image-outline" : getMediaKind(media).includes("video") ? "videocam-outline" : "document-outline"}
                    size={22}
                    color={colors.accent}
                />
            </View>
            <View style={styles.searchResultMeta}>
                <Text style={styles.searchResultTitle} numberOfLines={1}>{media.name || media.fileName || "Tệp đính kèm"}</Text>
                <Text style={styles.searchResultSubtitle} numberOfLines={1}>Nhấn giữ để xem tùy chọn</Text>
            </View>
        </Pressable>
    );

    const renderSearchLinkRow = (link: GlobalSearchLink) => (
        <Pressable
            key={`link-${link.messageId || link.id || link._id || link.url}`}
            style={({ pressed }) => [styles.searchResultRow, pressed && styles.chatRowPressed]}
            onPress={() => Linking.openURL(link.url).catch(() => Alert.alert("Lỗi", "Không mở được liên kết"))}
            onLongPress={() => openSearchItemMenu(link)}
        >
            <View style={styles.searchIconWrap}>
                <Ionicons name="link-outline" size={22} color={colors.accent} />
            </View>
            <View style={styles.searchResultMeta}>
                <Text style={styles.searchResultTitle} numberOfLines={1}>{link.title || link.url}</Text>
                <Text style={styles.searchResultSubtitle} numberOfLines={1}>{link.description || link.url}</Text>
            </View>
        </Pressable>
    );

    const renderGlobalSearchResults = () => {
        if (!query.trim()) {
            return (
                <View style={styles.searchEmptyState}>
                    <Ionicons name="search" size={46} color={colors.textMuted} />
                    <Text style={styles.emptyText}>Nhập từ khóa để tìm kiếm</Text>
                </View>
            );
        }

        if (searchLoading) {
            return (
                <View style={styles.searchEmptyState}>
                    <ActivityIndicator color={colors.accent} />
                    <Text style={styles.emptyText}>Đang tìm kiếm...</Text>
                </View>
            );
        }

        if (searchError) {
            return (
                <View style={styles.searchEmptyState}>
                    <Ionicons name="warning-outline" size={42} color={colors.dangerSoft} />
                    <Text style={styles.emptyText}>{searchError}</Text>
                </View>
            );
        }

        let content: React.ReactNode[] = [];
        if (activeSearchTab === "Chats") {
            content = [
                ...localPrivateSearchResults.map((item) => renderSearchPersonRow(item, "conversation")),
                ...globalSearchResult.users.map((item) => renderSearchPersonRow(item, "user")),
            ];
        } else if (activeSearchTab === "Groups") {
            content = mergeUniqueConversations([...localGroupSearchResults, ...dedupedGlobalGroups])
                .map((item) => renderSearchPersonRow(item, "conversation"));
        } else if (activeSearchTab === "Messages") {
            content = globalSearchResult.messages.map(renderSearchMessageRow);
        } else if (activeSearchTab === "Links") {
            content = globalSearchResult.links.map(renderSearchLinkRow);
        } else {
            content = tabMediaResults.map(renderSearchMediaRow);
        }

        if (content.length === 0) {
            return (
                <View style={styles.searchEmptyState}>
                    <Ionicons name="file-tray-outline" size={46} color={colors.textMuted} />
                    <Text style={styles.emptyText}>Không có nội dung</Text>
                </View>
            );
        }

        return <View style={styles.searchResultList}>{content}</View>;
    };

    // ── Context Menu Modal ───────────────────────────────────────────
    const renderContextMenu = () => {
        if (!contextMenuConversation) return null;

        const conv = contextMenuConversation;
        const isPinned = getIsPinned(conv);
        const isArchived = getIsArchived(conv);
        const isSaved = isSelfConversation(conv);
        const displayInfo = getConversationDisplayInfo(conv);

        return (
            <Modal
                transparent
                visible={!!contextMenuConversation}
                animationType="fade"
                onRequestClose={closeContextMenu}
            >
                <Pressable style={styles.contextOverlay} onPress={closeContextMenu}>
                    <View style={styles.contextMenu}>
                        {/* Header */}
                        <View style={styles.contextHeader}>
                            <Text style={styles.contextTitle} numberOfLines={1}>
                                {displayInfo.displayName}
                            </Text>
                        </View>

                        {/* Pin / Unpin */}
                        <TouchableOpacity
                            style={styles.contextItem}
                            activeOpacity={0.6}
                            onPress={() => {
                                closeContextMenu();
                                handlePinConversation(conv);
                            }}
                        >
                            <Ionicons
                                name={isPinned ? "pin-outline" : "pin"}
                                size={20}
                                color={colors.accent}
                            />
                            <Text style={styles.contextItemText}>
                                {isPinned ? "Bỏ ghim" : "Ghim lên đầu"}
                            </Text>
                        </TouchableOpacity>

                        {/* Archive / Unarchive - hidden for Saved Messages */}
                        {!isSaved && (
                            <TouchableOpacity
                                style={styles.contextItem}
                                activeOpacity={0.6}
                                onPress={() => {
                                    closeContextMenu();
                                    handleArchiveConversation(conv);
                                }}
                            >
                                <Ionicons
                                    name={isArchived ? "arrow-undo-outline" : "archive-outline"}
                                    size={20}
                                    color={colors.accentAlt}
                                />
                                <Text style={styles.contextItemText}>
                                    {isArchived ? "Bỏ lưu trữ" : "Lưu trữ"}
                                </Text>
                            </TouchableOpacity>
                        )}

                        {/* Delete */}
                        <TouchableOpacity
                            style={styles.contextItem}
                            activeOpacity={0.6}
                            onPress={() => {
                                closeContextMenu();
                                handleDeleteConversation(conv);
                            }}
                        >
                            <Ionicons name="trash-outline" size={20} color={colors.danger} />
                            <Text style={[styles.contextItemText, { color: colors.danger }]}>
                                Xóa
                            </Text>
                        </TouchableOpacity>

                        {/* Cancel */}
                        <TouchableOpacity
                            style={[styles.contextItem, styles.contextCancel]}
                            activeOpacity={0.6}
                            onPress={closeContextMenu}
                        >
                            <Text style={[styles.contextItemText, { color: colors.textMuted, textAlign: "center" }]}>
                                Hủy
                            </Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Modal>
        );
    };

    // ── Archived view header ─────────────────────────────────────────
    const renderArchivedHeader = () => {
        if (!showArchivedView) return null;
        return (
            <View style={styles.archivedHeader}>
                <Pressable
                    onPress={() => setShowArchivedView(false)}
                    style={({ pressed }) => [
                        styles.archivedBackBtn,
                        pressed && { opacity: 0.6 },
                    ]}
                >
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </Pressable>
                <Text style={styles.archivedHeaderTitle}>Lưu trữ</Text>
                <View style={{ width: 40 }} />
            </View>
        );
    };

    // ── Archived Chats row (top of normal list) ──────────────────────
    const renderArchivedChatsRow = () => {
        if (showArchivedView) return null;
        if (archivedConversations.length === 0) return null;

        return (
            <Pressable
                onPress={() => setShowArchivedView(true)}
                style={({ pressed }) => [
                    styles.archivedRow,
                    pressed && { backgroundColor: "rgba(59,130,246,0.08)" },
                ]}
            >
                <View style={styles.archivedRowIcon}>
                    <Ionicons name="archive" size={22} color={colors.accent} />
                </View>
                <View style={styles.archivedRowMeta}>
                    <Text style={styles.archivedRowTitle}>Lưu trữ</Text>
                    <Text style={styles.archivedRowSubtitle} numberOfLines={1}>
                        {archivedPreviewNames || "Không có cuộc trò chuyện"}
                    </Text>
                </View>
                {archivedUnreadCount > 0 && (
                    <View style={styles.unreadBadge}>
                        <Text style={styles.unreadBadgeText}>
                            {archivedUnreadCount > 99 ? "99+" : archivedUnreadCount}
                        </Text>
                    </View>
                )}
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
        );
    };

    // ── Render a single conversation row ─────────────────────────────
    const renderConversationRow = (conversation: Conversation, index: number, list: Conversation[]) => {
        if (!conversation) return null;

        const unreadCount = conversation?.unreadCount || 0;
        const timeText = formatChatTime(getLastMessageCreatedAt(conversation));
        const previewText = getLastMessagePreview(conversation);
        const isPinned = getIsPinned(conversation);

        const conversationType = getConversationType(conversation);
        const { displayName, displayAvatar, otherMemberId } = getConversationDisplayInfo(conversation);
        const presence = otherMemberId ? presenceByUserId[otherMemberId] : undefined;
        const isOnline = !!(presence?.isOnline ?? presence?.online);

        return (
            <View
                key={`${getConversationIdentity(conversation)}-${index}`}
                style={[
                    styles.chatRow,
                    index !== list.length - 1 &&
                    styles.rowDivider,
                ]}
            >
                <Pressable
                    onPress={() => handleConversationPress(conversation)}
                    onLongPress={() => handleLongPress(conversation)}
                    style={({ pressed }) => [
                        styles.chatRowContent,
                        pressed && styles.chatRowPressed,
                    ]}
                >
                    {displayAvatar ? (
                        <Image
                            source={{
                                uri: displayAvatar,
                            }}
                            style={[
                                styles.avatarImage,
                                { width: 54, height: 54, borderRadius: 27 },
                            ]}
                        />
                    ) : (
                        <Avatar
                            label={(displayName || "U").slice(0, 1).toUpperCase()}
                            size={54}
                            backgroundColor="#3d6df2"
                            textSize={16}
                        />
                    )}
                    <View style={styles.chatMeta}>
                        <View style={styles.chatTopLine}>
                            <View style={styles.chatNameRow}>
                                {isPinned && (
                                    <Ionicons
                                        name="pin"
                                        size={14}
                                        color={colors.accent}
                                        style={styles.pinIcon}
                                    />
                                )}
                                <Text
                                    style={styles.chatName}
                                    numberOfLines={1}
                                >
                                    {truncateName(displayName)}
                                    {conversationType === "GROUP" && " (Nhóm)"}
                                </Text>
                            </View>
                            <View
                                style={[
                                    styles.statusDot,
                                    {
                                        backgroundColor: conversationType === "GROUP" ? "#8b5cf6" : isOnline ? "#22c55e" : "#9ca3af",
                                    },
                                ]}
                            />
                        </View>
                        <View style={styles.chatBottomLine}>
                            <Text
                                style={styles.chatMessage}
                                numberOfLines={1}
                            >
                                {previewText}
                            </Text>
                            {conversation?.lastMessageStatus ? (
                                <Ionicons
                                    name={conversation.lastMessageStatus === "read" ? "checkmark-done" : "checkmark"}
                                    size={14}
                                    color={conversation.lastMessageStatus === "read" ? colors.accent : colors.textMuted}
                                />
                            ) : null}
                            {timeText ? <Text style={styles.chatTime}>{timeText}</Text> : null}
                            {unreadCount > 0 ? (
                                <View style={styles.unreadBadge}>
                                    <Text style={styles.unreadBadgeText}>
                                        {unreadCount > 99 ? "99+" : unreadCount}
                                    </Text>
                                </View>
                            ) : null}
                        </View>
                    </View>
                </Pressable>

                {/* Chat icon button on the right */}
                <Pressable
                    onPress={() => handleConversationPress(conversation)}
                    style={({ pressed }) => [
                        styles.chatIconButton,
                        pressed && styles.chatIconButtonPressed,
                    ]}
                >
                    <Ionicons
                        name="chatbubble"
                        size={20}
                        color={colors.accent}
                    />
                </Pressable>
            </View>
        );
    };

    return (
        <View style={styles.screen}>
            {renderArchivedHeader()}
            <ScrollView
                contentContainerStyle={styles.homeContent}
                keyboardShouldPersistTaps="handled"
                onScroll={handleScrollEnd}
                scrollEventThrottle={400}
            >
                {!showArchivedView && isSearchMode && (
                    <>
                        <View style={styles.searchHeaderRow}>
                            <Pressable style={styles.searchBackButton} onPress={closeSearchMode}>
                                <Ionicons name="chevron-back" size={24} color={colors.text} />
                            </Pressable>
                            <View style={[styles.searchBar, styles.searchBarInHeader]}>
                                <Ionicons name="search" size={18} color={colors.textMuted} />
                                <TextInput
                                    value={query}
                                    onChangeText={setQuery}
                                    placeholder="Tìm kiếm..."
                                    placeholderTextColor={colors.textMuted}
                                    style={styles.searchInput}
                                    autoFocus
                                />
                            </View>
                        </View>

                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.searchTabContent}
                        >
                            {searchTabs.map((tab) => {
                                const active = activeSearchTab === tab;
                                return (
                                    <Pressable
                                        key={tab}
                                        style={[styles.searchTab, active && styles.searchTabActive]}
                                        onPress={() => setActiveSearchTab(tab)}
                                    >
                                        <Text style={[styles.searchTabText, active && styles.searchTabTextActive]}>{tab}</Text>
                                    </Pressable>
                                );
                            })}
                        </ScrollView>
                    </>
                )}

                {!showArchivedView && !isSearchMode && (
                    <>
                        <View style={styles.homeTopRow}>
                            <View style={styles.brandPill}>
                                <Ionicons name="paper-plane" size={14} color={colors.text} />
                                <Text style={styles.brandText}>ChatChit</Text>
                            </View>
                            <Pressable
                                style={({ pressed }) => [
                                    styles.actionCircle,
                                    pressed && { opacity: 0.7 }
                                ]}
                                onPress={onCreateGroupPress}
                            >
                                <Ionicons name="create-outline" size={22} color={colors.text} />
                            </Pressable>
                        </View>

                        <SectionTitle
                            title="Chat"
                            subtitle={
                                user?.displayName
                                    ? `Hello, ${truncateName(user.displayName, 20)}`
                                    : "Your recent conversations"
                            }
                            rightLabel="Sửa"
                        />

                        <View style={styles.searchBar}>
                            <Ionicons name="search" size={18} color={colors.textMuted} />
                            <TextInput
                                value={query}
                                onChangeText={setQuery}
                                onFocus={() => setIsSearchMode(true)}
                                placeholder="Search chats"
                                placeholderTextColor={colors.textMuted}
                                style={styles.searchInput}
                            />
                        </View>

                        <View style={styles.filterRow}>
                            <View style={[styles.filterChip, styles.filterChipActive]}>
                                <Text style={styles.filterTextActive}>All</Text>
                            </View>
                            <View style={styles.filterChip}>
                                <Text style={styles.filterText}>Unread</Text>
                            </View>
                            <View style={styles.filterChip}>
                                <Text style={styles.filterText}>Groups</Text>
                            </View>
                            <View style={styles.filterChip}>
                                <Text style={styles.filterText}>Calls</Text>
                            </View>
                        </View>
                    </>
                )}

                <Card style={styles.chatListCard}>
                    {isSearchMode ? (
                        renderGlobalSearchResults()
                    ) : state.friendsLoading || conversationsLoading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color={colors.accent} />
                            <Text style={styles.loadingText}>Đang tải danh sách chat...</Text>
                        </View>
                    ) : displayConversations.length === 0 && archivedConversations.length === 0 ? (
                        <View style={styles.emptyContainer}>
                            <Ionicons
                                name="people-outline"
                                size={48}
                                color={colors.textMuted}
                            />
                            <Text style={styles.emptyText}>
                                {conversations.length === 0
                                    ? "Chưa có cuộc trò chuyện"
                                    : "Không tìm thấy kết quả"}
                            </Text>
                        </View>
                    ) : (
                        <>
                            {/* Archived Chats row at top of normal view */}
                            {renderArchivedChatsRow()}

                            {displayConversations.length === 0 && showArchivedView ? (
                                <View style={styles.emptyContainer}>
                                    <Ionicons name="archive-outline" size={48} color={colors.textMuted} />
                                    <Text style={styles.emptyText}>Không có cuộc trò chuyện lưu trữ</Text>
                                </View>
                            ) : displayConversations.length === 0 && !showArchivedView ? (
                                <View style={styles.emptyContainer}>
                                    <Ionicons name="people-outline" size={48} color={colors.textMuted} />
                                    <Text style={styles.emptyText}>Không tìm thấy kết quả</Text>
                                </View>
                            ) : (
                                displayConversations.map((conversation, index) =>
                                    renderConversationRow(conversation, index, displayConversations)
                                )
                            )}

                            {/* Load more indicator */}
                            {loadingMore && (
                                <View style={styles.loadMoreContainer}>
                                    <ActivityIndicator size="small" color={colors.accent} />
                                    <Text style={styles.loadMoreText}>Đang tải thêm...</Text>
                                </View>
                            )}
                            {!hasMorePages && displayConversations.length > 0 && !loadingMore && (
                                <View style={styles.loadMoreContainer}>
                                    <Text style={styles.loadMoreText}>Đã tải hết cuộc trò chuyện</Text>
                                </View>
                            )}
                        </>
                    )}
                </Card>
            </ScrollView>

            {/* Context menu modal */}
            {renderContextMenu()}
        </View>
    );
};

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: "transparent",
    },
    homeContent: {
        padding: 16,
        paddingBottom: 96,
        gap: 14,
    },
    homeTopRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    brandPill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        alignSelf: "center",
        backgroundColor: colors.surfaceSoftTransparent,
        borderWidth: 1,
        borderColor: colors.overlayWhite10,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
    },
    brandText: {
        color: colors.text,
        fontWeight: "800",
        letterSpacing: 0.8,
    },
    actionCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
        elevation: 4,
    },
    searchBar: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: colors.surfaceSoftTransparent,
        borderWidth: 1,
        borderColor: colors.overlayWhite10,
        borderRadius: 22,
        paddingHorizontal: 14,
        height: 52,
    },
    searchInput: {
        flex: 1,
        color: colors.text,
        fontSize: 15,
    },
    searchHeaderRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    searchBackButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: "center",
        justifyContent: "center",
    },
    searchBarInHeader: {
        flex: 1,
    },
    searchTabContent: {
        gap: 8,
        paddingRight: 8,
    },
    searchTab: {
        minHeight: 40,
        borderRadius: 999,
        paddingHorizontal: 14,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.surfaceSoftTransparent,
        borderWidth: 1,
        borderColor: colors.overlayWhite10,
    },
    searchTabActive: {
        backgroundColor: "rgba(79, 140, 255, 0.18)",
        borderColor: "rgba(79, 140, 255, 0.42)",
    },
    searchTabText: {
        color: colors.textSoft,
        fontSize: 13,
        fontWeight: "700",
    },
    searchTabTextActive: {
        color: colors.text,
    },
    searchResultList: {
        gap: 0,
    },
    searchResultRow: {
        minHeight: 68,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 11,
        backgroundColor: colors.surfaceSoftTransparent,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
    },
    searchAvatar: {
        width: 46,
        height: 46,
        borderRadius: 23,
        backgroundColor: colors.border,
    },
    searchIconWrap: {
        width: 46,
        height: 46,
        borderRadius: 23,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(79,140,255,0.14)",
    },
    searchResultMeta: {
        flex: 1,
        minWidth: 0,
        gap: 4,
    },
    searchResultTitle: {
        color: colors.text,
        fontSize: 15,
        fontWeight: "800",
    },
    searchResultSubtitle: {
        color: colors.textMuted,
        fontSize: 12,
        lineHeight: 16,
    },
    searchEmptyState: {
        minHeight: 260,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 24,
        gap: 10,
    },
    filterRow: {
        flexDirection: "row",
        gap: 10,
    },
    filterChip: {
        backgroundColor: colors.surfaceSoftTransparent,
        borderColor: colors.overlayWhite10,
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 9,
    },
    filterChipActive: {
        backgroundColor: "rgba(79, 140, 255, 0.18)",
        borderColor: "rgba(79, 140, 255, 0.4)",
    },
    filterText: {
        color: colors.textSoft,
        fontWeight: "600",
        fontSize: 12,
    },
    filterTextActive: {
        color: colors.text,
        fontWeight: "700",
        fontSize: 12,
    },
    chatListCard: {
        padding: 0,
        overflow: "hidden",
    },
    loadingContainer: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 60,
        gap: 12,
    },
    loadingText: {
        color: colors.textMuted,
        fontSize: 14,
        marginTop: 12,
    },
    emptyContainer: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 60,
        gap: 12,
    },
    emptyText: {
        color: colors.textMuted,
        fontSize: 14,
        marginTop: 12,
    },
    chatRow: {
        flexDirection: "row",
        gap: 12,
        padding: 14,
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: colors.surfaceSoftTransparent,
    },
    chatRowContent: {
        flex: 1,
        flexDirection: "row",
        gap: 12,
        alignItems: "center",
    },
    chatRowPressed: {
        backgroundColor: "rgba(79, 140, 255, 0.12)",
    },
    chatIconButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "rgba(79, 140, 255, 0.12)",
        alignItems: "center",
        justifyContent: "center",
    },
    chatIconButtonPressed: {
        backgroundColor: "rgba(79, 140, 255, 0.22)",
    },
    rowDivider: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
    },
    chatMeta: {
        flex: 1,
        gap: 5,
    },
    chatTopLine: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
    },
    chatNameRow: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    chatName: {
        flex: 1,
        color: colors.text,
        fontSize: 16,
        fontWeight: "800",
    },
    pinIcon: {
        marginRight: 2,
    },
    statusDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    chatTime: {
        color: colors.textMuted,
        fontSize: 12,
        flexShrink: 0,
    },
    chatBottomLine: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    chatMessage: {
        flex: 1,
        color: colors.textSoft,
        fontSize: 13,
    },
    unreadBadge: {
        minWidth: 20,
        height: 20,
        borderRadius: 10,
        paddingHorizontal: 6,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.danger,
    },
    unreadBadgeText: {
        color: colors.textOnAccent,
        fontSize: 11,
        fontWeight: "700",
    },
    avatarImage: {
        resizeMode: "cover",
    },

    // ── Archived Chats row ───────────────────────────────────────
    archivedRow: {
        flexDirection: "row",
        alignItems: "center",
        padding: 14,
        gap: 12,
        backgroundColor: colors.surfaceSoftTransparent,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
    },
    archivedRowIcon: {
        width: 54,
        height: 54,
        borderRadius: 27,
        backgroundColor: "rgba(63,140,255,0.12)",
        alignItems: "center",
        justifyContent: "center",
    },
    archivedRowMeta: {
        flex: 1,
        gap: 3,
    },
    archivedRowTitle: {
        color: colors.text,
        fontSize: 16,
        fontWeight: "700",
    },
    archivedRowSubtitle: {
        color: colors.textMuted,
        fontSize: 13,
    },

    // ── Archived view header ─────────────────────────────────────
    archivedHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: colors.surfaceTransparent,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
    },
    archivedBackBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: "center",
        justifyContent: "center",
    },
    archivedHeaderTitle: {
        color: colors.text,
        fontSize: 18,
        fontWeight: "700",
    },

    // ── Context menu ─────────────────────────────────────────────
    contextOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.55)",
        justifyContent: "center",
        alignItems: "center",
        padding: 32,
    },
    contextMenu: {
        width: "100%",
        maxWidth: 320,
        backgroundColor: colors.surfaceElevated,
        borderRadius: 16,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: colors.border,
    },
    contextHeader: {
        paddingHorizontal: 18,
        paddingTop: 16,
        paddingBottom: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
    },
    contextTitle: {
        color: colors.text,
        fontSize: 15,
        fontWeight: "700",
    },
    contextItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingHorizontal: 18,
        paddingVertical: 14,
    },
    contextItemText: {
        color: colors.text,
        fontSize: 15,
        fontWeight: "500",
    },
    contextCancel: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
        justifyContent: "center",
    },

    // ── Load more ────────────────────────────────────────────────
    loadMoreContainer: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 16,
        gap: 8,
    },
    loadMoreText: {
        color: colors.textMuted,
        fontSize: 13,
    },
});
