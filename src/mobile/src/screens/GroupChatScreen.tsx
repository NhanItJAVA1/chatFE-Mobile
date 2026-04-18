import React, { useEffect, useState, useCallback, useRef } from "react";
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TextInput,
    Pressable,
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useChatMessage } from "../../../shared/hooks/useChat";
import { useGroupChat } from "../../../shared/hooks/useGroupChat";
import { useAuth } from "../../../shared/hooks";
import { SocketService } from "../../../shared/services";
import { Avatar } from "../components";
import { colors } from "../theme";

/**
 * GroupChatScreen - Real-time group chat interface
 * Displays group messages, handles sending/editing/deleting messages
 * Manages group-specific features (member list, typing indicators)
 */
export const GroupChatScreen: React.FC<{
    route: any;
    navigation: any;
    onBackPress?: () => void;
}> = ({ route, navigation, onBackPress }) => {
    const { groupId } = route.params;
    const { user } = useAuth();
    const { state: chatState, actions: chatActions } = useChatMessage(
        groupId,
        user?.token || ""
    );
    const { state: groupState, actions: groupActions } = useGroupChat();

    // Local state
    const [messageText, setMessageText] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const flatListRef = useRef<FlatList>(null);

    // Load group and messages on mount
    useEffect(() => {
        loadGroupData();
    }, [groupId]);

    // Setup socket listeners
    useEffect(() => {
        groupActions.setupGroupListeners();
        SocketService.onTyping((data) => {
            if (data.conversationId === groupId && data.userId !== user?._id) {
                setTypingUsers((prev) => {
                    const next = new Set(prev);
                    if (data.isTyping) {
                        next.add(data.userId);
                    } else {
                        next.delete(data.userId);
                    }
                    return next;
                });
            }
        });
        SocketService.onMessage((message) => {
            if (message.conversationId === groupId) {
                chatActions.addMessages([message]);
                flatListRef.current?.scrollToEnd({ animated: true });
            }
        });

        return () => {
            groupActions.cleanupGroupListeners();
            SocketService.offTyping();
            SocketService.offMessage();
        };
    }, [groupId, user?._id]);

    const loadGroupData = useCallback(async () => {
        try {
            await Promise.all([
                groupActions.loadGroupInfo(groupId),
                groupActions.loadMembers(groupId),
                chatActions.retryLoadConversation?.(),
            ]);

            // Join group room
            try {
                await SocketService.joinConversation(groupId);
            } catch (err) {
                console.warn("Failed to join group room:", err);
            }
        } catch (err: any) {
            Alert.alert("Lỗi", err.message || "Failed to load group data");
        }
    }, [groupId]);

    const handleSendMessage = useCallback(async () => {
        if (!messageText.trim()) return;

        try {
            setIsSending(true);
            const result = await chatActions.sendMessage(messageText);
            setMessageText("");
            flatListRef.current?.scrollToEnd({ animated: true });
        } catch (err: any) {
            Alert.alert("Lỗi", "Failed to send message");
        } finally {
            setIsSending(false);
        }
    }, [messageText]);

    const handleInputChange = useCallback((text: string) => {
        setMessageText(text);

        // Debounce typing indicator
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }

        SocketService.startTyping(groupId);
        typingTimeoutRef.current = setTimeout(() => {
            SocketService.stopTyping(groupId);
        }, 3000);
    }, [groupId]);

    const handleLeaveGroup = useCallback(() => {
        Alert.alert(
            "Xác nhận",
            "Bạn có chắc muốn rời nhóm này?",
            [
                { text: "Hủy", onPress: () => { } },
                {
                    text: "Rời nhóm",
                    onPress: async () => {
                        try {
                            await groupActions.leaveGroup(groupId);
                            onBackPress?.();
                        } catch (err: any) {
                            Alert.alert("Lỗi", err.message);
                        }
                    },
                    style: "destructive",
                },
            ]
        );
    }, [groupId]);

    const renderMessage = useCallback(
        ({ item }: any) => {
            const isOwn = item.senderId === user?._id;
            return (
                <View
                    style={[
                        styles.messageBubble,
                        isOwn
                            ? styles.messageBubbleOwn
                            : styles.messageBubbleOther,
                    ]}
                >
                    {!isOwn && (
                        <Avatar
                            label={item.senderName.charAt(0).toUpperCase()}
                            size={32}
                            style={{ marginRight: 8 }}
                        />
                    )}
                    <View
                        style={[
                            styles.messageContent,
                            isOwn
                                ? styles.messageContentOwn
                                : styles.messageContentOther,
                        ]}
                    >
                        {!isOwn && (
                            <Text style={styles.senderName}>
                                {item.senderName}
                            </Text>
                        )}
                        <Text style={styles.messageText}>{item.text}</Text>
                        <Text style={styles.messageTime}>
                            {new Date(item.createdAt).toLocaleTimeString(
                                "vi-VN",
                                { hour: "2-digit", minute: "2-digit" }
                            )}
                        </Text>
                    </View>
                </View>
            );
        },
        [user?._id]
    );

    if (!groupState.group) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>Đang tải...</Text>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.container}
        >
            {/* Header */}
            <View style={styles.header}>
                <Pressable
                    onPress={() => onBackPress?.()}
                    hitSlop={8}
                >
                    <Ionicons
                        name="arrow-back"
                        size={24}
                        color={colors.text}
                    />
                </Pressable>
                <Pressable
                    onPress={() => navigation.navigate("GroupInfo", { groupId })}
                    style={{ flex: 1 }}
                >
                    <Text style={styles.groupName}>{groupState.group.name}</Text>
                    <Text style={styles.memberCount}>
                        {groupState.members.length} thành viên
                    </Text>
                </Pressable>
                <Pressable onPress={handleLeaveGroup} hitSlop={8}>
                    <Ionicons
                        name="exit"
                        size={24}
                        color={colors.text}
                    />
                </Pressable>
            </View>

            {/* Messages */}
            <FlatList
                ref={flatListRef}
                data={chatState.messages}
                keyExtractor={(item) => item._id || item.id || `${item.senderId}-${item.createdAt}`}
                renderItem={renderMessage}
                contentContainerStyle={styles.messagesList}
                onEndReachedThreshold={0.5}
                onEndReached={() => {
                    if (chatState.hasMoreMessages) {
                        chatActions.loadMoreMessages?.();
                    }
                }}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Ionicons
                            name="chatbubble-outline"
                            size={48}
                            color={colors.placeholder}
                        />
                        <Text style={styles.emptyText}>
                            Chưa có tin nhắn
                        </Text>
                    </View>
                }
            />

            {/* Typing indicator */}
            {typingUsers.size > 0 && (
                <View style={styles.typingIndicator}>
                    <Text style={styles.typingText}>
                        {Array.from(typingUsers).join(", ")} đang gõ...
                    </Text>
                </View>
            )}

            {/* Input area */}
            <View style={styles.inputContainer}>
                <TextInput
                    style={styles.input}
                    placeholder="Nhập tin nhắn..."
                    placeholderTextColor={colors.placeholder}
                    value={messageText}
                    onChangeText={handleInputChange}
                    multiline
                    maxLength={1000}
                    editable={!isSending}
                />
                <Pressable
                    onPress={handleSendMessage}
                    disabled={!messageText.trim() || isSending}
                    style={[
                        styles.sendButton,
                        (!messageText.trim() || isSending) &&
                        styles.sendButtonDisabled,
                    ]}
                >
                    {isSending ? (
                        <ActivityIndicator
                            size="small"
                            color={colors.primary}
                        />
                    ) : (
                        <Ionicons
                            name="send"
                            size={20}
                            color={
                                messageText.trim()
                                    ? colors.primary
                                    : colors.placeholder
                            }
                        />
                    )}
                </Pressable>
            </View>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        gap: 12,
    },
    loadingText: {
        fontSize: 14,
        color: colors.placeholder,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        gap: 12,
    },
    groupName: {
        fontSize: 16,
        fontWeight: "600",
        color: colors.text,
    },
    memberCount: {
        fontSize: 12,
        color: colors.placeholder,
        marginTop: 2,
    },
    messagesList: {
        padding: 16,
        gap: 8,
    },
    messageBubble: {
        flexDirection: "row",
        alignItems: "flex-end",
        marginBottom: 4,
    },
    messageBubbleOwn: {
        justifyContent: "flex-end",
    },
    messageBubbleOther: {
        justifyContent: "flex-start",
    },
    messageContent: {
        maxWidth: "80%",
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    messageContentOwn: {
        backgroundColor: colors.primary,
    },
    messageContentOther: {
        backgroundColor: colors.card,
    },
    senderName: {
        fontSize: 12,
        fontWeight: "600",
        color: colors.placeholder,
        marginBottom: 2,
    },
    messageText: {
        fontSize: 14,
        color: colors.text,
        lineHeight: 20,
    },
    messageTime: {
        fontSize: 11,
        color: colors.placeholder,
        marginTop: 4,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        gap: 12,
    },
    emptyText: {
        fontSize: 14,
        color: colors.placeholder,
    },
    typingIndicator: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    typingText: {
        fontSize: 12,
        color: colors.placeholder,
        fontStyle: "italic",
    },
    inputContainer: {
        flexDirection: "row",
        alignItems: "flex-end",
        padding: 12,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        gap: 8,
    },
    input: {
        flex: 1,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 8,
        fontSize: 14,
        color: colors.text,
        maxHeight: 100,
    },
    sendButton: {
        padding: 8,
        justifyContent: "center",
        alignItems: "center",
    },
    sendButtonDisabled: {
        opacity: 0.5,
    },
});
