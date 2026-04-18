import React, { useEffect, useState, useCallback } from "react";
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    Pressable,
    Alert,
    ScrollView,
    TextInput,
    ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useGroupChat } from "../../../shared/hooks/useGroupChat";
import { useAuth } from "../../../shared/hooks";
import { Avatar, PrimaryButton } from "../components";
import { colors } from "../theme";

/**
 * GroupInfoScreen - Group management interface
 * Shows: group name, members, admin/owner actions
 * Actions available based on user role
 */
export const GroupInfoScreen: React.FC<{ route: any; navigation: any }> = ({ route, navigation }) => {
    const { groupId } = route.params;
    const { user } = useAuth();
    const { state, actions } = useGroupChat();

    // Local state
    const [editingName, setEditingName] = useState(false);
    const [newGroupName, setNewGroupName] = useState("");
    const [selectedMemberForAction, setSelectedMemberForAction] = useState<GroupMember | null>(null);
    const [actionMenuVisible, setActionMenuVisible] = useState(false);

    // Load group data
    useEffect(() => {
        loadGroupData();
    }, [groupId]);

    const loadGroupData = useCallback(async () => {
        try {
            await Promise.all([
                actions.loadGroupInfo(groupId),
                actions.loadMembers(groupId),
            ]);
        } catch (err: any) {
            Alert.alert("Lỗi", err.message || "Failed to load group info");
        }
    }, [groupId]);

    // Determine current user role
    const currentUserRole: GroupMemberRole | null = (() => {
        if (state.group?.ownerId === user?._id) return "owner";
        if (state.group?.admins?.includes(user?._id || "")) return "admin";
        return "member";
    })();

    const canManageGroup = currentUserRole === "owner" || currentUserRole === "admin";
    const canDissolve = currentUserRole === "owner";

    // Update group name
    const handleUpdateName = useCallback(async () => {
        if (!newGroupName.trim() || newGroupName === state.group?.name) {
            setEditingName(false);
            return;
        }

        try {
            await actions.updateGroup(groupId, { name: newGroupName });
            setEditingName(false);
            setNewGroupName("");
        } catch (err: any) {
            Alert.alert("Lỗi", err.message);
        }
    }, [newGroupName, groupId, state.group?.name]);

    // Remove member
    const handleRemoveMember = useCallback(
        async (member: GroupMember) => {
            Alert.alert(
                "Xác nhận",
                `Xóa ${member.name || "thành viên"} khỏi nhóm?`,
                [
                    { text: "Hủy" },
                    {
                        text: "Xóa",
                        onPress: async () => {
                            try {
                                await actions.removeMember(groupId, member.userId);
                            } catch (err: any) {
                                Alert.alert("Lỗi", err.message);
                            }
                        },
                        style: "destructive",
                    },
                ]
            );
        },
        [groupId]
    );

    // Set admin
    const handleSetAdmin = useCallback(
        async (member: GroupMember, isAdmin: boolean) => {
            try {
                await actions.setAdmin(groupId, member.userId, isAdmin);
            } catch (err: any) {
                Alert.alert("Lỗi", err.message);
            }
        },
        [groupId]
    );

    // Transfer owner
    const handleTransferOwner = useCallback(
        async (member: GroupMember) => {
            Alert.alert(
                "Xác nhận",
                `Chuyển quyền owner cho ${member.name || "thành viên"} này?`,
                [
                    { text: "Hủy" },
                    {
                        text: "Chuyển",
                        onPress: async () => {
                            try {
                                await actions.transferOwner(groupId, member.userId);
                                Alert.alert("Thành công", "Đã chuyển quyền owner");
                            } catch (err: any) {
                                Alert.alert("Lỗi", err.message);
                            }
                        },
                    },
                ]
            );
        },
        [groupId]
    );

    // Dissolve group
    const handleDissolveGroup = useCallback(() => {
        Alert.alert(
            "Xác nhận",
            "Giải tán nhóm? Hành động này không thể hoàn tác.",
            [
                { text: "Hủy" },
                {
                    text: "Giải tán",
                    onPress: async () => {
                        try {
                            await actions.dissolveGroup(groupId);
                            navigation.navigate("Home");
                        } catch (err: any) {
                            Alert.alert("Lỗi", err.message);
                        }
                    },
                    style: "destructive",
                },
            ]
        );
    }, [groupId]);

    // Render member item
    const renderMemberItem = useCallback(
        ({ item }: { item: GroupMember }) => {
            const isCurrentUser = item.userId === user?._id;
            return (
                <View style={styles.memberItem}>
                    <Avatar
                        label={item.name?.charAt(0).toUpperCase() || "U"}
                        size={44}
                    />
                    <View style={styles.memberInfo}>
                        <Text style={styles.memberName}>
                            {item.name}
                            {isCurrentUser && " (Bạn)"}
                        </Text>
                        <View style={styles.roleContainer}>
                            <Text style={styles.roleLabel}>
                                {item.role === "owner"
                                    ? "Chủ nhóm"
                                    : item.role === "admin"
                                        ? "Quản trị viên"
                                        : "Thành viên"}
                            </Text>
                        </View>
                    </View>

                    {canManageGroup && !isCurrentUser && (
                        <Pressable
                            onPress={() => {
                                setSelectedMemberForAction(item);
                                setActionMenuVisible(true);
                            }}
                            hitSlop={8}
                        >
                            <Ionicons
                                name="ellipsis-vertical"
                                size={20}
                                color={colors.textMuted}
                            />
                        </Pressable>
                    )}
                </View>
            );
        },
        [user?._id, canManageGroup]
    );

    if (!state.group) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    return (
        <ScrollView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Pressable
                    onPress={() => navigation.goBack()}
                    hitSlop={8}
                >
                    <Ionicons
                        name="arrow-back"
                        size={24}
                        color={colors.text}
                    />
                </Pressable>
                <Text style={styles.title}>Thông tin nhóm</Text>
                <View style={{ width: 24 }} />
            </View>

            {/* Group Info Section */}
            <View style={styles.section}>
                <View style={styles.groupHeader}>
                    {state.group.avatarUrl && (
                        <Avatar
                            source={{ uri: state.group.avatarUrl }}
                            size={64}
                            name={state.group.name}
                        />
                    )}
                    <View style={styles.groupNameContainer}>
                        {editingName ? (
                            <View style={styles.nameEditContainer}>
                                <TextInput
                                    style={styles.nameInput}
                                    value={newGroupName}
                                    onChangeText={setNewGroupName}
                                    placeholder="Tên nhóm mới"
                                />
                                <Pressable
                                    onPress={handleUpdateName}
                                    style={styles.saveButton}
                                >
                                    <Ionicons
                                        name="checkmark"
                                        size={20}
                                        color={colors.primary}
                                    />
                                </Pressable>
                            </View>
                        ) : (
                            <>
                                <Text style={styles.groupName}>
                                    {state.group.name}
                                </Text>
                                {canManageGroup && (
                                    <Pressable
                                        onPress={() => {
                                            setNewGroupName(state.group!.name);
                                            setEditingName(true);
                                        }}
                                    >
                                        <Text style={styles.editButton}>
                                            Đổi tên
                                        </Text>
                                    </Pressable>
                                )}
                            </>
                        )}
                    </View>
                </View>

                <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Chủ nhóm</Text>
                    <Text style={styles.infoValue}>
                        {state.members.find(
                            (m) => m.userId === state.group!.ownerId
                        )?.name || "Unknown"}
                    </Text>
                </View>

                <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Thành viên</Text>
                    <Text style={styles.infoValue}>
                        {state.members.length}
                    </Text>
                </View>

                <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Quyền của bạn</Text>
                    <Text style={styles.infoValue}>
                        {currentUserRole === "owner"
                            ? "Chủ nhóm"
                            : currentUserRole === "admin"
                                ? "Quản trị viên"
                                : "Thành viên"}
                    </Text>
                </View>
            </View>

            {/* Members Section */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Thành viên ({state.members.length})</Text>
                <FlatList
                    data={state.members}
                    keyExtractor={(item) => item.userId}
                    renderItem={renderMemberItem}
                    scrollEnabled={false}
                    contentContainerStyle={{ gap: 8 }}
                />
            </View>

            {/* Actions Section */}
            {canManageGroup && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Quản lý nhóm</Text>
                    <PrimaryButton
                        label="Thêm thành viên"
                        onPress={() => {
                            Alert.alert(
                                "Tính năng",
                                "Tính năng này sẽ được hoàn thành"
                            );
                        }}
                    />
                </View>
            )}

            {/* Danger Zone */}
            {canDissolve && (
                <View style={[styles.section, styles.dangerZone]}>
                    <Text style={styles.sectionTitle}>Vùng nguy hiểm</Text>
                    <Pressable
                        style={styles.dangerButton}
                        onPress={handleDissolveGroup}
                    >
                        <Ionicons
                            name="trash"
                            size={20}
                            color="#dc2626"
                        />
                        <Text style={styles.dangerButtonText}>
                            Giải tán nhóm
                        </Text>
                    </Pressable>
                </View>
            )}

            {/* Leave Group */}
            {currentUserRole !== "owner" && (
                <View style={styles.section}>
                    <Pressable
                        style={styles.leaveButton}
                        onPress={() => {
                            Alert.alert(
                                "Xác nhận",
                                "Rời khỏi nhóm?",
                                [
                                    { text: "Hủy" },
                                    {
                                        text: "Rời nhóm",
                                        onPress: async () => {
                                            try {
                                                await actions.leaveGroup(groupId);
                                                navigation.goBack();
                                            } catch (err: any) {
                                                Alert.alert("Lỗi", err.message);
                                            }
                                        },
                                        style: "destructive",
                                    },
                                ]
                            );
                        }}
                    >
                        <Text style={styles.leaveButtonText}>
                            Rời nhóm
                        </Text>
                    </Pressable>
                </View>
            )}

            {/* Member Action Menu Modal */}
            {selectedMemberForAction && (
                <View style={styles.actionMenu}>
                    <Text style={styles.actionMenuTitle}>
                        Thao tác với {selectedMemberForAction.name}
                    </Text>

                    {selectedMemberForAction.role !== "owner" && (
                        <>
                            <Pressable
                                style={styles.actionMenuItem}
                                onPress={() => {
                                    handleSetAdmin(
                                        selectedMemberForAction,
                                        selectedMemberForAction.role !== "admin"
                                    );
                                    setActionMenuVisible(false);
                                }}
                            >
                                <Text style={styles.actionMenuItemText}>
                                    {selectedMemberForAction.role === "admin"
                                        ? "Hạ quyền admin"
                                        : "Nâng quyền admin"}
                                </Text>
                            </Pressable>
                        </>
                    )}

                    {currentUserRole === "owner" &&
                        selectedMemberForAction.role !== "owner" && (
                            <Pressable
                                style={styles.actionMenuItem}
                                onPress={() => {
                                    handleTransferOwner(selectedMemberForAction);
                                    setActionMenuVisible(false);
                                }}
                            >
                                <Text style={styles.actionMenuItemText}>
                                    Chuyển owner
                                </Text>
                            </Pressable>
                        )}

                    <Pressable
                        style={[styles.actionMenuItem, styles.dangerAction]}
                        onPress={() => {
                            handleRemoveMember(selectedMemberForAction);
                            setActionMenuVisible(false);
                        }}
                    >
                        <Text style={styles.dangerActionText}>
                            Xóa khỏi nhóm
                        </Text>
                    </Pressable>

                    <Pressable
                        style={styles.actionMenuClose}
                        onPress={() => setActionMenuVisible(false)}
                    >
                        <Text>Đóng</Text>
                    </Pressable>
                </View>
            )}
        </ScrollView>
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
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    title: {
        fontSize: 18,
        fontWeight: "600",
        color: colors.text,
    },
    section: {
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        paddingHorizontal: 16,
        paddingVertical: 16,
        gap: 12,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: "600",
        color: colors.placeholder,
        textTransform: "uppercase",
        marginBottom: 8,
    },
    groupHeader: {
        flexDirection: "row",
        gap: 16,
        alignItems: "center",
        marginBottom: 16,
    },
    groupNameContainer: {
        flex: 1,
        gap: 8,
    },
    groupName: {
        fontSize: 20,
        fontWeight: "700",
        color: colors.text,
    },
    nameEditContainer: {
        flexDirection: "row",
        gap: 8,
        alignItems: "center",
    },
    nameInput: {
        flex: 1,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        fontSize: 16,
        color: colors.text,
    },
    saveButton: {
        padding: 8,
    },
    editButton: {
        fontSize: 14,
        color: colors.primary,
        fontWeight: "600",
    },
    infoRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: 8,
    },
    infoLabel: {
        fontSize: 14,
        color: colors.placeholder,
    },
    infoValue: {
        fontSize: 14,
        fontWeight: "600",
        color: colors.text,
    },
    memberItem: {
        flexDirection: "row",
        alignItems: "center",
        padding: 12,
        backgroundColor: colors.card,
        borderRadius: 8,
        gap: 12,
    },
    memberInfo: {
        flex: 1,
    },
    memberName: {
        fontSize: 14,
        fontWeight: "600",
        color: colors.text,
    },
    roleContainer: {
        marginTop: 4,
    },
    roleLabel: {
        fontSize: 12,
        color: colors.placeholder,
    },
    actionMenu: {
        backgroundColor: colors.card,
        borderRadius: 8,
        margin: 16,
        marginTop: 0,
        padding: 12,
        gap: 8,
    },
    actionMenuTitle: {
        fontSize: 14,
        fontWeight: "600",
        color: colors.text,
        marginBottom: 8,
    },
    actionMenuItem: {
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    actionMenuItemText: {
        fontSize: 14,
        color: colors.text,
    },
    dangerAction: {
        borderBottomColor: "#fca5a5",
    },
    dangerActionText: {
        fontSize: 14,
        color: "#dc2626",
        fontWeight: "600",
    },
    actionMenuClose: {
        paddingVertical: 12,
        paddingHorizontal: 12,
        alignItems: "center",
    },
    dangerZone: {
        backgroundColor: "#fee2e2",
    },
    dangerButton: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderRadius: 8,
        backgroundColor: colors.card,
        gap: 8,
    },
    dangerButtonText: {
        fontSize: 14,
        color: "#dc2626",
        fontWeight: "600",
    },
    leaveButton: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: "center",
    },
    leaveButtonText: {
        fontSize: 14,
        color: colors.text,
        fontWeight: "600",
    },
});
