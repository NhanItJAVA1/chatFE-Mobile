import React, { useMemo, useState, useRef, useEffect } from "react";
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
import userService from "../../../shared/services/userService";
import type { User } from "@/types";
import type { UseFriendshipState, UseFriendshipActions } from "../../../shared/hooks/useFriendship";

interface AddFriendScreenProps {
    state: UseFriendshipState;
    actions: UseFriendshipActions;
    onChatPress?: (user: User) => void;
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
export const AddFriendScreen = ({ state, actions, onChatPress }: AddFriendScreenProps) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [sentRequestUsers, setSentRequestUsers] = useState<Record<string, User>>({});

    // Store mapping of userId -> full request object for quick lookup during cancel
    const sentRequestMapRef = useRef<Map<string, any>>(new Map());
    const fetchingSentUserIdsRef = useRef<Set<string>>(new Set());
    // Track the last userId we sent a request to (for matching with incomplete API response)
    const lastSentUserIdRef = useRef<string | null>(null);

    // Load sent requests when component mounts (on AddFriend screen enter)
    useEffect(() => {
        actions.loadSentRequests();
    }, []); // Only run on mount, not on actions change

    const getRequestReceiverId = (request: any): string => {
        return String(
            request?.receiverId ||
            request?.toUserId ||
            request?.recipientId ||
            request?.userId ||
            request?.receiver?.id ||
            request?.receiver?._id ||
            request?.receiverInfo?.id ||
            request?.receiverInfo?._id ||
            ""
        );
    };

    const getSentRequestUser = (request: any): User => {
        const receiver = request?.receiverInfo || request?.receiver || request?.recipient || request?.toUser || request?.user || {};
        const id = getRequestReceiverId(request);
        const enrichedUser = sentRequestUsers[id];
        if (enrichedUser) {
            return enrichedUser;
        }

        const phone = receiver.phoneNumber || receiver.phone || request?.receiverPhone || "";
        const resolvedName =
            receiver.displayName ||
            receiver.name ||
            receiver.username ||
            request?.receiverName ||
            request?.displayName ||
            request?.name ||
            (phone ? phone : (id ? `User #${id.slice(-6)}` : ""));

        return {
            id,
            _id: id,
            email: receiver.email || "",
            displayName: resolvedName || "Đang tải...",
            phoneNumber: phone,
            avatar: receiver.avatar || receiver.avatarUrl || request?.receiverAvatar || "",
            avatarUrl: receiver.avatarUrl || receiver.avatar || request?.receiverAvatar || "",
            status: receiver.status || receiver.presenceStatus || "offline",
        } as User;
    };

    useEffect(() => {
        const missingUserIds = state.sentRequests
            .filter((request: any) => String(request?.status || "pending").toLowerCase() === "pending")
            .map((request: any) => getRequestReceiverId(request))
            .filter((userId) => {
                if (!userId || userId === "undefined" || userId === "null") {
                    return false;
                }

                if (sentRequestUsers[userId] || fetchingSentUserIdsRef.current.has(userId)) {
                    return false;
                }

                const request: any = state.sentRequests.find((item: any) => getRequestReceiverId(item) === userId);
                const receiver = request?.receiverInfo || request?.receiver || request?.recipient || request?.toUser || request?.user;
                if (receiver?.displayName && !receiver.displayName.startsWith("Đang tải") && !receiver.displayName.startsWith("User #")) return false;
                return !receiver?.displayName && !receiver?.name && !receiver?.username || true;
            });

        if (missingUserIds.length === 0) {
            return;
        }

        missingUserIds.forEach((userId) => fetchingSentUserIdsRef.current.add(userId));

        let isActive = true;
        Promise.all(
            missingUserIds.map(async (userId) => {
                const profile = await userService.getUserById(userId);
                return { userId, profile };
            })
        )
            .then((items) => {
                if (!isActive) return;

                setSentRequestUsers((current) => {
                    const next = { ...current };
                    items.forEach(({ userId, profile }) => {
                        if (!profile) return;
                        next[userId] = {
                            id: profile.id || profile._id || userId,
                            _id: profile._id || profile.id || userId,
                            email: profile.email || "",
                            displayName: profile.displayName || profile.name || profile.username || profile.phoneNumber || profile.phone || "Người dùng",
                            phoneNumber: profile.phoneNumber || profile.phone || "",
                            phone: profile.phone || profile.phoneNumber || "",
                            avatar: profile.avatar || profile.avatarUrl || "",
                            avatarUrl: profile.avatarUrl || profile.avatar || "",
                            status: profile.status || profile.presenceStatus || "offline",
                        } as User;
                    });
                    return next;
                });
            })
            .finally(() => {
                missingUserIds.forEach((userId) => fetchingSentUserIdsRef.current.delete(userId));
            });

        return () => {
            isActive = false;
        };
    }, [state.sentRequests, sentRequestUsers]);

