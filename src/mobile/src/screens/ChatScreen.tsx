import React, { useCallback, useMemo, useRef, useEffect, useState } from "react";
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
    Alert,
    Modal,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useChatMessage } from "../../../shared/hooks/useChat";
import { useAuth } from "../../../shared/hooks";
import { Avatar } from "../components";
import { colors } from "../theme";
import MediaMessage from "../components/MediaMessage";
import chatMediaService from "../../../shared/services/chatMediaService";
import type { ChatScreenProps, MessageMedia } from "@/types";
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

    // Check if message has media
    const hasMedia = message.media && message.media.length > 0;

    React.useEffect(() => {
        if (hasMedia) {
            console.log('[MessageBubble] Rendering message with media:', {
                mediaCount: message.media.length,
                mediaTypes: message.media.map((m: any) => m.mediaType),
            });
        }
    }, [hasMedia, message.media]);

    return (
        <View
            style={[
                styles.bubbleRow,
                isOwn ? styles.outgoingRow : styles.incomingRow,
            ]}
        >
            {/* Media display */}
            {hasMedia && (
                <View style={styles.mediaContainer}>
                    {message.media.map((m: any, idx: number) => (
                        <MediaMessage
                            key={idx}
                            media={m as MessageMedia}
                            isSender={isOwn}
                        />
                    ))}
                </View>
            )}

            {/* Text bubble */}
            {message.text && (
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
            )}

            {/* Time stamp for media-only messages */}
            {hasMedia && !message.text && (
                <View style={styles.mediaTimestamp}>
                    <Text style={styles.bubbleTime}>
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
            )}
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
    const [showMediaMenu, setShowMediaMenu] = React.useState(false);
    const [uploading, setUploading] = React.useState(false);
    const [uploadProgress, setUploadProgress] = React.useState(0);
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

    // Debug: Log modal visibility changes
    React.useEffect(() => {
        console.log('[ChatScreen] showMediaMenu changed:', showMediaMenu);
    }, [showMediaMenu]);

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
     * Pick and send image
     */
    const handlePickImage = useCallback(async () => {
        try {
            console.log('[ChatScreen] handlePickImage called');
            // Don't dismiss modal yet - let picker load first
            // setShowMediaMenu(false);

            // Request permission
            console.log('[ChatScreen] Requesting media library permission...');
            const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
            console.log('[ChatScreen] Permission result:', permissionResult);

            if (!permissionResult.granted) {
                console.log('[ChatScreen] Permission denied');
                Alert.alert(
                    "Permission required",
                    "We need access to your photo library. Please enable it in settings."
                );
                return;
            }

            console.log('[ChatScreen] Launching image library...');
            try {
                const result = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ['images'],
                } as any);

                console.log('[ChatScreen] Image library result:', JSON.stringify(result, null, 2));

                if (result.canceled) {
                    console.log('[ChatScreen] User canceled image selection');
                    return;
                }

                if (!result.assets || result.assets.length === 0) {
                    console.log('[ChatScreen] No assets selected');
                    Alert.alert("Error", "No image selected");
                    return;
                }

                if (!result.assets[0].uri || !result.assets[0].type) {
                    console.log('[ChatScreen] Invalid asset data:', result.assets[0]);
                    Alert.alert("Error", "Invalid image file");
                    return;
                }

                setUploading(true);
                setUploadProgress(0);

                const asset = result.assets[0];
                const uri = asset.uri;
                const name = asset.fileName || uri.split("/").pop() || "image.jpg";
                const type = asset.mimeType || asset.type || "image/jpeg";

                console.log('[ChatScreen] Selected image:', { uri, name, type });

                // Create file-like object
                const file = {
                    uri,
                    name,
                    type,
                    mimeType: type,
                    size: asset.fileSize || 0,
                    width: asset.width,
                    height: asset.height,
                };

                console.log('[ChatScreen] Sending image...');
                await chatMediaService.sendImage(
                    conversation?._id || conversation?.id || "",
                    file,
                    messageText || undefined,
                    (progress) => setUploadProgress(progress)
                );

                setMessageText("");
                setUploadProgress(0);
                console.log('[ChatScreen] Image sent successfully');
            } catch (pickerError: any) {
                console.error('[ChatScreen] Image picker error:', pickerError);
                console.error('[ChatScreen] Error stack:', pickerError.stack);
                const errorMsg = pickerError.message || 'Unknown error';
                Alert.alert("Error sending image", errorMsg);
            } finally {
                // Dismiss modal after picker completes
                setShowMediaMenu(false);
            }
        } catch (error: any) {
            Alert.alert("Error", `Failed to send image: ${error.message}`);
            setShowMediaMenu(false);
        } finally {
            setUploading(false);
        }
    }, [conversation, messageText]);

    /**
     * Pick and send video
     */
    const handlePickVideo = useCallback(async () => {
        try {
            console.log('[ChatScreen] handlePickVideo called');
            // Don't dismiss modal yet - let picker load first
            // setShowMediaMenu(false);

            // Request permission
            console.log('[ChatScreen] Requesting media library permission...');
            const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
            console.log('[ChatScreen] Permission result:', permissionResult);

            if (!permissionResult.granted) {
                console.log('[ChatScreen] Permission denied');
                Alert.alert(
                    "Permission required",
                    "We need access to your photo library. Please enable it in settings."
                );
                return;
            }

            console.log('[ChatScreen] Launching video library...');
            try {
                const result = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ['videos'],
                } as any);

                console.log('[ChatScreen] Video library result:', JSON.stringify(result, null, 2));

                if (result.canceled) {
                    console.log('[ChatScreen] User canceled video selection');
                    return;
                }

                if (!result.assets || result.assets.length === 0) {
                    console.log('[ChatScreen] No assets selected');
                    Alert.alert("Error", "No video selected");
                    return;
                }

                if (!result.assets[0].uri || !result.assets[0].type) {
                    console.log('[ChatScreen] Invalid asset data:', result.assets[0]);
                    Alert.alert("Error", "Invalid video file");
                    return;
                }

                setUploading(true);
                setUploadProgress(0);

                const asset = result.assets[0];
                const uri = asset.uri;
                const name = asset.fileName || uri.split("/").pop() || "video.mp4";
                const type = asset.mimeType || asset.type || "video/mp4";

                console.log('[ChatScreen] Selected video:', { uri, name, type, duration: asset.duration });

                const file = {
                    uri,
                    name,
                    type,
                    mimeType: type,
                    size: asset.fileSize || 0,
                    duration: asset.duration,
                    width: asset.width,
                    height: asset.height,
                };

                console.log('[ChatScreen] Sending video...');
                await chatMediaService.sendVideo(
                    conversation?._id || conversation?.id || "",
                    file,
                    messageText || undefined,
                    (progress) => setUploadProgress(progress)
                );

                setMessageText("");
                setUploadProgress(0);
                console.log('[ChatScreen] Video sent successfully');
            } catch (pickerError: any) {
                console.error('[ChatScreen] Video picker error:', pickerError);
                Alert.alert("Error", `Video picker error: ${pickerError.message}`);
            } finally {
                // Dismiss modal after picker completes
                setShowMediaMenu(false);
            }
        } catch (error: any) {
            Alert.alert("Error", `Failed to send video: ${error.message}`);
            setShowMediaMenu(false);
        } finally {
            setUploading(false);
        }
    }, [conversation, messageText]);

    /**
     * Pick and send audio
     */
    const handlePickAudio = useCallback(async () => {
        try {
            console.log('[ChatScreen] handlePickAudio called');
            // Don't dismiss modal yet
            // setShowMediaMenu(false);

            // Request permission
            const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!permissionResult.granted) {
                Alert.alert(
                    "Permission required",
                    "We need access to your storage. Please enable it in settings."
                );
                return;
            }

            // For audio, we'll open image library with a workaround
            // (proper audio picker would require react-native-document-picker or similar)
            Alert.alert(
                "Not Available",
                "Audio picker is not available in this version. Try recording directly or use web."
            );
        } catch (error: any) {
            Alert.alert("Error", `Failed to send audio: ${error.message}`);
        } finally {
            setShowMediaMenu(false);
        }
    }, []);

    /**
     * Pick and send document
     */
    const handlePickDocument = useCallback(async () => {
        try {
            console.log('[ChatScreen] handlePickDocument called');
            // Don't dismiss modal yet
            // setShowMediaMenu(false);

            // Request permission
            const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!permissionResult.granted) {
                Alert.alert(
                    "Permission required",
                    "We need access to your storage. Please enable it in settings."
                );
                return;
            }

            // For documents, we'll use image library to select PDFs/docs
            Alert.alert(
                "Not Available",
                "Document picker is not available in this version. Please use web or email the document."
            );
        } catch (error: any) {
            Alert.alert("Error", `Failed to send document: ${error.message}`);
        } finally {
            setShowMediaMenu(false);
        }
    }, []);

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

            {/* Loading initial messages - overlay only if truly loading */}
            {isLoading && messages.length === 0 && (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color={colors.text} />
                    <Text style={styles.loadingText}>Đang tải tin nhắn...</Text>
                </View>
            )}

            {/* Messages List or Empty State - always show when not loading OR when messages exist */}
            {!isLoading && (
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
                    ListEmptyComponent={
                        <View style={styles.emptyMessagesContainer}>
                            <Ionicons
                                name="chatbubble-outline"
                                size={56}
                                color={colors.textMuted}
                            />
                            <Text style={styles.emptyMessagesText}>
                                Hãy gửi lời chào đầu tiên
                            </Text>
                        </View>
                    }
                    ListFooterComponent={
                        <TypingIndicator typingUsers={typingUsers} />
                    }
                />
            )}

            {/* Upload progress bar */}
            {uploading && (
                <View style={styles.progressBarContainer}>
                    <View style={[styles.progressBar, { width: `${uploadProgress}%` }]} />
                    <Text style={styles.progressText}>{Math.round(uploadProgress)}%</Text>
                </View>
            )}

            {/* Message Composer */}
            <View style={styles.messageComposer}>
                <Pressable
                    style={styles.composerIconButton}
                    onPress={() => {
                        console.log('[ChatScreen] Attach button pressed, showMediaMenu:', showMediaMenu);
                        setShowMediaMenu(!showMediaMenu);
                    }}
                    disabled={uploading}
                >
                    <Ionicons name="attach-outline" size={24} color={uploading ? colors.textMuted : colors.text} />
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
                        editable={!isSending && !uploading}
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
                        (!messageText.trim() || isSending || uploading) &&
                        styles.composerSendButtonDisabled,
                    ]}
                    onPress={handleSendMessage}
                    disabled={!messageText.trim() || isSending || uploading}
                >
                    {isSending || uploading ? (
                        <ActivityIndicator size="small" color="#fff" />
                    ) : (
                        <Ionicons name="send" size={22} color="#fff" />
                    )}
                </Pressable>
            </View>

            {/* Media Menu Modal */}
            <Modal
                transparent
                visible={showMediaMenu}
                animationType="fade"
                onRequestClose={() => {
                    console.log('[ChatScreen] Modal onRequestClose');
                    setShowMediaMenu(false);
                }}
            >
                <Pressable
                    style={styles.modalOverlay}
                    onPress={() => {
                        console.log('[ChatScreen] Modal overlay pressed');
                        setShowMediaMenu(false);
                    }}
                >
                    <View
                        style={styles.mediaMenuContainer}
                    >
                        <Text style={styles.mediaMenuTitle}>Gửi media</Text>

                        <Pressable
                            style={styles.mediaMenuButton}
                            onPress={() => {
                                console.log('[ChatScreen] Image button pressed');
                                handlePickImage();
                            }}
                        >
                            <Ionicons name="image" size={24} color="#007AFF" />
                            <Text style={styles.mediaMenuButtonText}>Hình ảnh</Text>
                        </Pressable>

                        <Pressable
                            style={styles.mediaMenuButton}
                            onPress={() => {
                                console.log('[ChatScreen] Video button pressed');
                                handlePickVideo();
                            }}
                        >
                            <Ionicons name="videocam" size={24} color="#FF6B6B" />
                            <Text style={styles.mediaMenuButtonText}>Video</Text>
                        </Pressable>

                        <Pressable
                            style={styles.mediaMenuButton}
                            onPress={handlePickAudio}
                        >
                            <Ionicons name="musical-note" size={24} color="#FFA500" />
                            <Text style={styles.mediaMenuButtonText}>Audio</Text>
                        </Pressable>

                        <Pressable
                            style={styles.mediaMenuButton}
                            onPress={handlePickDocument}
                        >
                            <Ionicons name="document" size={24} color="#6C5CE7" />
                            <Text style={styles.mediaMenuButtonText}>Tài liệu</Text>
                        </Pressable>

                        <Pressable
                            style={styles.mediaMenuCloseButton}
                            onPress={() => setShowMediaMenu(false)}
                        >
                            <Text style={styles.mediaMenuCloseText}>Hủy</Text>
                        </Pressable>
                    </View>
                </Pressable>
            </Modal>
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
    emptyMessagesContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingVertical: 80,
        gap: 16,
    },
    emptyMessagesText: {
        fontSize: 16,
        color: colors.textMuted,
        fontWeight: "500",
    },

    // Progress bar styles
    progressBarContainer: {
        height: 30,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 12,
        gap: 8,
    },
    progressBar: {
        height: 6,
        backgroundColor: "#4f8cff",
        borderRadius: 3,
    },
    progressText: {
        fontSize: 11,
        fontWeight: "600",
        color: colors.text,
        minWidth: 30,
    },

    // Media menu styles
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        justifyContent: "flex-end",
    },
    mediaMenuContainer: {
        backgroundColor: colors.background,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingHorizontal: 16,
        paddingTop: 20,
        paddingBottom: 32,
    },
    mediaMenuTitle: {
        fontSize: 18,
        fontWeight: "700",
        color: colors.text,
        marginBottom: 16,
    },
    mediaMenuButton: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 12,
        marginBottom: 10,
    },
    mediaMenuButtonText: {
        fontSize: 16,
        fontWeight: "600",
        color: colors.text,
    },
    mediaMenuCloseButton: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: "#FF6B6B",
        alignItems: "center",
        marginTop: 6,
    },
    mediaMenuCloseText: {
        fontSize: 16,
        fontWeight: "600",
        color: "#FF6B6B",
    },

    // Media container in messages
    mediaContainer: {
        gap: 8,
    },
    mediaTimestamp: {
        flexDirection: "row",
        justifyContent: "flex-end",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 8,
        marginTop: 4,
    },
});
