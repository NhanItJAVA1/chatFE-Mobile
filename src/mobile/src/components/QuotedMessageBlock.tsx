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
    // Sử dụng Hook để lấy thông tin user một cách đúng đắn trong React
    const { user } = useUserCache(quotedMessage?.senderId || "");
    const senderName = user?.name ?? "Unknown";



    // Handle different message types
    const hasMedia = quotedMessage?.media && quotedMessage.media.length > 0;
    const messageText = quotedMessage?.text
        ? quotedMessage.text
        : hasMedia
            ? `Media: ${quotedMessage?.media?.length || 0} item(s)`
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
        marginBottom: 7,
        alignSelf: 'stretch',
        minWidth: 168,
    },
    quotedContainer: {
        flexDirection: "row",
        alignItems: "flex-start",
        paddingHorizontal: 9,
        paddingVertical: 7,
        borderRadius: 10,
        overflow: "hidden",
        alignSelf: 'stretch',
        flexShrink: 0,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.16)",
    },
    quotedContainerOwn: {
        // Own message (pink background) - use subtle white overlay
        backgroundColor: "rgba(255, 255, 255, 0.14)",
    },
    quotedContainerOther: {
        // Other message (gray background) - use subtle white overlay
        backgroundColor: "rgba(255, 255, 255, 0.08)",
    },
    quotedBorderLeft: {
        width: 3,
        backgroundColor: colors.accent,
        borderRadius: 3,
        marginRight: 8,
        alignSelf: "stretch",
    },
    quotedContent: {
        flex: 1,
        justifyContent: "center",
    },
    quotedSender: {
        fontSize: 11,
        fontWeight: "800",
        color: colors.textOnAccent, // White text for contrast
        marginBottom: 2,
    },
    quotedText: {
        fontSize: 12,
        lineHeight: 16,
        color: colors.textOnAccent,
        opacity: 0.85, // High opacity for readability
    },
    quotedDivider: {
        height: 1,
        backgroundColor: colors.textOnAccent,
        opacity: 0.18,
        marginLeft: 10,
        marginRight: 10,
        marginTop: 5,
    },
});

export default QuotedMessageBlock;
