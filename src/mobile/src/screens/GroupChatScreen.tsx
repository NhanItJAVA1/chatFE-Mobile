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
import { useDraft } from "../../../shared/hooks/useDraft";
import { useGroupChatMessage } from "../../../shared/hooks/useGroupChatMessage";
import { useGroupChat } from "../../../shared/hooks/useGroupChat";
import { useAuth } from "../../../shared/hooks";
import { useCall } from "../../../shared/context";
import { GroupChatService } from "../../../shared/services/groupChatService";
import { ConversationService, type MuteConversationOptions } from "../../../shared/services/conversationService";
import { SocketService } from "../../../shared/services";
import chatMediaService from "../../../shared/services/chatMediaService";
import {
    aiService,
    type AiExtractTasksResponse,
    type AiSmartSearchResponse,
    type AiSummarizeResponse,
    type AiTone,
} from "../../../shared/services/aiService";
import profileCardService from "../../../shared/services/profileCardService";
import { Avatar, ForwardDialog, VoiceRecorder, PinnedMessageHeader, ReplyPreview, QuotedMessageBlock, HighlightableMessage, AnimatedEmojiMessage, PollCard, CreatePollModal, ProfileCardMessage, ContactPickerSheet } from "../components";
import { JUMBO_EMOJI_ASSETS } from "../components/AnimatedEmojiMessage";
import { SystemMessageBubble } from "../components/SystemMessageBubble";
import MediaMessage from "../components/MediaMessage";
import { colors, assets } from "../theme";
import { buildMessageActionSheetOptions, type MessageActionButton } from "../../../shared/utils";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "😡"];

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
type AiPanelMode = "summary" | "search" | "tasks";
type MuteOptionKey = "1h" | "4h" | "8am" | "forever";

const MUTE_OPTIONS: Array<{ key: MuteOptionKey; label: string }> = [
    { key: "1h", label: "Trong 1 giờ" },
    { key: "4h", label: "Trong 4 giờ" },
    { key: "8am", label: "Cho đến 8:00 AM" },
    { key: "forever", label: "Cho đến khi được mở lại" },
];

const FOREVER_MUTE_UNTIL = "9999-12-31T00:00:00.000Z";

const getNextEightAmIso = (): string => {
    const now = new Date();
    const nextEight = new Date(now);
    nextEight.setHours(8, 0, 0, 0);

    if (nextEight.getTime() <= now.getTime()) {
        nextEight.setDate(nextEight.getDate() + 1);
    }

    return nextEight.toISOString();
};

const buildMutePayload = (option: MuteOptionKey): { payload: MuteConversationOptions; localMuteUntil: string } => {
    if (option === "1h") {
        const duration = 60 * 60 * 1000;
        return { payload: { duration }, localMuteUntil: new Date(Date.now() + duration).toISOString() };
    }

    if (option === "4h") {
        const duration = 4 * 60 * 60 * 1000;
        return { payload: { duration }, localMuteUntil: new Date(Date.now() + duration).toISOString() };
    }

    if (option === "8am") {
        const muteUntil = getNextEightAmIso();
        return { payload: { muteUntil }, localMuteUntil: muteUntil };
    }

    return { payload: {}, localMuteUntil: FOREVER_MUTE_UNTIL };
};

const isMuteUntilActive = (muteUntil?: string | null): boolean => {
    if (!muteUntil) {
        return false;
    }

    const mutedUntilMs = new Date(muteUntil).getTime();
    return !Number.isNaN(mutedUntilMs) && mutedUntilMs > Date.now();
};

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

const getRenderablePollId = (message: any): string => {
    return message?.poll?.id || message?.pollId || message?.poll?._id || "";
};

