import React, { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
    ActivityIndicator,
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
import { Avatar, Card, SectionTitle } from "../components";
import { colors } from "../theme";
import type { Friend } from "@/types";

interface HomeScreenProps {
    onFriendPress?: (friend: any) => void;
    onCreateGroupPress?: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ onFriendPress, onCreateGroupPress }) => {
    const { user, token } = useAuth();
    const { state, actions } = useFriendship();
    const [query, setQuery] = useState("");
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [conversationsLoading, setConversationsLoading] = useState(false);

    // Load friends on mount
    useEffect(() => {
        const loadHomeData = async () => {
            setConversationsLoading(true);
            try {
                await Promise.all([
                    actions.loadFriends(),
                    ConversationService.getConversations(1, 50).then(setConversations),
                ]);
            } finally {
                setConversationsLoading(false);
            }
        };

        loadHomeData();
    }, []);

    const truncateName = (name: string | undefined, maxLength = 20) => {
        if (!name || name.length <= maxLength) {
            return name;
        }
        return name.slice(0, Math.floor(maxLength / 2)) + "...";
    };

    const getConversationId = (conversation: Conversation): string => {
        return conversation.id || conversation._id;
    };

    const getLastMessageId = (conversation?: Conversation): string | undefined => {
        if (!conversation?.lastMessage) return undefined;
        const lastMessage = conversation.lastMessage as any;
        return lastMessage.messageId || lastMessage.id || lastMessage._id;
    };

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

        const currentUserId = user?.id || (user as any)?._id;

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

        socket.on("receiveMessage", handleReceiveMessage);
        socket.on("messageSeen", handleMessageSeen);

        return () => {
            socket.off("receiveMessage", handleReceiveMessage);
            socket.off("messageSeen", handleMessageSeen);
        };
    }, [token, user]);

    const conversationByFriendId = useMemo(() => {
        const map = new Map<string, Conversation>();
        const currentUserId = user?.id || (user as any)?._id;

        conversations.forEach((conversation) => {
            let otherMemberId: string | undefined;

            // Preferred mapping for private chats from BE: pairKey = "userA_userB"
            if (conversation.pairKey && currentUserId) {
                const ids = conversation.pairKey.split("_");
                otherMemberId = ids.find((id) => id && id !== currentUserId);
            }

            // Fallback mapping if members array is present
            if (!otherMemberId) {
                otherMemberId = conversation.members?.find((memberId) => memberId !== currentUserId);
            }

            if (otherMemberId) {
                map.set(otherMemberId, conversation);
            }
        });

        return map;
    }, [conversations, user]);

    const filteredFriends = useMemo(() => {
        const needle = query.trim().toLowerCase();
        const friendsList = [...(state?.friends || [])];

        friendsList.sort((a: Friend, b: Friend) => {
            const conversationA = conversationByFriendId.get(a.friendId);
            const conversationB = conversationByFriendId.get(b.friendId);
            const tsA = getLastMessageCreatedAt(conversationA);
            const tsB = getLastMessageCreatedAt(conversationB);
            return (new Date(tsB || 0).getTime() || 0) - (new Date(tsA || 0).getTime() || 0);
        });

        if (!needle) {
            return friendsList;
        }

        return friendsList.filter((item: Friend) =>
            item?.friendInfo?.displayName?.toLowerCase().includes(needle) ||
            item?.friendInfo?.phoneNumber?.toLowerCase().includes(needle)
        );
    }, [state?.friends, query, conversationByFriendId]);

    /**
     * Handle friend press - navigate to chat
     */
    const handleFriendPress = (friend: Friend) => {
        if (onFriendPress) {
            onFriendPress({
                id: friend.friendId,
                displayName: friend.friendInfo?.displayName,
                avatar: friend.friendInfo?.avatar,
                avatarUrl: friend.friendInfo?.avatar,
                phone: friend.friendInfo?.phoneNumber,
                status: friend.friendInfo?.status,
                _id: friend._id,
            });
        }
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
                    ) : filteredFriends.length === 0 ? (
                        <View style={styles.emptyContainer}>
                            <Ionicons
                                name="people-outline"
                                size={48}
                                color={colors.textMuted}
                            />
                            <Text style={styles.emptyText}>
                                {(state?.friends || []).length === 0
                                    ? "Chưa có bạn bè"
                                    : "Không tìm thấy kết quả"}
                            </Text>
                        </View>
                    ) : (
                        filteredFriends.map((friend: Friend, index: number) => {
                            if (!friend || !friend.friendInfo) return null;

                            const conversation = conversationByFriendId.get(friend.friendId);
                            const unreadCount = conversation?.unreadCount || 0;
                            const timeText = formatChatTime(getLastMessageCreatedAt(conversation));
                            const previewText = getLastMessagePreview(conversation, friend.friendInfo?.status);

                            return (
                                <View
                                    key={friend._id || friend.friendId}
                                    style={[
                                        styles.chatRow,
                                        index !== filteredFriends.length - 1 &&
                                        styles.rowDivider,
                                    ]}
                                >
                                    <Pressable
                                        onPress={() => handleFriendPress(friend)}
                                        style={({ pressed }) => [
                                            styles.chatRowContent,
                                            pressed && styles.chatRowPressed,
                                        ]}
                                    >
                                        {friend.friendInfo?.avatar ? (
                                            <Image
                                                source={{
                                                    uri: friend.friendInfo.avatar,
                                                }}
                                                style={[
                                                    styles.avatarImage,
                                                    { width: 54, height: 54, borderRadius: 27 },
                                                ]}
                                            />
                                        ) : (
                                            <Avatar
                                                label={(friend.friendInfo?.displayName || "U").slice(0, 1).toUpperCase()}
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
                                                    {truncateName(friend.friendInfo?.displayName || "Unknown")}
                                                </Text>
                                                <View
                                                    style={[
                                                        styles.statusDot,
                                                        {
                                                            backgroundColor:
                                                                friend.friendInfo?.status === "online"
                                                                    ? "#22c55e"
                                                                    : "#ef4444",
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
                                        onPress={() => handleFriendPress(friend)}
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
