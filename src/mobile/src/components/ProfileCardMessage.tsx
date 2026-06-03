import React, { useMemo } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Avatar } from "./Avatar";
import { colors } from "../theme";

export interface ProfileCardUser {
    id?: string;
    _id?: string;
    displayName?: string;
    name?: string;
    username?: string;
    avatar?: string;
    avatarUrl?: string;
    phone?: string;
    phoneNumber?: string;
    relationship?: string;
    [key: string]: any;
}

interface ProfileCardMessageProps {
    user?: ProfileCardUser | null;
    userId?: string;
    isOwn?: boolean;
    onMessagePress?: (user: ProfileCardUser) => void;
    onViewProfilePress?: (user: ProfileCardUser) => void;
}

const getDisplayName = (user?: ProfileCardUser | null, userId?: string): string => {
    return user?.displayName || user?.name || user?.username || (userId ? "Người dùng" : "Danh thiếp");
};

export const ProfileCardMessage: React.FC<ProfileCardMessageProps> = ({
    user,
    userId,
    isOwn,
    onMessagePress,
    onViewProfilePress,
}) => {
    const displayName = getDisplayName(user, userId);
    const avatar = user?.avatarUrl || user?.avatar;
    const subtitle = user?.phoneNumber || user?.phone || user?.relationship || "Danh thiếp ChatChit";
    const initials = useMemo(
        () => displayName
            .split(" ")
            .filter(Boolean)
            .map((part) => part[0]?.toUpperCase())
            .join("")
            .slice(0, 2) || "U",
        [displayName],
    );

    const resolvedUser: ProfileCardUser = {
        ...(user || {}),
        id: user?.id || user?._id || userId,
    };

    return (
        <View style={[styles.wrap, isOwn ? styles.ownWrap : styles.otherWrap]}>
            <View style={styles.header}>
                {avatar ? (
                    <Image source={{ uri: avatar }} style={styles.avatar} />
                ) : (
                    <Avatar label={initials} size={54} backgroundColor={colors.accentStrong} textSize={15} />
                )}
                <View style={styles.meta}>
                    <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
                    <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
                </View>
                {!user && userId ? <ActivityIndicator size="small" color={colors.accent} /> : null}
            </View>

            <View style={styles.divider} />

            <View style={styles.actions}>
                <Pressable
                    style={({ pressed }) => [styles.actionButton, styles.primaryButton, pressed && styles.pressed]}
                    onPress={() => onMessagePress?.(resolvedUser)}
                    disabled={!resolvedUser.id}
                >
                    <Ionicons name="chatbubble" size={17} color={colors.textOnAccent} />
                    <Text style={styles.primaryText}>Nhắn tin</Text>
                </Pressable>
                <Pressable
                    style={({ pressed }) => [styles.actionButton, styles.secondaryButton, pressed && styles.pressed]}
                    onPress={() => onViewProfilePress?.(resolvedUser)}
                    disabled={!resolvedUser.id}
                >
                    <Ionicons name="person-circle-outline" size={18} color={colors.text} />
                    <Text style={styles.secondaryText}>Hồ sơ</Text>
                </Pressable>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    wrap: {
        width: 280,
        maxWidth: "100%",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.overlayWhite18,
        backgroundColor: colors.surfaceElevated,
        padding: 12,
        gap: 10,
    },
    ownWrap: {
        backgroundColor: "rgba(79,140,255,0.24)",
    },
    otherWrap: {
        backgroundColor: colors.surfaceSoftTransparent,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    avatar: {
        width: 54,
        height: 54,
        borderRadius: 27,
        backgroundColor: colors.border,
    },
    meta: {
        flex: 1,
        minWidth: 0,
    },
    name: {
        color: colors.text,
        fontSize: 16,
        fontWeight: "800",
    },
    subtitle: {
        color: colors.textSoft,
        fontSize: 12,
        marginTop: 3,
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.overlayWhite18,
    },
    actions: {
        flexDirection: "row",
        gap: 10,
    },
    actionButton: {
        flex: 1,
        minHeight: 44,
        borderRadius: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
    },
    primaryButton: {
        backgroundColor: colors.accentStrong,
    },
    secondaryButton: {
        borderWidth: 1,
        borderColor: colors.overlayWhite18,
        backgroundColor: colors.surfaceTransparent,
    },
    primaryText: {
        color: colors.textOnAccent,
        fontSize: 13,
        fontWeight: "800",
    },
    secondaryText: {
        color: colors.text,
        fontSize: 13,
        fontWeight: "800",
    },
    pressed: {
        opacity: 0.75,
    },
});

export default ProfileCardMessage;
