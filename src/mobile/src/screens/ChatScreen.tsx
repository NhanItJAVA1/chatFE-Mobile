import React, { useCallback, useMemo, useRef, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
    Image,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
    ActivityIndicator,
    FlatList,
    KeyboardAvoidingView,
    Platform,
} from "react-native";
import { useChatMessage } from "../../../shared/hooks/useChat";
import { useAuth } from "../../../shared/hooks";
import { Avatar } from "../components";
import { colors } from "../theme";
import type { ChatScreenProps } from "@/types";
import type { MessagePayload } from "../../../shared/services/socketService";

/**
 * Message Bubble Component
 */
const MessageBubble: React.FC<{
    message: MessagePayload;
    isOwn: boolean;
}> = ({ message, isOwn }) => {
    const formatTime = (date: string) => {
        const d = new Date(date);
        return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case "sent":
                return "✓";
            case "delivered":
                return "✓✓";
            case "seen":
                return "✓✓";
            default:
                return "";
        }
    };

    return (
        <View
            style={[
                styles.bubbleRow,
                isOwn ? styles.outgoingRow : styles.incomingRow,
            ]}
        >
            <View
                style={[
                    styles.bubble,
                    isOwn ? styles.outgoingBubble : styles.incomingBubble,
                ]}
            >
                <Text
                    style={[
                        styles.bubbleText,
                        !isOwn && styles.incomingText,
                    ]}
                    selectable
                >
                    {message.text}
                </Text>
                <View style={styles.bubbleMetaRow}>
                    <Text style={[styles.bubbleTime]}>
                        {formatTime(message.createdAt)}
                    </Text>
                    {isOwn && (
                        <Text
                            style={[
                                styles.bubbleTime,
                                message.status === "seen" && styles.seenStatus,
                            ]}
                        >
                            {getStatusIcon(message.status)}
                        </Text>
                    )}
                </View>
            </View>
        </View>
    );
};

/**
 * Typing Indicator Component
 */
const TypingIndicator: React.FC<{ typingUsers: Set<string> }> = ({
    typingUsers,
}) => {
    if (typingUsers.size === 0) return null;

    return (
        <View style={styles.typingContainer}>
            <View style={[styles.typingDot, styles.typingDot1]} />
            <View style={[styles.typingDot, styles.typingDot2]} />
            <View style={[styles.typingDot, styles.typingDot3]} />
        </View>
    );
};

/**
 * Chat Screen Component
 */
