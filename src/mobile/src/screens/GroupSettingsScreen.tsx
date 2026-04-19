import React, { useEffect, useState, useCallback, useRef } from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Pressable,
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../shared/hooks";
import { useGroupChat } from "../../../shared/hooks/useGroupChat";
import { Avatar } from "../components";
import { colors } from "../theme";

interface GroupMemberWithRole {
    _id: string;
    userId: string;
    name?: string;
    avatar?: string;
    role: "owner" | "admin" | "member";
}

export const GroupSettingsScreen: React.FC<{
    route: any;
    navigation: any;
    onBackPress?: () => void;
}> = ({ route, navigation, onBackPress }) => {
    const { groupId } = route.params || {};
    const authContext = useAuth();
    const { user } = authContext;
    const { state: groupState, actions: groupActions } = useGroupChat();

    const [owner, setOwner] = useState<GroupMemberWithRole | null>(null);
    const [admins, setAdmins] = useState<GroupMemberWithRole[]>([]);
    const [members, setMembers] = useState<GroupMemberWithRole[]>([]);
    const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
    const [showMemberActions, setShowMemberActions] = useState(false);
    const [processingDangerAction, setProcessingDangerAction] = useState(false);
    const [showTransferBeforeLeave, setShowTransferBeforeLeave] = useState(false);
    const [transferOwnerTargetId, setTransferOwnerTargetId] = useState<string | null>(null);
    const [hasLoadedGroupOnce, setHasLoadedGroupOnce] = useState(false);

    // Collapse state
    const [adminCollapsed, setAdminCollapsed] = useState(false);
    const [membersCollapsed, setMembersCollapsed] = useState(false);

    useEffect(() => {
        loadGroupData();
    }, [groupId]);

    useEffect(() => {
        if (groupState.group) {
            setHasLoadedGroupOnce(true);
        }
    }, [groupState.group]);

    // Organize members by role from member records + ownerId.
    useEffect(() => {
        if (groupState.group && groupState.members) {
            const ownerMember = groupState.members.find(
                (m) => m.userId === groupState.group?.ownerId
            );
            if (ownerMember) {
                setOwner({
                    ...ownerMember,
                    role: "owner",
                });
            }

            const adminMembers = groupState.members.filter((m) =>
                m.userId !== groupState.group?.ownerId && m.role === "admin"
            );
            setAdmins(
                adminMembers.map((m) => ({
                    ...m,
                    role: "admin",
                }))
            );

            const regularMembers = groupState.members.filter(
                (m) =>
                    m.userId !== groupState.group?.ownerId &&
                    m.role !== "admin"
            );
            setMembers(
                regularMembers.map((m) => ({
                    ...m,
                    role: "member",
                }))
            );
        }
    }, [groupState.group, groupState.members]);

    const loadGroupData = useCallback(async () => {
        try {
            await Promise.all([
                groupActions.loadGroupInfo(groupId),
                groupActions.loadMembers(groupId),
            ]);
        } catch (err: any) {
            Alert.alert("Lỗi", err.message || "Failed to load group data");
        }
    }, [groupId]);

    const currentUserIds = [user?.id, (user as any)?._id, (user as any)?.userId]
        .filter(Boolean)
        .map((id) => String(id));

    const currentUserMemberRecord = groupState.members.find((member) =>
        currentUserIds.includes(String(member.userId))
    );

    const currentUserRole = currentUserIds.includes(String(groupState.group?.ownerId || ""))
        ? "owner"
        : currentUserMemberRecord?.role === "admin"
            ? "admin"
            : "member";

    const canManageMembers = currentUserRole === "owner" || currentUserRole === "admin";
    const canTransferOwner = currentUserRole === "owner";
    const canSetAdmin = currentUserRole === "owner";

    const handleMemberPress = (memberId: string) => {
        setSelectedMemberId(memberId);
        setShowMemberActions(true);
    };

    const handleRemoveAdmin = async () => {
        if (!selectedMemberId || !canSetAdmin) return;

        try {
            await groupActions.setAdmin(groupId, selectedMemberId, false);
            setShowMemberActions(false);
            setSelectedMemberId(null);
            Alert.alert("Thành công", "Đã gỡ quyền phó nhóm");
        } catch (err: any) {
            Alert.alert("Lỗi", err.message || "Failed to remove admin");
        }
    };

    const handleSetAdmin = async () => {
        if (!selectedMemberId || !canSetAdmin) return;

        try {
            await groupActions.setAdmin(groupId, selectedMemberId, true);
            setShowMemberActions(false);
            setSelectedMemberId(null);
            Alert.alert("Thành công", "Đã cấp quyền phó nhóm");
        } catch (err: any) {
            Alert.alert("Lỗi", err.message || "Failed to set admin");
        }
    };

    const handleTransferOwner = async () => {
        if (!selectedMemberId || !canTransferOwner) return;

        Alert.alert(
            "Xác nhận chuyển quyền",
            "Bạn có chắc muốn chuyển quyền chủ nhóm cho thành viên này?",
            [
                { text: "Hủy", onPress: () => { } },
                {
                    text: "Chuyển",
                    onPress: async () => {
                        try {
                            await groupActions.transferOwner(groupId, selectedMemberId);
                            setShowMemberActions(false);
                            setSelectedMemberId(null);
                            Alert.alert("Thành công", "Đã chuyển quyền chủ nhóm");
                        } catch (err: any) {
                            Alert.alert("Lỗi", err.message || "Failed to transfer owner");
                        }
                    },
                    style: "destructive",
                },
            ]
        );
    };

    const handleRemoveMember = async () => {
        if (!selectedMemberId || !canManageMembers) return;

        Alert.alert(
            "Xác nhận đuổi khỏi nhóm",
            "Bạn có chắc muốn đuổi thành viên này khỏi nhóm?",
            [
                { text: "Hủy", onPress: () => { } },
                {
                    text: "Đuổi",
                    onPress: async () => {
                        try {
                            await groupActions.removeMember(groupId, selectedMemberId);
                            setShowMemberActions(false);
                            setSelectedMemberId(null);
                            Alert.alert("Thành công", "Đã đuổi thành viên khỏi nhóm");
                        } catch (err: any) {
                            Alert.alert("Lỗi", err.message || "Failed to remove member");
                        }
                    },
                    style: "destructive",
                },
            ]
        );
    };

    const navigateToHomeAfterAction = useCallback(() => {
        if (typeof navigation?.goHome === "function") {
            navigation.goHome();
            return;
        }

        if (typeof navigation?.navigate === "function") {
            navigation.navigate("home");
            return;
        }

        onBackPress?.();
    }, [navigation, onBackPress]);

    const handleLeaveGroup = useCallback(() => {
        if (processingDangerAction) {
            return;
        }

        if (currentUserRole === "owner") {
            const transferableMembersCount = groupState.members.filter(
                (member) => !currentUserIds.includes(String(member.userId))
            ).length;

            if (transferableMembersCount === 0) {
                Alert.alert(
                    "Không thể rời nhóm",
                    "Nhóm hiện không có thành viên khác để chuyển quyền chủ nhóm."
                );
                return;
            }

            setTransferOwnerTargetId(null);
            setShowTransferBeforeLeave(true);
            return;
        }

        Alert.alert("Xác nhận", "Bạn có chắc muốn rời nhóm này?", [
            { text: "Hủy", style: "cancel" },
            {
                text: "Rời nhóm",
                style: "destructive",
                onPress: async () => {
                    try {
                        setProcessingDangerAction(true);
                        await groupActions.leaveGroup(groupId);
                        navigateToHomeAfterAction();
                    } catch (err: any) {
                        Alert.alert("Lỗi", err.message || "Không thể rời nhóm");
                    } finally {
                        setProcessingDangerAction(false);
                    }
                },
            },
        ]);
    }, [
        processingDangerAction,
        currentUserRole,
        groupState.members,
        currentUserIds,
        groupActions,
        groupId,
        navigateToHomeAfterAction,
    ]);

    const handleConfirmTransferAndLeave = useCallback(async () => {
        if (!transferOwnerTargetId || processingDangerAction) {
            return;
        }

        try {
            setProcessingDangerAction(true);

            const oldOwnerId =
                groupState.members.find((member) =>
                    currentUserIds.includes(String(member.userId))
                )?.userId || currentUserIds[0];

            // Best-effort demotion before ownership transfer so old owner is not retained as admin on rejoin.
            if (oldOwnerId) {
                try {
                    await groupActions.setAdmin(groupId, oldOwnerId, false);
                } catch {
                    // Some backends may block owner self-demotion; continue transfer flow.
                }
            }

            await groupActions.transferOwner(groupId, transferOwnerTargetId);
            await groupActions.leaveGroup(groupId);
            setShowTransferBeforeLeave(false);
            setTransferOwnerTargetId(null);
            navigateToHomeAfterAction();
        } catch (err: any) {
            Alert.alert("Lỗi", err.message || "Không thể chuyển quyền và rời nhóm");
        } finally {
            setProcessingDangerAction(false);
        }
    }, [
        transferOwnerTargetId,
        processingDangerAction,
        groupState.members,
        currentUserIds,
        groupActions,
        groupId,
        navigateToHomeAfterAction,
    ]);

    const handleDissolveGroup = useCallback(() => {
        if (processingDangerAction) {
            return;
        }

        Alert.alert(
            "Xác nhận giải tán nhóm",
            "Giải tán nhóm sẽ xóa vĩnh viễn nhóm và toàn bộ thành viên sẽ bị xóa khỏi cuộc trò chuyện. Bạn có chắc muốn tiếp tục?",
            [
                { text: "Hủy", style: "cancel" },
                {
                    text: "Giải tán",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            setProcessingDangerAction(true);
                            await groupActions.dissolveGroup(groupId);
                            navigateToHomeAfterAction();
                        } catch (err: any) {
                            Alert.alert("Lỗi", err.message || "Không thể giải tán nhóm");
                        } finally {
                            setProcessingDangerAction(false);
                        }
                    },
                },
            ]
        );
    }, [processingDangerAction, groupActions, groupId, navigateToHomeAfterAction]);

    const MemberItem: React.FC<{ member: GroupMemberWithRole }> = ({ member }) => {
        const memberInitials = (member.name || "?")
            .split(" ")
            .map((n: string) => n[0].toUpperCase())
            .join("")
            .slice(0, 2);

        const isSelected = selectedMemberId === member.userId;

        return (
            <Pressable
                style={[styles.memberItem, isSelected && styles.memberItemSelected]}
                onPress={() => handleMemberPress(member.userId)}
            >
                <Avatar
                    label={memberInitials}
                    size={40}
                    backgroundColor={colors.accentStrong}
                    imageUrl={member.avatar}
                />
                <View style={styles.memberInfo}>
                    <View style={styles.memberNameRow}>
                        <Text style={styles.memberName}>{member.name || "Unknown"}</Text>
                        {member.role === "owner" && (
                            <Text style={styles.roleBadge}>👑</Text>
                        )}
                        {member.role === "admin" && (
                            <Text style={styles.roleBadge}>🔑</Text>
                        )}
                    </View>
                    <Text style={styles.memberRole}>
                        {member.role === "owner"
                            ? "Chủ nhóm"
                            : member.role === "admin"
                                ? "Phó nhóm"
                                : "Thành viên"}
                    </Text>
                </View>
                {isSelected && (
                    <Ionicons name="checkmark-circle" size={24} color={colors.accent} />
                )}
            </Pressable>
        );
    };

    const renderMemberActions = () => {
        if (!selectedMemberId || !showMemberActions) return null;

        const selectedMember =
            owner?.userId === selectedMemberId
                ? owner
                : admins.find((m) => m.userId === selectedMemberId) ||
                members.find((m) => m.userId === selectedMemberId);

        if (!selectedMember) return null;

        return (
            <View style={styles.actionPanel}>
                <View style={styles.actionHeader}>
                    <Text style={styles.actionTitle}>Tùy chọn thành viên</Text>
                    <Pressable
                        onPress={() => {
                            setShowMemberActions(false);
                            setSelectedMemberId(null);
                        }}
                    >
                        <Ionicons name="close" size={24} color={colors.text} />
                    </Pressable>
                </View>

                <ScrollView style={styles.actionContent}>
                    <Text style={styles.actionMemberName}>{selectedMember.name || "Unknown"}</Text>

                    {/* View Profile */}
                    <Pressable style={styles.actionButton}>
                        <Ionicons name="person-outline" size={20} color={colors.text} />
                        <Text style={styles.actionButtonText}>Xem trang cá nhân</Text>
                    </Pressable>

                    {/* Set Admin / Remove Admin */}
                    {canSetAdmin && selectedMember.role === "member" && (
                        <Pressable
                            style={styles.actionButton}
                            onPress={handleSetAdmin}
                        >
                            <Ionicons name="shield-outline" size={20} color={colors.success} />
                            <Text style={[styles.actionButtonText, { color: colors.success }]}>
                                Cấp quyền phó nhóm
                            </Text>
                        </Pressable>
                    )}

                    {canSetAdmin && selectedMember.role === "admin" && (
                        <Pressable
                            style={styles.actionButton}
                            onPress={handleRemoveAdmin}
                        >
                            <Ionicons name="shield-outline" size={20} color={colors.textMuted} />
                            <Text style={[styles.actionButtonText, { color: colors.textMuted }]}>
                                Gỡ quyền phó nhóm
                            </Text>
                        </Pressable>
                    )}

                    {/* Transfer Owner */}
                    {canTransferOwner && selectedMember.role !== "owner" && user?.id !== selectedMember.userId && (
                        <Pressable
                            style={styles.actionButton}
                            onPress={handleTransferOwner}
                        >
                            <Ionicons name="ribbon-outline" size={20} color={colors.accentAlt} />
                            <Text style={[styles.actionButtonText, { color: colors.accentAlt }]}>
                                Chuyển quyền chủ nhóm
                            </Text>
                        </Pressable>
                    )}

                    {/* Remove Member */}
                    {canManageMembers &&
                        selectedMember.role !== "owner" &&
                        user?.id !== selectedMember.userId && (
                            <Pressable
                                style={styles.actionButton}
                                onPress={handleRemoveMember}
                            >
                                <Ionicons name="trash-outline" size={20} color={colors.danger} />
                                <Text style={[styles.actionButtonText, { color: colors.danger }]}>
                                    Đuổi khỏi nhóm
                                </Text>
                            </Pressable>
                        )}
                </ScrollView>
            </View>
        );
    };

    const renderTransferBeforeLeave = () => {
        if (!showTransferBeforeLeave) return null;

        const transferableMembers = groupState.members.filter(
            (member) => !currentUserIds.includes(String(member.userId))
        );

        return (
            <View style={styles.actionPanel}>
                <View style={styles.actionHeader}>
                    <Text style={styles.actionTitle}>Chọn người nhận quyền chủ nhóm</Text>
                    <Pressable
                        onPress={() => {
                            if (!processingDangerAction) {
                                setShowTransferBeforeLeave(false);
                                setTransferOwnerTargetId(null);
                            }
                        }}
                    >
                        <Ionicons name="close" size={24} color={colors.text} />
                    </Pressable>
                </View>

                <View style={styles.actionContent}>
                    <Text style={styles.transferDescription}>
                        Hãy chọn 1 thành viên để chuyển quyền chủ nhóm trước khi rời nhóm.
                    </Text>

                    <FlatList
                        data={transferableMembers}
                        keyExtractor={(item) => item.userId}
                        style={styles.transferList}
                        renderItem={({ item }) => {
                            const isSelected = transferOwnerTargetId === item.userId;
                            const roleLabel = item.role === "admin" ? "Phó nhóm" : "Thành viên";

                            return (
                                <Pressable
                                    style={[
                                        styles.transferMemberItem,
                                        isSelected && styles.transferMemberItemSelected,
                                    ]}
                                    onPress={() => setTransferOwnerTargetId(item.userId)}
                                >
                                    <Avatar
                                        label={(item.name || "?").slice(0, 1).toUpperCase()}
                                        size={36}
                                        backgroundColor={colors.accentStrong}
                                        imageUrl={item.avatar}
                                    />
                                    <View style={styles.transferMemberInfo}>
                                        <Text style={styles.transferMemberName}>{item.name || "Unknown"}</Text>
                                        <Text style={styles.transferMemberRole}>{roleLabel}</Text>
                                    </View>
                                    {isSelected ? (
                                        <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
                                    ) : (
                                        <Ionicons name="ellipse-outline" size={22} color={colors.textMuted} />
                                    )}
                                </Pressable>
                            );
                        }}
                    />

                    <Pressable
                        style={[
                            styles.transferAndLeaveButton,
                            (!transferOwnerTargetId || processingDangerAction) && styles.actionDisabled,
                        ]}
                        disabled={!transferOwnerTargetId || processingDangerAction}
                        onPress={handleConfirmTransferAndLeave}
                    >
                        <Ionicons name="swap-horizontal-outline" size={18} color={colors.danger} />
                        <Text style={styles.transferAndLeaveText}>Chuyển owner và rời nhóm</Text>
                    </Pressable>
                </View>
            </View>
        );
    };

    if (!groupState.group && !hasLoadedGroupOnce) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.accent} />
            </View>
        );
    }

    if (!groupState.group && hasLoadedGroupOnce) {
        return <View style={styles.screen} />;
    }

    return (
        <View style={styles.screen}>
            {/* Header */}
            <View style={styles.header}>
                <Pressable
                    style={styles.backButton}
                    onPress={onBackPress}
                >
                    <Ionicons name="chevron-back" size={24} color={colors.text} />
                </Pressable>
                <Text style={styles.headerTitle}>Cài đặt nhóm</Text>
                <View style={{ width: 40 }} />
            </View>

            {/* Content */}
            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {/* Group Info */}
                <View style={styles.groupInfoCard}>
                    {groupState.group.avatarUrl && (
                        <Image
                            source={{ uri: groupState.group.avatarUrl }}
                            style={styles.groupAvatar}
                        />
                    )}
                    <View style={styles.groupInfoContent}>
                        <Text style={styles.groupName}>{groupState.group.name}</Text>
                        <Text style={styles.groupMemberCount}>
                            {groupState.members?.length || 0} thành viên
                        </Text>
                    </View>
                </View>

                {/* Owner Section */}
                {owner && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Chủ nhóm</Text>
                        </View>
                        <MemberItem member={owner} />
                    </View>
                )}

                {/* Admins Section */}
                {admins.length > 0 && (
                    <View style={styles.section}>
                        <Pressable
                            style={styles.sectionHeader}
                            onPress={() => setAdminCollapsed(!adminCollapsed)}
                        >
                            <Text style={styles.sectionTitle}>
                                Phó nhóm ({admins.length})
                            </Text>
                            <Ionicons
                                name={adminCollapsed ? "chevron-forward" : "chevron-down"}
                                size={20}
                                color={colors.textMuted}
                            />
                        </Pressable>
                        {!adminCollapsed && (
                            <View>
                                {admins.map((admin) => (
                                    <MemberItem key={admin._id} member={admin} />
                                ))}
                            </View>
                        )}
                    </View>
                )}

                {/* Members Section */}
                {members.length > 0 && (
                    <View style={styles.section}>
                        <Pressable
                            style={styles.sectionHeader}
                            onPress={() => setMembersCollapsed(!membersCollapsed)}
                        >
                            <Text style={styles.sectionTitle}>
                                Thành viên ({members.length})
                            </Text>
                            <Ionicons
                                name={membersCollapsed ? "chevron-forward" : "chevron-down"}
                                size={20}
                                color={colors.textMuted}
                            />
                        </Pressable>
                        {!membersCollapsed && (
                            <FlatList
                                scrollEnabled={members.length > 5}
                                nestedScrollEnabled
                                data={members}
                                keyExtractor={(item) => item._id}
                                renderItem={({ item }) => <MemberItem member={item} />}
                                style={styles.membersList}
                                maxToRenderPerBatch={10}
                            />
                        )}
                    </View>
                )}

                {/* Group actions */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Hành động nhóm</Text>

                    <Pressable
                        style={[styles.leaveGroupButton, processingDangerAction && styles.actionDisabled]}
                        disabled={processingDangerAction}
                        onPress={handleLeaveGroup}
                    >
                        <Ionicons name="log-out-outline" size={18} color={colors.danger} />
                        <Text style={styles.leaveGroupText}>Rời nhóm</Text>
                    </Pressable>

                    {currentUserRole === "owner" && (
                        <Pressable
                            style={[styles.dissolveGroupButton, processingDangerAction && styles.actionDisabled]}
                            disabled={processingDangerAction}
                            onPress={handleDissolveGroup}
                        >
                            <Ionicons name="trash-outline" size={18} color={colors.danger} />
                            <Text style={styles.dissolveGroupText}>Giải tán nhóm</Text>
                        </Pressable>
                    )}
                </View>
            </ScrollView>

            {/* Member Actions Overlay */}
            {showMemberActions && renderMemberActions()}

            {/* Owner transfer-and-leave overlay */}
            {showTransferBeforeLeave && renderTransferBeforeLeave()}
        </View>
    );
};

