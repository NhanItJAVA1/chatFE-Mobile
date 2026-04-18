import React, { useState, useCallback, useEffect } from "react";
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    Pressable,
    ActivityIndicator,
    Alert,
    Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth, useGroupChat, useFriendship } from "../../../shared/hooks";
import { SocketService } from "../../../shared/services";
import { Avatar, PrimaryButton } from "../components";
import { colors } from "../theme";
import type { Friend } from "@/types";

interface AddMembersScreenProps {
    route?: any;
    onBackPress?: () => void;
}

/**
 * AddMembersScreen - Screen to add new members to an existing group
 * Shows friends who are not already in the group
 */
export const AddMembersScreen: React.FC<AddMembersScreenProps> = ({
    route,
    onBackPress,
}) => {
    const { user } = useAuth();
    const groupId = route?.params?.groupId;

    const { state: groupState, actions: groupActions } = useGroupChat();
    const { state: friendshipState, actions: friendshipActions } = useFriendship();

    // State
    const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
    const [isAdding, setIsAdding] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Load group members and friends on mount
    useEffect(() => {
        const loadData = async () => {
            try {
                setIsLoading(true);
                setError(null);

                // Load group info to get current members
                await groupActions.loadGroupInfo(groupId);
                await groupActions.loadMembers(groupId);

                // Load friends list
                if (friendshipState.friends.length === 0 && !friendshipState.friendsLoading) {
                    await friendshipActions.loadFriends();
                }
            } catch (err: any) {
                setError(err.message || "Failed to load data");
            } finally {
                setIsLoading(false);
            }
        };

        if (groupId) {
            loadData();
        }
    }, [groupId]);

    // Get list of current group member IDs
    const currentMemberIds = new Set(
        groupState.members?.map(m => m.userId) || []
    );

    // Filter friends to show only those not in the group
    const availableFriends = friendshipState.friends.filter(
        friend => !currentMemberIds.has(friend.friendId)
    );

    const toggleMember = useCallback((friendId: string) => {
        setSelectedMembers((prev) => {
            const next = new Set(prev);
            if (next.has(friendId)) {
                next.delete(friendId);
            } else {
                next.add(friendId);
            }
            return next;
        });
    }, []);

    const handleAddMembers = useCallback(async () => {
        try {
            if (selectedMembers.size === 0) {
                Alert.alert("Lỗi", "Vui lòng chọn ít nhất một thành viên");
                return;
            }

            setIsAdding(true);
            setError(null);

            // Add members to group
            const memberIds = Array.from(selectedMembers);
            await groupActions.addMembers(groupId, memberIds);

            // Get names of selected members for system message
            const selectedFriendNames: string[] = [];
            memberIds.forEach((memberId) => {
                const friend = friendshipState.friends.find(
                    (f) => f.friendId === memberId
                );
                if (friend?.friendInfo?.displayName) {
                    selectedFriendNames.push(friend.friendInfo.displayName);
                }
            });

            // Send system message if members were added successfully
            if (selectedFriendNames.length > 0) {
                // Get current user's name from group members (enriched with user data)
                const currentUserIdToMatch = user?.id || (user as any)?._id;
                const currentUserMember = groupState.members?.find(
                    (m) => m.userId === currentUserIdToMatch
                );
                const currentUserName = currentUserMember?.name || user?.displayName || user?.name || "Người dùng";

                const memberNames = selectedFriendNames.join(", ");
                const systemMessage =
                    selectedFriendNames.length === 1
                        ? `${currentUserName} đã thêm ${memberNames} vào nhóm`
                        : `${currentUserName} đã thêm ${memberNames} vào nhóm`;

                try {
                    await SocketService.sendMessage({
                        conversationId: groupId,
                        conversationType: "GROUP",
                        text: systemMessage,
                        isSystemMessage: true,
                        type: "system",
                        media: [],
                    });
                } catch (messageError) {
                    console.error("[AddMembersScreen] Error sending system message:", messageError);
                    // Don't fail the operation if system message fails
                }
            }

            // Success
            Alert.alert("Thành công", "Thành viên đã được thêm vào nhóm", [
                {
                    text: "OK",
                    onPress: () => {
                        if (onBackPress) {
                            onBackPress();
                        }
                    },
                },
            ]);
        } catch (err: any) {
            Alert.alert("Lỗi", err.message || "Failed to add members");
        } finally {
            setIsAdding(false);
        }
    }, [selectedMembers, groupId, groupActions, groupState.members, friendshipState.friends, user, onBackPress]);

    const renderHeader = () => (
        <View style={styles.header}>
            <Pressable style={styles.backButton} onPress={onBackPress}>
                <Ionicons name="chevron-back" size={24} color={colors.text} />
            </Pressable>
            <View style={styles.headerTitleArea}>
                <Text style={styles.headerTitle}>Thêm thành viên</Text>
                <Text style={styles.headerSubtitle}>
                    {selectedMembers.size > 0
                        ? `${selectedMembers.size} được chọn`
                        : "Chọn bạn bè để thêm"}
                </Text>
            </View>
        </View>
    );

    const renderFriendItem = useCallback(
        ({ item }: { item: Friend }) => {
            const isSelected = selectedMembers.has(item.friendId);
            return (
                <Pressable
                    style={[
                        styles.friendItem,
                        isSelected && styles.friendItemSelected,
                    ]}
                    onPress={() => toggleMember(item.friendId)}
                >
                    <Avatar
                        label={(item.friendInfo?.displayName || "U").charAt(0).toUpperCase()}
                        size={48}
                    />
                    <View style={styles.friendInfo}>
                        <Text style={styles.friendName}>
                            {item.friendInfo?.displayName || "Unknown"}
                        </Text>
                        <Text style={styles.friendPhone}>
                            {item.friendInfo?.phoneNumber || ""}
                        </Text>
                    </View>
                    {isSelected && (
                        <Ionicons
                            name="checkmark-circle"
                            size={24}
                            color={colors.accent}
                        />
                    )}
                </Pressable>
            );
        },
        [selectedMembers, toggleMember]
    );

    const renderEmptyState = () => (
        <View style={styles.emptyContainer}>
            <Ionicons name="people" size={64} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>Không có bạn bè khả dụng</Text>
            <Text style={styles.emptyMessage}>
                Tất cả bạn bè của bạn đã ở trong nhóm này
            </Text>
        </View>
    );

    if (isLoading) {
        return (
            <View style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.accent} />
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {renderHeader()}

            {availableFriends.length > 0 ? (
                <FlatList
                    data={availableFriends}
                    keyExtractor={(item) => item.friendId}
                    renderItem={renderFriendItem}
                    scrollEnabled={true}
                    contentContainerStyle={styles.listContent}
                />
            ) : (
                renderEmptyState()
            )}

            {availableFriends.length > 0 && (
                <View style={styles.footer}>
                    <PrimaryButton
                        title={
                            isAdding
                                ? "Đang thêm..."
                                : `Thêm ${selectedMembers.size} thành viên`
                        }
                        onPress={handleAddMembers}
                        disabled={selectedMembers.size === 0 || isAdding}
                    />
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.surface,
    },
    backButton: {
        padding: 8,
        justifyContent: "center",
        alignItems: "center",
    },
    headerTitleArea: {
        flex: 1,
        marginLeft: 8,
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: "600",
        color: colors.text,
    },
    headerSubtitle: {
        fontSize: 12,
        color: colors.textMuted,
        marginTop: 2,
    },
    listContent: {
        paddingVertical: 8,
    },
    friendItem: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    friendItemSelected: {
        backgroundColor: colors.accent + "10",
    },
    friendInfo: {
        flex: 1,
        marginLeft: 12,
    },
    friendName: {
        fontSize: 14,
        fontWeight: "600",
        color: colors.text,
    },
    friendPhone: {
        fontSize: 12,
        color: colors.textMuted,
        marginTop: 2,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 32,
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: "600",
        color: colors.text,
        marginTop: 16,
    },
    emptyMessage: {
        fontSize: 14,
        color: colors.textMuted,
        marginTop: 8,
        textAlign: "center",
    },
    footer: {
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: colors.surface,
    },
});
