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
import { getFriendsWithEnrichment, searchUsers } from "../../../shared/services/friendService";
import { Avatar } from "./Avatar";
import { colors } from "../theme";
import type { Friend, User } from "@/types";

export type ContactPickerUser = {
    id: string;
    displayName: string;
    subtitle?: string;
    avatar?: string;
};

interface ContactPickerSheetProps {
    visible: boolean;
    currentUserId: string;
    title?: string;
    sentUserIds?: Set<string>;
    sendingUserId?: string | null;
    onDismiss: () => void;
    onSend: (user: ContactPickerUser) => Promise<void> | void;
}

const normalizeUserId = (value: any): string => String(value?.id || value?._id || value?.userId || "");

const fromFriend = (friend: Friend): ContactPickerUser => ({
    id: friend.friendId,
    displayName: friend.friendInfo?.displayName || "Người dùng",
    subtitle: friend.friendInfo?.phoneNumber || "Bạn bè",
    avatar: friend.friendInfo?.avatar,
});

const fromUser = (user: User): ContactPickerUser => ({
    id: normalizeUserId(user),
    displayName: user.displayName || (user as any).name || (user as any).username || "Người dùng",
    subtitle: user.phone || (user as any).phoneNumber || "Kết quả tìm kiếm",
    avatar: user.avatar || (user as any).avatarUrl,
});

export const ContactPickerSheet: React.FC<ContactPickerSheetProps> = ({
    visible,
    currentUserId,
    title = "Chia sẻ liên hệ",
    sentUserIds = new Set(),
    sendingUserId,
    onDismiss,
    onSend,
}) => {
    const [tab, setTab] = useState<"friends" | "search">("friends");
    const [query, setQuery] = useState("");
    const [friends, setFriends] = useState<ContactPickerUser[]>([]);
    const [searchResults, setSearchResults] = useState<ContactPickerUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [searching, setSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!visible) return;

        let active = true;
        setLoading(true);
        setError(null);
        getFriendsWithEnrichment(currentUserId)
            .then((items) => {
                if (active) setFriends(items.map(fromFriend).filter((item) => !!item.id));
            })
            .catch((err: any) => {
                if (active) setError(err?.message || "Không tải được danh sách liên hệ");
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, [visible, currentUserId]);

    useEffect(() => {
        if (!visible || tab !== "search") return;
        const trimmed = query.trim();
        if (!trimmed) {
            setSearchResults([]);
            return;
        }

        let active = true;
        const timeout = setTimeout(() => {
            setSearching(true);
            searchUsers(trimmed)
                .then((items) => {
                    if (!active) return;
                    setSearchResults(
                        items
                            .map(fromUser)
                            .filter((item) => item.id && item.id !== currentUserId),
                    );
                })
                .catch(() => {
                    if (active) setSearchResults([]);
                })
                .finally(() => {
                    if (active) setSearching(false);
                });
        }, 350);

        return () => {
            active = false;
            clearTimeout(timeout);
        };
    }, [visible, tab, query, currentUserId]);

    const filteredFriends = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle || tab !== "friends") return friends;
        return friends.filter((item) => `${item.displayName} ${item.subtitle || ""}`.toLowerCase().includes(needle));
    }, [friends, query, tab]);

    const items = tab === "friends" ? filteredFriends : searchResults;

    return (
        <Modal transparent visible={visible} animationType="slide" onRequestClose={onDismiss}>
            <Pressable style={styles.overlay} onPress={onDismiss}>
                <Pressable style={styles.sheet} onPress={() => { }}>
                    <View style={styles.handle} />
                    <View style={styles.header}>
                        <Text style={styles.title}>{title}</Text>
                        <Pressable style={styles.closeButton} onPress={onDismiss}>
                            <Ionicons name="close" size={22} color={colors.text} />
                        </Pressable>
                    </View>

                    <View style={styles.tabRow}>
                        <Pressable style={[styles.tab, tab === "friends" && styles.tabActive]} onPress={() => setTab("friends")}>
                            <Text style={[styles.tabText, tab === "friends" && styles.tabTextActive]}>Bạn bè</Text>
                        </Pressable>
                        <Pressable style={[styles.tab, tab === "search" && styles.tabActive]} onPress={() => setTab("search")}>
                            <Text style={[styles.tabText, tab === "search" && styles.tabTextActive]}>Tìm kiếm</Text>
                        </Pressable>
                    </View>

                    <View style={styles.searchWrap}>
                        <Ionicons name="search" size={18} color={colors.textMuted} />
                        <TextInput
                            value={query}
                            onChangeText={setQuery}
                            placeholder={tab === "friends" ? "Tìm trong bạn bè..." : "Tìm người dùng..."}
                            placeholderTextColor={colors.textMuted}
                            style={styles.searchInput}
                        />
                    </View>

                    {error ? <Text style={styles.errorText}>{error}</Text> : null}
                    {(loading || searching) && items.length === 0 ? (
                        <View style={styles.center}>
                            <ActivityIndicator color={colors.accent} />
                        </View>
                    ) : (
                        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
                            {items.length === 0 ? (
                                <View style={styles.center}>
                                    <Text style={styles.emptyText}>
                                        {tab === "search" && !query.trim() ? "Nhập từ khóa để tìm liên hệ" : "Không có liên hệ phù hợp"}
                                    </Text>
                                </View>
                            ) : (
                                items.map((item) => {
                                    const sent = sentUserIds.has(item.id);
                                    const sending = sendingUserId === item.id;
                                    return (
                                        <View key={item.id} style={styles.row}>
                                            {item.avatar ? (
                                                <Image source={{ uri: item.avatar }} style={styles.avatar} />
                                            ) : (
                                                <Avatar label={item.displayName.slice(0, 1).toUpperCase()} size={44} backgroundColor={colors.accentStrong} />
                                            )}
                                            <View style={styles.rowMeta}>
                                                <Text style={styles.rowTitle} numberOfLines={1}>{item.displayName}</Text>
                                                <Text style={styles.rowSubtitle} numberOfLines={1}>{item.subtitle || "Người dùng"}</Text>
                                            </View>
                                            <Pressable
                                                style={[styles.sendButton, sent && styles.sentButton]}
                                                disabled={sent || sending}
                                                onPress={() => onSend(item)}
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
        minHeight: 44,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    title: {
        color: colors.text,
        fontSize: 18,
        fontWeight: "800",
    },
    closeButton: {
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
    },
    tabRow: {
        flexDirection: "row",
        gap: 8,
        marginVertical: 10,
    },
    tab: {
        flex: 1,
        minHeight: 40,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.overlayWhite10,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.surfaceTransparent,
    },
    tabActive: {
        backgroundColor: "rgba(79,140,255,0.18)",
        borderColor: "rgba(79,140,255,0.4)",
    },
    tabText: {
        color: colors.textSoft,
        fontSize: 13,
        fontWeight: "700",
    },
    tabTextActive: {
        color: colors.text,
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
        marginBottom: 10,
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
    errorText: {
        color: colors.dangerSoft,
        fontSize: 13,
        marginBottom: 8,
    },
});

export default ContactPickerSheet;
