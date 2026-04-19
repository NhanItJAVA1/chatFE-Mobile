import React, { useCallback, useMemo, useRef, useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
    Image,
    PanResponder,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
    ActivityIndicator,
    FlatList,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
    Alert,
    Modal,
    Dimensions,
} from "react-native";
import { Audio } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { useChatMessage } from "../../../shared/hooks/useChat";
import { useAuth } from "../../../shared/hooks";
import { Avatar, ForwardDialog } from "../components";
import { colors } from "../theme";
import { buildMessageActionSheetOptions } from "../../../shared/utils";
import MediaMessage from "../components/MediaMessage";
import chatMediaService from "../../../shared/services/chatMediaService";
import { unfriend } from "../../../shared/services/friendService";
import { FriendSocketService, type FriendshipNotification } from "../../../shared/services/friendSocket";
import type { ChatScreenProps, MessageMedia } from "@/types";
import type { MessagePayload } from "../../../shared/services/socketService";

/**
 * Message Bubble Component
 */
const MessageBubble: React.FC<{
    message: MessagePayload;
    isOwn: boolean;
    onLongPress?: () => void;
}> = ({ message, isOwn, onLongPress }) => {
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
        <Pressable
            onLongPress={onLongPress}
            delayLongPress={300}
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
                            layoutMode={message.text ? 'compact' : 'standalone'}
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

        </Pressable>
    );
};

const GALLERY_GROUP_WINDOW_MS = 5000;

type RenderableChatItem =
    | {
        kind: "message";
        key: string;
        message: MessagePayload;
    }
    | {
        kind: "gallery";
        key: string;
        messages: MessagePayload[];
        isOwn: boolean;
    };

type DraftMediaAsset = {
    id: string;
    uri: string;
    name: string;
    type: string;
    mimeType: string;
    size: number | undefined;
    width: number | undefined;
    height: number | undefined;
};

const getMessageKey = (message: MessagePayload): string => {
    return message._id || message.id || message.createdAt;
};

const getMessageCreatedAtMs = (message: MessagePayload): number => {
    const time = new Date(message.createdAt).getTime();
    return Number.isNaN(time) ? 0 : time;
};

const getDraftAssetId = (asset: any): string => {
    return [asset?.uri, asset?.fileName || asset?.name, asset?.fileSize || asset?.size, asset?.width, asset?.height]
        .filter(Boolean)
        .join("::");
};

const isImageMessage = (message: MessagePayload): boolean => {
    const firstMedia = message.media?.[0];
    return Boolean(
        firstMedia &&
        (firstMedia.mediaType === "image" ||
            firstMedia.mimetype?.startsWith("image/") ||
            message.type === "image")
    );
};

const groupMessagesForGallery = (
    messages: MessagePayload[],
    currentUserId: string
): RenderableChatItem[] => {
    const groupedItems: RenderableChatItem[] = [];
    let index = 0;

    while (index < messages.length) {
        const currentMessage = messages[index];

        if (isImageMessage(currentMessage)) {
            const consecutiveImages = [currentMessage];
            let nextIndex = index + 1;

            while (nextIndex < messages.length) {
                const nextMessage = messages[nextIndex];
                const previousMessage = messages[nextIndex - 1];

                if (
                    !isImageMessage(nextMessage) ||
                    nextMessage.senderId !== currentMessage.senderId ||
                    Math.abs(getMessageCreatedAtMs(nextMessage) - getMessageCreatedAtMs(previousMessage)) > GALLERY_GROUP_WINDOW_MS
                ) {
                    break;
                }

                consecutiveImages.push(nextMessage);
                nextIndex += 1;
            }

            if (consecutiveImages.length >= 3) {
                groupedItems.push({
                    kind: "gallery",
                    key: `gallery-${getMessageKey(consecutiveImages[0])}`,
                    messages: consecutiveImages,
                    isOwn: currentMessage.senderId === currentUserId,
                });
            } else {
                consecutiveImages.forEach((message) => {
                    groupedItems.push({
                        kind: "message",
                        key: getMessageKey(message),
                        message,
                    });
                });
            }

            index = nextIndex;
            continue;
        }

        groupedItems.push({
            kind: "message",
            key: getMessageKey(currentMessage),
            message: currentMessage,
        });
        index += 1;
    }

    return groupedItems;
};

