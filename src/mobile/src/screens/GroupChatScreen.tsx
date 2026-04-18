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
    Image,
    ScrollView,
    Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { useChatMessage } from "../../../shared/hooks/useChat";
import { useGroupChatMessage } from "../../../shared/hooks/useGroupChatMessage";
import { useGroupChat } from "../../../shared/hooks/useGroupChat";
import { useAuth } from "../../../shared/hooks";
import { SocketService, ConversationService } from "../../../shared/services";
import chatMediaService from "../../../shared/services/chatMediaService";
import { Avatar, ForwardDialog, VoiceRecorder } from "../components";
import MediaMessage from "../components/MediaMessage";
import { colors } from "../theme";

/**
 * Helper function to generate unique asset ID - matches ChatScreen implementation
 */
const getDraftAssetId = (asset: any): string => {
    return [asset?.uri, asset?.fileName || asset?.name, asset?.fileSize || asset?.size, asset?.width, asset?.height]
        .filter(Boolean)
        .join("::");
};

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
    const { groupId } = route.params || {};
    const authContext = useAuth();
    const token = authContext.token;
    const { user } = authContext;
    const { state: chatState, actions: chatActions } = useGroupChatMessage(
        groupId,
        token || ""
    );
    const { state: groupState, actions: groupActions } = useGroupChat();

    // Local state
    const [messageText, setMessageText] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [showMediaMenu, setShowMediaMenu] = useState(false);
    const [draftMedia, setDraftMedia] = useState<DraftMediaAsset[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
    const [showForwardDialog, setShowForwardDialog] = useState(false);
    const [forwardMessageIds, setForwardMessageIds] = useState<string[]>([]);
    const [showEditDialog, setShowEditDialog] = useState(false);
    const [editText, setEditText] = useState("");
    const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);

    // Refs
    const flatListRef = useRef<FlatList>(null);
    const actionsRef = useRef(chatActions);

    // Update actionsRef when chatActions changes
    useEffect(() => {
        actionsRef.current = chatActions;
    }, [chatActions]);

    // Load group and messages on mount
    useEffect(() => {
        loadGroupData();
    }, [groupId]);

    // Mark messages as seen when they come into view
    useEffect(() => {
        if (chatState.messages.length > 0) {
            const messageIds = chatState.messages
                .filter((msg) => msg.senderId !== user?.id)
                .map((msg) => msg._id || msg.id)
                .filter(Boolean);

            if (messageIds.length > 0) {
                chatActions.markAsSeen?.(messageIds);
            }
        }
    }, [chatState.messages.length, user?.id, chatActions]);

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

    const appendDraftMedia = useCallback((assets: any[]) => {
        setDraftMedia((prev) => {
            const existingIds = new Set(prev.map((item) => item.id));
            const nextItems: (DraftMediaAsset | null)[] = assets
                .map((asset) => {
                    const uri = asset?.uri;
                    if (!uri) return null;

                    const name = asset.fileName || uri.split("/").pop() || "media";
                    const type = asset.mimeType || asset.type || "application/octet-stream";

                    return {
                        id: getDraftAssetId(asset),
                        uri,
                        name,
                        type,
                        mimeType: type,
                        size: asset.fileSize || asset.size,
                        width: asset.width,
                        height: asset.height,
                    } as DraftMediaAsset;
                })
                .filter((asset) => !!asset && !existingIds.has(asset!.id)) as DraftMediaAsset[];

            return [...prev, ...nextItems];
        });
    }, []);

    const handlePickImage = useCallback(async () => {
        try {
            console.log('[GroupChatScreen] Requesting media library permission...');
            const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
            console.log('[GroupChatScreen] Permission result:', permissionResult);

            if (!permissionResult.granted) {
                console.log('[GroupChatScreen] Permission denied');
                Alert.alert(
                    "Yêu cầu quyền",
                    "Chúng tôi cần quyền truy cập thư viện ảnh. Vui lòng bật nó trong cài đặt."
                );
                return;
            }

            console.log('[GroupChatScreen] Launching image library...');
            try {
                const result = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ['images'],
                    allowsMultipleSelection: true,
                    selectionLimit: 0,
                } as any);

                console.log('[GroupChatScreen] Image library result:', result.canceled ? 'canceled' : `${result.assets?.length || 0} images`);

                if (result.canceled) {
                    console.log('[GroupChatScreen] User canceled image selection');
                    return;
                }

                if (!result.assets || result.assets.length === 0) {
                    console.log('[GroupChatScreen] No assets selected');
                    Alert.alert("Lỗi", "Chưa chọn ảnh");
                    return;
                }

                const validAssets = result.assets.filter((asset) => asset?.uri && (asset?.type || asset?.mimeType));
                if (validAssets.length === 0) {
                    console.log('[GroupChatScreen] No valid image assets selected');
                    Alert.alert("Lỗi", "File ảnh không hợp lệ");
                    return;
                }
                appendDraftMedia(validAssets);
                console.log('[GroupChatScreen] Added images to draft tray:', validAssets.length);
            } catch (pickerError: any) {
                console.error('[GroupChatScreen] Image picker error:', pickerError);
                const errorMsg = pickerError.message || 'Lỗi không xác định';
                Alert.alert("Lỗi gửi ảnh", errorMsg);
            } finally {
                setShowMediaMenu(false);
            }
        } catch (permissionError: any) {
            console.error('[GroupChatScreen] Permission error:', permissionError);
            Alert.alert("Lỗi", "Không thể yêu cầu quyền");
        }
    }, [appendDraftMedia]);

    const handlePickVideo = useCallback(async () => {
        try {
            console.log('[GroupChatScreen] Launching video picker...');
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['videos'],
                allowsMultipleSelection: true,
            } as any);

            if (result.canceled) {
                console.log('[GroupChatScreen] User canceled video selection');
                return;
            }

            if (!result.assets || result.assets.length === 0) {
                console.log('[GroupChatScreen] No videos selected');
                Alert.alert("Lỗi", "Chưa chọn video");
                return;
            }

            const validAssets = result.assets.filter((asset) => asset?.uri && (asset?.type || asset?.mimeType));
            if (validAssets.length === 0) {
                console.log('[GroupChatScreen] No valid video assets selected');
                Alert.alert("Lỗi", "File video không hợp lệ");
                return;
            }
            appendDraftMedia(validAssets);
            console.log('[GroupChatScreen] Added videos to draft tray:', validAssets.length);
        } catch (pickerError: any) {
            console.error('[GroupChatScreen] Video picker error:', pickerError);
            const errorMsg = pickerError.message || 'Lỗi không xác định';
            Alert.alert("Lỗi gửi video", errorMsg);
        } finally {
            setShowMediaMenu(false);
        }
    }, [appendDraftMedia]);

    const handlePickAudioFile = useCallback(async () => {
        try {
            console.log('[GroupChatScreen] Launching audio picker...');
            const result = await DocumentPicker.getDocumentAsync({
                type: ["audio/*"],
            });

            if (result.canceled) {
                console.log('[GroupChatScreen] User canceled audio selection');
                return;
            }

            if (!result.assets || result.assets.length === 0) {
                console.log('[GroupChatScreen] No audio files selected');
                Alert.alert("Lỗi", "Chưa chọn file audio");
                return;
            }

            const validAssets = result.assets.filter((asset) => asset?.uri && asset?.mimeType);
            if (validAssets.length === 0) {
                console.log('[GroupChatScreen] No valid audio assets selected');
                Alert.alert("Lỗi", "File audio không hợp lệ");
                return;
            }
            appendDraftMedia(validAssets);
            console.log('[GroupChatScreen] Added audio files to draft tray:', validAssets.length);
        } catch (pickerError: any) {
            console.error('[GroupChatScreen] Audio picker error:', pickerError);
            const errorMsg = pickerError.message || 'Lỗi không xác định';
            Alert.alert("Lỗi gửi audio", errorMsg);
        } finally {
            setShowMediaMenu(false);
        }
    }, [appendDraftMedia]);

    const handlePickDocument = useCallback(async () => {
        try {
            console.log('[GroupChatScreen] Launching document picker...');
            const result = await DocumentPicker.getDocumentAsync({
                type: [
                    "application/pdf",
                    "application/msword",
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    "application/vnd.ms-excel",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    "application/vnd.ms-powerpoint",
                    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                    "text/plain",
                    "application/x-zip-compressed",
                    "application/x-rar-compressed",
                ],
            });

            if (result.canceled) {
                console.log('[GroupChatScreen] User canceled document selection');
                return;
            }

            if (!result.assets || result.assets.length === 0) {
                console.log('[GroupChatScreen] No documents selected');
                Alert.alert("Lỗi", "Chưa chọn tài liệu");
                return;
            }

            const validAssets = result.assets.filter((asset) => asset?.uri && asset?.mimeType);
            if (validAssets.length === 0) {
                console.log('[GroupChatScreen] No valid document assets selected');
                Alert.alert("Lỗi", "File tài liệu không hợp lệ");
                return;
            }
            appendDraftMedia(validAssets);
            console.log('[GroupChatScreen] Added documents to draft tray:', validAssets.length);
        } catch (pickerError: any) {
            console.error('[GroupChatScreen] Document picker error:', pickerError);
            const errorMsg = pickerError.message || 'Lỗi không xác định';
            Alert.alert("Lỗi gửi tài liệu", errorMsg);
        } finally {
            setShowMediaMenu(false);
        }
    }, [appendDraftMedia]);

    const handlePickAudio = useCallback(async () => {
        setShowVoiceRecorder(true);
        setShowMediaMenu(false);
    }, []);

    const removeDraftMedia = useCallback((assetId: string) => {
        setDraftMedia((prev) => prev.filter((item) => item.id !== assetId));
    }, []);

    const clearDraftMedia = useCallback(() => {
        setDraftMedia([]);
    }, []);

    const sendDraftMedia = useCallback(
        async (caption?: string) => {
            if (!groupId || draftMedia.length === 0) {
                return;
            }

            const sentMessages: any[] = [];
            setUploading(true);
            setUploadProgress(0);

            try {
                for (let index = 0; index < draftMedia.length; index += 1) {
                    const item = draftMedia[index];
                    const file = {
                        uri: item.uri,
                        name: item.name,
                        type: item.type,
                        mimeType: item.mimeType,
                        size: item.size || 0,
                        width: item.width,
                        height: item.height,
                    };

                    let result = [];

                    // Determine file type and call appropriate method
                    if (item.mimeType?.startsWith("image/")) {
                        result = await chatMediaService.sendImage(
                            groupId,
                            file,
                            index === 0 ? caption : undefined
                        );
                    } else if (item.mimeType?.startsWith("video/")) {
                        result = await chatMediaService.sendVideo(
                            groupId,
                            file,
                            index === 0 ? caption : undefined
                        );
                    } else if (item.mimeType?.startsWith("audio/")) {
                        result = await chatMediaService.sendAudio(
                            groupId,
                            file,
                            index === 0 ? caption : undefined
                        );
                    } else {
                        // Document or other file types
                        result = await chatMediaService.sendDocument(
                            groupId,
                            file
                        );
                    }

                    if (result.length > 0) {
                        sentMessages.push(...result);
                    }

                    const progress = Math.round(((index + 1) / draftMedia.length) * 100);
                    setUploadProgress(progress);
                }

                // Add all sent messages at once
                if (sentMessages.length > 0 && actionsRef.current?.addMessages) {
                    actionsRef.current.addMessages(sentMessages);

                    // Load latest messages from API to ensure media is populated
                    // (socket response might not include media field)
                    try {
                        const latestMessages = await ConversationService.loadMessages(groupId, undefined, 10);
                        if (latestMessages.items && latestMessages.items.length > 0) {
                            actionsRef.current.addMessages(latestMessages.items);
                        }
                    } catch (err) {
                        console.warn("[GroupChat] Failed to reload messages with media:", err);
                    }
                }
            } catch (err: any) {
                console.error("[GroupChat] Error sending media:", err);
                Alert.alert("Lỗi", `Gửi media thất bại: ${err.message}`);
            } finally {
                setUploading(false);
                setUploadProgress(0);
                clearDraftMedia();
            }
        },
        [groupId, draftMedia, clearDraftMedia]
    );

    const hasSendableContent = draftMedia.length > 0 || messageText.trim().length > 0;

    const handleSendMessage = useCallback(async () => {
        const trimmedText = messageText.trim();

        if (!hasSendableContent) return;

        try {
            setIsSending(true);

            // Send text message
            if (trimmedText) {
                await chatActions.sendMessage(trimmedText);
                setMessageText("");
            }

            // Send media
            if (draftMedia.length > 0) {
                await sendDraftMedia(trimmedText || undefined);
                setMessageText("");
            }

            flatListRef.current?.scrollToEnd({ animated: true });
        } catch (err: any) {
            Alert.alert("Lỗi", err.message || "Failed to send message");
        } finally {
            setIsSending(false);
        }
    }, [messageText, draftMedia, hasSendableContent, chatActions, sendDraftMedia]);

    const handleInputChange = useCallback((text: string) => {
        setMessageText(text);
        if (text.trim()) {
            chatActions.handleTyping();
        }
    }, [chatActions]);

    const handleMessageLongPress = useCallback((message: any) => {
        const messageId = message._id || message.id;
        if (!messageId) return;

        const isOwn = message.senderId === user?._id;
        const options: string[] = ["Hủy", "Xóa phía tôi"];
        const cancelButtonIndex = 0;

        // Add actions based on message ownership
        if (isOwn) {
            options.push("Sửa");
            options.push("Thu hồi");
        }

        options.push("Chuyển tiếp");

        Alert.alert(
            "Tùy chọn tin nhắn",
            `${message.text?.substring(0, 50) || "[Media]"}`,
            options.map((action, index) => ({
                text: action,
                onPress: () => {
                    if (action === "Hủy") return;
                    if (action === "Sửa") {
                        setSelectedMessageId(messageId);
                        setEditText(message.text || "");
                        setShowEditDialog(true);
                    } else if (action === "Xóa phía tôi") {
                        Alert.alert(
                            "Xóa tin nhắn",
                            "Xóa tin nhắn này khỏi phía bạn?",
                            [
                                { text: "Hủy", style: "cancel" },
                                {
                                    text: "Xóa",
                                    style: "destructive",
                                    onPress: async () => {
                                        try {
                                            if (actionsRef.current?.deleteMessage) {
                                                await actionsRef.current.deleteMessage(messageId);
                                            }
                                        } catch (error: any) {
                                            Alert.alert("Lỗi", error.message || "Không thể xóa tin nhắn");
                                        }
                                    },
                                },
                            ]
                        );
                    } else if (action === "Thu hồi") {
                        Alert.alert(
                            "Thu hồi tin nhắn",
                            "Tin nhắn sẽ bị xóa với tất cả mọi người?",
                            [
                                { text: "Hủy", style: "cancel" },
                                {
                                    text: "Thu hồi",
                                    style: "destructive",
                                    onPress: async () => {
                                        try {
                                            if (actionsRef.current?.revokeMessage) {
                                                await actionsRef.current.revokeMessage(messageId);
                                            }
                                        } catch (error: any) {
                                            Alert.alert("Lỗi", error.message || "Không thể thu hồi tin nhắn");
                                        }
                                    },
                                },
                            ]
                        );
                    } else if (action === "Chuyển tiếp") {
                        setForwardMessageIds([messageId]);
                        setShowForwardDialog(true);
                    }
                },
                style:
                    index === cancelButtonIndex
                        ? "cancel"
                        : action === "Xóa phía tôi" || action === "Thu hồi"
                            ? "destructive"
                            : "default",
            }))
        );
    }, [user?._id]);

    const handleSaveEdit = useCallback(async () => {
        if (!selectedMessageId || !editText.trim()) {
            Alert.alert("Lỗi", "Tin nhắn không có nội dung");
            return;
        }

        try {
            if (actionsRef.current?.editMessage) {
                await actionsRef.current.editMessage(selectedMessageId, editText.trim());
                setShowEditDialog(false);
                setSelectedMessageId(null);
                setEditText("");
            }
        } catch (error: any) {
            Alert.alert("Lỗi", error.message || "Không thể sửa tin nhắn");
        }
    }, [selectedMessageId, editText]);

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
            // Use correct field: user.id (not user._id)
            const isOwn = item.senderId === user?.id;

            // Get sender name from message or fallback to member data
            let senderName = item.senderName;
            if (!senderName) {
                // Fallback: find member name from group members
                const senderMember = groupState.members?.find(
                    (member) => member.userId === item.senderId
                );
                senderName = senderMember?.name || "Unknown";
            }

            const senderInitials = (senderName || "?")
                .split(" ")
                .map((n: string) => n[0].toUpperCase())
                .join("")
                .slice(0, 2);

            // Get sender's avatar from group members
            const senderMember = groupState.members?.find(
                (member) => member.userId === item.senderId
            );
            const senderAvatar = senderMember?.avatar;

            const hasMedia = item.media && item.media.length > 0;
            const hasText = item.text && item.text.trim().length > 0;

            return (
                <Pressable
                    onLongPress={() => handleMessageLongPress(item)}
                    delayLongPress={300}
                >
                    <View
                        style={[
                            styles.messageBubbleRow,
                            isOwn ? styles.outgoingRow : styles.incomingRow,
                        ]}
                    >
                        {!isOwn && (
                            <Avatar
                                label={senderInitials}
                                size={32}
                                backgroundColor={colors.accentStrong}
                                imageUrl={senderAvatar}
                            />
                        )}

                        <View style={styles.messageContentWrapper}>
                            {/* Render Media - Outside bubble for better sizing */}
                            {hasMedia && (
                                <View style={styles.mediaContainer}>
                                    {item.media.map((m: any, idx: number) => (
                                        <MediaMessage
                                            key={idx}
                                            media={m}
                                            isSender={isOwn}
                                        />
                                    ))}
                                </View>
                            )}

                            {/* Text Message Bubble - Only if has text or is incoming without media */}
                            {hasText && (
                                <View
                                    style={[
                                        styles.messageBubble,
                                        isOwn ? styles.messageBubbleOwn : styles.messageBubbleOther,
                                    ]}
                                >
                                    {!isOwn && (
                                        <Text style={styles.senderName}>
                                            {senderName}
                                        </Text>
                                    )}
                                    <Text style={[
                                        styles.messageText,
                                        isOwn ? styles.messageTextOwn : styles.messageTextOther,
                                    ]}>
                                        {item.text}
                                    </Text>
                                    <Text style={styles.messageTime}>
                                        {new Date(item.createdAt).toLocaleTimeString(
                                            "vi-VN",
                                            { hour: "2-digit", minute: "2-digit" }
                                        )}
                                    </Text>
                                </View>
                            )}

                            {/* Show sender name for media-only messages */}
                            {hasMedia && !hasText && !isOwn && (
                                <Text style={styles.senderName}>
                                    {senderName}
                                </Text>
                            )}
                        </View>
                    </View>
                </Pressable>
            );
        },
        [user?.id, handleMessageLongPress, groupState.members]
    );

    const handleViewableItemsChanged = useCallback(
        ({ viewableItems }: any) => {
            if (!viewableItems || viewableItems.length === 0) return;

            const visibleMessageIds = viewableItems
                .map((item: any) => item.item)
                .filter((msg: any) => msg.senderId !== user?.id)
                .map((msg: any) => msg._id || msg.id)
                .filter(Boolean);

            if (visibleMessageIds.length > 0) {
                actionsRef.current?.markAsSeen?.(visibleMessageIds);
            }
        },
        [user?.id]
    );

    const viewabilityConfigRef = useRef({
        itemVisiblePercentThreshold: 10,
        minimumViewTime: 300,
    });

    if (!groupState.group) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.accent} />
                <Text style={styles.loadingText}>Đang tải...</Text>
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
                        {groupState.group?.name || "Nhóm"}
                    </Text>
                    <Text style={styles.chatHeaderSubtitle}>
                        {chatState.typingUsers.size > 0
                            ? `${Array.from(chatState.typingUsers).length} đang gõ...`
                            : `${groupState.members?.length || 0} thành viên`}
                    </Text>
                </View>
                <Pressable
                    style={styles.headerIconButton}
                    onPress={handleLeaveGroup}
                    hitSlop={8}
                >
                    <Ionicons
                        name="exit-outline"
                        size={24}
                        color={colors.text}
                    />
                </Pressable>
            </View>

            {/* Loading state */}
            {chatState.isLoading && chatState.messages.length === 0 && (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color={colors.text} />
                    <Text style={styles.loadingText}>Đang tải tin nhắn...</Text>
                </View>
            )}

            {/* Messages List */}
            {!chatState.isLoading && (
                <FlatList
                    ref={flatListRef}
                    data={chatState.messages}
                    keyExtractor={(item) => item._id || item.id || `${item.senderId}-${item.createdAt}`}
                    renderItem={renderMessage}
                    inverted
                    contentContainerStyle={styles.messagesContainer}
                    scrollEventThrottle={16}
                    onEndReachedThreshold={0.5}
                    onEndReached={() => {
                        if (chatState.hasMoreMessages) {
                            chatActions.loadMoreMessages?.();
                        }
                    }}
                    onViewableItemsChanged={handleViewableItemsChanged}
                    viewabilityConfig={viewabilityConfigRef.current}
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
                        chatState.typingUsers.size > 0 && (
                            <View style={styles.typingIndicator}>
                                <View style={styles.typingDots}>
                                    <View style={styles.typingDot} />
                                    <View style={styles.typingDot} />
                                    <View style={styles.typingDot} />
                                </View>
                            </View>
                        )
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

            {/* Draft Media Tray */}
            {draftMedia.length > 0 && (
                <View style={styles.draftTrayContainer}>
                    <View style={styles.draftTrayHeader}>
                        <Text style={styles.draftTrayTitle}>
                            {draftMedia.length} file đã chọn
                        </Text>
                        <Pressable onPress={clearDraftMedia} hitSlop={8}>
                            <Ionicons name="trash-outline" size={20} color={colors.textOnAccent} />
                        </Pressable>
                    </View>

                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.draftTrayScrollContent}
                    >
                        {draftMedia.map((item) => (
                            <View key={item.id} style={styles.draftThumbWrap}>
                                {item.mimeType?.startsWith("image/") && (
                                    <Image source={{ uri: item.uri }} style={styles.draftThumbImage} />
                                )}
                                {item.mimeType?.startsWith("audio/") && (
                                    <View style={[styles.draftThumbImage, { backgroundColor: colors.surfaceSoft, justifyContent: "center", alignItems: "center" }]}>
                                        <Ionicons name="musical-note" size={24} color={colors.text} />
                                    </View>
                                )}
                                <Pressable
                                    style={styles.draftThumbRemove}
                                    onPress={() => removeDraftMedia(item.id)}
                                    hitSlop={8}
                                >
                                    <Ionicons name="close" size={14} color={colors.textOnAccent} />
                                </Pressable>
                            </View>
                        ))}

                        <Pressable
                            style={styles.draftAddMore}
                            onPress={handlePickImage}
                            disabled={uploading}
                        >
                            <Ionicons name="add" size={24} color={colors.text} />
                            <Text style={styles.draftAddMoreText}>Thêm</Text>
                        </Pressable>
                    </ScrollView>
                </View>
            )}

            {/* Voice Recorder Component */}
            <VoiceRecorder
                visible={showVoiceRecorder}
                onHide={() => setShowVoiceRecorder(false)}
                conversationId={groupId}
                messageText={messageText}
                onMessageSent={(messages) => {
                    if (actionsRef.current?.addMessages) {
                        actionsRef.current.addMessages(messages);
                    }
                    flatListRef.current?.scrollToEnd({ animated: true });
                }}
                onUploadProgress={(progress) => {
                    setUploadProgress(progress);
                    if (progress > 0) {
                        setUploading(true);
                    } else {
                        setUploading(false);
                    }
                }}
            />

            {/* Media Menu */}
            {showMediaMenu && !showVoiceRecorder && (
                <View style={styles.mediaMenuContainer}>
                    <Text style={styles.mediaMenuTitle}>Ghim</Text>
                    <Pressable
                        style={styles.mediaMenuItem}
                        onPress={handlePickImage}
                    >
                        <Ionicons name="image" size={24} color={colors.mediaImageIcon} />
                        <Text style={styles.mediaMenuItemText}>Thư Viện</Text>
                    </Pressable>
                    <Pressable
                        style={styles.mediaMenuItem}
                        onPress={handlePickVideo}
                    >
                        <Ionicons name="videocam" size={24} color={colors.mediaVideoIcon} />
                        <Text style={styles.mediaMenuItemText}>Video</Text>
                    </Pressable>
                    <Pressable
                        style={styles.mediaMenuItem}
                        onPress={handlePickAudioFile}
                    >
                        <Ionicons name="musical-note" size={24} color={colors.mediaAudioIcon} />
                        <Text style={styles.mediaMenuItemText}>Audio</Text>
                    </Pressable>
                    <Pressable
                        style={styles.mediaMenuItem}
                        onPress={handlePickDocument}
                    >
                        <Ionicons name="document" size={24} color={colors.mediaDocumentIcon} />
                        <Text style={styles.mediaMenuItemText}>Tài Liệu</Text>
                    </Pressable>
                </View>
            )}

            {/* Message Composer */}
            <View style={styles.messageComposer}>
                <Pressable
                    style={styles.composerIconButton}
                    onPress={() => setShowMediaMenu(!showMediaMenu)}
                    disabled={uploading}
                >
                    <Ionicons
                        name="attach-outline"
                        size={24}
                        color={uploading ? colors.textMuted : colors.text}
                    />
                </Pressable>
                <View style={styles.composerInputWrap}>
                    <TextInput
                        placeholder="Tin nhắn"
                        placeholderTextColor={colors.textMuted}
                        style={styles.composerInput}
                        value={messageText}
                        onChangeText={handleInputChange}
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
                        styles.composerActionButton,
                        hasSendableContent ? styles.composerSendButton : styles.composerMicButton,
                        (!hasSendableContent && uploading) && styles.composerActionButtonDisabled,
                        (hasSendableContent && (isSending || uploading)) && styles.composerActionButtonDisabled,
                    ]}
                    onPress={hasSendableContent ? handleSendMessage : handlePickAudio}
                    disabled={
                        (hasSendableContent && isSending) ||
                        (!hasSendableContent && uploading) ||
                        (hasSendableContent && uploading)
                    }
                >
                    {hasSendableContent ? (
                        isSending || uploading ? (
                            <ActivityIndicator size="small" color={colors.textOnAccent} />
                        ) : (
                            <Ionicons name="send" size={22} color={colors.textOnAccent} />
                        )
                    ) : uploading ? (
                        <ActivityIndicator size="small" color={colors.textOnAccent} />
                    ) : (
                        <Ionicons name="mic" size={22} color={colors.textOnAccent} />
                    )}
                </Pressable>
            </View>

            {/* Forward Dialog Modal */}
            {/* TODO: Implement forward dialog */}

            {/* Edit Message Dialog Modal */}
            {/* TODO: Implement edit dialog */}
        </KeyboardAvoidingView>
    );
};

