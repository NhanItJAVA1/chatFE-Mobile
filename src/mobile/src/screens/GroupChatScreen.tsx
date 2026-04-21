import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
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
    Dimensions,
    ImageBackground,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { useChatMessage } from "../../../shared/hooks/useChat";
import { useGroupChatMessage } from "../../../shared/hooks/useGroupChatMessage";
import { useGroupChat } from "../../../shared/hooks/useGroupChat";
import { useAuth } from "../../../shared/hooks";
import { GroupChatService } from "../../../shared/services/groupChatService";
import { SocketService } from "../../../shared/services";
import chatMediaService from "../../../shared/services/chatMediaService";
import { Avatar, ForwardDialog, VoiceRecorder, PinnedMessageHeader, ReplyPreview, QuotedMessageBlock, HighlightableMessage, AnimatedEmojiMessage } from "../components";
import { JUMBO_EMOJI_ASSETS } from "../components/AnimatedEmojiMessage";
import { SystemMessageBubble } from "../components/SystemMessageBubble";
import MediaMessage from "../components/MediaMessage";
import { colors, assets } from "../theme";
import { buildMessageActionSheetOptions } from "../../../shared/utils";

/**
 * Helper function to generate unique asset ID - matches ChatScreen implementation
 */
const getDraftAssetId = (asset: any): string => {
    return [asset?.uri, asset?.fileName || asset?.name, asset?.fileSize || asset?.size, asset?.width, asset?.height]
        .filter(Boolean)
        .join("::");
};

const detectDraftMediaKind = (mimeType?: string, type?: string): "image" | "video" | "audio" | "other" => {
    const rawType = (mimeType || type || "").toLowerCase();

    if (!rawType) {
        return "other";
    }

    if (rawType === "image" || rawType.startsWith("image/")) {
        return "image";
    }

    if (rawType === "video" || rawType.startsWith("video/")) {
        return "video";
    }

    if (rawType === "audio" || rawType.startsWith("audio/")) {
        return "audio";
    }

    return "other";
};

const GALLERY_GROUP_WINDOW_MS = 5000;

const getMessageCreatedAtMs = (message: any): number => {
    const timestamp = new Date(message?.createdAt || "").getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
};

const isImageMessage = (message: any): boolean => {
    const firstMedia = message?.media?.[0];
    if (!firstMedia) {
        return false;
    }

    const mediaKind = detectDraftMediaKind(firstMedia?.mimetype, firstMedia?.mediaType);
    return mediaKind === "image" || firstMedia?.mediaType === "image" || message?.type === "image";
};

const groupMessagesForGallery = (messages: any[]): any[] => {
    const groupedMessages: any[] = [];
    let index = 0;

    while (index < messages.length) {
        const currentMessage = messages[index];

        if (!isImageMessage(currentMessage)) {
            groupedMessages.push(currentMessage);
            index += 1;
            continue;
        }

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
            const firstMessage = consecutiveImages[0];
            const captionSource = consecutiveImages.find((message) => message?.text?.trim());

            groupedMessages.push({
                ...firstMessage,
                text: captionSource?.text || firstMessage?.text || "",
                media: consecutiveImages.flatMap((message) => message?.media || []),
                groupedMessageIds: consecutiveImages
                    .map((message) => message?._id || message?.id)
                    .filter(Boolean),
            });
        } else {
            groupedMessages.push(...consecutiveImages);
        }

        index = nextIndex;
    }

    return groupedMessages;
};