const ImageGalleryBubble: React.FC<{
    messages: MessagePayload[];
    isOwn: boolean;
    onLongPress?: () => void;
    onImagePress?: (messages: MessagePayload[], startIndex: number) => void;
}> = ({ messages, isOwn, onLongPress, onImagePress }) => {
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

    const galleryImages = messages.slice(0, 3);
    const lastMessage = messages[messages.length - 1];
    const extraCount = Math.max(0, messages.length - galleryImages.length);
    const captionText = messages.find((message) => message.text)?.text;

    return (
        <Pressable
            onLongPress={onLongPress}
            delayLongPress={300}
            style={[
                styles.bubbleRow,
                isOwn ? styles.outgoingRow : styles.incomingRow,
            ]}
        >
            <View style={[styles.bubble, isOwn ? styles.outgoingBubble : styles.incomingBubble, styles.galleryBubble]}>
                <View style={styles.galleryGrid}>
                    {galleryImages.map((mediaMessage, index) => (
                        <Pressable
                            key={getMessageKey(mediaMessage)}
                            style={styles.galleryTileWrap}
                            onPress={() => onImagePress?.(messages, index)}
                        >
                            <Image
                                source={{ uri: mediaMessage.media?.[0]?.url }}
                                style={styles.galleryTileImage}
                            />
                            {index === galleryImages.length - 1 && extraCount > 0 && (
                                <View style={styles.galleryOverlay}>
                                    <Text style={styles.galleryOverlayText}>+{extraCount}</Text>
                                </View>
                            )}
                        </Pressable>
                    ))}
                </View>

                {captionText ? (
                    <Text style={[styles.galleryCaptionText, isOwn ? styles.outgoingGalleryCaptionText : styles.incomingGalleryCaptionText]}>
                        {captionText}
                    </Text>
                ) : null}

                <View style={styles.bubbleMetaRow}>
                    <Text style={styles.bubbleTime}>{formatTime(lastMessage.createdAt)}</Text>
                    {isOwn && (
                        <Text style={[styles.bubbleTime, lastMessage.status === "seen" && styles.seenStatus]}>
                            {getStatusIcon(lastMessage.status)}
                        </Text>
                    )}
                </View>
            </View>
        </Pressable>
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
    const [showVoiceRecorder, setShowVoiceRecorder] = React.useState(false);
    const [showForwardDialog, setShowForwardDialog] = React.useState(false);
    const [forwardMessageIds, setForwardMessageIds] = React.useState<string[]>([]);
    const [draftMedia, setDraftMedia] = React.useState<DraftMediaAsset[]>([]);
    const [uploading, setUploading] = React.useState(false);
    const [uploadProgress, setUploadProgress] = React.useState(0);
    const [isRecordingAudio, setIsRecordingAudio] = React.useState(false);
    const [isCancelingAudio, setIsCancelingAudio] = React.useState(false);
    const [recordingSeconds, setRecordingSeconds] = React.useState(0);
    const [selectedMessageId, setSelectedMessageId] = React.useState<string | null>(null);
    const [showEditDialog, setShowEditDialog] = React.useState(false);
    const [editText, setEditText] = React.useState("");
    const [viewingGalleryMessages, setViewingGalleryMessages] = React.useState<MessagePayload[] | null>(null);
    const [selectedImageIndex, setSelectedImageIndex] = React.useState(0);
    const [allViewerImages, setAllViewerImages] = React.useState<Array<{ uri: string; key: string }>>([]);
    const [showAvatarMenu, setShowAvatarMenu] = React.useState(false);
    const [unfriending, setUnfriending] = React.useState(false);
    const flatListRef = useRef<FlatList>(null);
    const imageViewerScrollRef = useRef<FlatList>(null);
    const actionsRef = useRef<any>(null);
    const recordingRef = useRef<Audio.Recording | null>(null);
    const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const cancelAudioRef = useRef(false);
    const recordingStartPromiseRef = useRef<Promise<void> | null>(null);

    const friendId = chatUser?.id;
    const currentUserId = currentUser?.id || (currentUser as any)?._id || "";

    // DEBUG: Track when chatUser changes
    useEffect(() => {
        console.log('[ChatScreen] ===== chatUser CHANGED =====');
        console.log('[ChatScreen] New chatUser:', {
            id: chatUser?.id,
            displayName: (chatUser as any)?.displayName || chatUser?.name,
        });
        console.log('[ChatScreen] Token available:', token ? `${token.substring(0, 20)}...` : 'MISSING');
    }, [chatUser?.id, token]);

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

    React.useEffect(() => {
        return () => {
            if (recordingIntervalRef.current) {
                clearInterval(recordingIntervalRef.current);
                recordingIntervalRef.current = null;
            }

            if (recordingRef.current) {
                recordingRef.current.stopAndUnloadAsync().catch(() => { });
                recordingRef.current = null;
            }
        };
    }, []);

    // Scroll to initial image when modal opens
    React.useEffect(() => {
        if (viewingGalleryMessages && imageViewerScrollRef.current && selectedImageIndex > 0) {
            const screenWidth = Dimensions.get("window").width;
            setTimeout(() => {
                (imageViewerScrollRef.current as any)?.scrollToIndex({
                    index: selectedImageIndex,
                    animated: false,
                });
            }, 100);
        }
    }, [viewingGalleryMessages, selectedImageIndex]);

    // Listen for unfriend event - if current chat partner unfriends us, navigate back
    React.useEffect(() => {
        const handleUnfriended = (notification: FriendshipNotification): void => {
            // notification.data.unfriendedBy = user who did the unfriending
            // notification.data.userId = user who was unfriended
            const unfrienderUserId = notification.data?.unfriendedBy;

            // Check if we (current user) were unfriended by the person we're chatting with
            if (unfrienderUserId === friendId) {
                Alert.alert(
                    "Kết nối bị hủy",
                    `${truncateName(chatUser?.name || "Người dùng")} đã hủy kết bạn với bạn.`,
                    [
                        {
                            text: "Quay lại",
                            onPress: () => {
                                onBackPress?.();
                            },
                        }
                    ]
                );
            }
        };

        FriendSocketService.onFriendshipUnfriended(handleUnfriended);

        return () => {
            FriendSocketService.offFriendshipUnfriended();
        };
    }, [friendId, chatUser?.name, onBackPress]);

    const {
        conversation,
        messages,
        isLoading,
        isSending,
        error,
        typingUsers,
        hasMoreMessages,
    } = state;

    const renderableMessages = useMemo(
        () => groupMessagesForGallery(messages, currentUser?.id || currentUserId),
        [messages, currentUser?.id, currentUserId]
    );

    // Auto-mark messages as seen when new messages arrive
    // Auto mark as seen handled by handleViewableItemsChanged callback
    // (when new messages arrive, they become visible and scroll callback marks them)
    // Removed redundant useEffect here to reduce spam

    // Truncate name helper
    const truncateName = (name: string | undefined, maxLength = 20) => {
        if (!name || name.length <= maxLength) {
            return name;
        }
        return name.slice(0, Math.floor(maxLength / 2)) + "...";
    };

    // Get all images from a user for the image viewer
    const getAllUserImages = useCallback((senderId: string, firstGalleryMessages: MessagePayload[]) => {
        // Find all messages from this sender that have images
        const userMessagesWithImages = messages.filter(
            (msg) => msg.senderId === senderId && msg.media && msg.media.length > 0
        );

        // Flatten all images
        const allImages = userMessagesWithImages.flatMap((msg) =>
            msg.media?.map((m, idx) => ({
                uri: m.url,
                key: `${getMessageKey(msg)}-${idx}`,
                msgId: getMessageKey(msg),
            })) || []
        );

        // Find the starting index: look for where the first gallery message's first image is
        const firstGalleryMsgId = getMessageKey(firstGalleryMessages[0]);
        const startingIndex = allImages.findIndex((img) => img.msgId === firstGalleryMsgId);

        return {
            allImages,
            startingIndex: startingIndex >= 0 ? startingIndex : 0,
        };
    }, [messages]);

    // Get user display info
    const userName = chatUser?.displayName || "Unknown";
    const userInitials =
        chatUser?.displayName
            ?.split(" ")
            .map((n: string) => n[0].toUpperCase())
            .join("")
            .slice(0, 2) || "??";
    const userAvatar = chatUser?.avatarUrl || chatUser?.avatar;
    const userColor = chatUser?.color || colors.accentStrong;
    const hasDraftMedia = draftMedia.length > 0;
    const hasSendableContent = hasDraftMedia || messageText.trim().length > 0;

    const appendDraftMedia = useCallback((assets: any[]) => {
        setDraftMedia((prev) => {
            const existingIds = new Set(prev.map((item) => item.id));
            const nextItems: DraftMediaAsset[] = assets
                .map((asset) => {
                    const uri = asset?.uri;
                    if (!uri) return null;

                    const name = asset.fileName || uri.split("/").pop() || "image.jpg";
                    const type = asset.mimeType || asset.type || "image/jpeg";

                    return {
                        id: getDraftAssetId(asset),
                        uri,
                        name,
                        type,
                        mimeType: type,
                        size: asset.fileSize || asset.size,
                        width: asset.width,
                        height: asset.height,
                    };
                })
                .filter((asset): asset is DraftMediaAsset => !!asset && !existingIds.has(asset.id));

            return [...prev, ...nextItems];
        });
    }, []);

    const removeDraftMedia = useCallback((assetId: string) => {
        setDraftMedia((prev) => prev.filter((item) => item.id !== assetId));
    }, []);

    const clearDraftMedia = useCallback(() => {
        setDraftMedia([]);
    }, []);

    const sendDraftMedia = useCallback(
        async (caption?: string) => {
            if (!conversation || draftMedia.length === 0) {
                return [] as MessagePayload[];
            }

            const conversationId = conversation._id || conversation.id || "";
            const sentMessages: MessagePayload[] = [];

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

                    const result = await chatMediaService.sendImage(
                        conversationId,
                        file,
                        index === 0 ? caption : undefined
                    );

                    if (result.length > 0) {
                        sentMessages.push(...result);
                    }

                    const progress = Math.round(((index + 1) / draftMedia.length) * 100);
                    setUploadProgress(progress);
                }

                if (sentMessages.length > 0 && actionsRef.current?.addMessages) {
                    actionsRef.current.addMessages(sentMessages);
                }

                return sentMessages;
            } finally {
                setUploading(false);
                setUploadProgress(0);
                clearDraftMedia();
            }
        },
        [conversation, draftMedia, clearDraftMedia]
    );

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
                    allowsMultipleSelection: true,
                    selectionLimit: 0,
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

                const validAssets = result.assets.filter((asset) => asset?.uri && (asset?.type || asset?.mimeType));
                if (validAssets.length === 0) {
                    console.log('[ChatScreen] No valid image assets selected');
                    Alert.alert("Error", "Invalid image file");
                    return;
                }
                appendDraftMedia(validAssets);
                console.log('[ChatScreen] Added images to draft tray:', validAssets.length);
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
        }
    }, [appendDraftMedia]);

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
                const sentMessages = await chatMediaService.sendVideo(
                    conversation?._id || conversation?.id || "",
                    file,
                    messageText || undefined,
                    (progress) => setUploadProgress(progress)
                );

                if (sentMessages.length > 0 && actionsRef.current?.addMessages) {
                    actionsRef.current.addMessages(sentMessages);
                }

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
     * Pick and send audio (voice recording)
     */
    const handlePickAudio = useCallback(async () => {
        setShowVoiceRecorder(true);
        setShowMediaMenu(false);
    }, [conversation, messageText]);

    /**
     * Pick audio file from device storage
     */
    const handlePickAudioFile = useCallback(async () => {
        try {
            if (!conversation?._id && !conversation?.id) {
                Alert.alert("Error", "Conversation is not ready yet");
                return;
            }

            console.log('[ChatScreen] handlePickAudioFile called');

            const result = await DocumentPicker.getDocumentAsync({
                type: ["audio/*"],
            });

            console.log('[ChatScreen] DocumentPicker result:', {
                canceled: result.canceled,
                assetsCount: result.assets?.length,
            });

            // Only close menu if user actually picked something
            setShowMediaMenu(false);

            if (result.canceled) {
                console.log('[ChatScreen] User canceled audio file picker');
                return;
            }

            if (!result.assets || result.assets.length === 0) {
                console.log('[ChatScreen] No audio assets selected');
                return;
            }

            const asset = result.assets[0];
            const audioFile = {
                uri: asset.uri,
                name: asset.name || `audio-${Date.now()}.mp3`,
                type: asset.mimeType || "audio/mpeg",
                mimeType: asset.mimeType || "audio/mpeg",
                size: asset.size || 0,
            };

            console.log('[ChatScreen] Audio file selected:', audioFile);
            setUploading(true);
            setUploadProgress(0);

            try {
                const sentMessages = await chatMediaService.sendAudio(
                    conversation?._id || conversation?.id || "",
                    audioFile
                );

                console.log('[ChatScreen] Audio sent from file picker:', sentMessages);

                // Add messages to local state to show realtime
                if (sentMessages.length > 0 && actionsRef.current?.addMessages) {
                    actionsRef.current.addMessages(sentMessages);
                }

                setUploading(false);
                setUploadProgress(0);
            } catch (uploadError: any) {
                console.error('[ChatScreen] Failed to send audio file:', uploadError);
                setUploading(false);
                setUploadProgress(0);
                Alert.alert("Error", `Failed to send audio: ${uploadError.message}`);
            }
        } catch (error: any) {
            console.error('[ChatScreen] Error opening audio file picker:', error);
            setShowMediaMenu(false);
            Alert.alert("Error", `Failed to open file picker: ${error.message}`);
        }
    }, [conversation]);

    const startAudioRecording = useCallback(async () => {
        if (!conversation?._id && !conversation?.id) {
            Alert.alert("Error", "Conversation is not ready yet");
            setShowVoiceRecorder(false);
            return;
        }

        const permission = await Audio.requestPermissionsAsync();
        if (!permission.granted) {
            Alert.alert("Permission required", "Please allow microphone access to record audio.");
            setShowVoiceRecorder(false);
            return;
        }

        await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
            shouldDuckAndroid: true,
            staysActiveInBackground: false,
        });

        const recording = new Audio.Recording();
        await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
        await recording.startAsync();

        recordingRef.current = recording;
        cancelAudioRef.current = false;
        setIsRecordingAudio(true);
        setIsCancelingAudio(false);
        setRecordingSeconds(0);

        if (recordingIntervalRef.current) {
            clearInterval(recordingIntervalRef.current);
        }

        recordingIntervalRef.current = setInterval(() => {
            setRecordingSeconds((prev) => prev + 1);
        }, 1000);
    }, [conversation]);

    const stopAudioRecording = useCallback(
        async (shouldSend: boolean) => {
            const recording = recordingRef.current;
            recordingRef.current = null;

            if (recordingIntervalRef.current) {
                clearInterval(recordingIntervalRef.current);
                recordingIntervalRef.current = null;
            }

            setIsRecordingAudio(false);
            setIsCancelingAudio(false);

            if (!recording) {
                setShowVoiceRecorder(false);
                return;
            }

            try {
                await recording.stopAndUnloadAsync();
                const status = await recording.getStatusAsync();
                const uri = recording.getURI();

                if (!uri || !shouldSend || cancelAudioRef.current) {
                    setRecordingSeconds(0);
                    setShowVoiceRecorder(false);
                    return;
                }

                const file = {
                    uri,
                    name: `audio-${Date.now()}.m4a`,
                    type: "audio/m4a",
                    mimeType: "audio/m4a",
                    size: 0,
                    duration: Math.round((status as any)?.durationMillis ? (status as any).durationMillis / 1000 : recordingSeconds),
                };

                setUploading(true);
                setUploadProgress(0);

                const sentMessages = await chatMediaService.sendAudio(
                    conversation?._id || conversation?.id || "",
                    file,
                    messageText || undefined,
                    (progress) => setUploadProgress(progress)
                );

                if (sentMessages.length > 0 && actionsRef.current?.addMessages) {
                    actionsRef.current.addMessages(sentMessages);
                }

                setMessageText("");
                setUploadProgress(0);
                setRecordingSeconds(0);
            } catch (error: any) {
                if (!cancelAudioRef.current) {
                    Alert.alert("Error", `Failed to send audio: ${error.message}`);
                }
            } finally {
                setUploading(false);
                setShowVoiceRecorder(false);
                cancelAudioRef.current = false;
                await Audio.setAudioModeAsync({
                    allowsRecordingIOS: false,
                    playsInSilentModeIOS: true,
                }).catch(() => { });
            }
        },
        [conversation, messageText, recordingSeconds]
    );

    const audioPanResponder = useMemo(
        () =>
            PanResponder.create({
                onStartShouldSetPanResponder: () => true,
                onMoveShouldSetPanResponder: () => true,
                onPanResponderGrant: () => {
                    if (!isRecordingAudio) {
                        recordingStartPromiseRef.current = startAudioRecording();
                    }
                },
                onPanResponderMove: (_, gestureState) => {
                    if (!isRecordingAudio) {
                        return;
                    }

                    const shouldCancel = gestureState.moveX < 120 && gestureState.moveY < 170;
                    cancelAudioRef.current = shouldCancel;
                    setIsCancelingAudio(shouldCancel);
                },
                onPanResponderRelease: async () => {
                    if (recordingStartPromiseRef.current) {
                        await recordingStartPromiseRef.current.catch(() => { });
                        recordingStartPromiseRef.current = null;
                    }

                    if (recordingRef.current || isRecordingAudio) {
                        await stopAudioRecording(!cancelAudioRef.current);
                    }
                },
                onPanResponderTerminate: async () => {
                    if (recordingStartPromiseRef.current) {
                        await recordingStartPromiseRef.current.catch(() => { });
                        recordingStartPromiseRef.current = null;
                    }

                    cancelAudioRef.current = true;
                    if (recordingRef.current || isRecordingAudio) {
                        await stopAudioRecording(false);
                    } else {
                        setShowVoiceRecorder(false);
                    }
                },
            }),
        [isRecordingAudio, startAudioRecording, stopAudioRecording]
    );

    /**
     * Pick and send document
     */
    const handlePickDocument = useCallback(async () => {
        try {
            if (!conversation?._id && !conversation?.id) {
                Alert.alert("Error", "Conversation is not ready yet");
                return;
            }

            console.log('[ChatScreen] handlePickDocument called');

            const result = await DocumentPicker.getDocumentAsync({
                type: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "text/plain", "application/x-zip-compressed", "application/x-rar-compressed"],
            });

            console.log('[ChatScreen] DocumentPicker result for document:', {
                canceled: result.canceled,
                assetsCount: result.assets?.length,
            });

            // Only close menu if operation is complete or canceled
            setShowMediaMenu(false);

            if (result.canceled) {
                console.log('[ChatScreen] User canceled document file picker');
                return;
            }

            if (!result.assets || result.assets.length === 0) {
                console.log('[ChatScreen] No document assets selected');
                return;
            }

            const asset = result.assets[0];
            const documentFile = {
                uri: asset.uri,
                name: asset.name || `document-${Date.now()}`,
                type: asset.mimeType || "application/octet-stream",
                mimeType: asset.mimeType || "application/octet-stream",
                size: asset.size || 0,
            };

            console.log('[ChatScreen] Document file selected:', documentFile);
            setUploading(true);
            setUploadProgress(0);

            try {
                const sentMessages = await chatMediaService.sendDocument(
                    conversation?._id || conversation?.id || "",
                    documentFile
                );

                console.log('[ChatScreen] Document sent:', sentMessages);

                // Add messages to local state to show realtime
                if (sentMessages.length > 0 && actionsRef.current?.addMessages) {
                    actionsRef.current.addMessages(sentMessages);
                }

                setUploading(false);
                setUploadProgress(0);
            } catch (uploadError: any) {
                console.error('[ChatScreen] Failed to send document:', uploadError);
                setUploading(false);
                setUploadProgress(0);
                Alert.alert("Error", `Failed to send document: ${uploadError.message}`);
            }
        } catch (error: any) {
            console.error('[ChatScreen] Error opening document file picker:', error);
            setShowMediaMenu(false);
            Alert.alert("Error", `Failed to open file picker: ${error.message}`);
        }
    }, [conversation]);

    /**
     * Handle send message
     */
    const handleSendMessage = useCallback(async () => {
        const trimmedText = messageText.trim();

        if (!hasSendableContent || !actionsRef.current) return;

        if (draftMedia.length > 0) {
            await sendDraftMedia(trimmedText || undefined);
            setMessageText("");
            return;
        }

        if (trimmedText) {
            setMessageText("");
            await actionsRef.current.sendMessage(trimmedText);
        }
    }, [draftMedia.length, hasSendableContent, messageText, sendDraftMedia]);

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
                    const renderItem = item.item as RenderableChatItem;

                    if (renderItem.kind === "gallery") {
                        renderItem.messages.forEach((message) => {
                            const messageId = getMessageKey(message);
                            if (messageId && message.senderId !== currentUser?.id && message.status !== "seen") {
                                visibleIds.push(messageId);
                            }
                        });
                        return;
                    }

                    const messageId = getMessageKey(renderItem.message);
                    if (
                        messageId &&
                        renderItem.message.senderId !== currentUser?.id &&
                        renderItem.message.status !== "seen"
                    ) {
                        visibleIds.push(messageId);
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
    const handleUnfriend = useCallback(async () => {
        if (!chatUser?.id) return;

        Alert.alert(
            "Hủy kết bạn",
            `Xác nhận hủy kết bạn với ${truncateName(userName)}?`,
            [
                { text: "Hủy", onPress: () => { }, style: "cancel" },
                {
                    text: "Xác nhận",
                    onPress: async () => {
                        try {
                            setUnfriending(true);
                            setShowAvatarMenu(false);
                            await unfriend(chatUser.id!);
                            // Navigate back after unfriend success
                            setTimeout(() => {
                                onBackPress?.();
                            }, 500);
                        } catch (error: any) {
                            Alert.alert("Lỗi", `Hủy kết bạn thất bại: ${error.message}`);
                        } finally {
                            setUnfriending(false);
                        }
                    },
                    style: "destructive",
                },
            ]
        );
    }, [chatUser?.id, userName, onBackPress]);

    const handleLoadMore = useCallback(() => {
        if (hasMoreMessages && !isLoading && actionsRef.current) {
            actionsRef.current.loadMoreMessages();
        }
    }, [hasMoreMessages, isLoading]);

    /**
     * Handle message long press - show action menu
     */
    const handleMessageLongPress = useCallback((message: MessagePayload) => {
        const messageId = message._id || message.id;
        if (!messageId) return;

        const isOwn = message.senderId === currentUser?.id;
        Alert.alert(
            "Tùy chọn tin nhắn",
            `${message.text?.substring(0, 50) || "[Media]"}`,
            buildMessageActionSheetOptions({
                isOwn,
                onDeleteForMe: async () => {
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
                },
                onEdit: () => {
                    setSelectedMessageId(messageId);
                    setEditText(message.text || "");
                    setShowEditDialog(true);
                },
                onRevoke: async () => {
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
                },
                onForward: () => {
                    setForwardMessageIds([messageId]);
                    setShowForwardDialog(true);
                },
            })
        );
    }, [currentUser?.id]);

    /**
     * Handle save edited message
     */
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
        ({ item }: { item: RenderableChatItem }) => {
            if (item.kind === "gallery") {
                return (
                    <ImageGalleryBubble
                        messages={item.messages}
                        isOwn={item.isOwn}
                        onLongPress={() => handleMessageLongPress(item.messages[0])}
                        onImagePress={(msgs, idx) => {
                            const senderId = msgs[0].senderId;
                            const { allImages, startingIndex } = getAllUserImages(senderId, msgs);
                            setAllViewerImages(allImages);
                            setSelectedImageIndex(startingIndex);
                            setViewingGalleryMessages(msgs);
                        }}
                    />
                );
            }

            const isOwn = item.message.senderId === currentUser?.id;
            return (
                <MessageBubble
                    message={item.message}
                    isOwn={isOwn}
                    onLongPress={() => handleMessageLongPress(item.message)}
                />
            );
        },
        [currentUser?.id, handleMessageLongPress, getAllUserImages]
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
                        color={colors.dangerSoft}
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
                <Pressable
                    style={styles.headerAvatarWrap}
                    onPress={() => setShowAvatarMenu(true)}
                >
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
                </Pressable>
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
                    data={renderableMessages}
                    renderItem={renderMessage}
                    keyExtractor={(item) => item.key}
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

            {/* Draft Media Tray */}
            {draftMedia.length > 0 && (
                <View style={styles.draftTrayContainer}>
                    <View style={styles.draftTrayHeader}>
                        <Text style={styles.draftTrayTitle}>
                            {draftMedia.length} ảnh đã chọn
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
                                <Image source={{ uri: item.uri }} style={styles.draftThumbImage} />
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
                        styles.composerActionButton,
                        hasSendableContent ? styles.composerSendButton : styles.composerMicButton,
                        (!hasSendableContent && (isRecordingAudio || uploading)) && styles.composerActionButtonDisabled,
                        (hasSendableContent && (isSending || uploading)) && styles.composerActionButtonDisabled,
                    ]}
                    onPress={hasSendableContent ? handleSendMessage : handlePickAudio}
                    disabled={
                        (hasSendableContent && isSending) ||
                        (!hasSendableContent && (isRecordingAudio || uploading)) ||
                        (hasSendableContent && uploading)
                    }
                >
                    {hasSendableContent ? (
                        isSending || uploading ? (
                            <ActivityIndicator size="small" color={colors.textOnAccent} />
                        ) : (
                            <Ionicons name="send" size={22} color={colors.textOnAccent} />
                        )
                    ) : isRecordingAudio ? (
                        <ActivityIndicator size="small" color={colors.textOnAccent} />
                    ) : (
                        <Ionicons name="mic" size={22} color={colors.textOnAccent} />
                    )}
                </Pressable>
            </View>

            {/* Voice Recorder Overlay */}
            {showVoiceRecorder && (
                <View style={styles.voiceRecorderOverlay}>
                    <View style={styles.voiceRecorderTopRow}>
                        <View style={styles.voiceCancelZone}>
                            <Ionicons name="close-circle" size={32} color={isCancelingAudio ? colors.dangerSoft : colors.textMuted} />
                            <Text style={[styles.voiceCancelText, isCancelingAudio && styles.voiceCancelTextActive]}>
                                Kéo vào đây để hủy
                            </Text>
                        </View>
                        <Text style={styles.voiceRecordingHint}>
                            Giữ để ghi âm, thả tay để gửi
                        </Text>
                    </View>

                    <View style={styles.voiceRecorderCenter}>
                        <Text style={styles.voiceTimer}>
                            {`${String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:${String(recordingSeconds % 60).padStart(2, "0")}`}
                        </Text>
                        <View
                            {...audioPanResponder.panHandlers}
                            style={[
                                styles.voiceMicButton,
                                isCancelingAudio && styles.voiceMicButtonCanceling,
                            ]}
                        >
                            <Ionicons name="mic" size={34} color={colors.textOnAccent} />
                        </View>
                        <Text style={styles.voiceRecordingSubtext}>
                            {isCancelingAudio ? "Thả tay để hủy" : "Kéo lên góc X để hủy"}
                        </Text>
                    </View>
                </View>
            )}

            <ForwardDialog
                visible={showForwardDialog}
                currentConversationId={conversation?._id || conversation?.id || ""}
                currentUserId={currentUserId}
                messageIds={forwardMessageIds}
                excludeTargetIds={friendId ? [friendId] : []}
                onDismiss={() => {
                    setShowForwardDialog(false);
                    setForwardMessageIds([]);
                }}
                onForwardSuccess={(result) => {
                    Alert.alert(
                        "Thành công",
                        `Đã chuyển tiếp tới ${result.sentToCount} cuộc trò chuyện`
                    );
                }}
            />

            {/* Full-Screen Image Viewer */}
            {viewingGalleryMessages && viewingGalleryMessages.length > 0 && (
                <Modal
                    visible={!!viewingGalleryMessages}
                    transparent={true}
                    statusBarTranslucent={true}
                    onRequestClose={() => {
                        setViewingGalleryMessages(null);
                        setSelectedImageIndex(0);
                    }}
                >
                    <View style={styles.imageViewerContainer}>
                        <Pressable
                            style={styles.imageViewerClose}
                            onPress={() => {
                                setViewingGalleryMessages(null);
                                setSelectedImageIndex(0);
                            }}
                        >
                            <Ionicons name="close" size={28} color={colors.textOnAccent} />
                        </Pressable>

                        <FlatList
                            ref={imageViewerScrollRef as any}
                            horizontal
                            pagingEnabled
                            scrollEventThrottle={16}
                            showsHorizontalScrollIndicator={false}
                            data={allViewerImages}
                            keyExtractor={(item) => item.key}
                            renderItem={({ item }) => (
                                <View style={styles.imageViewerImageWrap}>
                                    <Image
                                        source={{ uri: item.uri }}
                                        style={styles.imageViewerImage}
                                        resizeMode="contain"
                                    />
                                </View>
                            )}
                            onMomentumScrollEnd={(e) => {
                                const contentOffsetX = e.nativeEvent.contentOffset.x;
                                const screenWidth = Dimensions.get("window").width;
                                const currentIndex = Math.round(contentOffsetX / screenWidth);
                                setSelectedImageIndex(currentIndex);
                            }}
                        />

                        <View style={styles.imageViewerCounter}>
                            <Text style={styles.imageViewerCounterText}>
                                {selectedImageIndex + 1} / {allViewerImages.length}
                            </Text>
                        </View>
                    </View>
                </Modal>
            )}

            {/* Edit Message Dialog */}
            <Modal
                visible={showEditDialog}
                animationType="slide"
                transparent={true}
                onRequestClose={() => {
                    setShowEditDialog(false);
                    setEditText("");
                }}
            >
                <View style={styles.editDialogOverlay}>
                    <View style={styles.editDialogContainer}>
                        <View style={styles.editDialogHeader}>
                            <Text style={styles.editDialogTitle}>Sửa tin nhắn</Text>
                        </View>

                        <TextInput
                            style={styles.editDialogInput}
                            placeholder="Nội dung tin nhắn"
                            placeholderTextColor={colors.textMuted}
                            value={editText}
                            onChangeText={setEditText}
                            multiline
                            maxLength={1000}
                        />

                        <View style={styles.editDialogButtonGroup}>
                            <Pressable
                                style={({ pressed }) => [
                                    styles.editDialogButton,
                                    styles.editDialogButtonCancel,
                                    pressed && styles.editDialogButtonPressed,
                                ]}
                                onPress={() => {
                                    setShowEditDialog(false);
                                    setEditText("");
                                }}
                            >
                                <Text style={styles.editDialogButtonText}>Hủy</Text>
                            </Pressable>

                            <Pressable
                                style={({ pressed }) => [
                                    styles.editDialogButton,
                                    styles.editDialogButtonSave,
                                    pressed && styles.editDialogButtonPressed,
                                ]}
                                onPress={handleSaveEdit}
                            >
                                <Text style={styles.editDialogButtonTextSave}>Lưu</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Avatar Menu Modal */}
            <Modal
                visible={showAvatarMenu}
                transparent
                animationType="fade"
                onRequestClose={() => setShowAvatarMenu(false)}
            >
                <Pressable
                    style={styles.modalOverlay}
                    onPress={() => setShowAvatarMenu(false)}
                >
                    <View style={styles.avatarMenuContainer}>
                        <Pressable
                            style={[styles.menuItem, styles.menuItemDanger]}
                            onPress={handleUnfriend}
                            disabled={unfriending}
                        >
                            {unfriending ? (
                                <ActivityIndicator color={colors.dangerStrong} />
                            ) : (
                                <>
                                    <Ionicons name="person-remove" size={20} color={colors.dangerStrong} />
                                    <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>
                                        Hủy kết bạn
                                    </Text>
                                </>
                            )}
                        </Pressable>
                    </View>
                </Pressable>
            </Modal>

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
                        <Text style={styles.mediaMenuTitle}>Ghim</Text>

                        <Pressable
                            style={styles.mediaMenuButton}
                            onPress={() => {
                                console.log('[ChatScreen] Library button pressed');
                                handlePickImage();
                            }}
                        >
                            <Ionicons name="image" size={24} color={colors.mediaImageIcon} />
                            <Text style={styles.mediaMenuButtonText}>Thư Viện</Text>
                        </Pressable>

                        <Pressable
                            style={styles.mediaMenuButton}
                            onPress={() => {
                                console.log('[ChatScreen] Video button pressed');
                                handlePickVideo();
                            }}
                        >
                            <Ionicons name="videocam" size={24} color={colors.mediaVideoIcon} />
                            <Text style={styles.mediaMenuButtonText}>Video</Text>
                        </Pressable>

                        <Pressable
                            style={styles.mediaMenuButton}
                            onPress={handlePickAudioFile}
                        >
                            <Ionicons name="musical-note" size={24} color={colors.mediaAudioIcon} />
                            <Text style={styles.mediaMenuButtonText}>Audio</Text>
                        </Pressable>

                        <Pressable
                            style={styles.mediaMenuButton}
                            onPress={handlePickDocument}
                        >
                            <Ionicons name="document" size={24} color={colors.mediaDocumentIcon} />
                            <Text style={styles.mediaMenuButtonText}>Tài Liệu</Text>
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
        color: colors.dangerSoft,
        marginTop: 16,
        textAlign: "center",
    },
    retryButton: {
        marginTop: 24,
        paddingHorizontal: 32,
        paddingVertical: 12,
        backgroundColor: colors.accentStrong,
        borderRadius: 8,
    },
    retryButtonText: {
        color: colors.textOnAccent,
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
        flexDirection: "column",
    },
    incomingRow: {
        alignItems: "flex-start",
    },
    outgoingRow: {
        alignItems: "flex-end",
    },
    bubble: {
        maxWidth: "82%",
        borderRadius: 18,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    galleryBubble: {
        paddingHorizontal: 10,
        paddingVertical: 10,
        maxWidth: "84%",
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
        color: colors.textOnAccent,
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
        color: colors.overlayWhite75,
        fontSize: 11,
    },
    galleryGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 6,
        marginBottom: 6,
    },
    galleryCaptionText: {
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 6,
    },
    outgoingGalleryCaptionText: {
        color: colors.textOnAccent,
    },
    incomingGalleryCaptionText: {
        color: colors.text,
    },
    galleryTileWrap: {
        width: 96,
        height: 96,
        borderRadius: 14,
        overflow: "hidden",
        backgroundColor: colors.border,
        position: "relative",
    },
    galleryTileImage: {
        width: "100%",
        height: "100%",
        resizeMode: "cover",
    },
    galleryOverlay: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: colors.overlayDark35,
        alignItems: "center",
        justifyContent: "center",
    },
    galleryOverlayText: {
        color: colors.textOnAccent,
        fontSize: 20,
        fontWeight: "800",
    },
    seenStatus: {
        color: colors.successSeen,
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
        borderWidth: 1,
        borderColor: colors.border,
    },
    composerActionButtonDisabled: {
        opacity: 0.55,
    },
    voiceRecorderOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: colors.overlayDark94,
        zIndex: 50,
        justifyContent: "space-between",
        paddingTop: 24,
        paddingBottom: 28,
        paddingHorizontal: 20,
    },
    voiceRecorderTopRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 16,
    },
    voiceCancelZone: {
        alignItems: "center",
        width: 120,
        gap: 6,
    },
    voiceCancelText: {
        color: colors.textMuted,
        fontSize: 12,
        fontWeight: "600",
        textAlign: "center",
    },
    voiceCancelTextActive: {
        color: colors.dangerSoft,
    },
    voiceRecordingHint: {
        flex: 1,
        color: colors.textOnAccent,
        fontSize: 14,
        fontWeight: "600",
        textAlign: "right",
        opacity: 0.9,
        paddingTop: 6,
    },
    voiceRecorderCenter: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
    },
    voiceTimer: {
        color: colors.textOnAccent,
        fontSize: 34,
        fontWeight: "800",
        letterSpacing: 1.2,
    },
    voiceMicButton: {
        width: 92,
        height: 92,
        borderRadius: 46,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.dangerStrong,
        borderWidth: 4,
        borderColor: colors.overlayWhite18,
    },
    voiceMicButtonCanceling: {
        backgroundColor: colors.dangerHot,
        transform: [{ scale: 0.96 }],
    },
    voiceRecordingSubtext: {
        color: colors.textMuted,
        fontSize: 13,
        fontWeight: "500",
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
        backgroundColor: colors.accentStrong,
        borderRadius: 3,
    },
    progressText: {
        fontSize: 11,
        fontWeight: "600",
        color: colors.text,
        minWidth: 30,
    },

    // Draft media tray styles
    draftTrayContainer: {
        width: "100%",
        paddingHorizontal: 14,
        paddingVertical: 10,
        gap: 10,
        backgroundColor: colors.accent,
        borderRadius: 12,
        marginHorizontal: 0,
        marginBottom: 8,
    },
    draftTrayHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    draftTrayTitle: {
        fontSize: 13,
        fontWeight: "700",
        color: colors.textOnAccent,
    },
    draftTrayScrollContent: {
        gap: 10,
        paddingRight: 14,
        paddingLeft: 0,
    },
    draftThumbWrap: {
        width: 86,
        height: 86,
        borderRadius: 12,
        overflow: "hidden",
        position: "relative",
        backgroundColor: colors.surfaceElevated,
        borderWidth: 2,
        borderColor: colors.overlayDarkWarm30,
    },
    draftThumbImage: {
        width: "100%",
        height: "100%",
        resizeMode: "cover",
    },
    draftThumbRemove: {
        position: "absolute",
        top: 6,
        right: 6,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: colors.overlayDark65,
        alignItems: "center",
        justifyContent: "center",
    },
    draftAddMore: {
        width: 86,
        height: 86,
        borderRadius: 12,
        borderWidth: 2,
        borderStyle: "dashed",
        borderColor: colors.overlayWhite30,
        backgroundColor: colors.overlayWhite10,
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
    },
    draftAddMoreText: {
        fontSize: 11,
        fontWeight: "600",
        color: colors.textOnAccent,
    },

    // Media menu styles
    modalOverlay: {
        flex: 1,
        backgroundColor: colors.overlayDark50,
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
        borderColor: colors.contrastBorder,
        alignItems: "center",
        marginTop: 6,
    },
    mediaMenuCloseText: {
        fontSize: 16,
        fontWeight: "600",
        color: colors.contrastText,
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

    // Edit dialog styles
    editDialogOverlay: {
        flex: 1,
        backgroundColor: colors.overlayDark50,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 16,
    },
    editDialogContainer: {
        backgroundColor: colors.background,
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: 20,
        minHeight: 220,
        width: "100%",
        maxWidth: 400,
    },
    editDialogHeader: {
        marginBottom: 16,
    },
    editDialogTitle: {
        fontSize: 18,
        fontWeight: "700",
        color: colors.text,
    },
    editDialogInput: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 10,
        padding: 12,
        fontSize: 14,
        color: colors.text,
        marginBottom: 16,
        maxHeight: 120,
        textAlignVertical: "top",
    },
    editDialogButtonGroup: {
        flexDirection: "row",
        gap: 12,
        justifyContent: "flex-end",
    },
    editDialogButton: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 8,
        minWidth: 80,
        alignItems: "center",
    },
    editDialogButtonCancel: {
        backgroundColor: colors.surface,
    },
    editDialogButtonSave: {
        backgroundColor: colors.accentStrong,
    },
    editDialogButtonText: {
        fontSize: 14,
        fontWeight: "600",
        color: colors.text,
    },
    editDialogButtonTextSave: {
        fontSize: 14,
        fontWeight: "600",
        color: colors.textOnAccent,
    },
    editDialogButtonPressed: {
        opacity: 0.7,
    },

    // Image Viewer Modal Styles
    imageViewerContainer: {
        flex: 1,
        backgroundColor: colors.black,
        justifyContent: "center",
        alignItems: "center",
    },
    imageViewerClose: {
        position: "absolute",
        top: 48,
        right: 16,
        zIndex: 10,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.overlayDark50,
        justifyContent: "center",
        alignItems: "center",
    },
    imageViewerScrollContent: {
        width: "100%",
    },
    imageViewerImageWrap: {
        width: Dimensions.get("window").width,
        height: Dimensions.get("window").height,
        justifyContent: "center",
        alignItems: "center",
    },
    imageViewerImage: {
        width: "100%",
        height: "100%",
    },
    imageViewerCounter: {
        position: "absolute",
        bottom: 32,
        alignSelf: "center",
        backgroundColor: colors.overlayDark60,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
    },
    imageViewerCounterText: {
        fontSize: 14,
        fontWeight: "600",
        color: colors.textOnAccent,
    },

    // Avatar menu styles
    avatarMenuContainer: {
        backgroundColor: colors.background,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingHorizontal: 16,
        paddingTop: 20,
        paddingBottom: 32,
    },
    menuItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: colors.surface,
    },
    menuItemDanger: {
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.dangerSoft,
    },
    menuItemText: {
        fontSize: 16,
        fontWeight: "600",
        color: colors.text,
    },
    menuItemTextDanger: {
        color: colors.dangerStrong,
    },
});
