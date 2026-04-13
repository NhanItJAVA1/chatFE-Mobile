import React, { useState, useRef } from "react";
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
import { Avatar, Card, PrimaryButton } from "../components";
import { colors } from "../theme";
import type { User } from "@/types";
import type { UseFriendshipState, UseFriendshipActions } from "../../../shared/hooks/useFriendship";

interface AddFriendScreenProps {
    state: UseFriendshipState;
    actions: UseFriendshipActions;
}

/**
 * AddFriendScreen - Screen for searching and adding friends
 * 
 * Features:
 * - Search users by phone or name
 * - View friendship status
 * - Send friend request
 * - View mutual friends count
 */
export const AddFriendScreen = ({ state, actions }: AddFriendScreenProps) => {
    const [searchQuery, setSearchQuery] = useState("");

    // Store mapping of userId -> full request object for quick lookup during cancel
    const sentRequestMapRef = useRef<Map<string, any>>(new Map());
    // Track the last userId we sent a request to (for matching with incomplete API response)
    const lastSentUserIdRef = useRef<string | null>(null);

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
            console.log('[AddFriendScreen] Sending friend request to userId:', userId);
            lastSentUserIdRef.current = userId;

            // Capture the returned request object
            const sentRequest = await actions.sendRequest(userId);
            console.log('[AddFriendScreen] Received request object:', JSON.stringify(sentRequest, null, 2));

            if (sentRequest) {
                // Store the full request object for use during cancel
                sentRequestMapRef.current.set(userId, sentRequest);
                const requestId = (sentRequest as any).id || sentRequest._id;
                console.log('[AddFriendScreen] Stored request for userId:', userId, 'with id:', requestId);
            }

            Alert.alert("Success", "Lời mời kết bạn đã được gửi!");
        } catch (error: any) {
            Alert.alert("Error", error.message);
        }
    };

    // Handle cancel sent request
    const handleCancelRequest = async (userId: string) => {
        console.log('[AddFriendScreen] handleCancelRequest called with userId:', userId);

        // First, try to use the stored request object from when we sent it
        let requestId: string | undefined;
        let storedRequest = sentRequestMapRef.current.get(userId);

        if (storedRequest) {
            console.log('[AddFriendScreen] Found stored request:', JSON.stringify(storedRequest, null, 2));
            requestId = (storedRequest as any).id || storedRequest._id;
            console.log('[AddFriendScreen] Using stored request id:', requestId);
        } else {
            // Fallback: try to find in current state
            console.log('[AddFriendScreen] No stored request, searching in state.sentRequests...');
            console.log('[AddFriendScreen] state.sentRequests:', JSON.stringify(state.sentRequests, null, 2));

            const sentRequest = state.sentRequests.find(r => {
                const receiverId = r.receiverId || (r as any).toUserId;
                const matches = receiverId === userId;
                if (matches) console.log('[AddFriendScreen] Found request in state with id:', (r as any).id);
                return matches;
            });

            if (sentRequest) {
                requestId = (sentRequest as any).id || sentRequest._id;
                console.log('[AddFriendScreen] Found in state, id:', requestId);
            }
        }

        console.log('[AddFriendScreen] Final requestId:', requestId);

        if (!requestId) {
            console.warn('[AddFriendScreen] Could not find requestId for userId:', userId);
            Alert.alert("Error", "Không tìm thấy lời mời để hủy");
            return;
        }

        console.log('[AddFriendScreen] About to show Alert dialog with requestId:', requestId);

        const onConfirm = async () => {
            console.log('[AddFriendScreen] onConfirm callback executed with requestId:', requestId);
            try {
                console.log('[AddFriendScreen] Calling cancelRequest with id:', requestId);
                await actions.cancelRequest(requestId);
                console.log('[AddFriendScreen] Cancel API succeeded, updating status locally');

                // Remove from state.sentRequests so button text changes back to "Gửi lời mời"
                console.log('[AddFriendScreen] Removing request from sentRequests');
                actions.removeSentRequest(requestId);

                // Reset the friendship status to NONE (redundant but ensures status is correct)
                (actions as any).resetFriendshipStatus(userId);

                // Clear stored request
                sentRequestMapRef.current.delete(userId);
                lastSentUserIdRef.current = null;

                Alert.alert("Success", "✅ Đã hủy lời mời!");
            } catch (error: any) {
                console.error('[AddFriendScreen] Cancel error:', error);
                Alert.alert("Error", error.message);
            }
        };

        Alert.alert(
            "Xác nhận",
            "Bạn chắc chắn muốn hủy lời mời?",
            [
                {
                    text: "Không",
                    onPress: () => console.log('[AddFriendScreen] User pressed Không button')
                },
                {
                    text: "Hủy",
                    onPress: onConfirm,
                    style: "destructive",
                },
            ]
        );
    };

    // Render user search result
    const renderUserCard = (user: User) => {
        console.log('[AddFriendScreen] renderUserCard for user:', user.id);

        // Log all sentRequests with details
        console.log('[AddFriendScreen] Total sentRequests:', state.sentRequests.length);
        if (state.sentRequests.length > 0) {
            console.log('[AddFriendScreen] sentRequests details:', JSON.stringify(state.sentRequests.map(r => ({ _id: r._id, receiverId: r.receiverId, status: (r as any).status })), null, 2));
        }

        // Check if already sent request
        const sentRequest = state.sentRequests.find(
            (r) => {
                console.log('[AddFriendScreen] Comparing - r.receiverId:', r.receiverId, 'user.id:', user.id, 'match:', r.receiverId === user.id);
                return r.receiverId === user.id;
            }
        );
        console.log('[AddFriendScreen] Found sentRequest for user:', sentRequest?._id);

        const isFriend = state.friends.some((f) => f.friendId === user.id);
        const status = state.friendshipStatuses.get(user.id);
        console.log('[AddFriendScreen] Status for user:', status);
        console.log('[AddFriendScreen] Button condition check - sentRequest:', !!sentRequest, 'status.status:', status?.status);

        let buttonText = "Gửi lời mời";
        let isDisabledState = false;
        let buttonVariant: "primary" | "secondary" = "primary";
        let buttonAction = () => handleSendRequest(user.id);

        if (isFriend || status?.status === "accepted") {
            buttonText = "Đã là bạn bè";
            isDisabledState = true;
            buttonVariant = "secondary";
        } else if (sentRequest || status?.status === "pending") {
            buttonText = "Hủy lời mời";
            isDisabledState = false;
            buttonVariant = "secondary";
            buttonAction = () => handleCancelRequest(user.id);
            console.log('[AddFriendScreen] BUTTON SET TO CANCEL for user:', user.id);
        }

        console.log('[AddFriendScreen] Button final state - text:', buttonText, 'disabled:', isDisabledState);

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
                    onPress={() => {
                        console.log('[AddFriendScreen] Button pressed - buttonText:', buttonText, 'isDisabled:', isDisabledState);
                        if (!isDisabledState) {
                            console.log('[AddFriendScreen] Calling buttonAction');
                            buttonAction();
                        } else {
                            console.log('[AddFriendScreen] Button disabled, skipping action');
                        }
                    }}
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