const extractMemberIds = (groupInfo: any): string[] => {
    const rawMembers = groupInfo?.members || [];

    return rawMembers
        .map((member: any) => {
            if (typeof member === "string") {
                return member;
            }

            return member?.userId || member?._id || member?.id || "";
        })
        .filter(Boolean)
        .map((id: string) => String(id));
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
    onSettingsPress?: () => void;
    onAddMembersPress?: () => void;
}> = ({ route, navigation, onBackPress, onSettingsPress, onAddMembersPress }) => {
    const { groupId } = route.params || {};
    const authContext = useAuth();
    const token = authContext.token;
    const { user } = authContext;
    const {
        state: chatState,
        actions: chatActions,
        flatListRef,
        highlightedMessageId,
    } = useGroupChatMessage(groupId, token || "");

    // Highlight state is managed inside useScrollToMessage (via useGroupChatMessage)
    const { state: groupState, actions: groupActions } = useGroupChat();
    const currentUserId = user?.id || (user as any)?._id || (user as any)?.userId || "";

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
    const [selectedImageIndex, setSelectedImageIndex] = useState(0);
    const [allViewerImages, setAllViewerImages] = useState<Array<{ uri: string; key: string }>>([]);

    // Refs
    // flatListRef comes from useGroupChatMessage → useScrollToMessage (enables scrollToMessage)
    const imageViewerScrollRef = useRef<FlatList>(null);
    const actionsRef = useRef(chatActions);
    const kickedOutRef = useRef(false);

    const scrollToLatestMessage = useCallback((animated = true) => {
        // For inverted FlatList, latest message is at offset 0.
        flatListRef.current?.scrollToOffset({ offset: 0, animated });
    }, []);

    // Update actionsRef when chatActions changes
    useEffect(() => {
        actionsRef.current = chatActions;
    }, [chatActions]);

    // Load group and messages on mount
    useEffect(() => {
        loadGroupData();
    }, [groupId]);

    useEffect(() => {
        if (allViewerImages.length > 0 && selectedImageIndex > 0 && imageViewerScrollRef.current) {
            setTimeout(() => {
                (imageViewerScrollRef.current as any)?.scrollToIndex({
                    index: selectedImageIndex,
                    animated: false,
                });
            }, 100);
        }
    }, [allViewerImages.length, selectedImageIndex]);

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

    // If current user is removed from this group, exit chat immediately without waiting for reload.
    useEffect(() => {
        const normalizedGroupId = String(groupId || "");
        const userCandidateIds = [user?.id, (user as any)?._id, (user as any)?.userId]
            .filter(Boolean)
            .map((id) => String(id));

        if (!normalizedGroupId || userCandidateIds.length === 0 || !token) {
            return;
        }

        if (!SocketService.isConnected()) {
            SocketService.connect(token);
        }

        const socket = SocketService.getSocket();

        const unsubscribe = SocketService.subscribeGroupMemberRemoved((data: any) => {
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

            const isCurrentUserRemoved = userCandidateIds.includes(removedUserId);

            if (conversationId !== normalizedGroupId || !isCurrentUserRemoved) {
                return;
            }

            if (kickedOutRef.current) {
                return;
            }

            kickedOutRef.current = true;

            SocketService.leaveConversation(groupId).catch(() => { });

            Alert.alert(
                "Bạn đã bị xóa khỏi nhóm",
                "Bạn không còn quyền truy cập cuộc trò chuyện này.",
                [
                    {
                        text: "OK",
                        onPress: () => {
                            onBackPress?.();
                        },
                    },
                ]
            );
        });

        const handleConversationUpdated = (data: any) => {
            const conversationId = String(
                data?.conversationId || data?.conversation?._id || data?.conversation?.id || ""
            );

            if (conversationId !== normalizedGroupId || kickedOutRef.current) {
                return;
            }

            const members: string[] = (data?.data?.members || data?.conversation?.members || [])
                .filter(Boolean)
                .map((id: any) => String(id));

            if (members.length > 0 && !userCandidateIds.some((id) => members.includes(id))) {
                kickedOutRef.current = true;
                SocketService.leaveConversation(groupId).catch(() => { });
                Alert.alert(
                    "Bạn đã bị xóa khỏi nhóm",
                    "Bạn không còn quyền truy cập cuộc trò chuyện này.",
                    [
                        {
                            text: "OK",
                            onPress: () => {
                                onBackPress?.();
                            },
                        },
                    ]
                );
            }
        };

        socket?.on("conversation:updated", handleConversationUpdated);

        return () => {
            unsubscribe();
            socket?.off("conversation:updated", handleConversationUpdated);
        };
    }, [groupId, user?.id, (user as any)?._id, token, onBackPress]);

    // Fallback for environments where backend does not emit socket kick events.
    useEffect(() => {
        const normalizedGroupId = String(groupId || "");
        const userCandidateIds = [user?.id, (user as any)?._id, (user as any)?.userId]
            .filter(Boolean)
            .map((id) => String(id));

        if (!normalizedGroupId || userCandidateIds.length === 0 || !token) {
            return;
        }

        let isMounted = true;

        const verifyMembership = async () => {
            if (!isMounted || kickedOutRef.current) {
                return;
            }

            try {
                const groupInfo = await GroupChatService.getGroupInfo(normalizedGroupId);
                const memberIds = extractMemberIds(groupInfo);
                const ownerId = String(groupInfo?.ownerId || "");
                const adminIds: string[] = (groupInfo?.admins || (groupInfo as any)?.adminIds || [])
                    .filter(Boolean)
                    .map((id: any) => String(id));

                const hasReliableMembershipData = memberIds.length > 0;
                const isOwner = !!ownerId && userCandidateIds.includes(ownerId);
                const isAdmin = adminIds.some((id) => userCandidateIds.includes(id));
                const isMemberFromList = userCandidateIds.some((id) => memberIds.includes(id));
                const isStillMember = isOwner || isAdmin || isMemberFromList;

                // Avoid false kick when backend group info does not include members array.
                if (!hasReliableMembershipData && !isOwner && !isAdmin) {
                    return;
                }

                if (!isStillMember) {
                    kickedOutRef.current = true;
                    SocketService.leaveConversation(groupId).catch(() => { });
                    Alert.alert(
                        "Bạn đã bị xóa khỏi nhóm",
                        "Bạn không còn quyền truy cập cuộc trò chuyện này.",
                        [
                            {
                                text: "OK",
                                onPress: () => {
                                    onBackPress?.();
                                },
                            },
                        ]
                    );
                }
            } catch {
                // Keep UI responsive; retry by interval.
            }
        };

        verifyMembership();
        const interval = setInterval(verifyMembership, 5000);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [groupId, user?.id, (user as any)?._id, token, onBackPress]);

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
                return [];
            }

            const sentMessages: any[] = [];
            setUploading(true);
            setUploadProgress(0);

            try {
                const files = draftMedia.map((item) => ({
                    uri: item.uri,
                    name: item.name,
                    type: item.type,
                    mimeType: item.mimeType,
                    size: item.size || 0,
                    width: item.width,
                    height: item.height,
                }));

                const allImages =
                    files.length > 1 &&
                    files.every((file) =>
                        detectDraftMediaKind(file.mimeType, file.type) === "image"
                    );

                // Send a single message containing multiple images when user selects many images at once.
                if (allImages) {
                    const result = await chatMediaService.sendMultipleMedia(
                        groupId,
                        files,
                        caption
                    );

                    if (result.length > 0) {
                        sentMessages.push(...result);
                    }

                    setUploadProgress(100);
                } else {
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
                        const mediaKind = detectDraftMediaKind(item.mimeType, item.type);

                        // Determine file type and call appropriate method
                        if (mediaKind === "image") {
                            result = await chatMediaService.sendImage(
                                groupId,
                                file,
                                index === 0 ? caption : undefined
                            );
                        } else if (mediaKind === "video") {
                            result = await chatMediaService.sendVideo(
                                groupId,
                                file,
                                index === 0 ? caption : undefined
                            );
                        } else if (mediaKind === "audio") {
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
                }

                // Add all sent messages at once
                if (sentMessages.length > 0 && actionsRef.current?.addMessages) {
                    actionsRef.current.addMessages(sentMessages);
                }

                return sentMessages;
            } catch (err: any) {
                console.error("[GroupChat] Error sending media:", err);
                Alert.alert("Lỗi", `Gửi media thất bại: ${err.message}`);
                return [];
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

            // If replying to a message, send as quoted message
            if (chatState.replyingTo) {
                const quotedMessageId = chatState.replyingTo._id || chatState.replyingTo.id;
                if (quotedMessageId && chatActions.sendQuotedMessage) {
                    if (draftMedia.length > 0) {
                        await chatActions.sendQuotedMessage(quotedMessageId, trimmedText || "", draftMedia);
                        setMessageText("");
                    } else if (trimmedText) {
                        await chatActions.sendQuotedMessage(quotedMessageId, trimmedText);
                        setMessageText("");
                    }
                }
            } else {
                // Send text message normally
                if (trimmedText) {
                    await chatActions.sendMessage(trimmedText);
                    setMessageText("");
                }

                // Send media
                if (draftMedia.length > 0) {
                    await sendDraftMedia(trimmedText || undefined);
                    setMessageText("");
                }
            }

            scrollToLatestMessage(true);
        } catch (err: any) {
            Alert.alert("Lỗi", err.message || "Failed to send message");
        } finally {
            setIsSending(false);
        }
    }, [messageText, draftMedia, hasSendableContent, chatActions, sendDraftMedia, scrollToLatestMessage, chatState.replyingTo]);

    const handleInputChange = useCallback((text: string) => {
        setMessageText(text);
        if (text.trim()) {
            chatActions.handleTyping();
        }
    }, [chatActions]);

    const handleMessageLongPress = useCallback((message: any) => {
        const messageId = message._id || message.id;
        if (!messageId) return;

        const isOwn = !!currentUserId && String(message.senderId || "") === String(currentUserId);
        const isAdmin = groupState?.group?.admins?.includes(currentUserId);

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
                onPin: isAdmin ? async () => {
                    try {
                        if (actionsRef.current?.pinMessage) {
                            await actionsRef.current.pinMessage(messageId);
                        }
                    } catch (error: any) {
                        Alert.alert("Lỗi", error.message || "Không thể ghim tin nhắn");
                    }
                } : undefined,
                onReply: () => {
                    if (actionsRef.current?.setReplyingTo) {
                        actionsRef.current.setReplyingTo(message);
                    }
                },
            })
        );
    }, [currentUserId, groupState?.group?.admins]);

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

    const getAllUserImages = useCallback((senderId: string, firstImageUri?: string) => {
        const userMessagesWithImages = chatState.messages.filter(
            (message) =>
                message.senderId === senderId &&
                Array.isArray(message.media) &&
                message.media.some((media: any) => detectDraftMediaKind(media?.mimetype, media?.mediaType) === "image")
        );

        const allImages = userMessagesWithImages
            .flatMap((message) =>
                (message.media || [])
                    .filter((media: any) => detectDraftMediaKind(media?.mimetype, media?.mediaType) === "image")
                    .map((media: any, index: number) => ({
                        uri: media?.url,
                        key: `${message._id || message.id || message.createdAt}-${index}`,
                    }))
            )
            .filter((image) => !!image.uri);

        const startingIndex = firstImageUri
            ? Math.max(0, allImages.findIndex((image) => image.uri === firstImageUri))
            : 0;

        return { allImages, startingIndex };
    }, [chatState.messages]);

    const openImageViewer = useCallback((senderId: string, firstImageUri?: string) => {
        const { allImages, startingIndex } = getAllUserImages(senderId, firstImageUri);
        if (allImages.length === 0) {
            return;
        }

        setSelectedImageIndex(startingIndex);
        setAllViewerImages(allImages);
    }, [getAllUserImages]);

    const closeImageViewer = useCallback(() => {
        setAllViewerImages([]);
        setSelectedImageIndex(0);
    }, []);

    // Create lookup map for quoted messages (must be before renderMessage)
    const messageMap = useMemo(() => {
        const map: Record<string, any | undefined> = {};
        chatState.messages.forEach(msg => {
            const msgId = msg._id || msg.id;
            if (msgId) {
                map[msgId] = msg;
            }
        });
        console.log('[GroupChatScreen] messageMap created with', Object.keys(map).length, 'messages');
        return map;
    }, [chatState.messages]);

    const renderMessage = useCallback(
        ({ item }: any) => {
            // Check if it's a system message
            if (item.isSystemMessage || item.type === "system") {
                return <SystemMessageBubble text={item.text} />;
            }

            // Resolve quoted message: use existing quotedMessage OR lookup by quotedMessageId
            const resolvedQuotedMessage = item.quotedMessage ||
                (item.quotedMessageId && messageMap[item.quotedMessageId]) ||
                null;

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

            // Determine sender's role for badge
            const isOwner = groupState.group?.ownerId === item.senderId;
            const isAdmin = groupState.group?.admins?.includes(item.senderId);

            const getRoleIcon = () => {
                if (isOwner) {
                    return "👑"; // Owner - Golden crown
                } else if (isAdmin) {
                    return "🔑"; // Admin - Silver key
                }
                return null;
            };

            const roleIcon = getRoleIcon();
            const hasMedia = item.media && item.media.length > 0;
            const hasText = item.text && item.text.trim().length > 0;
            const hasGalleryMedia =
                hasMedia &&
                item.media.length >= 3 &&
                item.media.every((media: any) => detectDraftMediaKind(media?.mimetype, media?.mediaType) === "image");
            const galleryPreviewMedia = hasGalleryMedia ? item.media.slice(0, 3) : [];
            const galleryExtraCount = hasGalleryMedia ? Math.max(0, item.media.length - galleryPreviewMedia.length) : 0;

            const messageId = item._id || item.id;
            const isHighlighted = !!messageId && messageId === highlightedMessageId;

            return (
                <HighlightableMessage
                    onLongPress={() => handleMessageLongPress(item)}
                    delayLongPress={300}
                    isHighlighted={isHighlighted}
                    style={[
                        styles.messageBubbleRow,
                        isOwn ? styles.outgoingRow : styles.incomingRow,
                        isHighlighted && styles.messageHighlighted,
                    ]}
                >
                    {/* Avatar for incoming messages */}
                    {!isOwn && (
                        <Avatar
                            label={senderInitials}
                            size={32}
                            backgroundColor={colors.accentStrong}
                            imageUrl={senderAvatar}
                        />
                    )}

                    {/* Message content container - handles alignment */}
                    <View style={[
                        styles.messageContentWrapper,
                        hasMedia && !hasText && (
                            isOwn
                                ? styles.messageContentWrapperMediaOnlyOutgoing
                                : styles.messageContentWrapperMediaOnlyIncoming
                        ),
                        !isOwn && styles.messageContentWrapperIncoming,
                        isOwn && styles.messageContentWrapperOutgoing,
                    ]}>
                        {/* Render Media - Outside bubble for better sizing */}
                        {hasMedia && (
                            <View style={styles.mediaContainer}>
                                {hasGalleryMedia ? (
                                    <View style={styles.galleryBubble}>
                                        <View style={styles.galleryGrid}>
                                            {galleryPreviewMedia.map((media: any, index: number) => (
                                                <Pressable
                                                    key={`${media?.url || "media"}-${index}`}
                                                    style={styles.galleryTileWrap}
                                                    onPress={() => openImageViewer(item.senderId, media?.url)}
                                                >
                                                    <Image
                                                        source={{ uri: media?.url }}
                                                        style={styles.galleryTileImage}
                                                    />
                                                    {index === galleryPreviewMedia.length - 1 && galleryExtraCount > 0 && (
                                                        <View style={styles.galleryOverlay}>
                                                            <Text style={styles.galleryOverlayText}>+{galleryExtraCount}</Text>
                                                        </View>
                                                    )}
                                                </Pressable>
                                            ))}
                                        </View>
                                    </View>
                                ) : (
                                    item.media.map((m: any, idx: number) => (
                                        <MediaMessage
                                            key={idx}
                                            media={m}
                                            isSender={isOwn}
                                            layoutMode={hasText ? 'compact' : 'standalone'}
                                        />
                                    ))
                                )}
                            </View>
                        )}

                        {/* Text Message Bubble */}
                        {hasText && (
                            <View
                                style={[
                                    styles.messageBubble,
                                    isOwn ? styles.messageBubbleOwn : styles.messageBubbleOther,
                                ]}
                            >
                                {!isOwn && (
                                    <View style={styles.senderNameRow}>
                                        <Text style={styles.senderName}>
                                            {senderName}
                                        </Text>
                                        {roleIcon && (
                                            <Text style={styles.roleIcon}>{roleIcon}</Text>
                                        )}
                                    </View>
                                )}
                                {/* Quoted message block if this is a reply */}
                                {(() => {
                                    const hasQuoted = resolvedQuotedMessage || item.quotedMessageId;
                                    // if (hasQuoted) {
                                    //     console.log('[GroupMessageBubble] Message has quoted content:', {
                                    //         hasResolvedQuotedMessage: !!resolvedQuotedMessage,
                                    //         hasQuotedMessageId: !!item.quotedMessageId,
                                    //         quotedMessageData: resolvedQuotedMessage,
                                    //     });
                                    // }
                                    return resolvedQuotedMessage ? (
                                        <QuotedMessageBlock
                                            quotedMessage={resolvedQuotedMessage}
                                            isOwn={isOwn}
                                            onPress={async () => {
                                                const msgId = item.quotedMessageId;
                                                if (msgId && chatActions.scrollToMessage) {
                                                    const success = await chatActions.scrollToMessage(msgId);
                                                    if (!success) {
                                                        Alert.alert("Thông báo", "Không tìm thấy tin nhắn gốc hoặc tin nhắn đã quá cũ");
                                                    }
                                                }
                                            }}
                                        />
                                    ) : null;
                                })()}
                                {(() => {
                                    const trimmedText = item.text ? item.text.trim() : "";
                                    const isJumboEmoji = !!JUMBO_EMOJI_ASSETS[trimmedText] && item.text.replace(/\s+/g, "") === trimmedText;
                                    const isNewMsg = item.createdAt
                                      ? new Date().getTime() - new Date(item.createdAt).getTime() < 5000
                                      : false;

                                    return isJumboEmoji ? (
                                      <AnimatedEmojiMessage emoji={trimmedText} isNew={isNewMsg} isMine={isOwn} />
                                    ) : (
                                      <Text style={[
                                        styles.messageText,
                                        isOwn ? styles.messageTextOwn : styles.messageTextOther,
                                      ]}>
                                        {item.text}
                                      </Text>
                                    );
                                  })()}
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
                            <View style={styles.senderNameRow}>
                                <Text style={styles.senderName}>
                                    {senderName}
                                </Text>
                                {roleIcon && (
                                    <Text style={styles.roleIcon}>{roleIcon}</Text>
                                )}
                            </View>
                        )}
                    </View>
                </HighlightableMessage>
            );
        },
        [user?.id, handleMessageLongPress, groupState.members, openImageViewer, messageMap, highlightedMessageId]
    );

    const handleViewableItemsChanged = useCallback(
        ({ viewableItems }: any) => {
            if (!viewableItems || viewableItems.length === 0) return;

            const visibleMessageIds = viewableItems
                .map((item: any) => item.item)
                .filter((msg: any) => msg.senderId !== user?.id)
                .flatMap((msg: any) => {
                    if (Array.isArray(msg.groupedMessageIds) && msg.groupedMessageIds.length > 0) {
                        return msg.groupedMessageIds;
                    }
                    return [msg._id || msg.id];
                })
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

    const renderableMessages = useMemo(
        () => groupMessagesForGallery(chatState.messages),
        [chatState.messages]
    );

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

                {/* Group Avatar */}
                {groupState.group?.avatarUrl && (
                    <Image
                        source={{ uri: groupState.group.avatarUrl }}
                        style={styles.groupAvatarImage}
                    />
                )}

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
                <View style={styles.headerIconGroup}>
                    <Pressable
                        style={styles.headerIconButton}
                        onPress={onAddMembersPress}
                        hitSlop={8}
                    >
                        <Ionicons
                            name="person-add-outline"
                            size={24}
                            color={colors.text}
                        />
                    </Pressable>
                    <Pressable
                        style={styles.headerIconButton}
                        onPress={onSettingsPress}
                        hitSlop={8}
                    >
                        <Ionicons
                            name="settings-outline"
                            size={24}
                            color={colors.text}
                        />
                    </Pressable>
                </View>
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
                <ImageBackground
                    source={assets.chatBackground}
                    style={styles.chatBackground}
                    resizeMode="cover"
                >
                    {/* Pinned Message Header */}
                    {chatState.pinnedMessages.length > 0 && (
                        <PinnedMessageHeader
                            pinnedMessage={chatState.pinnedMessages[chatState.pinnedMessageIndex] || null}
                            pinnedIndex={chatState.pinnedMessageIndex}
                            pinnedTotal={chatState.pinnedMessages.length}
                            onNavigate={(direction) => {
                                if (chatActions.navigatePinnedMessages) {
                                    chatActions.navigatePinnedMessages(direction);
                                }
                            }}
                            onUnpin={async () => {
                                const msgId = chatState.pinnedMessages[chatState.pinnedMessageIndex]?._id
                                    || chatState.pinnedMessages[chatState.pinnedMessageIndex]?.id;
                                if (msgId && chatActions.unpinMessage) {
                                    try {
                                        await chatActions.unpinMessage(msgId);
                                    } catch (error: any) {
                                        Alert.alert("Lỗi", error.message || "Không thể bỏ ghim tin nhắn");
                                    }
                                }
                            }}
                            onPress={() => {
                                // Scroll to pinned message and highlight it
                                const pinnedMsg = chatState.pinnedMessages[chatState.pinnedMessageIndex];
                                const pinnedMsgId = pinnedMsg?._id || pinnedMsg?.id;
                                if (pinnedMsgId && chatActions.scrollToMessage) {
                                    chatActions.scrollToMessage(pinnedMsgId);
                                }
                            }}
                            isAdmin={groupState?.group?.admins?.includes(currentUserId)}
                        />
                    )}
                    <FlatList
                        ref={flatListRef}
                        data={renderableMessages}
                        keyExtractor={(item) => item._id || item.id || `${item.senderId}-${item.createdAt}`}
                        renderItem={renderMessage}
                        inverted
                        contentContainerStyle={styles.messagesContainer}
                        scrollEventThrottle={16}
                        onEndReachedThreshold={0.5}
                        onEndReached={() => {
                            if (chatState.hasMoreMessages && !isSending && !chatState.isLoading) {
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
                </ImageBackground>
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
                    scrollToLatestMessage(true);
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
            {chatState.replyingTo && (
                <ReplyPreview
                    message={chatState.replyingTo}
                    onCancel={() => {
                        if (chatActions.setReplyingTo) {
                            chatActions.setReplyingTo(null);
                        }
                    }}
                />
            )}
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
            <ForwardDialog
                visible={showForwardDialog}
                currentConversationId={chatState.conversation?._id || chatState.conversation?.id || groupId || ""}
                currentUserId={currentUserId}
                messageIds={forwardMessageIds}
                excludeTargetIds={groupId ? [groupId] : []}
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

            {allViewerImages.length > 0 && (
                <Modal
                    visible={allViewerImages.length > 0}
                    transparent={true}
                    statusBarTranslucent={true}
                    onRequestClose={closeImageViewer}
                >
                    <View style={styles.imageViewerContainer}>
                        <Pressable
                            style={styles.imageViewerClose}
                            onPress={closeImageViewer}
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
                            onMomentumScrollEnd={(event) => {
                                const contentOffsetX = event.nativeEvent.contentOffset.x;
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

            {/* Edit Message Dialog Modal */}
            <Modal
                visible={showEditDialog}
                transparent
                animationType="fade"
                onRequestClose={() => {
                    setShowEditDialog(false);
                    setSelectedMessageId(null);
                    setEditText("");
                }}
            >
                <Pressable
                    style={styles.modalOverlay}
                    onPress={() => {
                        setShowEditDialog(false);
                        setSelectedMessageId(null);
                        setEditText("");
                    }}
                >
                    <Pressable style={styles.modalContent} onPress={() => { }}>
                        <View style={styles.editDialogContent}>
                            <Text style={styles.editDialogTitle}>Sửa tin nhắn</Text>
                            <TextInput
                                style={styles.editDialogInput}
                                placeholder="Nhập nội dung mới..."
                                placeholderTextColor={colors.textMuted}
                                value={editText}
                                onChangeText={setEditText}
                                multiline
                                maxLength={1000}
                            />

                            <View style={styles.editDialogButtons}>
                                <Pressable
                                    style={[styles.editDialogButton, styles.editDialogCancelButton]}
                                    onPress={() => {
                                        setShowEditDialog(false);
                                        setSelectedMessageId(null);
                                        setEditText("");
                                    }}
                                >
                                    <Text style={styles.editDialogButtonText}>Hủy</Text>
                                </Pressable>

                                <Pressable
                                    style={[styles.editDialogButton, styles.editDialogSaveButton]}
                                    onPress={handleSaveEdit}
                                >
                                    <Text style={styles.editDialogButtonText}>Lưu</Text>
                                </Pressable>
                            </View>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>
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
        backgroundColor: colors.headerBgTransparent,
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
        marginLeft: 8,
    },
    groupAvatarImage: {
        width: 40,
        height: 40,
        borderRadius: 20,
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
    headerIconGroup: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
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
    messageHighlighted: {
        backgroundColor: "rgba(255, 200, 0, 0.18)",
        borderRadius: 12,
    },
    messageContentWrapper: {
        flexDirection: "column",
        gap: 0,
        maxWidth: "82%",
    },
    messageContentWrapperMediaOnlyOutgoing: {
        maxWidth: "82%",
    },
    messageContentWrapperMediaOnlyIncoming: {
        // Incoming rows include avatar + gap, so reserve horizontal space to avoid clipping media controls.
        maxWidth: "74%",
    },
    messageContentWrapperIncoming: {
        // maxWidth applied to parent wrapper
    },
    messageContentWrapperOutgoing: {
        alignItems: "flex-end",
    },
    outgoingRow: {
        justifyContent: "flex-end",
    },
    incomingRow: {
        justifyContent: "flex-start",
    },
    messageBubble: {
        maxWidth: "100%",
        borderRadius: 18,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    messageBubbleOwn: {
        backgroundColor: colors.bubbleOutgoingBgTransparent,
        borderTopRightRadius: 6,
    },
    messageBubbleOther: {
        backgroundColor: colors.bubbleIncomingBgTransparent,
        borderTopLeftRadius: 6,
    },
    senderName: {
        fontSize: 11,
        fontWeight: "600",
        color: colors.textMuted,
    },
    senderNameRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    roleIcon: {
        fontSize: 12,
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
    galleryBubble: {
        borderRadius: 16,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
    },
    galleryGrid: {
        flexDirection: "row",
        width: 204,
        height: 68,
    },
    galleryTileWrap: {
        flex: 1,
        position: "relative",
    },
    galleryTileImage: {
        width: "100%",
        height: "100%",
    },
    galleryOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.45)",
    },
    galleryOverlayText: {
        color: colors.textOnAccent,
        fontSize: 16,
        fontWeight: "700",
    },

    // System message
    systemMessageContainer: {
        alignItems: "center",
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    systemMessageText: {
        fontSize: 13,
        color: colors.textMuted,
        fontStyle: "italic",
        textAlign: "center",
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
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: colors.accent,
    },
    chatBackground: {
        flex: 1,
        width: "100%",
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
    imageViewerContainer: {
        flex: 1,
        backgroundColor: "rgba(0, 0, 0, 0.96)",
        justifyContent: "center",
        alignItems: "center",
    },
    imageViewerClose: {
        position: "absolute",
        top: 54,
        right: 20,
        zIndex: 2,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "rgba(0,0,0,0.4)",
        alignItems: "center",
        justifyContent: "center",
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
        bottom: 44,
        alignSelf: "center",
        backgroundColor: "rgba(0,0,0,0.5)",
        borderRadius: 14,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    imageViewerCounterText: {
        color: colors.textOnAccent,
        fontSize: 12,
        fontWeight: "600",
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

