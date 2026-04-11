import React, { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import {
    Alert,
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { useAuth, useMediaUpload } from "../../../shared/hooks";
import { authService } from "../../../shared/services/authService";
import { Avatar, Card, PrimaryButton, TextField } from "../components";
import { colors } from "../theme";
import { compressImage } from "../../../shared/utils";
import type { EditData } from "@/types";

export const ProfileScreen = () => {
    const { user, logout, updateProfile } = useAuth();
    const [isEditing, setIsEditing] = useState(false);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [isCompressing, setIsCompressing] = useState(false);
    const [editData, setEditData] = useState<EditData>({
        displayName: user?.displayName || "",
        phone: user?.phone || "",
        email: user?.email || "",
        bio: user?.bio || "",
        avatarUrl: user?.avatarUrl || user?.avatar || null,
    });

    // Initialize upload hook with callbacks
    const { uploadFile, isUploading, progress, error: uploadError, clearError } = useMediaUpload({
        onProgress: (event) => {
            console.log(`[Profile] Upload progress: ${event.percentage.toFixed(0)}%`);
        },
        onSuccess: (session) => {
            console.log("[Profile] Image uploaded successfully:", session.fileId);
            // Update profile with the uploaded URL
            if (session.presignedUrl) {
                setEditData((current) => ({
                    ...current,
                    avatarUrl: session.presignedUrl,
                }));
            }
        },
        onError: (error) => {
            console.error("[Profile] Upload failed:", error.message);
            Alert.alert("Upload Failed", error.message);
        },
    });

    const truncateName = (name: string | undefined, maxLength = 20) => {
        if (!name || name.length <= maxLength) {
            return name;
        }
        return name.slice(0, Math.floor(maxLength / 2)) + "...";
    };

    /**
     * Convert image URI to Blob for upload
     */
    const uriToBlob = async (uri: string): Promise<Blob> => {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.onload = () => {
                resolve(xhr.response);
            };
            xhr.onerror = () => {
                reject(new Error("Failed to load image"));
            };
            xhr.responseType = "blob";
            xhr.open("GET", uri, true);
            xhr.send(null);
        });
    };

    const handlePickImage = async () => {
        try {
            clearError();

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ["images"],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
            });

            if (!result.canceled) {
                const imageUri = result.assets[0].uri;
                setSelectedImage(imageUri);
                setEditData((current) => ({ ...current, avatarUrl: imageUri }));
                console.log("[Profile] Image selected:", imageUri);
            }
        } catch (error: any) {
            console.error("Failed to pick image:", error);
            Alert.alert("Error", "Failed to pick image");
        }
    };

    /**
     * Handle image compression and upload
     */
    const handleUploadImage = async (imageUri: string) => {
        try {
            setIsCompressing(true);

            // Convert URI to Blob
            console.log("[Profile] Converting image URI to blob...");
            const imageBlob = await uriToBlob(imageUri);

            // Create File object for upload
            const filename = imageUri.split("/").pop() || "avatar.jpg";
            const file = new File([imageBlob], filename, { type: "image/jpeg" });

            console.log(`[Profile] Compressing image: ${filename}`);

            // Compress image: 80% quality, max 1920px
            const { compressedFile } = await compressImage(file, 0.8, 1920);

            console.log(
                `[Profile] Compressed: ${(file.size / 1024).toFixed(2)}KB → ${(compressedFile.size / 1024).toFixed(2)}KB`
            );

            setIsCompressing(false);

            // Upload using presigned URL flow
            console.log("[Profile] Starting upload to S3...");
            await uploadFile(compressedFile, "IMAGE");

        } catch (error: any) {
            setIsCompressing(false);
            console.error("[Profile] Compression/upload failed:", error);
            Alert.alert("Error", error.message || "Failed to upload image");
        }
    };

    const handleLogout = async () => {
        await logout();
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

            if (profileData.avatarUrl) {
                updateData.avatarUrl = profileData.avatarUrl;
            }

            console.log("[Profile] Saving profile with data:", updateData);
            await updateProfile(updateData);

            console.log("[Profile] Profile updated successfully");
            setIsEditing(false);
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
                    onPress={() => {
                        if (selectedImage) {
                            handleUploadImage(selectedImage);
                        } else {
                            handlePickImage();
                        }
                    }}
                    style={styles.pickImageButton}
                >
                    <Ionicons
                        name={isCompressing || isUploading ? "cloud-upload-outline" : "camera-outline"}
                        size={18}
                        color={isCompressing || isUploading ? "#999" : colors.accent}
                    />
                    <Text style={styles.pickImageText}>
                        {isCompressing ? "Compressing..." : isUploading ? `Uploading ${Math.round(progress)}%` : "Chọn ảnh đại diện"}
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

            {user?.avatarUrl || user?.avatar ? (
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
                {user?.phone || "+84 91 446 22 97"}
            </Text>
            {user?.bio && <Text style={styles.profileBio}>{user.bio}</Text>}

            <Card style={styles.profileCard}>
                <Pressable
                    style={styles.profileActionRow}
                    onPress={handlePickImage}
                >
                    <View style={styles.profileActionIcon}>
                        <Ionicons
                            name={isCompressing || isUploading ? "cloud-upload-outline" : "camera-outline"}
                            size={22}
                            color={isCompressing || isUploading ? "#999" : "#4f8cff"}
                        />
                    </View>
                    <Text style={styles.profileActionText}>
                        {isCompressing ? "Compressing..." : isUploading ? `Uploading ${Math.round(progress)}%` : "Đổi ảnh đại diện"}
                    </Text>
                </Pressable>
                <View style={styles.divider} />
                <Pressable style={styles.profileActionRow}>
                    <View style={styles.profileActionIcon}>
                        <Ionicons name="at-outline" size={22} color="#4f8cff" />
                    </View>
                    <Text style={styles.profileActionText}>Đặt tên người dùng</Text>
                </Pressable>
            </Card>

            <Card style={styles.warningCard}>
                <View style={styles.warningHeader}>
                    <View style={styles.warningIcon}>
                        <Ionicons name="alert-circle" size={20} color="#ff6b6b" />
                    </View>
                    <Text style={styles.warningTitle}>
                        +84 91 446 22 97 vẫn là số của bạn?
                    </Text>
                </View>
                <Text style={styles.warningBody}>
                    Chú ý kiểm tra số điện thoại để bạn luôn có thể đăng nhập ChatChit.
                    Tìm hiểu thêm
                </Text>
                <View style={styles.warningDivider} />
                <Pressable style={styles.warningLinkRow}>
                    <Text style={styles.warningLink}>Giữ số +84 91 446 22 97</Text>
                </Pressable>
                <View style={styles.warningDivider} />
                <Pressable style={styles.warningLinkRow}>
                    <Text style={styles.warningLink}>Đổi số</Text>
                </Pressable>
            </Card>

            <Card style={styles.profileMenuCard}>
                <Pressable style={styles.menuItemRow}>
                    <View style={[styles.menuIcon, { backgroundColor: "#ff6b5c" }]}>
                        <Ionicons name="person" size={18} color={colors.text} />
                    </View>
                    <Text style={styles.menuItemText}>Trang cá nhân</Text>
                    <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={colors.textMuted}
                    />
                </Pressable>
                <View style={styles.divider} />
                <Pressable style={styles.menuItemRow}>
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
                <View style={styles.divider} />
                <Pressable style={styles.menuItemRow}>
                    <View style={[styles.menuIcon, { backgroundColor: "#22c55e" }]}>
                        <Ionicons name="call" size={18} color={colors.text} />
                    </View>
                    <Text style={styles.menuItemText}>Cuộc gọi gần đây</Text>
                    <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={colors.textMuted}
                    />
                </Pressable>
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
        backgroundColor: colors.background,
    },
    profileContent: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 30,
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
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: "center",
        justifyContent: "center",
    },
    profileEditButton: {
        paddingHorizontal: 18,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
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