const keepLatestPollCards = (messages: any[]): any[] => {
    const seenPollIds = new Set<string>();

    return messages.filter((message) => {
        const pollId = getRenderablePollId(message);
        if (!pollId) return true;

        if (seenPollIds.has(pollId)) {
            return false;
        }

        seenPollIds.add(pollId);
        return true;
    });
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
    onOpenPrivateChat?: (user: any) => void;
}> = ({ route, navigation, onBackPress, onSettingsPress, onAddMembersPress, onOpenPrivateChat }) => {
    const { groupId, searchTargetMessageId, searchTargetMessage, searchContextMessages } = route.params || {};
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
    const { startCall, state: callState } = useCall();
    const currentUserId = user?.id || (user as any)?._id || (user as any)?.userId || "";
    const { draftText: messageText, setDraftText: setMessageText, clearDraft } = useDraft(groupId || "");

    useEffect(() => {
        groupActions.setupGroupListeners();
        return () => {
            groupActions.cleanupGroupListeners();
        };
    }, [groupActions]);

    useEffect(() => {
        const normalizedGroupId = String(groupId || "");
        return () => {
            if (!normalizedGroupId) {
                return;
            }

            SocketService.leaveConversation(normalizedGroupId).catch(() => { });
        };
    }, [groupId]);

    // Local state
    const [isSending, setIsSending] = useState(false);
    const [showMediaMenu, setShowMediaMenu] = useState(false);
    const [showContactPicker, setShowContactPicker] = useState(false);
    const [profileCardSendingUserId, setProfileCardSendingUserId] = useState<string | null>(null);
    const [profileCardSentUserIds, setProfileCardSentUserIds] = useState<Set<string>>(new Set());
    const [draftMedia, setDraftMedia] = useState<DraftMediaAsset[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
    const [showForwardDialog, setShowForwardDialog] = useState(false);
    const [forwardMessageIds, setForwardMessageIds] = useState<string[]>([]);
    const [showEditDialog, setShowEditDialog] = useState(false);
    const [editText, setEditText] = useState("");
    const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
    const [actionMenuMessage, setActionMenuMessage] = useState<any | null>(null);
    const [actionMenuButtons, setActionMenuButtons] = useState<MessageActionButton[]>([]);
    const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null);
    const [selectedImageIndex, setSelectedImageIndex] = useState(0);
    const [allViewerImages, setAllViewerImages] = useState<Array<{ uri: string; key: string }>>([]);
    const [showAiQuickMenu, setShowAiQuickMenu] = useState(false);
    const [showTonePicker, setShowTonePicker] = useState(false);
    const [showAiPanel, setShowAiPanel] = useState(false);
    const [aiPanelMode, setAiPanelMode] = useState<AiPanelMode>("summary");
    const [aiLoading, setAiLoading] = useState(false);
    const [aiSummary, setAiSummary] = useState<AiSummarizeResponse | null>(null);
    const [aiSearchQuery, setAiSearchQuery] = useState("");
    const [aiSearchResult, setAiSearchResult] = useState<AiSmartSearchResponse | null>(null);
    const [aiTasks, setAiTasks] = useState<AiExtractTasksResponse | null>(null);
    const [toneLoading, setToneLoading] = useState<AiTone | null>(null);
    const [previousDraft, setPreviousDraft] = useState<string | null>(null);
    const [showMuteDialog, setShowMuteDialog] = useState(false);
    const [selectedMuteOption, setSelectedMuteOption] = useState<MuteOptionKey>("1h");
    const [muteLoading, setMuteLoading] = useState(false);
    const [localMuteUntil, setLocalMuteUntil] = useState<string | null>(null);
    const [showCreatePollModal, setShowCreatePollModal] = useState(false);
    const [isCreatingPoll, setIsCreatingPoll] = useState(false);

    // Refs
    // flatListRef comes from useGroupChatMessage → useScrollToMessage (enables scrollToMessage)
    const imageViewerScrollRef = useRef<FlatList>(null);
    const actionsRef = useRef(chatActions);
    const kickedOutRef = useRef(false);
    const currentMemberMuteUntil = useMemo(() => {
        const currentMember = groupState.members?.find((member: any) => {
            const memberUserId = member?.userId || member?._id || member?.id || "";
            return String(memberUserId) === String(currentUserId);
        });

        return (currentMember as any)?.muteUntil || null;
    }, [currentUserId, groupState.members]);
    const groupMuteUntil = localMuteUntil || currentMemberMuteUntil;
    const isGroupMuted = isMuteUntilActive(groupMuteUntil);
    const onBackPressRef = useRef(onBackPress);

    const scrollToLatestMessage = useCallback((animated = true) => {
        // For inverted FlatList, latest message is at offset 0.
        flatListRef.current?.scrollToOffset({ offset: 0, animated });
    }, []);

    // Update actionsRef when chatActions changes
    useEffect(() => {
        actionsRef.current = chatActions;
    }, [chatActions]);

    useEffect(() => {
        onBackPressRef.current = onBackPress;
    }, [onBackPress]);

    useEffect(() => {
        if (!groupId || !token) {
            return;
        }

        if (!SocketService.isConnected()) {
            SocketService.connect(token);
        }

        const socket = SocketService.getSocket();
        const normalizedGroupId = String(groupId);

        const handleSettingsUpdated = (data: any) => {
            const conversationId = String(
                data?.conversationId ||
                data?.groupId ||
                data?.conversation?._id ||
                data?.conversation?.id ||
                ""
            );

            if (conversationId !== normalizedGroupId) {
                return;
            }

            groupActions.loadGroupInfo(groupId).catch((error: any) => {
                console.warn("[GroupChatScreen] Failed to refresh group settings:", error?.message);
            });
        };

        socket?.on("group:settings_updated", handleSettingsUpdated);

        return () => {
            socket?.off("group:settings_updated", handleSettingsUpdated);
        };
    }, [groupId, token, groupActions]);

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
                                    onBackPressRef.current?.();
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
        const interval = setInterval(verifyMembership, 30000);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [groupId, user?.id, (user as any)?._id, (user as any)?.userId, token]);

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

    const searchTargetHandledRef = useRef<string | null>(null);

    const normalizeSearchMessage = useCallback((raw: any): any | null => {
        if (!raw) return null;
        const id = raw._id || raw.id || raw.messageId;
        if (!id || !groupId) return null;

        return {
            ...raw,
            _id: String(id),
            id: String(id),
            conversationId: raw.conversationId || groupId,
            senderId: raw.senderId || "",
            senderName: raw.senderName || "Người dùng",
            senderAvatar: raw.senderAvatar || "",
            text: raw.text || "",
            media: raw.media || [],
            status: raw.status || "sent",
            createdAt: raw.createdAt || new Date().toISOString(),
            updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString(),
        };
    }, [groupId]);

    useEffect(() => {
        const targetId = String(searchTargetMessageId || "");
        if (!targetId || chatState.isLoading || !groupId || searchTargetHandledRef.current === targetId) return;

        searchTargetHandledRef.current = targetId;
        const extraMessages = [
            normalizeSearchMessage(searchTargetMessage),
            ...(Array.isArray(searchContextMessages) ? searchContextMessages.map(normalizeSearchMessage) : []),
        ].filter(Boolean);

        if (extraMessages.length > 0) {
            chatActions.addMessages(extraMessages as any);
        }

        setTimeout(() => {
            chatActions.scrollToMessage(targetId).then((success: boolean) => {
                if (!success) {
                    Alert.alert("Thông báo", "Không tìm thấy tin nhắn trong nhóm");
                }
            });
        }, 250);
    }, [searchTargetMessageId, searchTargetMessage, searchContextMessages, chatState.isLoading, groupId, chatActions, normalizeSearchMessage]);

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
            const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!permissionResult.granted) {
                Alert.alert(
                    "Yêu cầu quyền",
                    "Chúng tôi cần quyền truy cập thư viện ảnh. Vui lòng bật nó trong cài đặt."
                );
                return;
            } try {
                const result = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ['images'],
                    allowsMultipleSelection: true,
                    selectionLimit: 0,
                } as any);
                if (result.canceled) {
                    return;
                }

                if (!result.assets || result.assets.length === 0) {
                    Alert.alert("Lỗi", "Chưa chọn ảnh");
                    return;
                }

                const validAssets = result.assets.filter((asset) => asset?.uri && (asset?.type || asset?.mimeType));
                if (validAssets.length === 0) {
                    Alert.alert("Lỗi", "File ảnh không hợp lệ");
                    return;
                }
                appendDraftMedia(validAssets);
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
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['videos'],
                allowsMultipleSelection: true,
            } as any);

            if (result.canceled) {
                return;
            }

            if (!result.assets || result.assets.length === 0) {
                Alert.alert("Lỗi", "Chưa chọn video");
                return;
            }

            const validAssets = result.assets.filter((asset) => asset?.uri && (asset?.type || asset?.mimeType));
            if (validAssets.length === 0) {
                Alert.alert("Lỗi", "File video không hợp lệ");
                return;
            }
            appendDraftMedia(validAssets);
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
            const result = await DocumentPicker.getDocumentAsync({
                type: ["audio/*"],
            });

            if (result.canceled) {
                return;
            }

            if (!result.assets || result.assets.length === 0) {
                Alert.alert("Lỗi", "Chưa chọn file audio");
                return;
            }

            const validAssets = result.assets.filter((asset) => asset?.uri && asset?.mimeType);
            if (validAssets.length === 0) {
                Alert.alert("Lỗi", "File audio không hợp lệ");
                return;
            }
            appendDraftMedia(validAssets);
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
                return;
            }

            if (!result.assets || result.assets.length === 0) {
                Alert.alert("Lỗi", "Chưa chọn tài liệu");
                return;
            }

            const validAssets = result.assets.filter((asset) => asset?.uri && asset?.mimeType);
            if (validAssets.length === 0) {
                Alert.alert("Lỗi", "File tài liệu không hợp lệ");
                return;
            }
            appendDraftMedia(validAssets);
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

    const currentUserIds = useMemo(
        () => [user?.id, (user as any)?._id, (user as any)?.userId]
            .filter(Boolean)
            .map((id) => String(id)),
        [user?.id, (user as any)?._id, (user as any)?.userId]
    );

    const isCurrentUserOwner = currentUserIds.includes(String(groupState.group?.ownerId || ""));
    const isCurrentUserAdmin = (groupState.group?.admins || []).some((admin: any) => {
        const adminId = typeof admin === "string"
            ? admin
            : admin?.userId || admin?._id || admin?.id || "";
        return currentUserIds.includes(String(adminId));
    });
    const pollPermission = (groupState.group?.settings as any)?.utilityPermissions?.poll || "all";
    const canCreatePoll = pollPermission === "all" || isCurrentUserOwner || isCurrentUserAdmin;

    const canManagePoll = useCallback((poll: any) => {
        const creatorId = String(poll?.creatorId || poll?.createdBy || "");
        return isCurrentUserOwner || isCurrentUserAdmin || (!!creatorId && currentUserIds.includes(creatorId));
    }, [currentUserIds, isCurrentUserAdmin, isCurrentUserOwner]);

    const handleCreatePoll = useCallback(async (payload: any) => {
        try {
            setIsCreatingPoll(true);
            await actionsRef.current?.createPoll(payload);
            setShowCreatePollModal(false);
            scrollToLatestMessage(true);
        } catch (error: any) {
            Alert.alert("Lỗi", error?.message || "Không thể tạo bình chọn");
        } finally {
            setIsCreatingPoll(false);
        }
    }, [scrollToLatestMessage]);

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
                        await clearDraft();
                    } else if (trimmedText) {
                        await chatActions.sendQuotedMessage(quotedMessageId, trimmedText);
                        await clearDraft();
                    }
                }
            } else {
                // Send text message normally
                if (trimmedText) {
                    await chatActions.sendMessage(trimmedText);
                    await clearDraft();
                }

                // Send media
                if (draftMedia.length > 0) {
                    await sendDraftMedia(trimmedText || undefined);
                    await clearDraft();
                }
            }

            scrollToLatestMessage(true);
        } catch (err: any) {
            Alert.alert("Lỗi", err.message || "Failed to send message");
        } finally {
            setIsSending(false);
        }
    }, [messageText, draftMedia, hasSendableContent, chatActions, sendDraftMedia, scrollToLatestMessage, chatState.replyingTo, clearDraft]);

    const handleInputChange = useCallback((text: string) => {
        setMessageText(text);
        if (text.trim()) {
            chatActions.handleTyping();
        }
    }, [chatActions]);

    const openAiPanel = useCallback(async (mode: AiPanelMode) => {
        if (!groupId) return;

        setAiPanelMode(mode);
        setShowAiPanel(true);
        setAiLoading(true);

        try {
            if (mode === "summary") {
                setAiSummary(await aiService.summarize(groupId, 100));
            } else if (mode === "tasks") {
                setAiTasks(await aiService.extractTasks(groupId, 100));
            } else if (aiSearchQuery.trim()) {
                setAiSearchResult(await aiService.smartSearch(aiSearchQuery.trim(), groupId));
            }
        } catch (err: any) {
            Alert.alert("AI", err?.message || "Không thể gọi AI lúc này.");
        } finally {
            setAiLoading(false);
        }
    }, [aiSearchQuery, groupId]);

    const handleToneAdjust = useCallback(async (tone: AiTone) => {
        const text = messageText.trim();
        if (!text) {
            Alert.alert("AI", "Nhập tin nhắn trước khi chỉnh giọng văn.");
            return;
        }

        try {
            setToneLoading(tone);
            setPreviousDraft(messageText);
            const result = await aiService.toneAdjust(text, tone);
            setMessageText(result.adjusted);
        } catch (err: any) {
            Alert.alert("AI", err?.message || "Không thể chỉnh giọng văn.");
        } finally {
            setToneLoading(null);
        }
    }, [messageText]);

    const showToneMenu = useCallback(() => {
        setShowTonePicker(true);
    }, []);

    const showAiMenu = useCallback(() => {
        setShowAiQuickMenu(true);
    }, []);

    const handleConfirmMute = useCallback(async () => {
        if (!groupId) {
            Alert.alert("Thông báo", "Chưa có nhóm để tắt thông báo.");
            return;
        }

        const { payload, localMuteUntil: nextMuteUntil } = buildMutePayload(selectedMuteOption);

        try {
            setMuteLoading(true);
            await ConversationService.muteConversation(String(groupId), payload);
            setLocalMuteUntil(nextMuteUntil);
            setShowMuteDialog(false);
            Alert.alert("Thông báo", "Đã tắt thông báo nhóm này.");
        } catch (err: any) {
            Alert.alert("Thông báo", err?.message || "Không thể tắt thông báo lúc này.");
        } finally {
            setMuteLoading(false);
        }
    }, [groupId, selectedMuteOption]);

    const handleUnmuteConversation = useCallback(async () => {
        if (!groupId) {
            Alert.alert("Thông báo", "Chưa có nhóm để bật thông báo.");
            return;
        }

        try {
            setMuteLoading(true);
            await ConversationService.unmuteConversation(String(groupId));
            setLocalMuteUntil(null);
            Alert.alert("Thông báo", "Đã bật lại thông báo nhóm này.");
        } catch (err: any) {
            Alert.alert("Thông báo", err?.message || "Không thể bật thông báo lúc này.");
        } finally {
            setMuteLoading(false);
        }
    }, [groupId]);

    const handleMuteButtonPress = useCallback(() => {
        if (isGroupMuted) {
            handleUnmuteConversation();
            return;
        }

        setShowMuteDialog(true);
    }, [handleUnmuteConversation, isGroupMuted]);

    const handleToggleReaction = useCallback(async (messageId: string, emoji: string, selected: boolean) => {
        try {
            if (selected) {
                await actionsRef.current?.removeReaction?.(messageId, emoji);
            } else {
                await actionsRef.current?.addReaction?.(messageId, emoji);
            }
        } catch (error: any) {
            Alert.alert("Lỗi", error?.message || "Không thể cập nhật react");
        }
    }, []);

    const closeActionMenu = useCallback(() => {
        setActionMenuMessage(null);
        setActionMenuButtons([]);
    }, []);

    const handleOpenProfileCardUser = useCallback((profileUser: any) => {
        const targetUserId = profileUser?.id || profileUser?._id || profileUser?.userId;
        if (!targetUserId) return;
        onOpenPrivateChat?.({
            ...profileUser,
            id: targetUserId,
            displayName: profileUser.displayName || profileUser.name || "Người dùng",
            conversationType: "PRIVATE",
            relationship: String(targetUserId) === String(currentUserId) ? "self" : (profileUser.relationship || "stranger"),
        });
    }, [currentUserId, onOpenPrivateChat]);

    const handleSendProfileCard = useCallback(async (targetUser: { id: string; displayName: string }) => {
        if (!groupId || !targetUser.id) return;
        setProfileCardSendingUserId(targetUser.id);
        try {
            await profileCardService.sendProfileCard(groupId, { userId: targetUser.id });
            setProfileCardSentUserIds((prev) => new Set(prev).add(targetUser.id));
        } catch (error: any) {
            const message = error?.status === 403
                ? "Người này đang ẩn danh thiếp hoặc không cho phép chia sẻ."
                : error?.message || "Không gửi được danh thiếp";
            Alert.alert("Lỗi", message);
        } finally {
            setProfileCardSendingUserId(null);
        }
    }, [groupId]);

    const handleMessageLongPress = useCallback((message: any) => {
        const messageId = message._id || message.id;
        if (!messageId) return;

        const isOwn = !!currentUserId && String(message.senderId || "") === String(currentUserId);
        setActionMenuMessage(message);
        setActionMenuButtons(
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
                onPin: async () => {
                    try {
                        if (actionsRef.current?.pinMessage) {
                            await actionsRef.current.pinMessage(messageId);
                        }
                    } catch (error: any) {
                        Alert.alert("Lỗi", error.message || "Không thể ghim tin nhắn");
                    }
                },
                onReply: () => {
                    if (actionsRef.current?.setReplyingTo) {
                        actionsRef.current.setReplyingTo(message);
                    }
                },
            })
        );
    }, [currentUserId]);

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

    const handleStartGroupCall = useCallback(async () => {
        if (!groupId) {
            Alert.alert("Không thể gọi", "Nhóm chưa sẵn sàng.");
            return;
        }

        await startCall({
            conversationId: String(groupId),
            conversationType: "GROUP",
            type: "audio",
            inviteAll: true,
        });
    }, [groupId, startCall]);

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
        }); return map;
    }, [chatState.messages]);

    const renderMessage = useCallback(
        ({ item }: any) => {
            const itemType = String(item.type || item.messageType || "").toLowerCase();
            const pollId = item.poll?.id || item.pollId;
            const poll = item.poll || chatState.polls.find((candidate: any) => candidate.id === pollId);

            if (itemType === "poll" || poll) {
                if (!poll) {
                    return null;
                }

                const messageId = item._id || item.id || `poll-${poll.id}`;
                const isHighlighted = !!messageId && messageId === highlightedMessageId;

                return (
                    <HighlightableMessage
                        isHighlighted={isHighlighted}
                        style={[
                            styles.pollWidgetRow,
                            isHighlighted && styles.messageHighlighted,
                        ]}
                    >
                        <PollCard
                            poll={poll}
                            currentUserId={currentUserId}
                            canManage={canManagePoll(poll)}
                            members={groupState.members}
                            onVote={(targetPollId, optionIds) => actionsRef.current.votePoll(targetPollId, { optionIds })}
                            onLock={(targetPollId) => actionsRef.current.lockPoll(targetPollId)}
                            onPin={(targetPollId) => actionsRef.current.pinPoll(targetPollId)}
                            onUnpin={(targetPollId) => actionsRef.current.unpinPoll(targetPollId)}
                            onDelete={(targetPollId) => actionsRef.current.deletePoll(targetPollId)}
                            onAddOption={(targetPollId, text) => actionsRef.current.addPollOption(targetPollId, { text })}
                        />
                    </HighlightableMessage>
                );
            }

            if (itemType === "profile_card") {
                const messageId = item._id || item.id;
                const isHighlighted = !!messageId && messageId === highlightedMessageId;
                const isOwn = item.senderId === user?.id;

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
                        <ProfileCardMessage
                            user={item.profileCard}
                            userId={item.profileCardUserId}
                            isOwn={isOwn}
                            onMessagePress={handleOpenProfileCardUser}
                            onViewProfilePress={handleOpenProfileCardUser}
                        />
                    </HighlightableMessage>
                );
            }

            // Check if it's a system/activity message
            if (
                item.isSystemMessage ||
                itemType === "system" ||
                itemType === "activity" ||
                String(item.messageType || "").toLowerCase() === "system"
            ) {
                return <SystemMessageBubble text={item.text || item.content || item.message || ""} />;
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
            const isForwarded = Boolean(
                item?.isForwarded ||
                item?.forwarded ||
                item?.forwardedFrom ||
                item?.forwardedFromMessageId ||
                item?.originalMessageId ||
                item?.sourceMessageId
            );
            const hasGalleryMedia =
                hasMedia &&
                item.media.length >= 3 &&
                item.media.every((media: any) => detectDraftMediaKind(media?.mimetype, media?.mediaType) === "image");
            const galleryPreviewMedia = hasGalleryMedia ? item.media.slice(0, 3) : [];
            const galleryExtraCount = hasGalleryMedia ? Math.max(0, item.media.length - galleryPreviewMedia.length) : 0;

            const messageId = item._id || item.id;
            const isHighlighted = !!messageId && messageId === highlightedMessageId;
            const reactionGroups = Object.values(
                ((item.reactions || []) as any[]).reduce<Record<string, { emoji: string; count: number; selected: boolean }>>((acc, reaction: any) => {
                    const emoji = reaction?.emoji;
                    if (!emoji) return acc;
                    if (!acc[emoji]) {
                        acc[emoji] = { emoji, count: 0, selected: false };
                    }
                    acc[emoji].count += 1;
                    if (currentUserId && reaction.userId === currentUserId) {
                        acc[emoji].selected = true;
                    }
                    return acc;
                }, {})
            );
            const reactionSummary = {
                emojis: reactionGroups.map((reaction) => reaction.emoji),
                total: reactionGroups.reduce((sum, reaction) => sum + reaction.count, 0),
                selected: reactionGroups.some((reaction) => reaction.selected),
            };
            const myLastReaction = [...((item.reactions || []) as any[])]
                .reverse()
                .find((reaction: any) => reaction?.emoji && currentUserId && reaction.userId === currentUserId);
            const defaultReactionEmoji = myLastReaction?.emoji || "❤️";
            const hasDefaultReaction = !!myLastReaction;

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
                            <View style={[styles.mediaContainer, !hasText && styles.mediaReactionWrap]}>
                                {!hasText && isForwarded && (
                                    <View style={styles.forwardedLabelRow}>
                                        <Ionicons name="arrow-redo-outline" size={12} color={colors.textMuted} />
                                        <Text style={styles.forwardedLabelText}>Chuyển tiếp</Text>
                                    </View>
                                )}
                                {!hasText && reactionPickerMessageId === messageId && (
                                    <View style={[styles.quickReactionBar, isOwn ? styles.quickReactionBarOwn : styles.quickReactionBarOther]}>
                                        {QUICK_REACTIONS.map((emoji) => {
                                            const selected = ((item.reactions || []) as any[]).some(
                                                (reaction: any) => reaction?.emoji === emoji && currentUserId && reaction.userId === currentUserId
                                            );
                                            return (
                                                <Pressable
                                                    key={emoji}
                                                    style={[styles.quickReactionOption, selected && styles.quickReactionOptionSelected]}
                                                    onPress={() => {
                                                        setReactionPickerMessageId(null);
                                                        if (messageId) {
                                                            handleToggleReaction(messageId, emoji, false);
                                                        }
                                                    }}
                                                >
                                                    <Text style={styles.quickReactionText}>{emoji}</Text>
                                                </Pressable>
                                            );
                                        })}
                                        {hasDefaultReaction && (
                                            <Pressable
                                                style={[styles.quickReactionOption, styles.quickReactionDeleteOption]}
                                                onPress={() => {
                                                    setReactionPickerMessageId(null);
                                                    if (messageId) {
                                                        handleToggleReaction(messageId, "", true);
                                                    }
                                                }}
                                            >
                                                <Ionicons name="close" size={17} color={colors.danger} />
                                            </Pressable>
                                        )}
                                    </View>
                                )}
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
                                {!hasText && reactionGroups.length > 0 && (
                                    <View style={[styles.reactionRow, isOwn ? styles.reactionRowOwn : styles.reactionRowOther]}>
                                        <Pressable
                                            style={[styles.reactionPill, reactionSummary.selected && styles.reactionPillSelected]}
                                            onPress={() => messageId && handleToggleReaction(messageId, defaultReactionEmoji, false)}
                                        >
                                            <Text style={styles.reactionText}>
                                                {reactionSummary.emojis.join(" ")} {reactionSummary.total}
                                            </Text>
                                        </Pressable>
                                    </View>
                                )}
                                {!hasText && (
                                    <Pressable
                                        style={[styles.quickHeartButton, isOwn ? styles.quickHeartButtonOwn : styles.quickHeartButtonOther]}
                                        hitSlop={8}
                                        onPress={() => messageId && handleToggleReaction(messageId, defaultReactionEmoji, false)}
                                        onLongPress={() => setReactionPickerMessageId((value) => value === messageId ? null : messageId)}
                                        delayLongPress={220}
                                    >
                                        {hasDefaultReaction ? (
                                            <Text style={[styles.quickHeartButtonText, styles.quickHeartButtonTextSelected]}>
                                                {defaultReactionEmoji}
                                            </Text>
                                        ) : (
                                            <Ionicons name="happy-outline" size={15} color={colors.textMuted} />
                                        )}
                                    </Pressable>
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
                                {isForwarded && (
                                    <View style={styles.forwardedLabelRow}>
                                        <Ionicons name="arrow-redo-outline" size={12} color={isOwn ? colors.overlayWhite75 : colors.textMuted} />
                                        <Text style={[styles.forwardedLabelText, isOwn && styles.forwardedLabelTextOwn]}>Chuyển tiếp</Text>
                                    </View>
                                )}
                                {reactionPickerMessageId === messageId && (
                                    <View style={[styles.quickReactionBar, isOwn ? styles.quickReactionBarOwn : styles.quickReactionBarOther]}>
                                        {QUICK_REACTIONS.map((emoji) => {
                                            const selected = ((item.reactions || []) as any[]).some(
                                                (reaction: any) => reaction?.emoji === emoji && currentUserId && reaction.userId === currentUserId
                                            );
                                            return (
                                                <Pressable
                                                    key={emoji}
                                                    style={[styles.quickReactionOption, selected && styles.quickReactionOptionSelected]}
                                                    onPress={() => {
                                                        setReactionPickerMessageId(null);
                                                        if (messageId) {
                                                            handleToggleReaction(messageId, emoji, false);
                                                        }
                                                    }}
                                                >
                                                    <Text style={styles.quickReactionText}>{emoji}</Text>
                                                </Pressable>
                                            );
                                        })}
                                        {hasDefaultReaction && (
                                            <Pressable
                                                style={[styles.quickReactionOption, styles.quickReactionDeleteOption]}
                                                onPress={() => {
                                                    setReactionPickerMessageId(null);
                                                    if (messageId) {
                                                        handleToggleReaction(messageId, "", true);
                                                    }
                                                }}
                                            >
                                                <Ionicons name="close" size={17} color={colors.danger} />
                                            </Pressable>
                                        )}
                                    </View>
                                )}
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
                                {reactionGroups.length > 0 && (
                                    <View style={[styles.reactionRow, isOwn ? styles.reactionRowOwn : styles.reactionRowOther]}>
                                        <Pressable
                                            style={[styles.reactionPill, reactionSummary.selected && styles.reactionPillSelected]}
                                            onPress={() => messageId && handleToggleReaction(messageId, defaultReactionEmoji, false)}
                                        >
                                            <Text style={styles.reactionText}>
                                                {reactionSummary.emojis.join(" ")} {reactionSummary.total}
                                            </Text>
                                        </Pressable>
                                    </View>
                                )}
                                <Pressable
                                    style={[styles.quickHeartButton, isOwn ? styles.quickHeartButtonOwn : styles.quickHeartButtonOther]}
                                    hitSlop={8}
                                    onPress={() => messageId && handleToggleReaction(messageId, defaultReactionEmoji, false)}
                                    onLongPress={() => setReactionPickerMessageId((value) => value === messageId ? null : messageId)}
                                    delayLongPress={220}
                                >
                                    {hasDefaultReaction ? (
                                        <Text style={[styles.quickHeartButtonText, styles.quickHeartButtonTextSelected]}>
                                            {defaultReactionEmoji}
                                        </Text>
                                    ) : (
                                        <Ionicons name="happy-outline" size={15} color={colors.textMuted} />
                                    )}
                                </Pressable>
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
        [user?.id, currentUserId, canManagePoll, chatState.polls, handleMessageLongPress, handleToggleReaction, groupState.members, openImageViewer, messageMap, highlightedMessageId, handleOpenProfileCardUser, reactionPickerMessageId]
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
        () => groupMessagesForGallery(keepLatestPollCards(chatState.messages)),
        [chatState.messages]
    );

    const getActionIconName = useCallback((label: string): keyof typeof Ionicons.glyphMap => {
        if (label.includes("Trả lời")) return "return-up-back-outline";
        if (label.includes("Ghim")) return "pin";
        if (label.includes("Sửa")) return "create-outline";
        if (label.includes("Thu hồi")) return "refresh-outline";
        if (label.includes("Chuyển tiếp")) return "arrow-redo-outline";
        if (label.includes("Xóa")) return "trash-outline";
        return "ellipse-outline";
    }, []);

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
                        onPress={showAiMenu}
                        hitSlop={8}
                    >
                        <Ionicons name="sparkles" size={22} color={colors.accentStrong} />
                    </Pressable>
                    <Pressable
                        style={styles.headerIconButton}
                        onPress={handleStartGroupCall}
                        disabled={callState.status !== "idle"}
                        hitSlop={8}
                    >
                        <Ionicons
                            name="call-outline"
                            size={24}
                            color={callState.status === "idle" ? colors.text : colors.textMuted}
                        />
                    </Pressable>
                    {canCreatePoll && (
                        <Pressable
                            style={styles.headerIconButton}
                            onPress={() => setShowCreatePollModal(true)}
                            hitSlop={8}
                        >
                            <Ionicons
                                name="stats-chart-outline"
                                size={24}
                                color={colors.text}
                            />
                        </Pressable>
                    )}
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

            <Modal visible={showMuteDialog} transparent animationType="fade" onRequestClose={() => setShowMuteDialog(false)}>
                <Pressable style={styles.muteDialogOverlay} onPress={() => setShowMuteDialog(false)}>
                    <Pressable style={styles.muteDialogCard} onPress={(event) => event.stopPropagation()}>
                        <View style={styles.muteDialogHeader}>
                            <Text style={styles.muteDialogTitle}>Xác nhận</Text>
                            <Pressable style={styles.muteDialogCloseButton} onPress={() => setShowMuteDialog(false)}>
                                <Ionicons name="close" size={28} color={colors.text} />
                            </Pressable>
                        </View>
                        <Text style={styles.muteDialogMessage}>Bạn có chắc muốn tắt thông báo hội thoại này:</Text>
                        <View style={styles.muteOptionList}>
                            {MUTE_OPTIONS.map((option) => {
                                const selected = selectedMuteOption === option.key;
                                return (
                                    <Pressable
                                        key={option.key}
                                        style={styles.muteOptionRow}
                                        onPress={() => setSelectedMuteOption(option.key)}
                                    >
                                        <Ionicons
                                            name={selected ? "radio-button-on-outline" : "radio-button-off-outline"}
                                            size={22}
                                            color={selected ? colors.accentStrong : colors.textMuted}
                                        />
                                        <Text style={styles.muteOptionText}>{option.label}</Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                        <View style={styles.muteDialogActions}>
                            <Pressable style={styles.muteCancelButton} onPress={() => setShowMuteDialog(false)} disabled={muteLoading}>
                                <Text style={styles.muteCancelText}>Hủy</Text>
                            </Pressable>
                            <Pressable style={styles.muteConfirmButton} onPress={handleConfirmMute} disabled={muteLoading}>
                                {muteLoading ? (
                                    <ActivityIndicator size="small" color={colors.textOnAccent} />
                                ) : (
                                    <Text style={styles.muteConfirmText}>Đồng ý</Text>
                                )}
                            </Pressable>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

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
                                const pinnedMsg = chatState.pinnedMessages[chatState.pinnedMessageIndex];
                                const pinnedPollId = pinnedMsg?.poll?.id
                                    || pinnedMsg?.pollId
                                    || (String(pinnedMsg?._id || pinnedMsg?.id || "").startsWith("poll-")
                                        ? String(pinnedMsg?._id || pinnedMsg?.id).slice("poll-".length)
                                        : "");
                                if (pinnedPollId && chatActions.unpinPoll) {
                                    try {
                                        await chatActions.unpinPoll(pinnedPollId);
                                    } catch (error: any) {
                                        Alert.alert("Lỗi", error.message || "Không thể bỏ ghim bình chọn");
                                    }
                                    return;
                                }

                                const msgId = pinnedMsg?._id || pinnedMsg?.id;
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
                                const pinnedPollId = pinnedMsg?.poll?.id || pinnedMsg?.pollId;
                                const pinnedMsgId = pinnedPollId ? `poll-${pinnedPollId}` : (pinnedMsg?._id || pinnedMsg?.id);
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
                    <Pressable
                        style={styles.mediaMenuItem}
                        onPress={() => {
                            setShowMediaMenu(false);
                            setShowContactPicker(true);
                        }}
                    >
                        <Ionicons name="person-circle-outline" size={24} color={colors.accent} />
                        <Text style={styles.mediaMenuItemText}>Chia sẻ liên hệ</Text>
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
            {previousDraft !== null && (
                <View style={styles.aiUndoBar}>
                    <Text style={styles.aiUndoText}>AI đã chỉnh sửa bản nháp</Text>
                    <Pressable onPress={() => { setMessageText(previousDraft); setPreviousDraft(null); }}>
                        <Text style={styles.aiUndoAction}>Hoàn tác</Text>
                    </Pressable>
                </View>
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
                    <Pressable style={styles.composerEmojiButton} onPress={showToneMenu} disabled={!!toneLoading || !messageText.trim()}>
                        {toneLoading ? (
                            <ActivityIndicator size="small" color={colors.accentStrong} />
                        ) : (
                            <Ionicons name="sparkles" size={20} color={messageText.trim() ? colors.accentStrong : colors.textMuted} />
                        )}
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

            <Modal visible={showAiQuickMenu} animationType="fade" transparent onRequestClose={() => setShowAiQuickMenu(false)}>
                <Pressable style={styles.aiMenuOverlay} onPress={() => setShowAiQuickMenu(false)}>
                    <Pressable style={styles.aiMenuCard} onPress={(event) => event.stopPropagation()}>
                        <View style={styles.aiMenuHeader}>
                            <View style={styles.aiPanelTitleRow}>
                                <Ionicons name="sparkles" size={20} color={colors.accentStrong} />
                                <Text style={styles.aiPanelTitle}>Trợ lý AI</Text>
                            </View>
                            <Pressable onPress={() => setShowAiQuickMenu(false)}>
                                <Ionicons name="close" size={22} color={colors.textMuted} />
                            </Pressable>
                        </View>
                        <Pressable style={styles.aiMenuItem} onPress={() => { setShowAiQuickMenu(false); openAiPanel("summary"); }}>
                            <Ionicons name="document-text-outline" size={20} color={colors.accentStrong} />
                            <Text style={styles.aiMenuItemText}>Tóm tắt cuộc trò chuyện</Text>
                        </Pressable>
                        <Pressable style={styles.aiMenuItem} onPress={() => { setShowAiQuickMenu(false); setAiPanelMode("search"); setShowAiPanel(true); }}>
                            <Ionicons name="search-outline" size={20} color={colors.accentStrong} />
                            <Text style={styles.aiMenuItemText}>Tìm kiếm bằng AI</Text>
                        </Pressable>
                        <Pressable style={styles.aiMenuItem} onPress={() => { setShowAiQuickMenu(false); openAiPanel("tasks"); }}>
                            <Ionicons name="checkbox-outline" size={20} color={colors.accentStrong} />
                            <Text style={styles.aiMenuItemText}>Trích xuất công việc</Text>
                        </Pressable>
                    </Pressable>
                </Pressable>
            </Modal>

            <Modal visible={showTonePicker} animationType="fade" transparent onRequestClose={() => setShowTonePicker(false)}>
                <Pressable style={styles.aiMenuOverlay} onPress={() => setShowTonePicker(false)}>
                    <Pressable style={styles.aiMenuCard} onPress={(event) => event.stopPropagation()}>
                        <View style={styles.aiMenuHeader}>
                            <View style={styles.aiPanelTitleRow}>
                                <Ionicons name="sparkles" size={20} color={colors.accentStrong} />
                                <Text style={styles.aiPanelTitle}>Chọn giọng văn</Text>
                            </View>
                            <Pressable onPress={() => setShowTonePicker(false)}>
                                <Ionicons name="close" size={22} color={colors.textMuted} />
                            </Pressable>
                        </View>
                        {([
                            ["formal", "Lịch sự"],
                            ["casual", "Thân thiện"],
                            ["funny", "Hài hước"],
                            ["professional", "Chuyên nghiệp"],
                        ] as Array<[AiTone, string]>).map(([tone, label]) => (
                            <Pressable key={tone} style={styles.aiMenuItem} onPress={() => { setShowTonePicker(false); handleToneAdjust(tone); }}>
                                <Ionicons name="create-outline" size={20} color={colors.accentStrong} />
                                <Text style={styles.aiMenuItemText}>{label}</Text>
                            </Pressable>
                        ))}
                    </Pressable>
                </Pressable>
            </Modal>

            <Modal visible={showAiPanel} animationType="slide" transparent onRequestClose={() => setShowAiPanel(false)}>
                <View style={styles.aiPanelOverlay}>
                    <View style={styles.aiPanel}>
                        <View style={styles.aiPanelHeader}>
                            <View style={styles.aiPanelTitleRow}>
                                <Ionicons name="sparkles" size={20} color={colors.accentStrong} />
                                <Text style={styles.aiPanelTitle}>Trợ lý AI</Text>
                            </View>
                            <Pressable onPress={() => setShowAiPanel(false)}>
                                <Ionicons name="close" size={24} color={colors.text} />
                            </Pressable>
                        </View>

                        <View style={styles.aiPanelTabs}>
                            {(["summary", "search", "tasks"] as AiPanelMode[]).map((mode) => (
                                <Pressable
                                    key={mode}
                                    style={[styles.aiPanelTab, aiPanelMode === mode && styles.aiPanelTabActive]}
                                    onPress={() => {
                                        setAiPanelMode(mode);
                                        if (mode !== "search") openAiPanel(mode);
                                    }}
                                >
                                    <Text style={[styles.aiPanelTabText, aiPanelMode === mode && styles.aiPanelTabTextActive]}>
                                        {mode === "summary" ? "Tóm tắt" : mode === "search" ? "Tìm AI" : "Công việc"}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>

                        {aiPanelMode === "search" && (
                            <View style={styles.aiSearchBox}>
                                <TextInput
                                    value={aiSearchQuery}
                                    onChangeText={setAiSearchQuery}
                                    placeholder="Hỏi AI trong cuộc trò chuyện..."
                                    placeholderTextColor={colors.textMuted}
                                    style={styles.aiSearchInput}
                                />
                                <Pressable style={styles.aiSearchButton} onPress={() => openAiPanel("search")} disabled={aiLoading}>
                                    {aiLoading ? <ActivityIndicator size="small" color={colors.textOnAccent} /> : <Ionicons name="search" size={18} color={colors.textOnAccent} />}
                                </Pressable>
                            </View>
                        )}

                        {aiLoading && aiPanelMode !== "search" ? (
                            <View style={styles.aiPanelLoading}>
                                <ActivityIndicator color={colors.accentStrong} />
                                <Text style={styles.aiPanelMuted}>AI đang xử lý...</Text>
                            </View>
                        ) : (
                            <ScrollView contentContainerStyle={styles.aiPanelBody}>
                                {aiPanelMode === "summary" && (
                                    (aiSummary?.summary || []).length > 0
                                        ? aiSummary?.summary.map((item, index) => (
                                            <View key={`${item}-${index}`} style={styles.aiResultCard}>
                                                <Text style={styles.aiPanelText}>- {item}</Text>
                                            </View>
                                        ))
                                        : <Text style={styles.aiPanelMuted}>Chưa có tóm tắt.</Text>
                                )}
                                {aiPanelMode === "search" && (
                                    aiLoading
                                        ? <ActivityIndicator color={colors.accentStrong} />
                                        : <Text style={aiSearchResult ? styles.aiPanelText : styles.aiPanelMuted}>
                                            {aiSearchResult?.answer || "Nhập câu hỏi để tìm bằng AI."}
                                        </Text>
                                )}
                                {aiPanelMode === "tasks" && (
                                    (aiTasks?.tasks || []).length > 0
                                        ? aiTasks?.tasks.map((task, index) => (
                                            <View key={`${task.description}-${index}`} style={styles.aiResultCard}>
                                                <Text style={styles.aiPanelText}>{task.description}</Text>
                                                <Text style={styles.aiPanelMuted}>{[task.assignee, task.deadline, task.status].filter(Boolean).join(" - ")}</Text>
                                            </View>
                                        ))
                                        : <Text style={styles.aiPanelMuted}>Chưa tìm thấy công việc nào.</Text>
                                )}
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>
            <Modal
                transparent
                visible={!!actionMenuMessage}
                animationType="fade"
                onRequestClose={closeActionMenu}
            >
                <Pressable style={styles.contextOverlay} onPress={closeActionMenu}>
                    <View style={styles.contextMenu}>
                        <View style={styles.contextHeader}>
                            <Text style={styles.contextTitle} numberOfLines={1}>
                                {actionMenuMessage?.text?.trim() || "[Media]"}
                            </Text>
                        </View>

                        {actionMenuButtons
                            .filter((button) => button.style !== "cancel")
                            .map((button) => (
                                <Pressable
                                    key={button.text}
                                    style={styles.contextItem}
                                    onPress={() => {
                                        closeActionMenu();
                                        button.onPress();
                                    }}
                                >
                                    <Ionicons
                                        name={getActionIconName(button.text)}
                                        size={20}
                                        color={button.style === "destructive" ? colors.danger : colors.accent}
                                    />
                                    <Text
                                        style={[
                                            styles.contextItemText,
                                            button.style === "destructive" && { color: colors.danger },
                                        ]}
                                    >
                                        {button.text}
                                    </Text>
                                </Pressable>
                            ))}

                        <Pressable style={[styles.contextItem, styles.contextCancel]} onPress={closeActionMenu}>
                            <Text style={[styles.contextItemText, { color: colors.textMuted, textAlign: "center" }]}>Hủy</Text>
                        </Pressable>
                    </View>
                </Pressable>
            </Modal>

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

            <ContactPickerSheet
                visible={showContactPicker}
                currentUserId={currentUserId}
                sentUserIds={profileCardSentUserIds}
                sendingUserId={profileCardSendingUserId}
                onDismiss={() => setShowContactPicker(false)}
                onSend={handleSendProfileCard}
            />

            <CreatePollModal
                visible={showCreatePollModal}
                isSubmitting={isCreatingPoll}
                onDismiss={() => setShowCreatePollModal(false)}
                onSubmit={handleCreatePoll}
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
        backgroundColor: "transparent",
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
        borderBottomColor: colors.overlayWhite10,
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
    pollWidgetRow: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 6,
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
        minWidth: 76,
        borderRadius: 18,
        paddingHorizontal: 14,
        paddingVertical: 10,
        paddingBottom: 18,
        marginBottom: 10,
        position: "relative",
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
    reactionRow: {
        position: "absolute",
        left: 0,
        bottom: -12,
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 4,
        zIndex: 5,
        elevation: 5,
    },
    reactionRowOwn: {
        justifyContent: "flex-start",
    },
    reactionRowOther: {
        justifyContent: "flex-start",
    },
    reactionPill: {
        minHeight: 22,
        paddingHorizontal: 8,
        borderRadius: 11,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: "center",
        justifyContent: "center",
    },
    reactionPillSelected: {
        backgroundColor: "rgba(79,140,255,0.28)",
    },
    reactionText: {
        color: colors.text,
        fontSize: 12,
        fontWeight: "700",
    },
    forwardedLabelRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        marginBottom: 6,
    },
    forwardedLabelText: {
        color: colors.textMuted,
        fontSize: 11,
        fontWeight: "700",
    },
    forwardedLabelTextOwn: {
        color: colors.overlayWhite75,
    },
    mediaReactionWrap: {
        marginBottom: 10,
        minWidth: 76,
        position: "relative",
    },
    quickHeartButton: {
        position: "absolute",
        bottom: -10,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: "center",
        justifyContent: "center",
    },
    quickHeartButtonOwn: {
        right: -8,
    },
    quickHeartButtonOther: {
        right: -8,
    },
    quickHeartButtonText: {
        fontSize: 14,
        opacity: 0.85,
    },
    quickHeartButtonTextSelected: {
        opacity: 1,
    },
    quickReactionBar: {
        position: "absolute",
        bottom: "100%",
        flexDirection: "row",
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: 18,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
        zIndex: 10,
        elevation: 10,
    },
    quickReactionBarOwn: {
        right: 0,
    },
    quickReactionBarOther: {
        left: 0,
    },
    quickReactionOption: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
    },
    quickReactionOptionSelected: {
        backgroundColor: "rgba(79,140,255,0.28)",
    },
    quickReactionDeleteOption: {
        backgroundColor: "rgba(239,68,68,0.16)",
    },
    quickReactionText: {
        fontSize: 17,
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
        backgroundColor: colors.surfaceTransparent,
        borderTopWidth: 1,
        borderTopColor: colors.overlayWhite10,
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
        backgroundColor: colors.inputBgTransparent,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: colors.overlayWhite10,
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
    aiUndoBar: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 14,
        paddingVertical: 8,
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    aiUndoText: {
        color: colors.textMuted,
        fontSize: 12,
    },
    aiUndoAction: {
        color: colors.accentStrong,
        fontSize: 12,
        fontWeight: "700",
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
        backgroundColor: colors.inputBgTransparent,
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
    aiPanelOverlay: {
        flex: 1,
        justifyContent: "flex-end",
        backgroundColor: "rgba(0, 0, 0, 0.5)",
    },
    aiMenuOverlay: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
    },
    aiMenuCard: {
        width: "100%",
        maxWidth: 380,
        gap: 8,
        padding: 16,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.background,
    },
    aiMenuHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 4,
    },
    aiMenuItem: {
        minHeight: 48,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
    },
    aiMenuItemText: {
        flex: 1,
        color: colors.text,
        fontSize: 14,
        fontWeight: "700",
    },
    muteDialogOverlay: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
    },
    muteDialogCard: {
        width: "100%",
        maxWidth: 420,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.background,
    },
    muteDialogHeader: {
        minHeight: 56,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    muteDialogTitle: {
        color: colors.text,
        fontSize: 18,
        fontWeight: "800",
    },
    muteDialogCloseButton: {
        width: 36,
        height: 36,
        alignItems: "center",
        justifyContent: "center",
    },
    muteDialogMessage: {
        paddingHorizontal: 16,
        paddingTop: 18,
        paddingBottom: 10,
        color: colors.text,
        fontSize: 14,
        lineHeight: 20,
    },
    muteOptionList: {
        paddingHorizontal: 16,
        gap: 12,
    },
    muteOptionRow: {
        minHeight: 24,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    muteOptionText: {
        color: colors.text,
        fontSize: 15,
        fontWeight: "600",
    },
    muteDialogActions: {
        flexDirection: "row",
        justifyContent: "flex-end",
        gap: 14,
        padding: 16,
        paddingTop: 24,
    },
    muteCancelButton: {
        minWidth: 64,
        minHeight: 40,
        paddingHorizontal: 16,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 4,
        backgroundColor: colors.surface,
    },
    muteCancelText: {
        color: colors.text,
        fontSize: 15,
        fontWeight: "800",
    },
    muteConfirmButton: {
        minWidth: 86,
        minHeight: 40,
        paddingHorizontal: 18,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 4,
        backgroundColor: colors.accentStrong,
    },
    muteConfirmText: {
        color: colors.textOnAccent,
        fontSize: 15,
        fontWeight: "800",
    },
    aiPanel: {
        maxHeight: "78%",
        backgroundColor: colors.background,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 16,
    },
    aiPanelHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 12,
    },
    aiPanelTitleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    aiPanelTitle: {
        color: colors.text,
        fontSize: 18,
        fontWeight: "800",
    },
    aiPanelTabs: {
        flexDirection: "row",
        gap: 8,
        marginBottom: 12,
    },
    aiPanelTab: {
        flex: 1,
        alignItems: "center",
        paddingVertical: 9,
        borderRadius: 12,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
    },
    aiPanelTabActive: {
        borderColor: colors.accentStrong,
        backgroundColor: "rgba(63,140,255,0.2)",
    },
    aiPanelTabText: {
        color: colors.textMuted,
        fontSize: 12,
        fontWeight: "700",
    },
    aiPanelTabTextActive: {
        color: colors.text,
    },
    aiSearchBox: {
        flexDirection: "row",
        gap: 8,
        alignItems: "center",
        marginBottom: 12,
    },
    aiSearchInput: {
        flex: 1,
        minHeight: 42,
        borderRadius: 14,
        paddingHorizontal: 12,
        color: colors.text,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
    },
    aiSearchButton: {
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.accentStrong,
    },
    aiPanelBody: {
        gap: 10,
        paddingBottom: 12,
    },
    aiPanelLoading: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 32,
        gap: 10,
    },
    aiPanelText: {
        color: colors.text,
        fontSize: 14,
        lineHeight: 20,
    },
    aiPanelMuted: {
        color: colors.textMuted,
        fontSize: 13,
        lineHeight: 18,
    },
    aiResultCard: {
        padding: 12,
        gap: 6,
        borderRadius: 12,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
    },
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

