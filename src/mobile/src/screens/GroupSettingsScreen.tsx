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

    // Collapse state
    const [adminCollapsed, setAdminCollapsed] = useState(false);
    const [membersCollapsed, setMembersCollapsed] = useState(false);

    useEffect(() => {
        loadGroupData();
    }, [groupId]);

    // Organize members by role
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
                groupState.group?.admins?.includes(m.userId)
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
                    !groupState.group?.admins?.includes(m.userId)
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

    const currentUserRole = user?.id === groupState.group?.ownerId
        ? "owner"
        : groupState.group?.admins?.includes(user?.id || "")
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
                            <Ionicons name="crown-outline" size={20} color={colors.accentAlt} />
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

    if (!groupState.group) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.accent} />
            </View>
        );
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
            </ScrollView>

            {/* Member Actions Overlay */}
            {showMemberActions && renderMemberActions()}
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

    warning: {
        color: colors.warning,
    },
});
