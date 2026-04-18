import React, { useState, useCallback, useEffect } from "react";
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    FlatList,
    Pressable,
    ActivityIndicator,
    Alert,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth, useGroupChat, useFriendship } from "../../../shared/hooks";
import { Avatar, PrimaryButton } from "../components";
import { colors } from "../theme";
import type { Friend } from "@/types";

/**
 * CreateGroupScreen - Form to create a new group chat
 * Requires: group name (1-100 chars) + at least 2 members to add
 */
interface CreateGroupScreenProps {
    onGroupCreated?: (groupId: string, groupData?: any) => void;
    onBackPress?: () => void;
}

export const CreateGroupScreen: React.FC<CreateGroupScreenProps> = ({
    onGroupCreated,
    onBackPress,
}) => {
    const { user } = useAuth();
    const { actions } = useGroupChat();
    const { state: friendshipState, actions: friendshipActions } = useFriendship();

    // State
    const [groupName, setGroupName] = useState<string>("");
    const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Load friends on mount
    useEffect(() => {
        if (friendshipState.friends.length === 0 && !friendshipState.friendsLoading) {
            friendshipActions.loadFriends();
        }
    }, []);

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

    const handleCreateGroup = useCallback(async () => {
        try {
            // Validation
            if (!groupName.trim()) {
                Alert.alert("Lỗi", "Vui lòng nhập tên nhóm");
                return;
            }

            if (groupName.trim().length > 100) {
                Alert.alert("Lỗi", "Tên nhóm không được vượt quá 100 ký tự");
                return;
            }

            if (selectedMembers.size < 2) {
                Alert.alert(
                    "Lỗi",
                    "Vui lòng chọn ít nhất 2 thành viên để tạo nhóm"
                );
                return;
            }

            setIsCreating(true);
            setError(null);

            // Create group
            const memberIds = Array.from(selectedMembers);
            const group = await actions.createGroup({
                name: groupName.trim(),
                memberIds,
            });

            // Success - navigate to group chat
            Alert.alert("Thành công", "Nhóm đã được tạo", [
                {
                    text: "OK",
                    onPress: () => {
                        if (onGroupCreated) {
                            onGroupCreated(group._id, group);
                        }
                    },
                },
            ]);
        } catch (err: any) {
            Alert.alert("Lỗi", err.message || "Failed to create group");
        } finally {
            setIsCreating(false);
        }
    }, [groupName, selectedMembers, actions, onGroupCreated]);

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
                        size={50}
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

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.container}
        >
            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {/* Header */}
                <View style={styles.header}>
                    <Pressable
                        onPress={onBackPress}
                        hitSlop={8}
                    >
                        <Ionicons
                            name="arrow-back"
                            size={24}
                            color={colors.text}
                        />
                    </Pressable>
                    <Text style={styles.title}>Tạo nhóm mới</Text>
                    <View style={{ width: 24 }} />
                </View>

                {/* Error message */}
                {error && (
                    <View style={styles.errorBanner}>
                        <Ionicons
                            name="alert-circle"
                            size={18}
                            color="white"
                        />
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                )}

                {/* Group name input */}
                <View style={styles.section}>
                    <Text style={styles.label}>Tên nhóm</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Nhập tên nhóm..."
                        placeholderTextColor={colors.textMuted}
                        value={groupName}
                        onChangeText={setGroupName}
                        maxLength={100}
                        editable={!isCreating}
                    />
                    <Text style={styles.charCount}>
                        {groupName.length}/100
                    </Text>
                </View>

                {/* Members section */}
                <View style={styles.section}>
                    <Text style={styles.label}>
                        Chọn thành viên ({selectedMembers.size}/
                        {friendshipState.friends.length})
                    </Text>
                    <Text style={styles.subLabel}>
                        Cần chọn ít nhất 2 thành viên
                    </Text>

                    {friendshipState.friendsLoading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color={colors.accent} />
                        </View>
                    ) : friendshipState.friends.length === 0 ? (
                        <View style={styles.emptyContainer}>
                            <Ionicons
                                name="people"
                                size={48}
                                color={colors.textMuted}
                            />
                            <Text style={styles.emptyText}>
                                Bạn chưa có bạn nào. Thêm bạn trước khi tạo nhóm.
                            </Text>
                        </View>
                    ) : (
                        <FlatList
                            data={friendshipState.friends}
                            keyExtractor={(item) => item.friendId}
                            renderItem={renderFriendItem}
                            scrollEnabled={false}
                            contentContainerStyle={{ gap: 8 }}
                        />
                    )}
                </View>

                {/* Create button */}
                <View style={styles.buttonSection}>
                    <PrimaryButton
                        label={
                            isCreating
                                ? "Đang tạo..."
                                : selectedMembers.size >= 2
                                    ? `Tạo nhóm (${selectedMembers.size} thành viên)`
                                    : "Chọn ít nhất 2 thành viên"
                        }
                        onPress={handleCreateGroup}
                        loading={isCreating ||
                            selectedMembers.size < 2 ||
                            !groupName.trim()}
                    />
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    content: {
        flex: 1,
        padding: 16,
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 24,
        marginTop: 8,
    },
    title: {
        fontSize: 18,
        fontWeight: "600",
        color: colors.text,
    },
    errorBanner: {
        flexDirection: "row",
        backgroundColor: "#dc2626",
        padding: 12,
        borderRadius: 8,
        marginBottom: 16,
        alignItems: "center",
        gap: 8,
    },
    errorText: {
        color: "white",
        fontSize: 14,
        flex: 1,
    },
    section: {
        marginBottom: 24,
    },
    label: {
        fontSize: 16,
        fontWeight: "600",
        color: colors.text,
        marginBottom: 8,
    },
    subLabel: {
        fontSize: 14,
        color: colors.textMuted,
        marginBottom: 12,
    },
    input: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
        color: colors.text,
        marginBottom: 4,
    },
    charCount: {
        fontSize: 12,
        color: colors.textMuted,
        textAlign: "right",
    },
    loadingContainer: {
        height: 200,
        justifyContent: "center",
        alignItems: "center",
    },
    emptyContainer: {
        height: 200,
        justifyContent: "center",
        alignItems: "center",
        gap: 12,
    },
    emptyText: {
        fontSize: 14,
        color: colors.textMuted,
        textAlign: "center",
        maxWidth: 250,
    },
    friendItem: {
        flexDirection: "row",
        alignItems: "center",
        padding: 12,
        borderRadius: 8,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: "transparent",
        gap: 12,
    },
    friendItemSelected: {
        backgroundColor: colors.accent + "15",
        borderColor: colors.accent,
    },
    friendInfo: {
        flex: 1,
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
    buttonSection: {
        marginBottom: 24,
        gap: 8,
    },
});
