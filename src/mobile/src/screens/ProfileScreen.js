import React, { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import axios from "axios";
import { useAuth } from "../../../shared/hooks";
import { authService } from "../../../shared/services/authService";
import { Avatar, Card, PrimaryButton, TextField } from "../components";
import { colors } from "../theme";
import { getApiBaseUrl } from "../../../shared/runtime/config";
import { authStorage } from "../../../shared/runtime/storage";

export const ProfileScreen = () => {
    const { user, logout, updateProfile } = useAuth();
    const [isEditing, setIsEditing] = useState(false);
    const [selectedImage, setSelectedImage] = useState(null);
    const [editData, setEditData] = useState({
        displayName: user?.displayName || "",
        phone: user?.phone || "",
        email: user?.email || "",
        bio: user?.bio || "",
        avatar: user?.avatar || null,
    });

    const truncateName = (name, maxLength = 20) => {
        if (!name || name.length <= maxLength) {
            return name;
        }
        return name.slice(0, Math.floor(maxLength / 2)) + "...";
    };

    // Upload image to server and return URL
    const uploadImage = async (imageUri) => {
        try {
            let token = await authStorage.getItem("token");
            
            // Clean token: remove whitespace and ensure it's a string
            if (token) {
                token = String(token).trim();
            }
            
            console.log("[Upload] Token:", token ? "✅ exists (" + token.substring(0, 20) + "...)" : "❌ missing");
            
            if (!token) {
                throw new Error("No authentication token found. Please login again.");
            }
            
            const apiUrl = getApiBaseUrl();
            console.log("[Upload] API URL:", apiUrl);
            
            // Helper to perform upload
            const performUpload = async (uploadToken) => {
                const formData = new FormData();
                
                // Extract filename from URI
                const filename = imageUri.split("/").pop() || "avatar.jpg";
                const fileType = "image/jpeg"; // Default to JPEG
                
                // Append file to FormData
                formData.append("file", {
                    uri: imageUri,
                    name: filename,
                    type: fileType,
                });

                console.log("[Upload] Sending to:", `${apiUrl}/media/upload`);

                const response = await axios.post(`${apiUrl}/media/upload`, formData, {
                    headers: {
                        Authorization: `Bearer ${uploadToken}`,
                        // DO NOT set Content-Type - axios + FormData will handle it automatically
                    },
                });

                return response;
            };

            try {
                const response = await performUpload(token);
                console.log("[Upload] Image uploaded successfully:", response.data);
                
                // Extract URL from response structure: response.data.data.url
                const uploadedUrl = response.data?.data?.url;
                if (!uploadedUrl) {
                    throw new Error("No URL returned from server");
                }
                
                return uploadedUrl;
            } catch (uploadError) {
                // If 401 (token expired), try to refresh and retry
                if (uploadError.response?.status === 401) {
                    console.log("[Upload] Token expired, attempting refresh...");
                    try {
                        const newToken = await authService.refreshAccessToken();
                        console.log("[Upload] Token refreshed, retrying upload...");
                        const retryResponse = await performUpload(newToken);
                        
                        console.log("[Upload] Image uploaded successfully (after refresh):", retryResponse.data);
                        
                        const uploadedUrl = retryResponse.data?.data?.url;
                        if (!uploadedUrl) {
                            throw new Error("No URL returned from server");
                        }
                        
                        return uploadedUrl;
                    } catch (refreshError) {
                        console.error("[Upload] Token refresh failed:", refreshError.message);
                        throw new Error("Session expired - please login again");
                    }
                }
                // Re-throw other errors
                throw uploadError;
            }
        } catch (error) {
            console.error("[Upload] Failed to upload image:", error.message);
            console.error("[Upload] Error details:", error.response?.status, error.response?.data);
            throw new Error(error.message || "Failed to upload image");
        }
    };

    const handlePickImage = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ["images"],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
            });

            if (!result.canceled) {
                const imageUri = result.assets[0].uri;
                setSelectedImage(imageUri);
                setEditData((current) => ({ ...current, avatar: imageUri }));
                console.log("[Profile] Image selected:", imageUri);
            }
        } catch (error) {
            console.error("Failed to pick image:", error);
            Alert.alert("Error", "Failed to pick image");
        }
    };

    const handleLogout = async () => {
        await logout();
    };

    const handleEditChange = (field, value) => {
        setEditData((current) => ({ ...current, [field]: value }));
    };

    const handleSaveProfile = async () => {
        try {
            let profileData = { ...editData };

            // If user selected a new image, upload it first
            if (selectedImage) {
                console.log("[Profile] Uploading image...");
                const uploadedUrl = await uploadImage(selectedImage);
                profileData.avatar = uploadedUrl; // Update with server URL
                console.log("[Profile] Image uploaded, using URL:", uploadedUrl);
            }

            // Update profile via context (saves to storage + syncs to backend)
            const result = await updateProfile(profileData);
            
            console.log("[Profile] Profile updated successfully");
            setIsEditing(false);
            setSelectedImage(null);
        } catch (err) {
            console.error("[Profile] Failed to save profile:", err);
            Alert.alert("Error", err.message || "Failed to update profile");
        }
    };

    if (isEditing) {
        return (
            <ScrollView style={styles.screen} contentContainerStyle={styles.profileContent}>
                <View style={styles.profileTopRow}>
                    <Pressable onPress={() => setIsEditing(false)} style={styles.profileMenuButton}>
                        <Ionicons name="arrow-back" size={24} color={colors.text} />
                    </Pressable>
                    <Text style={styles.profileEditText}>Sửa hồ sơ</Text>
                    <View style={{ width: 24 }} />
                </View>

                {selectedImage ? (
                    <Image source={{ uri: selectedImage }} style={styles.profileAvatarImage} />
                ) : user?.avatar ? (
                    <Image source={{ uri: user.avatar }} style={styles.profileAvatarImage} />
                ) : (
                    <Avatar label={(editData.displayName || "U").slice(0, 1).toUpperCase()} size={104} backgroundColor="#3d6df2" textSize={34} style={styles.profileAvatar} />
                )}

                <Pressable onPress={handlePickImage} style={styles.pickImageButton}>
                    <Ionicons name="camera-outline" size={18} color={colors.accent} />
                    <Text style={styles.pickImageText}>Chọn ảnh đại diện</Text>
                </Pressable>

                <Card style={[styles.profileCard, { marginTop: 24 }]}>
                    <TextField label="Tên Hiển Thị" value={editData.displayName} onChangeText={(val) => handleEditChange("displayName", val)} placeholder="Nhập tên của bạn" />
                    <View style={styles.divider} />
                    <TextField label="Số Điện Thoại" value={editData.phone} onChangeText={(val) => handleEditChange("phone", val)} placeholder="0912345678" keyboardType="phone-pad" />
                    <View style={styles.divider} />
                    <TextField label="Email" value={editData.email} onChangeText={(val) => handleEditChange("email", val)} placeholder="your@email.com" keyboardType="email-address" />
                    <View style={styles.divider} />
                    <TextField label="Bio" value={editData.bio} onChangeText={(val) => handleEditChange("bio", val)} placeholder="Nói gì đó về bạn..." multiline numberOfLines={3} />
                </Card>

                <View style={styles.formGap}>
                    <PrimaryButton label="Lưu Thay Đổi" onPress={handleSaveProfile} />
                    <PrimaryButton label="Hủy" variant="secondary" onPress={() => setIsEditing(false)} />
                </View>
            </ScrollView>
        );
    }

    return (
        <ScrollView style={styles.screen} contentContainerStyle={styles.profileContent}>
            <View style={styles.profileTopRow}>
                <Pressable style={styles.profileMenuButton}>
                    <Ionicons name="grid-outline" size={24} color={colors.text} />
                </Pressable>
                <Pressable style={styles.profileEditButton} onPress={() => setIsEditing(true)}>
                    <Text style={styles.profileEditText}>Sửa</Text>
                </Pressable>
            </View>

            {user?.avatar ? (
                <Image source={{ uri: user.avatar }} style={styles.profileAvatarImage} />
            ) : (
                <Avatar label={(user?.displayName || "U").slice(0, 1).toUpperCase()} size={104} backgroundColor="#3d6df2" textSize={34} style={styles.profileAvatar} />
            )}
            <Text style={styles.profileName}>{truncateName(user?.displayName || "Huỳnh Trọng Nhân")}</Text>
            <Text style={styles.profilePhone}>{user?.phone || "+84 91 446 22 97"}</Text>

            <Card style={styles.profileCard}>
                <Pressable style={styles.profileActionRow}>
                    <View style={styles.profileActionIcon}><Ionicons name="camera-outline" size={22} color="#4f8cff" /></View>
                    <Text style={styles.profileActionText}>Đổi ảnh đại diện</Text>
                </Pressable>
                <View style={styles.divider} />
                <Pressable style={styles.profileActionRow}>
                    <View style={styles.profileActionIcon}><Ionicons name="at-outline" size={22} color="#4f8cff" /></View>
                    <Text style={styles.profileActionText}>Đặt tên người dùng</Text>
                </Pressable>
            </Card>

            <Card style={styles.warningCard}>
                <View style={styles.warningHeader}>
                    <View style={styles.warningIcon}><Ionicons name="alert-circle" size={20} color="#ff6b6b" /></View>
                    <Text style={styles.warningTitle}>+84 91 446 22 97 vẫn là số của bạn?</Text>
                </View>
                <Text style={styles.warningBody}>Chú ý kiểm tra số điện thoại để bạn luôn có thể đăng nhập Telegram. Tìm hiểu thêm</Text>
                <View style={styles.warningDivider} />
                <Pressable style={styles.warningLinkRow}><Text style={styles.warningLink}>Giữ số +84 91 446 22 97</Text></Pressable>
                <View style={styles.warningDivider} />
                <Pressable style={styles.warningLinkRow}><Text style={styles.warningLink}>Đổi số</Text></Pressable>
            </Card>

            <Card style={styles.profileMenuCard}>
                <Pressable style={styles.menuItemRow}><View style={[styles.menuIcon, { backgroundColor: "#ff6b5c" }]}><Ionicons name="person" size={18} color={colors.text} /></View><Text style={styles.menuItemText}>Trang cá nhân</Text><Ionicons name="chevron-forward" size={18} color={colors.textMuted} /></Pressable>
                <View style={styles.divider} />
                <Pressable style={styles.menuItemRow}><View style={[styles.menuIcon, { backgroundColor: "#3b82f6" }]}><Ionicons name="bookmark" size={18} color={colors.text} /></View><Text style={styles.menuItemText}>Tin nhắn đã lưu</Text><Ionicons name="chevron-forward" size={18} color={colors.textMuted} /></Pressable>
                <View style={styles.divider} />
                <Pressable style={styles.menuItemRow}><View style={[styles.menuIcon, { backgroundColor: "#22c55e" }]}><Ionicons name="call" size={18} color={colors.text} /></View><Text style={styles.menuItemText}>Cuộc gọi gần đây</Text><Ionicons name="chevron-forward" size={18} color={colors.textMuted} /></Pressable>
            </Card>

            <Pressable style={styles.logoutButton} onPress={handleLogout}>
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
