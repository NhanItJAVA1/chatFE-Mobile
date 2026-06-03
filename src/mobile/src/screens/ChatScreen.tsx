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
  StatusBar,
  Alert,
  Modal,
  Dimensions,
  ImageBackground,
} from "react-native";
import { Audio } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { useChatMessage } from "../../../shared/hooks/useChat";
import { useDraft } from "../../../shared/hooks/useDraft";
import { useAuth } from "../../../shared/hooks";
import { useCall } from "../../../shared/context";
import {
  Avatar,
  ForwardDialog,
  PinnedMessageHeader,
  ReplyPreview,
  QuotedMessageBlock,
  HighlightableMessage,
  AnimatedEmojiMessage,
  JUMBO_EMOJI_ASSETS,
  ProfileCardMessage,
  ContactPickerSheet,
  ShareProfileCardSheet,
} from "../components";
import { colors, assets } from "../theme";
import { buildMessageActionSheetOptions, type MessageActionButton } from "../../../shared/utils";
import MediaMessage from "../components/MediaMessage";
import { SystemMessageBubble } from "../components/SystemMessageBubble";
import chatMediaService from "../../../shared/services/chatMediaService";
import {
  aiService,
  type AiExtractTasksResponse,
  type AiSmartSearchResponse,
  type AiSummarizeResponse,
  type AiTone,
  type AiTranslateResponse,
} from "../../../shared/services/aiService";
import { ConversationService, type MuteConversationOptions } from "../../../shared/services/conversationService";
import { checkFriendshipStatus, sendFriendRequest, unfriend } from "../../../shared/services/friendService";
import { FriendSocketService, type FriendshipNotification } from "../../../shared/services/friendSocket";
import { BlockService } from "../../../shared/services/blockService";
import profileCardService from "../../../shared/services/profileCardService";
import type { ChatScreenProps, MessageMedia } from "@/types";
import type { MessagePayload } from "../../../shared/services/socketService";

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

/**
 * Message Bubble Component
 */
