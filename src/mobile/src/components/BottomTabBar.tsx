import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";
import type { BottomTabBarProps, TabItem } from "@/types";

export const BottomTabBar = ({
    activeTab,
    onChangeTab,
    friendRequestCount = 0,
}: BottomTabBarProps) => {
    const items: TabItem[] = [
        { key: "home", label: "Danh Bạ", icon: "people-outline" },
        { key: "addFriend", label: "Thêm Bạn", icon: "person-add-outline" },
        { key: "requests", label: "Lời Mời", icon: "notifications-outline" },
        { key: "chat", label: "Chat", icon: "chatbubbles-outline" },
        { key: "profile", label: "Cài Đặt", icon: "settings-outline" },
    ];

    return (
        <View style={styles.tabShell}>
            <View style={styles.tabBar}>
                {items.map((item) => {
                    const active = activeTab === item.key;
                    const showBadge = item.key === "requests" && friendRequestCount > 0;

                    return (
                        <Pressable
                            key={item.key}
                            onPress={() => onChangeTab(item.key)}
                            style={styles.tabItem}
                        >
                            <View style={styles.iconContainer}>
                                <Ionicons
                                    name={item.icon as any}
                                    size={24}
                                    color={active ? colors.accent : colors.tabInactive}
                                />
                                {showBadge && (
                                    <View style={styles.badge}>
                                        <Text style={styles.badgeText}>
                                            {friendRequestCount}
                                        </Text>
                                    </View>
                                )}
                            </View>
                            <Text
                                style={[
                                    styles.tabLabel,
                                    active && styles.tabLabelActive,
                                ]}
                            >
                                {item.label}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    tabShell: {
        paddingHorizontal: 14,
        paddingBottom: 10,
        paddingTop: 6,
        backgroundColor: colors.background,
    },
    tabBar: {
        flexDirection: "row",
        backgroundColor: colors.surface,
        borderRadius: 26,
        borderWidth: 1,
        borderColor: colors.border,
        paddingVertical: 10,
        paddingHorizontal: 8,
        justifyContent: "space-between",
    },
    tabItem: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        paddingVertical: 4,
    },
    tabLabel: {
        color: colors.tabInactive,
        fontSize: 11,
        fontWeight: "600",
    },
    tabLabelActive: {
        color: colors.accent,
    },
    iconContainer: {
        position: "relative",
        width: 24,
        height: 24,
        justifyContent: "center",
        alignItems: "center",
    },
    badge: {
        position: "absolute",
        top: -8,
        right: -8,
        backgroundColor: "#FF4B4B",
        borderRadius: 10,
        width: 20,
        height: 20,
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 2,
        borderColor: colors.background,
    },
    badgeText: {
        color: "#FFFFFF",
        fontSize: 10,
        fontWeight: "700",
        textAlign: "center",
    },
});
