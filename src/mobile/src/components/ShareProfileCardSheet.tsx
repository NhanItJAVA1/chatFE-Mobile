import React, { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Image,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ConversationService, type Conversation } from "../../../shared/services/conversationService";
import profileCardService from "../../../shared/services/profileCardService";
import { Avatar } from "./Avatar";
import { colors } from "../theme";

interface ShareProfileCardSheetProps {
    visible: boolean;
    profileUser: any;
    currentConversationId?: string;
    onDismiss: () => void;
    onSent?: () => void;
    onError?: (message: string) => void;
}

type Target = {
    id: string;
    title: string;
    subtitle: string;
    avatar?: string;
    type: "PRIVATE" | "GROUP";
};

const getConversationId = (conversation: Conversation): string => String(conversation.id || conversation._id || "");

const toTarget = (conversation: Conversation): Target | null => {
    const id = getConversationId(conversation);
    if (!id) return null;

    const type = String(conversation.type || "").toUpperCase() === "GROUP" ? "GROUP" : "PRIVATE";
    return {
        id,
        title: conversation.name || (type === "GROUP" ? "Nhóm" : "Cuộc trò chuyện"),
        subtitle: type === "GROUP"
            ? `${conversation.members?.length || 0} thành viên`
            : "Cuộc trò chuyện riêng",
        avatar: conversation.avatarUrl,
        type,
    };
};

