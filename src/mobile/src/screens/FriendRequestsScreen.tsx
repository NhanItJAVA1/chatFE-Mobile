import React from "react";
import { Ionicons } from "@expo/vector-icons";
import {
    ActivityIndicator,
    Alert,
    Image,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { useFriendRequests } from "../../../shared/hooks";
import { Avatar, Card, PrimaryButton } from "../components";
import { colors } from "../theme";
import type { FriendRequestTransformed } from "@/shared/services/friendRequestService";

/**
 * FriendRequestsScreen - Screen for viewing and managing friend requests
 * 
 * Features:
 * - View received friend requests (with senderInfo)
 * - Accept or reject requests
 * - View request status and timestamps
 * - Pull-to-refresh
 * 
 * Uses: useFriendRequests hook with friendRequestService
 * Data is automatically transformed with senderInfo
 */
export const FriendRequestsScreen = () => {
    const {
        requests,
        loading,
        error,
        acceptRequest,
        declineRequest,
        refresh,
        pagination,
    } = useFriendRequests();

    // Handle accept request
    const handleAccept = async (requestId: string) => {
        try {
            const success = await acceptRequest(requestId);
            if (success) {
                Alert.alert("Success", "✅ Đã chấp nhận lời mời kết bạn!");
            } else {
                Alert.alert("Error", "❌ Vui lòng thử lại");
            }
        } catch (error: any) {
            Alert.alert("Error", error.message);
        }
    };

    // Handle decline request
    const handleDecline = async (requestId: string) => {
        Alert.alert("Xác nhận", "Bạn chắc chắn muốn từ chối?", [
            { text: "Huỷ" },
            {
                text: "Từ chối",
                onPress: async () => {
                    try {
                        const success = await declineRequest(requestId);
                        if (success) {
                            Alert.alert("Success", "✅ Đã từ chối lời mời!");
                        } else {
                            Alert.alert("Error", "❌ Vui lòng thử lại");
                        }
                    } catch (error: any) {
                        Alert.alert("Error", error.message);
                    }
                },
                style: "destructive",
            },
        ]);
    };

    // Render request card
    const renderRequestCard = (request: FriendRequestTransformed) => {
        const sender = request.senderInfo;
        if (!sender) return null;

        return (
            <Card key={request._id} style={styles.requestCard}>
                <View style={styles.requestHeader}>
                    {sender.avatar ? (
                        <Image
                            source={{ uri: sender.avatar }}
                            style={styles.avatar}
                        />
                    ) : (
                        <Avatar
                            label={(sender.displayName || "U").slice(0, 1).toUpperCase()}
                            size={50}
                            backgroundColor="#3d6df2"
                            textSize={20}
                        />
                    )}

                    <View style={styles.userInfo}>
                        <Text style={styles.userName}>{sender.displayName}</Text>
                        <Text style={styles.userPhone}>{sender.phoneNumber}</Text>
                        <View style={styles.statusRow}>
                            <View
                                style={[
                                    styles.statusDot,
                                    {
                                        backgroundColor:
                                            sender.status === "online"
                                                ? "#22c55e"
                                                : "#ef4444",
                                    },
                                ]}
                            />
                            <Text style={styles.statusText}>
                                {sender.status === "online"
                                    ? "Online"
                                    : "Offline"}
                            </Text>
                        </View>
                    </View>
                </View>

                <View style={styles.divider} />

                {/* Time info */}
                <Text style={styles.timeText}>
                    Gửi {new Date(request.createdAt).toLocaleDateString("vi-VN")}
                </Text>

                <View style={styles.divider} />

                {/* Action buttons */}
                <View style={styles.actionButtons}>
                    <PrimaryButton
                        label="Chấp nhận"
                        onPress={() => handleAccept(request._id)}
                        variant="primary"
                        style={styles.acceptButton}
                    />
                    <PrimaryButton
                        label="Từ chối"
                        onPress={() => handleDecline(request._id)}
                        variant="secondary"
                        style={styles.rejectButton}
                    />
                </View>
            </Card>
        );
    };

    return (
        <ScrollView
            style={styles.screen}
            contentContainerStyle={styles.screenContent}
            refreshControl={
                <RefreshControl refreshing={loading} onRefresh={refresh} />
            }
        >
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Lời Mời Kết Bạn</Text>
                {requests.length > 0 && (
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>
                            {requests.length}
                        </Text>
                    </View>
                )}
            </View>

            {/* Loading state */}
            {loading && requests.length === 0 && (
                <View style={styles.centerContent}>
                    <ActivityIndicator size="large" color={colors.accent} />
                    <Text style={styles.loadingText}>
                        Đang tải lời mời...
                    </Text>
                </View>
            )}

            {/* Error state */}
            {error && (
                <Card style={styles.errorCard}>
                    <View style={styles.errorContent}>
                        <Ionicons
                            name="alert-circle"
                            size={24}
                            color="#ef4444"
                        />
                        <Text style={styles.errorText}>
                            {error}
                        </Text>
                    </View>
                </Card>
            )}

            {/* No requests */}
            {!loading &&
                !error &&
                requests.length === 0 && (
                    <View style={styles.centerContent}>
                        <Ionicons
                            name="person-add-outline"
                            size={48}
                            color={colors.textMuted}
                        />
                        <Text style={styles.emptyText}>
                            Không có lời mời kết bạn nào
                        </Text>
                    </View>
                )}

            {/* Requests list */}
            {requests.map(renderRequestCard)}
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
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 20,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: "700",
        color: colors.text,
    },
    badge: {
        backgroundColor: colors.accent,
        borderRadius: 12,
        minWidth: 24,
        height: 24,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 8,
    },
    badgeText: {
        color: "white",
        fontSize: 12,
        fontWeight: "600",
    },
    requestCard: {
        marginBottom: 16,
        overflow: "hidden",
    },
    requestHeader: {
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
    divider: {
        height: 1,
        backgroundColor: colors.border,
        marginVertical: 12,
    },
    timeText: {
        fontSize: 13,
        color: colors.textMuted,
    },
    actionButtons: {
        flexDirection: "row",
        gap: 8,
    },
    acceptButton: {
        flex: 1,
    },
    rejectButton: {
        flex: 1,
    },
    centerContent: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 48,
    },
    loadingText: {
        marginTop: 12,
        color: colors.textMuted,
        fontSize: 14,
    },
    emptyText: {
        marginTop: 12,
        color: colors.textMuted,
        fontSize: 14,
    },
    errorCard: {
        marginBottom: 16,
        borderLeftWidth: 4,
        borderLeftColor: "#ef4444",
    },
    errorContent: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    errorText: {
        flex: 1,
        color: "#d32f2f",
        fontSize: 14,
    },
});