const styles = StyleSheet.create({
    screen: {
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
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    backButton: {
        padding: 8,
        marginLeft: -8,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: "600",
        color: colors.text,
    },
    content: {
        flex: 1,
        paddingHorizontal: 16,
        paddingVertical: 16,
    },

    // Group Info Card
    groupInfoCard: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 16,
        marginBottom: 24,
        gap: 12,
    },
    groupAvatar: {
        width: 60,
        height: 60,
        borderRadius: 30,
    },
    groupInfoContent: {
        flex: 1,
        gap: 4,
    },
    groupName: {
        fontSize: 16,
        fontWeight: "600",
        color: colors.text,
    },
    groupMemberCount: {
        fontSize: 13,
        color: colors.textMuted,
    },

    // Sections
    section: {
        marginBottom: 20,
    },
    sectionHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: "600",
        color: colors.text,
    },

    // Member Items
    memberItem: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 8,
        gap: 12,
        borderRadius: 8,
        marginBottom: 8,
    },
    memberItemSelected: {
        backgroundColor: colors.surface,
    },
    memberInfo: {
        flex: 1,
        gap: 4,
    },
    memberNameRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    memberName: {
        fontSize: 14,
        fontWeight: "500",
        color: colors.text,
    },
    roleBadge: {
        fontSize: 12,
    },
    memberRole: {
        fontSize: 12,
        color: colors.textMuted,
    },
    membersList: {
        maxHeight: 400,
    },

    // Action Panel
    actionPanel: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        top: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        justifyContent: "flex-end",
    },
    actionHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.surface,
    },
    actionTitle: {
        fontSize: 16,
        fontWeight: "600",
        color: colors.text,
    },
    actionContent: {
        maxHeight: 400,
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: colors.surface,
    },
    actionMemberName: {
        fontSize: 14,
        fontWeight: "600",
        color: colors.text,
        marginBottom: 16,
    },
    actionButton: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 12,
        marginBottom: 8,
        borderRadius: 8,
        backgroundColor: colors.background,
        gap: 12,
    },
    actionButtonText: {
        fontSize: 14,
        fontWeight: "500",
        color: colors.text,
        flex: 1,
    },

    leaveGroupButton: {
        marginTop: 10,
        borderWidth: 1,
        borderColor: colors.danger,
        borderRadius: 10,
        paddingVertical: 12,
        paddingHorizontal: 14,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: colors.surface,
    },
    leaveGroupText: {
        fontSize: 14,
        fontWeight: "600",
        color: colors.danger,
    },
    dissolveGroupButton: {
        marginTop: 10,
        borderWidth: 1,
        borderColor: colors.danger,
        borderRadius: 10,
        paddingVertical: 12,
        paddingHorizontal: 14,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: colors.surface,
    },
    dissolveGroupText: {
        fontSize: 14,
        fontWeight: "600",
        color: colors.danger,
    },
    actionDisabled: {
        opacity: 0.5,
    },
    transferDescription: {
        fontSize: 13,
        color: colors.textMuted,
        marginBottom: 12,
        lineHeight: 18,
    },
    transferList: {
        maxHeight: 280,
        marginBottom: 12,
    },
    transferMemberItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 10,
        paddingHorizontal: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
        marginBottom: 8,
        backgroundColor: colors.background,
    },
    transferMemberItemSelected: {
        borderColor: colors.accent,
    },
    transferMemberInfo: {
        flex: 1,
    },
    transferMemberName: {
        fontSize: 14,
        fontWeight: "600",
        color: colors.text,
    },
    transferMemberRole: {
        marginTop: 2,
        fontSize: 12,
        color: colors.textMuted,
    },
    transferAndLeaveButton: {
        borderWidth: 1,
        borderColor: colors.danger,
        borderRadius: 10,
        paddingVertical: 12,
        paddingHorizontal: 14,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        backgroundColor: colors.surface,
    },
    transferAndLeaveText: {
        fontSize: 14,
        fontWeight: "700",
        color: colors.danger,
    },
});
