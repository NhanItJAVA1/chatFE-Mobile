import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Avatar } from "../components";
import { conversation } from "../data";
import { colors } from "../theme";

export const ChatScreen = ({ onBackPress }) => {
    const truncateName = (name, maxLength = 20) => {
        if (!name || name.length <= maxLength) {
            return name;
        }
        return name.slice(0, Math.floor(maxLength / 2)) + "...";
    };

    return (
        <View style={styles.screen}>
            <View style={styles.chatHeaderWrap}>
                <Pressable style={styles.backButton} onPress={onBackPress}>
                    <Ionicons name="chevron-back" size={24} color={colors.text} />
                </Pressable>
                <View style={styles.chatHeaderCard}>
                    <Text style={styles.chatHeaderTitle} numberOfLines={1}>{truncateName("Đức Tuấn Thủ")}</Text>
                    <Text style={styles.chatHeaderSubtitle}>trực tuyến 2 giờ trước</Text>
                </View>
                <View style={styles.headerAvatarWrap}>
                    <Avatar label="ĐT" size={52} backgroundColor="#4f8cff" textSize={14} />
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.chatContent} showsVerticalScrollIndicator={false}>
                <Text style={styles.chatDateDivider}>8 Tháng 2</Text>
                {conversation.map((item) => (
                    <View key={item.id} style={[styles.bubbleRow, item.type === "outgoing" ? styles.outgoingRow : styles.incomingRow]}>
                        <View style={[styles.bubble, item.type === "outgoing" ? styles.outgoingBubble : styles.incomingBubble]}>
                            <Text style={styles.bubbleText}>{item.text}</Text>
                            <View style={styles.bubbleMetaRow}>
                                <Text style={styles.bubbleTime}>{item.time}</Text>
                                {item.edited ? <Text style={styles.editedText}>đã Sửa</Text> : null}
                            </View>
                        </View>
                    </View>
                ))}
            </ScrollView>

            <View style={styles.messageComposer}>
                <Pressable style={styles.composerIconButton}><Ionicons name="attach-outline" size={24} color={colors.text} /></Pressable>
                <View style={styles.composerInputWrap}>
                    <TextInput placeholder="Tin nhắn" placeholderTextColor={colors.textMuted} style={styles.composerInput} />
                    <Ionicons name="happy-outline" size={22} color={colors.textMuted} style={styles.composerEmoji} />
                </View>
                <Pressable style={styles.composerIconButton}><Ionicons name="mic-outline" size={24} color={colors.text} /></Pressable>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: colors.background,
    },
    chatHeaderWrap: {
        paddingHorizontal: 14,
        paddingTop: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
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
    chatContent: {
        paddingHorizontal: 14,
        paddingBottom: 16,
        gap: 10,
    },
    chatDateDivider: {
        alignSelf: "center",
        color: colors.textMuted,
        fontSize: 13,
        marginVertical: 10,
    },
    bubbleRow: {
        flexDirection: "row",
    },
    incomingRow: {
        justifyContent: "flex-start",
    },
    outgoingRow: {
        justifyContent: "flex-end",
    },
    bubble: {
        maxWidth: "82%",
        borderRadius: 18,
        paddingHorizontal: 14,
        paddingVertical: 10,
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
        color: colors.text,
        fontSize: 15,
        lineHeight: 20,
    },
    bubbleMetaRow: {
        flexDirection: "row",
        justifyContent: "flex-end",
        alignItems: "center",
        gap: 6,
        marginTop: 6,
    },
    bubbleTime: {
        color: "rgba(255,255,255,0.75)",
        fontSize: 11,
    },
    editedText: {
        color: "rgba(255,255,255,0.75)",
        fontSize: 11,
    },
    messageComposer: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 14,
        paddingBottom: 10,
        backgroundColor: colors.background,
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
        height: 48,
        borderRadius: 24,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        paddingLeft: 16,
        paddingRight: 12,
        flexDirection: "row",
        alignItems: "center",
    },
    composerInput: {
        flex: 1,
        color: colors.text,
        fontSize: 15,
    },
    composerEmoji: {
        marginLeft: 8,
    },
});
