import React, { useRef } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";
import type { TabItem } from "@/types";

type BottomTabBarProps = {
    activeTab: string;
    onChangeTab: (tab: string) => void;
    onSearchPress?: () => void;
    friendRequestCount?: number;
};

export const BottomTabBar = ({
    activeTab,
    onChangeTab,
    onSearchPress,
    friendRequestCount = 0
}: BottomTabBarProps) => {
    const items: TabItem[] = [
        { key: "addFriend", label: "Thêm bạn", icon: "person-add-outline" },
        { key: "requests", label: "Lời mời", icon: "notifications-outline" },
        { key: "home", label: "Chat", icon: "chatbubbles" },
        { key: "profile", label: "Cài đặt", icon: "settings-outline" },
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
                                        size={21}
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
            <Pressable
                onPress={onSearchPress}
                style={styles.searchButton}
                hitSlop={8}
            >
                <Ionicons
                    name="search"
                    size={23}
                    color={colors.text}
                />
            </Pressable>
        </View>
    );
};

const styles = StyleSheet.create({
    tabShell: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 10,
        paddingHorizontal: 18,
        paddingBottom: 0,
        paddingTop: 0,
        backgroundColor: "transparent",
        borderTopWidth: 0,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    tabBar: {
        flex: 1,
        flexDirection: "row",
        backgroundColor: "rgba(30, 30, 30, 0.86)",
        paddingVertical: 4,
        paddingHorizontal: 6,
        justifyContent: "space-between",
        gap: 4,
        borderRadius: 32,
        borderWidth: 1,
        borderColor: colors.overlayWhite18,
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.34,
        shadowRadius: 14,
        elevation: 8,
    },
    searchButton: {
        width: 52,
        height: 52,
        borderRadius: 26,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(30, 30, 30, 0.9)",
        borderWidth: 1,
        borderColor: colors.overlayWhite18,
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.34,
        shadowRadius: 14,
        elevation: 8,
    },
    tabItem: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 0,
    },
    tabTile: {
        width: "100%",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        minHeight: 46,
        paddingVertical: 5,
        borderRadius: 25,
        backgroundColor: "transparent",
        borderWidth: 0,
    },
    tabTileActive: {
        backgroundColor: "rgba(255,255,255,0.09)",
    },
    tabLabel: {
        color: colors.tabInactive,
        fontSize: 10,
        fontWeight: "800",
    },
    tabLabelActive: {
        color: colors.accent,
    },
    iconContainer: {
        position: "relative",
        width: 22,
        height: 22,
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