export const ChatScreen = ({
    onBackPress,
    chatUser = null,
}: ChatScreenProps) => {
    const authContext = useAuth();
    const currentUser = authContext.user;
    const token = authContext.token;
    const [messageText, setMessageText] = React.useState("");
    const flatListRef = useRef<FlatList>(null);
    const actionsRef = useRef<any>(null);

    const friendId = chatUser?.id;

    const { state, actions } = useChatMessage(
        friendId || "",
        token || ""
    );

    // Keep actions ref in sync
    React.useEffect(() => {
        actionsRef.current = actions;
    }, [actions]);

    const {
        conversation,
        messages,
        isLoading,
        isSending,
        error,
        typingUsers,
        hasMoreMessages,
    } = state;

    // Truncate name helper
    const truncateName = (name: string | undefined, maxLength = 20) => {
        if (!name || name.length <= maxLength) {
            return name;
        }
        return name.slice(0, Math.floor(maxLength / 2)) + "...";
    };

    // Get user display info
    const userName = chatUser?.displayName || "Unknown";
    const userInitials =
        chatUser?.displayName
            ?.split(" ")
            .map((n: string) => n[0].toUpperCase())
            .join("")
            .slice(0, 2) || "??";
    const userAvatar = chatUser?.avatarUrl || chatUser?.avatar;
    const userColor = chatUser?.color || "#4f8cff";

    /**
     * Handle send message
     */
    const handleSendMessage = useCallback(async () => {
        if (!messageText.trim() || !actionsRef.current) return;

        const text = messageText.trim();
        setMessageText("");

        await actionsRef.current.sendMessage(text);
    }, [messageText]);

    /**
     * Handle text input (typing indicator)
     */
    const handleTextChange = useCallback(
        (text: string) => {
            setMessageText(text);
            if (text.trim() && actionsRef.current) {
                actionsRef.current.handleTyping();
            }
        },
        []
    );

    /**
     * Handle message visibility (mark as seen)
     */
    const handleViewableItemsChanged = useCallback(
        ({
            viewableItems,
        }: {
            viewableItems: any[];
        }) => {
            if (viewableItems.length > 0 && actionsRef.current) {
                const visibleIds: string[] = [];

                viewableItems.forEach((item) => {
                    if (
                        item.item._id &&
                        item.item.senderId !== currentUser?.id &&
                        item.item.status !== "seen"
                    ) {
                        visibleIds.push(item.item._id);
                    }
                });

                if (visibleIds.length > 0) {
                    actionsRef.current.markAsSeen(visibleIds);
                }
            }
        },
        [currentUser?.id]
    );

    /**
     * Load more messages
     */
    const handleLoadMore = useCallback(() => {
        if (hasMoreMessages && !isLoading && actionsRef.current) {
            actionsRef.current.loadMoreMessages(state.currentPage + 1);
        }
    }, [hasMoreMessages, isLoading, state.currentPage]);

    /**
     * Memoize viewability config to prevent FlatList updates
     */
    const viewabilityConfig = useMemo(
        () => ({
            itemVisiblePercentThreshold: 50,
        }),
        []
    );

    /**
     * Render message item
     */
    const renderMessage = useCallback(
        ({ item }: { item: MessagePayload }) => {
            const isOwn = item.senderId === currentUser?.id;
            return <MessageBubble message={item} isOwn={isOwn} />;
        },
        [currentUser?.id]
    );

    /**
     * Error state
     */
    if (error && !conversation) {
        return (
            <View style={styles.screen}>
                <View style={styles.errorContainer}>
                    <Ionicons
                        name="warning-outline"
                        size={48}
                        color="#FF6B6B"
                    />
                    <Text style={styles.errorText}>{error}</Text>
                    <Pressable
                        style={styles.retryButton}
                        onPress={actions.retryLoadConversation}
                    >
                        <Text style={styles.retryButtonText}>Thử lại</Text>
                    </Pressable>
                    <Pressable
                        style={styles.backFromError}
                        onPress={onBackPress}
                    >
                        <Ionicons name="chevron-back" size={24} color={colors.text} />
                    </Pressable>
                </View>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            style={styles.screen}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={60}
        >
            {/* Header */}
            <View style={styles.chatHeaderWrap}>
                <Pressable
                    style={styles.backButton}
                    onPress={onBackPress}
                >
                    <Ionicons name="chevron-back" size={24} color={colors.text} />
                </Pressable>
                <View style={styles.chatHeaderCard}>
                    <Text
                        style={styles.chatHeaderTitle}
                        numberOfLines={1}
                    >
                        {truncateName(userName)}
                    </Text>
                    <Text style={styles.chatHeaderSubtitle}>
                        {typingUsers.size > 0 ? "đang gõ..." : "trực tuyến"}
                    </Text>
                </View>
                <View style={styles.headerAvatarWrap}>
                    {userAvatar ? (
                        <Image
                            source={{ uri: userAvatar }}
                            style={[
                                styles.avatarImage,
                                { width: 52, height: 52, borderRadius: 26 },
                            ]}
                        />
                    ) : (
                        <Avatar
                            label={userInitials}
                            size={52}
                            backgroundColor={userColor}
                            textSize={14}
                        />
                    )}
                </View>
            </View>

            {/* Loading initial messages */}
            {isLoading && messages.length === 0 && (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color={colors.text} />
                    <Text style={styles.loadingText}>Đang tải tin nhắn...</Text>
                </View>
            )}

            {/* Messages List */}
            {!isLoading || messages.length > 0 ? (
                <FlatList
                    ref={flatListRef}
                    data={messages}
                    renderItem={renderMessage}
                    keyExtractor={(item) => item._id || item.createdAt}
                    inverted
                    contentContainerStyle={styles.messagesContainer}
                    scrollEventThrottle={16}
                    onViewableItemsChanged={handleViewableItemsChanged}
                    viewabilityConfig={viewabilityConfig}
                    onEndReached={handleLoadMore}
                    onEndReachedThreshold={0.5}
                    ListHeaderComponent={
                        hasMoreMessages && messages.length > 0 ? (
                            <View style={styles.loadingMoreContainer}>
                                <ActivityIndicator
                                    size="small"
                                    color={colors.textMuted}
                                />
                            </View>
                        ) : null
                    }
                    ListFooterComponent={
                        <TypingIndicator typingUsers={typingUsers} />
                    }
                />
            ) : null}

            {/* Message Composer */}
            <View style={styles.messageComposer}>
                <Pressable style={styles.composerIconButton}>
                    <Ionicons name="attach-outline" size={24} color={colors.text} />
                </Pressable>
                <View style={styles.composerInputWrap}>
                    <TextInput
                        placeholder="Tin nhắn"
                        placeholderTextColor={colors.textMuted}
                        style={styles.composerInput}
                        value={messageText}
                        onChangeText={handleTextChange}
                        multiline
                        maxLength={1000}
                        editable={!isSending}
                    />
                    <Pressable style={styles.composerEmojiButton}>
                        <Ionicons
                            name="happy-outline"
                            size={22}
                            color={colors.textMuted}
                        />
                    </Pressable>
                </View>
                <Pressable
                    style={[
                        styles.composerSendButton,
                        (!messageText.trim() || isSending) &&
                        styles.composerSendButtonDisabled,
                    ]}
                    onPress={handleSendMessage}
                    disabled={!messageText.trim() || isSending}
                >
                    {isSending ? (
                        <ActivityIndicator size="small" color="#fff" />
                    ) : (
                        <Ionicons name="send" size={22} color="#fff" />
                    )}
                </Pressable>
            </View>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: colors.background,
    },
    centerContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    loadingText: {
        marginTop: 12,
        fontSize: 14,
        color: colors.textMuted,
    },
    errorContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 24,
    },
    errorText: {
        fontSize: 16,
        color: "#FF6B6B",
        marginTop: 16,
        textAlign: "center",
    },
    retryButton: {
        marginTop: 24,
        paddingHorizontal: 32,
        paddingVertical: 12,
        backgroundColor: "#4f8cff",
        borderRadius: 8,
    },
    retryButtonText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "600",
    },
    backFromError: {
        position: "absolute",
        bottom: 20,
        left: 20,
        width: 44,
        height: 44,
        justifyContent: "center",
        alignItems: "center",
    },
    chatHeaderWrap: {
        paddingHorizontal: 14,
        paddingTop: 8,
        paddingBottom: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: colors.background,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    backButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: "center",
        justifyContent: "center",
    },
    chatHeaderCard: {
        flex: 1,
        backgroundColor: colors.surface,
        borderRadius: 22,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: "center",
    },
    chatHeaderTitle: {
        color: colors.text,
        fontSize: 18,
        fontWeight: "800",
    },
    chatHeaderSubtitle: {
        color: colors.textSoft,
        fontSize: 12,
        marginTop: 2,
    },
    headerAvatarWrap: {
        width: 52,
    },
    avatarImage: {
        borderRadius: 26,
        backgroundColor: colors.border,
    },
    messagesContainer: {
        paddingHorizontal: 14,
        paddingVertical: 16,
        gap: 8,
    },
    loadingMoreContainer: {
        paddingVertical: 12,
        alignItems: "center",
    },
    bubbleRow: {
        flexDirection: "row",
    },
    incomingRow: {
        justifyContent: "flex-start",
    },
    outgoingRow: {
        justifyContent: "flex-end",
    },
    bubble: {
        maxWidth: "82%",
        borderRadius: 18,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    incomingBubble: {
        backgroundColor: colors.incoming,
        borderTopLeftRadius: 6,
    },
    outgoingBubble: {
        backgroundColor: colors.outgoing,
        borderTopRightRadius: 6,
    },
    bubbleText: {
        color: "#fff",
        fontSize: 15,
        lineHeight: 20,
        fontWeight: "500",
    },
    incomingText: {
        color: colors.text,
    },
    bubbleMetaRow: {
        flexDirection: "row",
        justifyContent: "flex-end",
        alignItems: "center",
        gap: 6,
        marginTop: 6,
    },
    bubbleTime: {
        color: "rgba(255,255,255,0.75)",
        fontSize: 11,
    },
    seenStatus: {
        color: "#90EE90",
    },
    typingContainer: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 4,
        gap: 4,
    },
    typingDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.textMuted,
    },
    typingDot1: {
        opacity: 0.4,
    },
    typingDot2: {
        opacity: 0.6,
    },
    typingDot3: {
        opacity: 0.8,
    },
    messageComposer: {
        flexDirection: "row",
        alignItems: "flex-end",
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: colors.background,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    composerIconButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: "center",
        justifyContent: "center",
    },
    composerInputWrap: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.surface,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: 16,
    },
    composerInput: {
        flex: 1,
        minHeight: 44,
        maxHeight: 100,
        fontSize: 14,
        color: colors.text,
        paddingVertical: 10,
    },
    composerEmojiButton: {
        paddingHorizontal: 8,
    },
    composerSendButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: "#4f8cff",
        alignItems: "center",
        justifyContent: "center",
    },
    composerSendButtonDisabled: {
        backgroundColor: colors.border,
    },
});
