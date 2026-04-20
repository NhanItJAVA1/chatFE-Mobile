import React from "react";
import {
    View,
    Text,
    StyleSheet,
    Pressable,
} from "react-native";
import { colors } from "../theme";
import type { MessagePayload, QuotedMessage } from "../../../shared/services/socketService";
import { useUserCache } from "@/shared/hooks/useUserCache";
import { resolveUserName } from "@/shared/cache/userCache";

interface QuotedMessageBlockProps {
    quotedMessage?: MessagePayload | QuotedMessage;
    isOwn: boolean;
    onPress?: () => void;
}

/**
 * QuotedMessageBlock Component
 * Renders a quoted/replied message inside message bubble (Telegram/Messenger style)
 * 
 * Visual hierarchy:
 * - Left accent border (3px) - accent color
 * - Background color - contrasting
 * - Sender name - bold, accent color
 * - Message preview - muted/lighter color
 * - Divider line below quoted section
 */
export const QuotedMessageBlock: React.FC<QuotedMessageBlockProps> = ({
    quotedMessage,
    isOwn,
    onPress,
}) => {
    // if (!quotedMessage) {
    //     console.log('[QuotedMessageBlock] No quotedMessage provided, rendering nothing');
    //     return null;
    // }

    // console.log('[QuotedMessageBlock]', {
    //     senderId: quotedMessage.senderId,
    //     cachedName: resolveUserName(quotedMessage.senderId),
    //     rawSenderName: quotedMessage.senderName,
    //     text: quotedMessage.text?.substring(0, 30),
    // });

    // Sử dụng Hook để lấy thông tin user một cách đúng đắn trong React
    const { user } = useUserCache(quotedMessage.senderId);
    const senderName = user?.name ?? "Unknown";



    // Handle different message types
    const hasMedia = quotedMessage.media && quotedMessage.media.length > 0;
    const messageText = quotedMessage.text
        ? quotedMessage.text
        : hasMedia
            ? `📎 Media: ${quotedMessage.media.length} item(s)`
            : "[Message not available]";

    // Truncate long text with ellipsis
    const preview = messageText.length > 100
        ? messageText.substring(0, 100) + "..."
        : messageText;

    return (
        <Pressable 
            onPress={onPress}
            style={styles.quotedWrapper}
        >
            {/* Main Quoted Container with Left Border */}
            <View style={[
                styles.quotedContainer,
                isOwn ? styles.quotedContainerOwn : styles.quotedContainerOther,
            ]}>
                {/* Left Accent Border */}
                <View style={styles.quotedBorderLeft} />

                {/* Content */}
                <View style={styles.quotedContent}>
                    {/* Sender Name */}
                    <Text style={styles.quotedSender} numberOfLines={1}>
                        {senderName}
                    </Text>

                    {/* Message Preview */}
                    <Text
                        style={styles.quotedText}
                        numberOfLines={2}
                    >
                        {preview}
                    </Text>
                </View>
            </View>

            {/* Divider Line */}
            <View style={styles.quotedDivider} />
        </Pressable>
    );
};

const styles = StyleSheet.create({
    quotedWrapper: {
        marginBottom: 12,
        alignSelf: 'stretch',
        minWidth: 200,
    },
    quotedContainer: {
        flexDirection: "row",
        alignItems: "flex-start",
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderRadius: 8,
        overflow: "hidden",
        minHeight: 70,
        alignSelf: 'stretch',
        flexShrink: 0,
    },
    quotedContainerOwn: {
        // Own message (pink background #cc5f99) - use semi-transparent white overlay
        backgroundColor: "rgba(255, 255, 255, 0.3)",
    },
    quotedContainerOther: {
        // Other message (gray background #2a2a2a) - use semi-transparent white overlay
        backgroundColor: "rgba(255, 255, 255, 0.15)",
    },
    quotedBorderLeft: {
        width: 4,
        backgroundColor: colors.accent,
        borderRadius: 2,
        marginRight: 10,
    },
    quotedContent: {
        flex: 1,
        justifyContent: "center",
    },
    quotedSender: {
        fontSize: 12,
        fontWeight: "800", // Extra bold
        color: colors.textOnAccent, // White text for contrast
        marginBottom: 5,
    },
    quotedText: {
        fontSize: 13,
        lineHeight: 18,
        color: colors.textOnAccent,
        opacity: 0.85, // High opacity for readability
    },
    quotedDivider: {
        height: 1.5,
        backgroundColor: colors.textOnAccent,
        opacity: 0.3,
        marginLeft: 12,
        marginRight: 12,
        marginTop: 0,
    },
});

export default QuotedMessageBlock;
