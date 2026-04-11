import React, { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
    ActivityIndicator,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { useAuth, useFriendship } from "../../../shared/hooks";
import { Avatar, Card, SectionTitle } from "../components";
import { colors } from "../theme";
import type { Friend } from "@/types";

export const HomeScreen = () => {
    const { user } = useAuth();
    const { state } = useFriendship();
    const [query, setQuery] = useState("");

    const truncateName = (name: string | undefined, maxLength = 20) => {
        if (!name || name.length <= maxLength) {
            return name;
        }
        return name.slice(0, Math.floor(maxLength / 2)) + "...";
    };

    const filteredFriends = useMemo(() => {
        const needle = query.trim().toLowerCase();
        const friendsList = state?.friends || [];

        if (!needle) {
            return friendsList;
        }

        return friendsList.filter((item: Friend) =>
            item?.friendInfo?.displayName?.toLowerCase().includes(needle) ||
            item?.friendInfo?.phoneNumber?.toLowerCase().includes(needle)
        );
    }, [state?.friends, query]);

    return (
        <View style={styles.screen}>
            <ScrollView
                contentContainerStyle={styles.homeContent}
                keyboardShouldPersistTaps="handled"
            >
                <View style={styles.homeTopRow}>
                    <View style={styles.brandPill}>
                        <Ionicons name="paper-plane" size={14} color={colors.text} />
                        <Text style={styles.brandText}>ChatChit</Text>
                    </View>
                    <View style={styles.actionCircle}>
                        <Ionicons name="create-outline" size={22} color={colors.text} />
                    </View>
                </View>

                <SectionTitle
                    title="Chat"
                    subtitle={
                        user?.displayName
                            ? `Hello, ${truncateName(user.displayName, 20)}`
                            : "Your recent conversations"
                    }
                    rightLabel="Sửa"
                />

                <View style={styles.searchBar}>
                    <Ionicons name="search" size={18} color={colors.textMuted} />
                    <TextInput
                        value={query}
                        onChangeText={setQuery}
                        placeholder="Search chats"
                        placeholderTextColor={colors.textMuted}
                        style={styles.searchInput}
                    />
                </View>

                <View style={styles.filterRow}>
                    <View style={[styles.filterChip, styles.filterChipActive]}>
                        <Text style={styles.filterTextActive}>All</Text>
                    </View>
                    <View style={styles.filterChip}>
                        <Text style={styles.filterText}>Unread</Text>
                    </View>
                    <View style={styles.filterChip}>
                        <Text style={styles.filterText}>Groups</Text>
                    </View>
                    <View style={styles.filterChip}>
                        <Text style={styles.filterText}>Calls</Text>
                    </View>
                </View>

                <Card style={styles.chatListCard}>
                    {state.friendsLoading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color={colors.accent} />
                            <Text style={styles.loadingText}>Đang tải bạn bè...</Text>
                        </View>
                    ) : filteredFriends.length === 0 ? (
                        <View style={styles.emptyContainer}>
                            <Ionicons
                                name="people-outline"
                                size={48}
                                color={colors.textMuted}
                            />
                            <Text style={styles.emptyText}>
                                {(state?.friends || []).length === 0
                                    ? "Chưa có bạn bè"
                                    : "Không tìm thấy kết quả"}
                            </Text>
                        </View>
                    ) : (
                        filteredFriends.map((friend: Friend, index: number) => {
                            if (!friend || !friend.friendInfo) return null;

                            return (
                                <View
                                    key={friend._id}
                                    style={[
                                        styles.chatRow,
                                        index !== filteredFriends.length - 1 &&
                                        styles.rowDivider,
                                    ]}
                                >
                                    {friend.friendInfo?.avatar ? (
                                        <Image
                                            source={{
                                                uri: friend.friendInfo.avatar,
                                            }}
                                            style={[
                                                styles.avatarImage,
                                                { width: 54, height: 54, borderRadius: 27 },
                                            ]}
                                        />
                                    ) : (
                                        <Avatar
                                            label={(friend.friendInfo?.displayName || "U").slice(0, 1).toUpperCase()}
                                            size={54}
                                            backgroundColor="#3d6df2"
                                            textSize={16}
                                        />
                                    )}
                                    <View style={styles.chatMeta}>
                                        <View style={styles.chatTopLine}>
                                            <Text
                                                style={styles.chatName}
                                                numberOfLines={1}
                                            >
                                                {truncateName(friend.friendInfo?.displayName)}
                                            </Text>
                                            <View
                                                style={[
                                                    styles.statusDot,
                                                    {
                                                        backgroundColor:
                                                            friend.friendInfo?.status === "online"
                                                                ? "#22c55e"
                                                                : "#ef4444",
                                                    },
                                                ]}
                                            />
                                        </View>
                                        <View style={styles.chatBottomLine}>
                                            <Text
                                                style={styles.chatMessage}
                                                numberOfLines={1}
                                            >
                                                {friend.friendInfo?.status === "online"
                                                    ? "Online"
                                                    : "Offline"}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            );
                        })
                    )}
                </Card>
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: colors.background,
    },
    homeContent: {
        padding: 16,
        paddingBottom: 96,
        gap: 14,
    },
    homeTopRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    brandPill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        alignSelf: "center",
        backgroundColor: "#143f7f",
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
    },
    brandText: {
        color: colors.text,
        fontWeight: "800",
        letterSpacing: 0.8,
    },
    actionCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: "center",
        justifyContent: "center",
    },
    searchBar: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 22,
        paddingHorizontal: 14,
        height: 50,
    },
    searchInput: {
        flex: 1,
        color: colors.text,
        fontSize: 15,
    },
    filterRow: {
        flexDirection: "row",
        gap: 10,
    },
    filterChip: {
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 9,
    },
    filterChipActive: {
        backgroundColor: "rgba(59,130,246,0.18)",
        borderColor: "rgba(59,130,246,0.32)",
    },
    filterText: {
        color: colors.textSoft,
        fontWeight: "600",
        fontSize: 12,
    },
    filterTextActive: {
        color: colors.text,
        fontWeight: "700",
        fontSize: 12,
    },
    chatListCard: {
        padding: 0,
        overflow: "hidden",
    },
    loadingContainer: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 60,
        gap: 12,
    },
    loadingText: {
        color: colors.textMuted,
        fontSize: 14,
        marginTop: 12,
    },
    emptyContainer: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 60,
        gap: 12,
    },
    emptyText: {
        color: colors.textMuted,
        fontSize: 14,
        marginTop: 12,
    },
    chatRow: {
        flexDirection: "row",
        gap: 12,
        padding: 14,
        alignItems: "center",
    },
    rowDivider: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
    },
    chatMeta: {
        flex: 1,
        gap: 5,
    },
    chatTopLine: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
    },
    chatName: {
        flex: 1,
        color: colors.text,
        fontSize: 16,
        fontWeight: "800",
    },
    statusDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    chatTime: {
        color: colors.textMuted,
        fontSize: 12,
        flexShrink: 0,
    },
    chatBottomLine: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    chatMessage: {
        flex: 1,
        color: colors.textSoft,
        fontSize: 13,
    },
    avatarImage: {
        resizeMode: "cover",
    },
});
