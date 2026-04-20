import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import ImageViewerModal from "../components/ImageViewerModal";
import { Modal as RNModal } from "react-native";
import { Modal, Dimensions } from "react-native";
import { Video, ResizeMode } from "expo-av";
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
    TextInput,
    KeyboardAvoidingView,
    Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../shared/hooks";

import { useGroupChat } from "../../../shared/hooks/useGroupChat";
import { useGroupChatMessage } from "../../../shared/hooks/useGroupChatMessage";


export const MEDIA_TABS = [
    { key: 'image', label: 'Ảnh' },
    { key: 'video', label: 'Video' },
    { key: 'audio', label: 'Audio' },
    { key: 'file', label: 'File' },
];
import { Avatar } from "../components";
import { colors } from "../theme";
import { requestPresignedUrl, confirmUpload } from "../../../shared/services/presignedUrlService";

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

    // Tab state for media
    const [mediaTab, setMediaTab] = useState('image');

    // Lấy toàn bộ messages của group để lọc media
    const { state: groupMessageState } = useGroupChatMessage(groupId, authContext?.user?.token || authContext?.token || "");

    // Lọc media theo từng loại (dựa vào mediaType)
    const mediaByType = useMemo(() => {
        const allMessages = groupMessageState.messages || [];
        const images = [];
        const videos = [];
        const audios = [];
        const files = [];
        allMessages.forEach(msg => {
            if (Array.isArray(msg.media)) {
                msg.media.forEach(m => {
                    if (!m || !m.url) return;
                    switch (m.mediaType) {
                        case 'image':
                            images.push({ ...m, messageId: msg._id || msg.id });
                            break;
                        case 'video':
                            videos.push({ ...m, messageId: msg._id || msg.id });
                            break;
                        case 'audio':
                            audios.push({ ...m, messageId: msg._id || msg.id });
                            break;
                        case 'file':
                        case 'document':
                        default:
                            files.push({ ...m, messageId: msg._id || msg.id });
                            break;
                    }
                });
            }
        });
        return { image: images, video: videos, audio: audios, file: files };
    }, [groupMessageState.messages]);

    // State cho modal xem ảnh
    const [imageViewerVisible, setImageViewerVisible] = useState(false);
    const [imageViewerIndex, setImageViewerIndex] = useState(0);

    // State cho modal xem video
    const [videoViewerVisible, setVideoViewerVisible] = useState(false);
    const [videoViewerIndex, setVideoViewerIndex] = useState(0);

    // Render media grid
    const renderMediaGrid = (items, type) => {
        if (!items.length) {
            return <Text style={{ color: colors.textMuted, textAlign: 'center', marginVertical: 16 }}>Không có dữ liệu</Text>;
        }
        if (type === 'image') {
            return (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 }}>
                    {items.map((m, idx) => (
                        <Pressable
                            key={m.url + idx}
                            onPress={() => {
                                setImageViewerIndex(idx);
                                setImageViewerVisible(true);
                            }}
                        >
                            <Image
                                source={{ uri: m.url }}
                                style={{ width: 90, height: 90, borderRadius: 8, marginBottom: 8, backgroundColor: '#eee' }}
                                resizeMode="cover"
                            />
                        </Pressable>
                    ))}
                </View>
            );
        }
        if (type === 'video') {
            return (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 }}>
                    {items.map((m, idx) => (
                        <Pressable
                            key={m.url + idx}
                            onPress={() => {
                                setVideoViewerIndex(idx);
                                setVideoViewerVisible(true);
                            }}
                        >
                            <Image
                                source={{ uri: m.thumbnailUrl || m.url }}
                                style={{ width: 90, height: 90, borderRadius: 8, marginBottom: 8, backgroundColor: '#222' }}
                                resizeMode="cover"
                            />
                            <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="play-circle" size={36} color="#fff" />
                            </View>
                        </Pressable>
                    ))}
                </View>
            );
        }
        // File/audio dạng list
        return (
            <View style={{ marginVertical: 8 }}>
                {items.map((m, idx) => (
                    <View key={m.url + idx} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 }}>
                        <Ionicons name={type === 'audio' ? 'musical-notes-outline' : 'document-outline'} size={22} color={colors.accent} />
                        <Text numberOfLines={1} style={{ flex: 1 }}>{m.name || m.url.split('/').pop()}</Text>
                        {/* Có thể thêm nút tải về hoặc mở file */}
                    </View>
                ))}
            </View>
        );
    };

    const [owner, setOwner] = useState<GroupMemberWithRole | null>(null);
    const [admins, setAdmins] = useState<GroupMemberWithRole[]>([]);
    const [members, setMembers] = useState<GroupMemberWithRole[]>([]);
    const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
    const [showMemberActions, setShowMemberActions] = useState(false);
    const [processingDangerAction, setProcessingDangerAction] = useState(false);
    const [showTransferBeforeLeave, setShowTransferBeforeLeave] = useState(false);
    const [transferOwnerTargetId, setTransferOwnerTargetId] = useState<string | null>(null);
    const [hasLoadedGroupOnce, setHasLoadedGroupOnce] = useState(false);

    // Edit group name/settings
    const [editingGroupName, setEditingGroupName] = useState(false);
    const [newGroupName, setNewGroupName] = useState("");
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [settingForm, setSettingForm] = useState({
        allowSendLink: groupState.group?.settings?.allowSendLink ?? true,
        requireApproval: groupState.group?.settings?.requireApproval ?? false,
        allowMemberInvite: groupState.group?.settings?.allowMemberInvite ?? true,
    });
    const [processingGroupUpdate, setProcessingGroupUpdate] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);

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

    // Sync group name and settings form when group updates
    useEffect(() => {
        if (groupState.group) {
            setNewGroupName(groupState.group.name);
            setSettingForm({
                allowSendLink: groupState.group.settings?.allowSendLink ?? true,
                requireApproval: groupState.group.settings?.requireApproval ?? false,
                allowMemberInvite: groupState.group.settings?.allowMemberInvite ?? true,
            });
        }
    }, [groupState.group]);

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

    const handleUploadGroupAvatar = useCallback(async () => {
        try {
            // Request permission
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== "granted") {
                Alert.alert("Lỗi", "Cần cấp quyền truy cập thư viện ảnh");
                return;
            }

            // Pick image
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'] as any,
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
            });

            if (result.canceled) {
                return;
            }

            const pickedAsset = result.assets[0];
            const imageUri = pickedAsset.uri;

            setUploadingAvatar(true);

            // Get file info
            const fileSize = pickedAsset.fileSize || 5242880; // 5MB default
            const mimeType = pickedAsset.mimeType || "image/jpeg";
            const fileName = `group_${groupId}_${Date.now()}.jpg`;

            console.log("[GroupSettings] Uploading avatar:", { fileName, fileSize, mimeType });

            // Step 1: Request presigned URL
            const urlResponse = await requestPresignedUrl({
                fileType: "IMAGE",
                mimeType,
                fileSize,
                originalName: fileName,
                expiresIn: 3600,
            });

            console.log("[GroupSettings] Got presigned URL, uploading file...");

            // Step 2: Upload to S3
            const response = await fetch(imageUri);
            const blob = await response.blob();

            const uploadResponse = await fetch(urlResponse.presignedUrl, {
                method: "PUT",
                body: blob,
                headers: {
                    "Content-Type": mimeType,
                    ...urlResponse.headers,
                },
            });

            if (!uploadResponse.ok) {
                throw new Error(`Upload failed: ${uploadResponse.statusText}`);
            }

            console.log("[GroupSettings] File uploaded, confirming...");

            // Step 3: Confirm upload
            await confirmUpload({
                fileId: urlResponse.fileId,
                uploadedUrl: urlResponse.presignedUrl,
            });

            console.log("[GroupSettings] Upload confirmed, updating group...");

            // Step 4: Update group with new avatar URL
            const avatarUrl = `${urlResponse.presignedUrl.split("?")[0]}`;
            await groupActions.updateGroup(groupId, { avatarUrl });

            setUploadingAvatar(false);
            Alert.alert("Thành công", "Đã cập nhật ảnh nhóm");
        } catch (err: any) {
            setUploadingAvatar(false);
            console.error("[GroupSettings] Avatar upload error:", err);
            Alert.alert("Lỗi", err.message || "Không thể upload ảnh nhóm");
        }
    }, [groupId, groupActions]);

    const handleUpdateGroupName = useCallback(async () => {
        if (!newGroupName.trim() || newGroupName === groupState.group?.name) {
            setEditingGroupName(false);
            return;
        }

        if (processingGroupUpdate) {
            return;
        }

        try {
            setProcessingGroupUpdate(true);
            await groupActions.updateGroup(groupId, { name: newGroupName.trim() });
            setEditingGroupName(false);
            Alert.alert("Thành công", "Đã cập nhật tên nhóm");
        } catch (err: any) {
            Alert.alert("Lỗi", err.message || "Không thể cập nhật tên nhóm");
        } finally {
            setProcessingGroupUpdate(false);
        }
    }, [newGroupName, groupState.group?.name, processingGroupUpdate, groupActions, groupId]);

    const handleUpdateSettings = useCallback(async () => {
        if (processingGroupUpdate) {
            return;
        }

        try {
            setProcessingGroupUpdate(true);
            await groupActions.updateSettings(groupId, settingForm);
            setShowSettingsModal(false);
            Alert.alert("Thành công", "Đã cập nhật cài đặt nhóm");
        } catch (err: any) {
            Alert.alert("Lỗi", err.message || "Không thể cập nhật cài đặt");
        } finally {
            setProcessingGroupUpdate(false);
        }
    }, [settingForm, processingGroupUpdate, groupActions, groupId]);

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
                    {canManageMembers && (
                        <View style={styles.editButtonsGroup}>
                            <Pressable
                                style={styles.editInfoButton}
                                onPress={() => {
                                    setEditingGroupName(true);
                                    setNewGroupName(groupState.group?.name || "");
                                }}
                            >
                                <Ionicons name="create-outline" size={18} color={colors.accent} />
                            </Pressable>
                            <Pressable
                                style={styles.editInfoButton}
                                onPress={handleUploadGroupAvatar}
                                disabled={uploadingAvatar}
                            >
                                {uploadingAvatar ? (
                                    <ActivityIndicator size="small" color={colors.accent} />
                                ) : (
                                    <Ionicons name="image-outline" size={18} color={colors.accent} />
                                )}
                            </Pressable>
                        </View>
                    )}
                </View>

                {/* Edit Group Name Modal */}
                {editingGroupName && canManageMembers && (
                    <KeyboardAvoidingView
                        behavior={Platform.OS === "ios" ? "padding" : "height"}
                        style={styles.editModal}
                    >
                        <Pressable
                            style={styles.editModalOverlay}
                            onPress={() => {
                                setEditingGroupName(false);
                                setNewGroupName(groupState.group?.name || "");
                            }}
                        />
                        <View style={styles.editModalContent}>
                            <Text style={styles.editModalTitle}>Đổi tên nhóm</Text>
                            <TextInput
                                style={styles.editInput}
                                value={newGroupName}
                                onChangeText={setNewGroupName}
                                placeholder="Tên nhóm mới"
                                maxLength={100}
                                autoFocus
                            />
                            <View style={styles.editModalActions}>
                                <Pressable
                                    style={styles.editModalButton}
                                    onPress={() => {
                                        setEditingGroupName(false);
                                        setNewGroupName(groupState.group?.name || "");
                                    }}
                                >
                                    <Text style={styles.editModalButtonText}>Hủy</Text>
                                </Pressable>
                                <Pressable
                                    style={[styles.editModalButton, styles.editModalButtonPrimary]}
                                    disabled={processingGroupUpdate}
                                    onPress={handleUpdateGroupName}
                                >
                                    <Text style={styles.editModalButtonTextPrimary}>
                                        {processingGroupUpdate ? "Đang lưu..." : "Lưu"}
                                    </Text>
                                </Pressable>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                )}

                {/* Settings Button */}
                {canManageMembers && (
                    <View style={styles.settingsButtonSection}>
                        <Pressable
                            style={styles.settingsButton}
                            onPress={() => setShowSettingsModal(true)}
                        >
                            <Ionicons name="settings-outline" size={18} color={colors.text} />
                            <Text style={styles.settingsButtonText}>Cài đặt nhóm</Text>
                        </Pressable>
                    </View>
                )}

                {/* Settings Modal */}
                {showSettingsModal && canManageMembers && (
                    <KeyboardAvoidingView
                        behavior={Platform.OS === "ios" ? "padding" : "height"}
                        style={styles.editModal}
                    >
                        <Pressable
                            style={styles.editModalOverlay}
                            onPress={() => setShowSettingsModal(false)}
                        />
                        <View style={styles.editModalContent}>
                            <View style={styles.editModalHeader}>
                                <Text style={styles.editModalTitle}>Cài đặt nhóm</Text>
                                <Pressable onPress={() => setShowSettingsModal(false)}>
                                    <Ionicons name="close" size={24} color={colors.text} />
                                </Pressable>
                            </View>

                            <ScrollView style={styles.settingsForm} keyboardShouldPersistTaps="handled">
                                {/* Allow Send Link */}
                                <View style={styles.settingRow}>
                                    <View style={styles.settingLabel}>
                                        <Text style={styles.settingLabelText}>Cho phép gửi link</Text>
                                        <Text style={styles.settingDescription}>Cho phép thành viên chia sẻ link</Text>
                                    </View>
                                    <Pressable
                                        style={styles.toggle}
                                        onPress={() =>
                                            setSettingForm((prev) => ({
                                                ...prev,
                                                allowSendLink: !prev.allowSendLink,
                                            }))
                                        }
                                    >
                                        <View
                                            style={[
                                                styles.toggleSwitch,
                                                settingForm.allowSendLink && styles.toggleSwitchActive,
                                            ]}
                                        />
                                    </Pressable>
                                </View>

                                {/* Require Approval */}
                                <View style={styles.settingRow}>
                                    <View style={styles.settingLabel}>
                                        <Text style={styles.settingLabelText}>Cần duyệt member mới</Text>
                                        <Text style={styles.settingDescription}>Phê duyệt trước khi thành viên mới tham gia</Text>
                                    </View>
                                    <Pressable
                                        style={styles.toggle}
                                        onPress={() =>
                                            setSettingForm((prev) => ({
                                                ...prev,
                                                requireApproval: !prev.requireApproval,
                                            }))
                                        }
                                    >
                                        <View
                                            style={[
                                                styles.toggleSwitch,
                                                settingForm.requireApproval && styles.toggleSwitchActive,
                                            ]}
                                        />
                                    </Pressable>
                                </View>

                                {/* Allow Member Invite */}
                                <View style={styles.settingRow}>
                                    <View style={styles.settingLabel}>
                                        <Text style={styles.settingLabelText}>Cho phép member mời người</Text>
                                        <Text style={styles.settingDescription}>Cho phép thành viên mời người mới</Text>
                                    </View>
                                    <Pressable
                                        style={styles.toggle}
                                        onPress={() =>
                                            setSettingForm((prev) => ({
                                                ...prev,
                                                allowMemberInvite: !prev.allowMemberInvite,
                                            }))
                                        }
                                    >
                                        <View
                                            style={[
                                                styles.toggleSwitch,
                                                settingForm.allowMemberInvite && styles.toggleSwitchActive,
                                            ]}
                                        />
                                    </Pressable>
                                </View>
                            </ScrollView>

                            <View style={styles.editModalActions}>
                                <Pressable
                                    style={styles.editModalButton}
                                    onPress={() => setShowSettingsModal(false)}
                                >
                                    <Text style={styles.editModalButtonText}>Đóng</Text>
                                </Pressable>
                                <Pressable
                                    style={[styles.editModalButton, styles.editModalButtonPrimary]}
                                    disabled={processingGroupUpdate}
                                    onPress={handleUpdateSettings}
                                >
                                    <Text style={styles.editModalButtonTextPrimary}>
                                        {processingGroupUpdate ? "Đang lưu..." : "Lưu"}
                                    </Text>
                                </Pressable>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                )}


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

                {/* Group Media Library Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Thư viện nhóm</Text>
                    {/* Tabs */}
                    <View style={{ flexDirection: 'row', marginVertical: 8, gap: 8 }}>
                        {MEDIA_TABS.map(tab => (
                            <Pressable
                                key={tab.key}
                                style={{
                                    paddingVertical: 6,
                                    paddingHorizontal: 16,
                                    borderRadius: 16,
                                    backgroundColor: mediaTab === tab.key ? colors.accent : colors.surface,
                                }}
                                onPress={() => setMediaTab(tab.key)}
                            >
                                <Text style={{ color: mediaTab === tab.key ? '#fff' : colors.text }}>{tab.label}</Text>
                            </Pressable>
                        ))}
                    </View>
                    {renderMediaGrid(mediaByType[mediaTab], mediaTab)}
                    {/* Image Viewer Modal */}
                    <ImageViewerModal
                        images={mediaByType.image.map(img => ({ uri: img.url }))}
                        imageIndex={imageViewerIndex}
                        visible={imageViewerVisible}
                        onRequestClose={() => setImageViewerVisible(false)}
                        swipeToCloseEnabled
                        doubleTapToZoomEnabled
                    />
                    {/* Video Viewer Modal */}
                    <Modal
                        visible={videoViewerVisible}
                        animationType="slide"
                        onRequestClose={() => setVideoViewerVisible(false)}
                        transparent={false}
                    >
                        <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
                            <Pressable
                                style={{ position: 'absolute', top: 40, right: 20, zIndex: 10 }}
                                onPress={() => setVideoViewerVisible(false)}
                            >
                                <Ionicons name="close" size={32} color="#fff" />
                            </Pressable>
                            {/* Lướt qua các video */}
                            <FlatList
                                data={mediaByType.video}
                                horizontal
                                pagingEnabled
                                initialScrollIndex={videoViewerIndex}
                                getItemLayout={(_, index) => ({ length: Dimensions.get('window').width, offset: Dimensions.get('window').width * index, index })}
                                renderItem={({ item }) => (
                                    <View style={{ width: Dimensions.get('window').width, height: Dimensions.get('window').height, justifyContent: 'center', alignItems: 'center' }}>
                                        <Video
                                            source={{ uri: item.url }}
                                            style={{ width: Dimensions.get('window').width, height: Dimensions.get('window').width * 9 / 16, backgroundColor: '#000' }}
                                            useNativeControls
                                            resizeMode={ResizeMode.CONTAIN}
                                            shouldPlay
                                        />
                                        <Text style={{ color: '#fff', marginTop: 10, fontSize: 16 }}>{item.name || item.url.split('/').pop()}</Text>
                                    </View>
                                )}
                                keyExtractor={(item, idx) => item.url + idx}
                                showsHorizontalScrollIndicator={false}
                                onMomentumScrollEnd={e => {
                                    const idx = Math.round(e.nativeEvent.contentOffset.x / Dimensions.get('window').width);
                                    setVideoViewerIndex(idx);
                                }}
                            />
                        </View>
                    </Modal>
                </View>

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

    // Edit Modal
    editModal: {
        flex: 1,
        justifyContent: "flex-end",
        zIndex: 1000,
    },
    editModalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
    },
    editModalContent: {
        backgroundColor: colors.surface,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 20,
        maxHeight: "80%",
    },
    editModalHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 16,
    },
    editModalTitle: {
        fontSize: 18,
        fontWeight: "700",
        color: colors.text,
    },
    editInput: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
        color: colors.text,
        marginBottom: 16,
    },
    editModalActions: {
        flexDirection: "row",
        gap: 12,
        marginTop: 20,
    },
    editModalButton: {
        flex: 1,
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.background,
        alignItems: "center",
        justifyContent: "center",
        minHeight: 48,
    },
    editModalButtonText: {
        fontSize: 15,
        fontWeight: "700",
        color: colors.text,
    },
    editModalButtonPrimary: {
        backgroundColor: colors.accent,
        borderColor: colors.accent,
    },
    editModalButtonTextPrimary: {
        fontSize: 15,
        fontWeight: "700",
        color: "#fff",
    },

    // Settings
    settingsButtonSection: {
        paddingHorizontal: 12,
        marginVertical: 12,
    },
    settingsButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 14,
        paddingHorizontal: 16,
        backgroundColor: colors.surface,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
    },
    settingsButtonText: {
        fontSize: 14,
        fontWeight: "600",
        color: colors.text,
    },
    settingsForm: {
        maxHeight: 400,
        marginBottom: 16,
    },
    settingRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    settingLabel: {
        flex: 1,
    },
    settingLabelText: {
        fontSize: 14,
        fontWeight: "600",
        color: colors.text,
    },
    settingDescription: {
        fontSize: 12,
        color: colors.textMuted,
        marginTop: 4,
    },
    toggle: {
        width: 50,
        height: 28,
        borderRadius: 14,
        backgroundColor: colors.textMuted + "30",
        justifyContent: "center",
        paddingHorizontal: 2,
    },
    toggleSwitch: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: colors.textMuted,
    },
    toggleSwitchActive: {
        backgroundColor: colors.accent,
        alignSelf: "flex-end",
    },

    // Edit Info Button
    editButtonsGroup: {
        flexDirection: "row",
        gap: 8,
    },
    editInfoButton: {
        padding: 8,
        borderRadius: 8,
        backgroundColor: colors.accentStrong + "15",
        minWidth: 40,
        minHeight: 40,
        justifyContent: "center",
        alignItems: "center",
    },
});