export const ShareProfileCardSheet: React.FC<ShareProfileCardSheetProps> = ({
    visible,
    profileUser,
    currentConversationId,
    onDismiss,
    onSent,
    onError,
}) => {
    const [targets, setTargets] = useState<Target[]>([]);
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [sendingTargetId, setSendingTargetId] = useState<string | null>(null);
    const [sentTargetIds, setSentTargetIds] = useState<Set<string>>(new Set());

    const profileUserId = String(profileUser?.id || profileUser?._id || profileUser?.userId || "");
    const profileName = profileUser?.displayName || profileUser?.name || "Người dùng";

    useEffect(() => {
        if (!visible) return;

        let active = true;
        setLoading(true);
        ConversationService.getConversations(1, 50)
            .then((items) => {
                if (!active) return;
                setTargets(
                    items
                        .map(toTarget)
                        .filter(Boolean)
                        .filter((target) => target!.id !== currentConversationId) as Target[],
                );
            })
            .catch((error: any) => {
                if (active) onError?.(error?.message || "Không tải được danh sách cuộc trò chuyện");
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, [visible, currentConversationId, onError]);

    const filteredTargets = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return targets;
        return targets.filter((target) => `${target.title} ${target.subtitle}`.toLowerCase().includes(needle));
    }, [targets, query]);

    const handleSend = async (target: Target) => {
        if (!profileUserId) return;
        setSendingTargetId(target.id);
        try {
            await profileCardService.sendProfileCard(target.id, { userId: profileUserId });
            setSentTargetIds((prev) => new Set(prev).add(target.id));
            onSent?.();
        } catch (error: any) {
            onError?.(
                error?.status === 403
                    ? "Người này đang ẩn danh thiếp hoặc không cho phép chia sẻ."
                    : error?.message || "Không gửi được danh thiếp",
            );
        } finally {
            setSendingTargetId(null);
        }
    };

    return (
        <Modal transparent visible={visible} animationType="slide" onRequestClose={onDismiss}>
            <Pressable style={styles.overlay} onPress={onDismiss}>
                <Pressable style={styles.sheet} onPress={() => { }}>
                    <View style={styles.handle} />
                    <View style={styles.header}>
                        <View style={styles.headerText}>
                            <Text style={styles.title}>Chia sẻ hồ sơ</Text>
                            <Text style={styles.subtitle} numberOfLines={1}>{profileName}</Text>
                        </View>
                        <Pressable style={styles.closeButton} onPress={onDismiss}>
                            <Ionicons name="close" size={22} color={colors.text} />
                        </Pressable>
                    </View>

                    <View style={styles.searchWrap}>
                        <Ionicons name="search" size={18} color={colors.textMuted} />
                        <TextInput
                            value={query}
                            onChangeText={setQuery}
                            placeholder="Tìm cuộc trò chuyện..."
                            placeholderTextColor={colors.textMuted}
                            style={styles.searchInput}
                        />
                    </View>

                    {loading ? (
                        <View style={styles.center}>
                            <ActivityIndicator color={colors.accent} />
                        </View>
                    ) : (
                        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
                            {filteredTargets.length === 0 ? (
                                <View style={styles.center}>
                                    <Text style={styles.emptyText}>Không có cuộc trò chuyện phù hợp</Text>
                                </View>
                            ) : (
                                filteredTargets.map((target) => {
                                    const sent = sentTargetIds.has(target.id);
                                    const sending = sendingTargetId === target.id;
                                    return (
                                        <View key={target.id} style={styles.row}>
                                            {target.avatar ? (
                                                <Image source={{ uri: target.avatar }} style={styles.avatar} />
                                            ) : (
                                                <Avatar label={target.title.slice(0, 1).toUpperCase()} size={44} backgroundColor={colors.accentStrong} />
                                            )}
                                            <View style={styles.rowMeta}>
                                                <Text style={styles.rowTitle} numberOfLines={1}>{target.title}</Text>
                                                <Text style={styles.rowSubtitle} numberOfLines={1}>{target.subtitle}</Text>
                                            </View>
                                            <Pressable
                                                style={[styles.sendButton, sent && styles.sentButton]}
                                                disabled={sent || sending}
                                                onPress={() => handleSend(target)}
                                            >
                                                {sending ? (
                                                    <ActivityIndicator size="small" color={colors.textOnAccent} />
                                                ) : (
                                                    <Text style={[styles.sendText, sent && styles.sentText]}>{sent ? "Đã gửi" : "Gửi"}</Text>
                                                )}
                                            </Pressable>
                                        </View>
                                    );
                                })
                            )}
                        </ScrollView>
                    )}
                </Pressable>
            </Pressable>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: colors.overlayDark50,
        justifyContent: "flex-end",
    },
    sheet: {
        maxHeight: "82%",
        minHeight: "58%",
        backgroundColor: colors.background,
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: 28,
    },
    handle: {
        alignSelf: "center",
        width: 42,
        height: 4,
        borderRadius: 2,
        backgroundColor: colors.overlayWhite30,
        marginBottom: 12,
    },
    header: {
        minHeight: 48,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    headerText: {
        flex: 1,
        minWidth: 0,
    },
    title: {
        color: colors.text,
        fontSize: 18,
        fontWeight: "800",
    },
    subtitle: {
        color: colors.textMuted,
        fontSize: 12,
        marginTop: 3,
    },
    closeButton: {
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
    },
    searchWrap: {
        minHeight: 48,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        borderRadius: 16,
        backgroundColor: colors.inputBgTransparent,
        borderWidth: 1,
        borderColor: colors.overlayWhite10,
        paddingHorizontal: 12,
        marginVertical: 10,
    },
    searchInput: {
        flex: 1,
        color: colors.text,
        fontSize: 14,
    },
    list: {
        gap: 8,
        paddingBottom: 16,
    },
    row: {
        minHeight: 64,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.overlayWhite10,
        backgroundColor: colors.surfaceSoftTransparent,
        padding: 10,
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.border,
    },
    rowMeta: {
        flex: 1,
        minWidth: 0,
    },
    rowTitle: {
        color: colors.text,
        fontSize: 15,
        fontWeight: "800",
    },
    rowSubtitle: {
        color: colors.textMuted,
        fontSize: 12,
        marginTop: 3,
    },
    sendButton: {
        minWidth: 72,
        minHeight: 44,
        borderRadius: 13,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.accentStrong,
        paddingHorizontal: 12,
    },
    sentButton: {
        backgroundColor: "rgba(34,197,94,0.16)",
        borderWidth: 1,
        borderColor: "rgba(34,197,94,0.34)",
    },
    sendText: {
        color: colors.textOnAccent,
        fontSize: 13,
        fontWeight: "800",
    },
    sentText: {
        color: "#22c55e",
    },
    center: {
        minHeight: 180,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 16,
    },
    emptyText: {
        color: colors.textMuted,
        fontSize: 14,
        textAlign: "center",
    },
});

export default ShareProfileCardSheet;
