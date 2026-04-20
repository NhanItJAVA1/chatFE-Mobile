import React from "react";
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";
import type { MessagePayload } from "../../../shared/services/socketService";
import { useUserCache } from "@/shared/hooks/useUserCache";

interface PinnedMessageHeaderProps {
    pinnedMessage: MessagePayload | null;
    pinnedIndex: number;
    pinnedTotal: number;
    onNavigate: (direction: "prev" | "next") => void;
    onUnpin: () => void;
    onPress: () => void;
    isAdmin?: boolean;
}

/**
 * PinnedMessageHeader Component
 * Displays a sticky header showing the current pinned message
 * Supports navigation between multiple pinned messages
 */
export const PinnedMessageHeader: React.FC<PinnedMessageHeaderProps> = ({
    pinnedMessage,
    pinnedIndex,
    pinnedTotal,
    onNavigate,
    onUnpin,
    onPress,
    isAdmin = true,
}) => {
    if (!pinnedMessage) {
        return null;
    }

    const { user } = useUserCache(pinnedMessage.senderId);
    const senderName = user?.name ?? "Unknown";
    const messageText = pinnedMessage.text || (
        pinnedMessage.media && pinnedMessage.media.length > 0
            ? `[Media: ${pinnedMessage.media.length} item(s)]`
            : "Message"
    );
    const preview = messageText.length > 60
        ? messageText.substring(0, 60) + "..."
        : messageText;

    return (
        <Pressable
            style={styles.container}
            onPress={onPress}
        >
            <View style={styles.content}>
                {/* Left: Pin icon + message info */}
                <View style={styles.left}>
                    <Ionicons
                        name="pin"
                        size={18}
                        color={colors.accent}
                        style={styles.pinIcon}
                    />
                    <View style={styles.messageInfo}>
                        <Text style={styles.senderName} numberOfLines={1}>
                            {senderName}
                        </Text>
                        <Text style={styles.messageText} numberOfLines={1}>
                            {preview}
                        </Text>
                    </View>
                </View>

                {/* Right: Navigation + Unpin */}
                <View style={styles.right}>
                    {pinnedTotal > 1 && (
                        <>
                            <Text style={styles.counter}>
                                {pinnedIndex + 1}/{pinnedTotal}
                            </Text>
                            <Pressable
                                onPress={() => onNavigate("prev")}
                                hitSlop={8}
                            >
                                <Ionicons
                                    name="chevron-up"
                                    size={16}
                                    color={colors.accent}
                                />
                            </Pressable>
                            <Pressable
                                onPress={() => onNavigate("next")}
                                hitSlop={8}
                            >
                                <Ionicons
                                    name="chevron-down"
                                    size={16}
                                    color={colors.accent}
                                />
                            </Pressable>
                        </>
                    )}
                    {isAdmin && (
                        <Pressable
                            onPress={onUnpin}
                            hitSlop={8}
                        >
                            <Ionicons
                                name="close-circle"
                                size={16}
                                color={colors.accent}
                            />
                        </Pressable>
                    )}
                </View>
            </View>
        </Pressable>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: colors.surfaceSoftTransparent,
        borderBottomColor: colors.accent,
        borderBottomWidth: 1,
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    content: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    left: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        marginRight: 8,
    },
    pinIcon: {
        marginRight: 8,
    },
    messageInfo: {
        flex: 1,
    },
    senderName: {
        fontSize: 12,
        fontWeight: "600",
        color: colors.accent,
        marginBottom: 2,
    },
    messageText: {
        fontSize: 13,
        color: colors.text,
    },
    right: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    counter: {
        fontSize: 11,
        color: colors.accent,
        fontWeight: "500",
        marginRight: 4,
    },
});

export default PinnedMessageHeader;
