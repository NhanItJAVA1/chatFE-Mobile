import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";

export interface PinnedMessage {
    id: string;
    text: string;
    senderName: string;
}

export interface PinnedMessagesBarProps {
    pinnedMessages: PinnedMessage[];
    onSelectMessage: (id: string) => void;
}

export const PinnedMessagesBar: React.FC<PinnedMessagesBarProps> = ({
    pinnedMessages,
    onSelectMessage,
}) => {
    const [expanded, setExpanded] = useState(false);

    if (!pinnedMessages || pinnedMessages.length === 0) {
        return null;
    }

    const firstMessage = pinnedMessages[0];
    const isMultiple = pinnedMessages.length > 1;

    const toggleExpand = () => {
        if (isMultiple) {
            setExpanded(!expanded);
        }
    };

    const handleSelect = (id: string) => {
        onSelectMessage(id);
        if (expanded) {
            setExpanded(false);
        }
    };

    return (
        <View style={styles.container}>
            <Pressable
                style={styles.header}
                onPress={() => isMultiple ? toggleExpand() : handleSelect(firstMessage.id)}
            >
                <View style={styles.pinIconContainer}>
                    <Ionicons name="pin" size={16} color={colors.accent} />
                </View>

                <View style={styles.headerContent}>
                    <Text style={styles.senderName} numberOfLines={1}>
                        {firstMessage.senderName}
                    </Text>
                    <Text style={styles.messageText} numberOfLines={1}>
                        {firstMessage.text}
                    </Text>
                </View>

                {isMultiple && (
                    <View style={styles.chevronContainer}>
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>{pinnedMessages.length}</Text>
                        </View>
                        <Ionicons
                            name={expanded ? "chevron-up" : "chevron-down"}
                            size={20}
                            color={colors.textSecondary}
                        />
                    </View>
                )}
            </Pressable>

            {expanded && isMultiple && (
                <View style={styles.expandedContainer}>
                    <View style={styles.divider} />
                    <ScrollView style={styles.messageList} showsVerticalScrollIndicator={false}>
                        {pinnedMessages.map((msg) => (
                            <Pressable
                                key={msg.id}
                                style={styles.listItem}
                                onPress={() => handleSelect(msg.id)}
                            >
                                <Text style={styles.listItemSender} numberOfLines={1}>
                                    {msg.senderName}
                                </Text>
                                <Text style={styles.listItemText} numberOfLines={2}>
                                    {msg.text}
                                </Text>
                            </Pressable>
                        ))}
                    </ScrollView>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        elevation: 2,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        paddingHorizontal: 16,
        minHeight: 50,
    },
    pinIconContainer: {
        marginRight: 12,
        justifyContent: "center",
        alignItems: "center",
    },
    headerContent: {
        flex: 1,
        justifyContent: "center",
    },
    senderName: {
        fontSize: 12,
        fontWeight: "bold",
        color: colors.accent,
        marginBottom: 2,
    },
    messageText: {
        fontSize: 14,
        color: colors.textSecondary,
    },
    chevronContainer: {
        flexDirection: "row",
        alignItems: "center",
        marginLeft: 8,
    },
    badge: {
        backgroundColor: colors.border,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 10,
        marginRight: 6,
    },
    badgeText: {
        fontSize: 10,
        color: colors.textSecondary,
        fontWeight: "bold",
    },
    expandedContainer: {
        maxHeight: 250,
        backgroundColor: colors.surface,
    },
    divider: {
        height: 1,
        backgroundColor: colors.border,
        marginHorizontal: 16,
    },
    messageList: {
        paddingVertical: 4,
    },
    listItem: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
    },
    listItemSender: {
        fontSize: 12,
        fontWeight: "bold",
        color: colors.accent,
        marginBottom: 4,
    },
    listItemText: {
        fontSize: 14,
        color: colors.textPrimary,
        lineHeight: 20,
    },
});

export default PinnedMessagesBar;