const MessageBubble: React.FC<{
  message: MessagePayload;
  isOwn: boolean;
  currentUserId?: string;
  onLongPress?: () => void;
  onPressQuoted?: (quotedMessageId: string) => void;
  onToggleReaction?: (emoji: string, selected: boolean) => void;
  onClearMyReactions?: () => void;
  onProfileCardPress?: (user: any) => void;
  isHighlighted?: boolean;
  messageMap?: Record<string, MessagePayload | undefined>;
  translation?: AiTranslateResponse;
  isTranslating?: boolean;
}> = ({ message, isOwn, currentUserId, onLongPress, onPressQuoted, isHighlighted, messageMap, onToggleReaction, onClearMyReactions, onProfileCardPress, translation, isTranslating }) => {
  const [showReactionPicker, setShowReactionPicker] = React.useState(false);
  const formatTime = (date: string) => {
    const d = new Date(date);
    return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "sending":
        return "Đang gửi";
      case "failed":
        return "Lỗi";
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

  // Resolve quoted message: use existing quotedMessage OR lookup by quotedMessageId
  const resolvedQuotedMessage =
    message.quotedMessage || (message.quotedMessageId && messageMap[message.quotedMessageId]) || null;

  // Check if message has media
  const hasMedia = message.media && message.media.length > 0;
  const trimmedText = String(message.text || "").trim();
  const compactText = String(message.text || "").replace(/\s+/g, "");
  const hasText = trimmedText.length > 0;
  const isJumboEmojiOnly = !!JUMBO_EMOJI_ASSETS[trimmedText] && compactText === trimmedText;
  const isProfileCard = String(message.type || message.messageType || "").toLowerCase() === "profile_card";
  const isForwarded = Boolean(
    (message as any).isForwarded ||
    (message as any).forwarded ||
    (message as any).forwardedFrom ||
    (message as any).forwardedFromMessageId ||
    (message as any).originalMessageId ||
    (message as any).sourceMessageId
  );
  const reactionGroups = Object.values(
    (message.reactions || []).reduce<Record<string, { emoji: string; count: number; selected: boolean }>>((acc, reaction: any) => {
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
  const myLastReaction = [...(message.reactions || [])]
    .reverse()
    .find((reaction: any) => reaction?.emoji && currentUserId && reaction.userId === currentUserId);
  const defaultReactionEmoji = myLastReaction?.emoji || "❤️";
  const hasDefaultReaction = !!myLastReaction;
  const renderReactionPicker = () => (
    <View style={[styles.quickReactionBar, isOwn ? styles.quickReactionBarOwn : styles.quickReactionBarOther]}>
      {QUICK_REACTIONS.map((emoji) => {
        const selected = (message.reactions || []).some(
          (reaction: any) => reaction?.emoji === emoji && currentUserId && reaction.userId === currentUserId,
        );
        return (
          <Pressable
            key={emoji}
            style={[styles.quickReactionOption, selected && styles.quickReactionOptionSelected]}
            onPress={() => {
              setShowReactionPicker(false);
              onToggleReaction?.(emoji, false);
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
            setShowReactionPicker(false);
            onClearMyReactions?.();
          }}
        >
          <Ionicons name="close" size={17} color={colors.danger} />
        </Pressable>
      )}
    </View>
  );

  React.useEffect(() => {
    if (hasMedia) { }
  }, [hasMedia, message.media]);

  return (
    <HighlightableMessage
      onLongPress={onLongPress}
      delayLongPress={300}
      isHighlighted={!!isHighlighted}
      style={[
        styles.bubbleRow,
        isOwn ? styles.outgoingRow : styles.incomingRow,
        isHighlighted && styles.messageHighlighted,
      ]}
    >
      {isProfileCard && (
        <ProfileCardMessage
          user={message.profileCard}
          userId={message.profileCardUserId}
          isOwn={isOwn}
          onMessagePress={onProfileCardPress}
          onViewProfilePress={onProfileCardPress}
        />
      )}

      {/* Media display */}
      {!isProfileCard && hasMedia && (
        <View style={[styles.mediaContainer, !hasText && styles.mediaReactionWrap]}>
          {!hasText && isForwarded && (
            <View style={styles.forwardedLabelRow}>
              <Ionicons name="arrow-redo-outline" size={12} color={colors.textMuted} />
              <Text style={styles.forwardedLabelText}>Chuyển tiếp</Text>
            </View>
          )}
          {!hasText && showReactionPicker && renderReactionPicker()}
          {message.media.map((m: any, idx: number) => (
            <MediaMessage
              key={idx}
              media={m as MessageMedia}
              isSender={isOwn}
              layoutMode={hasText ? "compact" : "standalone"}
            />
          ))}
          {!hasText && reactionGroups.length > 0 && (
            <View style={[styles.reactionRow, isOwn ? styles.reactionRowOwn : styles.reactionRowOther]}>
              <Pressable
                style={[styles.reactionPill, reactionSummary.selected && styles.reactionPillSelected]}
                onPress={() => onToggleReaction?.(defaultReactionEmoji, false)}
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
              onPress={() => onToggleReaction?.(defaultReactionEmoji, false)}
              onLongPress={() => setShowReactionPicker((value) => !value)}
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

      {!isProfileCard && !hasMedia && isJumboEmojiOnly && (
        <View style={styles.jumboEmojiWrap}>
          {showReactionPicker && renderReactionPicker()}
          <AnimatedEmojiMessage
            emoji={trimmedText}
            isNew={message.createdAt ? new Date().getTime() - new Date(message.createdAt).getTime() < 5000 : false}
            isMine={isOwn}
          />
          <View style={[styles.jumboEmojiTimePill, isOwn ? styles.jumboEmojiTimePillOwn : styles.jumboEmojiTimePillOther]}>
            <Text style={styles.bubbleTime}>{formatTime(message.createdAt)}</Text>
            {isOwn && (
              <Text style={[
                styles.bubbleTime,
                message.status === "seen" && styles.seenStatus,
                message.status === "sending" && styles.sendingStatus,
                message.status === "failed" && styles.failedStatus,
              ]}>
                {getStatusIcon(message.status)}
              </Text>
            )}
          </View>
          {reactionGroups.length > 0 && (
            <View style={[styles.reactionRow, isOwn ? styles.reactionRowOwn : styles.reactionRowOther]}>
              <Pressable
                style={[styles.reactionPill, reactionSummary.selected && styles.reactionPillSelected]}
                onPress={() => onToggleReaction?.(defaultReactionEmoji, false)}
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
            onPress={() => onToggleReaction?.(defaultReactionEmoji, false)}
            onLongPress={() => setShowReactionPicker((value) => !value)}
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

      {/* Text bubble */}
      {!isProfileCard && hasText && !isJumboEmojiOnly && (
        <View style={[styles.bubble, isOwn ? styles.outgoingBubble : styles.incomingBubble]}>
          {isForwarded && (
            <View style={styles.forwardedLabelRow}>
              <Ionicons name="arrow-redo-outline" size={12} color={isOwn ? colors.overlayWhite75 : colors.textMuted} />
              <Text style={[styles.forwardedLabelText, isOwn && styles.forwardedLabelTextOwn]}>Chuyển tiếp</Text>
            </View>
          )}
          {showReactionPicker && renderReactionPicker()}
          {/* Quoted message block if this is a reply */}
          {(() => {
            const hasQuoted = resolvedQuotedMessage || message.quotedMessageId;
            return resolvedQuotedMessage ? (
              <QuotedMessageBlock
                quotedMessage={resolvedQuotedMessage}
                isOwn={isOwn}
                onPress={() => message.quotedMessageId && onPressQuoted?.(message.quotedMessageId)}
              />
            ) : null;
          })()}
          {(() => {
            return (
              <Text style={[styles.bubbleText, !isOwn && styles.incomingText]} selectable>
                {trimmedText}
              </Text>
            );
          })()}
          <View style={styles.bubbleMetaRow}>
            <Text style={[styles.bubbleTime]}>{formatTime(message.createdAt)}</Text>
            {isOwn && (
              <Text style={[
                styles.bubbleTime,
                message.status === "seen" && styles.seenStatus,
                message.status === "sending" && styles.sendingStatus,
                message.status === "failed" && styles.failedStatus,
              ]}>
                {getStatusIcon(message.status)}
              </Text>
            )}
          </View>
          {isTranslating ? (
            <View style={styles.aiTranslationBox}>
              <ActivityIndicator size="small" color={colors.accentStrong} />
              <Text style={styles.aiTranslationLabel}>Dang dich...</Text>
            </View>
          ) : translation ? (
            <View style={styles.aiTranslationBox}>
              <Text style={styles.aiTranslationLabel}>Da dich tu {translation.sourceLang}</Text>
              <Text style={styles.aiTranslationText}>{translation.translated}</Text>
            </View>
          ) : null}
          {reactionGroups.length > 0 && (
            <View style={[styles.reactionRow, isOwn ? styles.reactionRowOwn : styles.reactionRowOther]}>
              <Pressable
                style={[styles.reactionPill, reactionSummary.selected && styles.reactionPillSelected]}
                onPress={() => onToggleReaction?.(defaultReactionEmoji, false)}
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
            onPress={() => onToggleReaction?.(defaultReactionEmoji, false)}
            onLongPress={() => setShowReactionPicker((value) => !value)}
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
    </HighlightableMessage>
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

type AiPanelMode = "summary" | "search" | "tasks";
const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "😡"];

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
    (firstMedia.mediaType === "image" || firstMedia.mimetype?.startsWith("image/") || message.type === "image"),
  );
};

const groupMessagesForGallery = (messages: MessagePayload[], currentUserId: string): RenderableChatItem[] => {
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
          Math.abs(getMessageCreatedAtMs(nextMessage) - getMessageCreatedAtMs(previousMessage)) >
          GALLERY_GROUP_WINDOW_MS
        ) {
          break;
        }

        consecutiveImages.push(nextMessage);
        nextIndex += 1;
      }

      if (consecutiveImages.length >= 2) {
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
      case "sending":
        return "Đang gửi";
      case "failed":
        return "Lỗi";
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
      style={[styles.bubbleRow, isOwn ? styles.outgoingRow : styles.incomingRow]}
    >
      <View style={[styles.bubble, isOwn ? styles.outgoingBubble : styles.incomingBubble, styles.galleryBubble]}>
        <View style={styles.galleryGrid}>
          {galleryImages.map((mediaMessage, index) => (
            <Pressable
              key={getMessageKey(mediaMessage)}
              style={styles.galleryTileWrap}
              onPress={() => onImagePress?.(messages, index)}
            >
              <Image source={{ uri: mediaMessage.media?.[0]?.url }} style={styles.galleryTileImage} />
              {index === galleryImages.length - 1 && extraCount > 0 && (
                <View style={styles.galleryOverlay}>
                  <Text style={styles.galleryOverlayText}>+{extraCount}</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>

        {captionText ? (
          <Text
            style={[
              styles.galleryCaptionText,
              isOwn ? styles.outgoingGalleryCaptionText : styles.incomingGalleryCaptionText,
            ]}
          >
            {captionText}
          </Text>
        ) : null}

        <View style={styles.bubbleMetaRow}>
          <Text style={styles.bubbleTime}>{formatTime(lastMessage.createdAt)}</Text>
          {isOwn && (
            <Text style={[
              styles.bubbleTime,
              lastMessage.status === "seen" && styles.seenStatus,
              lastMessage.status === "sending" && styles.sendingStatus,
              lastMessage.status === "failed" && styles.failedStatus,
            ]}>
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
const TypingIndicator: React.FC<{ typingUsers: Set<string> }> = ({ typingUsers }) => {
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
  onOpenPrivateChat,
  onConversationReady,
  aiSmartReplyEnabled = false,
}: ChatScreenProps & { aiSmartReplyEnabled?: boolean }) => {
  const authContext = useAuth();
  const callContext = useCall();
  const currentUser = authContext.user;
  const token = authContext.token;
  const [showMediaMenu, setShowMediaMenu] = React.useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = React.useState(false);
  const [showForwardDialog, setShowForwardDialog] = React.useState(false);
  const [showContactPicker, setShowContactPicker] = React.useState(false);
  const [showShareProfileSheet, setShowShareProfileSheet] = React.useState(false);
  const [profileCardSendingUserId, setProfileCardSendingUserId] = React.useState<string | null>(null);
  const [profileCardSentUserIds, setProfileCardSentUserIds] = React.useState<Set<string>>(new Set());
  const [forwardMessageIds, setForwardMessageIds] = React.useState<string[]>([]);
  const [draftMedia, setDraftMedia] = React.useState<DraftMediaAsset[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [isRecordingAudio, setIsRecordingAudio] = React.useState(false);
  const [isCancelingAudio, setIsCancelingAudio] = React.useState(false);
  const [recordingSeconds, setRecordingSeconds] = React.useState(0);
  const [selectedMessageId, setSelectedMessageId] = React.useState<string | null>(null);
  const [actionMenuMessage, setActionMenuMessage] = React.useState<MessagePayload | null>(null);
  const [actionMenuButtons, setActionMenuButtons] = React.useState<MessageActionButton[]>([]);
  const [showEditDialog, setShowEditDialog] = React.useState(false);
  const [editText, setEditText] = React.useState("");
  const [viewingGalleryMessages, setViewingGalleryMessages] = React.useState<MessagePayload[] | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = React.useState(0);
  const [allViewerImages, setAllViewerImages] = React.useState<Array<{ uri: string; key: string }>>([]);
  const [showAvatarMenu, setShowAvatarMenu] = React.useState(false);
  const [unfriending, setUnfriending] = React.useState(false);
  const [showAiQuickMenu, setShowAiQuickMenu] = React.useState(false);
  const [showTonePicker, setShowTonePicker] = React.useState(false);
  const [showAiPanel, setShowAiPanel] = React.useState(false);
  const [aiPanelMode, setAiPanelMode] = React.useState<AiPanelMode>("summary");
  const [aiLoading, setAiLoading] = React.useState(false);
  const [aiSummary, setAiSummary] = React.useState<AiSummarizeResponse | null>(null);
  const [aiSearchQuery, setAiSearchQuery] = React.useState("");
  const [aiSearchResult, setAiSearchResult] = React.useState<AiSmartSearchResponse | null>(null);
  const [aiTasks, setAiTasks] = React.useState<AiExtractTasksResponse | null>(null);
  const [smartReplies, setSmartReplies] = React.useState<string[]>([]);
  const [smartReplyHiddenFor, setSmartReplyHiddenFor] = React.useState<string | null>(null);
  const [toneLoading, setToneLoading] = React.useState<AiTone | null>(null);
  const [previousDraft, setPreviousDraft] = React.useState<string | null>(null);
  const [translatedMessages, setTranslatedMessages] = React.useState<Record<string, AiTranslateResponse>>({});
  const [translatingMessageId, setTranslatingMessageId] = React.useState<string | null>(null);
  const [showMuteDialog, setShowMuteDialog] = React.useState(false);
  const [selectedMuteOption, setSelectedMuteOption] = React.useState<MuteOptionKey>("1h");
  const [muteLoading, setMuteLoading] = React.useState(false);
  const [localMuteUntil, setLocalMuteUntil] = React.useState<string | null>(null);
  const [friendActionLoading, setFriendActionLoading] = React.useState(false);
  const [isFriend, setIsFriend] = React.useState(false);
  const [friendshipStatus, setFriendshipStatus] = React.useState<string>("none");
  const [isBlockedByMe, setIsBlockedByMe] = React.useState(false);
  const [blockLoading, setBlockLoading] = React.useState(false);
  const imageViewerScrollRef = useRef<FlatList>(null);
  const actionsRef = useRef<any>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelAudioRef = useRef(false);
  const recordingStartPromiseRef = useRef<Promise<void> | null>(null);

  const friendId = chatUser?.id;
  const isSelfChat = chatUser?.isSelfChat || chatUser?.relationship === "self";
  const currentUserId = currentUser?.id || (currentUser as any)?._id || "";

  const { state, actions, flatListRef, highlightedMessageId } = useChatMessage(friendId || "", token || "");
  const conversationId = state.conversation?._id || state.conversation?.id || chatUser?.conversationId || "";
  const { draftText: messageText, setDraftText: setMessageText, clearDraft } = useDraft(conversationId);

  useEffect(() => {
    if (conversationId && state.conversation) {
      onConversationReady?.(conversationId);
    }
  }, [conversationId, onConversationReady, state.conversation]);

  useEffect(() => {
    if (!friendId || !token || isSelfChat) {
      setIsBlockedByMe(false);
      return;
    }

    let mounted = true;
    BlockService.checkBlockStatus(friendId)
      .then((status) => {
        if (mounted) setIsBlockedByMe(status.isBlocked);
      })
      .catch(() => { });

    BlockService.connect(token);
    BlockService.onUnblocked((data: any) => {
      const unblockedBy = String(data?.data?.unblockedBy || data?.unblockedBy || "");
      if (unblockedBy === friendId) {
        setIsBlockedByMe(false);
      }
    });

    return () => {
      mounted = false;
      BlockService.offBlockEvents();
    };
  }, [friendId, token, isSelfChat]);

  useEffect(() => {
    if (!friendId || isSelfChat) {
      setIsFriend(false);
      setFriendshipStatus("none");
      return;
    }

    if (isBlockedByMe) {
      setIsFriend(false);
      setFriendshipStatus("none");
      return;
    }

    let mounted = true;
    const initialRelationship = String(chatUser?.relationship || "").toLowerCase();
    if (initialRelationship === "friend" || initialRelationship === "friends") {
      setIsFriend(true);
      setFriendshipStatus("accepted");
    }

    checkFriendshipStatus(friendId)
      .then((status) => {
        if (!mounted) return;
        const nextStatus = String(status.status || "none").toLowerCase();
        setFriendshipStatus(nextStatus);
        setIsFriend(Boolean(status.isFriend || nextStatus === "accepted"));
      })
      .catch((error) => {
        if (!mounted) return;
        console.warn("[ChatScreen] Failed to check friendship status:", error?.message || error);
        if (isBlockedByMe) {
          setIsFriend(false);
          setFriendshipStatus("none");
        }
      });

    return () => {
      mounted = false;
    };
  }, [friendId, isSelfChat, chatUser?.relationship, isBlockedByMe]);

  // Keep actions ref in sync
  React.useEffect(() => {
    actionsRef.current = actions;
  }, [actions]);

  // Debug: Log modal visibility changes
  React.useEffect(() => { }, [showMediaMenu]);

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
        Alert.alert("Kết nối bị hủy", `${truncateName(chatUser?.name || "Người dùng")} đã hủy kết bạn với bạn.`, [
          {
            text: "Quay lại",
            onPress: () => {
              onBackPress?.();
            },
          },
        ]);
      }
    };

    FriendSocketService.onFriendshipUnfriended(handleUnfriended);

    return () => {
      FriendSocketService.offFriendshipUnfriended();
    };
  }, [friendId, chatUser?.name, onBackPress]);

  const { conversation, messages, isLoading, isLoadingMore, isSending, error, typingUsers, hasMoreMessages } = state;
  const conversationMuteUntil =
    localMuteUntil ||
    (conversation as any)?.muteUntil ||
    (conversation as any)?.member?.muteUntil ||
    (chatUser as any)?.muteUntil ||
    null;
  const isConversationMuted = isMuteUntilActive(conversationMuteUntil);
  const latestMessage = messages[0];
  const latestMessageKey = latestMessage ? getMessageKey(latestMessage) : "";
  const shouldShowSmartReplies =
    aiSmartReplyEnabled &&
    !!conversationId &&
    !messageText.trim() &&
    !!latestMessage?.text &&
    latestMessage.senderId !== currentUserId &&
    smartReplyHiddenFor !== latestMessageKey;
  const isBlockedChatError = String(error || "").toLowerCase().includes("blocked") || isBlockedByMe;

  React.useEffect(() => {
    if (!isSelfChat && String(error || "").toLowerCase().includes("blocked")) {
      setIsBlockedByMe(true);
    }
  }, [error, isSelfChat]);

  const searchTargetHandledRef = useRef<string | null>(null);

  const normalizeSearchMessage = useCallback((raw: any): MessagePayload | null => {
    if (!raw) return null;
    const id = raw._id || raw.id || raw.messageId;
    if (!id || !conversationId) return null;

    return {
      ...raw,
      _id: String(id),
      id: String(id),
      conversationId: raw.conversationId || conversationId,
      senderId: raw.senderId || "",
      senderName: raw.senderName || "Người dùng",
      senderAvatar: raw.senderAvatar || "",
      text: raw.text || "",
      media: raw.media || [],
      status: raw.status || "sent",
      createdAt: raw.createdAt || new Date().toISOString(),
      updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString(),
    } as MessagePayload;
  }, [conversationId]);

  useEffect(() => {
    const targetId = String(chatUser?.searchTargetMessageId || "");
    if (!targetId || isLoading || !conversationId || searchTargetHandledRef.current === targetId) return;

    searchTargetHandledRef.current = targetId;
    const extraMessages = [
      normalizeSearchMessage(chatUser?.searchTargetMessage),
      ...(Array.isArray(chatUser?.searchContextMessages) ? chatUser.searchContextMessages.map(normalizeSearchMessage) : []),
    ].filter(Boolean) as MessagePayload[];

    if (extraMessages.length > 0) {
      actions.addMessages(extraMessages);
    }

    setTimeout(() => {
      actions.scrollToMessage(targetId).then((success) => {
        if (!success) {
          Alert.alert("Thông báo", "Không tìm thấy tin nhắn trong cuộc trò chuyện");
        }
      });
    }, 250);
  }, [chatUser?.searchTargetMessageId, chatUser?.searchTargetMessage, chatUser?.searchContextMessages, isLoading, conversationId, actions, normalizeSearchMessage]);

  const renderableMessages = useMemo(
    () => groupMessagesForGallery(messages, currentUser?.id || currentUserId),
    [messages, currentUser?.id, currentUserId],
  );

  // Create lookup map for quoted messages
  const messageMap = useMemo(() => {
    const map: Record<string, MessagePayload | undefined> = {};
    messages.forEach((msg) => {
      const msgId = msg._id || msg.id;
      if (msgId) {
        map[msgId] = msg;
      }
    }); return map;
  }, [messages]);

  useEffect(() => {
    let isActive = true;

    const loadSmartReplies = async () => {
      if (!aiSmartReplyEnabled || !shouldShowSmartReplies) {
        setSmartReplies([]);
        return;
      }

      try {
        const result = await aiService.smartReply(conversationId);
        if (isActive) {
          setSmartReplies(result.replies || []);
        }
      } catch (err) {
        if (isActive) {
          setSmartReplies([]);
        }
      }
    };

    loadSmartReplies();

    return () => {
      isActive = false;
    };
  }, [aiSmartReplyEnabled, conversationId, latestMessageKey, shouldShowSmartReplies]);

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
  const getAllUserImages = useCallback(
    (senderId: string, firstGalleryMessages: MessagePayload[]) => {
      // Find all messages from this sender that have images
      const userMessagesWithImages = messages.filter(
        (msg) => msg.senderId === senderId && msg.media && msg.media.length > 0,
      );

      // Flatten all images
      const allImages = userMessagesWithImages.flatMap(
        (msg) =>
          msg.media?.map((m, idx) => ({
            uri: m.url,
            key: `${getMessageKey(msg)}-${idx}`,
            msgId: getMessageKey(msg),
          })) || [],
      );

      // Find the starting index: look for where the first gallery message's first image is
      const firstGalleryMsgId = getMessageKey(firstGalleryMessages[0]);
      const startingIndex = allImages.findIndex((img) => img.msgId === firstGalleryMsgId);

      return {
        allImages,
        startingIndex: startingIndex >= 0 ? startingIndex : 0,
      };
    },
    [messages],
  );

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

  const handleStartAudioCall = useCallback(() => {
    if (isSelfChat) {
      Alert.alert("Không thể gọi", "My Document là nơi lưu trữ cá nhân nên không hỗ trợ cuộc gọi.");
      return;
    }
    if (!conversationId) {
      Alert.alert("Không thể gọi", "Cuộc trò chuyện chưa sẵn sàng.");
      return;
    }
    void callContext.startCall(conversationId, "audio");
  }, [callContext, conversationId, isSelfChat]);

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

          const result = await chatMediaService.sendImage(conversationId, file, index === 0 ? caption : undefined);

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
    [conversation, draftMedia, clearDraftMedia],
  );

  /**
   * Pick and send image
   */
  const handlePickImage = useCallback(async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert("Permission required", "We need access to your photo library. Please enable it in settings.");
        return;
      } try {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsMultipleSelection: true,
          selectionLimit: 0,
        } as any);
        if (result.canceled) {
          return;
        }

        if (!result.assets || result.assets.length === 0) {
          Alert.alert("Error", "No image selected");
          return;
        }

        const validAssets = result.assets.filter((asset) => asset?.uri && (asset?.type || asset?.mimeType));
        if (validAssets.length === 0) {
          Alert.alert("Error", "Invalid image file");
          return;
        }
        appendDraftMedia(validAssets);
      } catch (pickerError: any) {
        console.error("[ChatScreen] Image picker error:", pickerError);
        console.error("[ChatScreen] Error stack:", pickerError.stack);
        const errorMsg = pickerError.message || "Unknown error";
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
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert("Permission required", "We need access to your photo library. Please enable it in settings.");
        return;
      } try {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["videos"],
        } as any);
        if (result.canceled) {
          return;
        }

        if (!result.assets || result.assets.length === 0) {
          Alert.alert("Error", "No video selected");
          return;
        }

        if (!result.assets[0].uri || !result.assets[0].type) {
          Alert.alert("Error", "Invalid video file");
          return;
        }

        setUploading(true);
        setUploadProgress(0);

        const asset = result.assets[0];
        const uri = asset.uri;
        const name = asset.fileName || uri.split("/").pop() || "video.mp4";
        const type = asset.mimeType || asset.type || "video/mp4";
        const file = {
          uri,
          name,
          type,
          mimeType: type,
          size: asset.fileSize || 0,
          duration: asset.duration,
          width: asset.width,
          height: asset.height,
        }; const sentMessages = await chatMediaService.sendVideo(
          conversation?._id || conversation?.id || "",
          file,
          messageText || undefined,
          (progress) => setUploadProgress(progress),
        );

        if (sentMessages.length > 0 && actionsRef.current?.addMessages) {
          actionsRef.current.addMessages(sentMessages);
        }

        setMessageText("");
        setUploadProgress(0);
      } catch (pickerError: any) {
        console.error("[ChatScreen] Video picker error:", pickerError);
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
      const result = await DocumentPicker.getDocumentAsync({
        type: ["audio/*"],
      });
      // Only close menu if user actually picked something
      setShowMediaMenu(false);

      if (result.canceled) {
        return;
      }

      if (!result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      const audioFile = {
        uri: asset.uri,
        name: asset.name || `audio-${Date.now()}.mp3`,
        type: asset.mimeType || "audio/mpeg",
        mimeType: asset.mimeType || "audio/mpeg",
        size: asset.size || 0,
      }; setUploading(true);
      setUploadProgress(0);

      try {
        const sentMessages = await chatMediaService.sendAudio(conversation?._id || conversation?.id || "", audioFile);
        // Add messages to local state to show realtime
        if (sentMessages.length > 0 && actionsRef.current?.addMessages) {
          actionsRef.current.addMessages(sentMessages);
        }

        setUploading(false);
        setUploadProgress(0);
      } catch (uploadError: any) {
        console.error("[ChatScreen] Failed to send audio file:", uploadError);
        setUploading(false);
        setUploadProgress(0);
        Alert.alert("Error", `Failed to send audio: ${uploadError.message}`);
      }
    } catch (error: any) {
      console.error("[ChatScreen] Error opening audio file picker:", error);
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
          duration: Math.round(
            (status as any)?.durationMillis ? (status as any).durationMillis / 1000 : recordingSeconds,
          ),
        };

        setUploading(true);
        setUploadProgress(0);

        const sentMessages = await chatMediaService.sendAudio(
          conversation?._id || conversation?.id || "",
          file,
          messageText || undefined,
          (progress) => setUploadProgress(progress),
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
    [conversation, messageText, recordingSeconds],
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
    [isRecordingAudio, startAudioRecording, stopAudioRecording],
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
      // Only close menu if operation is complete or canceled
      setShowMediaMenu(false);

      if (result.canceled) {
        return;
      }

      if (!result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      const documentFile = {
        uri: asset.uri,
        name: asset.name || `document-${Date.now()}`,
        type: asset.mimeType || "application/octet-stream",
        mimeType: asset.mimeType || "application/octet-stream",
        size: asset.size || 0,
      }; setUploading(true);
      setUploadProgress(0);

      try {
        const sentMessages = await chatMediaService.sendDocument(
          conversation?._id || conversation?.id || "",
          documentFile,
        );
        // Add messages to local state to show realtime
        if (sentMessages.length > 0 && actionsRef.current?.addMessages) {
          actionsRef.current.addMessages(sentMessages);
        }

        setUploading(false);
        setUploadProgress(0);
      } catch (uploadError: any) {
        console.error("[ChatScreen] Failed to send document:", uploadError);
        setUploading(false);
        setUploadProgress(0);
        Alert.alert("Error", `Failed to send document: ${uploadError.message}`);
      }
    } catch (error: any) {
      console.error("[ChatScreen] Error opening document file picker:", error);
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
      // If replying to a message, send as quoted message
      if (state.replyingTo) {
        const quotedMessageId = state.replyingTo._id || state.replyingTo.id;
        if (quotedMessageId && actionsRef.current.sendQuotedMessage) {
          await actionsRef.current.sendQuotedMessage(quotedMessageId, trimmedText || "", draftMedia);
          await clearDraft();
          return;
        }
      }

      await sendDraftMedia(trimmedText || undefined);
      await clearDraft();
      return;
    }

    if (trimmedText) {
      // If replying to a message, send as quoted message
      let sendPromise: Promise<void>;
      if (state.replyingTo) {
        const quotedMessageId = state.replyingTo._id || state.replyingTo.id;
        if (quotedMessageId && actionsRef.current.sendQuotedMessage) {
          sendPromise = actionsRef.current.sendQuotedMessage(quotedMessageId, trimmedText);
        } else {
          // Fallback to regular send if sendQuotedMessage is not available
          sendPromise = actionsRef.current.sendMessage(trimmedText);
        }
      } else {
        sendPromise = actionsRef.current.sendMessage(trimmedText);
      }
      await clearDraft();
      await sendPromise;
    }
  }, [clearDraft, draftMedia.length, hasSendableContent, messageText, sendDraftMedia, state.replyingTo]);

  /**
   * Handle text input (typing indicator)
   */
  const handleTextChange = useCallback((text: string) => {
    setMessageText(text);
    if (text.trim() && actionsRef.current) {
      actionsRef.current.handleTyping();
    }
  }, []);

  const openAiPanel = useCallback(
    async (mode: AiPanelMode) => {
      if (!conversationId) {
        Alert.alert("AI", "Chưa có cuộc trò chuyện để phân tích.");
        return;
      }

      setAiPanelMode(mode);
      setShowAiPanel(true);
      setAiLoading(true);

      try {
        if (mode === "summary") {
          const result = await aiService.summarize(conversationId, 80);
          setAiSummary(result);
        } else if (mode === "tasks") {
          const result = await aiService.extractTasks(conversationId, 80);
          setAiTasks(result);
        } else if (mode === "search" && aiSearchQuery.trim()) {
          const result = await aiService.smartSearch(aiSearchQuery.trim(), conversationId);
          setAiSearchResult(result);
        }
      } catch (err: any) {
        Alert.alert("AI", err?.message || "Không thể gọi AI lúc này.");
      } finally {
        setAiLoading(false);
      }
    },
    [aiSearchQuery, conversationId]
  );

  const handleSmartSearch = useCallback(async () => {
    if (!aiSearchQuery.trim()) {
      Alert.alert("Tìm kiếm AI", "Nhập câu hỏi cần tìm trong cuộc trò chuyện.");
      return;
    }

    await openAiPanel("search");
  }, [aiSearchQuery, openAiPanel]);

  const handleToneAdjust = useCallback(
    async (tone: AiTone) => {
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
    },
    [messageText]
  );

  const showToneMenu = useCallback(() => {
    setShowTonePicker(true);
  }, []);

  const showAiMenu = useCallback(() => {
    setShowAiQuickMenu(true);
  }, []);

  const handleTranslateMessage = useCallback(async (message: MessagePayload) => {
    const messageId = message._id || message.id;
    if (!messageId || !message.text?.trim()) return;

    try {
      setTranslatingMessageId(messageId);
      const result = await aiService.translate(message.text, "Vietnamese");
      setTranslatedMessages((prev) => ({ ...prev, [messageId]: result }));
    } catch (err: any) {
      Alert.alert("Dịch bằng AI", err?.message || "Không thể dịch tin nhắn.");
    } finally {
      setTranslatingMessageId(null);
    }
  }, []);

  const handleConfirmMute = useCallback(async () => {
    if (!conversationId) {
      Alert.alert("Thông báo", "Chưa có hội thoại để tắt thông báo.");
      return;
    }

    const { payload, localMuteUntil: nextMuteUntil } = buildMutePayload(selectedMuteOption);

    try {
      setMuteLoading(true);
      await ConversationService.muteConversation(conversationId, payload);
      setLocalMuteUntil(nextMuteUntil);
      setShowMuteDialog(false);
      Alert.alert("Thông báo", "Đã tắt thông báo hội thoại này.");
    } catch (err: any) {
      Alert.alert("Thông báo", err?.message || "Không thể tắt thông báo lúc này.");
    } finally {
      setMuteLoading(false);
    }
  }, [conversationId, selectedMuteOption]);

  const handleUnmuteConversation = useCallback(async () => {
    if (!conversationId) {
      Alert.alert("Thông báo", "Chưa có hội thoại để bật thông báo.");
      return;
    }

    try {
      setMuteLoading(true);
      await ConversationService.unmuteConversation(conversationId);
      setLocalMuteUntil(null);
      Alert.alert("Thông báo", "Đã bật lại thông báo hội thoại này.");
    } catch (err: any) {
      Alert.alert("Thông báo", err?.message || "Không thể bật thông báo lúc này.");
    } finally {
      setMuteLoading(false);
    }
  }, [conversationId]);

  const handleMuteButtonPress = useCallback(() => {
    if (isConversationMuted) {
      handleUnmuteConversation();
      return;
    }

    setShowMuteDialog(true);
  }, [handleUnmuteConversation, isConversationMuted]);

  /**
   * Handle message visibility (mark as seen)
   */
  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: any[] }) => {
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
          if (messageId && renderItem.message.senderId !== currentUser?.id && renderItem.message.status !== "seen") {
            visibleIds.push(messageId);
          }
        });

        if (visibleIds.length > 0) {
          actionsRef.current.markAsSeen(visibleIds);
        }
      }
    },
    [currentUser?.id],
  );

  /**
   * Load more messages
   */
  const handleFriendAction = useCallback(async () => {
    if (!chatUser?.id) return;

    if (!isFriend) {
      try {
        setFriendActionLoading(true);
        await sendFriendRequest(chatUser.id);
        setFriendshipStatus("pending");
        setShowAvatarMenu(false);
        Alert.alert("Đã gửi", `Đã gửi lời mời kết bạn tới ${truncateName(userName)}.`);
      } catch (error: any) {
        Alert.alert("Lỗi", error?.message || "Không thể gửi lời mời kết bạn");
      } finally {
        setFriendActionLoading(false);
      }
      return;
    }

    Alert.alert("Hủy kết bạn", `Xác nhận hủy kết bạn với ${truncateName(userName)}?`, [
      { text: "Hủy", onPress: () => { }, style: "cancel" },
      {
        text: "Xác nhận",
        onPress: async () => {
          try {
            setUnfriending(true);
            setFriendActionLoading(true);
            setShowAvatarMenu(false);
            await unfriend(chatUser.id!);
            setIsFriend(false);
            setFriendshipStatus("none");
          } catch (error: any) {
            Alert.alert("Lỗi", `Hủy kết bạn thất bại: ${error.message}`);
          } finally {
            setUnfriending(false);
            setFriendActionLoading(false);
          }
        },
        style: "destructive",
      },
    ]);
  }, [chatUser?.id, isFriend, userName]);

  const handleToggleBlock = useCallback(() => {
    if (!chatUser?.id || isSelfChat) return;

    const nextBlocked = !isBlockedByMe;
    Alert.alert(
      nextBlocked ? "Chặn người dùng" : "Bỏ chặn người dùng",
      nextBlocked
        ? `Bạn sẽ không thể nhắn tin hoặc gửi lời mời kết bạn tới ${truncateName(userName)}.`
        : `Bỏ chặn ${truncateName(userName)}?`,
      [
        { text: "Hủy", style: "cancel" },
        {
          text: nextBlocked ? "Chặn" : "Bỏ chặn",
          style: nextBlocked ? "destructive" : "default",
          onPress: async () => {
            try {
              setBlockLoading(true);
              if (nextBlocked) {
                await BlockService.blockUser(chatUser.id!);
                setIsFriend(false);
                setFriendshipStatus("none");
              } else {
                await BlockService.unblockUser(chatUser.id!);
              }
              setIsBlockedByMe(nextBlocked);
              setShowAvatarMenu(false);
              if (!nextBlocked) {
                actionsRef.current?.retryLoadConversation?.().catch((retryError: any) => {
                  console.warn("[ChatScreen] Failed to reload conversation after unblock:", retryError?.message || retryError);
                });
              }
            } catch (error: any) {
              Alert.alert("Lỗi", error?.message || "Không thể cập nhật trạng thái chặn");
            } finally {
              setBlockLoading(false);
            }
          },
        },
      ]
    );
  }, [chatUser?.id, isBlockedByMe, isSelfChat, userName]);

  const handleLoadMore = useCallback(() => {
    if (hasMoreMessages && !isLoading && actionsRef.current) {
      actionsRef.current.loadMoreMessages();
    }
  }, [hasMoreMessages, isLoading]);

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
    if (!conversationId || !targetUser.id) return;
    setProfileCardSendingUserId(targetUser.id);
    try {
      await profileCardService.sendProfileCard(conversationId, { userId: targetUser.id });
      setProfileCardSentUserIds((prev) => new Set(prev).add(targetUser.id));
    } catch (error: any) {
      const message = error?.status === 403
        ? "Người này đang ẩn danh thiếp hoặc không cho phép chia sẻ."
        : error?.message || "Không gửi được danh thiếp";
      Alert.alert("Lỗi", message);
    } finally {
      setProfileCardSendingUserId(null);
    }
  }, [conversationId]);

  const closeActionMenu = useCallback(() => {
    setActionMenuMessage(null);
    setActionMenuButtons([]);
  }, []);

  /**
   * Handle message long press - show action menu
   */
  const handleMessageLongPress = useCallback(
    (message: MessagePayload) => {
      const messageId = message._id || message.id;
      if (!messageId) return;

      const isOwn = message.senderId === currentUser?.id;
      setActionMenuMessage(message);
      setActionMenuButtons(
        buildMessageActionSheetOptions({
          isOwn,
          onDeleteForMe: async () => {
            Alert.alert("Xóa tin nhắn", "Xóa tin nhắn này khỏi phía bạn?", [
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
            ]);
          },
          onEdit: () => {
            setSelectedMessageId(messageId);
            setEditText(message.text || "");
            setShowEditDialog(true);
          },
          onRevoke: async () => {
            Alert.alert("Thu hồi tin nhắn", "Tin nhắn sẽ bị xóa với tất cả mọi người?", [
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
            ]);
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
          onTranslate: message.text?.trim()
            ? () => handleTranslateMessage(message)
            : undefined,
        }),
      );
    },
    [currentUser?.id, handleTranslateMessage],
  );

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
    [],
  );

  const renderMessage = useCallback(
    ({ item }: { item: RenderableChatItem }) => {
      // System Message
      if (item.kind === "message" && item.message.type === "system") {
        return <SystemMessageBubble text={item.message.text} />;
      }

      // Standard Message
      if (item.kind === "message") {
        const msgId = item.message._id || item.message.id;
        return (
          <MessageBubble
            message={item.message}
            isOwn={item.message.senderId === currentUserId}
            currentUserId={currentUserId}
            onLongPress={() => handleMessageLongPress(item.message)}
            onToggleReaction={(emoji, selected) => {
              const messageId = item.message._id || item.message.id;
              if (messageId) {
                handleToggleReaction(messageId, emoji, selected);
              }
            }}
            onClearMyReactions={() => {
              const messageId = item.message._id || item.message.id;
              if (messageId) {
                handleToggleReaction(messageId, "", true);
              }
            }}
            onProfileCardPress={handleOpenProfileCardUser}
            onPressQuoted={async (quotedId) => {
              if (actions.scrollToMessage) {
                const success = await actions.scrollToMessage(quotedId);
                if (!success) {
                  Alert.alert("Thông báo", "Không tìm thấy tin nhắn gốc hoặc tin nhắn đã quá cũ");
                }
              }
            }}
            isHighlighted={!!msgId && msgId === highlightedMessageId}
            messageMap={messageMap}
            translation={msgId ? translatedMessages[msgId] : undefined}
            isTranslating={!!msgId && translatingMessageId === msgId}
          />
        );
      }

      // Gallery / Grouped media
      return (
        <ImageGalleryBubble
          messages={item.messages}
          isOwn={item.isOwn}
          onLongPress={() => handleMessageLongPress(item.messages[0])}
          onImagePress={async (galleryMessages, index) => {
            // Logic for image viewer
            const senderId = galleryMessages[0].senderId;
            const { allImages, startingIndex } = getAllUserImages(senderId, galleryMessages);
            setAllViewerImages(allImages);
            setSelectedImageIndex(startingIndex + index);
            setViewingGalleryMessages(galleryMessages);
          }}
        />
      );
    },
    [currentUserId, handleMessageLongPress, actions, highlightedMessageId, messageMap, getAllUserImages, translatedMessages, translatingMessageId, handleOpenProfileCardUser],
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

  /**
   * Error state
   */
  if (error && !conversation && !isBlockedChatError) {
    return (
      <View style={styles.screen}>
        <View style={styles.errorContainer}>
          <Ionicons name="warning-outline" size={48} color={colors.dangerSoft} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={actions.retryLoadConversation}>
            <Text style={styles.retryButtonText}>Thử lại</Text>
          </Pressable>
          <Pressable style={styles.backFromError} onPress={onBackPress}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.select({
        ios: 60,
        android: 76 + (StatusBar.currentHeight || 0),
        default: 0,
      })}
    >
      {/* Header */}
      <View style={styles.chatHeaderWrap}>
        <Pressable style={styles.backButton} onPress={onBackPress}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <View style={styles.chatHeaderCard}>
          <Text style={styles.chatHeaderTitle} numberOfLines={1}>
            {truncateName(userName)}
          </Text>
          <Text style={styles.chatHeaderSubtitle}>{typingUsers.size > 0 ? "đang gõ..." : "trực tuyến 1 giờ trước"}</Text>
        </View>
        <View style={styles.headerActionCluster}>
          <Pressable style={styles.aiHeaderButton} onPress={showAiMenu}>
            <Ionicons name="sparkles" size={18} color={colors.textOnAccent} />
          </Pressable>
          <Pressable
            style={[styles.headerIconButton, isSelfChat && styles.headerIconButtonDisabled]}
            onPress={handleStartAudioCall}
            disabled={isSelfChat}
          >
            <Ionicons name="call" size={18} color={isSelfChat ? colors.textMuted : colors.text} />
          </Pressable>
        </View>
        <Pressable style={styles.headerAvatarWrap} onPress={() => setShowAvatarMenu(true)}>
          {userAvatar ? (
            <Image
              source={{ uri: userAvatar }}
              blurRadius={0.5}
              style={[styles.avatarImage, { width: 40, height: 40, borderRadius: 20 }]}
            />
          ) : (
            <Avatar label={userInitials} size={40} backgroundColor={userColor} textSize={13} />
          )}
        </Pressable>
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

      {/* Loading initial messages - overlay only if truly loading */}
      {isLoading && messages.length === 0 && (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.text} />
          <Text style={styles.loadingText}>Đang tải tin nhắn...</Text>
        </View>
      )}

      {/* Messages List or Empty State - always show when not loading OR when messages exist */}
      {!isLoading && (
        <ImageBackground source={assets.chatBackground} style={styles.chatBackground} resizeMode="cover">
          {/* Pinned Message Header */}
          {state.pinnedMessages.length > 0 && (
            <PinnedMessageHeader
              pinnedMessage={state.pinnedMessages[state.pinnedMessageIndex] || null}
              pinnedIndex={state.pinnedMessageIndex}
              pinnedTotal={state.pinnedMessages.length}
              onNavigate={(direction) => {
                if (actionsRef.current?.navigatePinnedMessages) {
                  actionsRef.current.navigatePinnedMessages(direction);
                }
              }}
              onUnpin={async () => {
                const msgId =
                  state.pinnedMessages[state.pinnedMessageIndex]?._id ||
                  state.pinnedMessages[state.pinnedMessageIndex]?.id;
                if (msgId && actionsRef.current?.unpinMessage) {
                  try {
                    await actionsRef.current.unpinMessage(msgId);
                  } catch (error: any) {
                    Alert.alert("Lỗi", error.message || "Không thể bỏ ghim tin nhắn");
                  }
                }
              }}
              onPress={async () => {
                // Scroll to pinned message
                const pinnedMsg = state.pinnedMessages[state.pinnedMessageIndex];
                const pinnedMsgId = pinnedMsg?._id || pinnedMsg?.id;
                if (pinnedMsgId && actions.scrollToMessage) {
                  const success = await actions.scrollToMessage(pinnedMsgId);
                  if (!success) {
                    Alert.alert("Thông báo", "Không tìm thấy tin nhắn gốc hoặc tin nhắn đã quá cũ");
                  }
                }
              }}
              isAdmin={true}
            />
          )}
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
              isLoadingMore && hasMoreMessages && messages.length > 0 ? (
                <View style={styles.loadingMoreContainer}>
                  <ActivityIndicator size="small" color={colors.textMuted} />
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyMessagesContainer}>
                <Ionicons
                  name={isBlockedChatError ? "ban-outline" : "chatbubble-outline"}
                  size={56}
                  color={colors.textMuted}
                />
                <Text style={styles.emptyMessagesText}>
                  {isBlockedChatError ? "Cuộc trò chuyện đang bị chặn" : "Hãy gửi lời chào đầu tiên"}
                </Text>
              </View>
            }
            ListFooterComponent={<TypingIndicator typingUsers={typingUsers} />}
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
            <Text style={styles.draftTrayTitle}>{draftMedia.length} ảnh đã chọn</Text>
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
                <Pressable style={styles.draftThumbRemove} onPress={() => removeDraftMedia(item.id)} hitSlop={8}>
                  <Ionicons name="close" size={14} color={colors.textOnAccent} />
                </Pressable>
              </View>
            ))}

            <Pressable style={styles.draftAddMore} onPress={handlePickImage} disabled={uploading}>
              <Ionicons name="add" size={24} color={colors.text} />
              <Text style={styles.draftAddMoreText}>Thêm</Text>
            </Pressable>
          </ScrollView>
        </View>
      )}

      {/* Message Composer */}
      {/* Reply Preview (if replying to a message) */}
      {state.replyingTo && (
        <ReplyPreview
          message={state.replyingTo}
          onCancel={() => {
            if (actionsRef.current?.setReplyingTo) {
              actionsRef.current.setReplyingTo(null);
            }
          }}
        />
      )}
      {shouldShowSmartReplies && smartReplies.length > 0 && (
        <View style={styles.aiSmartReplyBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.aiSmartReplyContent}>
            {smartReplies.map((reply) => (
              <Pressable key={reply} style={styles.aiSmartReplyChip} onPress={() => setMessageText(reply)}>
                <Text style={styles.aiSmartReplyText}>{reply}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable style={styles.aiSmartReplyClose} onPress={() => setSmartReplyHiddenFor(latestMessageKey)}>
            <Ionicons name="close" size={16} color={colors.textMuted} />
          </Pressable>
        </View>
      )}
      {previousDraft !== null && (
        <View style={styles.aiUndoBar}>
          <Text style={styles.aiUndoText}>AI đã chỉnh sửa bản nháp</Text>
          <Pressable
            onPress={() => {
              setMessageText(previousDraft);
              setPreviousDraft(null);
            }}
          >
            <Text style={styles.aiUndoAction}>Hoàn tác</Text>
          </Pressable>
        </View>
      )}
      {isBlockedChatError && (
        <View style={styles.blockBanner}>
          <Ionicons name="ban-outline" size={18} color={colors.danger} />
          <Text style={styles.blockBannerText}>Bạn đã chặn người dùng này. Bỏ chặn để tiếp tục nhắn tin.</Text>
        </View>
      )}
      <View style={styles.messageComposer}>
        <Pressable
          style={styles.composerIconButton}
          onPress={() => {
            setShowMediaMenu(!showMediaMenu);
          }}
          disabled={uploading || isBlockedChatError}
        >
          <Ionicons name="attach-outline" size={24} color={uploading || isBlockedChatError ? colors.textMuted : colors.text} />
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
            editable={!isSending && !uploading && !isBlockedChatError}
          />
          <Pressable style={styles.composerEmojiButton}>
            <Ionicons name="happy-outline" size={22} color={colors.textMuted} />
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
            !hasSendableContent && (isRecordingAudio || uploading) && styles.composerActionButtonDisabled,
            hasSendableContent && (isSending || uploading) && styles.composerActionButtonDisabled,
            isBlockedChatError && styles.composerActionButtonDisabled,
          ]}
          onPress={hasSendableContent ? handleSendMessage : handlePickAudio}
          disabled={
            isBlockedChatError ||
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
                    if (mode !== "search") {
                      openAiPanel(mode);
                    }
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
                <Pressable style={styles.aiSearchButton} onPress={handleSmartSearch} disabled={aiLoading}>
                  {aiLoading ? (
                    <ActivityIndicator size="small" color={colors.textOnAccent} />
                  ) : (
                    <Ionicons name="search" size={18} color={colors.textOnAccent} />
                  )}
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
                  <>
                    {(aiSummary?.summary || []).length > 0 ? (
                      aiSummary?.summary.map((item, index) => (
                        <View key={`${item}-${index}`} style={styles.aiBulletRow}>
                          <Text style={styles.aiBullet}>-</Text>
                          <Text style={styles.aiPanelText}>{item}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.aiPanelMuted}>Chưa có tóm tắt.</Text>
                    )}
                  </>
                )}

                {aiPanelMode === "search" && (
                  <>
                    {aiLoading ? (
                      <View style={styles.aiPanelLoading}>
                        <ActivityIndicator color={colors.accentStrong} />
                        <Text style={styles.aiPanelMuted}>Đang tìm...</Text>
                      </View>
                    ) : aiSearchResult ? (
                      <>
                        <Text style={styles.aiPanelText}>{aiSearchResult.answer}</Text>
                        <Text style={styles.aiSectionLabel}>Nguồn</Text>
                        {aiSearchResult.references?.map((ref) => (
                          <View key={ref.messageId} style={styles.aiReferenceCard}>
                            <Text style={styles.aiReferenceText}>{ref.text}</Text>
                          </View>
                        ))}
                      </>
                    ) : (
                      <Text style={styles.aiPanelMuted}>Nhập câu hỏi để tìm bằng AI.</Text>
                    )}
                  </>
                )}

                {aiPanelMode === "tasks" && (
                  <>
                    {(aiTasks?.tasks || []).length > 0 ? (
                      aiTasks?.tasks.map((task, index) => (
                        <View key={`${task.description}-${index}`} style={styles.aiTaskCard}>
                          <Text style={styles.aiPanelText}>{task.description}</Text>
                          <Text style={styles.aiPanelMuted}>
                            {[task.assignee, task.deadline, task.status].filter(Boolean).join(" - ")}
                          </Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.aiPanelMuted}>Chưa tìm thấy công việc nào.</Text>
                    )}
                  </>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

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
            <Text style={styles.voiceRecordingHint}>Giữ để ghi âm, thả tay để gửi</Text>
          </View>

          <View style={styles.voiceRecorderCenter}>
            <Text style={styles.voiceTimer}>
              {`${String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:${String(recordingSeconds % 60).padStart(2, "0")}`}
            </Text>
            <View
              {...audioPanResponder.panHandlers}
              style={[styles.voiceMicButton, isCancelingAudio && styles.voiceMicButtonCanceling]}
            >
              <Ionicons name="mic" size={34} color={colors.textOnAccent} />
            </View>
            <Text style={styles.voiceRecordingSubtext}>
              {isCancelingAudio ? "Thả tay để hủy" : "Kéo lên góc X để hủy"}
            </Text>
          </View>
        </View>
      )}

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
          Alert.alert("Thành công", `Đã chuyển tiếp tới ${result.sentToCount} cuộc trò chuyện`);
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

      <ShareProfileCardSheet
        visible={showShareProfileSheet}
        profileUser={{
          ...chatUser,
          id: friendId,
          displayName: userName,
          avatar: userAvatar,
          avatarUrl: userAvatar,
        }}
        currentConversationId={conversationId}
        onDismiss={() => setShowShareProfileSheet(false)}
        onSent={() => Alert.alert("Thành công", "Đã gửi danh thiếp")}
        onError={(message) => Alert.alert("Lỗi", message)}
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
                  <Image source={{ uri: item.uri }} style={styles.imageViewerImage} resizeMode="contain" />
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
      <Modal visible={showAvatarMenu} transparent animationType="fade" onRequestClose={() => setShowAvatarMenu(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowAvatarMenu(false)}>
          <View style={styles.avatarMenuContainer}>
            {!isSelfChat && (
              <>
                <Pressable
                  style={styles.menuItem}
                  onPress={() => {
                    setShowAvatarMenu(false);
                    handleMuteButtonPress();
                  }}
                  disabled={muteLoading}
                >
                  {muteLoading ? (
                    <ActivityIndicator color={isConversationMuted ? colors.accentStrong : colors.text} />
                  ) : (
                    <>
                      <Ionicons
                        name={isConversationMuted ? "notifications-off-outline" : "notifications-outline"}
                        size={20}
                        color={isConversationMuted ? colors.accentStrong : colors.text}
                      />
                      <Text style={styles.menuItemText}>
                        {isConversationMuted ? "Bật thông báo" : "Tắt thông báo"}
                      </Text>
                    </>
                  )}
                </Pressable>
                <View style={styles.menuDivider} />
                <Pressable
                  style={styles.menuItem}
                  onPress={() => {
                    setShowAvatarMenu(false);
                    setShowShareProfileSheet(true);
                  }}
                  disabled={!friendId}
                >
                  <Ionicons name="share-social-outline" size={20} color={colors.text} />
                  <Text style={styles.menuItemText}>Chia sẻ hồ sơ</Text>
                </Pressable>
                <View style={styles.menuDivider} />
                <Pressable style={[styles.menuItem, isBlockedByMe && styles.menuItemDanger]} onPress={handleToggleBlock} disabled={blockLoading}>
                  {blockLoading ? (
                    <ActivityIndicator color={isBlockedByMe ? colors.dangerStrong : colors.accent} />
                  ) : (
                    <>
                      <Ionicons
                        name={isBlockedByMe ? "ban" : "ban-outline"}
                        size={20}
                        color={isBlockedByMe ? colors.dangerStrong : colors.text}
                      />
                      <Text style={[styles.menuItemText, isBlockedByMe && styles.menuItemTextDanger]}>
                        {isBlockedByMe ? "Bỏ chặn" : "Chặn người dùng"}
                      </Text>
                    </>
                  )}
                </Pressable>
                <View style={styles.menuDivider} />
              </>
            )}
            {!isSelfChat && (
              <Pressable
                style={[styles.menuItem, isFriend && styles.menuItemDanger]}
                onPress={handleFriendAction}
                disabled={friendActionLoading || friendshipStatus === "pending" || isBlockedChatError}
              >
                {friendActionLoading ? (
                  <ActivityIndicator color={isFriend ? colors.dangerStrong : colors.accent} />
                ) : (
                  <>
                    <Ionicons
                      name={isFriend ? "person-remove" : friendshipStatus === "pending" ? "time-outline" : "person-add-outline"}
                      size={20}
                      color={isFriend ? colors.dangerStrong : colors.text}
                    />
                    <Text style={[styles.menuItemText, isFriend && styles.menuItemTextDanger]}>
                      {isFriend ? "Hủy kết bạn" : friendshipStatus === "pending" ? "Đã gửi lời mời" : "Thêm bạn lại"}
                    </Text>
                  </>
                )}
              </Pressable>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* Media Menu Modal */}
      <Modal
        transparent
        visible={showMediaMenu}
        animationType="fade"
        onRequestClose={() => {
          setShowMediaMenu(false);
        }}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            setShowMediaMenu(false);
          }}
        >
          <View style={styles.mediaMenuContainer}>
            <Text style={styles.mediaMenuTitle}>Ghim</Text>

            <Pressable
              style={styles.mediaMenuButton}
              onPress={() => {
                handlePickImage();
              }}
            >
              <Ionicons name="image" size={24} color={colors.mediaImageIcon} />
              <Text style={styles.mediaMenuButtonText}>Thư Viện</Text>
            </Pressable>

            <Pressable
              style={styles.mediaMenuButton}
              onPress={() => {
                handlePickVideo();
              }}
            >
              <Ionicons name="videocam" size={24} color={colors.mediaVideoIcon} />
              <Text style={styles.mediaMenuButtonText}>Video</Text>
            </Pressable>

            <Pressable style={styles.mediaMenuButton} onPress={handlePickAudioFile}>
              <Ionicons name="musical-note" size={24} color={colors.mediaAudioIcon} />
              <Text style={styles.mediaMenuButtonText}>Audio</Text>
            </Pressable>

            <Pressable style={styles.mediaMenuButton} onPress={handlePickDocument}>
              <Ionicons name="document" size={24} color={colors.mediaDocumentIcon} />
              <Text style={styles.mediaMenuButtonText}>Tài Liệu</Text>
            </Pressable>

            <Pressable
              style={styles.mediaMenuButton}
              onPress={() => {
                setShowMediaMenu(false);
                setShowContactPicker(true);
              }}
            >
              <Ionicons name="person-circle-outline" size={24} color={colors.accent} />
              <Text style={styles.mediaMenuButtonText}>Chia sẻ liên hệ</Text>
            </Pressable>

            <Pressable style={styles.mediaMenuCloseButton} onPress={() => setShowMediaMenu(false)}>
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
    backgroundColor: "transparent",
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
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 6 : 8,
    paddingBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.1)",
    borderBottomWidth: 0,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(30,30,30,0.9)",
    borderWidth: 1,
    borderColor: colors.overlayWhite18,
    alignItems: "center",
    justifyContent: "center",
  },
  chatHeaderCard: {
    flex: 1,
    maxWidth: 280,
    backgroundColor: "rgba(30,30,30,0.9)",
    borderRadius: 24,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.overlayWhite18,
    alignItems: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 6,
  },
  headerActionCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  headerIconButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(30,30,30,0.86)",
    borderWidth: 1,
    borderColor: colors.overlayWhite18,
    alignItems: "center",
    justifyContent: "center",
  },
  headerIconButtonDisabled: {
    opacity: 0.45,
  },
  chatHeaderTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  chatHeaderSubtitle: {
    color: colors.textSoft,
    fontSize: 11,
    marginTop: 0,
  },
  headerAvatarWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: colors.overlayWhite18,
  },
  aiHeaderButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accentStrong,
    alignItems: "center",
    justifyContent: "center",
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
    minWidth: 76,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    paddingBottom: 18,
    marginBottom: 10,
    position: "relative",
  },
  galleryBubble: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    maxWidth: "84%",
  },
  incomingBubble: {
    backgroundColor: colors.bubbleIncomingBgTransparent,
    borderTopLeftRadius: 6,
  },
  outgoingBubble: {
    backgroundColor: colors.bubbleOutgoingBgTransparent,
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
  jumboEmojiWrap: {
    marginBottom: 10,
    position: "relative",
    alignItems: "center",
  },
  jumboEmojiTimePill: {
    alignSelf: "flex-end",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: -4,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "rgba(0,0,0,0.34)",
  },
  jumboEmojiTimePillOwn: {
    alignSelf: "flex-end",
  },
  jumboEmojiTimePillOther: {
    alignSelf: "flex-start",
  },
  aiTranslationBox: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.overlayWhite18,
    gap: 4,
  },
  aiTranslationLabel: {
    color: colors.overlayWhite75,
    fontSize: 11,
    fontWeight: "700",
  },
  aiTranslationText: {
    color: colors.textOnAccent,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "500",
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
    color: "#4CAF50",
  },
  sendingStatus: {
    color: colors.overlayWhite75,
    fontSize: 10,
  },
  failedStatus: {
    color: colors.dangerSoft,
    fontSize: 10,
    fontWeight: "700",
  },
  messageHighlighted: {
    backgroundColor: "rgba(255, 200, 0, 0.18)",
    borderRadius: 12,
  },
  mediaContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    gap: 4,
    overflow: "visible",
    zIndex: 10,
    elevation: 10,
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
    backgroundColor: colors.surfaceTransparent,
    borderTopWidth: 1,
    borderTopColor: colors.overlayWhite10,
  },
  blockBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "rgba(239,68,68,0.12)",
    borderTopWidth: 1,
    borderTopColor: "rgba(239,68,68,0.24)",
  },
  blockBannerText: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  composerIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.inputBgTransparent,
    borderWidth: 1,
    borderColor: colors.overlayWhite10,
    alignItems: "center",
    justifyContent: "center",
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
  aiSmartReplyBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceTransparent,
  },
  aiSmartReplyContent: {
    gap: 8,
    paddingRight: 8,
  },
  aiSmartReplyChip: {
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(63,140,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(63,140,255,0.32)",
  },
  aiSmartReplyText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  aiSmartReplyClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
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
    fontWeight: "700",
    fontSize: 12,
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
    borderWidth: 1,
    borderColor: colors.overlayWhite10,
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
  aiPanelOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: colors.overlayDark50,
  },
  aiMenuOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: colors.overlayDark50,
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
    backgroundColor: colors.overlayDark50,
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
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  aiPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
    backgroundColor: "rgba(63,140,255,0.2)",
    borderColor: colors.accentStrong,
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
    alignItems: "center",
    gap: 8,
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
  aiBulletRow: {
    flexDirection: "row",
    gap: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  aiBullet: {
    color: colors.accentStrong,
    fontWeight: "800",
  },
  aiSectionLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 8,
  },
  aiReferenceCard: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  aiReferenceText: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 18,
  },
  aiTaskCard: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
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
  menuDivider: {
    height: 10,
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  menuItemTextDanger: {
    color: colors.dangerStrong,
  },
  chatBackground: {
    flex: 1,
    width: "100%",
  },
});
