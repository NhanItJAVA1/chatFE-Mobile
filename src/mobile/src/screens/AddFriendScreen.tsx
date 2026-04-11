import React, { useState } from "react";
import {
    Ionicons,
} from "@expo/vector-icons";
import {
    ActivityIndicator,
    Alert,
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { useFriendship } from "../../../shared/hooks";
import { Avatar, Card, PrimaryButton } from "../components";
import { colors } from "../theme";
import type { User } from "@/types";

/**
 * AddFriendScreen - Screen for searching and adding friends
 * 
 * Features:
 * - Search users by phone or name
 * - View friendship status
 * - Send friend request
 * - View mutual friends count
 */
export const AddFriendScreen = () => {
    const [searchQuery, setSearchQuery] = useState("");
    const { state, actions } = useFriendship();

    // Handle search
    const handleSearch = async () => {
        if (!searchQuery.trim()) {
            Alert.alert("Input", "Vui lòng nhập số điện thoại hoặc tên");
            return;
        }

        await actions.searchUsersQuery(searchQuery);
    };

    // Handle send friend request
    const handleSendRequest = async (userId: string) => {
        try {
            await actions.sendRequest(userId);
            Alert.alert("Success", "Lời mời kết bạn đã được gửi!");
        } catch (error: any) {
            Alert.alert("Error", error.message);
        }
    };

    // Render user search result
    const renderUserCard = (user: User) => {
        // Check if already sent request
        const sentRequest = state.sentRequests.find(
            (r) => r.receiverId === user.id
        );
        const isFriend = state.friends.some((f) => f.friendId === user.id);
        const status = state.friendshipStatuses.get(user.id);

        let buttonText = "Gửi lời mời";
        let isDisabledState = false;
        let buttonVariant: "primary" | "secondary" = "primary";

        if (isFriend || status?.status === "ACCEPTED") {
            buttonText = "Đã là bạn bè";
            isDisabledState = true;
            buttonVariant = "secondary";
        } else if (sentRequest || status?.status === "PENDING") {
            buttonText = "Đã gửi lời mời";
            isDisabledState = true;
            buttonVariant = "secondary";
        }

        return (
            <Card key={user.id} style={styles.userCard}>
                <View style={styles.userHeader}>
                    {user.avatar ? (
                        <Image
                            source={{ uri: user.avatar }}
                            style={styles.avatar}
                        />
                    ) : (
                        <Avatar
                            label={(user.displayName || "U").slice(0, 1).toUpperCase()}
                            size={50}
                            backgroundColor="#3d6df2"
                            textSize={20}
                        />
                    )}

                    <View style={styles.userInfo}>
                        <Text style={styles.userName}>{user.displayName}</Text>
                        <Text style={styles.userPhone}>{user.phoneNumber}</Text>
                        {user.status && (
                            <View style={styles.statusRow}>
                                <View
                                    style={[
                                        styles.statusDot,
                                        {
                                            backgroundColor:
                                                user.status === "online"
                                                    ? "#22c55e"
                                                    : "#ef4444",
                                        },
                                    ]}
                                />
                                <Text style={styles.statusText}>
                                    {user.status === "online"
                                        ? "🟢 Online"
                                        : "🔴 Offline"}
                                </Text>
                            </View>
                        )}
                    </View>
                </View>

                {user.bio && (
                    <>
                        <View style={styles.divider} />
                        <Text style={styles.userBio}>{user.bio}</Text>
                    </>
                )}

                <View style={styles.divider} />

                <PrimaryButton
                    label={buttonText}
                    onPress={() => !isDisabledState && handleSendRequest(user.id)}
                    variant={buttonVariant}
                />
            </Card>
        );
    };

    return (
        <ScrollView
            style={styles.screen}
            contentContainerStyle={styles.screenContent}
        >
            {/* Search Bar */}
            <View style={styles.searchContainer}>
                <View style={styles.searchInputContainer}>
                    <Ionicons
                        name="search"
                        size={20}
                        color={colors.textMuted}
                        style={styles.searchIcon}
                    />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Tìm kiếm theo SDT hoặc tên..."
                        placeholderTextColor={colors.textMuted}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        onSubmitEditing={handleSearch}
                    />
                    {searchQuery ? (
                        <Pressable
                            onPress={() => setSearchQuery("")}
                            style={styles.clearIcon}
                        >
                            <Ionicons
                                name="close-circle"
                                size={20}
                                color={colors.textMuted}
                            />
                        </Pressable>
                    ) : null}
                </View>

                <Pressable
                    onPress={handleSearch}
                    style={[styles.searchButton]}
                >
                    <Ionicons name="search" size={20} color="white" />
                </Pressable>
            </View>

            {/* Loading state */}
            {state.searchLoading && (
                <View style={styles.centerContent}>
                    <ActivityIndicator size="large" color={colors.accent} />
                    <Text style={styles.loadingText}>Đang tìm kiếm...</Text>
                </View>
            )}

            {/* Error state */}
            {state.searchError && (
                <Card style={styles.errorCard}>
                    <View style={styles.errorContent}>
                        <Ionicons
                            name="alert-circle"
                            size={24}
                            color="#ef4444"
                        />
                        <Text style={styles.errorText}>{state.searchError}</Text>
                    </View>
                </Card>
            )}

            {/* No results */}
            {!state.searchLoading &&
                !state.searchError &&
                state.searchResults.length === 0 &&
                searchQuery && (
                    <View style={styles.centerContent}>
                        <Ionicons
                            name="search"
                            size={48}
                            color={colors.textMuted}
                        />
                        <Text style={styles.emptyText}>Không tìm thấy người dùng</Text>
                    </View>
                )}

            {/* Search results */}
            {state.searchResults.map(renderUserCard)}

            {/* Initial state - no search */}
            {!state.searchLoading &&
                !state.searchError &&
                state.searchResults.length === 0 &&
                !searchQuery && (
                    <View style={styles.centerContent}>
                        <Ionicons
                            name="people-outline"
                            size={48}
                            color={colors.textMuted}
                        />
                        <Text style={styles.emptyText}>
                            Tìm kiếm người dùng để thêm bạn bè
                        </Text>
                    </View>
                )}
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: colors.background,
    },
    screenContent: {
        padding: 16,
        paddingBottom: 32,
    },
    searchContainer: {
        flexDirection: "row",
        gap: 8,
        marginBottom: 24,
    },
    searchInputContainer: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: 12,
        backgroundColor: colors.surface,
    },
    searchIcon: {
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        paddingVertical: 12,
        color: colors.text,
        fontSize: 14,
    },
    clearIcon: {
        padding: 4,
    },
    searchButton: {
        width: 48,
        height: 48,
        borderRadius: 8,
        backgroundColor: colors.accent,
        justifyContent: "center",
        alignItems: "center",
    },
    userCard: {
        marginBottom: 16,
        overflow: "hidden",
    },
    userHeader: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
    },
    avatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
    },
    userInfo: {
        flex: 1,
    },
    userName: {
        fontSize: 16,
        fontWeight: "600",
        color: colors.text,
        marginBottom: 4,
    },
    userPhone: {
        fontSize: 14,
        color: colors.textMuted,
        marginBottom: 4,
    },
    statusRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    statusText: {
        fontSize: 12,
        color: colors.textMuted,
    },
    userBio: {
        fontSize: 13,
        color: colors.textMuted,
        lineHeight: 18,
        marginVertical: 8,
    },
    divider: {
        height: 1,
        backgroundColor: colors.border,
        marginVertical: 12,
    },
    centerContent: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 60,
        gap: 12,
    },
    loadingText: {
        fontSize: 14,
        color: colors.textMuted,
        marginTop: 12,
    },
    emptyText: {
        fontSize: 14,
        color: colors.textMuted,
        textAlign: "center",
    },
    errorCard: {
        backgroundColor: "rgba(239, 68, 68, 0.1)",
        borderColor: "#ef4444",
        borderWidth: 1,
    },
    errorContent: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    errorText: {
        flex: 1,
        fontSize: 13,
        color: "#ef4444",
    },
});