    const sentRequestItems = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        const searchResultIds = new Set(
            state.searchResults
                .map((user) => String(user.id || (user as any)._id || ""))
                .filter(Boolean)
        );

        return state.sentRequests
            .filter((request: any) => String(request?.status || "pending").toLowerCase() === "pending")
            .map((request: any) => ({
                request,
                user: getSentRequestUser(request),
            }))
            .filter(({ user }) => {
                const userId = String(user.id || (user as any)._id || "");
                if (searchResultIds.has(userId)) {
                    return false;
                }

                if (!query) {
                    return true;
                }

                const haystack = [
                    user.displayName,
                    user.name,
                    (user as any).username,
                    user.phone,
                    (user as any).phoneNumber,
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();

                return haystack.includes(query);
            });
    }, [searchQuery, sentRequestUsers, state.searchResults, state.sentRequests]);

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
            lastSentUserIdRef.current = userId;

            // Capture the returned request object
            const sentRequest = await actions.sendRequest(userId);
            if (sentRequest) {
                // Store the full request object for use during cancel
                sentRequestMapRef.current.set(userId, sentRequest);
                const requestId = (sentRequest as any).id || sentRequest._id;
            }

            Alert.alert("Success", "Lời mời kết bạn đã được gửi!");
        } catch (error: any) {
            Alert.alert("Error", error.message);
        }
    };

    // Handle cancel sent request
    const handleCancelRequest = async (userId: string) => {
        // First, try to use the stored request object from when we sent it
        let requestId: string | undefined;
        let storedRequest = sentRequestMapRef.current.get(userId);

        if (storedRequest) { requestId = (storedRequest as any).id || storedRequest._id; } else {
            const sentRequest = state.sentRequests.find(r => {
                const receiverId = getRequestReceiverId(r);
                const matches = receiverId === String(userId);
                if (matches) return matches;
            });

            if (sentRequest) {
                requestId = (sentRequest as any).id || sentRequest._id;
            }
        }
        if (!requestId) {
            console.warn('[AddFriendScreen] Could not find requestId for userId:', userId);
            Alert.alert("Error", "Không tìm thấy lời mời để hủy");
            return;
        }
        const onConfirm = async () => {
            try {
                await actions.cancelRequest(requestId); actions.removeSentRequest(requestId);

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
                    onPress: () => { },
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
        const userId = user.id || (user as any)._id; if (state.sentRequests.length > 0) { }

        // Check if already sent request
        const sentRequest = state.sentRequests.find(
            (r) => {
                return getRequestReceiverId(r) === String(userId);
            }
        );
        const isFriend = state.friends.some((f) => f.friendId === userId);
        const status = state.friendshipStatuses.get(userId); let buttonText = "Gửi lời mời";
        let isDisabledState = false;
        let buttonVariant: "primary" | "secondary" = "primary";
        let buttonAction = () => handleSendRequest(userId);

        if (isFriend || status?.status === "accepted") {
            buttonText = "Đã là bạn bè";
            isDisabledState = true;
            buttonVariant = "secondary";
        } else if (sentRequest || status?.status === "pending") {
            buttonText = "Hủy lời mời";
            isDisabledState = false;
            buttonVariant = "secondary";
            buttonAction = () => handleCancelRequest(userId);
        }
        return (
            <Card key={userId} style={styles.userCard}>
                <View style={styles.userHeader}>
                    {user.avatar || user.avatarUrl ? (
                        <Image
                            source={{ uri: user.avatar || user.avatarUrl }}
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

                <View style={styles.actionRow}>
                    <View style={styles.friendAction}>
                        <PrimaryButton
                            label={buttonText}
                            onPress={() => {
                                if (!isDisabledState) {
                                    buttonAction();
                                } else { }
                            }}
                            variant={buttonVariant}
                        />
                    </View>
                    <Pressable
                        onPress={() => onChatPress?.({ ...user, id: userId })}
                        style={({ pressed }) => [
                            styles.chatButton,
                            pressed && styles.chatButtonPressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="Bắt đầu chat"
                    >
                        <Ionicons name="chatbubble-ellipses" size={22} color={colors.textOnAccent} />
                    </Pressable>
                </View>
            </Card>
        );
    };

    const renderSentRequestCard = ({ request, user }: { request: any; user: User }) => {
        const userId = String(user.id || (user as any)._id || getRequestReceiverId(request));

        return (
            <Card key={(request as any)._id || (request as any).id || userId} style={styles.userCard}>
                <View style={styles.userHeader}>
                    {user.avatar || user.avatarUrl ? (
                        <Image
                            source={{ uri: user.avatar || user.avatarUrl }}
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
                        {!!(user as any).phoneNumber && <Text style={styles.userPhone}>{(user as any).phoneNumber}</Text>}
                        <View style={styles.sentRequestBadge}>
                            <Ionicons name="time-outline" size={13} color={colors.accent} />
                            <Text style={styles.sentRequestBadgeText}>Đã gửi lời mời</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.divider} />

                <View style={styles.actionRow}>
                    <View style={styles.friendAction}>
                        <PrimaryButton
                            label="Hủy lời mời"
                            onPress={() => handleCancelRequest(userId)}
                            variant="secondary"
                        />
                    </View>
                    <Pressable
                        onPress={() => onChatPress?.({ ...user, id: userId })}
                        style={({ pressed }) => [
                            styles.chatButton,
                            pressed && styles.chatButtonPressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="Bắt đầu chat"
                    >
                        <Ionicons name="chatbubble-ellipses" size={22} color={colors.textOnAccent} />
                    </Pressable>
                </View>
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
                sentRequestItems.length === 0 &&
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

            {sentRequestItems.length > 0 && (
                <View style={styles.sentSection}>
                    <Text style={styles.sectionTitle}>Lời mời đã gửi</Text>
                    {sentRequestItems.map(renderSentRequestCard)}
                </View>
            )}

            {/* Initial state - no search */}
            {!state.searchLoading &&
                !state.searchError &&
                state.searchResults.length === 0 &&
                sentRequestItems.length === 0 &&
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
        backgroundColor: "transparent",
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
        borderColor: colors.overlayWhite10,
        paddingHorizontal: 12,
        backgroundColor: colors.surfaceSoftTransparent,
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
    sentSection: {
        marginTop: 4,
    },
    sectionTitle: {
        color: colors.text,
        fontSize: 14,
        fontWeight: "800",
        marginBottom: 10,
    },
    sentRequestBadge: {
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 4,
        backgroundColor: "rgba(63, 140, 255, 0.14)",
        borderWidth: 1,
        borderColor: "rgba(63, 140, 255, 0.28)",
    },
    sentRequestBadgeText: {
        color: colors.accent,
        fontSize: 12,
        fontWeight: "800",
    },
    divider: {
        height: 1,
        backgroundColor: colors.border,
        marginVertical: 12,
    },
    actionRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    friendAction: {
        flex: 1,
    },
    chatButton: {
        width: 48,
        height: 48,
        borderRadius: 8,
        backgroundColor: colors.accent,
        alignItems: "center",
        justifyContent: "center",
    },
    chatButtonPressed: {
        opacity: 0.75,
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