interface DraftMediaAsset {
    id: string;
    uri: string;
    name: string;
    type: string;
    mimeType: string;
    size?: number;
    width?: number;
    height?: number;
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: colors.background,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        gap: 12,
    },
    centerContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        gap: 12,
    },
    loadingText: {
        fontSize: 14,
        color: colors.textMuted,
    },

    // Header
    chatHeaderWrap: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 8,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        gap: 8,
    },
    backButton: {
        padding: 8,
        justifyContent: "center",
        alignItems: "center",
    },
    chatHeaderCard: {
        flex: 1,
        justifyContent: "center",
    },
    chatHeaderTitle: {
        fontSize: 16,
        fontWeight: "600",
        color: colors.text,
        lineHeight: 20,
    },
    chatHeaderSubtitle: {
        fontSize: 12,
        color: colors.textMuted,
        marginTop: 2,
    },
    headerIconButton: {
        padding: 8,
        justifyContent: "center",
        alignItems: "center",
    },

    // Messages
    messagesContainer: {
        paddingHorizontal: 14,
        paddingVertical: 16,
        gap: 8,
    },
    messageBubbleRow: {
        flexDirection: "row",
        alignItems: "flex-end",
        gap: 8,
    },
    messageContentWrapper: {
        flexDirection: "column",
        gap: 6,
        flex: 1,
    },
    outgoingRow: {
        justifyContent: "flex-end",
    },
    incomingRow: {
        justifyContent: "flex-start",
    },
    messageBubble: {
        maxWidth: "82%",
        borderRadius: 18,
        paddingHorizontal: 14,
        paddingVertical: 10,
        gap: 6,
    },
    messageBubbleOwn: {
        backgroundColor: colors.accent,
        borderTopRightRadius: 6,
    },
    messageBubbleOther: {
        backgroundColor: colors.surface,
        borderTopLeftRadius: 6,
    },
    senderName: {
        fontSize: 11,
        fontWeight: "600",
        color: colors.textMuted,
    },
    messageText: {
        fontSize: 15,
        lineHeight: 20,
        fontWeight: "500",
    },
    messageTextOwn: {
        color: colors.textOnAccent,
    },
    messageTextOther: {
        color: colors.text,
    },
    messageTime: {
        fontSize: 11,
        color: colors.overlayWhite75,
        marginTop: 6,
    },
    mediaContainer: {
        gap: 8,
    },

    // Empty state
    emptyMessagesContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        gap: 12,
    },
    emptyMessagesText: {
        fontSize: 14,
        color: colors.textMuted,
    },

    // Typing indicator
    typingIndicator: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        alignItems: "flex-start",
    },
    typingDots: {
        flexDirection: "row",
        gap: 4,
        alignItems: "center",
    },
    typingDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.textMuted,
    },

    // Message Composer
    messageComposer: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 12,
        paddingVertical: 8,
        gap: 8,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    composerIconButton: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        justifyContent: "center",
        alignItems: "center",
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
    composerActionButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
    },
    composerSendButton: {
        backgroundColor: colors.accentStrong,
    },
    composerMicButton: {
        backgroundColor: colors.surface,
    },
    composerActionButtonDisabled: {
        opacity: 0.5,
    },

    // Upload progress
    progressBarContainer: {
        height: 32,
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 12,
        gap: 8,
    },
    progressBar: {
        height: 4,
        backgroundColor: colors.accent,
        borderRadius: 2,
    },
    progressText: {
        fontSize: 12,
        color: colors.textMuted,
        minWidth: 30,
    },

    // Draft media tray
    draftTrayContainer: {
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    draftTrayHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 8,
    },
    draftTrayTitle: {
        fontSize: 12,
        fontWeight: "600",
        color: colors.text,
    },
    draftTrayScrollContent: {
        gap: 8,
    },
    draftThumbWrap: {
        position: "relative",
        width: 60,
        height: 60,
    },
    draftThumbImage: {
        width: 60,
        height: 60,
        borderRadius: 8,
        backgroundColor: colors.border,
    },
    draftThumbRemove: {
        position: "absolute",
        top: -4,
        right: -4,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: colors.accent,
        justifyContent: "center",
        alignItems: "center",
    },
    draftAddMore: {
        width: 60,
        height: 60,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        justifyContent: "center",
        alignItems: "center",
        gap: 4,
    },
    draftAddMoreText: {
        fontSize: 11,
        color: colors.text,
    },


    // Media menu
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
    mediaMenuItem: {
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
    mediaMenuItemText: {
        fontSize: 16,
        fontWeight: "600",
        color: colors.text,
    },

    // Modals
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        justifyContent: "center",
        alignItems: "center",
    },
    modalContent: {
        width: "80%",
        maxWidth: 360,
    },
    forwardDialogContent: {
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 16,
        gap: 12,
    },
    forwardDialogTitle: {
        fontSize: 16,
        fontWeight: "600",
        color: colors.text,
    },
    forwardDialogMessage: {
        fontSize: 14,
        color: colors.textMuted,
        fontStyle: "italic",
        paddingHorizontal: 8,
    },
    forwardDialogButtons: {
        flexDirection: "row",
        gap: 8,
    },
    forwardDialogButton: {
        flex: 1,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 8,
        justifyContent: "center",
        alignItems: "center",
    },
    forwardDialogCancelButton: {
        backgroundColor: colors.border,
    },
    forwardDialogConfirmButton: {
        backgroundColor: colors.accent,
    },
    forwardDialogButtonText: {
        fontSize: 14,
        fontWeight: "600",
        color: colors.text,
    },

    editDialogContent: {
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 16,
        gap: 12,
    },
    editDialogTitle: {
        fontSize: 16,
        fontWeight: "600",
        color: colors.text,
    },
    editDialogInput: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
        color: colors.text,
        minHeight: 100,
        textAlignVertical: "top",
    },
    editDialogButtons: {
        flexDirection: "row",
        gap: 8,
    },
    editDialogButton: {
        flex: 1,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 8,
        justifyContent: "center",
        alignItems: "center",
    },
    editDialogCancelButton: {
        backgroundColor: colors.border,
    },
    editDialogSaveButton: {
        backgroundColor: colors.accent,
    },
    editDialogButtonText: {
        fontSize: 14,
        fontWeight: "600",
        color: colors.text,
    },
});

