import React from "react";
import {
    View,
    Text,
    StyleSheet,
    Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";
import type { MessagePayload } from "../../../shared/services/socketService";

export interface ReplyPreviewProps {
    message: MessagePayload;
    onCancel: () => void;
}

/**
 * ReplyPreview Component
 * Shows a preview of the message being replied to above the input
 */
export const ReplyPreview: React.FC<ReplyPreviewProps> = ({
    message,
    onCancel,
}) => {
    const senderName = message.senderName || "Unknown";
    const messageText = message.text || (
        message.media && message.media.length > 0
            ? `[Media: ${message.media.length} item(s)]`
            : "Message"
    );
    const preview = messageText.length > 40
        ? messageText.substring(0, 40) + "..."
        : messageText;

    return (
        <View style={styles.container}>
            <View style={styles.content}>
                <View style={styles.left}>
                    <View style={styles.indicator} />
                    <View style={styles.info}>
                        <Text style={styles.label}>Replying to</Text>
                        <Text style={styles.sender} numberOfLines={1}>
                            {senderName}
                        </Text>
                        <Text style={styles.text} numberOfLines={1}>
                            {preview}
                        </Text>
                    </View>
                </View>
                <Pressable
                    onPress={onCancel}
                    hitSlop={8}
                >
                    <Ionicons
                        name="close"
                        size={20}
                        color={colors.accent}
                    />
                </Pressable>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: colors.surfaceSoft,
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderTopColor: colors.accent,
        borderTopWidth: 2,
        borderLeftColor: colors.accent,
        borderLeftWidth: 3,
    },
    content: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    left: {
        flex: 1,
        flexDirection: "row",
        alignItems: "flex-start",
        marginRight: 8,
    },
    indicator: {
        width: 3,
        height: 40,
        backgroundColor: colors.accent,
        borderRadius: 2,
        marginRight: 8,
    },
    info: {
        flex: 1,
    },
    label: {
        fontSize: 11,
        color: colors.textMuted,
        marginBottom: 2,
        fontWeight: "600",
    },
    sender: {
        fontSize: 13,
        fontWeight: "600",
        color: colors.accent,
        marginBottom: 2,
    },
    text: {
        fontSize: 13,
        color: colors.text,
    },
});
