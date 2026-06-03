import React, { useRef } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";
import type { BottomTabBarProps, TabItem } from "@/types";

export const BottomTabBar = ({
    activeTab,
    onChangeTab,
    friendRequestCount = 0,
}: BottomTabBarProps) => {
    const items: TabItem[] = [
        { key: "home", label: "Danh Bạ", icon: "chatbubbles-outline" },
        { key: "addFriend", label: "Thêm Bạn", icon: "person-add-outline" },
        { key: "requests", label: "Lời Mời", icon: "notifications-outline" },
        { key: "profile", label: "Cài Đặt", icon: "settings-outline" },
    ];

    const animatedByKey = useRef(
        Object.fromEntries(items.map((item) => [item.key, new Animated.Value(0)]))
    ).current as Record<string, Animated.Value>;

    const handlePressIn = (key: string) => {
        Animated.spring(animatedByKey[key], {
            toValue: 1,
            useNativeDriver: true,
            stiffness: 240,
            damping: 16,
            mass: 0.8,
        }).start();
    };

    const handlePressOut = (key: string) => {
        Animated.spring(animatedByKey[key], {
            toValue: 0,
            useNativeDriver: true,
            stiffness: 220,
            damping: 18,
            mass: 0.9,
        }).start();
    };

    return (
        <View style={styles.tabShell}>
            <View style={styles.tabBar}>
                {items.map((item) => {
                    const active = activeTab === item.key;
                    const showBadge = item.key === "requests" && friendRequestCount > 0;
                    const animated = animatedByKey[item.key];
                    const translateY = animated.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, -6],
                    });
                    const scale = animated.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 1.05],
                    });

                    return (
                        <Pressable
                            key={item.key}
                            onPress={() => onChangeTab(item.key)}
                            onPressIn={() => handlePressIn(item.key)}
                            onPressOut={() => handlePressOut(item.key)}
                            style={styles.tabItem}
                        >
                            <Animated.View
                                style={[
                                    styles.tabTile,
                                    active && styles.tabTileActive,
                                    { transform: [{ translateY }, { scale }] },
                                ]}
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
                            </Animated.View>
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
        backgroundColor: colors.surfaceTransparent,
        borderTopWidth: 1,
        borderTopColor: colors.overlayWhite10,
    },
    tabBar: {
        flexDirection: "row",
        backgroundColor: "transparent",
        paddingVertical: 8,
        paddingHorizontal: 2,
        justifyContent: "space-between",
        gap: 10,
    },
    tabItem: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 2,
    },
    tabTile: {
        width: "100%",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        paddingVertical: 11,
        borderRadius: 16,
        backgroundColor: colors.surfaceSoftTransparent,
        borderWidth: 1,
        borderColor: colors.overlayWhite18,
    },
    tabTileActive: {
        backgroundColor: "rgba(79, 140, 255, 0.18)",
        borderColor: "rgba(79, 140, 255, 0.45)",
    },
    tabLabel: {
        color: colors.tabInactive,
        fontSize: 10.5,
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
