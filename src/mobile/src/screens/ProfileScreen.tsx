import React, { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import {
    Alert,
    ActivityIndicator,
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { useAuth } from "../../../shared/hooks";
import { getOrCreateDeviceId, SessionService, type AuthSession } from "../../../shared/services/sessionService";
import { Avatar, Card, PrimaryButton, TextField } from "../components";
import { colors } from "../theme";
import mediaService from "../../../shared/services/mediaService";
import type { EditData } from "@/types";

const MAX_AVATAR_SIZE = 10 * 1024 * 1024;

export const ProfileScreen = ({ onSavedMessagePress }: { onSavedMessagePress?: () => void }) => {
    const { user, logout, updateProfile, updateAvatar } = useAuth();
    const [isEditing, setIsEditing] = useState(false);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
    const [editData, setEditData] = useState<EditData>({
        displayName: user?.displayName || "",
        phone: user?.phone || "",
        email: user?.email || "",
        bio: user?.bio || "",
        avatarUrl: user?.avatarUrl || user?.avatar || null,
    });
    const [sessions, setSessions] = useState<AuthSession[]>([]);
    const [sessionsLoading, setSessionsLoading] = useState(false);
    const [currentDeviceId, setCurrentDeviceId] = useState("");

    const loadSessions = async () => {
        try {
            setSessionsLoading(true);
            const [deviceId, items] = await Promise.all([
                getOrCreateDeviceId(),
                SessionService.getSessions(),
            ]);
            setCurrentDeviceId(deviceId);
            setSessions(items);
        } catch {
            setSessions([]);
        } finally {
            setSessionsLoading(false);
        }
    };

    useEffect(() => {
        loadSessions();
    }, []);

    const truncateName = (name: string | undefined, maxLength = 20) => {
        if (!name || name.length <= maxLength) {
            return name;
        }
        return name.slice(0, Math.floor(maxLength / 2)) + "...";
    };

    const validateAvatarAsset = (asset: ImagePicker.ImagePickerAsset) => {
        const mimeType = asset.mimeType || "image/jpeg";
        const fileSize = asset.fileSize || 0;

        if (!mimeType.startsWith("image/")) {
            throw new Error("Vui lòng chọn một file ảnh.");
        }

        if (fileSize > MAX_AVATAR_SIZE) {
            throw new Error("Ảnh đại diện phải nhỏ hơn 10MB.");
        }
    };

    const changeAvatar = async (asset: ImagePicker.ImagePickerAsset) => {
        const previousAvatar = user?.avatarUrl || user?.avatar || null;
        const localPreview = asset.uri;

        try {
            validateAvatarAsset(asset);
            setSelectedImage(localPreview);
            setEditData((current) => ({ ...current, avatarUrl: localPreview }));
            setIsUploadingAvatar(true);

            const uploaded = await mediaService.uploadMediaDirect({
                uri: asset.uri,
                name: asset.fileName || `avatar_${Date.now()}.jpg`,
                mimeType: asset.mimeType || "image/jpeg",
                type: asset.mimeType || "image/jpeg",
            });

            await updateAvatar(uploaded.url);
            setEditData((current) => ({ ...current, avatarUrl: uploaded.url }));
            setSelectedImage(null);
            Alert.alert("Thành công", "Cập nhật ảnh đại diện thành công");
        } catch (error: any) {
            setSelectedImage(null);
            setEditData((current) => ({ ...current, avatarUrl: previousAvatar }));
            console.error("[Profile] Avatar update failed:", error);
            Alert.alert("Lỗi", error.message || "Không thể cập nhật ảnh đại diện");
        } finally {
            setIsUploadingAvatar(false);
        }
    };

    const pickAvatarFromLibrary = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
            Alert.alert("Lỗi", "Cần cấp quyền truy cập thư viện ảnh.");
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
        });

        if (!result.canceled) {
            await changeAvatar(result.assets[0]);
        }
    };

    const pickAvatarFromCamera = async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
            Alert.alert("Lỗi", "Cần cấp quyền camera để chụp ảnh đại diện.");
            return;
        }

        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
        });

        if (!result.canceled) {
            await changeAvatar(result.assets[0]);
        }
    };

    const handlePickImage = async () => {
        if (isUploadingAvatar) {
            return;
        }

        try {
            Alert.alert("Đổi ảnh đại diện", "Chọn nguồn ảnh", [
                { text: "Thư viện", onPress: pickAvatarFromLibrary },
                { text: "Camera", onPress: pickAvatarFromCamera },
                { text: "Hủy", style: "cancel" },
            ]);
        } catch (error: any) {
            console.error("Failed to pick image:", error);
            Alert.alert("Lỗi", error.message || "Không thể chọn ảnh");
        }
    };

    const handleLogout = async () => {
        await logout();
    };

    const handleRevokeSession = (deviceId: string) => {
        if (deviceId === currentDeviceId) {
            Alert.alert("Đăng xuất thiết bị hiện tại", "Bạn sẽ cần đăng nhập lại trên thiết bị này.", [
                { text: "Hủy", style: "cancel" },
                {
                    text: "Đăng xuất",
                    style: "destructive",
                    onPress: logout,
                },
            ]);
            return;
        }

        Alert.alert("Đăng xuất thiết bị", "Bạn muốn đăng xuất thiết bị này?", [
            { text: "Hủy", style: "cancel" },
            {
                text: "Đăng xuất",
                style: "destructive",
                onPress: async () => {
                    try {
                        await SessionService.revokeSession(deviceId);
                        await loadSessions();
                    } catch (error: any) {
                        Alert.alert("Lỗi", error?.message || "Không thể đăng xuất thiết bị");
                    }
                },
            },
        ]);
    };

    const handleRevokeOtherSessions = () => {
        Alert.alert("Đăng xuất thiết bị khác", "Thiết bị hiện tại sẽ vẫn được đăng nhập.", [
            { text: "Hủy", style: "cancel" },
            {
                text: "Đăng xuất thiết bị khác",
                style: "destructive",
                onPress: async () => {
                    try {
                        await SessionService.revokeOtherSessions();
                        await loadSessions();
                    } catch (error: any) {
                        Alert.alert("Lỗi", error?.message || "Không thể đăng xuất thiết bị khác");
                    }
                },
            },
        ]);
    };

    const handleEditChange = (field: keyof EditData, value: string) => {
        setEditData((current) => ({ ...current, [field]: value }));
    };

    const handleSaveProfile = async () => {
        try {
            // If new image was selected and uploaded, use it
            let profileData = { ...editData };

            const updateData: any = {
                displayName: profileData.displayName,
                bio: profileData.bio,
            };

            if (profileData.avatarUrl && !String(profileData.avatarUrl).startsWith("file://")) {
                updateData.avatarUrl = profileData.avatarUrl;
            } await updateProfile(updateData); setIsEditing(false);
            setSelectedImage(null);
            Alert.alert("Success", "Profile updated successfully");
        } catch (err: any) {
            console.error("[Profile] Failed to save profile:", err);
            Alert.alert("Error", err.message || "Failed to save profile");
        }
    };

    if (isEditing) {
        return (
            <ScrollView
                style={styles.screen}
                contentContainerStyle={styles.profileContent}
            >
                <View style={styles.profileTopRow}>
                    <Pressable
                        onPress={() => setIsEditing(false)}
                        style={styles.profileMenuButton}
                    >
                        <Ionicons name="arrow-back" size={24} color={colors.text} />
                    </Pressable>
                    <Text style={styles.profileEditText}>Sửa hồ sơ</Text>
                    <View style={{ width: 24 }} />
                </View>

                {selectedImage ? (
                    <Image
                        source={{ uri: selectedImage }}
                        style={styles.profileAvatarImage}
                    />
                ) : user?.avatarUrl || user?.avatar ? (
                    <Image
                        source={{ uri: user.avatarUrl || user.avatar }}
                        style={styles.profileAvatarImage}
                    />
                ) : (
                    <Avatar
                        label={(editData.displayName || "U")
                            .slice(0, 1)
                            .toUpperCase()}
                        size={104}
                        backgroundColor="#3d6df2"
                        textSize={34}
                        style={styles.profileAvatar}
                    />
                )}

                <Pressable
                    onPress={handlePickImage}
                    style={[styles.pickImageButton, isUploadingAvatar && styles.actionDisabled]}
                    disabled={isUploadingAvatar}
                >
                    <Ionicons
                        name={isUploadingAvatar ? "cloud-upload-outline" : "camera-outline"}
                        size={18}
                        color={isUploadingAvatar ? "#999" : colors.accent}
                    />
                    <Text style={styles.pickImageText}>
                        {isUploadingAvatar ? "Đang cập nhật..." : "Chọn ảnh đại diện"}
                    </Text>
                </Pressable>

                <Card style={[styles.profileCard, { marginTop: 24 }]}>
                    <TextField
                        label="Tên Hiển Thị"
                        value={editData.displayName}
                        onChangeText={(val) => handleEditChange("displayName", val)}
                        placeholder="Nhập tên của bạn"
                    />
                    <View style={styles.divider} />
                    <TextField
                        label="Số Điện Thoại"
                        value={editData.phone}
                        onChangeText={(val) => handleEditChange("phone", val)}
                        placeholder="0912345678"
                        keyboardType="phone-pad"
                    />
                    <View style={styles.divider} />
                    <TextField
                        label="Email"
                        value={editData.email}
                        onChangeText={(val) => handleEditChange("email", val)}
                        placeholder="your@email.com"
                        keyboardType="email-address"
                    />
                    <View style={styles.divider} />
                    <TextField
                        label="Bio"
                        value={editData.bio}
                        onChangeText={(val) => handleEditChange("bio", val)}
                        placeholder="Nói gì đó về bạn..."
                        multiline
                        numberOfLines={3}
                    />
                </Card>

                <View style={styles.formGap}>
                    <PrimaryButton label="Lưu Thay Đổi" onPress={handleSaveProfile} />
                    <PrimaryButton
                        label="Hủy"
                        variant="secondary"
                        onPress={() => setIsEditing(false)}
                    />
                </View>
            </ScrollView>
        );
    }

    return (
        <ScrollView
            style={styles.screen}
            contentContainerStyle={styles.profileContent}
        >
            <View style={styles.profileTopRow}>
                <Pressable style={styles.profileMenuButton}>
                    <Ionicons name="grid-outline" size={24} color={colors.text} />
                </Pressable>
                <Pressable
                    style={styles.profileEditButton}
                    onPress={() => setIsEditing(true)}
                >
                    <Text style={styles.profileEditText}>Sửa</Text>
                </Pressable>
            </View>

            {selectedImage ? (
                <Image
                    source={{ uri: selectedImage }}
                    style={styles.profileAvatarImage}
                />
            ) : user?.avatarUrl || user?.avatar ? (
                <Image
                    source={{ uri: user.avatarUrl || user.avatar }}
                    style={styles.profileAvatarImage}
                />
            ) : (
                <Avatar
                    label={(user?.displayName || "U")
                        .slice(0, 1)
                        .toUpperCase()}
                    size={104}
                    backgroundColor="#3d6df2"
                    textSize={34}
                    style={styles.profileAvatar}
                />
            )}
            <Text style={styles.profileName}>
                {truncateName(user?.displayName || "Huỳnh Trọng Nhân")}
            </Text>
            <Text style={styles.profilePhone}>
                {user?.phone || user?.phoneNumber || ""}
            </Text>
            {user?.bio && <Text style={styles.profileBio}>{user.bio}</Text>}

            <Card style={styles.profileCard}>
                <Pressable
                    style={[styles.profileActionRow, isUploadingAvatar && styles.actionDisabled]}
                    onPress={handlePickImage}
                    disabled={isUploadingAvatar}
                >
                    <View style={styles.profileActionIcon}>
                        <Ionicons
                            name={isUploadingAvatar ? "cloud-upload-outline" : "camera-outline"}
                            size={22}
                            color={isUploadingAvatar ? "#999" : "#4f8cff"}
                        />
                    </View>
                    <Text style={styles.profileActionText}>
                        {isUploadingAvatar ? "Đang cập nhật ảnh..." : "Đổi ảnh đại diện"}
                    </Text>
                </Pressable>
            </Card>

            <Card style={styles.warningCard}>
                <View style={styles.warningDivider} />
                <Pressable style={styles.warningLinkRow}>
                    <Text style={styles.warningLink}>Số Điện thoại: {user?.phone || user?.phoneNumber || ""}</Text>
                </Pressable>
                <View style={styles.warningDivider} />
            </Card>

            <Card style={styles.profileMenuCard}>
                <Pressable style={styles.menuItemRow} onPress={onSavedMessagePress}>
                    <View style={[styles.menuIcon, { backgroundColor: "#3b82f6" }]}>
                        <Ionicons name="bookmark" size={18} color={colors.text} />
                    </View>
                    <Text style={styles.menuItemText}>Tin nhắn đã lưu</Text>
                    <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={colors.textMuted}
                    />
                </Pressable>
            </Card>

            <Card style={styles.profileMenuCard}>
                <View style={styles.deviceHeaderRow}>
                    <Text style={styles.deviceTitle}>Thiết bị đăng nhập</Text>
                    <Pressable onPress={loadSessions} hitSlop={8}>
                        <Ionicons name="refresh" size={18} color={colors.accent} />
                    </Pressable>
                </View>
                {sessionsLoading ? (
                    <View style={styles.deviceLoadingRow}>
                        <ActivityIndicator size="small" color={colors.accent} />
                        <Text style={styles.deviceMutedText}>Đang tải thiết bị...</Text>
                    </View>
                ) : sessions.length === 0 ? (
                    <Text style={styles.deviceMutedText}>Chưa có dữ liệu thiết bị.</Text>
                ) : (
                    sessions.map((session, index) => {
                        const deviceId = session.deviceId || session.id || "";
                        const platform = session.devicePlatform || session.platform || "";
                        const location = session.deviceLocation || session.location || "Không rõ vị trí";
                        const lastActive = session.lastActiveAt || session.lastActive;
                        const isCurrent = Boolean(session.current || session.isCurrent || (!!deviceId && deviceId === currentDeviceId));
                        return (
                            <View key={deviceId || index}>
                                {index > 0 && <View style={styles.divider} />}
                                <View style={styles.deviceRow}>
                                    <View style={styles.profileActionIcon}>
                                        <Ionicons
                                            name={platform === "web" || (session.deviceType || "").toLowerCase().includes("web") ? "globe-outline" : "phone-portrait-outline"}
                                            size={22}
                                            color="#4f8cff"
                                        />
                                    </View>
                                    <View style={styles.deviceInfo}>
                                        <View style={styles.deviceNameRow}>
                                            <Text style={styles.deviceName} numberOfLines={1}>
                                                {session.displayLabel || platform || "Thiết bị"}
                                            </Text>
                                            {isCurrent && <Text style={styles.currentDeviceBadge}>Hiện tại</Text>}
                                        </View>
                                        <Text style={styles.deviceMutedText} numberOfLines={1}>
                                            {location}
                                            {lastActive ? ` • ${new Date(lastActive).toLocaleString("vi-VN")}` : ""}
                                        </Text>
                                    </View>
                                    {!!deviceId && (
                                        <Pressable
                                            style={styles.revokeButton}
                                            onPress={() => handleRevokeSession(deviceId)}
                                        >
                                            <Ionicons name="log-out-outline" size={18} color={colors.danger} />
                                        </Pressable>
                                    )}
                                </View>
                            </View>
                        );
                    })
                )}
                {sessions.length > 1 && (
                    <>
                        <View style={styles.divider} />
                        <Pressable style={styles.revokeAllRow} onPress={handleRevokeOtherSessions}>
                            <Ionicons name="shield-checkmark-outline" size={18} color={colors.danger} />
                            <Text style={styles.revokeAllText}>Đăng xuất thiết bị khác</Text>
                        </Pressable>
                    </>
                )}
            </Card>

            <Pressable
                style={styles.logoutButton}
                onPress={handleLogout}
            >
                <Ionicons name="log-out-outline" size={20} color={colors.text} />
                <Text style={styles.logoutText}>Đăng xuất</Text>
            </Pressable>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: "transparent",
    },
    profileContent: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 110,
        alignItems: "center",
        gap: 16,
    },
    profileTopRow: {
        width: "100%",
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    profileMenuButton: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: colors.surfaceSoftTransparent,
        borderWidth: 1,
        borderColor: colors.overlayWhite10,
        alignItems: "center",
        justifyContent: "center",
    },
    profileEditButton: {
        paddingHorizontal: 18,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: colors.surfaceSoftTransparent,
        borderWidth: 1,
        borderColor: colors.overlayWhite10,
    },
    profileEditText: {
        color: colors.text,
        fontWeight: "700",
    },
    profileAvatar: {
        marginTop: 6,
    },
    profileName: {
        color: colors.text,
        fontSize: 30,
        fontWeight: "900",
        textAlign: "center",
    },
    profilePhone: {
        color: colors.textMuted,
        fontSize: 18,
        textAlign: "center",
    },
    profileBio: {
        color: colors.textSoft,
        fontSize: 16,
        textAlign: "center",
        lineHeight: 20,
        marginTop: 4,
    },
    profileCard: {
        width: "100%",
        gap: 8,
    },
    profileActionRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: 52,
    },
    profileActionIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(79,140,255,0.14)",
    },
    profileActionText: {
        flex: 1,
        color: colors.text,
        fontSize: 15,
        fontWeight: "700",
    },
    warningCard: {
        width: "100%",
        gap: 10,
    },
    warningHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    warningIcon: {
        width: 28,
        height: 28,
        alignItems: "center",
        justifyContent: "center",
    },
    warningTitle: {
        flex: 1,
        color: colors.text,
        fontSize: 16,
        fontWeight: "800",
    },
    warningBody: {
        color: colors.textSoft,
        fontSize: 14,
        lineHeight: 20,
    },
    warningDivider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.border,
    },
    warningLinkRow: {
        paddingVertical: 2,
    },
    warningLink: {
        color: colors.accent,
        fontSize: 15,
        fontWeight: "700",
    },
    profileMenuCard: {
        width: "100%",
        gap: 2,
    },
    menuItemRow: {
        minHeight: 56,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    menuIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
    },
    menuItemText: {
        flex: 1,
        color: colors.text,
        fontSize: 15,
        fontWeight: "700",
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.border,
    },
    logoutButton: {
        width: "100%",
        minHeight: 52,
        borderRadius: 18,
        backgroundColor: colors.danger,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 10,
        marginTop: 4,
    },
    logoutText: {
        color: colors.text,
        fontSize: 15,
        fontWeight: "800",
    },
    deviceHeaderRow: {
        minHeight: 38,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    deviceTitle: {
        color: colors.text,
        fontSize: 15,
        fontWeight: "800",
    },
    deviceLoadingRow: {
        minHeight: 42,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    deviceRow: {
        minHeight: 58,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    deviceInfo: {
        flex: 1,
        gap: 4,
    },
    deviceNameRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    deviceName: {
        flex: 1,
        color: colors.text,
        fontSize: 14,
        fontWeight: "700",
    },
    deviceMutedText: {
        color: colors.textMuted,
        fontSize: 12,
    },
    currentDeviceBadge: {
        color: colors.textOnAccent,
        backgroundColor: colors.accent,
        borderRadius: 999,
        overflow: "hidden",
        paddingHorizontal: 8,
        paddingVertical: 3,
        fontSize: 11,
        fontWeight: "800",
    },
    revokeButton: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(239,68,68,0.12)",
    },
    revokeAllRow: {
        minHeight: 46,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    revokeAllText: {
        color: colors.danger,
        fontSize: 14,
        fontWeight: "800",
    },
    pickImageButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 18,
        backgroundColor: "rgba(63, 140, 255, 0.14)",
        borderWidth: 1,
        borderColor: "rgba(63, 140, 255, 0.28)",
    },
    pickImageText: {
        color: colors.accent,
        fontSize: 14,
        fontWeight: "700",
    },
    actionDisabled: {
        opacity: 0.55,
    },
    profileAvatarImage: {
        width: 104,
        height: 104,
        borderRadius: 52,
        backgroundColor: colors.surface,
        marginTop: 6,
    },
    formGap: {
        gap: 14,
        width: "100%",
    },
});
