import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
    ActivityIndicator,
    Alert,
    AppState,
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { useAuth, useFriendship } from "../../../shared/hooks";
import { ConversationService, type Conversation, type ConversationLastMessageSummary } from "../../../shared/services/conversationService";
import { SocketService } from "../../../shared/services/socketService";
import { PresenceService, type PresenceStatus } from "../../../shared/services/presenceService";
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
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [conversationsLoading, setConversationsLoading] = useState(false);
    const [presenceByUserId, setPresenceByUserId] = useState<Record<string, PresenceStatus>>({});

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

    // Load friends on mount
    useEffect(() => {
        const loadHomeData = async () => {
            setConversationsLoading(true);
            try {
                await Promise.all([
                    actions.loadFriends(),
                    ConversationService.getConversations(1, 50).then((items) => {
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

    const isSelfConversation = useCallback(
        (conversation: Conversation): boolean => {
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

                return [...next].sort((a, b) => {
                    const ta = new Date(getLastMessageCreatedAt(a) || 0).getTime() || 0;
                    const tb = new Date(getLastMessageCreatedAt(b) || 0).getTime() || 0;
                    return tb - ta;
                });
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
            const message = data?.message || data;
            const conversationId = message?.conversationId;
            if (!conversationId) return;

            setConversations((prev) => {
                const next = prev.map((conversation) => {
                    const id = conversation.id || conversation._id;
                    if (id !== conversationId) return conversation;

                    const textPreview = message?.text?.trim()
                        ? message.text
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

                return [...next].sort((a, b) => {
                    const ta = new Date(getLastMessageCreatedAt(a) || 0).getTime() || 0;
                    const tb = new Date(getLastMessageCreatedAt(b) || 0).getTime() || 0;
                    return tb - ta;
                });
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
            // Reload conversations when a new group is created
            ConversationService.getConversations(1, 50).then((updated) => {
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

            ConversationService.getConversations(1, 50).then((updated) => {
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

        socket.on("receiveMessage", handleReceiveMessage);
        socket.on("messageSeen", handleMessageSeen);
        socket.on("message:edited", handleMessageEdited);
        socket.on("message:revoked", handleMessageRevoked);
        socket.on("message:deleted_for_everyone", handleMessageDeletedForEveryone);
        socket.on("conversation:created", handleGroupCreated);
        socket.on("conversation:members_added", handleGroupMembersAdded);
        socket.on("conversation:member_removed", handleGroupMemberRemoved);
        socket.on("conversation:updated", handleConversationUpdated);

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
        };
    }, [token, user?.id, (user as any)?._id, dedupeConversations, updateConversationLastMessage]);

    // Refresh conversations when app returns to foreground
    useEffect(() => {
        if (!token) {
            return;
        }

        let isMounted = true;

        const refreshConversations = async () => {
            try {
                const updated = await ConversationService.getConversations(1, 50);
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

    const filteredConversations = useMemo(() => {
        const needle = query.trim().toLowerCase();

        // Sort conversations by last message time (newest first)
        const sorted = [...conversations].sort((a, b) => {
            const tsA = new Date(getLastMessageCreatedAt(a) || 0).getTime() || 0;
            const tsB = new Date(getLastMessageCreatedAt(b) || 0).getTime() || 0;
            return tsB - tsA;
        });

        if (!needle) {
            return sorted;
        }

        return sorted.filter((conv) => {
            const displayInfo = getConversationDisplayInfo(conv);
            return displayInfo.searchText.toLowerCase().includes(needle);
        });
    }, [conversations, query, getConversationDisplayInfo]);

    /**
     * Handle friend press - navigate to chat
     */
    const handleFriendPress = (friend: Friend) => {
        console.log('[HomeScreen] ===== handleFriendPress CALLED =====');
        console.log('[HomeScreen] Friend object:', {
            friendId: friend.friendId,
            displayName: friend.friendInfo?.displayName,
            _id: friend._id,
        });

        if (onFriendPress) {
            const chatUserData = {
                id: friend.friendId,
                displayName: friend.friendInfo?.displayName,
                avatar: friend.friendInfo?.avatar,
                avatarUrl: friend.friendInfo?.avatar,
                phone: friend.friendInfo?.phoneNumber,
                status: friend.friendInfo?.status,
                _id: friend._id,
            };
            console.log('[HomeScreen] Calling onFriendPress with data:', chatUserData);
            onFriendPress(chatUserData);
        }
    };

    const handleConversationPress = (conversation: Conversation) => {
        console.log('[HomeScreen] ===== handleConversationPress CALLED =====');
        console.log('[HomeScreen] Conversation:', {
            id: conversation._id || conversation.id,
            type: conversation.type,
            name: conversation.name,
            pairKey: conversation.pairKey,
        });

        const conversationType = getConversationType(conversation);
        if (conversationType === "GROUP") {
            console.log('[HomeScreen] Group chat clicked:', conversation._id);
            if (onGroupPress) {
                console.log('[HomeScreen] Calling onGroupPress with conversation:', {
                    conversationId: conversation._id || conversation.id,
                    name: conversation.name,
                    type: conversation.type,
                });
                onGroupPress(conversation);
            }
            return;
        }

        const displayInfo = getConversationDisplayInfo(conversation);
        const otherMemberId = displayInfo.otherMemberId;
        const friend = otherMemberId
            ? state?.friends?.find((f) => f.friendId === otherMemberId)
            : undefined;

        console.log('[HomeScreen] Found friend:', {
            friendId: friend?.friendId,
            displayName: friend?.friendInfo?.displayName,
        });

        if (friend) {
            console.log('[HomeScreen] Calling onFriendPress with friend:', {
                friendId: friend.friendId,
                displayName: friend.friendInfo?.displayName,
            });
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

    return (
        <View style={styles.screen}>
            <ScrollView
                contentContainerStyle={styles.homeContent}
                keyboardShouldPersistTaps="handled"
            >
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

                <Card style={styles.chatListCard}>
                    {state.friendsLoading || conversationsLoading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color={colors.accent} />
                            <Text style={styles.loadingText}>Đang tải danh sách chat...</Text>
                        </View>
                    ) : filteredConversations.length === 0 ? (
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
                        filteredConversations.map((conversation: Conversation, index: number) => {
                            if (!conversation) return null;

                            const unreadCount = conversation?.unreadCount || 0;
                            const timeText = formatChatTime(getLastMessageCreatedAt(conversation));
                            const previewText = getLastMessagePreview(conversation);

                            const conversationType = getConversationType(conversation);
                            const { displayName, displayAvatar, otherMemberId } = getConversationDisplayInfo(conversation);
                            const presence = otherMemberId ? presenceByUserId[otherMemberId] : undefined;
                            const isOnline = !!(presence?.isOnline ?? presence?.online);

                            return (
                                <View
                                    key={`${getConversationIdentity(conversation)}-${index}`}
                                    style={[
                                        styles.chatRow,
                                        index !== filteredConversations.length - 1 &&
                                        styles.rowDivider,
                                    ]}
                                >
                                    <Pressable
                                        onPress={() => handleConversationPress(conversation)}
                                        onLongPress={() => handleDeleteConversation(conversation)}
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
                                                <Text
                                                    style={styles.chatName}
                                                    numberOfLines={1}
                                                >
                                                    {truncateName(displayName)}
                                                    {conversationType === "GROUP" && " (Nhóm)"}
                                                </Text>
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
                        })
                    )}
                </Card>
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: colors.background,
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
        backgroundColor: "#143f7f",
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
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: "center",
        justifyContent: "center",
    },
    searchBar: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 22,
        paddingHorizontal: 14,
        height: 50,
    },
    searchInput: {
        flex: 1,
        color: colors.text,
        fontSize: 15,
    },
    filterRow: {
        flexDirection: "row",
        gap: 10,
    },
    filterChip: {
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 9,
    },
    filterChipActive: {
        backgroundColor: "rgba(59,130,246,0.18)",
        borderColor: "rgba(59,130,246,0.32)",
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
    },
    chatRowContent: {
        flex: 1,
        flexDirection: "row",
        gap: 12,
        alignItems: "center",
    },
    chatRowPressed: {
        backgroundColor: "rgba(59,130,246,0.08)",
    },
    chatIconButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "rgba(59,130,246,0.1)",
        alignItems: "center",
        justifyContent: "center",
    },
    chatIconButtonPressed: {
        backgroundColor: "rgba(59,130,246,0.2)",
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
    chatName: {
        flex: 1,
        color: colors.text,
        fontSize: 16,
        fontWeight: "800",
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
});
